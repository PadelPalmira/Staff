// Piezas de interfaz compartidas: textos seguros, avatares, avisos, ventanas, foto y PIN.
import { urlsFotos } from './api.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export const ROL = { admin: 'Administrador', gerencia: 'Gerencia', recepcion: 'Recepción', dispositivo: 'Celular del club' };

export function iniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}
export const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';

const TZ = 'America/Mexico_City';
export const fechaCorta = (iso) => iso ? new Date(iso).toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const fechaHora = (iso) => iso ? new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
export const horaCorta = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '';
export function diasPara(iso) {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d;
}

// ---------- avatares ----------
export function avatar(p, tam = 'md') {
  return `<span class="avatar av-${tam}" data-foto="${esc(p.foto_path || '')}" data-v="${esc(p.foto_actualizada || '')}"><span class="av-ini">${esc(iniciales(p.nombre_completo))}</span></span>`;
}
export async function hidratarAvatares(raiz = document) {
  const els = $$('.avatar[data-foto]', raiz).filter((e) => e.dataset.foto && !e.classList.contains('con-foto'));
  if (!els.length) return;
  const urls = await urlsFotos(els.map((e) => ({ path: e.dataset.foto, v: e.dataset.v })));
  for (const e of els) {
    const u = urls.get(`${e.dataset.foto}|${e.dataset.v || ''}`);
    if (u) { e.style.backgroundImage = `url("${u}")`; e.classList.add('con-foto'); }
  }
}

// ---------- avisos ----------
export function aviso(texto, tipo = 'info', ms = 3800) {
  const cont = document.getElementById('avisos');
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.textContent = texto;
  cont.appendChild(el);
  setTimeout(() => { el.classList.add('sale'); setTimeout(() => el.remove(), 300); }, ms);
}
export function avisoConAccion(texto, boton, alTocar) {
  const cont = document.getElementById('avisos');
  const el = document.createElement('div');
  el.className = 'aviso aviso-info con-accion';
  el.innerHTML = `<span>${esc(texto)}</span><button type="button" class="btn chico">${esc(boton)}</button>`;
  el.querySelector('button').addEventListener('click', () => { alTocar(); el.remove(); });
  cont.appendChild(el);
}

// ---------- ventana inferior ----------
export function ventana(html, { titulo = '', alCerrar } = {}) {
  const raiz = document.getElementById('ventanas');
  const fondo = document.createElement('div');
  fondo.className = 'ventana-fondo';
  fondo.innerHTML = `<div class="ventana" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="ventana-cab"><h3>${esc(titulo)}</h3><button type="button" class="icono-btn" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="ventana-cuerpo">${html}</div></div>`;
  raiz.appendChild(fondo);
  document.body.classList.add('ventana-abierta');
  const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
  let cerrada = false;
  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    document.removeEventListener('keydown', onKey);
    fondo.remove();
    if (!raiz.children.length) document.body.classList.remove('ventana-abierta');
    alCerrar?.();
  }
  document.addEventListener('keydown', onKey);
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
  fondo.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });
  const cuerpo = $('.ventana-cuerpo', fondo);
  return { el: cuerpo, cerrar, poner(h) { cuerpo.innerHTML = h; } };
}

export function confirmar({ titulo = 'Confirmar', texto = '', ok = 'Confirmar', peligro = false } = {}) {
  return new Promise((resolver) => {
    const v = ventana(`<p class="texto-ventana">${esc(texto)}</p>
      <div class="fila-botones"><button type="button" class="btn ghost" data-r="0">Cancelar</button>
      <button type="button" class="btn ${peligro ? 'peligro' : ''}" data-r="1">${esc(ok)}</button></div>`,
      { titulo, alCerrar: () => resolver(false) });
    v.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      resolver(b.dataset.r === '1');
      v.cerrar();
    });
  });
}

// ---------- botón ocupado ----------
export async function conOcupado(boton, fn) {
  if (boton.disabled) return;
  const texto = boton.innerHTML;
  boton.disabled = true;
  boton.classList.add('ocupado');
  try { return await fn(); } finally { boton.disabled = false; boton.classList.remove('ocupado'); boton.innerHTML = texto; }
}

// ---------- foto de perfil ----------
async function cargarImagen(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* sigue con <img> */ }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
  } finally { URL.revokeObjectURL(url); }
}
export async function comprimirFoto(file, lado = 320) {
  const img = await cargarImagen(file);
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const s = Math.min(w, h);
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, lado, lado);
  g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, lado, lado);
  return c.toDataURL('image/jpeg', 0.82);
}
export async function dataUrlABlob(dataUrl) { return (await fetch(dataUrl)).blob(); }

