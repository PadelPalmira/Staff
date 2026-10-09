// Inventario para admin y gerencia: Pedidos (verificar), Conteos (iniciar, revisar, cobrar), Loyverse (sincronizar) y Catálogo (+ ajustes).
import * as api from '../api.js';
import { esc, $, $$, aviso, ventana, confirmar, conOcupado, fechaCorta, fechaHora, horaCorta, cantidad, pesos, plural } from '../ui.js';
import { leerExportLoyverse, generarImportacion, descargarTexto, leerArchivo } from '../csv.js';

const ERR = {
  sin_permiso: 'No tienes permiso para esto.', no_existe: 'Ya no existe.', ya_cargado: 'Ese pedido ya se cargó a Loyverse.',
  cantidad_invalida: 'Revisa las cantidades (mayores a 0).', articulo_sin_catalogo: 'Hay artículos sin asignar al catálogo: elige cuál es o quítalo.',
  sin_articulos: 'El pedido se quedó sin artículos; mejor cancélalo.', falta_comentario: 'Escribe el motivo (mínimo 3 letras).',
  export_viejo: 'El export tiene más de 2 horas. Sube uno nuevo para no borrar ventas.', articulo_fuera_export: 'Hay artículos que no vienen en este export de Loyverse.',
  ya_confirmada: 'Esa carga ya se había confirmado.', no_enviado: 'El conteo todavía no se envía.', no_cancelable: 'Ese conteo ya no se puede cancelar.',
  valor_invalido: 'Valor no válido.', factor_invalido: 'La equivalencia debe ser mayor a 0.', perfil_invalido: 'Hay un empleado que ya no existe.',
};
const msg = (r) => ERR[r?.error] || r?.mensaje || 'No se pudo completar. Intenta de nuevo.';
const COLS_ART = 'id,handle,nombre,categoria,sigue_inventario,tiene_receta,precio,costo,activo,es_insumo,unidad,empaque_nombre,empaque_factor,familia,en_ultimo_export';
const contable = (a) => a.activo && a.sigue_inventario && !a.tiene_receta && a.en_ultimo_export;
const fecha = (d) => fechaCorta(`${d}T12:00:00`);
const unidadTxt = (a, n) => plural(a?.unidad || 'pieza', n);
const DIAS = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];

async function rpc(nombre, args) {
  try { return await api.rpc(nombre, args); } catch (e) { return { ok: false, error: e.codigo === 'sin_conexion' ? 'sin_conexion' : 'error', mensaje: e.message }; }
}
async function articulos() { return api.seleccionar('inv_articulos', `select=${COLS_ART}&order=categoria.asc.nullslast,nombre.asc`); }

// Subir un export de Loyverse (archivo .csv). Devuelve { export_id, parsed } o null.
async function subirExport(file, motivo) {
  let parsed;
  try { parsed = leerExportLoyverse(await leerArchivo(file)); } catch (e) { aviso(e.message, 'error', 7000); return null; }
  const r = await rpc('inv_export_subir', {
    p_motivo: motivo, p_columnas: parsed.columnas, p_tienda: parsed.tienda,
    p_filas: parsed.filas.map((f) => ({ handle: f.handle, ref: f.ref, nombre: f.nombre, categoria: f.categoria, sigue: f.sigue, receta: f.receta, precio: f.precio, costo: f.costo, stock: f.stock, fila: f.fila })),
  });
  if (!r.ok) { aviso(msg(r), 'error'); return null; }
  return { ...r, parsed };
}
const inputArchivo = (id) => `<label class="btn ghost archivo" for="${id}">📄 Elegir archivo .csv de Loyverse<input id="${id}" type="file" accept=".csv,text/csv"></label>`;

