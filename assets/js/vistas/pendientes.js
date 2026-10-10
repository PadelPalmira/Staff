// Pendientes, incidencias y solicitudes para gerencia y admin: lista por estado, detalle con historial y fotos,
// crear/editar (asignar a un turno o persona, prioridad, fecha y costo), notas, resolver, cancelar y reabrir.
import * as api from '../api.js';
import { esc, $, $$, aviso, ventana, conOcupado, mostrarError, quitarError, fechaHora, pesos } from '../ui.js';
import { TIPOS, PRIORIDADES, ZONAS, ESTADOS, tarjetaPendiente, historialHtml, hidratarFotosPend, campoFotoOpcional, subirFotoPend, nuevoId, fechaLimiteTxt } from '../pend.js';

const COLS = 'id,tipo,titulo,descripcion,zona,prioridad,fecha_limite,costo_estimado,asignado_tipo,asignado_perfil,estado,foto_path,creado_por,creado_por_nombre,creado_en,actualizado_en,resuelto_en,resolucion,costo_real';
const TURNOS = { manana: 'Turno mañana', tarde: 'Turno tarde', domingo: 'Turno domingo' };
const ERR = { falta_titulo: 'Escribe un título (mínimo 3 letras).', falta_texto: 'Escribe algo o agrega una foto.', sin_permiso: 'No tienes permiso.', no_existe: 'Ya no existe.', datos_invalidos: 'Revisa los datos.' };
const hoyMx = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

// misma regla que el servidor: +1 por cada semana abierto y +1 si ya venció (máximo 4)
export function prioridadEfectiva(p) {
  const semanas = Math.floor((Date.now() - new Date(p.creado_en).getTime()) / (7 * 86400000));
  return Math.min(4, p.prioridad + semanas + (p.fecha_limite && p.fecha_limite < hoyMx() ? 1 : 0));
}
export async function contarPendientesGestion() {
  const l = await api.seleccionar('pendientes', 'select=id,tipo,estado&or=(estado.eq.solicita_cierre,and(estado.eq.abierto,tipo.in.(incidencia,solicitud)))&limit=100');
  return l.length;
}

