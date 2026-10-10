// Pestaña "Más": Mi cuenta (contraseña y notificaciones) para todos; Usuarios, Ajustes y Actividad de gerencia para el admin.
import * as api from '../api.js';
import { APP_VERSION } from '../config.js';
import { esc, $, $$, ROL, aviso, conOcupado, campoPassword, activarMostrar, mostrarError, quitarError, duracionTexto } from '../ui.js';
import { montarUsuarios } from './usuarios.js';
import { montarAjustes } from './ajustes.js';
import { estadoPush, activarPush, desactivarPush, probarPush, esIOS } from '../push.js';

const LLAVE = 'ppstaff-mas-vista';

export function montarMas(el, ctx, yo, { vista: inicial } = {}) {
  const esAdmin = yo.rol === 'admin';
  const vistas = esAdmin ? [['usuarios', '☺<br>Usuarios'], ['ajustes', '⚙<br>Ajustes'], ['actividad', '📈<br>Actividad'], ['cuenta', '👤<br>Mi cuenta']] : [['cuenta', '👤 Mi cuenta']];
  let vista = inicial || api.leerLocal(LLAVE) || vistas[0][0];
  if (!vistas.some((v) => v[0] === vista)) vista = vistas[0][0];
  el.innerHTML = `${vistas.length > 1 ? `<div class="segmentos cuatro" role="tablist">${vistas.map(([k, n]) => `<button type="button" data-vista="${k}">${n}${k === 'usuarios' ? '<i class="punto-aviso" data-badge-sol hidden></i>' : ''}</button>`).join('')}</div>` : ''}
    <div id="mas-cont"></div>`;
  function poner(v) {
    vista = v; api.guardarLocal(LLAVE, v);
    $$('[data-vista]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === v)));
    const c = $('#mas-cont', el);
    const n = c.cloneNode(false); c.replaceWith(n);
    if (v === 'usuarios') montarUsuarios(n, ctx, yo);
    else if (v === 'ajustes') montarAjustes(n, ctx, yo);
    else if (v === 'actividad') montarActividad(n);
    else montarCuenta(n, yo);
  }
  $('.segmentos', el)?.addEventListener('click', (e) => { const b = e.target.closest('[data-vista]'); if (b) poner(b.dataset.vista); });
  poner(vista);
}

// ---------- Mi cuenta ----------
async function montarCuenta(el, yo) {
  el.innerHTML = `<div class="enc-seccion"><h2>Mi cuenta</h2></div>
    <section class="tarjeta"><dl class="datos"><dt>Nombre</dt><dd>${esc(yo.nombre_completo)}</dd><dt>Correo</dt><dd>${esc(yo.email || api.usuarioAuth()?.email || '')}</dd>
      <dt>Rol</dt><dd>${esc(ROL[yo.rol] || yo.rol)}</dd></dl></section>
    <h3 class="sub-titulo">🔔 Notificaciones en este teléfono</h3>
    <section class="tarjeta" id="mc-push"><p class="cargando">Revisando…</p></section>
    <h3 class="sub-titulo">🔑 Cambiar contraseña</h3>
    <form class="tarjeta formulario" id="mc-pass" novalidate>
      ${campoPassword('mc-act', 'Contraseña actual', { auto: 'current-password' })}
      ${campoPassword('mc-nva', 'Contraseña nueva', { ayuda: 'Mínimo 8 caracteres. Mejor si combina letras y números.' })}
      ${campoPassword('mc-nva2', 'Repite la contraseña nueva')}
      <button class="btn" type="submit">Cambiar contraseña</button></form>
    <p class="pie"><a href="#/diagnostico">Diagnóstico</a> · versión ${esc(APP_VERSION)}</p>`;
  activarMostrar(el);
  const f = $('#mc-pass', el);
  f.addEventListener('submit', (e) => {
    e.preventDefault(); quitarError(f);
    const a = $('#mc-act', f).value, n = $('#mc-nva', f).value, n2 = $('#mc-nva2', f).value;
    if (!a) return mostrarError(f, 'Escribe tu contraseña actual.');
    if (n.length < 8) return mostrarError(f, 'La contraseña nueva debe tener al menos 8 caracteres.');
    if (n !== n2) return mostrarError(f, 'Las dos contraseñas nuevas no coinciden.');
    if (n === a) return mostrarError(f, 'La nueva contraseña debe ser distinta a la actual.');
    conOcupado($('button[type=submit]', f), async () => {
      try { await api.cambiarPassword(a, n); f.reset(); aviso('Contraseña cambiada. Úsala la próxima vez que entres.', 'ok', 6000); }
      catch (err) { mostrarError(f, err.message); }
    });
  });
  pintarPush($('#mc-push', el), yo);
}
async function pintarPush(c, yo) {
  const e = await estadoPush();
  const txt = {
    activo: '<p class="ok-txt"><b>Activadas.</b> Este teléfono recibe los avisos importantes (no se pudo, tareas vencidas, turnos sin abrir o cerrar, incidencias, pedidos…).</p>',
    apagado: '<p class="detalle">Activa las notificaciones para que los avisos lleguen al teléfono al momento, además del correo.</p>',
    bloqueado: '<p class="mal-txt">Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes del teléfono / navegador y vuelve aquí.</p>',
    instalar: '<p class="detalle">En iPhone, las notificaciones solo funcionan con la app instalada: toca <b>Compartir</b> → <b>Agregar a inicio</b>, abre PP Staff desde ese ícono y regresa aquí.</p>',
    no_soportado: `<p class="detalle">Este navegador no permite notificaciones.${esIOS() ? ' Usa Safari con la app instalada en inicio (iOS 16.4 o más nuevo).' : ''}</p>`,
  }[e];
  c.innerHTML = `${txt}${e === 'apagado' ? '<button type="button" class="btn" data-p="on">Activar notificaciones</button>' : ''}
    ${e === 'activo' ? '<div class="fila-botones"><button type="button" class="btn ghost" data-p="prueba">Mandar prueba</button><button type="button" class="btn peligro-suave" data-p="off">Desactivar</button></div>' : ''}`;
  c.onclick = (ev) => {
    const b = ev.target.closest('[data-p]');
    if (!b) return;
    conOcupado(b, async () => {
      try {
        if (b.dataset.p === 'on') { await activarPush(); aviso('Notificaciones activadas.', 'ok'); }
        else if (b.dataset.p === 'off') { await desactivarPush(); aviso('Notificaciones desactivadas en este teléfono.', 'ok'); }
        else { const r = await probarPush(); aviso(r.ok && r.enviados ? 'Prueba enviada. Debe llegar en unos segundos.' : 'No se pudo mandar la prueba.', r.ok && r.enviados ? 'ok' : 'error'); }
      } catch (err) { aviso(err.message, 'error', 8000); }
      pintarPush(c, yo);
    });
  };
}

// ---------- Actividad de gerencia (admin) ----------
const lunesDe = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fechaMes = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const ACCION = {
  turno_abierto: 'Turnos abiertos', turno_cerrado: 'Turnos cerrados', inv_export_subido: 'Exports de Loyverse', inv_pedido_verificado: 'Pedidos verificados',
  inv_conteo_revisado: 'Conteos revisados', inv_carga_confirmada: 'Cargas a Loyverse', tarea_plantilla_guardada: 'Tareas editadas', pendiente_creado: 'Pendientes creados',
  pendiente_resuelto: 'Pendientes resueltos', pendiente_editado: 'Pendientes editados', ajuste_cambiado: 'Ajustes', usuario_invitado: 'Invitaciones', tarea_excusada: 'Tareas excusadas',
};
async function montarActividad(el) {
  let desde = lunesDe(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }));
  el.innerHTML = `<p class="sub">Cuánto tiempo pasa cada persona de gerencia y administración en la app y cuántos cambios hace. Cada lunes llega por correo al administrador.</p>
    <div class="semana-nav"><button type="button" class="icono-btn" data-sem="-1" aria-label="Semana anterior">‹</button><b id="ac-tit"></b>
    <button type="button" class="icono-btn" data-sem="1" aria-label="Semana siguiente">›</button></div><div id="ac-cont"></div>`;
  const cont = $('#ac-cont', el);
  async function cargar() {
    const esta = desde === lunesDe(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }));
    $('#ac-tit', el).textContent = `${esta ? 'Esta semana · ' : ''}${fechaMes(desde)} al ${fechaMes(sumar(desde, 6))}`;
    $('[data-sem="1"]', el).disabled = esta;
    cont.innerHTML = '<p class="cargando">Cargando…</p>';
    let r;
    try { r = await api.rpc('actividad_semana', { p_desde: desde }); } catch (e) { cont.innerHTML = `<p class="detalle">${esc(e.message)}</p>`; return; }
    if (!r.ok) { cont.innerHTML = '<p class="detalle">Solo el administrador puede ver esto.</p>'; return; }
    const dias = Array.from({ length: 7 }, (_, i) => sumar(desde, i));
    const max = Math.max(30, ...r.personas.flatMap((p) => dias.map((d) => p.dias?.[d] || 0)));
    cont.innerHTML = r.personas.map((p) => `<section class="tarjeta"><div class="enc-avisos"><h2>${esc(p.nombre)}</h2><span class="sub">${esc(ROL[p.rol] || p.rol)}</span></div>
      <div class="cifras tres"><div><b>${esc(duracionTexto(p.minutos))}</b><span>En la app</span></div><div><b>${Object.keys(p.dias || {}).length}</b><span>Días que entró</span></div><div><b>${p.cambios}</b><span>Cambios</span></div></div>
      <div class="barras">${dias.map((d) => { const m = p.dias?.[d] || 0; return `<div class="barra-dia" title="${m} min"><span style="height:${Math.round((m / max) * 100)}%"></span><i>${new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'narrow', timeZone: 'UTC' })}</i></div>`; }).join('')}</div>
      ${Object.keys(p.acciones || {}).length ? `<p class="detalle">${Object.entries(p.acciones).map(([k, n]) => `${esc(ACCION[k] || k.replace(/_/g, ' '))}: <b>${n}</b>`).join(' · ')}</p>` : '<p class="detalle">Sin cambios esta semana.</p>'}</section>`).join('')
      || '<div class="tarjeta vacio"><p>No hay personas de gerencia o administración.</p></div>';
  }
  el.addEventListener('click', (e) => { const n = e.target.closest('[data-sem]'); if (n) { desde = sumar(desde, Number(n.dataset.sem) * 7); cargar(); } });
  cargar();
}
