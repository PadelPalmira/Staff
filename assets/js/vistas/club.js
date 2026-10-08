// Celular del club: cuenta compartida siempre abierta -> nombres grandes -> PIN -> inicio de cada persona.
// También sirve para "Entrar como" del administrador (sin PIN, con aviso arriba).
import * as api from '../api.js';
import { APP_VERSION } from '../config.js';
import { esc, $, $$, avatar, hidratarAvatares, aviso, primerNombre, horaCorta } from '../ui.js';

const LLAVE_PIN = 'ppstaff-pin';
const LLAVE_PERSONAL = 'ppstaff-personal';

export function montarClub(raiz, ctx) {
  return crearClub(raiz, ctx, { porAdmin: false });
}
export function montarComoUsuario(raiz, ctx, { token, perfil }) {
  return crearClub(raiz, ctx, { porAdmin: true, inicial: { token, perfil } });
}

async function crearClub(raiz, ctx, { porAdmin, inicial }) {
  let token = null, perfil = null, minutos = 60, ultimaActividad = Date.now(), ultimoToque = 0, cerrado = false;
  const limpiezas = [];
  ctx.alDesmontar(() => { cerrado = true; limpiezas.forEach((f) => f()); });

  // ---------- selector de usuario ----------
  async function pantallaSelector() {
    raiz.innerHTML = `<main class="pantalla">
      <header class="cab-club"><div class="logo-chip chico" aria-hidden="true">PP</div><div><h1>¿Quién eres?</h1><p class="sub">Toca tu nombre</p></div></header>
      <div class="tiles" id="tiles"><p class="cargando">Cargando…</p></div>
      <p class="pie"><a href="#/diagnostico">Diagnóstico</a> · versión ${esc(APP_VERSION)}</p></main>`;
    let personal = null, sinRed = false;
    try { personal = await api.rpc('listar_personal'); api.guardarLocal(LLAVE_PERSONAL, personal); }
    catch (e) {
      if (e.codigo === 'sin_sesion') return ctx.recargar();
      sinRed = true; personal = api.leerLocal(LLAVE_PERSONAL) || [];
    }
    if (cerrado) return;
    const cont = $('#tiles', raiz);
    if (!personal.length) {
      cont.innerHTML = `<div class="tarjeta vacio"><p><b>${sinRed ? 'Sin internet.' : 'Aún no hay usuarios.'}</b></p>
        <p>${sinRed ? 'Conecta el celular a internet y vuelve a intentar.' : 'Pide al administrador que invite a las recepcionistas.'}</p>
        <button class="btn ghost" data-reintentar>Volver a intentar</button></div>`;
      $('[data-reintentar]', cont).addEventListener('click', pantallaSelector);
      return;
    }
    cont.innerHTML = personal.map((p) => `<button type="button" class="tile-usuario" data-id="${esc(p.id)}">
        ${avatar(p, 'xxl')}<span class="tile-nombre">${esc(p.nombre_completo)}</span>
        ${!p.tiene_pin ? '<span class="insignia aviso-i">Sin PIN</span>' : (p.bloqueado ? '<span class="insignia mal">Bloqueado</span>' : '')}</button>`).join('');
    hidratarAvatares(cont);
    cont.addEventListener('click', (e) => {
      const b = e.target.closest('.tile-usuario');
      if (!b) return;
      const p = personal.find((x) => x.id === b.dataset.id);
      if (!p.tiene_pin) return aviso('Esta persona todavía no tiene PIN. Pide al administrador que lo asigne.', 'error');
      pantallaPin(p);
    });
  }

  // ---------- PIN ----------
  function pantallaPin(p) {
    let pin = '', ocupado = false;
    raiz.innerHTML = `<main class="pantalla centrada pin-pantalla">
      <button type="button" class="enlace atras" data-volver>← No soy yo</button>
      <div class="pin-quien">${avatar(p, 'xxl')}<h2>${esc(primerNombre(p.nombre_completo))}</h2><p class="sub">Escribe tu PIN</p></div>
      <div class="pin-puntos" id="puntos" aria-label="PIN"><span></span><span></span><span></span><span></span></div>
      <p class="msg-pin" id="msg-pin" role="alert"></p>
      <div class="teclado" id="teclado">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}
        <span></span><button type="button" data-n="0">0</button><button type="button" data-borrar aria-label="Borrar">⌫</button>
      </div></main>`;
    hidratarAvatares(raiz);
    const puntos = $$('#puntos span', raiz), msg = $('#msg-pin', raiz);
    const pintar = () => puntos.forEach((s, i) => s.classList.toggle('lleno', i < pin.length));
    const falla = (texto) => {
      msg.textContent = texto; pin = ''; pintar();
      const pp = $('#puntos', raiz); pp.classList.remove('sacude'); void pp.offsetWidth; pp.classList.add('sacude');
    };
    async function enviar() {
      ocupado = true; msg.textContent = '';
      try {
        const r = await api.rpc('pin_login', { p_perfil_id: p.id, p_pin: pin });
        if (cerrado) return;
        if (r.ok) { quitar(); token = r.token; perfil = r.perfil; api.guardarLocal(LLAVE_PIN, { token, perfil }); return pantallaInicio(); }
        if (r.error === 'pin_incorrecto') falla(r.intentos_restantes === 1 ? 'PIN incorrecto. Te queda 1 intento.' : `PIN incorrecto. Te quedan ${r.intentos_restantes} intentos.`);
        else if (r.error === 'bloqueado') falla(`Demasiados intentos. Prueba de nuevo a las ${horaCorta(r.hasta)} o pide al administrador que te lo desbloquee.`);
        else if (r.error === 'sin_pin') falla('Todavía no tienes PIN. Pide al administrador que lo asigne.');
        else falla('Este usuario ya no está disponible.');
      } catch (e) {
        if (e.codigo === 'sin_sesion') return ctx.recargar();
        falla(e.codigo === 'sin_conexion' ? 'Sin internet. Revisa la conexión e intenta de nuevo.' : e.message);
      } finally { ocupado = false; }
    }
    function tecla(n) {
      if (ocupado || pin.length >= 4) return;
      pin += n; pintar(); msg.textContent = '';
      if (pin.length === 4) enviar();
    }
    $('#teclado', raiz).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-borrar')) { if (!ocupado) { pin = pin.slice(0, -1); pintar(); } } else tecla(b.dataset.n);
    });
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) tecla(e.key);
      else if (e.key === 'Backspace' && !ocupado) { pin = pin.slice(0, -1); pintar(); }
    };
    document.addEventListener('keydown', onKey);
    const quitar = () => document.removeEventListener('keydown', onKey);
    limpiezas.push(quitar);
    $('[data-volver]', raiz).addEventListener('click', () => { quitar(); pantallaSelector(); });
  }

  // ---------- inicio de la persona ----------
  function pantallaInicio() {
    ultimaActividad = Date.now();
    const hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });
    raiz.innerHTML = `<main class="pantalla">
      ${porAdmin ? `<div class="banda-admin"><span>Estás viendo la app como <b>${esc(perfil.nombre_completo)}</b> (entraste como administrador, sin PIN)</span>
        <button type="button" class="btn chico" data-volver-admin>Volver a administración</button></div>` : ''}
      <header class="cab-inicio">${avatar(perfil, 'lg')}
        <div><h1>Hola, ${esc(primerNombre(perfil.nombre_completo))}</h1><p class="sub">${esc(hoy)}</p></div></header>
      <section class="tarjeta"><h2>Tu turno</h2>
        <p class="detalle">Aquí vas a abrir tu turno, marcar tus tareas y ver los pendientes. Esa parte llega en la siguiente versión.</p></section>
      <section class="tarjeta"><h2>Tu usuario</h2>
        <p class="detalle">Si terminaste, sal de tu usuario para que la siguiente persona pueda entrar. La app también se cierra sola después de ${minutos} minutos sin usarla.</p></section>
      <button type="button" class="btn grande salir-usuario" data-salir>Salir de mi usuario</button>
      <p class="pie"><a href="#/diagnostico">Diagnóstico</a> · versión ${esc(APP_VERSION)}</p></main>`;
    hidratarAvatares(raiz);
    $('[data-salir]', raiz).addEventListener('click', () => cerrarUsuario('manual'));
    $('[data-volver-admin]', raiz)?.addEventListener('click', () => cerrarUsuario('admin'));
    vigilarInactividad();
  }

  async function cerrarUsuario(motivo) {
    const t = token;
    token = null; perfil = null;
    limpiezas.splice(0).forEach((f) => f());
    api.guardarLocal(LLAVE_PIN, null);
    if (t) api.rpc('sesion_cerrar', { p_token: t }).catch(() => null);
    if (motivo === 'admin') return ctx.volverAdmin();
    if (motivo === 'inactividad') aviso('Tu usuario se cerró por inactividad.', 'info', 5000);
    else if (motivo === 'expirada') aviso('Tu sesión terminó. Vuelve a entrar con tu PIN.', 'info', 5000);
    else aviso('Saliste de tu usuario.', 'ok', 2500);
    if (!cerrado) pantallaSelector();
  }

  function vigilarInactividad() {
    const marcar = async () => {
      ultimaActividad = Date.now();
      if (Date.now() - ultimoToque < 60000 || !token) return;
      ultimoToque = Date.now();
      try {
        const r = await api.rpc('sesion_info', { p_token: token });
        if (!r.ok && !cerrado) cerrarUsuario('expirada');
        else if (r.ok) minutos = r.minutos_inactividad || minutos;
      } catch { /* sin internet: se sigue y el servidor validará después */ }
    };
    const eventos = ['pointerdown', 'keydown', 'scroll'];
    eventos.forEach((ev) => document.addEventListener(ev, marcar, { passive: true }));
    const reloj = setInterval(() => {
      if (token && Date.now() - ultimaActividad > minutos * 60000) cerrarUsuario('inactividad');
    }, 20000);
    const visible = async () => {
      if (document.visibilityState !== 'visible' || !token) return;
      if (Date.now() - ultimaActividad > minutos * 60000) return cerrarUsuario('inactividad');
      try { const r = await api.rpc('sesion_info', { p_token: token }); if (!r.ok) cerrarUsuario('expirada'); } catch { /* sin internet */ }
    };
    document.addEventListener('visibilitychange', visible);
    limpiezas.push(() => {
      eventos.forEach((ev) => document.removeEventListener(ev, marcar));
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', visible);
    });
  }

  // ---------- arranque ----------
  if (inicial) { token = inicial.token; perfil = inicial.perfil; return pantallaInicio(); }
  const guardada = api.leerLocal(LLAVE_PIN);
  if (guardada?.token) {
    try {
      const r = await api.rpc('sesion_info', { p_token: guardada.token });
      if (cerrado) return;
      if (r.ok) { token = guardada.token; perfil = r.perfil; minutos = r.minutos_inactividad || 60; return pantallaInicio(); }
    } catch (e) {
      if (e.codigo === 'sin_conexion' && guardada.perfil) { token = guardada.token; perfil = guardada.perfil; return pantallaInicio(); }
    }
    api.guardarLocal(LLAVE_PIN, null);
  }
  pantallaSelector();
}