export async function montarPendientes(el, ctx, yo) {
  let vista = api.leerLocal('ppstaff-pend-vista') || 'abiertos';
  let todos = [], personas = new Map();
  el.innerHTML = `<div class="enc-seccion"><h2>Pendientes</h2><button type="button" class="btn chico" data-nuevo>＋ Nuevo</button></div>
    <div class="segmentos cuatro" role="tablist"><button type="button" data-vista="abiertos">📌<br>Pendientes</button><button type="button" data-vista="incidencias">🛠️<br>Incidencias</button>
      <button type="button" data-vista="solicitudes">✋<br>Solicitudes</button><button type="button" data-vista="cerrados">✓<br>Cerrados</button></div>
    <div id="pend-cont"><p class="cargando">Cargando…</p></div>`;
  const cont = $('#pend-cont', el);

  async function cargar() {
    try {
      const [abiertos, cerrados, perf] = await Promise.all([
        api.seleccionar('pendientes', `select=${COLS}&estado=in.(abierto,en_proceso,solicita_cierre)&order=creado_en.desc&limit=300`),
        api.seleccionar('pendientes', `select=${COLS}&estado=in.(resuelto,cancelado)&order=actualizado_en.desc&limit=60`),
        api.rpc('listar_personal').then((l) => (l || []).map((x) => ({ ...x, rol: 'recepcion', estado: 'activo' }))).catch(() => []),
      ]);
      personas = new Map(perf.map((p) => [p.id, p]));
      todos = [...abiertos, ...cerrados].map((p) => ({ ...p, prioridad_efectiva: ['resuelto', 'cancelado'].includes(p.estado) ? p.prioridad : prioridadEfectiva(p),
        asignado_nombre: p.asignado_perfil ? personas.get(p.asignado_perfil)?.nombre_completo : p.asignado_tipo ? TURNOS[p.asignado_tipo] : null }));
    } catch (e) { cont.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
    pintar();
  }
  const orden = (a, b) => (b.prioridad_efectiva - a.prioridad_efectiva) || String(a.fecha_limite || '9999').localeCompare(String(b.fecha_limite || '9999')) || a.creado_en.localeCompare(b.creado_en);
  function pintar() {
    $$('[data-vista]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === vista)));
    const abiertos = todos.filter((p) => ['abierto', 'en_proceso', 'solicita_cierre'].includes(p.estado));
    const lista = (l, vacio) => (l.length ? `<div class="lista">${l.map((p) => tarjetaPendiente(p)).join('')}</div>` : `<div class="tarjeta vacio"><p>${vacio}</p></div>`);
    let h = '';
    if (vista === 'cerrados') {
      h = lista(todos.filter((p) => ['resuelto', 'cancelado'].includes(p.estado)), 'Todavía no hay pendientes cerrados.');
    } else {
      const tipo = { abiertos: 'pendiente', incidencias: 'incidencia', solicitudes: 'solicitud' }[vista];
      const l = abiertos.filter((p) => p.tipo === tipo).sort(orden);
      const piden = l.filter((p) => p.estado === 'solicita_cierre');
      const resto = l.filter((p) => p.estado !== 'solicita_cierre');
      if (piden.length) h += `<h3 class="sub-titulo">✔️ Piden cerrarlo (${piden.length})</h3>${lista(piden, '')}`;
      h += `<h3 class="sub-titulo">${TIPOS[tipo].ico} ${tipo === 'pendiente' ? 'Pendientes abiertos' : tipo === 'incidencia' ? 'Incidencias abiertas' : 'Solicitudes'} (${resto.length})</h3>`;
      h += lista(resto, tipo === 'incidencia' ? 'Nada descompuesto. 🎉' : tipo === 'solicitud' ? 'No hay solicitudes del personal.' : 'No hay pendientes abiertos.');
      if (tipo === 'incidencia') h += '<p class="ayuda">Cada incidencia abierta aparece como tarea “Reportar incidencia” en cada turno hasta que la marques como resuelta.</p>';
      if (tipo === 'solicitud') h += '<p class="ayuda">Si te piden cambiar o agregar una tarea, hazlo en la pestaña Tareas y luego marca la solicitud como resuelta.</p>';
      const cuenta = (t) => abiertos.filter((p) => p.tipo === t).length;
      $$('[data-vista]', el).forEach((b) => {
        const t = { abiertos: 'pendiente', incidencias: 'incidencia', solicitudes: 'solicitud' }[b.dataset.vista];
        if (t) b.dataset.n = cuenta(t) || '';
      });
    }
    cont.innerHTML = h;
  }

  // ---------- formulario ----------
  function formulario(p) {
    const nuevo = !p;
    p = p || { tipo: vista === 'incidencias' ? 'incidencia' : vista === 'solicitudes' ? 'solicitud' : 'pendiente', titulo: '', descripcion: '', zona: '', prioridad: 2, fecha_limite: '', costo_estimado: '', asignado_tipo: null, asignado_perfil: null };
    const recep = [...personas.values()].filter((x) => x.estado === 'activo' && ['recepcion', 'gerencia', 'admin'].includes(x.rol));
    const asig = p.asignado_perfil ? `p:${p.asignado_perfil}` : p.asignado_tipo ? `t:${p.asignado_tipo}` : '';
    const v = ventana(`<form class="formulario" novalidate>
      <div class="campo"><label>Tipo</label><div class="chips">${Object.entries(TIPOS).map(([k, t]) => `<label class="chip-sel ancho"><input type="radio" name="tipo" value="${k}" ${p.tipo === k ? 'checked' : ''}><span>${t.ico} ${t.nombre}</span></label>`).join('')}</div></div>
      <div class="campo"><label for="pg-tit">Título</label><input id="pg-tit" type="text" maxlength="90" value="${esc(p.titulo)}" placeholder="Ej. Pintar líneas de la cancha 3"></div>
      <div class="campo"><label for="pg-desc">Descripción <span class="opc">(opcional)</span></label><textarea id="pg-desc" rows="3">${esc(p.descripcion || '')}</textarea></div>
      <div class="campo"><label for="pg-asig">¿Quién lo hace?</label><select id="pg-asig">
        <option value="">Cualquiera que esté en turno</option>${Object.entries(TURNOS).map(([k, n]) => `<option value="t:${k}" ${asig === `t:${k}` ? 'selected' : ''}>${n}</option>`).join('')}
        <optgroup label="Una persona">${recep.map((x) => `<option value="p:${esc(x.id)}" ${asig === `p:${x.id}` ? 'selected' : ''}>${esc(x.nombre_completo)}</option>`).join('')}</optgroup></select>
        <p class="ayuda">Las incidencias las ve y reporta todo el personal, sin importar a quién se asignen.</p></div>
      <div class="campo"><label for="pg-zona">Zona</label><select id="pg-zona"><option value="">—</option>${ZONAS.map((z) => `<option ${p.zona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}${p.zona && !ZONAS.includes(p.zona) ? `<option selected>${esc(p.zona)}</option>` : ''}</select></div>
      <div class="campo"><label>Prioridad</label><div class="chips">${[1, 2, 3, 4].map((n) => `<label class="chip-sel ancho"><input type="radio" name="prio" value="${n}" ${n === p.prioridad ? 'checked' : ''}><span>${PRIORIDADES[n]}</span></label>`).join('')}</div>
        <p class="ayuda">Sube sola un nivel por cada semana abierto y otro si pasa la fecha límite.</p></div>
      <div class="fila-botones" style="margin:0"><div class="campo"><label for="pg-fecha">Fecha límite <span class="opc">(opcional)</span></label><input id="pg-fecha" type="date" value="${esc(p.fecha_limite || '')}"></div>
        <div class="campo"><label for="pg-costo">Costo estimado <span class="opc">($)</span></label><input id="pg-costo" type="number" inputmode="decimal" min="0" step="1" value="${esc(p.costo_estimado ?? '')}"></div></div>
      <div class="campo"><label>Foto <span class="opc">(opcional)</span></label><div id="pg-foto"></div></div>
      <button class="btn" type="submit">${nuevo ? 'Crear' : 'Guardar cambios'}</button></form>`, { titulo: nuevo ? 'Nuevo' : 'Editar' });
    const f = $('form', v.el);
    const foto = campoFotoOpcional($('#pg-foto', f), p.foto_path ? 'Cambiar foto' : 'Agregar foto');
    f.addEventListener('submit', (e) => {
      e.preventDefault(); quitarError(f);
      const titulo = $('#pg-tit', f).value.trim();
      if (titulo.length < 3) return mostrarError(f, ERR.falta_titulo);
      const a = $('#pg-asig', f).value;
      conOcupado($('button[type=submit]', f), async () => {
        const id = p.id || nuevoId();
        const datos = { tipo: $('input[name=tipo]:checked', f).value, titulo, descripcion: $('#pg-desc', f).value, zona: $('#pg-zona', f).value,
          prioridad: $('input[name=prio]:checked', f)?.value || 2, fecha_limite: $('#pg-fecha', f).value, costo_estimado: $('#pg-costo', f).value,
          asignado_tipo: a.startsWith('t:') ? a.slice(2) : '', asignado_perfil: a.startsWith('p:') ? a.slice(2) : '' };
        if (foto.blob()) {
          try { datos.foto_path = await subirFotoPend(id, foto.blob(), 'inicial'); } catch { return mostrarError(f, 'No se pudo subir la foto.'); }
        }
        try {
          const r = await api.rpc('pend_guardar', { p_id: id, p_datos: datos });
          if (!r.ok) return mostrarError(f, ERR[r.error] || 'No se pudo guardar.');
          v.cerrar(); aviso(nuevo ? 'Creado.' : 'Guardado.', 'ok'); cargar();
        } catch (err) { mostrarError(f, err.message); }
      });
    });
  }

  // ---------- detalle ----------
  async function detalle(p) {
    const v = ventana('<p class="cargando">Cargando…</p>', { titulo: TIPOS[p.tipo]?.nombre || 'Pendiente' });
    let notas = [];
    try { notas = await api.seleccionar('pendiente_notas', `select=tipo,texto,foto_path,perfil_nombre,creado_en&pendiente_id=eq.${p.id}&order=creado_en.desc&limit=60`); } catch { /* sin historial */ }
    const abierto = ['abierto', 'en_proceso', 'solicita_cierre'].includes(p.estado);
    const t = TIPOS[p.tipo] || TIPOS.pendiente;
    v.poner(`<div class="detalle-cab"><h3>${t.ico} ${esc(p.titulo)}</h3>
        <p class="sub">${esc(ESTADOS[p.estado] || p.estado)} · prioridad ${esc(PRIORIDADES[p.prioridad_efectiva])}${p.prioridad_efectiva > p.prioridad ? ` (empezó en ${esc(PRIORIDADES[p.prioridad])})` : ''}${p.fecha_limite ? ` · ${fechaLimiteTxt(p.fecha_limite)}` : ''}</p></div>
      <dl class="datos">${p.zona ? `<dt>Zona</dt><dd>${esc(p.zona)}</dd>` : ''}<dt>Quién</dt><dd>${esc(p.asignado_nombre || 'Cualquiera en turno')}</dd>
        <dt>Lo creó</dt><dd>${esc(p.creado_por_nombre || '—')} · ${esc(fechaHora(p.creado_en))}</dd>
        ${p.costo_estimado != null ? `<dt>Costo estimado</dt><dd>${esc(pesos(p.costo_estimado))}</dd>` : ''}${p.costo_real != null ? `<dt>Costo real</dt><dd>${esc(pesos(p.costo_real))}</dd>` : ''}
        ${p.resolucion ? `<dt>Resolución</dt><dd>${esc(p.resolucion)}</dd>` : ''}</dl>
      ${p.descripcion ? `<p class="texto-ventana">${esc(p.descripcion)}</p>` : ''}
      ${p.foto_path ? `<img class="evidencia" data-foto="${esc(p.foto_path)}" alt="Foto" hidden>` : ''}
      <form class="formulario" id="pg-nota" novalidate style="margin-top:12px"><div class="campo"><label for="pg-ntxt">Agregar nota</label><textarea id="pg-ntxt" rows="2"></textarea></div>
        <div id="pg-nfoto"></div><button type="submit" class="btn ghost chico">Guardar nota</button></form>
      ${historialHtml(notas)}
      <div class="acciones" style="margin-top:14px">
        ${abierto ? `<button type="button" class="btn" data-acc="resolver">✓ Marcar como resuelto</button>
          <div class="fila-botones" style="margin-top:0"><button type="button" class="btn ghost" data-acc="editar">Editar</button><button type="button" class="btn peligro-suave" data-acc="cancelar">Cancelar</button></div>`
          : '<button type="button" class="btn ghost" data-acc="reabrir">Reabrir</button>'}</div>`);
    hidratarFotosPend(v.el);
    const fn = $('#pg-nota', v.el);
    const fotoN = campoFotoOpcional($('#pg-nfoto', fn), 'Foto (opcional)');
    fn.addEventListener('submit', (e) => {
      e.preventDefault(); quitarError(fn);
      const txt = $('#pg-ntxt', fn).value.trim();
      if (txt.length < 2 && !fotoN.blob()) return mostrarError(fn, ERR.falta_texto);
      conOcupado($('button[type=submit]', fn), async () => {
        let ruta = null;
        if (fotoN.blob()) { try { ruta = await subirFotoPend(p.id, fotoN.blob()); } catch { return mostrarError(fn, 'No se pudo subir la foto.'); } }
        const r = await api.rpc('pend_nota', { p_id: p.id, p_texto: txt, p_foto: ruta });
        if (!r.ok) return mostrarError(fn, ERR[r.error] || 'No se pudo guardar.');
        v.cerrar(); aviso('Nota guardada.', 'ok'); detalle(p);
      });
    });
    v.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-acc]');
      if (!b) return;
      const acc = b.dataset.acc;
      if (acc === 'editar') { v.cerrar(); return formulario(p); }
      if (acc === 'reabrir') return conOcupado(b, () => cambiarEstado(p, 'abierto', null, null, v));
      const res = acc === 'resolver';
      const w = ventana(`<form class="formulario" novalidate>
        <div class="campo"><label for="pe-txt">${res ? '¿Qué se hizo?' : '¿Por qué se cancela?'} <span class="opc">(opcional)</span></label><textarea id="pe-txt" rows="2"></textarea></div>
        ${res ? '<div class="campo"><label for="pe-costo">Costo real <span class="opc">($, opcional)</span></label><input id="pe-costo" type="number" inputmode="decimal" min="0" step="1"></div>' : ''}
        <button class="btn ${res ? '' : 'peligro-suave'}" type="submit">${res ? 'Marcar como resuelto' : 'Cancelar pendiente'}</button></form>`, { titulo: res ? 'Resolver' : 'Cancelar' });
      const f = $('form', w.el);
      f.addEventListener('submit', (ev) => {
        ev.preventDefault();
        conOcupado($('button', f), async () => {
          const c = $('#pe-costo', f)?.value;
          if (await cambiarEstado(p, res ? 'resuelto' : 'cancelado', $('#pe-txt', f).value, c === '' || c == null ? null : Number(c), v)) w.cerrar();
        });
      });
    });
  }
  async function cambiarEstado(p, estado, texto, costo, v) {
    try {
      const r = await api.rpc('pend_estado', { p_id: p.id, p_estado: estado, p_texto: texto, p_costo_real: costo });
      if (!r.ok) { aviso(ERR[r.error] || 'No se pudo.', 'error'); return false; }
      v.cerrar(); aviso(estado === 'resuelto' ? 'Resuelto. Se quita de los turnos.' : estado === 'cancelado' ? 'Cancelado.' : 'Reabierto.', 'ok'); cargar();
      document.dispatchEvent(new Event('ppstaff-pendientes'));
      return true;
    } catch (e) { aviso(e.message, 'error'); return false; }
  }

  $('.segmentos', el).addEventListener('click', (e) => { const b = e.target.closest('[data-vista]'); if (b) { vista = b.dataset.vista; api.guardarLocal('ppstaff-pend-vista', vista); pintar(); } });
  $('[data-nuevo]', el).addEventListener('click', () => formulario(null));
  cont.addEventListener('click', (e) => { const b = e.target.closest('[data-pend]'); if (b) { const p = todos.find((x) => x.id === b.dataset.pend); if (p) detalle(p); } });
  cargar();
}