// Selector de foto: devuelve { valor() -> data URL JPEG o null, cambio() -> true si el usuario eligió una }
export function selectorFoto(contenedor, { nombre = '', fotoActual = null } = {}) {
  contenedor.innerHTML = `<div class="foto-sel">
      <span class="avatar av-xl" data-prev>${fotoActual ? '' : `<span class="av-ini">${esc(iniciales(nombre) === '?' ? '＋' : iniciales(nombre))}</span>`}</span>
      <div class="foto-sel-txt">
        <label class="btn ghost chico">Tomar o elegir foto<input type="file" accept="image/*" class="oculto-accesible"></label>
        <button type="button" class="enlace" data-quitar hidden>Quitar foto</button>
        <p class="ayuda">Opcional. Se guarda pequeña, solo para que te reconozcan.</p>
      </div></div>`;
  const prev = $('[data-prev]', contenedor);
  const input = $('input', contenedor);
  const quitar = $('[data-quitar]', contenedor);
  let valor = null, cambio = false;
  if (fotoActual) { prev.style.backgroundImage = `url("${fotoActual}")`; prev.classList.add('con-foto'); }
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      valor = await comprimirFoto(f);
      cambio = true;
      prev.style.backgroundImage = `url("${valor}")`;
      prev.classList.add('con-foto');
      prev.innerHTML = '';
      quitar.hidden = false;
    } catch { aviso('No se pudo leer esa foto. Prueba con otra.', 'error'); }
    input.value = '';
  });
  quitar.addEventListener('click', () => {
    valor = null; cambio = false;
    quitar.hidden = true;
    if (fotoActual) { prev.style.backgroundImage = `url("${fotoActual}")`; prev.classList.add('con-foto'); prev.innerHTML = ''; return; }
    prev.style.backgroundImage = ''; prev.classList.remove('con-foto');
    prev.innerHTML = `<span class="av-ini">${esc(iniciales(nombre) === '?' ? '＋' : iniciales(nombre))}</span>`;
  });
  return { valor: () => valor, cambio: () => cambio };
}

// ---------- campos ----------
export function campoPassword(id, etiqueta, { auto = 'new-password', ayuda = '' } = {}) {
  return `<div class="campo"><label for="${id}">${esc(etiqueta)}</label>
    <div class="con-boton"><input id="${id}" type="password" autocomplete="${auto}" autocapitalize="off" spellcheck="false">
    <button type="button" class="enlace" data-ver="${id}">Mostrar</button></div>${ayuda ? `<p class="ayuda">${esc(ayuda)}</p>` : ''}</div>`;
}
export function activarMostrar(raiz) {
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ver]');
    if (!b) return;
    const inp = document.getElementById(b.dataset.ver);
    const ver = inp.type === 'password';
    inp.type = ver ? 'text' : 'password';
    b.textContent = ver ? 'Ocultar' : 'Mostrar';
  });
}
export function campoPin(id, etiqueta, ayuda = '') {
  return `<div class="campo"><label for="${id}">${esc(etiqueta)}</label>
    <input id="${id}" class="pin-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="••••">
    ${ayuda ? `<p class="ayuda">${esc(ayuda)}</p>` : ''}</div>`;
}
export function soloNumeros(raiz, selector = '.pin-input') {
  raiz.addEventListener('input', (e) => {
    if (e.target.matches(selector)) e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  });
}
export const pinValido = (p) => /^[0-9]{4}$/.test(p) && !/^(\d)\1{3}$/.test(p) && !['1234', '4321', '0123', '3210'].includes(p);
export const celularValido = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 10 || (d.length === 12 && d.startsWith('52')) || (d.length === 13 && d.startsWith('521')); };
export const formatoCelular = (c) => { const d = String(c || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : (c || ''); };
export const MENSAJE_PIN = 'El PIN debe ser de 4 números y no puede ser muy obvio (como 1234 o 0000).';

export function mostrarError(raiz, texto) {
  let el = $('.error-form', raiz);
  if (!el) { el = document.createElement('p'); el.className = 'error-form'; el.setAttribute('role', 'alert'); raiz.prepend(el); }
  el.textContent = texto;
  el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}
export const quitarError = (raiz) => $('.error-form', raiz)?.remove();
