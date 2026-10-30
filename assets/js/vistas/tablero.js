// Tablero del dueño (solo administrador): ventas de Loyverse, cumplimiento, descuadres, merma y costos, por día, semana o mes.
import * as api from '../api.js';
import { esc, $, $$, pesos, horaCorta } from '../ui.js';
import { ventanaCaja, insigniaRevision } from './revisiones.js';

const TZ = 'America/Mexico_City';
const LLAVE = 'ppstaff-tablero-modo';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const GRUPOS = { merma: '🗑️ Merma / roto', cortesia: '🎁 Cortesías', consumo: '🥤 Consumo interno', otro: '± Otros ajustes' };

const hoyMx = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const aFecha = (s) => new Date(`${s}T12:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const masDias = (s, n) => { const d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const diaCorto = (s, op = { day: 'numeric', month: 'short' }) => aFecha(s).toLocaleDateString('es-MX', { ...op, timeZone: 'UTC' });
const fechaDe = (ts) => new Date(ts).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

function rango(modo, paso) {
  const hoy = hoyMx();
  if (modo === 'dia') {
    const dia = masDias(hoy, paso);
    return { desde: dia, hasta: dia, unidad: 'dia', titulo: paso === 0 ? 'Hoy' : paso === -1 ? 'Ayer' : diaCorto(dia, { weekday: 'long' }), sub: diaCorto(dia, { weekday: paso > -2 ? 'long' : undefined, day: 'numeric', month: 'long' }) };
  }
  if (modo === 'mes') {
    const d = aFecha(hoy); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + paso);
    const desde = iso(d); const f = new Date(d); f.setUTCMonth(f.getUTCMonth() + 1); f.setUTCDate(0);
    return { desde, hasta: iso(f), unidad: 'mes', titulo: `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  }
  const dow = (aFecha(hoy).getUTCDay() + 6) % 7;
  const desde = masDias(hoy, -dow + paso * 7), hasta = masDias(desde, 6);
  return { desde, hasta, unidad: 'semana', titulo: paso === 0 ? 'Esta semana' : paso === -1 ? 'Semana pasada' : `Semana del ${diaCorto(desde)}` , sub: `${diaCorto(desde)} – ${diaCorto(hasta)}` };
}

export function montarTablero(el) {
  let modo = ['dia', 'mes'].includes(api.leerLocal(LLAVE)) ? api.leerLocal(LLAVE) : 'semana', paso = 0, pedido = 0, ultimo = null;
  el.innerHTML = `<div class="enc-seccion"><h2>📊 Tablero</h2></div>
    <div class="segmentos tres" role="tablist"><button type="button" data-modo="dia">Día</button><button type="button" data-modo="semana">Semana</button><button type="button" data-modo="mes">Mes</button></div>
    <div class="tab-nav"><button type="button" class="icono-btn" data-paso="-1" aria-label="Periodo anterior">‹</button>
      <div class="tab-nav-txt"><b data-titulo></b><span class="sub" data-sub></span></div>
      <button type="button" class="icono-btn" data-paso="1" aria-label="Periodo siguiente">›</button></div>
    <div id="tab-cont"><p class="cargando">Cargando…</p></div>`;
  el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-modo]');
    if (m && m.dataset.modo !== modo) { modo = m.dataset.modo; paso = 0; api.guardarLocal(LLAVE, modo); return cargar(); }
    const p = e.target.closest('[data-paso]');
    if (p && !p.disabled) { paso += Number(p.dataset.paso); return cargar(); }
    if (e.target.closest('[data-reintentar]')) return cargar();
    const cj = e.target.closest('[data-caja]');
    if (cj && ultimo) { const c = (ultimo.cajas || []).find((x) => x.id === cj.dataset.caja); if (c) ventanaCaja(c, cargar); }
  });

  async function cargar() {
    const r = rango(modo, paso), yo = ++pedido;
    $$('[data-modo]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modo === modo)));
    $('[data-titulo]', el).textContent = r.titulo.charAt(0).toUpperCase() + r.titulo.slice(1);
    $('[data-sub]', el).textContent = r.sub || '';
    $('[data-paso="1"]', el).disabled = paso >= 0;
    const c = $('#tab-cont', el);
    c.innerHTML = '<p class="cargando">Cargando…</p>';
    let d;
    try { d = await api.rpc('tablero', { p_desde: r.desde, p_hasta: r.hasta }); } catch (e) { d = { ok: false, mensaje: e.message }; }
    if (yo !== pedido) return;
    if (!d?.ok) {
      c.innerHTML = `<div class="tarjeta vacio"><p><b>No se pudo cargar el tablero</b></p><p>${esc(d?.error === 'sin_permiso' ? 'Solo el administrador puede ver el tablero.' : d?.mensaje || 'Intenta de nuevo.')}</p>
        <button type="button" class="btn ghost" data-reintentar>Volver a intentar</button></div>`;
      return;
    }
    ultimo = d;
    c.innerHTML = pintar(d, r);
  }
  cargar();
}

