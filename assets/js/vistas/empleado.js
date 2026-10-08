// Pantalla del empleado (después de poner su PIN): Inicio (abrir turno) y Tareas (checklist y cierre).
import * as api from '../api.js';
import { esc, $, $$, avatar, hidratarAvatares, aviso, ventana, confirmar, conOcupado, primerNombre, horaCorta, comprimirEvidencia, duracionTexto, ROL } from '../ui.js';

const TZ = 'America/Mexico_City';
const ERR = {
  turno_ya_existe: 'Este turno ya se abrió hoy.', tipo_no_corresponde: 'Ese turno no corresponde a hoy.',
  no_es_tu_turno: 'Esta tarea es de otro turno.', turno_cerrado: 'El turno ya está cerrado.', excusada: 'La gerencia ya excusó esta tarea.',
  falta_foto: 'Esta tarea necesita foto.', falta_razon: 'Escribe la razón (mínimo 3 letras).', no_condicional: 'Esta tarea no tiene la opción "No aplica".',
  sin_conexion: 'No hay internet. Revisa la conexión e intenta de nuevo.',
};
const msg = (r) => ERR[r?.error] || r?.mensaje || 'No se pudo completar. Intenta de nuevo.';
const SECCIONES = [['apertura', 'Al abrir el turno'], ['semanal', 'Semanales de hoy'], ['cierre', 'Al cerrar el turno']];

