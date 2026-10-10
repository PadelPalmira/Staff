// Panel de administración y gerencia: barra superior, pestañas e Inicio.
import * as api from '../api.js';
import { APP_VERSION } from '../config.js';
import { esc, $, $$, ROL, avatar, hidratarAvatares, aviso, conOcupado, primerNombre } from '../ui.js';
import { montarTurnos, pintarEnVivo, verTurno, pintarAvisos, contarAvisos } from './turnos.js';
import { montarTareasAdmin } from './tareas_admin.js';
import { montarInventario } from './inventario.js';
import { montarPendientes, contarPendientesGestion } from './pendientes.js';
import { montarMas } from './mas.js';

const LLAVE_TAB = 'ppstaff-tab';

export function montarPanel(raiz, ctx, yo) {
  const esAdmin = yo.rol === 'admin';
  const tabs = [['inicio', 'Inicio', '⌂'], ['turnos', 'Turnos', '◷'], ['tareas', 'Tareas', '✓'], ['pendientes', 'Pendientes', '📌'], ['inventario', 'Inventario', '▤'], ['mas', 'Más', '☰']];
  let actual = api.leerLocal(LLAVE_TAB);
  if (actual === 'usuarios' || actual === 'ajustes') { api.guardarLocal('ppstaff-mas-vista', actual); actual = 'mas'; }
  if (!tabs.some((t) => t[0] === actual)) actual = 'inicio';

  raiz.innerHTML = `<div class="panel">
    <header class="barra">
      <div class="barra-izq"><div class="logo-chip chico" aria-hidden="true">PP</div>
        <div><b>PP Staff</b><span class="sub">${esc(ROL[yo.rol] || yo.rol)}</span></div></div>
      <div class="barra-der">${avatar(yo, 'sm')}<button type="button" class="enlace" data-salir>Salir</button></div>
    </header>
    <main class="contenido" id="contenido"></main>
    <nav class="tabs" aria-label="Secciones">${tabs.map(([id, txt, ico]) =>
      `<button type="button" data-tab="${id}" aria-current="${id === actual}"><span aria-hidden="true">${ico}</span>${txt}${id === 'mas' ? '<i class="punto-aviso" data-badge hidden></i>' : ''}${id === 'inicio' ? '<i class="punto-aviso amarillo" data-badge-avisos hidden></i>' : ''}${id === 'pendientes' ? '<i class="punto-aviso amarillo" data-badge-pend hidden></i>' : ''}</button>`).join('')}</nav>
  </div>`;
  hidratarAvatares(raiz);
  $('[data-salir]', raiz).addEventListener('click', async () => { await api.salir(); api.guardarLocal(LLAVE_TAB, null); ctx.recargar(); });
  $('.tabs', raiz).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) ir(b.dataset.tab);
  });

  // Aviso de solicitudes pendientes: punto en la pestaña Usuarios y tarjeta en Inicio (se revisa cada 30 s)
  let pendientes = 0;
  async function revisarSolicitudes() {
    if (!esAdmin || document.visibilityState !== 'visible') return;
    try {
      const l = await api.seleccionar('solicitudes_usuario', 'select=id&estado=eq.pendiente');
      if (l.length === pendientes) return;
      pendientes = l.length;
      const b = $('[data-badge]', raiz);
      if (b) { b.hidden = !pendientes; b.textContent = pendientes ? String(pendientes) : ''; }
      const t = $('#tarjeta-solicitudes', raiz);
      if (t) pintarSolicitudes(t);
    } catch { /* sin internet: se vuelve a intentar */ }
  }
  function pintarSolicitudes(t) {
    t.hidden = !pendientes;
    t.innerHTML = pendientes ? `<h2>Solicitudes de usuario</h2><p class="detalle">${pendientes === 1 ? 'Alguien pidió' : `${pendientes} personas pidieron`} un usuario desde el celular del club.</p>
      <button type="button" class="btn" data-ver-solicitudes>Revisar solicitudes (${pendientes})</button>` : '';
    $('[data-ver-solicitudes]', t)?.addEventListener('click', () => ir('mas', { vista: 'usuarios' }));
  }
  if (esAdmin) {
    const reloj = setInterval(revisarSolicitudes, 30000);
    const forzar = () => { pendientes = -1; revisarSolicitudes(); };
    document.addEventListener('visibilitychange', revisarSolicitudes);
    document.addEventListener('ppstaff-solicitudes', forzar);
    ctx.alDesmontar(() => { clearInterval(reloj); document.removeEventListener('visibilitychange', revisarSolicitudes); document.removeEventListener('ppstaff-solicitudes', forzar); });
  }

  // Avisos ("No se pudo", etc.): punto amarillo en Inicio, revisado cada 30 s
  async function revisarAvisos() {
    if (document.visibilityState !== 'visible') return;
    try {
      const n = await contarAvisos();
      const b = $('[data-badge-avisos]', raiz);
      if (b) { b.hidden = !n; b.textContent = n ? String(n) : ''; }
    } catch { /* sin internet */ }
  }
  async function revisarPendientes() {
    if (document.visibilityState !== 'visible') return;
    try {
      const n = await contarPendientesGestion();
      const b = $('[data-badge-pend]', raiz);
      if (b) { b.hidden = !n; b.textContent = n ? String(n) : ''; }
    } catch { /* sin internet */ }
  }
  // Minutos de uso (reporte de actividad de gerencia): un aviso por minuto mientras la app está en pantalla
  const ping = () => { if (document.visibilityState === 'visible') api.rpc('actividad_ping').catch(() => null); };
  const relojAvisos = setInterval(() => { revisarAvisos(); revisarPendientes(); }, 30000);
  const relojPing = setInterval(ping, 60000);
  const alVer = () => { revisarAvisos(); revisarPendientes(); ping(); };
  document.addEventListener('visibilitychange', alVer);
  document.addEventListener('ppstaff-pendientes', revisarPendientes);
  ctx.alDesmontar(() => { clearInterval(relojAvisos); clearInterval(relojPing); document.removeEventListener('visibilitychange', alVer); document.removeEventListener('ppstaff-pendientes', revisarPendientes); });
  revisarAvisos(); revisarPendientes(); ping();

  function ir(id, opciones = {}) {
    actual = id;
    api.guardarLocal(LLAVE_TAB, id);
    $$('.tabs button', raiz).forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === id)));
    const cont = $('#contenido', raiz);
    const nuevo = cont.cloneNode(false); // quita los escuchas de la sección anterior
    cont.replaceWith(nuevo);
    if (id === 'mas') montarMas(nuevo, ctx, yo, opciones);
    else if (id === 'turnos') montarTurnos(nuevo, ctx, yo);
    else if (id === 'tareas') montarTareasAdmin(nuevo, ctx, yo);
    else if (id === 'pendientes') montarPendientes(nuevo, ctx, yo);
    else if (id === 'inventario') montarInventario(nuevo, ctx, yo);
    else montarInicio(nuevo);
    window.scrollTo(0, 0);
  }

  async function montarInicio(el) {
    el.innerHTML = `<h2 class="saludo">Hola, ${esc(primerNombre(yo.nombre_completo))}</h2>
      ${esAdmin ? '<section class="tarjeta tarjeta-solicitud" id="tarjeta-solicitudes" hidden></section>' : ''}
      <section class="tarjeta tarjeta-avisos" id="tarjeta-avisos" hidden></section>
      <section class="tarjeta"><h2>Turnos de hoy</h2><div id="en-vivo" class="lista"></div></section>
      <section class="tarjeta" id="ini-pend" hidden></section>
      <section class="tarjeta"><h2>Resumen</h2><div id="resumen"><p class="cargando">Cargando…</p></div></section>
      <p class="pie"><a href="#/diagnostico">Diagnóstico</a> · versión ${esc(APP_VERSION)}</p>`;
    const vivo = $('#en-vivo', el), tAvisos = $('#tarjeta-avisos', el);
    const tPend = $('#ini-pend', el);
    const pintarPend = async () => {
      try {
        const l = await api.seleccionar('pendientes', 'select=tipo,estado,prioridad,creado_en,fecha_limite&estado=in.(abierto,en_proceso,solicita_cierre)&limit=300');
        const n = (f) => l.filter(f).length;
        tPend.hidden = !l.length;
        tPend.innerHTML = `<div class="enc-avisos"><h2>📌 Pendientes</h2><button type="button" class="enlace" data-ir-pend>Ver todo</button></div>
          <div class="cifras"><div><b>${n((p) => p.tipo === 'pendiente')}</b><span>Pendientes</span></div><div><b class="${n((p) => p.tipo === 'incidencia') ? 'warn-txt' : ''}">${n((p) => p.tipo === 'incidencia')}</b><span>Incidencias</span></div>
          <div><b>${n((p) => p.tipo === 'solicitud')}</b><span>Solicitudes</span></div><div><b class="${n((p) => p.estado === 'solicita_cierre') ? 'ok-txt' : ''}">${n((p) => p.estado === 'solicita_cierre')}</b><span>Piden cerrar</span></div></div>`;
      } catch { tPend.hidden = true; }
    };
    tPend.addEventListener('click', (e) => { if (e.target.closest('[data-ir-pend]')) ir('pendientes'); });
    const refrescar = () => { pintarEnVivo(vivo); pintarAvisos(tAvisos, yo, refrescar); revisarAvisos(); pintarPend(); };
    refrescar();
    vivo.addEventListener('click', (e) => { const b = e.target.closest('[data-turno]'); if (b) verTurno(b.dataset.turno, yo, refrescar); });
    const reloj = setInterval(() => { if (document.visibilityState === 'visible' && el.isConnected) refrescar(); }, 30000);
    ctx.alDesmontar(() => clearInterval(reloj));
    if (esAdmin) { pendientes = -1; revisarSolicitudes(); }
    if (!esAdmin) { $('#resumen', el).closest('section').remove(); return; }
    try {
      const [perfiles, inv] = await Promise.all([
        api.seleccionar('perfiles', 'select=rol,estado,tiene_pin'),
        api.seleccionar('invitaciones', 'select=id&estado=eq.pendiente'),
      ]);
      const act = perfiles.filter((p) => p.estado === 'activo');
      const n = (r) => act.filter((p) => p.rol === r).length;
      $('#resumen', el).innerHTML = `<div class="cifras">
        <div><b>${n('recepcion')}</b><span>Recepción</span></div><div><b>${n('gerencia')}</b><span>Gerencia</span></div>
        <div><b>${n('admin')}</b><span>Admin</span></div><div><b>${inv.length}</b><span>Invitaciones</span></div></div>
        ${act.some((p) => !p.tiene_pin && p.rol !== 'dispositivo' && p.rol !== 'admin') ? '<p class="nota-aviso">Hay usuarios sin PIN. Asígnaselo en Más → Usuarios.</p>' : ''}
        ${act.some((p) => p.rol === 'dispositivo') ? '' : '<p class="nota-aviso">Falta crear la cuenta del celular del club. Hazlo en Más → Usuarios → Agregar → Crear usuario directamente.</p>'}`;
    } catch (e) { $('#resumen', el).innerHTML = `<p class="detalle">${esc(e.message)}</p>`; }
  }

  ir(actual);
  if (esAdmin) { pendientes = -1; revisarSolicitudes(); }
}
