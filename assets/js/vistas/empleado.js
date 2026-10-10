// Pantalla del empleado (después de poner su PIN): Inicio (abrir turno, relevo, recordatorios, mi desempeño),
// Tareas (checklist, incidencias y cierre), Pendientes e Inventario. Las marcas sin internet se guardan en la cola y se mandan solas.
import * as api from '../api.js';
import { montarInventarioEmp } from './inventario_emp.js';
import { montarPendientesEmp } from './pendientes_emp.js';
import { encolar, enviarCola, pendientesDe, alCambiarCola } from '../cola.js';
import { esc, $, $$, avatar, hidratarAvatares, aviso, ventana, confirmar, conOcupado, primerNombre, horaCorta, comprimirEvidencia, duracionTexto, ROL, mostrarError, quitarError } from '../ui.js';

const TZ = 'America/Mexico_City';
const ERR = {
  turno_ya_existe: 'Este turno ya se abrió hoy.', tipo_no_corresponde: 'Ese turno no corresponde a hoy.',
  no_es_tu_turno: 'Esta tarea es de otro turno.', turno_cerrado: 'El turno ya está cerrado.', excusada: 'La gerencia ya excusó esta tarea.',
  falta_foto: 'Esta tarea necesita foto.', falta_razon: 'Escribe la razón (mínimo 3 letras).', no_condicional: 'Esta tarea no tiene la opción "No aplica".',
  falta_reporte: 'Escribe cómo sigue la incidencia (mínimo 3 letras).',
  sin_conexion: 'No hay internet. Revisa la conexión e intenta de nuevo.',
};
const msg = (r) => ERR[r?.error] || r?.mensaje || 'No se pudo completar. Intenta de nuevo.';
const SECCIONES = [['apertura', 'Al abrir el turno'], ['semanal', 'Semanales de hoy'], ['cierre', 'Al cerrar el turno']];
const ICONO_TURNO = { manana: '☀️', tarde: '🌇', domingo: '☀️' };
const TIPS = [
  'Marca cada tarea en cuanto la termines: así cuenta “a tiempo”.',
  'Si algo no se puede hacer, usa “No se puede” y escribe por qué: no cuenta en tu contra si gerencia lo excusa.',
  '¿Viste algo descompuesto? Repórtalo en Pendientes → Incidencia, con foto si puedes.',
  'Antes de cerrar, deja una nota de relevo: el siguiente turno la ve al entrar.',
  'Si se va el internet, sigue marcando: el celular guarda tus marcas y las manda solas.',
];

