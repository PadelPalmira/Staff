// Panel de administración y gerencia: barra superior, pestañas e Inicio.
import * as api from '../api.js';
import { APP_VERSION } from '../config.js';
import { esc, $, $$, ROL, avatar, hidratarAvatares, aviso, conOcupado, primerNombre } from '../ui.js';
import { montarUsuarios } from './usuarios.js';

const LLAVE_TAB = 'ppstaff-tab';

export function montarPanel(raiz, ctx, yo) {
  const esAdmin = yo.rol === 'admin';
  const tabs = esAdmin ? [['inicio', 'Inicio', '⌂'], ['usuarios', 'Usuarios', '☺']] : [['inicio', 'Inicio', '⌂']];
  let actual = api.leerLocal(LLAVE_TAB);
  if (!tabs.some((t) => t[0] === actual)) actual = 'inicio';

  raiz.innerHTML = `<div class="panel">
    <header class="barra">
      <div class="barra-izq"><div class="logo-chip chico" aria-hidden="true">PP</div>
        <div><b>PP Staff</b><span class="sub">${esc(ROL[yo.rol] || yo.rol)}</span></div></div>
      <div class="barra-der">${avatar(yo, 'sm')}<button type="button" class="enlace" data-salir>Salir</button></div>
    </header>
    <main class="contenido" id="contenido"></main>
    <nav class="tabs" aria-label="Secciones">${tabs.map(([id, txt, ico]) =>
      `<button type="button" data-tab="${id}" aria-current="${id === actual}"><span aria-hidden="true">${ico}</span>${txt}</button>`).join('')}</nav>
  </div>`;
  hidratarAvatares(raiz);
  $('[data-salir]', raiz).addEventListener('click', async () => { await api.salir(); api.guardarLocal(LLAVE_TAB, null); ctx.recargar(); });
  $('.tabs', raiz).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) ir(b.dataset.tab);
  });

  function ir(id) {
    actual = id;
    api.guardarLocal(LLAVE_TAB, id);
    $$('.tabs button', raiz).forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === id)));
    const cont = $('#contenido', raiz);
    const nuevo = cont.cloneNode(false); // quita los escuchas de la sección anterior
    cont.replaceWith(nuevo);
    if (id === 'usuarios') montarUsuarios(nuevo, ctx, yo);
    else montarInicio(nuevo);
    window.scrollTo(0, 0);
  }

  async function montarInicio(el) {
    el.innerHTML = `<h2 class="saludo">Hola, ${esc(primerNombre(yo.nombre_completo))}</h2>
      <section class="tarjeta"><h2>Resumen</h2><div id="resumen"><p class="cargando">Cargando…</p></div></section>
      <section class="tarjeta"><h2>Tareas y turnos</h2>
        <p class="detalle">Aquí vas a ver en vivo quién abrió turno, qué tareas faltan y las alertas. Esa parte llega en las siguientes versiones.</p></section>
      ${esAdmin ? `<section class="tarjeta"><h2>Correos</h2>
        <p class="detalle">Las invitaciones se mandan por correo desde Gmail. Manda una prueba a tu correo para confirmar que el envío funciona.</p>
        <button type="button" class="btn ghost" data-probar-correo>Enviar correo de prueba</button></section>` : ''}
      <p class="pie"><a href="#/diagnostico">Diagnóstico</a> · versión ${esc(APP_VERSION)}</p>`;
    $('[data-probar-correo]', el)?.addEventListener('click', (e) => conOcupado(e.currentTarget, async () => {
      try {
        const r = await api.funcion('probar_correo');
        if (!r.ok) return aviso(r.mensaje || 'No se pudo enviar la prueba.', 'error');
        if (r.correo.enviado) aviso(`Correo de prueba enviado a ${r.correo.destino}. Revisa tu bandeja.`, 'ok', 6000);
        else if (r.correo.error === 'sin_configurar') aviso('Falta configurar la cuenta de Gmail en el servidor (contraseña de aplicación).', 'error', 7000);
        else aviso(`Gmail no aceptó el envío: ${r.correo.error}`, 'error', 8000);
      } catch (err) { aviso(err.message, 'error'); }
    }));
    if (!esAdmin) { $('#resumen', el).innerHTML = '<p class="detalle">Bienvenida. Tu usuario de gerencia está activo.</p>'; return; }
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
        ${act.some((p) => !p.tiene_pin && p.rol !== 'dispositivo' && p.rol !== 'admin') ? '<p class="nota-aviso">Hay usuarios sin PIN. Asígnaselo en Usuarios.</p>' : ''}
        ${act.some((p) => p.rol === 'dispositivo') ? '' : '<p class="nota-aviso">Falta crear la cuenta del celular del club. Hazlo en Usuarios → Agregar → Crear usuario directamente.</p>'}`;
    } catch (e) { $('#resumen', el).innerHTML = `<p class="detalle">${esc(e.message)}</p>`; }
  }

  ir(actual);
}