function pintar(d, r) {
  const dias = d.ventas_dia || [];
  const hoy = hoyMx();
  const netas = dias.reduce((s, x) => s + Number(x.ventas) - Number(x.reembolsos), 0);
  const tickets = dias.reduce((s, x) => s + Number(x.tickets), 0);
  const descuentos = dias.reduce((s, x) => s + Number(x.descuentos), 0);
  const reemb = dias.reduce((s, x) => s + Number(x.reembolsos), 0);
  const previas = Number(d.ventas_previas || 0);
  const cambio = previas ? Math.round(((netas - previas) / previas) * 100) : null;
  const emps = d.empleados || [];
  const tareas = emps.reduce((s, x) => s + x.tareas, 0), cumplidas = emps.reduce((s, x) => s + x.cumplidas, 0);
  const turnos = emps.reduce((s, x) => s + x.turnos, 0), tarde = emps.reduce((s, x) => s + x.tarde, 0);
  const cumpl = pct(cumplidas, tareas);
  const cajas = d.cajas || [];
  const reales = cajas.filter((x) => x.revision !== 'perdonado');
  const cajaFalta = reales.reduce((s, x) => s + Math.min(0, Number(x.diferencia || 0)), 0);
  const cajaSobra = reales.reduce((s, x) => s + Math.max(0, Number(x.diferencia || 0)), 0);
  const cajaPerdon = cajas.filter((x) => x.revision === 'perdonado').reduce((s, x) => s + Math.abs(Number(x.diferencia || 0)), 0);
  const conteos = d.conteos || [];
  const ctPerdon = conteos.reduce((s, x) => s + Number(x.perdonado || 0), 0);
  const unidadTxt = { dia: ['el día anterior', 'el día anterior'], semana: ['la semana', 'de la semana'], mes: ['el mes', 'del mes'] }[r.unidad];
  const ctFalta = conteos.reduce((s, x) => s + Number(x.faltante || 0), 0);
  const ctDeuda = conteos.reduce((s, x) => s + Number(x.deuda || 0), 0);
  const aj = Object.fromEntries((d.ajustes || []).map((x) => [x.grupo, x]));
  const pend = d.pendientes || {};

  let h = `<section class="tarjeta">
    <div class="kpi-grande"><span>Ventas netas (Loyverse)</span><b>${pesos(netas)}</b>
      ${cambio == null ? '' : `<i class="${cambio >= 0 ? 'ok-txt' : 'mal-txt'}">${cambio >= 0 ? '▲' : '▼'} ${Math.abs(cambio)}% vs. ${r.unidad === 'dia' ? 'el día anterior' : d.dias_comparados && d.dias_comparados < d.dias_periodo ? `${d.dias_comparados === 1 ? 'el mismo día' : `los mismos ${d.dias_comparados} días`} ${unidadTxt[1]} anterior` : `${unidadTxt[0]} anterior`} (${pesos(previas)})</i>`}</div>
    <div class="cifras tres"><div><b>${tickets}</b><span>tickets</span></div><div><b>${pesos(tickets ? netas / tickets : 0)}</b><span>ticket promedio</span></div>
      <div><b>${pesos(descuentos)}</b><span>descuentos</span></div></div>
    ${reemb ? `<p class="nota-mal">↩️ Reembolsos: <b>${pesos(reemb)}</b></p>` : ''}
    ${r.unidad === 'dia' ? graficaHoras(d.ventas_hora || []) : graficaVentas(dias, hoy)}</section>`;
  if (r.unidad === 'dia') h += seccionDia(d);

  // Personal
  h += `<h3 class="sub-titulo">👥 Personal</h3><section class="tarjeta">`;
  if (!emps.length) {
    h += `<p class="detalle" style="margin:0">Sin turnos cerrados en este periodo${d.fecha_arranque ? '' : ' (todavía no hay fecha de arranque: se cuentan desde que empiecen a usar la app)'}.</p>`;
  } else {
    h += `<div class="cifras tres"><div><b class="${color(cumpl)}">${cumpl ?? '—'}${cumpl == null ? '' : '%'}</b><span>cumplimiento</span></div>
      <div><b>${turnos}</b><span>turnos</span></div><div><b class="${tarde ? 'warn-txt' : ''}">${tarde}</b><span>llegó tarde</span></div></div>
      <div class="tabla-scroll"><table class="tabla-tab"><thead><tr><th>Empleado</th><th>Turnos</th><th>Cumpl.</th><th>Tarde</th><th>Sin hacer</th></tr></thead><tbody>
      ${emps.map((x) => { const p = pct(x.cumplidas, x.tareas); return `<tr><td>${esc(x.nombre)}</td><td>${x.turnos}</td><td class="${color(p)}"><b>${p ?? '—'}${p == null ? '' : '%'}</b></td>
        <td>${x.tarde ? `${x.tarde} <small>(${x.tarde_min} min)</small>` : '0'}</td><td>${x.sin_hacer}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="ayuda">Cumplimiento = tareas a tiempo + “no aplica” + excusadas. Tarde = abrió más de ${esc(d.tolerancia)} min después de su hora.</p>`;
  }
  h += '</section>';

  // Descuadres
  h += `<h3 class="sub-titulo">💵 Descuadres</h3><section class="tarjeta">
    <div class="cifras tres"><div><b class="${cajaFalta < 0 ? 'mal-txt' : ''}">${pesos(Math.abs(cajaFalta))}</b><span>faltó en caja</span></div>
      <div><b>${pesos(cajaSobra)}</b><span>sobró en caja</span></div><div><b class="${ctFalta > 0 ? 'mal-txt' : ''}">${pesos(ctFalta)}</b><span>faltante en conteos</span></div></div>
    ${cajaPerdon || ctPerdon ? `<p class="ayuda">🤝 Perdonado (no cuenta arriba): ${cajaPerdon ? `${pesos(cajaPerdon)} en caja` : ''}${cajaPerdon && ctPerdon ? ' y ' : ''}${ctPerdon ? `${pesos(ctPerdon)} en conteos` : ''}.</p>` : ''}`;
  const cajasMal = cajas.filter((x) => Number(x.diferencia || 0) !== 0);
  h += cajasMal.length ? `<ul class="lista-tab cajas-tab">${cajasMal.map((x) => `<li><button type="button" class="caja-li" data-caja="${esc(x.id)}"><span>🧾 ${esc(fechaDe(x.cerrado_en))} ${esc(horaCorta(x.cerrado_en))} · ${esc(x.empleado || x.cerro || '')}
        ${x.razon ? `<small>“${esc(x.razon)}”</small>` : ''}${insigniaRevision(x)}</span>
      <b class="${x.revision === 'perdonado' ? 'tachado' : Number(x.diferencia) < 0 ? 'mal-txt' : 'ok-txt'}">${Number(x.diferencia) > 0 ? '+' : '−'}${pesos(Math.abs(x.diferencia))}</b></button></li>`).join('')}</ul>
      <p class="ayuda">Toca un descuadre para perdonarlo o confirmarlo. Hasta ${pesos(d.margen_caja)} no avisa ni pide razón.</p>`
    : `<p class="detalle">${cajas.length ? `✓ Las ${cajas.length} cajas cerraron cuadradas.` : 'Sin cierres de caja en este periodo.'}</p>`;
  h += conteos.length ? `<ul class="lista-tab">${conteos.map((x) => `<li><span>📋 Conteo ${esc(diaCorto(x.fecha))} · ${esc(x.contado_por || '')}</span>
      <b>${Number(x.faltante) ? `<span class="mal-txt">−${pesos(x.faltante)}</span>` : '<span class="ok-txt">sin faltante</span>'}${Number(x.deuda) ? ` · cobro ${pesos(x.deuda)}` : ''}${Number(x.perdonado) ? ` <small>🤝 ${pesos(x.perdonado)} perdonado</small>` : ''}</b></li>`).join('')}</ul>
      ${ctDeuda ? `<p class="ayuda">A cobrar a empleados por conteos: <b>${pesos(ctDeuda)}</b></p>` : ''}`
    : '<p class="detalle">Sin conteos revisados en este periodo.</p>';
  h += '</section>';

  // Merma, cortesías, consumo
  h += `<h3 class="sub-titulo">🗑️ Merma, cortesías y consumo</h3><section class="tarjeta">
    <div class="cifras tres">${['merma', 'cortesia', 'consumo'].map((g) => `<div><b>${pesos(aj[g]?.costo || 0)}</b><span>${GRUPOS[g].split(' ').slice(1).join(' ')}</span></div>`).join('')}</div>
    ${(d.ajustes || []).length ? `<ul class="lista-tab">${d.ajustes.map((x) => `<li><span>${GRUPOS[x.grupo] || x.grupo} · ${Number(x.piezas)} pzas</span>
      <b>${pesos(x.costo)} <small>costo · ${pesos(x.precio)} venta</small></b></li>`).join('')}</ul>` : '<p class="detalle">No hubo ajustes de inventario en este periodo.</p>'}
    ${(d.danados || []).length ? `<p class="sub-titulo" style="margin:12px 0 0">⚠️ Llegó mal en pedidos (no se sumó)</p><ul class="lista-tab">${d.danados.map((x) => `<li><span>${esc(String(Number(x.cantidad)))} ${esc(x.nombre)} · ${esc(String(x.motivo).toLowerCase())}</span><b>${pesos(x.costo)}</b></li>`).join('')}</ul>` : ''}
    <p class="ayuda">A costo de compra. Sale de los ajustes de inventario hechos por gerencia y de lo que llegó mal en los pedidos.</p></section>`;

  // Pendientes
  h += `<h3 class="sub-titulo">🛠️ Pendientes y reparaciones</h3><section class="tarjeta">
    <div class="cifras tres"><div><b>${pend.resueltos || 0}</b><span>resueltos</span></div><div><b>${pesos(pend.costo_real)}</b><span>gastado</span></div>
      <div><b>${pend.abiertos || 0}</b><span>abiertos${Number(pend.estimado_abiertos) ? ` (~${pesos(pend.estimado_abiertos)})` : ''}</span></div></div>
    ${(pend.lista || []).length ? `<ul class="lista-tab">${pend.lista.map((x) => `<li><span>${x.tipo === 'incidencia' ? '🛠️' : '📌'} ${esc(x.titulo)}</span><b>${pesos(x.costo_real)}</b></li>`).join('')}</ul>` : ''}</section>`;

  // Productos y pagos
  const top = d.top || [];
  if (top.length) {
    const max = Math.max(...top.map((x) => Number(x.total)), 1);
    h += `<h3 class="sub-titulo">🏆 Lo que más se vendió</h3><section class="tarjeta"><ul class="lista-top">${top.map((x) => `<li><div><span>${esc(x.nombre)}</span><b>${pesos(x.total)}</b></div>
      <i style="width:${Math.max(2, Math.round((Number(x.total) / max) * 100))}%"></i><small>${Number(x.cantidad)} vendidos</small></li>`).join('')}</ul></section>`;
  }
  const pagos = (d.pagos || []).filter((x) => Number(x.total));
  if (pagos.length) {
    const tot = pagos.reduce((s, x) => s + Number(x.total), 0) || 1;
    h += `<h3 class="sub-titulo">💳 Formas de pago</h3><section class="tarjeta"><ul class="lista-tab">${pagos.map((x) => `<li><span>${esc(x.metodo)}</span><b>${pesos(x.total)} <small>${Math.round((Number(x.total) / tot) * 100)}%</small></b></li>`).join('')}</ul></section>`;
  }
  return h;
}

const color = (p) => (p == null ? '' : p >= 90 ? 'ok-txt' : p >= 75 ? 'warn-txt' : 'mal-txt');

function graficaVentas(dias, hoy) {
  if (!dias.length) return '';
  const vals = dias.map((x) => Number(x.ventas) - Number(x.reembolsos));
  const max = Math.max(...vals, 1);
  const mes = dias.length > 7;
  const mejor = vals.indexOf(Math.max(...vals));
  return `<div class="graf-ventas ${mes ? 'mes' : ''}" role="img" aria-label="Ventas por día">
    ${dias.map((x, i) => { const futuro = x.dia > hoy; const v = vals[i];
      return `<div class="gv-dia ${futuro ? 'futuro' : ''} ${i === mejor && v > 0 ? 'mejor' : ''}" title="${esc(diaCorto(x.dia, { weekday: 'long', day: 'numeric', month: 'short' }))}: ${pesos(v)} · ${x.tickets} tickets">
        ${!mes && v ? `<em>${v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : Math.round(v)}</em>` : ''}
        <span style="height:${futuro ? 0 : Math.max(v ? 3 : 0, Math.round((v / max) * 100))}%"></span>
        <i>${mes ? (i % 5 === 0 || i === dias.length - 1 ? aFecha(x.dia).getUTCDate() : '') : diaCorto(x.dia, { weekday: 'short' }).replace('.', '')}</i></div>`; }).join('')}</div>
    ${mejor >= 0 && vals[mejor] > 0 ? `<p class="ayuda">Mejor día: <b>${esc(diaCorto(dias[mejor].dia, { weekday: 'long', day: 'numeric', month: 'short' }))}</b> con ${pesos(vals[mejor])}.</p>` : ''}`;
}

// ---------- vista de un día ----------
function graficaHoras(horas) {
  const vals = horas.map((x) => Number(x.ventas || 0));
  if (!vals.some((v) => v)) return '<p class="detalle" style="margin-top:12px">Sin ventas registradas este día.</p>';
  const max = Math.max(...vals, 1);
  const mejor = vals.indexOf(Math.max(...vals));
  return `<div class="graf-ventas mes" role="img" aria-label="Ventas por hora">
    ${horas.map((x, i) => `<div class="gv-dia ${i === mejor ? 'mejor' : ''}" title="${x.hora}:00 · ${pesos(vals[i])} · ${x.tickets} tickets">
      <span style="height:${Math.max(vals[i] ? 3 : 0, Math.round((vals[i] / max) * 100))}%"></span><i>${x.hora % 3 === 1 ? x.hora : ''}</i></div>`).join('')}</div>
    <p class="ayuda">Ventas por hora. La hora más fuerte: <b>${horas[mejor].hora}:00 a ${horas[mejor].hora + 1}:00</b> con ${pesos(vals[mejor])}.</p>`;
}
function seccionDia(d) {
  const ts = d.turnos || [];
  let h = '<h3 class="sub-titulo">🕘 Turnos del día</h3><section class="tarjeta">';
  h += ts.length ? ts.map((t) => {
    const p = t.total ? Math.round((t.cumplidas / t.total) * 100) : null;
    const sin = t.sin_hacer || [], nsp = t.no_se_pudo || [];
    return `<div class="turno-dia"><div class="td-cab"><b>${esc(t.tipo || '')} · ${esc(t.perfil_nombre || '')}</b><span class="${color(p)}"><b>${p ?? '—'}${p == null ? '' : '%'}</b></span></div>
      <span class="sub">Abrió ${esc(horaCorta(t.abierto_en))}${t.tarde_min > 0 ? ` <span class="warn-txt">(${t.tarde_min} min tarde)</span>` : ''}
        · ${t.estado === 'abierto' ? '<span class="ok-txt">en turno</span>' : `cerró ${esc(horaCorta(t.cerrado_en))}${t.cierre_auto ? ' <span class="warn-txt">(automático)</span>' : ''}`}
        · ${t.cumplidas}/${t.total} tareas${t.tarde ? ` · ${t.tarde} tarde` : ''}</span>
      ${sin.length ? `<p class="mal-txt td-lista">Sin hacer: ${sin.map(esc).join(', ')}</p>` : ''}
      ${nsp.length ? `<p class="warn-txt td-lista">No se pudo: ${nsp.map((x) => `${esc(x.nombre)}${x.razon ? ` (“${esc(x.razon)}”)` : ''}`).join(', ')}</p>` : ''}
      ${t.nota_relevo ? `<p class="td-lista">📝 “${esc(t.nota_relevo)}”</p>` : ''}</div>`;
  }).join('') : '<p class="detalle" style="margin:0">No hubo turnos en la app este día.</p>';
  h += '</section>';
  const inc = d.incidencias || [];
  if (inc.length) h += `<h3 class="sub-titulo">📌 Reportado este día</h3><section class="tarjeta"><ul class="lista-tab">${inc.map((x) => `<li><span>${x.tipo === 'incidencia' ? '🛠️' : '📌'} ${esc(x.titulo)}</span><b><small>${esc(x.creado_por || '')} · ${esc(horaCorta(x.creado_en))}</small></b></li>`).join('')}</ul></section>`;
  return h;
}