export function montarEmpleado(raiz, { token, perfil, porAdmin, alSalir, alVolverAdmin, alSesionInvalida }) {
  let est = null, tab = 'inicio', muerto = false, inv = null, invEst = null, pend = null, desemp = null, desempEn = 0, pendInicial = null;
  const limpiezas = [];

  async function llamar(nombre, args = {}) {
    try {
      const r = await api.rpc(nombre, { p_token: token, ...args });
      if (r && r.ok === false && r.error === 'sesion_invalida') { if (!muerto) alSesionInvalida(); }
      return r;
    } catch (e) {
      return { ok: false, error: e.codigo === 'sin_conexion' ? 'sin_conexion' : 'error', mensaje: e.message };
    }
  }

  // ---------- marco ----------
  raiz.innerHTML = `<div class="panel emp">
    <header class="barra">
      <div class="barra-izq">${avatar(perfil, 'sm')}<div><b>${esc(primerNombre(perfil.nombre_completo))}</b><span class="sub">${esc(ROL[perfil.rol] || 'Recepción')}</span></div></div>
      <div class="barra-der"><button type="button" class="btn chico ghost" data-salir>Salir de mi usuario</button></div>
    </header>
    ${porAdmin ? `<div class="banda-admin"><span>Estás viendo la app como <b>${esc(perfil.nombre_completo)}</b> (entraste como administrador, sin PIN)</span>
      <button type="button" class="btn chico" data-volver-admin>Volver a administración</button></div>` : ''}
    <div class="banda-offline" data-offline hidden></div>
    <main class="contenido" id="emp-cont"><p class="cargando">Cargando tu turno…</p></main>
    <nav class="tabs" aria-label="Secciones">
      <button type="button" data-tab="inicio" aria-current="true"><span aria-hidden="true">⌂</span>Inicio</button>
      <button type="button" data-tab="tareas" aria-current="false"><span aria-hidden="true">✓</span>Tareas<i class="punto-aviso" data-badge hidden></i></button>
      <button type="button" data-tab="pendientes" aria-current="false"><span aria-hidden="true">📌</span>Pendientes<i class="punto-aviso amarillo" data-badge-pend hidden></i></button>
      <button type="button" data-tab="inventario" aria-current="false"><span aria-hidden="true">▤</span>Inventario<i class="punto-aviso amarillo" data-badge-inv hidden></i></button>
    </nav></div>`;
  hidratarAvatares(raiz);
  $('[data-salir]', raiz).addEventListener('click', salir);
  $('[data-volver-admin]', raiz)?.addEventListener('click', alVolverAdmin);
  $('.tabs', raiz).addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) ir(b.dataset.tab); });

  async function salir() {
    const n = pendientesDe(token).length;
    if (n && !navigator.onLine) {
      if (!await confirmar({ titulo: 'Sin internet', texto: `Hay ${n} marca${n === 1 ? '' : 's'} guardada${n === 1 ? '' : 's'} en el celular. Se van a enviar solas cuando vuelva el internet, aunque salgas. ¿Salir?`, ok: 'Salir' })) return;
    }
    alSalir();
  }

  function ir(t) {
    tab = t;
    $$('.tabs button', raiz).forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === t)));
    pintar(true);
    window.scrollTo(0, 0);
  }

  // ---------- sin internet ----------
  function pintarOffline() {
    const b = $('[data-offline]', raiz);
    if (!b) return;
    const n = pendientesDe(token).length;
    const sin = !navigator.onLine;
    b.hidden = !sin && !n;
    b.innerHTML = sin ? `📶 Sin internet${n ? ` · ${n} marca${n === 1 ? '' : 's'} guardada${n === 1 ? '' : 's'} en el celular` : ''}. Puedes seguir marcando tareas sin foto.`
      : n ? `⏳ Enviando ${n} marca${n === 1 ? '' : 's'} guardada${n === 1 ? '' : 's'}…` : '';
  }
  const alOnline = async () => { pintarOffline(); const r = await enviarCola(); if (r && r.enviadas) aviso(r.enviadas === 1 ? 'Se envió la marca que estaba guardada sin internet.' : `Se enviaron ${r.enviadas} marcas que estaban guardadas sin internet.`, 'ok', 5000); cargar({ silencioso: true }); };
  window.addEventListener('online', alOnline);
  window.addEventListener('offline', pintarOffline);
  limpiezas.push(() => { window.removeEventListener('online', alOnline); window.removeEventListener('offline', pintarOffline); });
  limpiezas.push(alCambiarCola(pintarOffline));

  // aplica sobre las tareas del servidor las marcas que siguen en la cola del celular
  function aplicarCola() {
    if (!est?.mio) return;
    for (const c of pendientesDe(token)) {
      const x = est.mio.tareas.find((q) => q.id === c.tarea_id);
      if (!x) continue;
      if (c.accion === 'deshacer') Object.assign(x, { estado: 'pendiente', marcada_en: null, a_tiempo: null });
      else if (c.accion === 'hecha') Object.assign(x, { estado: 'hecha', marcada_en: c.cuando, a_tiempo: !x.limite || new Date(c.cuando) <= new Date(x.limite), razon: x.incidencia_id ? c.razon : x.razon });
      else if (c.accion === 'no_aplica') Object.assign(x, { estado: 'no_aplica', marcada_en: c.cuando, a_tiempo: true });
      else if (c.accion === 'no_puedo') Object.assign(x, { estado: 'no_se_pudo', marcada_en: c.cuando, razon: c.razon });
      x._cola = true;
    }
  }

  // ---------- datos ----------
  function badgeInv(r) {
    invEst = r;
    const n = (r?.conteo ? 1 : 0) + (r?.cobros || []).filter((b) => !b.visto_en).length;
    const b = $('[data-badge-inv]', raiz);
    if (b) { b.hidden = !n; b.textContent = n ? String(n) : ''; }
  }
  function badgePend(n) {
    const b = $('[data-badge-pend]', raiz);
    if (b) { b.hidden = !n; b.textContent = n ? String(n) : ''; }
  }
  async function cargar({ silencioso = false } = {}) {
    if (pendientesDe(token).length && navigator.onLine) await enviarCola();
    llamar('inv_emp_estado').then((ri) => { if (!muerto && ri.ok) { const antes = !!invEst?.conteo; badgeInv(ri); if (tab === 'inicio' && antes !== !!ri.conteo) pintar(); } });
    const r = await llamar('turno_hoy');
    if (muerto) return;
    if (!r.ok) {
      if (r.error === 'sesion_invalida') return;
      if (!est) $('#emp-cont', raiz).innerHTML = `<div class="tarjeta vacio"><p><b>No se pudo cargar tu turno</b></p><p>${esc(msg(r))}</p><button class="btn ghost" data-reintentar>Volver a intentar</button></div>`;
      else if (!silencioso) aviso(msg(r), 'error');
      pintarOffline();
      return;
    }
    est = r;
    aplicarCola();
    badgePend(r.pendientes || 0);
    pintarOffline();
    if (tab === 'inicio' && (!desemp || Date.now() - desempEn > 600000)) cargarDesempeno();
    pintar();
  }
  async function cargarDesempeno() {
    desempEn = Date.now();
    const r = await llamar('mi_desempeno');
    if (muerto || !r.ok) return;
    desemp = r;
    if (tab === 'inicio') { const c = $('#mi-desemp', raiz); if (c) c.outerHTML = tarjetaDesempeno(); }
  }
  const reloj = setInterval(() => { if (document.visibilityState === 'visible') cargar({ silencioso: true }); }, 45000);
  limpiezas.push(() => clearInterval(reloj));
  const alVolver = () => { if (document.visibilityState === 'visible') cargar({ silencioso: true }); };
  document.addEventListener('visibilitychange', alVolver);
  limpiezas.push(() => document.removeEventListener('visibilitychange', alVolver));

  const hechas = (t) => t.filter((x) => x.estado !== 'pendiente').length;
  const vencida = (x) => x.estado === 'pendiente' && x.limite && new Date(x.limite) < new Date();

  function pintar(forzar = false) {
    if (tab !== 'inventario' && inv) { inv.destruir(); inv = null; }
    if (tab !== 'pendientes' && pend) { pend.destruir(); pend = null; }
    const cont = $('#emp-cont', raiz);
    if (tab === 'inventario') {
      if (!inv || forzar) { inv?.destruir(); inv = montarInventarioEmp(cont, { llamar, alCambio: badgeInv }); }
      return;
    }
    if (tab === 'pendientes') {
      if (!pend || forzar) { pend?.destruir(); pend = montarPendientesEmp(cont, { llamar, perfil, alCambio: badgePend, inicial: pendInicial }); pendInicial = null; }
      return;
    }
    if (!est) return;
    const badge = $('[data-badge]', raiz);
    const venc = est.mio ? est.mio.tareas.filter(vencida).length : 0;
    if (badge) { badge.hidden = !venc; badge.textContent = venc ? String(venc) : ''; }
    cont.innerHTML = tab === 'tareas' ? vistaTareas() : vistaInicio();
    hidratarAvatares(cont);
  }

  // ---------- recordatorios (a su hora, con el turno abierto) ----------
  const horaMxTxt = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const llaveRec = (r, h) => `ppstaff-rec-${est?.mio?.id}-${r.id}-${String(h).slice(0, 5)}`;
  function recordatoriosActivos() {
    if (!est?.mio || !est.recordatorios?.length) return [];
    const ahora = horaMxTxt();
    const sumar = (h, m) => { const [a, b] = h.split(':').map(Number); const t = a * 60 + b + m; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    const out = [];
    for (const r of est.recordatorios) for (const h of r.horas || []) {
      const hh = String(h).slice(0, 5);
      if (ahora >= hh && ahora < sumar(hh, 45) && !api.leerLocal(llaveRec(r, hh))) out.push({ ...r, hora: hh });
    }
    return out;
  }
  let recAvisados = new Set();
  const relojRec = setInterval(() => {
    if (!est?.mio) return;
    const act = recordatoriosActivos();
    const nuevos = act.filter((r) => !recAvisados.has(llaveRec(r, r.hora)));
    if (!nuevos.length) return;
    nuevos.forEach((r) => recAvisados.add(llaveRec(r, r.hora)));
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin vibración */ }
    aviso(`🔔 ${nuevos[0].texto}`, 'info', 8000);
    if (tab === 'inicio') pintar();
  }, 30000);
  limpiezas.push(() => clearInterval(relojRec));

  // ---------- Inicio ----------
  function horaMx(iso) { return Number(new Date(iso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ })) % 24; }
  function sugerido() {
    const tipos = est.tipos.filter((t) => !t.ya_abierto);
    if (!tipos.length) return null;
    const dom = tipos.find((t) => t.clave === 'domingo');
    if (dom) return dom.clave;
    return (horaMx(est.ahora) < 15 ? tipos.find((t) => t.clave === 'manana') : tipos.find((t) => t.clave === 'tarde'))?.clave || tipos[0].clave;
  }
  function tarjetaRelevo() {
    const r = est.relevo;
    if (!r) return '';
    return `<section class="tarjeta relevo ${r.leida ? 'leida' : ''}"><h2>📝 Nota de relevo</h2>
      <p class="detalle">De <b>${esc(r.perfil_nombre)}</b> (turno ${esc(r.tipo_nombre || '')}, cerró a las ${esc(horaCorta(r.cerrado_en))})</p>
      <p class="relevo-texto">${esc(r.nota)}</p>
      ${r.leida ? '<p class="ayuda">Ya se leyó.</p>' : '<button type="button" class="btn" data-relevo-leido>Ya la leí ✓</button>'}</section>`;
  }
  function tarjetaRecordatorios() {
    const act = recordatoriosActivos();
    if (!act.length) return '';
    return act.map((r) => `<section class="tarjeta recordatorio"><h2>🔔 Recordatorio · ${esc(r.hora)}</h2><p>${esc(r.texto)}</p>
      <button type="button" class="btn chico" data-rec-listo="${esc(r.id)}|${esc(r.hora)}">Listo</button></section>`).join('');
  }
  function tarjetaDesempeno() {
    if (!desemp) return '<section class="tarjeta" id="mi-desemp"><h2>Tu mes</h2><p class="cargando">Cargando…</p></section>';
    const m = desemp.mes, a = desemp.anterior, ra = desemp.rachas || {};
    const em = desemp.empleado_mes;
    const ins = [];
    if (em?.soy_yo) ins.push('🏆 Empleado del mes');
    if ((ra.perfecta || 0) >= 3) ins.push(`🔥 ${ra.perfecta} turnos perfectos seguidos`);
    else if ((ra.perfecta || 0) >= 1) ins.push('💯 Último turno perfecto');
    if ((ra.puntual || 0) >= 5) ins.push(`⏱️ ${ra.puntual} turnos puntual`);
    if (m && m.turnos >= 4 && m.cumplimiento >= 95) ins.push('⭐ +95% de tareas a tiempo');
    if (m && m.turnos >= 4 && !m.no_se_pudo && !m.sin_hacer) ins.push('🧹 Cero pendientes este mes');
    const delta = m && a ? m.puntaje - a.puntaje : null;
    const tip = TIPS[new Date().getDate() % TIPS.length];
    if (!m) {
      return `<section class="tarjeta" id="mi-desemp"><h2>Tu mes</h2><p class="detalle">Todavía no cierras turnos este mes. Aquí vas a ver tu cumplimiento, puntualidad y rachas.</p>
        ${em ? `<p class="detalle">🏆 Empleado del mes pasado: <b>${esc(em.nombre)}</b></p>` : ''}<p class="ayuda">💡 ${esc(tip)}</p></section>`;
    }
    const color = (v) => (v >= 90 ? 'ok-txt' : v >= 75 ? 'warn-txt' : 'mal-txt');
    return `<section class="tarjeta" id="mi-desemp"><div class="enc-avisos"><h2>Tu mes</h2><span class="sub">${m.turnos} turno${m.turnos === 1 ? '' : 's'}</span></div>
      <div class="cifras tres">
        <div><b class="${color(m.cumplimiento)}">${m.cumplimiento}%</b><span>Tareas a tiempo</span></div>
        <div><b class="${color(m.puntualidad)}">${m.puntualidad}%</b><span>Puntualidad</span></div>
        <div><b>${ra.perfecta || 0}🔥</b><span>Racha perfecta<br><i>mejor: ${ra.mejor_perfecta || 0}</i></span></div></div>
      ${delta != null ? `<p class="detalle">Puntaje ${m.puntaje} · ${delta === 0 ? 'igual que' : delta > 0 ? `<span class="ok-txt">▲ ${delta} más que</span>` : `<span class="mal-txt">▼ ${Math.abs(delta)} menos que</span>`} el mes pasado</p>` : `<p class="detalle">Puntaje del mes: ${m.puntaje}</p>`}
      ${ins.length ? `<div class="insignias">${ins.map((i) => `<span class="insignia-logro">${esc(i)}</span>`).join('')}</div>` : ''}
      ${em && !em.soy_yo ? `<p class="detalle">🏆 Empleado del mes pasado: <b>${esc(em.nombre)}</b></p>` : ''}
      <p class="ayuda">💡 ${esc(tip)}</p></section>`;
  }
  function vistaInicio() {
    const hoy = new Date(est.ahora).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
    let h = `<h2 class="saludo">Hola, ${esc(primerNombre(perfil.nombre_completo))}</h2><p class="sub cap">${esc(hoy)}</p>`;
    h += tarjetaRecordatorios();
    if (est.relevo && !est.relevo.leida) h += tarjetaRelevo();
    if (invEst?.conteo) h += `<section class="tarjeta conteo-pend"><h2>📋 Hoy toca conteo de inventario</h2><p class="detalle">Sin clientes ni tickets abiertos, antes de las ${esc(invEst.conteo.limite)}.</p>
      <button type="button" class="btn" data-ir-inv>Ir a Inventario</button></section>`;
    if (est.dia_cerrado) h += `<p class="nota-aviso">Hoy está marcado como día cerrado${est.motivo_cerrado ? `: ${esc(est.motivo_cerrado)}` : ''}.</p>`;
    if (est.mio) {
      const t = est.mio, total = t.tareas.length, ok = hechas(t.tareas), venc = t.tareas.filter(vencida).length;
      const pct = total ? Math.round((ok / total) * 100) : 100;
      h += `<section class="tarjeta turno-abierto t-${esc(t.tipo)}"><h2>${ICONO_TURNO[t.tipo] || ''} Turno ${esc(t.tipo_nombre)}</h2>
        <p class="detalle">Abierto a las ${esc(horaCorta(t.abierto_en))} · sale a las ${esc(horaCorta(t.fin_prog))}</p>
        <div class="progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
        <p class="detalle"><b>${ok}</b> de ${total} tareas listas${venc ? ` · <span class="mal-txt">${venc} vencida${venc === 1 ? '' : 's'}</span>` : ''}</p>
        <button type="button" class="btn grande ${t.tipo === 'tarde' ? 'atardecer' : ''}" data-ir-tareas>Ir a mis tareas</button></section>`;
    } else {
      const sug = sugerido();
      const otros = est.otros_abiertos;
      h += `<section class="tarjeta"><h2>Tu turno</h2>`;
      if (otros.length) h += `<p class="nota-aviso">Hay un turno abierto: ${otros.map((o) => `${esc(o.perfil_nombre)} (${esc(o.tipo_nombre)}, desde las ${esc(horaCorta(o.abierto_en))})`).join('; ')}. Si ya terminó, pídele que lo cierre.</p>`;
      if (!est.tipos.length) h += '<p class="detalle">Hoy no hay turnos programados.</p>';
      h += est.tipos.map((t) => `<button type="button" class="btn ${t.clave === sug ? 'grande' : 'ghost'} btn-turno turno-${esc(t.clave)}" data-abrir="${esc(t.clave)}" ${t.ya_abierto ? 'disabled' : ''}>
          <span class="btn-turno-txt">${ICONO_TURNO[t.clave] || ''} ${t.ya_abierto ? `Turno ${esc(t.nombre)} · ya se abrió hoy` : `Comenzar turno ${esc(t.nombre)}`}</span><small>${esc(t.inicio.slice(0, 5))} – ${esc(t.fin.slice(0, 5))}</small></button>`).join('');
      h += '</section>';
      const u = est.ultimo_cerrado;
      if (u && u.fecha === est.hoy) h += `<section class="tarjeta"><h2>Tu último turno</h2><p class="detalle">Turno ${esc(u.tipo_nombre)} cerrado a las ${esc(horaCorta(u.cerrado_en))}.</p>
        <button type="button" class="btn ghost" data-ver-resumen>Ver resumen</button></section>`;
    }
    if (est.relevo && est.relevo.leida) h += tarjetaRelevo();
    if (est.pendientes) h += `<section class="tarjeta"><div class="enc-avisos"><h2>📌 Pendientes</h2><span class="sub">${est.pendientes}</span></div>
      <p class="detalle">Tienes ${est.pendientes} pendiente${est.pendientes === 1 ? '' : 's'} o incidencia${est.pendientes === 1 ? '' : 's'} abierta${est.pendientes === 1 ? '' : 's'}.</p>
      <button type="button" class="btn ghost" data-ir-pend>Ver pendientes</button></section>`;
    h += tarjetaDesempeno();
    return h;
  }

  async function abrir(clave, forzar = false) {
    const r = await llamar('turno_abrir', { p_tipo: clave, p_forzar: forzar });
    if (muerto) return;
    if (r.ok) { est.mio = r.turno; await cargar({ silencioso: true }); ir('tareas'); if (!r.continua) aviso('Turno abierto. ¡Buen turno!', 'ok'); return; }
    if (r.error === 'avisos') {
      const partes = [];
      for (const a of r.avisos) {
        if (a.tipo === 'turno_abierto') partes.push(`Hay un turno abierto: ${a.turnos.map((o) => `${o.perfil_nombre} (${o.tipo_nombre})`).join(', ')}.`);
        if (a.tipo === 'dia_cerrado') partes.push(`Hoy está marcado como día cerrado${a.motivo ? ` (${a.motivo})` : ''}.`);
        if (a.tipo === 'turno_terminado') partes.push(`El turno ${a.nombre} ya terminó (salida ${a.fin}). ¿Seguro que es el turno correcto?`);
        if (a.tipo === 'muy_temprano') partes.push(`El turno ${a.nombre} empieza hasta las ${a.inicio}. ¿Seguro que es el turno correcto?`);
      }
      if (await confirmar({ titulo: 'Antes de empezar', texto: `${partes.join(' ')} ¿Quieres comenzar de todos modos?`, ok: 'Comenzar de todos modos' })) return abrir(clave, true);
      return;
    }
    aviso(msg(r), 'error');
  }

  // ---------- Tareas ----------
  function metaTarea(x) {
    const cola = x._cola ? ' · <span class="warn-txt">⏳ por enviar</span>' : '';
    if (x.estado === 'excusada') return '<span class="ok-txt">Excusada por gerencia</span>';
    if (x.estado === 'hecha') return `<span class="${x.a_tiempo ? 'ok-txt' : 'warn-txt'}">✓ ${esc(horaCorta(x.marcada_en))} · ${x.a_tiempo ? 'a tiempo' : 'fuera de tiempo'}</span>${x.foto_path ? ' · 📷' : ''}${cola}`;
    if (x.estado === 'no_se_pudo') return `<span class="warn-txt">⚠ No se pudo · ${esc(horaCorta(x.marcada_en))} · se avisó a gerencia</span>${cola}`;
    if (x.estado === 'no_aplica') return `<span class="ok-txt">${esc(x.etiqueta_no_aplica || 'No aplica hoy')} · ${esc(horaCorta(x.marcada_en))}</span>${cola}`;
    const partes = [];
    if (x.incidencia_id) partes.push('Escribe cómo sigue');
    if (x.limite) partes.push(vencida(x) ? `<span class="mal-txt">Venció a las ${esc(horaCorta(x.limite))}</span>` : `Antes de las ${esc(horaCorta(x.limite))}`);
    if (x.requiere_foto) partes.push('📷 pide foto');
    return partes.join(' · ') + cola;
  }
  function filaTarea(x) {
    const listo = x.estado !== 'pendiente';
    const nsp = x.estado === 'no_se_pudo';
    const inc = !!x.incidencia_id;
    return `<div class="tarea ${listo ? 'lista' : ''} ${nsp ? 'nosepudo' : ''} ${vencida(x) ? 'vencida' : ''} ${x.estado === 'excusada' ? 'excusada' : ''} ${inc ? 'incid' : ''}" data-id="${esc(x.id)}">
      <button type="button" class="tarea-check" data-a="${listo ? 'quitar' : 'marcar'}" aria-label="${listo ? 'Quitar marca' : 'Marcar como hecha'}" ${x.estado === 'excusada' ? 'disabled' : ''}>${nsp ? '!' : listo ? '✓' : inc ? '🛠️' : (x.requiere_foto ? '📷' : '')}</button>
      <div class="tarea-txt"><b>${esc(x.nombre)}</b><span class="tarea-meta">${metaTarea(x)}</span>
        ${x.razon && (x.estado === 'pendiente' || nsp || inc) ? `<span class="tarea-meta">${inc ? 'Reporte' : 'Razón'}: ${esc(x.razon)}</span>` : ''}
        ${!listo ? `<span class="tarea-botones">${inc ? '<button type="button" class="chip" data-a="reportar">Reportar</button><button type="button" class="chip" data-a="arreglado">Ya se arregló</button>'
          : `${x.condicional ? `<button type="button" class="chip" data-a="noaplica">${esc(x.etiqueta_no_aplica || 'No aplica hoy')}</button>` : ''}
          <button type="button" class="chip" data-a="nopuedo">No se puede</button>`}</span>` : ''}</div></div>`;
  }
  function vistaTareas() {
    const t = est.mio;
    if (!t) return `<h2 class="saludo">Tareas</h2><div class="tarjeta vacio"><p><b>Todavía no abres tu turno.</b></p><p>Cuando comiences tu turno, aquí aparecen tus tareas.</p>
      <button type="button" class="btn" data-ir-inicio>Ir a Inicio</button></div>`;
    let h = `<h2 class="saludo">${ICONO_TURNO[t.tipo] || ''} Turno ${esc(t.tipo_nombre)}</h2><p class="sub">${hechas(t.tareas)} de ${t.tareas.length} listas · toca el círculo al terminar cada tarea</p>`;
    if (est.relevo && !est.relevo.leida) h += `<p class="nota-aviso">📝 Tienes una nota de relevo sin leer. <button type="button" class="enlace" data-ir-inicio>Leerla</button></p>`;
    const inc = t.tareas.filter((x) => x.incidencia_id);
    if (inc.length) h += `<h3 class="sub-titulo">🛠️ Incidencias abiertas (${hechas(inc)}/${inc.length})</h3><div class="lista-tareas">${inc.map(filaTarea).join('')}</div>`;
    for (const [mom, titulo] of SECCIONES) {
      const l = t.tareas.filter((x) => x.momento === mom && !x.incidencia_id);
      if (!l.length) continue;
      h += `<h3 class="sub-titulo">${titulo} (${hechas(l)}/${l.length})</h3><div class="lista-tareas">${l.map(filaTarea).join('')}</div>`;
    }
    h += `<div class="fila-botones"><button type="button" class="btn ghost" data-nuevo-pend="pendiente">📌 Agregar pendiente</button>
      <button type="button" class="btn ghost" data-nuevo-pend="incidencia">🛠️ Reportar imprevisto</button></div>`;
    h += `<button type="button" class="btn grande cerrar-turno ${t.tipo === 'tarde' ? 'atardecer' : ''}" data-cerrar-turno>Cerrar turno</button>`;
    return h;
  }

  const SIN_RED_OK = new Set(['hecha', 'no_aplica', 'no_puedo', 'deshacer']);
  async function marcar(id, accion, extra = {}) {
    const r = await llamar('tarea_marcar_hora', { p_tarea_id: id, p_accion: accion, p_razon: extra.p_razon ?? null, p_foto: extra.p_foto ?? null, p_cuando: new Date().toISOString() });
    if (muerto) return false;
    if (!r.ok && r.error === 'sin_conexion' && SIN_RED_OK.has(accion) && !extra.p_foto) {
      encolar({ token, tarea_id: id, accion, razon: extra.p_razon ?? null });
      aplicarCola();
      pintar();
      aviso('Sin internet: la marca quedó guardada en el celular y se enviará sola.', 'info', 5000);
      return true;
    }
    if (!r.ok) { aviso(msg(r), 'error'); if (r.error === 'turno_cerrado' || r.error === 'excusada') cargar({ silencioso: true }); return false; }
    if (r.notificacion_id) api.avisar(r.notificacion_id);
    const i = est.mio.tareas.findIndex((x) => x.id === id);
    if (i >= 0) est.mio.tareas[i] = r.tarea;
    pintar();
    return true;
  }
  function pedirFoto(x, fila) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      if (!f) return;
      let blob;
      try { blob = await comprimirEvidencia(f); } catch { aviso('No se pudo leer la foto. Intenta de nuevo.', 'error'); return; }
      vistaPrevia(x, fila, blob);
    });
    inp.click();
  }
  // Miniatura antes de subir: usarla, tomar otra o cancelar
  function vistaPrevia(x, fila, blob) {
    const url = URL.createObjectURL(blob);
    const v = ventana(`<img class="evidencia grande previa" src="${url}" alt="Vista previa de la foto">
      <p class="detalle">¿Se ve bien? Revisa que se note la tarea terminada antes de usarla.</p>
      <div class="acciones" style="margin-top:12px"><button type="button" class="btn grande" data-usar>Usar esta foto</button>
        <div class="fila-botones" style="margin-top:0"><button type="button" class="btn ghost" data-otra>Tomar otra</button>
        <button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></div>`, { titulo: x.nombre, alCerrar: () => URL.revokeObjectURL(url) });
    $('[data-otra]', v.el).addEventListener('click', () => { v.cerrar(); pedirFoto(x, fila); });
    $('[data-usar]', v.el).addEventListener('click', (e) => conOcupado(e.currentTarget, async () => {
      try {
        const ruta = `turnos/${est.mio.id}/${x.id}.jpg`;
        await api.subirFoto(ruta, blob, 'evidencias');
        if (await marcar(x.id, 'hecha', { p_foto: ruta })) { v.cerrar(); aviso('Foto guardada y tarea marcada.', 'ok'); }
      } catch (err) {
        aviso(err.codigo === 'sin_conexion' ? 'No hay internet: las tareas con foto necesitan conexión. Intenta cuando vuelva la señal.' : `No se pudo subir la foto (${err.message || 'error'}). Intenta de nuevo.`, 'error', 7000);
      }
    }));
  }
  function ventanaNoPuedo(x) {
    const v = ventana(`<form class="formulario" novalidate><p class="detalle">Escribe por qué no se pudo hacer <b>${esc(x.nombre)}</b>. La tarea queda marcada como “No se pudo” y se avisa a gerencia y administración.</p>
      <div class="campo"><label for="np-razon">Razón</label><textarea id="np-razon" rows="3" placeholder="Ej. se descompuso, no había material…"></textarea></div>
      <button class="btn" type="submit">Marcar “No se pudo”</button></form>`, { titulo: 'No se puede hacer' });
    const form = $('form', v.el);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      conOcupado($('button[type=submit]', form), async () => { if (await marcar(x.id, 'no_puedo', { p_razon: $('#np-razon', form).value })) { v.cerrar(); aviso('Marcada como “No se pudo”. Se avisó a gerencia.', 'ok'); } });
    });
  }
  // Incidencia abierta: reporte del turno (y si ya se arregló, pide a gerencia que la cierre)
  function ventanaIncidencia(x, arreglado = false) {
    const v = ventana(`<form class="formulario" novalidate>
      <p class="detalle">${arreglado ? 'Cuenta qué se hizo. Gerencia la revisa y la cierra.' : 'Escribe cómo sigue hoy. Se guarda en el historial de la incidencia.'}</p>
      <div class="campo"><label for="inc-txt">${arreglado ? '¿Qué se hizo?' : '¿Cómo sigue?'}</label>
        <textarea id="inc-txt" rows="3" placeholder="${arreglado ? 'Ej. Ya vino el técnico y quedó' : 'Ej. Sigue igual, sigue goteando'}">${arreglado ? '' : ''}</textarea></div>
      <button class="btn" type="submit">${arreglado ? '✓ Ya se arregló' : 'Guardar reporte'}</button></form>`, { titulo: x.nombre.replace(/^Reportar incidencia: /, '🛠️ ') });
    const f = $('form', v.el);
    f.addEventListener('submit', (e) => {
      e.preventDefault(); quitarError(f);
      const texto = $('#inc-txt', f).value.trim();
      if (texto.length < 3) return mostrarError(f, ERR.falta_reporte);
      conOcupado($('button[type=submit]', f), async () => {
        if (!await marcar(x.id, 'hecha', { p_razon: texto })) return;
        if (arreglado) {
          const r = await llamar('pend_emp_nota', { p_id: x.incidencia_id, p_tipo: 'solicita_cierre', p_texto: texto, p_foto: null });
          if (r.ok && r.notificacion_id) api.avisar(r.notificacion_id);
        }
        v.cerrar(); aviso(arreglado ? 'Listo. Gerencia va a revisar para cerrarla.' : 'Reporte guardado.', 'ok');
      });
    });
  }

  // ---------- relevo ----------
  async function relevoLeido() {
    const r = await llamar('turno_relevo_leido', { p_turno_id: est.relevo.turno_id });
    if (!r.ok) return aviso(msg(r), 'error');
    est.relevo.leida = true;
    const x = est.mio?.tareas.find((q) => q.estado === 'pendiente' && /relevo/i.test(q.nombre) && !q.requiere_foto);
    if (x) await marcar(x.id, 'hecha'); else pintar();
    aviso('Nota de relevo leída.', 'ok');
  }

  // ---------- cierre ----------
  function cerrarTurno() {
    const v = ventana(`<form class="formulario" novalidate>
      <p class="detalle">¿Quieres cerrar tu turno ahora?</p>
      <div class="campo"><label for="rel-txt">📝 Nota de relevo para el siguiente turno <span class="opc">(opcional)</span></label>
        <textarea id="rel-txt" rows="3" placeholder="Ej. Falta cambio en caja, quedó una raqueta olvidada en recepción…">${esc(est.mi_nota_relevo || '')}</textarea>
        <p class="ayuda">La ve quien abra el siguiente turno, y también gerencia en el correo del cierre.</p></div>
      <div class="fila-botones"><button type="button" class="btn ghost" data-cerrar>Seguir en mi turno</button><button type="submit" class="btn">Sí, cerrar turno</button></div></form>`, { titulo: 'Cerrar turno' });
    const f = $('form', v.el);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      conOcupado($('button[type=submit]', f), async () => {
        if (pendientesDe(token).length) {
          const rc = await enviarCola();
          if (!rc || pendientesDe(token).length) return aviso('Hay marcas sin enviar y no hay internet. Espera a que vuelva la señal para cerrar el turno.', 'error', 7000);
        }
        const nota = $('#rel-txt', f).value.trim();
        if (nota !== (est.mi_nota_relevo || '')) {
          const rn = await llamar('turno_nota_relevo', { p_turno_id: est.mio.id, p_texto: nota });
          if (!rn.ok) return aviso(msg(rn), 'error');
          est.mi_nota_relevo = nota;
        }
        const r = await llamar('turno_cerrar', { p_turno_id: est.mio.id, p_razones: {}, p_forzar: false });
        if (muerto) return;
        if (r.ok) { v.cerrar(); return terminado(r.turno); }
        if (r.error === 'faltan') { v.cerrar(); return ventanaFaltan(r.pendientes); }
        aviso(msg(r), 'error');
      });
    });
  }
  function ventanaFaltan(pend) {
    const v = ventana(`<form class="formulario" novalidate>
      <p class="detalle">Te faltan <b>${pend.length}</b> tarea${pend.length === 1 ? '' : 's'}. Si vas a cerrar así, escribe la razón de cada una (opcional pero ayuda a la gerencia).</p>
      ${pend.map((p) => `<div class="campo"><label for="rz-${esc(p.id)}">${esc(p.nombre)}</label>
        <input id="rz-${esc(p.id)}" data-razon="${esc(p.id)}" type="text" value="${esc(p.razon || '')}" placeholder="Razón"></div>`).join('')}
      <div class="fila-botones"><button type="button" class="btn ghost" data-r="seguir">Seguir con mis tareas</button>
      <button type="submit" class="btn peligro-suave">Cerrar de todos modos</button></div></form>`, { titulo: 'Faltan tareas' });
    const form = $('form', v.el);
    $('[data-r=seguir]', form).addEventListener('click', () => { v.cerrar(); ir('tareas'); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const razones = {};
      $$('[data-razon]', form).forEach((i) => { if (i.value.trim()) razones[i.dataset.razon] = i.value.trim(); });
      conOcupado($('button[type=submit]', form), async () => {
        const r = await llamar('turno_cerrar', { p_turno_id: est.mio.id, p_razones: razones, p_forzar: true });
        if (!r.ok) return aviso(msg(r), 'error');
        v.cerrar(); terminado(r.turno);
      });
    });
  }
  function resumenHtml(t) {
    const r = t.resumen || {};
    const cumplidas = (r.hechas_a_tiempo || 0) + (r.hechas_tarde || 0) + (r.no_aplica || 0) + (r.excusadas || 0);
    return `<div class="exito"><div class="palomita" aria-hidden="true">✓</div><h2>Turno ${esc(t.tipo_nombre)} cerrado</h2>
      <p class="detalle">${cumplidas} de ${r.total || 0} tareas cumplidas · duración ${esc(duracionTexto(r.duracion_min))}</p></div>
      <dl class="datos resumen">
        <dt>A tiempo</dt><dd>${r.hechas_a_tiempo || 0}</dd><dt>Fuera de tiempo</dt><dd>${r.hechas_tarde || 0}</dd>
        <dt>No aplicaban</dt><dd>${r.no_aplica || 0}</dd><dt>Excusadas</dt><dd>${r.excusadas || 0}</dd>
        <dt>No se pudo</dt><dd>${r.no_se_pudo || 0}</dd><dt>Sin hacer</dt><dd>${r.sin_hacer || 0}</dd>
        ${r.tarde_min > 0 ? `<dt>Abriste</dt><dd>${r.tarde_min} min después de tu hora</dd>` : ''}
        ${r.cerro_antes_min > 0 ? `<dt>Cerraste</dt><dd>${r.cerro_antes_min} min antes de tu hora</dd>` : ''}</dl>`;
  }
  function terminado(turno) {
    est.mio = null; est.ultimo_cerrado = turno; desemp = null;
    const v = ventana(`${resumenHtml(turno)}<div class="acciones"><button type="button" class="btn grande" data-salir-usuario>Salir de mi usuario</button>
      <button type="button" class="btn ghost" data-cerrar>Listo</button></div>`, { titulo: 'Resumen del turno' });
    $('[data-salir-usuario]', v.el).addEventListener('click', () => { v.cerrar(); alSalir(); });
    ir('inicio'); cargar({ silencioso: true });
  }

  // ---------- eventos ----------
  $('#emp-cont', raiz).addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-reintentar]')) return cargar();
    if (t.closest('[data-ir-tareas]')) return ir('tareas');
    if (t.closest('[data-ir-inicio]')) return ir('inicio');
    if (t.closest('[data-ir-inv]')) return ir('inventario');
    if (t.closest('[data-ir-pend]')) return ir('pendientes');
    const np = t.closest('[data-nuevo-pend]');
    if (np) { pendInicial = np.dataset.nuevoPend; return ir('pendientes'); }
    const rl = t.closest('[data-relevo-leido]');
    if (rl) return conOcupado(rl, relevoLeido);
    const rec = t.closest('[data-rec-listo]');
    if (rec) {
      const [id, hora] = rec.dataset.recListo.split('|');
      api.guardarLocal(llaveRec({ id }, hora), 1);
      return pintar();
    }
    const ab = t.closest('[data-abrir]');
    if (ab) return conOcupado(ab, () => abrir(ab.dataset.abrir));
    if (t.closest('[data-ver-resumen]')) {
      ventana(`${resumenHtml(est.ultimo_cerrado)}<div class="acciones"><button type="button" class="btn ghost" data-cerrar>Cerrar</button></div>`, { titulo: 'Resumen del turno' });
      return;
    }
    if (t.closest('[data-cerrar-turno]')) return cerrarTurno();
    const fila = t.closest('.tarea');
    const b = t.closest('[data-a]');
    if (!fila || !b || !est?.mio) return;
    const x = est.mio.tareas.find((q) => q.id === fila.dataset.id);
    if (!x) return;
    const a = b.dataset.a;
    if (a === 'marcar' || a === 'reportar') {
      if (x.incidencia_id) return ventanaIncidencia(x);
      return x.requiere_foto ? pedirFoto(x, fila) : conOcupado(b, () => marcar(x.id, 'hecha'));
    }
    if (a === 'arreglado') return ventanaIncidencia(x, true);
    if (a === 'noaplica') return conOcupado(b, () => marcar(x.id, 'no_aplica'));
    if (a === 'nopuedo') return ventanaNoPuedo(x);
    if (a === 'quitar') {
      return confirmar({ titulo: 'Quitar marca', texto: `¿Quitar la marca de "${x.nombre}"? Vuelve a quedar pendiente.`, ok: 'Quitar marca' }).then((ok) => { if (ok) marcar(x.id, 'deshacer'); });
    }
  });

  cargar();
  return { destruir() { muerto = true; inv?.destruir(); pend?.destruir(); limpiezas.splice(0).forEach((f) => f()); } };
}
