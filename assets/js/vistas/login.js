// Pantalla de entrada con correo y contraseña (cuenta del celular del club, gerencia y administración).
import * as api from '../api.js';
import { APP_VERSION } from '../config.js';
import { esc, $, conOcupado, mostrarError, quitarError, activarMostrar, campoPassword } from '../ui.js';

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
    </form>
    <p class="pie">¿Eres recepcionista? Usa el celular del club: ahí entras con tu PIN.<br>
      <a href="#/diagnostico">Diagnóstico</a> · versión ${esc(APP_VERSION)}</p>
  </main>`;
  activarMostrar(raiz);
  const form = $('#f-login', raiz);
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
