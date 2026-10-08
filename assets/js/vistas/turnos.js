// Turnos para admin y gerencia: "En vivo" (tarjeta del Inicio) e historial con detalle, fotos y excusas.
import * as api from '../api.js';
import { esc, $, $$, aviso, ventana, conOcupado, horaCorta, fechaHora, duracionTexto } from '../ui.js';

const TZ = 'America/Mexico_City';
const COLS_TURNO = 'id,fecha,tipo,perfil_nombre,estado,inicio_prog,fin_prog,abierto_en,cerrado_en,tarde_min,abierto_con_aviso,resumen';
const COLS_TAREA = 'id,turno_id,nombre,momento,orden,limite,requiere_foto,estado,marcada_en,a_tiempo,foto_path,razon,pide_excusa,excusa_motivo,etiqueta_no_aplica';
const ERR = { sin_permiso: 'No tienes permiso para esto.', no_pendiente: 'Esa tarea ya no está pendiente.', no_excusada: 'Esa tarea no estaba excusada.', no_existe: 'Ya no existe.' };

export const hoyMx = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const NOMBRES = { manana: 'Mañana', tarde: 'Tarde', domingo: 'Domingo' };
const nombreTipo = (c) => NOMBRES[c] || c;

// ---------- En vivo (tarjeta del Inicio) ----------
export async function pintarEnVivo(el) {
  el.innerHTML = '<p class="cargando">Cargando turnos…</p>';
  try {
    const hoy = hoyMx();
    const turnos = await api.seleccionar('turnos', `select=${COLS_TURNO}&or=(estado.eq.abierto,fecha.eq.${hoy})&order=abierto_en.desc&limit=10`);
    const ids = turnos.filter((t) => t.estado === 'abierto').map((t) => t.id);
    const tareas = ids.length ? await api.seleccionar('turno_tareas', `select=turno_id,estado,limite,pide_excusa&turno_id=in.(${ids.join(',')})`) : [];
    if (!turnos.length) { el.innerHTML = '<p class="detalle">Hoy todavía nadie ha abierto turno.</p>'; return; }
    const ahora = Date.now();
    el.innerHTML = turnos.map((t) => {
      if (t.estado === 'cerrado') {
        const r = t.resumen || {};
        return `<button type="button" class="fila" data-turno="${esc(t.id)}"><div class="fila-txt"><b>${esc(t.perfil_nombre)} · ${esc(nombreTipo(t.tipo))}</b>
          <span>Cerrado a las ${esc(horaCorta(t.cerrado_en))} · ${r.sin_hacer ? `${r.sin_hacer} sin hacer` : 'todo cumplido'}</span></div>
          <span class="insignia ${r.sin_hacer ? 'aviso-i' : ''}">Cerrado</span></button>`;
      }
      const l = tareas.filter((x) => x.turno_id === t.id);
      const ok = l.filter((x) => x.estado !== 'pendiente').length;
      const venc = l.filter((x) => x.estado === 'pendiente' && x.limite && new Date(x.limite) < ahora).length;
      const excusas = l.filter((x) => x.estado === 'pendiente' && x.pide_excusa).length;
      const pct = l.length ? Math.round((ok / l.length) * 100) : 100;
      return `<button type="button" class="fila vivo" data-turno="${esc(t.id)}"><div class="fila-txt"><b>${esc(t.perfil_nombre)} · ${esc(nombreTipo(t.tipo))}</b>
        <span>Abierto a las ${esc(horaCorta(t.abierto_en))} · ${ok}/${l.length} tareas${venc ? ` · ${venc} vencida${venc === 1 ? '' : 's'}` : ''}${excusas ? ` · ${excusas} piden excusa` : ''}</span>
        <div class="progreso chico"><span style="width:${pct}%"></span></div></div>
        <span class="insignia ${venc ? 'mal' : ''}">${venc ? 'Atrasado' : 'Abierto'}</span></button>`;
    }).join('');
  } catch (e) { el.innerHTML = `<p class="detalle">${esc(e.message)}</p>`; }
}

