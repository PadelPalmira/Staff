// Colores e íconos por categoría (para ubicar rápido cada sección al contar y en el catálogo).
import { esc } from './ui.js';

const CONOCIDAS = [
  [/bebida|refresco|agua/i, '🥤', '#38bdf8'],
  [/botana|papa|snack|dulce/i, '🍿', '#fb923c'],
  [/cafeter|caf[eé]|comida|cocina/i, '☕', '#d6a36a'],
  [/costeo|insumo/i, '🥛', '#a3e635'],
  [/pelota/i, '🎾', '#facc15'],
  [/grip|pala|accesorio/i, '🏓', '#a78bfa'],
  [/apapacho|fondo/i, '💗', '#f472b6'],
  [/clase/i, '🧑‍🏫', '#2dd4bf'],
  [/cancha/i, '🏟️', '#34d399'],
];
const EXTRA = ['#60a5fa', '#f87171', '#c084fc', '#4ade80', '#fbbf24', '#22d3ee', '#fb7185', '#94a3b8'];

export function estiloCategoria(nombre) {
  const n = nombre || 'Sin categoría';
  for (const [re, emoji, color] of CONOCIDAS) if (re.test(n)) return { nombre: n, emoji, color };
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { nombre: n, emoji: '📦', color: EXTRA[h % EXTRA.length] };
}

// Ícono redondo del artículo: su foto si tiene, si no el emoji de su categoría con el color de fondo
export function miniArticulo(a, tam = 44) {
  const e = estiloCategoria(a.categoria);
  return `<span class="mini-art" style="--cat:${e.color};width:${tam}px;height:${tam}px" data-foto-art="${esc(a.foto_path || '')}" data-v="${esc(a.foto_v || '')}"><span>${e.emoji}</span></span>`;
}

export function encabezadoCategoria(cat, extra = '') {
  const e = estiloCategoria(cat);
  return `<div class="cat-enc" style="--cat:${e.color}"><span class="cat-emoji">${e.emoji}</span><b>${esc(e.nombre)}</b>${extra}</div>`;
}

// Carga las fotos de los artículos (bucket privado "articulos") en los .mini-art de un contenedor
export async function hidratarFotosArticulos(raiz, api) {
  const els = [...raiz.querySelectorAll('.mini-art[data-foto-art]')].filter((e) => e.dataset.fotoArt && !e.classList.contains('con-foto'));
  if (!els.length) return;
  const urls = await api.urlsFotos(els.map((e) => ({ path: e.dataset.fotoArt, v: e.dataset.v })), 'articulos');
  for (const e of els) {
    const u = urls.get(`${e.dataset.fotoArt}|${e.dataset.v || ''}`);
    if (u) { e.style.backgroundImage = `url("${u}")`; e.classList.add('con-foto'); }
  }
}
