// Ventanas de gerencia/admin: revisar descuadres de caja (perdonar o confirmar) y aprobar/rechazar tareas que el personal pide mover.
import * as api from '../api.js';
import { esc, $, aviso, ventana, conOcupado, pesos, fechaHora } from '../ui.js';

const MOTIVOS_PERDON = ['Error de dedo al capturar', 'Faltaron monedas / sin cambio', 'Error al contar', 'Se aclaró con el empleado'];

export function difTxt(d) {
  const n = Number(d || 0);
  if (Math.abs(n) < 0.005) return '<b class="ok-txt">cuadró</b>';
  return `<b class="${n < 0 ? 'mal-txt' : 'warn-txt'}">${n < 0 ? 'faltan' : 'sobran'} ${pesos(Math.abs(n))}</b>`;
}
export function insigniaRevision(c) {
  if (c.revision === 'perdonado') return '<span class="insignia gris">Perdonado</span>';
  if (c.revision === 'real') return '<span class="insignia mal">Descuadre real</span>';
  if (c.sobre_margen) return '<span class="insignia aviso-i">Por revisar</span>';
  return '';
}

// Perdonar / confirmar un descuadre de caja. alListo() se llama al guardar.
export function ventanaCaja(c, alListo) {
  const v = ventana(`<dl class="datos"><dt>Cierre</dt><dd>${esc(fechaHora(c.cerrado_en))}${c.pos ? ` · ${esc(c.pos)}` : ''}</dd>
      <dt>Empleado</dt><dd>${esc(c.empleado || c.cerro || '¿?')}${c.cerro && c.empleado && c.cerro !== c.empleado ? ` <small>(en Loyverse: ${esc(c.cerro)})</small>` : ''}</dd>
      <dt>Esperado</dt><dd>${pesos(c.esperado)}</dd><dt>Contado</dt><dd>${pesos(c.real)}</dd><dt>Diferencia</dt><dd>${difTxt(c.diferencia)}</dd>
      <dt>Razón del empleado</dt><dd>${c.razon ? `“${esc(c.razon)}”` : '<span class="sub">No escribió razón</span>'}</dd>
      ${c.revision ? `<dt>Revisión</dt><dd>${c.revision === 'perdonado' ? 'Perdonado' : 'Descuadre real'}${c.revision_motivo ? `: ${esc(c.revision_motivo)}` : ''} <small>(${esc(c.revision_nombre || '')})</small></dd>` : ''}</dl>
    ${c.revision ? `<div class="acciones"><button type="button" class="btn ghost" data-quitar>Quitar la revisión</button></div>` : `<form class="formulario" novalidate style="margin-top:8px">
      <p class="detalle">¿Fue un error honesto? Si lo perdonas, ya no cuenta como descuadre real en la app.</p>
      <div class="chips">${MOTIVOS_PERDON.map((m) => `<button type="button" class="chip" data-motivo="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <div class="campo"><label for="cj-mot">Motivo del perdón</label><input id="cj-mot" type="text" maxlength="300" placeholder="Ej. capturó 3,795 en vez de 13,795"></div>
      <div class="fila-botones"><button type="button" class="btn peligro-suave" data-real>Es descuadre real</button><button type="submit" class="btn">🤝 Perdonar</button></div></form>`}`,
  { titulo: 'Descuadre de caja' });
  const guardar = (accion, motivo, boton) => conOcupado(boton, async () => {
    let r; try { r = await api.rpc('caja_revisar', { p_caja: c.id, p_accion: accion, p_motivo: motivo }); } catch (e) { r = { ok: false, mensaje: e.message }; }
    if (!r.ok) return aviso(r.error === 'falta_motivo' ? 'Escribe el motivo del perdón.' : r.mensaje || 'No se pudo guardar.', 'error');
    v.cerrar(); aviso(accion === 'perdonado' ? 'Descuadre perdonado.' : accion === 'real' ? 'Marcado como descuadre real.' : 'Revisión quitada.', 'ok'); alListo?.();
  });
  v.el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-motivo]'); if (m) { $('#cj-mot', v.el).value = m.dataset.motivo; return; }
    const r = e.target.closest('[data-real]'); if (r) return guardar('real', $('#cj-mot', v.el)?.value || '', r);
    const q = e.target.closest('[data-quitar]'); if (q) return guardar('quitar', '', q);
  });
  $('form', v.el)?.addEventListener('submit', (e) => { e.preventDefault(); guardar('perdonado', $('#cj-mot', v.el).value, $('button[type=submit]', v.el)); });
}

export async function ventanaCajas(alCambio) {
  const v = ventana('<p class="cargando">Cargando…</p>', { titulo: '💵 Descuadres de caja' });
  async function pintar() {
    let r; try { r = await api.rpc('cajas_revision'); } catch (e) { r = { ok: false, mensaje: e.message }; }
    if (!r.ok) { v.poner(`<p class="detalle">${esc(r.mensaje || 'No se pudo cargar.')}</p>`); return; }
    const fila = (c) => `<button type="button" class="fila" data-caja="${esc(c.id)}"><div class="fila-txt"><b>${esc(c.empleado || c.cerro || 'Caja')} · ${difTxt(c.diferencia)}</b>
      <span>${esc(fechaHora(c.cerrado_en))}${c.razon ? ` · “${esc(c.razon)}”` : c.sobre_margen ? ' · <span class="warn-txt">sin razón</span>' : ''}</span></div>${insigniaRevision(c)}</button>`;
    const todas = [...r.pendientes, ...r.recientes];
    v.poner(`<p class="detalle" style="margin-top:0">Avisan los descuadres de más de ${pesos(r.margen)} (lo cambias en Más › Ajustes). Toca uno para perdonarlo o confirmarlo.</p>
      ${r.pendientes.length ? `<h3 class="sub-titulo">Por revisar (${r.pendientes.length})</h3><div class="lista">${r.pendientes.map(fila).join('')}</div>` : '<p class="todo-bien">✓ No hay descuadres por revisar.</p>'}
      ${r.recientes.length ? `<h3 class="sub-titulo">Últimos 14 días</h3><div class="lista">${r.recientes.map(fila).join('')}</div>` : ''}`);
    v.el.onclick = (e) => { const b = e.target.closest('[data-caja]'); if (b) ventanaCaja(todas.find((x) => x.id === b.dataset.caja), () => { pintar(); alCambio?.(); }); };
  }
  pintar();
}

const ESTADO_MOV = { pendiente: '<span class="insignia aviso-i">Por decidir</span>', aprobada: '<span class="insignia">Aprobada</span>', aplicada: '<span class="insignia gris">Ya se movió</span>',
  rechazada: '<span class="insignia mal">Rechazada</span>', vencida: '<span class="insignia gris">Venció</span>' };

export async function ventanaMover(alCambio) {
  const v = ventana('<p class="cargando">Cargando…</p>', { titulo: '📅 Tareas que piden mover' });
  async function pintar() {
    let r; try { r = await api.rpc('tareas_mover_lista'); } catch (e) { r = { ok: false, mensaje: e.message }; }
    if (!r.ok) { v.poner(`<p class="detalle">${esc(r.mensaje || 'No se pudo cargar.')}</p>`); return; }
    const l = r.lista || [];
    v.poner(l.length ? `<p class="detalle" style="margin-top:0">Si la apruebas, hoy no cuenta en contra y aparece en el turno que eligieron. Solo esa semana: la plantilla no cambia.</p>
      <div class="lista">${l.map((m) => `<div class="fila inv mover-fila" data-mov="${esc(m.id)}"><div class="fila-txt"><b>${esc(m.nombre)}</b>
        <span>${esc(m.perfil_nombre)} pide pasarla al <b>${esc(m.fecha_texto)}</b>, turno ${esc(m.tipo_nombre || m.tipo_destino)}</span>
        <span>Motivo: “${esc(m.motivo)}”</span>
        ${m.estado !== 'pendiente' ? `<span class="sub">${m.resuelto_nombre ? `${esc(m.resuelto_nombre)} · ${esc(fechaHora(m.resuelto_en))}` : ''}${m.nota ? ` · ${esc(m.nota)}` : ''}</span>` : `<span class="tarea-botones">
          <button type="button" class="chip" data-aprobar>✓ Aprobar</button><button type="button" class="chip" data-rechazar>✕ Rechazar</button></span>`}</div>${ESTADO_MOV[m.estado] || ''}</div>`).join('')}</div>`
      : '<p class="todo-bien">No hay solicitudes.</p>');
  }
  v.el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-mov]'); if (!f) return;
    const ap = e.target.closest('[data-aprobar]'), re = e.target.closest('[data-rechazar]');
    if (!ap && !re) return;
    const resolver = (nota, boton) => conOcupado(boton, async () => {
      let r; try { r = await api.rpc('tarea_mover_resolver', { p_id: f.dataset.mov, p_aprobar: !!ap, p_nota: nota }); } catch (err) { r = { ok: false, mensaje: err.message }; }
      if (!r.ok) {
        const t = { fecha_pasada: 'Ese día ya pasó o ese turno ya se abrió.', ya_no_pendiente: 'La tarea ya no estaba pendiente (ya la hicieron o se cerró el turno).', ya_resuelta: 'Alguien más ya la resolvió.' }[r.error];
        aviso(t || r.mensaje || 'No se pudo guardar.', 'error'); return pintar();
      }
      aviso(ap ? 'Aprobada. La tarea se movió.' : 'Rechazada. Sigue siendo tarea de hoy.', 'ok'); pintar(); alCambio?.();
    });
    if (ap) return resolver('', ap);
    const w = ventana(`<form class="formulario" novalidate><div class="campo"><label for="mv-nota">¿Por qué no? <span class="opc">(opcional, lo ve el empleado)</span></label>
      <input id="mv-nota" type="text" maxlength="300" placeholder="Ej. sí se necesita hoy"></div><button class="btn peligro-suave" type="submit">Rechazar</button></form>`, { titulo: 'Rechazar' });
    $('form', w.el).addEventListener('submit', (ev) => { ev.preventDefault(); const n = $('#mv-nota', w.el).value; w.cerrar(); resolver(n, re); });
  });
  pintar();
}

// ---------- correos y notificaciones que recibe cada persona (gerencia/admin) ----------
export const CATEGORIAS_AVISO = [
  ['turnos', '🚪 Turnos', 'Llegó tarde, no abrió, cerró, cierre automático, coberturas'],
  ['tareas', '✅ Tareas', 'Tareas vencidas, “no se pudo”, pedir mover de día'],
  ['caja', '💵 Caja y Loyverse', 'Descuadres, razones, retiros, reembolsos'],
  ['inventario', '📦 Inventario', 'Pedidos, lo que llegó mal, conteos, existencias bajas'],
  ['pendientes', '📌 Pendientes e incidencias', 'Nuevos, vencidos, piden cerrarse'],
  ['resumenes', '📊 Resúmenes semanales', 'Desempeño del equipo y actividad de gerencia'],
];
export function formPrefsAvisos(cont, perfilId = null) {
  cont.innerHTML = '<p class="cargando">Cargando…</p>';
  let off = [];
  const pintar = (r) => {
    off = r.off || [];
    cont.innerHTML = `<p class="detalle" style="margin-top:0">${perfilId ? `Lo que le llega a <b>${esc(r.nombre)}</b>` : 'Lo que te llega'} por correo${r.email ? ` (${esc(r.email)})` : ''} y como notificación en el celular.</p>
      ${CATEGORIAS_AVISO.map(([k, n, d]) => `<label class="interruptor pref-aviso"><input type="checkbox" data-cat="${k}" ${off.includes(k) ? '' : 'checked'}><span>${n}<small>${esc(d)}</small></span></label>`).join('')}
      ${r.rol === 'admin' ? '<p class="ayuda">🔒 Las alertas de seguridad (cambios manuales de existencias en Loyverse, modo club) siempre le llegan al administrador.</p>' : ''}`;
  };
  api.rpc('avisos_prefs', { p_perfil: perfilId }).then((r) => { if (r?.ok) pintar(r); else cont.innerHTML = '<p class="detalle">No se pudo cargar.</p>'; })
    .catch(() => { cont.innerHTML = '<p class="detalle">No se pudo cargar.</p>'; });
  cont.addEventListener('change', async (e) => {
    const i = e.target.closest('[data-cat]'); if (!i) return;
    const nuevo = [...cont.querySelectorAll('[data-cat]')].filter((x) => !x.checked).map((x) => x.dataset.cat);
    i.disabled = true;
    let r; try { r = await api.rpc('avisos_prefs_guardar', { p_perfil: perfilId, p_off: nuevo }); } catch (err) { r = { ok: false, mensaje: err.message }; }
    i.disabled = false;
    if (!r.ok) { i.checked = !i.checked; return aviso(r.mensaje || 'No se pudo guardar.', 'error'); }
    off = r.off; aviso(i.checked ? 'Activado.' : 'Ya no te llegará esa categoría.', 'ok', 2000);
  });
}