export function montarInventario(el, ctx, yo) {
  let seg = api.leerLocal('ppstaff-inv-seg') || 'pedidos';
  el.innerHTML = `<div class="enc-seccion"><h2>Inventario</h2></div>
    <div class="segmentos cuatro" role="tablist"><button type="button" data-seg="pedidos">Pedidos</button><button type="button" data-seg="conteos">Conteos</button>
      <button type="button" data-seg="loyverse">Loyverse</button><button type="button" data-seg="catalogo">Catálogo</button></div>
    <div id="inv-cont"></div>`;
  function poner(s) {
    seg = s; api.guardarLocal('ppstaff-inv-seg', s);
    $$('[data-seg]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.seg === s)));
    const actual = $('#inv-cont', el);
    const nuevo = actual.cloneNode(false); actual.replaceWith(nuevo);
    ({ pedidos: segPedidos, conteos: segConteos, loyverse: segLoyverse, catalogo: segCatalogo })[s](nuevo, yo, poner);
  }
  $('.segmentos', el).addEventListener('click', (e) => { const b = e.target.closest('[data-seg]'); if (b) poner(b.dataset.seg); });
  poner(seg);
}

// ================= PEDIDOS =================
async function segPedidos(el) {
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  let peds, arts;
  try {
    [peds, arts] = await Promise.all([
      api.seleccionar('inv_pedidos', 'select=id,creado_en,perfil_nombre,proveedor,nota,ticket_path,estado,comentario,verificado_en,cargado_en,inv_pedido_items(id,articulo_id,nombre_nuevo,cantidad,en_empaques,unidades,quitado)&order=creado_en.desc&limit=60'),
      articulos(),
    ]);
  } catch (e) { el.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
  const mapa = new Map(arts.map((a) => [a.id, a]));
  const grupo = (titulo, l, ayuda = '') => (l.length ? `<h3 class="sub-titulo">${titulo} (${l.length})</h3>${ayuda}<div class="lista">${l.map(filaPed).join('')}</div>` : '');
  function filaPed(p) {
    const its = p.inv_pedido_items.filter((i) => !i.quitado);
    const nuevos = its.filter((i) => !i.articulo_id).length;
    const ins = { enviado: '<span class="insignia aviso-i">Por verificar</span>', verificado: '<span class="insignia">Verificado</span>', cargado: '<span class="insignia gris">Cargado</span>', cancelado: '<span class="insignia mal">Cancelado</span>' }[p.estado];
    return `<button type="button" class="fila" data-ped="${esc(p.id)}"><div class="fila-txt"><b>${esc(p.perfil_nombre)}${p.proveedor ? ` · ${esc(p.proveedor)}` : ''}</b>
      <span>${esc(fechaHora(p.creado_en))} · ${its.length} artículo${its.length === 1 ? '' : 's'}${nuevos ? ` · <span class="warn-txt">${nuevos} nuevo${nuevos === 1 ? '' : 's'}</span>` : ''}</span></div>${ins}</button>`;
  }
  if (!peds.length) { el.innerHTML = '<div class="tarjeta vacio"><p><b>Todavía no hay pedidos.</b></p><p>Los empleados los registran desde el celular del club (Inventario > Recibir pedido).</p></div>'; return; }
  el.innerHTML = grupo('Por verificar', peds.filter((p) => p.estado === 'enviado'), '<p class="ayuda">Compara lo capturado contra la foto del ticket.</p>')
    + grupo('Verificados, por cargar a Loyverse', peds.filter((p) => p.estado === 'verificado'))
    + grupo('Anteriores', peds.filter((p) => p.estado === 'cargado' || p.estado === 'cancelado').slice(0, 20));
  el.onclick = (e) => { const b = e.target.closest('[data-ped]'); if (b) verPedido(peds.find((p) => p.id === b.dataset.ped), arts, mapa, () => segPedidos(el)); };
}

async function verPedido(p, arts, mapa, alCambiar) {
  const editable = p.estado === 'enviado' || p.estado === 'verificado';
  const its = p.inv_pedido_items.filter((i) => !i.quitado).map((i) => ({ ...i }));
  const opciones = (sel) => `<option value="">— Elegir artículo del catálogo —</option>${arts.filter((a) => a.sigue_inventario && !a.tiene_receta).map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}`;
  const v = ventana('<p class="cargando">Cargando…</p>', { titulo: 'Pedido recibido' });
  function pintar() {
    v.poner(`<dl class="datos"><dt>Recibió</dt><dd>${esc(p.perfil_nombre)} · ${esc(fechaHora(p.creado_en))}</dd>
        ${p.proveedor ? `<dt>Proveedor</dt><dd>${esc(p.proveedor)}</dd>` : ''}${p.nota ? `<dt>Nota</dt><dd>${esc(p.nota)}</dd>` : ''}
        ${p.comentario ? `<dt>Comentario</dt><dd>${esc(p.comentario)}</dd>` : ''}</dl>
      <div class="ticket-grande" id="vp-ticket"><p class="ayuda">Cargando foto del ticket…</p></div>
      <h3 class="sub-titulo">Artículos</h3>
      <div class="lista" id="vp-items">${its.map((i, n) => {
        const a = mapa.get(i.articulo_id);
        return `<div class="fila inv item-ver" data-n="${n}"><div class="fila-txt">
          ${i.articulo_id ? `<b>${esc(a?.nombre || '¿?')}</b>` : `<b class="warn-txt">Nuevo: ${esc(i.nombre_nuevo)}</b>`}
          ${editable && !i.articulo_id ? `<select data-art>${opciones(i.articulo_id)}</select>` : ''}
          ${!editable ? `<span>${esc(cantidad(i.cantidad))} ${esc(i.en_empaques ? plural(a?.empaque_nombre, i.cantidad) : unidadTxt(a, i.cantidad))} = ${esc(cantidad(i.unidades))} ${esc(unidadTxt(a, i.unidades))}</span>` : ''}</div>
          ${editable ? `<div class="cant-ped"><input type="number" inputmode="decimal" min="0" step="any" data-cant value="${esc(i.cantidad)}">
            ${a?.empaque_nombre ? `<select data-modo><option value="1" ${i.en_empaques ? 'selected' : ''}>${esc(plural(a.empaque_nombre, 2))}</option><option value="0" ${!i.en_empaques ? 'selected' : ''}>${esc(unidadTxt(a, 2))}</option></select>` : `<span class="unidad">${esc(unidadTxt(a, 2))}</span>`}
            <button type="button" class="icono-btn" data-quitar aria-label="Quitar">✕</button></div>` : ''}</div>`;
      }).join('')}</div>
      ${editable ? `<div class="campo" style="margin-top:10px"><label for="vp-add">Agregar artículo que faltó capturar</label><select id="vp-add">${opciones(null)}</select></div>
        <div class="campo"><label for="vp-com">Comentario <span class="opc">(lo ve el empleado)</span></label><input id="vp-com" type="text" value="${esc(p.comentario || '')}"></div>
        <div class="acciones" style="margin-top:12px"><button type="button" class="btn" data-verificar>${p.estado === 'verificado' ? 'Guardar cambios' : 'Verificado: coincide con el ticket'}</button>
          <button type="button" class="btn peligro-suave" data-cancelar>Cancelar pedido</button></div>` : '<div class="acciones"><button type="button" class="btn ghost" data-cerrar>Cerrar</button></div>'}`);
    if (p.ticket_path) api.urlsFotos([{ path: p.ticket_path }], 'tickets').then((m) => {
      const u = m.get(`${p.ticket_path}|`); const t = $('#vp-ticket', v.el);
      if (t) t.innerHTML = u ? `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Ticket del pedido"></a><p class="ayuda">Toca la foto para verla en grande.</p>` : '<p class="ayuda">No se pudo cargar la foto del ticket.</p>';
    });
  }
  pintar();
  v.el.addEventListener('input', (e) => { const f = e.target.closest('[data-n]'); if (f && e.target.matches('[data-cant]')) its[Number(f.dataset.n)].cantidad = e.target.value; });
  v.el.addEventListener('change', (e) => {
    const f = e.target.closest('[data-n]');
    if (f && e.target.matches('[data-modo]')) its[Number(f.dataset.n)].en_empaques = e.target.value === '1';
    if (f && e.target.matches('[data-art]')) { its[Number(f.dataset.n)].articulo_id = e.target.value || null; pintar(); }
    if (e.target.id === 'vp-add' && e.target.value) { const a = mapa.get(e.target.value); its.push({ id: null, articulo_id: a.id, cantidad: '', en_empaques: !!a.empaque_nombre }); pintar(); }
  });
  v.el.addEventListener('click', async (e) => {
    const q = e.target.closest('[data-quitar]');
    if (q) { its.splice(Number(q.closest('[data-n]').dataset.n), 1); pintar(); return; }
    if (e.target.closest('[data-verificar]')) {
      const borrados = p.inv_pedido_items.filter((x) => !x.quitado && !its.some((i) => i.id === x.id)).map((x) => ({ id: x.id, borrar: true }));
      const items = [...borrados, ...its.map((i) => ({ id: i.id || null, articulo_id: i.articulo_id, cantidad: Number(i.cantidad), en_empaques: !!i.en_empaques }))];
      return conOcupado(e.target.closest('[data-verificar]'), async () => {
        const r = await rpc('inv_pedido_verificar', { p_id: p.id, p_items: items, p_comentario: $('#vp-com', v.el).value });
        if (!r.ok) return aviso(msg(r), 'error');
        v.cerrar(); aviso('Pedido verificado. Se cargará a Loyverse en la próxima sincronización.', 'ok', 5000); alCambiar();
      });
    }
    if (e.target.closest('[data-cancelar]')) {
      const f = ventana(`<form class="formulario" novalidate><div class="campo"><label for="pc-m">Motivo</label><input id="pc-m" type="text" placeholder="Ej. se capturó dos veces"></div>
        <button class="btn peligro" type="submit">Cancelar pedido</button></form>`, { titulo: 'Cancelar pedido' });
      $('form', f.el).addEventListener('submit', (ev) => {
        ev.preventDefault();
        conOcupado($('button', f.el), async () => {
          const r = await rpc('inv_pedido_cancelar', { p_id: p.id, p_comentario: $('#pc-m', f.el).value });
          if (!r.ok) return aviso(msg(r), 'error');
          f.cerrar(); v.cerrar(); aviso('Pedido cancelado.', 'ok'); alCambiar();
        });
      });
    }
  });
}

// ================= CONTEOS =================
async function segConteos(el) {
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  let conteos, perfiles, tipos, ajustes;
  try {
    [conteos, perfiles, tipos, ajustes] = await Promise.all([
      api.seleccionar('inv_conteos', 'select=id,fecha,estado,asignado_tipo,asignado_perfil,contado_por_nombre,iniciado_en,enviado_en,revisado_en,faltante,sobrante,deuda,ajuste_aplicado_en&order=creado_en.desc&limit=20'),
      api.seleccionar('perfiles', 'select=id,nombre_completo,rol,estado&rol=eq.recepcion&estado=eq.activo&order=nombre_completo.asc'),
      api.seleccionar('tipos_turno', 'select=clave,nombre&activo=eq.true&order=orden.asc'),
      api.seleccionar('ajustes', 'select=clave,valor'),
    ]);
  } catch (e) { el.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
  const aj = Object.fromEntries(ajustes.map((a) => [a.clave, a.valor]));
  const abierto = conteos.find((c) => c.estado === 'abierto');
  const asignadoTxt = (c) => (c.asignado_perfil ? (perfiles.find((p) => p.id === c.asignado_perfil)?.nombre_completo || 'empleado') : c.asignado_tipo === 'cualquiera' ? 'cualquier turno' : `turno ${tipos.find((t) => t.clave === c.asignado_tipo)?.nombre || c.asignado_tipo}`);
  let h = '';
  if (abierto) {
    h += `<section class="tarjeta conteo-pend"><h2>Conteo abierto</h2><p class="detalle">Del ${esc(fecha(abierto.fecha))} · lo hace ${esc(asignadoTxt(abierto))}.
      ${abierto.iniciado_en ? `Lo empezó ${esc(abierto.contado_por_nombre || '')} a las ${esc(horaCorta(abierto.iniciado_en))}.` : 'Nadie lo ha empezado.'}</p>
      <button type="button" class="btn peligro-suave" data-cancelar-conteo="${esc(abierto.id)}">Cancelar conteo</button></section>`;
  } else {
    h += `<section class="tarjeta"><h2>Iniciar conteo</h2>
      <ol class="pasos"><li>Que no haya clientes ni tickets abiertos.</li><li>En Loyverse: Artículos › Lista de artículos › <b>Exportar</b>.</li><li>Sube aquí ese archivo: con eso se desbloquea el conteo en el celular del club.</li></ol>
      <div class="campo"><label for="co-quien">¿Quién cuenta?</label><select id="co-quien">
        ${tipos.map((t) => `<option value="tipo:${esc(t.clave)}" ${t.clave === aj.inv_conteo_turno ? 'selected' : ''}>Quien esté en el turno ${esc(t.nombre)}</option>`).join('')}
        <option value="tipo:cualquiera" ${aj.inv_conteo_turno === 'cualquiera' ? 'selected' : ''}>Cualquier turno abierto</option>
        ${perfiles.map((p) => `<option value="perfil:${esc(p.id)}">${esc(p.nombre_completo)}</option>`).join('')}</select></div>
      ${inputArchivo('co-archivo')}</section>`;
  }
  h += '<h3 class="sub-titulo">Conteos</h3>';
  h += conteos.filter((c) => c.estado !== 'abierto').length ? `<div class="lista">${conteos.filter((c) => c.estado !== 'abierto').map((c) => {
    const ins = { enviado: '<span class="insignia aviso-i">Por revisar</span>', revisado: `<span class="insignia ${Number(c.deuda) > 0 ? 'mal' : ''}">${Number(c.deuda) > 0 ? `Debe ${esc(pesos(c.deuda))}` : 'Sin deuda'}</span>`, cancelado: '<span class="insignia gris">Cancelado</span>' }[c.estado] || '';
    return `<button type="button" class="fila" data-conteo="${esc(c.id)}" ${c.estado === 'cancelado' ? 'disabled' : ''}><div class="fila-txt"><b>Conteo del ${esc(fecha(c.fecha))}</b>
      <span>${c.contado_por_nombre ? `Contó ${esc(c.contado_por_nombre)}` : ''}${c.enviado_en ? ` · ${esc(fechaHora(c.enviado_en))}` : ''}${c.estado === 'revisado' && !c.ajuste_aplicado_en ? ' · ajuste pendiente en Loyverse' : ''}</span></div>${ins}</button>`;
  }).join('')}</div>` : '<p class="detalle">Todavía no hay conteos.</p>';
  h += `<details class="bitacora"><summary>Días y horarios del conteo</summary>${formAjustesConteo(aj, tipos)}</details>`;
  el.innerHTML = h;
  activarAjustes(el, () => segConteos(el));
  $('#co-archivo', el)?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const lbl = e.target.closest('label'); lbl.classList.add('ocupado');
    try {
      const sub = await subirExport(f, 'conteo'); if (!sub) return;
      const [tipo, val] = $('#co-quien', el).value.split(':');
      const r = await rpc('inv_conteo_crear', { p_export: sub.export_id, p_tipo: tipo === 'tipo' ? val : null, p_perfil: tipo === 'perfil' ? val : null });
      if (!r.ok) return aviso(msg(r), 'error');
      aviso(`Conteo desbloqueado (${sub.articulos} artículos${sub.nuevos ? `, ${sub.nuevos} nuevos en el catálogo` : ''}).`, 'ok', 6000);
      segConteos(el);
    } finally { lbl.classList.remove('ocupado'); e.target.value = ''; }
  });
  el.onclick = async (e) => {
    const cc = e.target.closest('[data-cancelar-conteo]');
    if (cc) {
      if (!await confirmar({ titulo: 'Cancelar conteo', texto: 'Se descarta lo que se haya contado. ¿Cancelar?', ok: 'Cancelar conteo', peligro: true })) return;
      const r = await rpc('inv_conteo_cancelar', { p_id: cc.dataset.cancelarConteo });
      if (!r.ok) return aviso(msg(r), 'error');
      return segConteos(el);
    }
    const b = e.target.closest('[data-conteo]');
    if (b) verConteo(b.dataset.conteo, () => segConteos(el));
  };
}

// Parejas probables: cada sobrante se empareja con el faltante más parecido (misma familia > misma categoría > precio parecido)
export function sugerirParejas(items) {
  const falt = items.filter((i) => !i.es_insumo && i.diferencia < 0).map((i) => ({ ...i, resto: -i.diferencia }));
  const sobr = items.filter((i) => !i.es_insumo && i.diferencia > 0).map((i) => ({ ...i, resto: i.diferencia }));
  const parejas = [];
  const puntaje = (s, f) => (s.familia && s.familia === f.familia ? 0 : s.categoria === f.categoria ? 1000 : 2000) + Math.abs((s.precio || 0) - (f.precio || 0));
  for (const s of sobr.sort((a, b) => (b.precio || 0) - (a.precio || 0))) {
    while (s.resto > 0) {
      const cand = falt.filter((f) => f.resto > 0).sort((a, b) => puntaje(s, a) - puntaje(s, b))[0];
      if (!cand) break;
      const n = Math.min(s.resto, cand.resto);
      parejas.push({ sobra: s, falta: cand, n, dif: n * ((cand.precio || 0) - (s.precio || 0)), misma: s.familia && s.familia === cand.familia });
      s.resto -= n; cand.resto -= n;
    }
  }
  return parejas;
}

async function verConteo(id, alCambiar) {
  const v = ventana('<p class="cargando">Cargando…</p>', { titulo: 'Conteo de inventario' });
  const r = await rpc('inv_conteo_resultado', { p_id: id });
  if (!r.ok) { v.poner(`<p class="detalle">${esc(msg(r))}</p>`); return; }
  const c = r.conteo, tol = r.tolerancia_insumos;
  const items = r.items.map((i) => ({ ...i, diferencia: Number(i.diferencia || 0), precio: i.precio == null ? null : Number(i.precio) }));
  const noCobrar = new Map(items.filter((i) => i.no_cobrar).map((i) => [i.articulo_id, i.motivo_no_cobrar || '']));
  const cobrosPrev = new Map((r.cobros || []).map((b) => [b.perfil_id, b]));
  const conDif = items.filter((i) => i.diferencia !== 0);
  const prod = conDif.filter((i) => !i.es_insumo), ins = items.filter((i) => i.es_insumo);
  const totales = () => {
    let falt = 0, sobr = 0;
    for (const i of prod) { if (noCobrar.has(i.articulo_id)) continue; const val = Math.abs(i.diferencia) * (i.precio || 0); if (i.diferencia < 0) falt += val; else sobr += val; }
    return { falt, sobr, deuda: Math.max(0, falt - sobr) };
  };
  const parejas = sugerirParejas(prod.filter((i) => !noCobrar.has(i.articulo_id)));
  const fmtDif = (i) => `${i.diferencia > 0 ? '+' : ''}${cantidad(i.diferencia)} ${unidadTxt(i, Math.abs(i.diferencia))}`;
  const totalTurnos = r.trabajaron.reduce((s, t) => s + t.turnos, 0) || 1;
  function pintar() {
    const t = totales();
    v.poner(`<p class="detalle" style="margin-top:0">Conteo del ${esc(fecha(c.fecha))} · contó ${esc(c.contado_por_nombre || '¿?')}${c.enviado_en ? ` · ${esc(fechaHora(c.enviado_en))}` : ''}.
      Esperado = Loyverse al momento del conteo + pedidos que llegaron y aún no se cargaban.</p>
      <div class="cifras tres"><div><b class="mal-txt">${esc(pesos(t.falt))}</b><span>Faltante</span></div><div><b class="ok-txt">${esc(pesos(t.sobr))}</b><span>Sobrante</span></div>
        <div><b>${esc(pesos(t.deuda))}</b><span>Deuda (faltante − sobrante)</span></div></div>
      ${prod.length ? `<h3 class="sub-titulo">Diferencias (a precio de venta)</h3><div class="tabla-dif">${prod.map((i) => `
        <div class="dif-fila ${noCobrar.has(i.articulo_id) ? 'apagada' : ''}" data-art="${esc(i.articulo_id)}">
          <div class="dif-txt"><b>${esc(i.nombre)}</b><span>Esperado ${esc(cantidad(i.esperado))} · contado ${esc(cantidad(i.contado))}${i.precio == null ? ' · <span class="warn-txt">precio variable: $0</span>' : ''}</span></div>
          <div class="dif-num ${i.diferencia < 0 ? 'mal-txt' : 'ok-txt'}"><b>${esc(fmtDif(i))}</b><span>${esc(pesos(Math.abs(i.diferencia) * (i.precio || 0)))}</span></div>
          <label class="no-cobrar"><input type="checkbox" data-nocobrar ${noCobrar.has(i.articulo_id) ? 'checked' : ''}> No cobrar</label>
        </div>`).join('')}</div>` : '<p class="nota-info">Todo cuadró en los productos. 🎉</p>'}
      ${parejas.length ? `<h3 class="sub-titulo">Dónde probablemente se equivocaron</h3><ul class="parejas">${parejas.map((p) => `<li>${p.misma ? '🔁' : '↔︎'} Registraron <b>${esc(p.sobra.nombre)}</b> pero entregaron <b>${esc(p.falta.nombre)}</b>${p.n > 1 ? ` (×${esc(cantidad(p.n))})` : ''}
        <span>${p.dif > 0 ? `faltan ${esc(pesos(p.dif))}` : p.dif < 0 ? `sobran ${esc(pesos(-p.dif))}` : 'mismo precio'}${p.misma ? ' · mismo producto, otro sabor' : ''}</span></li>`).join('')}</ul>` : ''}
      ${ins.length ? `<h3 class="sub-titulo">Insumos (solo reporte, no se cobran · tolerancia ${tol}%)</h3><div class="tabla-dif">${ins.map((i) => {
        const pct = i.esperado ? Math.abs(i.diferencia) / Math.abs(i.esperado) * 100 : (i.diferencia ? 100 : 0);
        return `<div class="dif-fila"><div class="dif-txt"><b>${esc(i.nombre)}</b><span>Esperado ${esc(cantidad(i.esperado))} · contado ${esc(cantidad(i.contado))} ${esc(unidadTxt(i, 2))}</span></div>
          <div class="dif-num ${pct > tol ? 'mal-txt' : ''}"><b>${esc(fmtDif(i))}</b><span>${pct > tol ? `fuera de tolerancia (${Math.round(pct)}%)` : `${Math.round(pct)}% · ok`}</span></div></div>`;
      }).join('')}</div>` : ''}
      <h3 class="sub-titulo">Cobro</h3>
      ${r.desde ? '' : '<p class="nota-aviso">Este es el PRIMER conteo: sirve como línea base (el inventario de Loyverse venía descuadrado). Lo normal es no cobrar nada; al sincronizar, Loyverse queda igual a lo que se contó.</p>'}
      <p class="ayuda">Trabajaron desde el conteo anterior${r.desde ? ` (${esc(fecha(r.desde))})` : ''}. La app sugiere repartir según sus turnos; tú decides.</p>
      <div class="lista" id="cv-cobros">${r.trabajaron.length ? r.trabajaron.map((p) => {
        const prev = cobrosPrev.get(p.perfil_id);
        const sug = Math.round(t.deuda * p.turnos / totalTurnos * 100) / 100;
        return `<div class="fila inv cobro" data-perfil="${esc(p.perfil_id)}"><div class="fila-txt"><b>${esc(p.nombre)}</b><span>${p.turnos} turno${p.turnos === 1 ? '' : 's'} · sugerido ${esc(pesos(sug))}</span></div>
          <div class="cobro-ctl"><input type="number" inputmode="decimal" min="0" step="any" data-monto value="${esc(prev ? prev.monto : (t.deuda > 0 && r.desde ? sug : 0))}" aria-label="Monto">
          <select data-via><option value="app" ${prev?.por_app ? 'selected' : ''}>Mandar por la app</option><option value="persona" ${prev && !prev.por_app ? 'selected' : ''}>Lo veo en persona</option></select></div></div>`;
      }).join('') : '<p class="detalle">No hay turnos registrados en ese periodo.</p>'}</div>
      <div class="campo" style="margin-top:10px"><label for="cv-notas">Notas <span class="opc">(internas)</span></label><input id="cv-notas" type="text" value="${esc(c.notas || '')}"></div>
      <div class="acciones" style="margin-top:12px"><button type="button" class="btn" data-guardar>${c.estado === 'revisado' ? 'Guardar cambios' : 'Guardar revisión'}</button>
        <p class="ayuda">Al guardar, la diferencia del conteo queda pendiente para la próxima sincronización con Loyverse (así Loyverse queda igual a lo real).</p></div>`);
  }
  pintar();
  v.el.addEventListener('change', (e) => {
    const f = e.target.closest('[data-art]');
    if (f && e.target.matches('[data-nocobrar]')) {
      if (e.target.checked) noCobrar.set(f.dataset.art, ''); else noCobrar.delete(f.dataset.art);
      const vals = [...$$('#cv-cobros [data-perfil]', v.el)].map((x) => [x.dataset.perfil, $('[data-monto]', x).value, $('[data-via]', x).value]);
      pintar();
      for (const [pid, , via] of vals) { const x = $(`#cv-cobros [data-perfil="${pid}"]`, v.el); if (x) $('[data-via]', x).value = via; }
    }
  });
  v.el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-guardar]');
    if (!g) return;
    const cobros = $$('#cv-cobros [data-perfil]', v.el).map((x) => ({ perfil_id: x.dataset.perfil, monto: Number($('[data-monto]', x).value) || 0, por_app: $('[data-via]', x).value === 'app' }));
    const suma = cobros.reduce((s, b) => s + b.monto, 0), t = totales();
    conOcupado(g, async () => {
      if (Math.abs(suma - t.deuda) > 0.5 && !await confirmar({ titulo: 'Montos distintos a la deuda', texto: `La deuda es ${pesos(t.deuda)} y los cobros suman ${pesos(suma)}. ¿Guardar así?`, ok: 'Guardar así' })) return;
      const r2 = await rpc('inv_conteo_revisar', { p_id: c.id, p_no_cobrar: Object.fromEntries(noCobrar), p_cobros: cobros, p_notas: $('#cv-notas', v.el).value });
      if (!r2.ok) return aviso(msg(r2), 'error');
      v.cerrar();
      const app = cobros.filter((b) => b.por_app && b.monto > 0).length;
      aviso(`Revisión guardada. Deuda ${pesos(r2.deuda)}${app ? ` · enviado por la app a ${app} empleado${app === 1 ? '' : 's'}` : ''}.`, 'ok', 6000);
      alCambiar();
    });
  });
}