export function montarEmpleado(raiz, { token, perfil, porAdmin, alSalir, alVolverAdmin, alSesionInvalida }) {
  let est = null, tab = 'inicio', muerto = false;
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
    <main class="contenido" id="emp-cont"><p class="cargando">Cargando tu turno…</p></main>
    <nav class="tabs" aria-label="Secciones">
      <button type="button" data-tab="inicio" aria-current="true"><span aria-hidden="true">⌂</span>Inicio</button>
      <button type="button" data-tab="tareas" aria-current="false"><span aria-hidden="true">✓</span>Tareas<i class="punto-aviso" data-badge hidden></i></button>
    </nav></div>`;
  hidratarAvatares(raiz);
  $('[data-salir]', raiz).addEventListener('click', alSalir);
  $('[data-volver-admin]', raiz)?.addEventListener('click', alVolverAdmin);
  $('.tabs', raiz).addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) ir(b.dataset.tab); });

  function ir(t) {
    tab = t;
    $$('.tabs button', raiz).forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === t)));
    pintar();
    window.scrollTo(0, 0);
  }

  // ---------- datos ----------
  async function cargar({ silencioso = false } = {}) {
    const r = await llamar('turno_hoy');
    if (muerto) return;
    if (!r.ok) {
      if (r.error === 'sesion_invalida') return;
      if (!est) $('#emp-cont', raiz).innerHTML = `<div class="tarjeta vacio"><p><b>No se pudo cargar tu turno</b></p><p>${esc(msg(r))}</p><button class="btn ghost" data-reintentar>Volver a intentar</button></div>`;
      else if (!silencioso) aviso(msg(r), 'error');
      $('[data-reintentar]', raiz)?.addEventListener('click', () => cargar());
      return;
    }
    est = r;
    pintar();
  }
  const reloj = setInterval(() => { if (document.visibilityState === 'visible') cargar({ silencioso: true }); }, 45000);
  limpiezas.push(() => clearInterval(reloj));
  const alVolver = () => { if (document.visibilityState === 'visible') cargar({ silencioso: true }); };
  document.addEventListener('visibilitychange', alVolver);
  limpiezas.push(() => document.removeEventListener('visibilitychange', alVolver));

  const hechas = (t) => t.filter((x) => x.estado !== 'pendiente').length;
  const vencida = (x) => x.estado === 'pendiente' && x.limite && new Date(x.limite) < new Date();

  function pintar() {
    if (!est) return;
    const badge = $('[data-badge]', raiz);
    const venc = est.mio ? est.mio.tareas.filter(vencida).length : 0;
    if (badge) { badge.hidden = !venc; badge.textContent = venc ? String(venc) : ''; }
    const cont = $('#emp-cont', raiz);
    cont.innerHTML = tab === 'tareas' ? vistaTareas() : vistaInicio();
    hidratarAvatares(cont);
  }

  // ---------- Inicio ----------
  function horaMx(iso) { return Number(new Date(iso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ })) % 24; }
  function sugerido() {
    const tipos = est.tipos.filter((t) => !t.ya_abierto);
    if (!tipos.length) return null;
    const dom = tipos.find((t) => t.clave === 'domingo');
    if (dom) return dom.clave;
    return (horaMx(est.ahora) < 15 ? tipos.find((t) => t.clave === 'manana') : tipos.find((t) => t.clave === 'tarde'))?.clave || tipos[0].clave;
  }
  function vistaInicio() {
    const hoy = new Date(est.ahora).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
    let h = `<h2 class="saludo">Hola, ${esc(primerNombre(perfil.nombre_completo))}</h2><p class="sub cap">${esc(hoy)}</p>`;
    if (est.dia_cerrado) h += `<p class="nota-aviso">Hoy está marcado como día cerrado${est.motivo_cerrado ? `: ${esc(est.motivo_cerrado)}` : ''}.</p>`;
    if (est.mio) {
      const t = est.mio, total = t.tareas.length, ok = hechas(t.tareas), venc = t.tareas.filter(vencida).length;
      const pct = total ? Math.round((ok / total) * 100) : 100;
      h += `<section class="tarjeta turno-abierto"><h2>Turno ${esc(t.tipo_nombre)}</h2>
        <p class="detalle">Abierto a las ${esc(horaCorta(t.abierto_en))} · sale a las ${esc(horaCorta(t.fin_prog))}</p>
        <div class="progreso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
        <p class="detalle"><b>${ok}</b> de ${total} tareas listas${venc ? ` · <span class="mal-txt">${venc} vencida${venc === 1 ? '' : 's'}</span>` : ''}</p>
        <button type="button" class="btn grande" data-ir-tareas>Ir a mis tareas</button></section>`;
    } else {
      const sug = sugerido();
      const otros = est.otros_abiertos;
      h += `<section class="tarjeta"><h2>Tu turno</h2>`;
      if (otros.length) h += `<p class="nota-aviso">Hay un turno abierto: ${otros.map((o) => `${esc(o.perfil_nombre)} (${esc(o.tipo_nombre)}, desde las ${esc(horaCorta(o.abierto_en))})`).join('; ')}. Si ya terminó, pídele que lo cierre.</p>`;
      if (!est.tipos.length) h += '<p class="detalle">Hoy no hay turnos programados.</p>';
      h += est.tipos.map((t) => `<button type="button" class="btn ${t.clave === sug ? 'grande' : 'ghost'} btn-turno" data-abrir="${esc(t.clave)}" ${t.ya_abierto ? 'disabled' : ''}>
          ${t.ya_abierto ? `Turno ${esc(t.nombre)} · ya se abrió hoy` : `Comenzar turno ${esc(t.nombre)}`}<small>${esc(t.inicio.slice(0, 5))} – ${esc(t.fin.slice(0, 5))}</small></button>`).join('');
      h += '</section>';
      const u = est.ultimo_cerrado;
      if (u && u.fecha === est.hoy) h += `<section class="tarjeta"><h2>Tu último turno</h2><p class="detalle">Turno ${esc(u.tipo_nombre)} cerrado a las ${esc(horaCorta(u.cerrado_en))}.</p>
        <button type="button" class="btn ghost" data-ver-resumen>Ver resumen</button></section>`;
    }
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
      }
      if (await confirmar({ titulo: 'Antes de empezar', texto: `${partes.join(' ')} ¿Quieres comenzar de todos modos?`, ok: 'Comenzar de todos modos' })) return abrir(clave, true);
      return;
    }
    aviso(msg(r), 'error');
  }

  // ---------- Tareas ----------
  function metaTarea(x) {
    if (x.estado === 'excusada') return '<span class="ok-txt">Excusada por gerencia</span>';
    if (x.estado === 'hecha') return `<span class="${x.a_tiempo ? 'ok-txt' : 'warn-txt'}">✓ ${esc(horaCorta(x.marcada_en))} · ${x.a_tiempo ? 'a tiempo' : 'fuera de tiempo'}</span>${x.foto_path ? ' · 📷' : ''}`;
    if (x.estado === 'no_aplica') return `<span class="ok-txt">${esc(x.etiqueta_no_aplica || 'No aplica hoy')} · ${esc(horaCorta(x.marcada_en))}</span>`;
    const partes = [];
    if (x.limite) partes.push(vencida(x) ? `<span class="mal-txt">Venció a las ${esc(horaCorta(x.limite))}</span>` : `Antes de las ${esc(horaCorta(x.limite))}`);
    if (x.requiere_foto) partes.push('📷 pide foto');
    if (x.pide_excusa) partes.push('<span class="warn-txt">Pediste que se excuse</span>');
    return partes.join(' · ');
  }
  function filaTarea(x) {
    const listo = x.estado !== 'pendiente';
    return `<div class="tarea ${listo ? 'lista' : ''} ${vencida(x) ? 'vencida' : ''} ${x.estado === 'excusada' ? 'excusada' : ''}" data-id="${esc(x.id)}">
      <button type="button" class="tarea-check" data-a="${listo ? 'quitar' : 'marcar'}" aria-label="${listo ? 'Quitar marca' : 'Marcar como hecha'}" ${x.estado === 'excusada' ? 'disabled' : ''}>${listo ? '✓' : (x.requiere_foto ? '📷' : '')}</button>
      <div class="tarea-txt"><b>${esc(x.nombre)}</b><span class="tarea-meta">${metaTarea(x)}</span>
        ${x.razon && x.estado === 'pendiente' ? `<span class="tarea-meta">Razón: ${esc(x.razon)}</span>` : ''}
        ${!listo ? `<span class="tarea-botones">${x.condicional ? `<button type="button" class="chip" data-a="noaplica">${esc(x.etiqueta_no_aplica || 'No aplica hoy')}</button>` : ''}
          <button type="button" class="chip" data-a="nopuedo">No se puede</button></span>` : ''}</div></div>`;
  }
  function vistaTareas() {
    const t = est.mio;
    if (!t) return `<h2 class="saludo">Tareas</h2><div class="tarjeta vacio"><p><b>Todavía no abres tu turno.</b></p><p>Cuando comiences tu turno, aquí aparecen tus tareas.</p>
      <button type="button" class="btn" data-ir-inicio>Ir a Inicio</button></div>`;
    let h = `<h2 class="saludo">Turno ${esc(t.tipo_nombre)}</h2><p class="sub">${hechas(t.tareas)} de ${t.tareas.length} listas · toca el círculo al terminar cada tarea</p>`;
    for (const [mom, titulo] of SECCIONES) {
      const l = t.tareas.filter((x) => x.momento === mom);
      if (!l.length) continue;
      h += `<h3 class="sub-titulo">${titulo} (${hechas(l)}/${l.length})</h3><div class="lista-tareas">${l.map(filaTarea).join('')}</div>`;
    }
    h += '<button type="button" class="btn grande cerrar-turno" data-cerrar-turno>Cerrar turno</button>';
    return h;
  }

  async function marcar(id, accion, extra = {}) {
    const r = await llamar('tarea_marcar', { p_tarea_id: id, p_accion: accion, ...extra });
    if (muerto) return false;
    if (!r.ok) { aviso(msg(r), 'error'); if (r.error === 'turno_cerrado' || r.error === 'excusada') cargar({ silencioso: true }); return false; }
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
      fila.classList.add('subiendo');
      try {
        const blob = await comprimirEvidencia(f);
        const ruta = `turnos/${est.mio.id}/${x.id}.jpg`;
        await api.subirFoto(ruta, blob, 'evidencias');
        await marcar(x.id, 'hecha', { p_foto: ruta });
      } catch (e) {
        aviso(e.codigo === 'sin_conexion' ? ERR.sin_conexion : 'No se pudo subir la foto. Intenta de nuevo.', 'error');
        fila.classList.remove('subiendo');
      }
    });
    inp.click();
  }
  function ventanaNoPuedo(x) {
    const v = ventana(`<form class="formulario" novalidate><p class="detalle">Cuéntale a gerencia por qué no se pudo hacer <b>${esc(x.nombre)}</b>. Ellos deciden si la excusan; si no, cuenta como no cumplida.</p>
      <div class="campo"><label for="np-razon">Razón</label><textarea id="np-razon" rows="3" placeholder="Ej. se descompuso, no había material…"></textarea></div>
      <button class="btn" type="submit">Enviar razón</button></form>`, { titulo: 'No se puede hacer' });
    const form = $('form', v.el);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      conOcupado($('button[type=submit]', form), async () => { if (await marcar(x.id, 'no_puedo', { p_razon: $('#np-razon', form).value })) { v.cerrar(); aviso('Razón enviada.', 'ok'); } });
    });
  }

  // ---------- cierre ----------
  async function cerrarTurno() {
    if (!await confirmar({ titulo: 'Cerrar turno', texto: '¿Quieres cerrar tu turno ahora?', ok: 'Sí, cerrar turno' })) return;
    const r = await llamar('turno_cerrar', { p_turno_id: est.mio.id, p_razones: {}, p_forzar: false });
    if (muerto) return;
    if (r.ok) return terminado(r.turno);
    if (r.error === 'faltan') return ventanaFaltan(r.pendientes);
    aviso(msg(r), 'error');
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
        <dt>Sin hacer</dt><dd>${r.sin_hacer || 0}</dd>
        ${r.tarde_min > 0 ? `<dt>Abriste</dt><dd>${r.tarde_min} min después de tu hora</dd>` : ''}
        ${r.cerro_antes_min > 0 ? `<dt>Cerraste</dt><dd>${r.cerro_antes_min} min antes de tu hora</dd>` : ''}</dl>`;
  }
  function terminado(turno) {
    est.mio = null; est.ultimo_cerrado = turno;
    const v = ventana(`${resumenHtml(turno)}<div class="acciones"><button type="button" class="btn grande" data-salir-usuario>Salir de mi usuario</button>
      <button type="button" class="btn ghost" data-cerrar>Listo</button></div>`, { titulo: 'Resumen del turno' });
    $('[data-salir-usuario]', v.el).addEventListener('click', () => { v.cerrar(); alSalir(); });
    ir('inicio'); cargar({ silencioso: true });
  }

  // ---------- eventos ----------
  $('#emp-cont', raiz).addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-ir-tareas]')) return ir('tareas');
    if (t.closest('[data-ir-inicio]')) return ir('inicio');
    const ab = t.closest('[data-abrir]');
    if (ab) return conOcupado(ab, () => abrir(ab.dataset.abrir));
    if (t.closest('[data-ver-resumen]')) {
      const v = ventana(`${resumenHtml(est.ultimo_cerrado)}<div class="acciones"><button type="button" class="btn ghost" data-cerrar>Cerrar</button></div>`, { titulo: 'Resumen del turno' });
      return void v;
    }
    if (t.closest('[data-cerrar-turno]')) return cerrarTurno();
    const fila = t.closest('.tarea');
    const b = t.closest('[data-a]');
    if (!fila || !b || !est?.mio) return;
    const x = est.mio.tareas.find((q) => q.id === fila.dataset.id);
    if (!x) return;
    const a = b.dataset.a;
    if (a === 'marcar') return x.requiere_foto ? pedirFoto(x, fila) : conOcupado(b, () => marcar(x.id, 'hecha'));
    if (a === 'noaplica') return conOcupado(b, () => marcar(x.id, 'no_aplica'));
    if (a === 'nopuedo') return ventanaNoPuedo(x);
    if (a === 'quitar') {
      return confirmar({ titulo: 'Quitar marca', texto: `¿Quitar la marca de "${x.nombre}"?`, ok: 'Quitar marca' }).then((ok) => { if (ok) marcar(x.id, 'deshacer'); });
    }
  });

  cargar();
  return { destruir() { muerto = true; limpiezas.splice(0).forEach((f) => f()); } };
}
