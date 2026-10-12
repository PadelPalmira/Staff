// Elegir contraseña nueva desde el enlace del correo "Restablecer contraseña" (#/restablecer/<token>).
import * as api from '../api.js';
import { $, conOcupado, mostrarError, quitarError, activarMostrar, campoPassword } from '../ui.js';

const pantalla = (cuerpo) => `<main class="pantalla centrada">
  <div class="marca"><div class="logo-chip" aria-hidden="true">PP</div><h1>PP Staff</h1><p class="sub">Padel Palmira</p></div>${cuerpo}</main>`;

export function montarRestablecer(raiz, ctx, token) {
  raiz.innerHTML = pantalla(`<form class="tarjeta formulario" id="f-rest" novalidate>
    <h2>Contraseña nueva</h2>
    <p class="detalle">Elige tu contraseña nueva para entrar a PP Staff.</p>
    ${campoPassword('r-pass', 'Contraseña nueva', { ayuda: 'Mínimo 8 caracteres. Mejor si combina letras y números.' })}
    ${campoPassword('r-pass2', 'Repite la contraseña')}
    <button class="btn" type="submit">Guardar y entrar</button>
  </form>`);
  activarMostrar(raiz);
  const f = $('#f-rest', raiz);
  f.addEventListener('submit', (e) => {
    e.preventDefault(); quitarError(f);
    const a = $('#r-pass', f).value, b = $('#r-pass2', f).value;
    if (a.length < 8) return mostrarError(f, 'La contraseña debe tener al menos 8 caracteres.');
    if (a !== b) return mostrarError(f, 'Las dos contraseñas no coinciden.');
    conOcupado($('button[type=submit]', f), async () => {
      try {
        await api.restablecerPassword(token, a);
        raiz.innerHTML = pantalla(`<div class="tarjeta exito"><div class="palomita" aria-hidden="true">✓</div><h2>¡Listo!</h2>
          <p class="detalle">Tu contraseña quedó cambiada y ya entraste.</p><button class="btn" data-entrar>Ir a PP Staff</button></div>`);
        $('[data-entrar]', raiz).addEventListener('click', () => { location.hash = '#/'; ctx.recargar(); });
      } catch (err) {
        mostrarError(f, err.message);
        if (err.codigo === 'enlace_vencido') $('button[type=submit]', f).insertAdjacentHTML('afterend', '<a class="btn ghost" href="#/" style="margin-top:10px">Ir a entrar</a>');
      }
    });
  });
}