// ================= LOYVERSE (sincronizar) =================
async function segLoyverse(el) {
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  let peds, conts, cargas, ajustes;
  try {
    [peds, conts, cargas, ajustes] = await Promise.all([
      api.seleccionar('inv_pedidos', 'select=id,estado,perfil_nombre,creado_en&estado=in.(enviado,verificado)'),
      api.seleccionar('inv_conteos', 'select=id,fecha&estado=eq.revisado&ajuste_aplicado_en=is.null'),
      api.seleccionar('inv_cargas', 'select=id,creado_en,confirmado_en,pedidos,conteos&order=creado_en.desc&limit=5'),
      api.seleccionar('ajustes', 'select=clave,valor'),
    ]);
  } catch (e) { el.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
  const aj = Object.fromEntries(ajustes.map((a) => [a.clave, a.valor]));
  const ver = peds.filter((p) => p.estado === 'verificado').length, sinVer = peds.filter((p) => p.estado === 'enviado').length;
  const diasTxt = String(aj.inv_carga_dias || '5').split(',').map((d) => ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][d]).join(' y ');
  let h = `<section class="tarjeta"><h2>Sincronizar Loyverse</h2>
    <p class="detalle">Toca los ${esc(diasTxt)} a las ${esc(aj.inv_carga_hora || '09:00')}. Pendiente: <b>${ver}</b> pedido${ver === 1 ? '' : 's'} verificado${ver === 1 ? '' : 's'}${conts.length ? ` y el ajuste de ${conts.length} conteo${conts.length === 1 ? '' : 's'}` : ''}.</p>
    ${sinVer ? `<p class="nota-aviso">${sinVer} pedido${sinVer === 1 ? '' : 's'} sin verificar no entra${sinVer === 1 ? '' : 'n'} en esta carga. Verifícalos primero en Pedidos.</p>` : ''}`;
  if (!ver && !conts.length) h += '<p class="nota-info">No hay nada pendiente por cargar. 👍</p></section>';
  else h += `<ol class="pasos"><li>Que no haya clientes ni tickets abiertos (si se vende algo durante estos minutos, Loyverse lo perdería).</li>
      <li>En Loyverse: Artículos › Lista de artículos › <b>Exportar</b>, y sube aquí ese archivo.</li>
      <li>Descarga el archivo que genera la app e impórtalo en Loyverse (Artículos › <b>Importar</b>).</li><li>Regresa y toca “Ya lo importé”.</li></ol>
      ${inputArchivo('ly-archivo')}<div id="ly-res"></div></section>`;
  h += `<h3 class="sub-titulo">Últimas cargas</h3>${cargas.length ? `<div class="lista">${cargas.map((g) => `<div class="fila inv"><div class="fila-txt"><b>${esc(fechaHora(g.creado_en))}</b>
    <span>${g.pedidos.length} pedido${g.pedidos.length === 1 ? '' : 's'}${g.conteos.length ? ` · ajuste de ${g.conteos.length} conteo${g.conteos.length === 1 ? '' : 's'}` : ''}</span></div>
    ${g.confirmado_en ? '<span class="insignia">Importada</span>' : `<button type="button" class="btn chico ghost" data-confirmar="${esc(g.id)}">Ya lo importé</button>`}</div>`).join('')}</div>` : '<p class="detalle">Todavía no hay cargas.</p>'}`;
  h += `<details class="bitacora"><summary>Días y hora de la carga</summary>${formAjustesCarga(aj)}</details>`;
  el.innerHTML = h;
  activarAjustes(el, () => segLoyverse(el));
  $('#ly-archivo', el)?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const lbl = e.target.closest('label'); lbl.classList.add('ocupado');
    try {
      const sub = await subirExport(f, 'carga'); if (!sub) return;
      const r = await rpc('inv_carga_preparar', { p_export: sub.export_id });
      if (!r.ok) { aviso(msg(r), 'error', 7000); return; }
      const arts = await articulos();
      const clave = new Map(arts.map((a) => [a.id, a.handle]));
      const cambios = new Map(r.lineas.map((l) => [clave.get(l.articulo_id), l.nuevo]));
      const csv = generarImportacion(sub.parsed, cambios);
      const nombre = `PPStaff_importar_loyverse_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.csv`;
      $('#ly-res', el).innerHTML = `<h3 class="sub-titulo">Cambios (${r.lineas.length} artículos)</h3><div class="tabla-dif">${r.lineas.map((l) => `<div class="dif-fila"><div class="dif-txt"><b>${esc(l.nombre)}</b>
        <span>Loyverse ahora ${esc(cantidad(l.stock_export))}${Number(l.pedidos) ? ` · +${esc(cantidad(l.pedidos))} pedidos` : ''}${Number(l.ajuste) ? ` · ${Number(l.ajuste) > 0 ? '+' : ''}${esc(cantidad(l.ajuste))} conteo` : ''}</span></div>
        <div class="dif-num"><b>${esc(cantidad(l.nuevo))}</b><span>${esc(unidadTxt(l, l.nuevo))}</span></div></div>`).join('')}</div>
        <div class="acciones" style="margin-top:12px"><button type="button" class="btn" data-descargar>⬇︎ Descargar archivo para Loyverse</button>
        <button type="button" class="btn ghost" data-confirmar="${esc(r.carga_id)}">Ya lo importé en Loyverse</button></div>`;
      $('[data-descargar]', el).onclick = () => descargarTexto(nombre, csv);
      descargarTexto(nombre, csv);
    } finally { lbl.classList.remove('ocupado'); e.target.value = ''; }
  });
  el.onclick = async (e) => {
    const b = e.target.closest('[data-confirmar]');
    if (!b) return;
    if (!await confirmar({ titulo: 'Confirmar importación', texto: '¿Ya importaste el archivo en Loyverse y se aplicó sin errores?', ok: 'Sí, ya está' })) return;
    conOcupado(b, async () => {
      const r = await rpc('inv_carga_confirmar', { p_id: b.dataset.confirmar });
      if (!r.ok) return aviso(msg(r), 'error');
      aviso('Listo: pedidos marcados como cargados.', 'ok'); segLoyverse(el);
    });
  };
}

