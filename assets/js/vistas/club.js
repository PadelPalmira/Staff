// Celular del club: cuenta compartida siempre abierta -> nombres grandes -> PIN -> inicio de cada persona.
// También sirve para "Entrar como" del administrador (sin PIN, con aviso arriba).
import * as api from '../api.js';
import { APP_VERSION } from '../config.js';
import { montarEmpleado } from './empleado.js';
import { enviarCola, cola } from '../cola.js';
import { estadoPush, activarPush } from '../push.js';
import { esc, $, $$, avatar, hidratarAvatares, aviso, primerNombre, horaCorta, ventana, conOcupado, selectorFoto,
         campoPin, activarMostrar, soloNumeros, pinValido, celularValido, MENSAJE_PIN, mostrarError, quitarError } from '../ui.js';

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

  // Marcas hechas sin internet: se mandan solas al volver la señal (aunque la persona ya haya salido)
  const mandarCola = async () => {
    if (!navigator.onLine || !cola().length) return;
    const r = await enviarCola();
    if (r?.enviadas && !token) aviso(r.enviadas === 1 ? 'Se envió la marca que estaba guardada sin internet.' : `Se enviaron ${r.enviadas} marcas que estaban guardadas sin internet.`, 'ok', 5000);
  };
  window.addEventListener('online', mandarCola);
  const relojCola = setInterval(mandarCola, 60000);
  ctx.alDesmontar(() => { window.removeEventListener('online', mandarCola); clearInterval(relojCola); });
  mandarCola();

  // ---------- selector de usuario ----------
  async function pantallaSelector() {
    raiz.innerHTML = `<main class="pantalla">
      <header class="cab-club"><div class="logo-chip chico" aria-hidden="true">PP</div><div><h1>¿Quién eres?</h1><p class="sub">Toca tu nombre</p></div>
        ${porAdmin ? '' : '<button type="button" class="btn-mas" data-pedir aria-label="Pedir un usuario nuevo" title="Pedir un usuario nuevo">＋</button>'}</header>
      <div class="tiles" id="tiles"><p class="cargando">Cargando…</p></div>
      <p class="pie"><a href="#/diagnostico">Diagnóstico</a> · versión ${esc(APP_VERSION)}${porAdmin ? '' : ' · <button type="button" class="enlace" data-push hidden>🔔 Activar avisos en este celular</button>'}</p></main>`;
    $('[data-pedir]', raiz)?.addEventListener('click', ventanaSolicitud);
    const bp = $('[data-push]', raiz);
    if (bp) {
      estadoPush().then((e) => { if (bp.isConnected) bp.hidden = e === 'activo' || e === 'no_soportado'; });
      bp.addEventListener('click', () => conOcupado(bp, async () => {
        try { await activarPush(); aviso('Listo: este celular va a recibir recordatorios y avisos de tareas vencidas.', 'ok', 6000); bp.hidden = true; }
        catch (err) { aviso(err.message, 'error', 8000); }
      }));
    }
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
        <p>${sinRed ? 'Conecta el celular a internet y vuelve a intentar.' : 'Toca el botón para pedir tu usuario. El administrador lo revisa y, si lo aprueba, ya puedes entrar.'}</p>
        ${sinRed || porAdmin ? '' : '<button class="btn" data-pedir-vacio>＋ Pedir mi usuario</button>'}
        <button class="btn ghost" data-reintentar>Volver a intentar</button></div>`;
      $('[data-reintentar]', cont).addEventListener('click', pantallaSelector);
      $('[data-pedir-vacio]', cont)?.addEventListener('click', ventanaSolicitud);
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

  // ---------- pedir un usuario nuevo ----------
  function ventanaSolicitud() {
    const v = ventana(`<form class="formulario" id="f-sol" novalidate>
      <p class="detalle">Llena tus datos. El administrador recibe la solicitud y, cuando la apruebe, tu nombre aparecerá en esta pantalla.</p>
      <div class="campo"><label for="s-nombre">Nombre completo</label>
        <input id="s-nombre" type="text" autocomplete="off" autocapitalize="words" placeholder="Nombre y apellido" required></div>
      <div class="campo"><label for="s-email">Correo</label>
        <input id="s-email" type="email" inputmode="email" autocapitalize="off" spellcheck="false" autocomplete="off" placeholder="nombre@correo.com" required></div>
      <div class="campo"><label for="s-cel">Celular</label>
        <input id="s-cel" type="tel" inputmode="numeric" autocomplete="off" placeholder="10 dígitos" required></div>
      ${campoPin('s-pin', 'PIN (4 números)', 'Con este PIN vas a entrar. No lo compartas.')}
      ${campoPin('s-pin2', 'Repite tu PIN')}
      <div class="campo"><label>Foto de perfil</label><div id="s-foto"></div></div>
      <button class="btn" type="submit">Enviar solicitud</button></form>`, { titulo: 'Pedir un usuario' });
    activarMostrar(v.el);
    soloNumeros(v.el);
    const form = $('#f-sol', v.el);
    const foto = selectorFoto($('#s-foto', v.el), { nombre: '' });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); quitarError(form);
      const nombre = $('#s-nombre', form).value.trim().replace(/\s+/g, ' ');
      const email = $('#s-email', form).value.trim();
      const cel = $('#s-cel', form).value;
      const pin = $('#s-pin', form).value, pin2 = $('#s-pin2', form).value;
      if (nombre.length < 3 || !nombre.includes(' ')) return mostrarError(form, 'Escribe tu nombre completo (nombre y apellido).');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return mostrarError(form, 'Escribe un correo válido.');
      if (!celularValido(cel)) return mostrarError(form, 'El celular debe tener 10 dígitos.');
      if (!pinValido(pin)) return mostrarError(form, MENSAJE_PIN);
      if (pin !== pin2) return mostrarError(form, 'Los dos PIN no coinciden.');
      await conOcupado($('button[type=submit]', form), async () => {
        try {
          const r = await api.funcion('solicitar', { nombre_completo: nombre, email, celular: cel, pin, foto: foto.valor() });
          if (!r.ok) return mostrarError(form, r.mensaje || 'No se pudo enviar la solicitud.');
          v.poner(`<div class="exito"><div class="palomita" aria-hidden="true">✓</div>
            <h2>¡Solicitud enviada, ${esc(primerNombre(r.nombre_completo))}!</h2>
            <p class="detalle">El administrador la va a revisar. Cuando la apruebe, tu nombre aparecerá en esta pantalla y podrás entrar con tu PIN.</p>
            <button type="button" class="btn" data-cerrar>Listo</button></div>`);
        } catch (err) { mostrarError(form, err.codigo === 'sin_conexion' ? 'Sin internet. Revisa la conexión e intenta de nuevo.' : err.message); }
      });
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
    const emp = montarEmpleado(raiz, {
      token, perfil, porAdmin,
      alSalir: () => cerrarUsuario('manual'),
      alVolverAdmin: () => cerrarUsuario('admin'),
      alSesionInvalida: () => cerrarUsuario('expirada'),
    });
    limpiezas.push(emp.destruir);
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
