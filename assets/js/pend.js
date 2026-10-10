// Piezas compartidas de Pendientes / incidencias / solicitudes (empleado y gestión).
import * as api from './api.js';
import { esc, $$, fechaHora, comprimirEvidencia, ventana, aviso } from './ui.js';

export const TIPOS = {
  pendiente: { ico: '📌', nombre: 'Pendiente', ayuda: 'Algo por hacer: para ti o para un compañero.' },
  incidencia: { ico: '🛠️', nombre: 'Incidencia', ayuda: 'Algo se descompuso o pasó un imprevisto. Se avisa a gerencia y se reporta cada turno hasta que se arregle.' },
  solicitud: { ico: '✋', nombre: 'Solicitud', ayuda: 'Pedir material, un cambio en una tarea o sugerir una tarea nueva. Gerencia la revisa.' },
};
export const PRIORIDADES = { 1: 'Baja', 2: 'Normal', 3: 'Alta', 4: 'Urgente' };
export const ZONAS = ['Recepción', 'Canchas', 'Baños', 'Vestidores', 'Cafetería / barra', 'Estacionamiento', 'Bodega', 'Oficina', 'Otra'];
export const ESTADOS = { abierto: 'Abierto', en_proceso: 'En proceso', solicita_cierre: 'Piden cerrarlo', resuelto: 'Resuelto', cancelado: 'Cancelado' };
const NOTA = { creado: 'Lo creó', nota: 'Nota', avance: 'Avance', reporte: 'Reporte del turno', solicita_cierre: 'Pidió cerrarlo', cierre: 'Resuelto', reabierto: 'Reabierto', cancelado: 'Cancelado' };

export const prioridadClase = (n) => ['', 'p-baja', 'p-normal', 'p-alta', 'p-urgente'][n] || 'p-normal';
export const fechaLimiteTxt = (f) => {
  if (!f) return '';
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const d = Math.round((new Date(`${f}T12:00:00`) - new Date(`${hoy}T12:00:00`)) / 86400000);
  const txt = new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  if (d < 0) return `<span class="mal-txt">venció el ${esc(txt)}</span>`;
  if (d === 0) return '<span class="warn-txt">vence hoy</span>';
  if (d === 1) return 'vence mañana';
  return `para el ${esc(txt)}`;
};

export function tarjetaPendiente(p, { mostrarAsignado = true } = {}) {
  const t = TIPOS[p.tipo] || TIPOS.pendiente;
  const pe = p.prioridad_efectiva ?? p.prioridad;
  const subio = pe > p.prioridad;
  const meta = [p.zona, mostrarAsignado && p.asignado_nombre ? `para ${p.asignado_nombre}` : '', p.creado_por_nombre ? `de ${p.creado_por_nombre}` : '',
    p.fecha_limite ? fechaLimiteTxt(p.fecha_limite) : ''].filter(Boolean);
  return `<button type="button" class="fila pend ${prioridadClase(pe)}" data-pend="${esc(p.id)}">
    <span class="pend-ico" aria-hidden="true">${t.ico}</span>
    <div class="fila-txt"><b>${esc(p.titulo)}</b><span>${meta.map((m) => (m.startsWith('<') ? m : esc(m))).join(' · ')}</span></div>
    <div class="fila-ins"><span class="insignia prio ${prioridadClase(pe)}">${PRIORIDADES[pe]}${subio ? ' ↑' : ''}</span>
      ${p.estado === 'solicita_cierre' ? '<span class="insignia aviso-i">Piden cerrar</span>' : p.estado === 'en_proceso' ? '<span class="insignia gris">En proceso</span>' : ''}
      ${p.estado === 'resuelto' ? '<span class="insignia">Resuelto</span>' : p.estado === 'cancelado' ? '<span class="insignia gris">Cancelado</span>' : ''}</div></button>`;
}

export function historialHtml(notas) {
  if (!notas?.length) return '';
  return `<h3 class="sub-titulo">Historial</h3><div class="historial">${notas.map((n) => `<div class="hist-item hist-${esc(n.tipo)}">
    <span class="hist-cab"><b>${esc(NOTA[n.tipo] || n.tipo)}</b> · ${esc(n.perfil_nombre || '')} · ${esc(fechaHora(n.creado_en))}</span>
    ${n.texto ? `<p>${esc(n.texto)}</p>` : ''}${n.foto_path ? `<img class="evidencia" data-foto="${esc(n.foto_path)}" alt="Foto" hidden>` : ''}</div>`).join('')}</div>`;
}

// Carga las fotos (bucket evidencias) de los <img data-foto> dentro de raiz; tocar una la abre en grande.
export async function hidratarFotosPend(raiz) {
  const ims = $$('img[data-foto]', raiz);
  if (!ims.length) return;
  const urls = await api.urlsFotos(ims.map((i) => ({ path: i.dataset.foto })), 'evidencias');
  ims.forEach((im) => { const u = urls.get(`${im.dataset.foto}|`); if (u) { im.src = u; im.hidden = false; } });
  if (!raiz.dataset.fotosListas) {
    raiz.dataset.fotosListas = '1';
    raiz.addEventListener('click', (e) => {
      const im = e.target.closest('img.evidencia');
      if (im?.src && !im.classList.contains('grande')) ventana(`<img class="evidencia grande" src="${esc(im.src)}" alt="">`, { titulo: 'Foto' });
    });
  }
}

// Campo de foto opcional para formularios: devuelve { blob() }
export function campoFotoOpcional(cont, texto = 'Agregar foto') {
  cont.innerHTML = `<div class="foto-opc"><label class="btn ghost chico">📷 ${esc(texto)}<input type="file" accept="image/*" capture="environment" class="oculto-accesible"></label>
    <img class="evidencia previa-mini" alt="" hidden><button type="button" class="enlace" data-quitar hidden>Quitar</button></div>`;
  const inp = cont.querySelector('input'), im = cont.querySelector('img'), q = cont.querySelector('[data-quitar]');
  let blob = null, url = null;
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0];
    if (!f) return;
    try { blob = await comprimirEvidencia(f); } catch { aviso('No se pudo leer la foto.', 'error'); return; }
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob); im.src = url; im.hidden = false; q.hidden = false; inp.value = '';
  });
  q.addEventListener('click', () => { blob = null; im.hidden = true; q.hidden = true; });
  return { blob: () => blob };
}
export async function subirFotoPend(pendId, blob, nombre = null) {
  const ruta = `pendientes/${pendId}/${nombre || Date.now().toString(36)}.jpg`;
  await api.subirFoto(ruta, blob, 'evidencias');
  return ruta;
}
export const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