// ================= CATÁLOGO =================
async function segCatalogo(el) {
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  let arts;
  try { arts = await articulos(); } catch (e) { el.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
  let filtro = '', soloInv = true;
  const head = `<p class="sub">El catálogo se actualiza solo cada vez que se sube un export de Loyverse. Aquí defines empaques (ej. caja = 24 piezas, cartón = 1000 ml), insumos y familias de sabores.</p>
    ${arts.length ? '' : `<section class="tarjeta"><h2>Crear catálogo</h2><p class="detalle">Sube el export de artículos de Loyverse (Artículos › Exportar).</p>${inputArchivo('cat-archivo')}</section>`}
    <div class="conteo-barra"><input id="cat-buscar" type="text" placeholder="Buscar…" autocomplete="off">
      <label class="interruptor chico"><input type="checkbox" id="cat-solo" checked><span>Solo con inventario</span></label></div>
    <div id="cat-lista"></div>
    ${arts.length ? `<details class="bitacora"><summary>Actualizar catálogo desde Loyverse</summary><p class="ayuda">Úsalo si diste de alta artículos nuevos en Loyverse.</p>${inputArchivo('cat-archivo')}</details>` : ''}`;
  el.innerHTML = head;
  const lista = $('#cat-lista', el);
  function pintar() {
    const l = arts.filter((a) => (!soloInv || (a.sigue_inventario && !a.tiene_receta)) && (!filtro || a.nombre.toLowerCase().includes(filtro)));
    const cats = [...new Set(l.map((a) => a.categoria || 'Sin categoría'))];
    lista.innerHTML = cats.map((cat) => `<h3 class="sub-titulo">${esc(cat)}</h3><div class="lista">${l.filter((a) => (a.categoria || 'Sin categoría') === cat).map((a) => `
      <button type="button" class="fila ${contable(a) ? '' : 'apagada'}" data-art="${esc(a.id)}"><div class="fila-txt"><b>${esc(a.nombre)}</b>
      <span>${a.precio != null ? esc(pesos(a.precio)) : 'precio variable'} · ${a.empaque_nombre ? `1 ${esc(a.empaque_nombre)} = ${esc(cantidad(a.empaque_factor))} ${esc(unidadTxt(a, a.empaque_factor))}` : esc(a.unidad)}${a.familia ? ` · familia ${esc(a.familia)}` : ''}</span></div>
      <div class="fila-ins">${!a.activo ? '<span class="insignia gris">Inactivo</span>' : ''}${a.es_insumo ? '<span class="insignia aviso-i">Insumo</span>' : ''}${a.tiene_receta ? '<span class="insignia gris">Receta</span>' : ''}${!a.en_ultimo_export ? '<span class="insignia mal">Ya no está en Loyverse</span>' : ''}</div></button>`).join('')}</div>`).join('')
      || '<p class="detalle">Sin resultados.</p>';
  }
  pintar();
  $('#cat-buscar', el).addEventListener('input', (e) => { filtro = e.target.value.trim().toLowerCase(); pintar(); });
  $('#cat-solo', el).addEventListener('change', (e) => { soloInv = e.target.checked; pintar(); });
  $$('#cat-archivo', el).forEach((inp) => inp.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const sub = await subirExport(f, 'catalogo');
    if (sub) { aviso(`Catálogo actualizado: ${sub.articulos} artículos (${sub.nuevos} nuevos).`, 'ok', 5000); segCatalogo(el); }
  }));
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-art]'); if (!b) return;
    const a = arts.find((x) => x.id === b.dataset.art);
    const v = ventana(`<form class="formulario" novalidate>
      <p class="detalle" style="margin-top:0">${esc(a.categoria || '')} · ${a.precio != null ? esc(pesos(a.precio)) : 'precio variable'}${a.costo != null ? ` · costo ${esc(pesos(a.costo))}` : ''}</p>
      <label class="interruptor"><input type="checkbox" id="ar-act" ${a.activo ? 'checked' : ''}><span>Activo (se cuenta y se puede recibir)</span></label>
      <label class="interruptor"><input type="checkbox" id="ar-ins" ${a.es_insumo ? 'checked' : ''}><span>Es insumo de recetas (leche, jamón, pan…): sale en el reporte pero no se cobra</span></label>
      <div class="campo"><label for="ar-uni">Unidad en Loyverse</label><input id="ar-uni" type="text" value="${esc(a.unidad)}" placeholder="pieza, ml, rebanada, gramo"></div>
      <div class="fila-botones" style="margin:0"><div class="campo"><label for="ar-emp">Empaque <span class="opc">(opcional)</span></label><input id="ar-emp" type="text" value="${esc(a.empaque_nombre || '')}" placeholder="caja, cartón, paquete"></div>
        <div class="campo"><label for="ar-fac">¿Cuántas unidades trae?</label><input id="ar-fac" type="number" inputmode="decimal" min="0" step="any" value="${esc(cantidad(a.empaque_factor))}"></div></div>
      <p class="ayuda">Ej. Leche: unidad “ml”, empaque “cartón”, 1000. Jamón: unidad “rebanada”, empaque “paquete”, 20. Así el empleado cuenta cartones/paquetes y la app convierte.</p>
      <div class="campo"><label for="ar-fam">Familia <span class="opc">(para detectar cobros de otro sabor)</span></label><input id="ar-fam" type="text" value="${esc(a.familia || '')}" placeholder="Ej. Gatorade 1L"></div>
      <button class="btn" type="submit">Guardar</button></form>`, { titulo: a.nombre });
    $('form', v.el).addEventListener('submit', (ev) => {
      ev.preventDefault();
      conOcupado($('button[type=submit]', v.el), async () => {
        const datos = { activo: $('#ar-act', v.el).checked, es_insumo: $('#ar-ins', v.el).checked, unidad: $('#ar-uni', v.el).value,
          empaque_nombre: $('#ar-emp', v.el).value, empaque_factor: $('#ar-fac', v.el).value || '1', familia: $('#ar-fam', v.el).value };
        const r = await rpc('inv_articulo_guardar', { p_id: a.id, p_datos: datos });
        if (!r.ok) return aviso(msg(r), 'error');
        Object.assign(a, datos, { empaque_factor: Number(datos.empaque_factor), empaque_nombre: datos.empaque_nombre.trim() || null, familia: datos.familia.trim() || null });
        v.cerrar(); aviso('Guardado.', 'ok'); pintar();
      });
    });
  });
}