// ---------- detalle de un turno ----------
export async function verTurno(id, yo, alCambiar) {
  const v = ventana('<p class="cargando">Cargando…</p>', { titulo: 'Turno' });
  async function pintar() {
    let t, tareas;
    try {
      [t] = await api.seleccionar('turnos', `select=${COLS_TURNO}&id=eq.${id}`);
      tareas = await api.seleccionar('turno_tareas', `select=${COLS_TAREA}&turno_id=eq.${id}&order=orden.asc`);
    } catch (e) { v.poner(`<p class="detalle">${esc(e.message)}</p>`); return; }
    if (!t) { v.poner('<p class="detalle">No se encontró el turno.</p>'); return; }
    const r = t.resumen || {};
    const ahora = Date.now();
    let h = `<div class="detalle-cab"><h3>${esc(t.perfil_nombre)}</h3><p class="sub cap">${esc(fechaLarga(t.fecha))} · turno ${esc(nombreTipo(t.tipo))}</p></div>
      <dl class="datos"><dt>Horario</dt><dd>${esc(horaCorta(t.inicio_prog))} – ${esc(horaCorta(t.fin_prog))}</dd>
        <dt>Abrió</dt><dd>${esc(horaCorta(t.abierto_en))}${t.tarde_min > 0 ? ` (${t.tarde_min} min tarde)` : ''}${t.abierto_con_aviso ? ' · con aviso' : ''}</dd>
        <dt>Cerró</dt><dd>${t.cerrado_en ? `${esc(horaCorta(t.cerrado_en))} · duró ${esc(duracionTexto(r.duracion_min))}${r.cerro_antes_min > 0 ? ` · ${r.cerro_antes_min} min antes` : ''}` : 'Sigue abierto'}</dd></dl>`;
    for (const [mom, titulo] of [['apertura', 'Al abrir'], ['semanal', 'Semanales'], ['cierre', 'Al cerrar']]) {
      const l = tareas.filter((x) => x.momento === mom);
      if (!l.length) continue;
      h += `<h3 class="sub-titulo">${titulo}</h3><div class="lista-tareas">${l.map((x) => {
        const venc = x.estado === 'pendiente' && x.limite && new Date(x.limite) < ahora;
        let est;
        if (x.estado === 'hecha') est = `<span class="${x.a_tiempo ? 'ok-txt' : 'warn-txt'}">✓ ${esc(horaCorta(x.marcada_en))} · ${x.a_tiempo ? 'a tiempo' : 'fuera de tiempo'}</span>`;
        else if (x.estado === 'no_aplica') est = `<span class="ok-txt">${esc(x.etiqueta_no_aplica || 'No aplica')}</span>`;
        else if (x.estado === 'excusada') est = `<span class="ok-txt">Excusada${x.excusa_motivo ? `: ${esc(x.excusa_motivo)}` : ''}</span>`;
        else est = `<span class="${venc || t.estado === 'cerrado' ? 'mal-txt' : ''}">${t.estado === 'cerrado' ? 'Sin hacer' : venc ? `Venció a las ${esc(horaCorta(x.limite))}` : x.limite ? `Antes de las ${esc(horaCorta(x.limite))}` : 'Pendiente'}</span>`;
        const puedeExcusar = x.estado === 'pendiente';
        return `<div class="tarea ${x.estado === 'hecha' || x.estado === 'no_aplica' || x.estado === 'excusada' ? 'lista' : ''} ${venc ? 'vencida' : ''}" data-id="${esc(x.id)}">
          <div class="tarea-check ro">${x.estado === 'pendiente' ? '' : '✓'}</div>
          <div class="tarea-txt"><b>${esc(x.nombre)}</b><span class="tarea-meta">${est}</span>
            ${x.razon ? `<span class="tarea-meta">Razón: ${esc(x.razon)}${x.pide_excusa ? ' · <b class="warn-txt">pide excusa</b>' : ''}</span>` : ''}
            ${x.foto_path ? `<img class="evidencia" data-foto="${esc(x.foto_path)}" alt="Evidencia de ${esc(x.nombre)}" hidden>` : ''}
            <span class="tarea-botones">${puedeExcusar ? '<button type="button" class="chip" data-excusar>Excusar</button>' : ''}${x.estado === 'excusada' ? '<button type="button" class="chip" data-quitar-excusa>Quitar excusa</button>' : ''}</span>
          </div></div>`;
      }).join('')}</div>`;
    }
    h += '<div class="acciones" style="margin-top:14px"><button type="button" class="btn ghost" data-cerrar>Cerrar</button></div>';
    v.poner(h);
    const urls = await api.urlsFotos(tareas.filter((x) => x.foto_path).map((x) => ({ path: x.foto_path })), 'evidencias');
    $$('img[data-foto]', v.el).forEach((im) => { const u = urls.get(`${im.dataset.foto}|`); if (u) { im.src = u; im.hidden = false; } });
  }
  v.el.addEventListener('click', async (e) => {
    const im = e.target.closest('img.evidencia');
    if (im && im.src) { const g = ventana(`<img class="evidencia grande" src="${esc(im.src)}" alt="">`, { titulo: 'Evidencia' }); return void g; }
    const fila = e.target.closest('.tarea');
    if (!fila) return;
    const idT = fila.dataset.id;
    if (e.target.closest('[data-excusar]')) {
      const f = ventana(`<form class="formulario" novalidate><p class="detalle">La tarea dejará de contar como pendiente. Puedes anotar un motivo.</p>
        <div class="campo"><label for="ex-m">Motivo <span class="opc">(opcional)</span></label><input id="ex-m" type="text" placeholder="Ej. se descompuso, se repone mañana"></div>
        <button class="btn" type="submit">Excusar tarea</button></form>`, { titulo: 'Excusar tarea' });
      const form = $('form', f.el);
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        conOcupado($('button', form), async () => {
          const r = await api.rpc('turno_tarea_excusar', { p_id: idT, p_excusar: true, p_motivo: $('#ex-m', form).value });
          if (!r.ok) return aviso(ERR[r.error] || 'No se pudo excusar.', 'error');
          f.cerrar(); aviso('Tarea excusada.', 'ok'); await pintar(); alCambiar?.();
        });
      });
    } else if (e.target.closest('[data-quitar-excusa]')) {
      const b = e.target.closest('[data-quitar-excusa]');
      conOcupado(b, async () => {
        const r = await api.rpc('turno_tarea_excusar', { p_id: idT, p_excusar: false });
        if (!r.ok) return aviso(ERR[r.error] || 'No se pudo quitar.', 'error');
        aviso('Excusa quitada.', 'ok'); await pintar(); alCambiar?.();
      });
    }
  });
  pintar();
}

