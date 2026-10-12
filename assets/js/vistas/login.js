// Pantalla de entrada con correo y contraseña (cuenta del celular del club, gerencia y administración) + "olvidé mi contraseña".
import * as api from '../api.js';
import { APP_VERSION } from '../config.js';
import { esc, $, conOcupado, mostrarError, quitarError, activarMostrar, campoPassword, ventana } from '../ui.js';

export function montarLogin(raiz, ctx, { aviso = '' } = {}) {
  raiz.innerHTML = `<main class="pantalla centrada">
    <div class="marca"><div class="logo-chip" aria-hidden="true">PP</div><h1>PP Staff</h1><p class="sub">Padel Palmira</p></div>
    <form class="tarjeta formulario" id="f-login" novalidate>
      <h2>Entrar</h2>
      ${aviso ? `<p class="nota-info">${esc(aviso)}</p>` : ''}
      <div class="campo"><label for="l-email">Correo</label>
        <input id="l-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required></div>
      ${campoPassword('l-pass', 'Contraseña', { auto: 'current-password' })}
      <button class="btn" type="submit">Entrar</button>
      <button type="button" class="enlace" data-olvide style="margin-top:8px">¿Olvidaste tu contraseña?</button>
    </form>
    <p class="pie">¿Eres recepcionista? Usa el celular del club: ahí entras con tu PIN.<br>
      <a href="#/diagnostico">Diagnóstico</a> · versión ${esc(APP_VERSION)}</p>
  </main>`;
  activarMostrar(raiz);
  const form = $('#f-login', raiz);
  $('[data-olvide]', raiz).addEventListener('click', () => {
    const v = ventana(`<form class="formulario" novalidate>
      <p class="detalle" style="margin-top:0">Escribe el correo con el que entras. Te mandamos un enlace para elegir una contraseña nueva (vence en 1 hora).</p>
      <div class="campo"><label for="o-email">Correo</label><input id="o-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc($('#l-email', form).value.trim())}"></div>
      <button class="btn" type="submit">Mandar enlace</button></form>`, { titulo: 'Restablecer contraseña' });
    const f = $('form', v.el);
    f.addEventListener('submit', (e) => {
      e.preventDefault(); quitarError(f);
      const email = $('#o-email', f).value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return mostrarError(f, 'Escribe un correo válido.');
      conOcupado($('button[type=submit]', f), async () => {
        try {
          const r = await api.funcion('recuperar', { email }, { conSesion: false, fn: 'cuentas' });
          if (!r.ok) return mostrarError(f, r.mensaje || 'No se pudo mandar el enlace.');
          v.poner(`<div class="exito"><div class="palomita" aria-hidden="true">✉️</div><h2>Revisa tu correo</h2>
            <p class="detalle">Si <b>${esc(email)}</b> tiene cuenta en PP Staff, te llegó un correo de “Padel Palmira Staff” con el enlace. Revisa también la carpeta de spam.</p>
            <p class="ayuda">Si no tienes acceso a ese correo, pide al administrador que te ponga una contraseña nueva.</p>
            <button type="button" class="btn" data-cerrar>Listo</button></div>`);
        } catch (err) { mostrarError(f, err.message); }
      });
    });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    quitarError(form);
    const email = $('#l-email', form).value.trim();
    const pass = $('#l-pass', form).value;
    if (!email || !pass) return mostrarError(form, 'Escribe tu correo y tu contraseña.');
    await conOcupado($('button[type=submit]', form), async () => {
      try {
        await api.entrar(email, pass);
        ctx.recargar();
      } catch (err) { mostrarError(form, err.message); }
    });
  });
}
