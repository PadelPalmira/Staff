// Registro de una persona invitada: nombre completo, correo (el de la invitación), celular, PIN y foto opcional.
import * as api from '../api.js';
import { esc, $, ROL, conOcupado, mostrarError, quitarError, soloNumeros, activarMostrar, campoPassword, campoPin,
         selectorFoto, pinValido, celularValido, MENSAJE_PIN, fechaCorta } from '../ui.js';

const pantalla = (cuerpo) => `<main class="pantalla centrada">
  <div class="marca"><div class="logo-chip" aria-hidden="true">PP</div><h1>PP Staff</h1><p class="sub">Padel Palmira</p></div>${cuerpo}</main>`;

export async function montarRegistro(raiz, ctx, token) {
  raiz.innerHTML = pantalla('<p class="cargando">Revisando tu invitación…</p>');
  let v;
  try { v = await api.funcion('validar_invitacion', { token }, { conSesion: false }); }
  catch (e) {
    raiz.innerHTML = pantalla(`<div class="tarjeta vacio"><p><b>Sin internet</b></p><p>Conéctate a internet para crear tu usuario.</p>
      <button class="btn ghost" data-reintentar>Volver a intentar</button></div>`);
    $('[data-reintentar]', raiz).addEventListener('click', () => montarRegistro(raiz, ctx, token));
    return;
  }
  if (!v.ok) {
    raiz.innerHTML = pantalla(`<div class="tarjeta vacio"><p><b>No se puede usar esta invitación</b></p><p>${esc(v.mensaje)}</p>
      <a class="btn ghost" href="#/">Ir al inicio</a></div>`);
    return;
  }
  const esGerencia = v.rol === 'gerencia';
  raiz.innerHTML = pantalla(`<form class="tarjeta formulario" id="f-reg" novalidate>
    <h2>Crea tu usuario</h2>
    <p class="detalle">Te invitaron como <b>${esc(ROL[v.rol] || v.rol)}</b>. Llena tus datos para entrar a PP Staff.</p>
    <div class="campo"><label for="r-nombre">Nombre completo</label>
      <input id="r-nombre" type="text" autocomplete="name" autocapitalize="words" placeholder="Nombre y apellido" required></div>
    <div class="campo"><label for="r-email">Correo</label>
      <input id="r-email" type="email" value="${esc(v.email)}" readonly>
      <p class="ayuda">Es el correo al que llegó la invitación.</p></div>
    <div class="campo"><label for="r-cel">Celular</label>
      <input id="r-cel" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="10 dígitos" required></div>
    ${campoPin('r-pin', 'PIN (4 números)', 'Con este PIN vas a entrar. No lo compartas.')}
    ${campoPin('r-pin2', 'Repite tu PIN')}
    ${esGerencia ? campoPassword('r-pass', 'Contraseña', { ayuda: 'Mínimo 8 caracteres. La usarás con tu correo para entrar a la app de gerencia.' }) : ''}
    <div class="campo"><label>Foto de perfil</label><div id="r-foto"></div></div>
    <button class="btn" type="submit">Crear mi usuario</button>
  </form>`);
  activarMostrar(raiz);
  soloNumeros(raiz);
  const form = $('#f-reg', raiz);
  const foto = selectorFoto($('#r-foto', raiz), { nombre: '' });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    quitarError(form);
    const nombre = $('#r-nombre', form).value.trim().replace(/\s+/g, ' ');
    const cel = $('#r-cel', form).value;
    const pin = $('#r-pin', form).value, pin2 = $('#r-pin2', form).value;
    const pass = esGerencia ? $('#r-pass', form).value : null;
    if (nombre.length < 3 || !nombre.includes(' ')) return mostrarError(form, 'Escribe tu nombre completo (nombre y apellido).');
    if (!celularValido(cel)) return mostrarError(form, 'El celular debe tener 10 dígitos.');
    if (!pinValido(pin)) return mostrarError(form, MENSAJE_PIN);
    if (pin !== pin2) return mostrarError(form, 'Los dos PIN no coinciden.');
    if (esGerencia && (pass || '').length < 8) return mostrarError(form, 'La contraseña debe tener al menos 8 caracteres.');
    await conOcupado($('button[type=submit]', form), async () => {
      try {
        const r = await api.funcion('registrar', { token, nombre_completo: nombre, celular: cel, pin, password: pass, foto: foto.valor() }, { conSesion: false });
        if (!r.ok) return mostrarError(form, r.mensaje || 'No se pudo crear el usuario.');
        exito(r);
      } catch (err) { mostrarError(form, err.message); }
    });
  });

  function exito(r) {
    raiz.innerHTML = pantalla(`<div class="tarjeta exito">
      <div class="palomita" aria-hidden="true">✓</div>
      <h2>¡Listo, ${esc(r.nombre_completo.split(' ')[0])}!</h2>
      <p>Tu usuario quedó creado.</p>
      <p class="detalle">${r.rol === 'gerencia'
        ? 'Para entrar, abre la app con tu correo y la contraseña que acabas de elegir.'
        : 'Para entrar, usa el celular del club: toca tu nombre y escribe tu PIN.'}</p>
      ${r.rol === 'gerencia' ? '<a class="btn" href="#/">Ir a entrar</a>' : '<a class="btn ghost" href="#/">Cerrar</a>'}</div>`);
  }
}