// ================= AJUSTES (gerencia y admin) =================
function chipsDias(id, valor) {
  const sel = String(valor || '').split(',');
  return `<div class="chips" data-dias="${id}">${DIAS.map(([n, l]) => `<label class="chip-sel"><input type="checkbox" value="${n}" ${sel.includes(String(n)) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
}
function formAjustesConteo(aj, tipos) {
  return `<form class="formulario aj-inv" novalidate>
    <div class="campo"><label>Días de conteo</label>${chipsDias('inv_conteo_dias', aj.inv_conteo_dias)}</div>
    <div class="campo"><label for="aj-turno">Turno que cuenta (por defecto)</label><select id="aj-turno" data-clave="inv_conteo_turno">
      ${tipos.map((t) => `<option value="${esc(t.clave)}" ${aj.inv_conteo_turno === t.clave ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}<option value="cualquiera" ${aj.inv_conteo_turno === 'cualquiera' ? 'selected' : ''}>Cualquiera</option></select></div>
    <div class="fila-botones" style="margin:0"><div class="campo"><label for="aj-av">Aviso si no hay export</label><input id="aj-av" type="time" data-clave="inv_conteo_aviso_hora" value="${esc(aj.inv_conteo_aviso_hora || '09:00')}"></div>
      <div class="campo"><label for="aj-lim">Hora límite del conteo</label><input id="aj-lim" type="time" data-clave="inv_conteo_hora_limite" value="${esc(aj.inv_conteo_hora_limite || '15:00')}"></div></div>
    <div class="campo"><label for="aj-tol">Tolerancia de insumos (%)</label><input id="aj-tol" type="number" inputmode="numeric" min="0" max="99" data-clave="inv_tolerancia_insumos" value="${esc(aj.inv_tolerancia_insumos ?? 20)}"></div>
    <button class="btn" type="submit">Guardar</button></form>`;
}
function formAjustesCarga(aj) {
  return `<form class="formulario aj-inv" novalidate>
    <div class="campo"><label>Días de carga a Loyverse</label>${chipsDias('inv_carga_dias', aj.inv_carga_dias)}</div>
    <div class="campo"><label for="aj-hc">Hora del recordatorio</label><input id="aj-hc" type="time" data-clave="inv_carga_hora" value="${esc(aj.inv_carga_hora || '09:00')}"></div>
    <button class="btn" type="submit">Guardar</button></form>`;
}
function activarAjustes(el, alGuardar) {
  $$('form.aj-inv', el).forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    conOcupado($('button[type=submit]', f), async () => {
      const cambios = [];
      $$('[data-dias]', f).forEach((d) => {
        const v = $$('input:checked', d).map((i) => i.value).join(',');
        if (!v) return cambios.push([d.dataset.dias, '']);
        cambios.push([d.dataset.dias, v]);
      });
      $$('[data-clave]', f).forEach((i) => cambios.push([i.dataset.clave, i.value]));
      for (const [k, val] of cambios) {
        if (!val) return aviso('Elige al menos un día.', 'error');
        const r = await rpc('inv_ajuste_guardar', { p_clave: k, p_valor: val });
        if (!r.ok) return aviso(msg(r), 'error');
      }
      aviso('Guardado.', 'ok'); alGuardar();
    });
  }));
}
