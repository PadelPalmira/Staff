// PP Staff · arranque y rutas.
//   #/registro/<token>  -> registro de una persona invitada (sin cuenta)
//   #/restablecer/<t>   -> contraseña nueva desde el enlace del correo
//   #/diagnostico       -> prueba del teléfono
//   (cualquier otra)    -> según la cuenta: celular del club (PIN) o panel de admin/gerencia
import * as api from './api.js';
import { esc, avisoConAccion } from './ui.js';
import { montarLogin } from './vistas/login.js';
import { montarClub, montarComoUsuario } from './vistas/club.js';
import { montarPanel } from './vistas/panel.js';
import { montarRegistro } from './vistas/registro.js';
import { montarDiagnostico } from './vistas/diagnostico.js';
import { montarRestablecer } from './vistas/restablecer.js';

const raiz = document.getElementById('app');
const limpiezas = [];
let carrera = 0;

const ctx = {
  alDesmontar: (fn) => limpiezas.push(fn),
  recargar: () => iniciar(),
  entrarComo(token, perfil) { limpiar(); montarComoUsuario(raiz, ctx, { token, perfil }); },
  volverAdmin: () => iniciar(),
};
function limpiar() { limpiezas.splice(0).forEach((f) => { try { f(); } catch { /* sigue */ } }); }

// Al cerrar la cuenta se borra lo guardado en el teléfono
api.onSesion((hay) => {
  if (!hay) ['ppstaff-perfil', 'ppstaff-pin', 'ppstaff-personal', 'ppstaff-tab'].forEach((k) => api.guardarLocal(k, null));
});

function pantallaMensaje({ titulo, texto, boton, alTocar, secundario }) {
  raiz.innerHTML = `<main class="pantalla centrada"><div class="marca"><img class="logo-img" src="assets/img/logo.png" alt="Padel Palmira"><h1>PP Staff</h1></div>
    <div class="tarjeta vacio"><p><b>${esc(titulo)}</b></p><p>${esc(texto)}</p>
    ${boton ? `<button class="btn" data-a>${esc(boton)}</button>` : ''}${secundario ? `<button class="btn ghost" data-b>${esc(secundario.texto)}</button>` : ''}</div></main>`;
  raiz.querySelector('[data-a]')?.addEventListener('click', alTocar);
  raiz.querySelector('[data-b]')?.addEventListener('click', secundario?.alTocar);
}

async function iniciar() {
  const yo = ++carrera;
  limpiar();
  // al cambiar de pantalla no deben quedar ventanas abiertas de la anterior
  const vs = document.getElementById('ventanas'); if (vs) vs.innerHTML = '';
  document.body.classList.remove('ventana-abierta');
  const hash = location.hash || '';
  const reg = hash.match(/^#\/registro\/([A-Za-z0-9_-]+)/);
  if (reg) return montarRegistro(raiz, ctx, reg[1]);
  const rest = hash.match(/^#\/restablecer\/([A-Za-z0-9_-]+)/);
  if (rest) return montarRestablecer(raiz, ctx, rest[1]);
  if (hash.startsWith('#/diagnostico')) return montarDiagnostico(raiz, ctx);
  if (!api.haySesion()) return montarLogin(raiz, ctx);

  raiz.innerHTML = '<main class="pantalla centrada"><p class="cargando">Cargando…</p></main>';
  let perfil;
  try {
    perfil = await api.rpc('mi_perfil');
    api.guardarLocal('ppstaff-perfil', perfil);
  } catch (e) {
    if (yo !== carrera) return;
    if (e.codigo === 'sin_sesion' || e.status === 401 || e.status === 403) {
      await api.salir();
      return montarLogin(raiz, ctx, { aviso: 'Tu sesión terminó. Entra de nuevo.' });
    }
    perfil = api.leerLocal('ppstaff-perfil');
    if (!perfil) {
      return pantallaMensaje({ titulo: 'No se pudo cargar', texto: e.message, boton: 'Volver a intentar', alTocar: iniciar,
        secundario: { texto: 'Salir', alTocar: async () => { await api.salir(); iniciar(); } } });
    }
  }
  if (yo !== carrera) return;

  const salir = async () => { await api.salir(); iniciar(); };
  if (!perfil) {
    return pantallaMensaje({ titulo: 'Tu cuenta no tiene acceso', texto: 'Esta cuenta no está registrada en PP Staff. Pide al administrador que te dé de alta.', boton: 'Salir', alTocar: salir });
  }
  if (perfil.estado !== 'activo') {
    return pantallaMensaje({ titulo: 'Cuenta desactivada', texto: 'Tu usuario está desactivado. Habla con el administrador.', boton: 'Salir', alTocar: salir });
  }
  if (perfil.rol === 'dispositivo') return montarClub(raiz, ctx);
  if (perfil.modo_club_hasta && new Date(perfil.modo_club_hasta) > new Date()) return montarClub(raiz, ctx, { modoClub: perfil.modo_club_hasta });
  if (perfil.rol === 'admin' || perfil.rol === 'gerencia') return montarPanel(raiz, ctx, perfil);
  return pantallaMensaje({ titulo: 'Usa el celular del club', texto: 'Las recepcionistas entran desde el celular del club, tocando su nombre y escribiendo su PIN.', boton: 'Salir', alTocar: salir });
}

window.addEventListener('hashchange', iniciar);

if ('serviceWorker' in navigator) {
  const yaHabia = !!navigator.serviceWorker.controller;
  let avisado = false;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* la tarjeta de diagnóstico lo reporta */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (yaHabia && !avisado) { avisado = true; avisoConAccion('Hay una versión nueva de la app.', 'Actualizar', () => location.reload()); }
  });
}

iniciar();