// ---------- pestaña Turnos ----------
export async function montarTurnos(el, ctx, yo) {
  el.innerHTML = `<div class="enc-seccion"><h2>Turnos</h2></div><p class="sub">Los últimos 30 días. Toca un turno para ver sus tareas, fotos y excusar lo que haga falta.</p>
    <div id="lista-turnos" class="lista"><p class="cargando">Cargando…</p></div>`;
  const lista = $('#lista-turnos', el);
  async function cargar() {
    try {
      const desde = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: TZ });
      const turnos = await api.seleccionar('turnos', `select=${COLS_TURNO}&fecha=gte.${desde}&order=fecha.desc,abierto_en.desc&limit=100`);
      if (!turnos.length) { lista.innerHTML = '<div class="tarjeta vacio"><p><b>Todavía no hay turnos.</b></p><p>Aparecen aquí en cuanto alguien abra su turno desde el celular del club.</p></div>'; return; }
      let ultimo = '';
      lista.innerHTML = turnos.map((t) => {
        const r = t.resumen || {};
        const cab = t.fecha !== ultimo ? `<h3 class="sub-titulo cap">${esc(fechaLarga(t.fecha))}</h3>` : '';
        ultimo = t.fecha;
        const insignia = t.estado === 'abierto' ? '<span class="insignia">Abierto</span>' : `<span class="insignia ${r.sin_hacer ? 'aviso-i' : ''}">${r.sin_hacer ? `${r.sin_hacer} sin hacer` : 'Completo'}</span>`;
        return `${cab}<button type="button" class="fila" data-turno="${esc(t.id)}"><div class="fila-txt"><b>${esc(t.perfil_nombre)} · ${esc(nombreTipo(t.tipo))}</b>
          <span>${esc(horaCorta(t.abierto_en))}${t.cerrado_en ? ` – ${esc(horaCorta(t.cerrado_en))}` : ' · sigue abierto'}${t.tarde_min > 0 ? ` · ${t.tarde_min} min tarde` : ''}</span></div>${insignia}</button>`;
      }).join('');
    } catch (e) { lista.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; }
  }
  lista.addEventListener('click', (e) => { const b = e.target.closest('[data-turno]'); if (b) verTurno(b.dataset.turno, yo, cargar); });
  cargar();
}
