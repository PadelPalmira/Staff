// Inventario para admin y gerencia: Pedidos (verificar → se suben solos a Loyverse), Conteos (contra Loyverse en vivo, reconteo, cobro),
// estado de la conexión con Loyverse (vigilancia de cambios raros) y Catálogo (se actualiza solo; altas/bajas/ajustes directo en Loyverse).
// Regla: el celular del club nunca escribe en Loyverse; solo gerencia/admin, y todo queda registrado.
import * as api from '../api.js';
import { esc, $, $$, aviso, ventana, confirmar, conOcupado, fechaCorta, fechaHora, horaCorta, cantidad, pesos, plural, comprimirEvidencia } from '../ui.js';
import { estiloCategoria, miniArticulo, hidratarFotosArticulos } from '../categorias.js';

const ERR = {
  sin_permiso: 'No tienes permiso para esto.', no_existe: 'Ya no existe.', ya_cargado: 'Ese pedido ya se cargó a Loyverse.',
  cantidad_invalida: 'Revisa las cantidades (mayores a 0).', articulo_sin_catalogo: 'Hay artículos sin asignar al catálogo: elige cuál es o quítalo.',
  sin_articulos: 'El pedido se quedó sin artículos; mejor cancélalo.', falta_comentario: 'Escribe el motivo (mínimo 3 letras).',
  export_viejo: 'El export tiene más de 2 horas. Sube uno nuevo para no borrar ventas.', articulo_fuera_export: 'Hay artículos que no vienen en este export de Loyverse.',
  ya_confirmada: 'Esa carga ya se había confirmado.', no_enviado: 'El conteo todavía no se envía.', no_cancelable: 'Ese conteo ya no se puede cancelar.',
  valor_invalido: 'Valor no válido.', factor_invalido: 'La equivalencia debe ser mayor a 0.', perfil_invalido: 'Hay un empleado que ya no existe.',
  ya_hay_conteo: 'Ya hay un conteo abierto.', no_aplica: 'Ese conteo ya no se puede recontar.', sin_conexion_lv: 'No se pudo conectar con Loyverse. Intenta en unos minutos.',
  es_reconteo: 'Los reconteos se revisan dentro del conteo original.', falta_nota: 'Escribe qué pasó (mínimo 3 letras).',
};
const msg = (r) => ERR[r?.error] || r?.mensaje || 'No se pudo completar. Intenta de nuevo.';
const COLS_ART = 'id,handle,nombre,categoria,sigue_inventario,tiene_receta,precio,costo,activo,es_insumo,unidad,empaque_nombre,empaque_factor,familia,en_ultimo_export,foto_path,foto_v,lv_stock,lv_minimo,lv_disponible,lv_item_id';
const contable = (a) => a.activo && a.sigue_inventario && !a.tiene_receta && a.en_ultimo_export;
const fecha = (d) => fechaCorta(`${d}T12:00:00`);
const unidadTxt = (a, n) => plural(a?.unidad || 'pieza', n);
const DIAS = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];

async function rpc(nombre, args) {
  try { return await api.rpc(nombre, args); } catch (e) { return { ok: false, error: e.codigo === 'sin_conexion' ? 'sin_conexion' : 'error', mensaje: e.message }; }
}
async function articulos() { return api.seleccionar('inv_articulos', `select=${COLS_ART}&order=categoria.asc.nullslast,nombre.asc`); }
// La función "loyverse" del servidor es la única que cambia Loyverse (revisa que seas gerencia/admin).
async function lv(accion, datos = {}) {
  try { return await api.funcion(accion, datos, { fn: 'loyverse' }); } catch (e) { return { ok: false, error: 'sin_conexion_lv', mensaje: e.message }; }
}
const haceTxt = (iso) => { if (!iso) return 'nunca'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `el ${fechaHora(iso)}`; };
const signo = (n) => `${Number(n) > 0 ? '+' : ''}${cantidad(n)}`;

export function montarInventario(el, ctx, yo) {
  let seg = api.leerLocal('ppstaff-inv-seg') || 'pedidos';
  if (!['pedidos', 'conteos', 'catalogo'].includes(seg)) seg = 'pedidos';
  el.innerHTML = `<div class="enc-seccion"><h2>Inventario</h2></div>
    <div class="segmentos tres" role="tablist"><button type="button" data-seg="pedidos">📦 Pedidos</button><button type="button" data-seg="conteos">📋 Conteos</button>
      <button type="button" data-seg="catalogo">🗂️ Catálogo</button></div>
    <div id="inv-cont"></div>`;
  function poner(s) {
    seg = s; api.guardarLocal('ppstaff-inv-seg', s);
    $$('[data-seg]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.seg === s)));
    const actual = $('#inv-cont', el);
    const nuevo = actual.cloneNode(false); actual.replaceWith(nuevo);
    ({ pedidos: segPedidosYCarga, conteos: segConteos, catalogo: segCatalogo })[s](nuevo, yo, poner);
  }
  $('.segmentos', el).addEventListener('click', (e) => { const b = e.target.closest('[data-seg]'); if (b) poner(b.dataset.seg); });
  poner(seg);
}

// ================= PEDIDOS (+ subir a Loyverse) =================
function segPedidosYCarga(el, yo) {
  el.innerHTML = '<div id="inv-sync"></div><section class="tarjeta por-pedir" id="inv-bajas" hidden></section><div id="inv-peds"></div>';
  const recargar = () => segPedidosYCarga(el, yo);
  segLoyverse($('#inv-sync', el), recargar, yo);
  segBajas($('#inv-bajas', el));
  segPedidos($('#inv-peds', el), recargar);
}

// Por pedir: artículos en o debajo de "Existencias bajas" de Loyverse (último export + pedidos recibidos después)
async function segBajas(el) {
  const r = await rpc('inv_bajas');
  if (!r.ok || !r.items?.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="enc-avisos"><h2>📉 Por pedir (${r.items.length})</h2><span class="sub">Loyverse ${esc(haceTxt(r.subido_en))}</span></div>
    <p class="ayuda">Según “Existencias bajas” de cada artículo en Loyverse. Se actualiza solo.</p>
    <div class="lista">${r.items.map((a) => { const e = estiloCategoria(a.categoria); const q = Number(a.stock || 0) + Number(a.recibido || 0);
      return `<div class="fila inv" style="--cat:${e.color}"><div class="fila-txt"><b>${e.emoji} ${esc(a.nombre)}</b>
        <span>Quedan <b class="${q <= 0 ? 'mal-txt' : 'warn-txt'}">${esc(cantidad(q))}</b> ${esc(unidadTxt(a, q))} · mínimo ${esc(cantidad(a.minimo))}${Number(a.recibido) ? ` · incluye ${esc(cantidad(a.recibido))} recibidas que aún no se suben` : ''}</span></div></div>`; }).join('')}</div>`;
}

async function segPedidos(el, recargar) {
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  let peds, arts;
  try {
    [peds, arts] = await Promise.all([
      api.seleccionar('inv_pedidos', 'select=id,creado_en,perfil_nombre,proveedor,nota,ticket_path,estado,comentario,verificado_en,cargado_en,lv_error,inv_pedido_items(id,articulo_id,nombre_nuevo,cantidad,en_empaques,unidades,quitado,cantidad_original,unidades_original)&order=creado_en.desc&limit=60'),
      articulos(),
    ]);
  } catch (e) { el.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
  const mapa = new Map(arts.map((a) => [a.id, a]));
  const grupo = (titulo, l, ayuda = '') => (l.length ? `<h3 class="sub-titulo">${titulo} (${l.length})</h3>${ayuda}<div class="lista">${l.map(filaPed).join('')}</div>` : '');
  function filaPed(p) {
    const its = p.inv_pedido_items.filter((i) => !i.quitado);
    const nuevos = its.filter((i) => !i.articulo_id).length;
    const ins = { enviado: '<span class="insignia aviso-i">Por verificar</span>', verificado: `<span class="insignia ${p.lv_error ? 'mal' : ''}">${p.lv_error ? 'Falta subir' : 'Verificado'}</span>`, cargado: '<span class="insignia gris">En Loyverse</span>', cancelado: '<span class="insignia mal">Cancelado</span>' }[p.estado];
    return `<button type="button" class="fila" data-ped="${esc(p.id)}"><div class="fila-txt"><b>${esc(p.perfil_nombre)}${p.proveedor ? ` · ${esc(p.proveedor)}` : ''}</b>
      <span>${esc(fechaHora(p.creado_en))} · ${its.length} artículo${its.length === 1 ? '' : 's'}${nuevos ? ` · <span class="warn-txt">${nuevos} nuevo${nuevos === 1 ? '' : 's'}</span>` : ''}</span></div>${ins}</button>`;
  }
  if (!peds.length) { el.innerHTML = '<h3 class="sub-titulo">Pedidos recibidos</h3><div class="tarjeta vacio"><p><b>Todavía no hay pedidos.</b></p><p>Los empleados los registran desde el celular del club (Inventario > Recibir pedido).</p></div>'; return; }
  el.innerHTML = grupo('Por verificar', peds.filter((p) => p.estado === 'enviado'), '<p class="ayuda">Compara lo capturado contra la foto del ticket.</p>')
    + grupo('Verificados que faltan subir a Loyverse', peds.filter((p) => p.estado === 'verificado'), '<p class="ayuda">Arriba en “Por aplicar en Loyverse” puedes reintentar.</p>')
    + grupo('Anteriores', peds.filter((p) => p.estado === 'cargado' || p.estado === 'cancelado').slice(0, 20));
  el.onclick = (e) => { const b = e.target.closest('[data-ped]'); if (b) verPedido(peds.find((p) => p.id === b.dataset.ped), arts, mapa, recargar); };
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
          ${!editable ? `<span>${esc(cantidad(i.cantidad))} ${esc(i.en_empaques ? plural(a?.empaque_nombre, i.cantidad) : unidadTxt(a, i.cantidad))} = ${esc(cantidad(i.unidades))} ${esc(unidadTxt(a, i.unidades))}</span>` : ''}
          ${i.id && i.unidades_original != null && Number(i.unidades_original) !== Number(i.unidades) ? `<span class="warn-txt dif-extra">El empleado capturó ${esc(cantidad(i.unidades_original))} ${esc(unidadTxt(a, i.unidades_original))}</span>` : ''}
          ${!i.id || i.unidades_original == null ? (editable && i.articulo_id ? '<span class="dif-extra">Agregado al verificar</span>' : '') : ''}</div>
          ${editable ? `<div class="cant-ped"><input type="number" inputmode="decimal" min="0" step="any" data-cant value="${esc(i.cantidad)}">
            ${a?.empaque_nombre ? `<select data-modo><option value="1" ${i.en_empaques ? 'selected' : ''}>${esc(plural(a.empaque_nombre, 2))}</option><option value="0" ${!i.en_empaques ? 'selected' : ''}>${esc(unidadTxt(a, 2))}</option></select>` : `<span class="unidad">${esc(unidadTxt(a, 2))}</span>`}
            <button type="button" class="icono-btn" data-quitar aria-label="Quitar">✕</button></div>` : ''}</div>`;
      }).join('')}</div>
      ${editable ? `<div class="campo" style="margin-top:10px"><label for="vp-add">Agregar artículo que faltó capturar</label><select id="vp-add">${opciones(null)}</select></div>
        <div class="campo"><label for="vp-com">Comentario <span class="opc">(lo ve el empleado)</span></label><input id="vp-com" type="text" value="${esc(p.comentario || '')}"></div>
        <div class="acciones" style="margin-top:12px"><button type="button" class="btn" data-verificar>${p.estado === 'verificado' ? 'Guardar y subir a Loyverse' : '✓ Coincide con el ticket: subir a Loyverse'}</button>
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
        const x = await lv('aplicar', { origen: 'pedido', id: p.id });
        v.cerrar();
        if (x.ok) aviso(`Pedido verificado y sumado en Loyverse (${x.lineas} artículo${x.lineas === 1 ? '' : 's'}).`, 'ok', 6000);
        else aviso(`El pedido quedó verificado, pero no se pudo subir a Loyverse: ${msg(x)} Reinténtalo en “Por aplicar en Loyverse”.`, 'error', 9000);
        alCambiar();
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
      api.seleccionar('inv_conteos', 'select=id,fecha,estado,asignado_tipo,asignado_perfil,contado_por_nombre,iniciado_en,enviado_en,revisado_en,faltante,sobrante,deuda,ajuste_aplicado_en,calculo,calculo_error,reconteo_de,articulos&order=creado_en.desc&limit=30'),
      api.rpc('listar_personal').catch(() => []),
      api.seleccionar('tipos_turno', 'select=clave,nombre&activo=eq.true&order=orden.asc'),
      api.seleccionar('ajustes', 'select=clave,valor'),
    ]);
  } catch (e) { el.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
  const aj = Object.fromEntries(ajustes.map((a) => [a.clave, a.valor]));
  const abierto = conteos.find((c) => c.estado === 'abierto' && !c.reconteo_de);
  const reabiertos = conteos.filter((c) => c.estado === 'abierto' && c.reconteo_de);
  const asignadoTxt = (c) => (c.asignado_perfil ? (perfiles.find((p) => p.id === c.asignado_perfil)?.nombre_completo || 'empleado') : c.asignado_tipo === 'cualquiera' ? 'cualquier turno' : `turno ${tipos.find((t) => t.clave === c.asignado_tipo)?.nombre || c.asignado_tipo}`);
  let h = '';
  if (abierto) {
    h += `<section class="tarjeta conteo-pend"><h2>Conteo abierto</h2><p class="detalle">Del ${esc(fecha(abierto.fecha))} · lo hace ${esc(asignadoTxt(abierto))}.
      ${abierto.iniciado_en ? `Lo empezó ${esc(abierto.contado_por_nombre || '')} a las ${esc(horaCorta(abierto.iniciado_en))}.` : 'Nadie lo ha empezado.'}</p>
      <button type="button" class="btn peligro-suave" data-cancelar-conteo="${esc(abierto.id)}">Cancelar conteo</button></section>`;
  } else {
    h += `<section class="tarjeta"><h2>Abrir conteo ahora</h2>
      <p class="detalle">El conteo se abre solo los días configurados (abajo). Si quieres uno extra, ábrelo aquí: ya no hace falta subir nada de Loyverse; la app compara contra Loyverse en el momento en que se envía y descuenta lo que se venda mientras cuentan.</p>
      <div class="campo"><label for="co-quien">¿Quién cuenta?</label><select id="co-quien">
        ${tipos.map((t) => `<option value="tipo:${esc(t.clave)}" ${t.clave === aj.inv_conteo_turno ? 'selected' : ''}>Quien esté en el turno ${esc(t.nombre)}</option>`).join('')}
        <option value="tipo:cualquiera" ${aj.inv_conteo_turno === 'cualquiera' ? 'selected' : ''}>Cualquier turno abierto</option>
        ${perfiles.map((p) => `<option value="perfil:${esc(p.id)}">${esc(p.nombre_completo)}</option>`).join('')}</select></div>
      <button type="button" class="btn" data-abrir-conteo>📋 Abrir conteo</button></section>`;
  }
  for (const r of reabiertos) h += `<section class="tarjeta conteo-pend"><h2>🔁 Reconteo abierto</h2><p class="detalle">${(r.articulos || []).length} artículo${(r.articulos || []).length === 1 ? '' : 's'} · lo hace ${esc(asignadoTxt(r))}.
      ${r.iniciado_en ? `Lo empezó ${esc(r.contado_por_nombre || '')}.` : 'Nadie lo ha empezado.'}</p><button type="button" class="btn peligro-suave" data-cancelar-conteo="${esc(r.id)}">Cancelar reconteo</button></section>`;
  h += '<h3 class="sub-titulo">Conteos</h3>';
  h += conteos.filter((c) => c.estado !== 'abierto' && !c.reconteo_de).length ? `<div class="lista">${conteos.filter((c) => c.estado !== 'abierto' && !c.reconteo_de).map((c) => {
    const ins = { enviado: c.calculo === 'listo' ? '<span class="insignia aviso-i">Por revisar</span>' : c.calculo === 'error' ? '<span class="insignia mal">Error al calcular</span>' : '<span class="insignia gris">Calculando…</span>', revisado: `<span class="insignia ${Number(c.deuda) > 0 ? 'mal' : ''}">${Number(c.deuda) > 0 ? `Debe ${esc(pesos(c.deuda))}` : 'Sin deuda'}</span>`, cancelado: '<span class="insignia gris">Cancelado</span>' }[c.estado] || '';
    return `<button type="button" class="fila" data-conteo="${esc(c.id)}" ${c.estado === 'cancelado' ? 'disabled' : ''}><div class="fila-txt"><b>Conteo del ${esc(fecha(c.fecha))}</b>
      <span>${c.contado_por_nombre ? `Contó ${esc(c.contado_por_nombre)}` : ''}${c.enviado_en ? ` · ${esc(fechaHora(c.enviado_en))}` : ''}${c.estado === 'revisado' && !c.ajuste_aplicado_en ? ' · <span class="warn-txt">falta corregir Loyverse</span>' : c.ajuste_aplicado_en ? ' · Loyverse corregido' : ''}</span></div>${ins}</button>`;
  }).join('')}</div>` : '<p class="detalle">Todavía no hay conteos.</p>';
  h += `<details class="bitacora"><summary>Días y horarios del conteo</summary>${formAjustesConteo(aj, tipos)}</details>`;
  el.innerHTML = h;
  activarAjustes(el, () => segConteos(el));
  el.onclick = async (e) => {
    const ab = e.target.closest('[data-abrir-conteo]');
    if (ab) {
      const [tipo, val] = $('#co-quien', el).value.split(':');
      return conOcupado(ab, async () => {
        const r = await rpc('inv_conteo_nuevo', { p_tipo: tipo === 'tipo' ? val : null, p_perfil: tipo === 'perfil' ? val : null });
        if (!r.ok) return aviso(msg(r), 'error');
        aviso('Conteo abierto: ya aparece en el celular del club.', 'ok', 5000); segConteos(el);
      });
    }
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
  if (c.calculo !== 'listo') {
    v.poner(`<p class="detalle">${c.calculo === 'error' ? `<span class="mal-txt">No se pudo comparar con Loyverse: ${esc(c.calculo_error || '')}</span><br>Se reintenta solo cada 10 minutos.`
      : '⏳ Comparando con Loyverse… tarda uno o dos minutos. Vuelve a abrirlo en un momento.'}</p>
      <div class="acciones"><button type="button" class="btn ghost" data-cerrar>Cerrar</button></div>`);
    return;
  }
  const recontar = new Set();
  const [perfiles, tipos] = await Promise.all([api.rpc('listar_personal').catch(() => []), api.seleccionar('tipos_turno', 'select=clave,nombre&activo=eq.true&order=orden.asc').catch(() => [])]);
  const aplicado = !!c.ajuste_aplicado_en;
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
      Esperado = lo que decía Loyverse al enviar el conteo + lo que se vendió después de contar cada artículo ± pedidos y ajustes que Loyverse aún no tenía.
      ${aplicado ? `<br><b class="ok-txt">✓ Loyverse ya se corrigió con este conteo (${esc(fechaHora(c.ajuste_aplicado_en))}).</b>` : ''}</p>
      ${(r.reconteos || []).map((x) => `<p class="nota-info">🔁 Reconteo de ${x.articulos} artículo${x.articulos === 1 ? '' : 's'}: ${x.estado === 'abierto' ? 'esperando que lo hagan' : x.calculo === 'listo' ? `listo (contó ${esc(x.contado_por_nombre || '')}); su resultado ya se usa abajo` : 'calculando…'}</p>`).join('')}
      <div class="cifras tres"><div><b class="mal-txt">${esc(pesos(t.falt))}</b><span>Faltante</span></div><div><b class="ok-txt">${esc(pesos(t.sobr))}</b><span>Sobrante</span></div>
        <div><b>${esc(pesos(t.deuda))}</b><span>Deuda (faltante − sobrante)</span></div></div>
      ${prod.length ? `<h3 class="sub-titulo">Diferencias (a precio de venta)</h3><div class="tabla-dif">${prod.map((i) => `
        <div class="dif-fila ${noCobrar.has(i.articulo_id) ? 'apagada' : ''}" data-art="${esc(i.articulo_id)}">
          <div class="dif-txt"><b>${esc(i.nombre)}</b><span>Esperado ${esc(cantidad(i.esperado))} · contado ${esc(cantidad(i.contado))}${i.precio == null ? ' · <span class="warn-txt">precio variable: $0</span>' : ''}</span>
            <span class="dif-extra">Loyverse ${esc(cantidad(i.stock_lv))}${Number(i.vendido_despues) ? ` · vendido después de contarlo ${esc(cantidad(i.vendido_despues))}` : ''}${i.reconteo_contado != null ? ` · <b>reconteo: ${esc(cantidad(i.reconteo_contado))}</b> (antes ${esc(signo(i.diferencia_original))})` : ''}</span></div>
          <div class="dif-num ${i.diferencia < 0 ? 'mal-txt' : 'ok-txt'}"><b>${esc(fmtDif(i))}</b><span>${esc(pesos(Math.abs(i.diferencia) * (i.precio || 0)))}</span></div>
          <label class="no-cobrar"><input type="checkbox" data-nocobrar ${noCobrar.has(i.articulo_id) ? 'checked' : ''}> No cobrar</label>
          ${aplicado ? '' : `<label class="recontar"><input type="checkbox" data-recontar ${recontar.has(i.articulo_id) ? 'checked' : ''}> Recontar</label>`}
        </div>`).join('')}</div>
        ${aplicado ? '' : `<div class="fila-botones" style="margin:8px 0 0"><select id="cv-rq"><option value="tipo:cualquiera">Quien esté en turno</option>
          ${tipos.map((t) => `<option value="tipo:${esc(t.clave)}">Turno ${esc(t.nombre)}</option>`).join('')}
          ${perfiles.filter((p) => p.id !== c.contado_por).map((p) => `<option value="perfil:${esc(p.id)}">${esc(p.nombre_completo)}</option>`).join('')}</select>
          <button type="button" class="btn chico ghost" data-reconteo>🔁 Pedir reconteo de los marcados</button></div>
          <p class="ayuda">El reconteo es a ciegas (no ven lo esperado). Lo ideal es que lo haga otra persona. Su resultado reemplaza la diferencia de esos artículos.</p>`}` : '<p class="nota-info">Todo cuadró en los productos. 🎉</p>'}
      ${parejas.length ? `<h3 class="sub-titulo">Dónde probablemente se equivocaron</h3><ul class="parejas">${parejas.map((p) => `<li>${p.misma ? '🔁' : '↔︎'} Registraron <b>${esc(p.sobra.nombre)}</b> pero entregaron <b>${esc(p.falta.nombre)}</b>${p.n > 1 ? ` (×${esc(cantidad(p.n))})` : ''}
        <span>${p.dif > 0 ? `faltan ${esc(pesos(p.dif))}` : p.dif < 0 ? `sobran ${esc(pesos(-p.dif))}` : 'mismo precio'}${p.misma ? ' · mismo producto, otro sabor' : ''}</span></li>`).join('')}</ul>` : ''}
      ${ins.length ? `<h3 class="sub-titulo">Insumos (solo reporte, no se cobran · tolerancia ${tol}%)</h3><div class="tabla-dif">${ins.map((i) => {
        const pct = i.esperado ? Math.abs(i.diferencia) / Math.abs(i.esperado) * 100 : (i.diferencia ? 100 : 0);
        return `<div class="dif-fila"><div class="dif-txt"><b>${esc(i.nombre)}</b><span>Esperado ${esc(cantidad(i.esperado))} · contado ${esc(cantidad(i.contado))} ${esc(unidadTxt(i, 2))}</span></div>
          <div class="dif-num ${pct > tol ? 'mal-txt' : ''}"><b>${esc(fmtDif(i))}</b><span>${pct > tol ? `fuera de tolerancia (${Math.round(pct)}%)` : `${Math.round(pct)}% · ok`}</span></div></div>`;
      }).join('')}</div>` : ''}
      <h3 class="sub-titulo">Cobro</h3>
      ${r.desde ? '' : '<p class="nota-aviso">Este es el PRIMER conteo: sirve como línea base (el inventario de Loyverse venía descuadrado). Lo normal es no cobrar nada y luego “Corregir Loyverse” para que quede igual a lo que se contó.</p>'}
      <p class="ayuda">Trabajaron desde el conteo anterior${r.desde ? ` (${esc(fecha(r.desde))})` : ''}. La app sugiere repartir según sus turnos; tú decides.</p>
      <div class="lista" id="cv-cobros">${r.trabajaron.length ? r.trabajaron.map((p) => {
        const prev = cobrosPrev.get(p.perfil_id);
        const sug = Math.round(t.deuda * p.turnos / totalTurnos * 100) / 100;
        return `<div class="fila inv cobro" data-perfil="${esc(p.perfil_id)}"><div class="fila-txt"><b>${esc(p.nombre)}</b><span>${p.turnos} turno${p.turnos === 1 ? '' : 's'} · sugerido ${esc(pesos(sug))}</span></div>
          <div class="cobro-ctl"><input type="number" inputmode="decimal" min="0" step="any" data-monto value="${esc(prev ? prev.monto : (t.deuda > 0 && r.desde ? sug : 0))}" aria-label="Monto">
          <select data-via><option value="app" ${prev?.por_app ? 'selected' : ''}>Mandar por la app</option><option value="persona" ${prev && !prev.por_app ? 'selected' : ''}>Lo veo en persona</option></select></div></div>`;
      }).join('') : '<p class="detalle">No hay turnos registrados en ese periodo.</p>'}</div>
      <div class="campo" style="margin-top:10px"><label for="cv-notas">Notas <span class="opc">(internas)</span></label><input id="cv-notas" type="text" value="${esc(c.notas || '')}"></div>
      <div class="acciones" style="margin-top:12px">${aplicado ? '' : `<button type="button" class="btn" data-guardar>${c.estado === 'revisado' ? 'Guardar cambios' : 'Guardar revisión'}</button>`}
        ${c.estado === 'revisado' && !aplicado ? '<button type="button" class="btn ghost" data-corregir-lv>⬆︎ Corregir Loyverse con este conteo</button>' : ''}
        <p class="ayuda">Corregir Loyverse suma/resta cada diferencia en Loyverse para que quede igual a lo que hay de verdad. Hazlo cuando ya no vayas a pedir reconteos.</p></div>`);
  }
  pintar();
  v.el.addEventListener('change', (e) => {
    const f = e.target.closest('[data-art]');
    if (f && e.target.matches('[data-recontar]')) { if (e.target.checked) recontar.add(f.dataset.art); else recontar.delete(f.dataset.art); return; }
    if (f && e.target.matches('[data-nocobrar]')) {
      if (e.target.checked) noCobrar.set(f.dataset.art, ''); else noCobrar.delete(f.dataset.art);
      const vals = [...$$('#cv-cobros [data-perfil]', v.el)].map((x) => [x.dataset.perfil, $('[data-monto]', x).value, $('[data-via]', x).value]);
      pintar();
      for (const [pid, , via] of vals) { const x = $(`#cv-cobros [data-perfil="${pid}"]`, v.el); if (x) $('[data-via]', x).value = via; }
    }
  });
  v.el.addEventListener('click', (e) => {
    const rq = e.target.closest('[data-reconteo]');
    if (rq) {
      if (!recontar.size) return aviso('Marca “Recontar” en los artículos que quieres que vuelvan a contar.', 'error');
      const [tipo, val] = $('#cv-rq', v.el).value.split(':');
      return conOcupado(rq, async () => {
        const x = await rpc('inv_reconteo_pedir', { p_conteo: c.id, p_articulos: [...recontar], p_tipo: tipo === 'tipo' ? val : null, p_perfil: tipo === 'perfil' ? val : null });
        if (!x.ok) return aviso(msg(x), 'error');
        v.cerrar(); aviso(`Reconteo pedido (${recontar.size} artículo${recontar.size === 1 ? '' : 's'}). Ya aparece en el celular del club.`, 'ok', 6000); alCambiar();
      });
    }
    const cl = e.target.closest('[data-corregir-lv]');
    if (cl) {
      return (async () => {
        if (!await confirmar({ titulo: 'Corregir Loyverse', texto: 'Se sumará/restará cada diferencia en Loyverse para que quede igual a lo contado. ¿Seguir?', ok: 'Corregir Loyverse' })) return;
        conOcupado(cl, async () => {
          const x = await lv('aplicar', { origen: 'conteo', id: c.id });
          if (!x.ok) return aviso(msg(x), 'error', 7000);
          v.cerrar(); aviso(`Loyverse corregido (${x.lineas} artículo${x.lineas === 1 ? '' : 's'}).`, 'ok', 6000); alCambiar();
        });
      })();
    }
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

// ================= LOYVERSE (conexión, pendientes y vigilancia) =================
async function segLoyverse(el, recargar, yo) {
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  const [r, ajustes] = await Promise.all([rpc('lv_panel'), api.seleccionar('ajustes', 'select=clave,valor').catch(() => [])]);
  if (!r.ok) { el.innerHTML = ''; return; }
  const aj = Object.fromEntries(ajustes.map((a) => [a.clave, a.valor]));
  const min = r.ultima_sync ? (Date.now() - new Date(r.ultima_sync).getTime()) / 60000 : 1e9;
  const err = r.ultimo_error?.error;
  const punto = err && min > 25 ? 'mal' : min > 25 ? 'warn' : '';
  const pend = [
    ...r.pedidos.map((p) => ({ origen: 'pedido', id: p.id, txt: `Pedido de ${p.perfil_nombre} · ${fechaHora(p.creado_en)}`, error: p.lv_error })),
    ...r.ajustes.map((m) => ({ origen: 'ajuste', id: m.id, txt: `${signo(m.cantidad)} ${unidadTxt(m, Math.abs(m.cantidad))} · ${m.nombre} (${m.motivo})`, sub: `${m.creado_por_nombre || ''} · ${fechaHora(m.creado_en)}`, cancelar: true })),
    ...r.conteos.map((c) => ({ origen: 'conteo', id: c.id, txt: `Corregir Loyverse con el conteo del ${fecha(c.fecha)}` })),
  ];
  const esAdmin = yo?.rol === 'admin';
  let h = `<section class="tarjeta"><div class="lv-estado"><span class="lv-punto ${punto}"></span><h2 style="margin:0">Loyverse</h2>
      <button type="button" class="btn chico ghost" data-sync style="margin-left:auto">↻ Actualizar ahora</button></div>
    <p class="detalle">${r.ultima_sync ? `Conectado · actualizado ${esc(haceTxt(r.ultima_sync))} · ${r.ligados} artículos` : 'Todavía no se sincroniza.'}
      ${err ? `<br><span class="${punto ? 'mal-txt' : 'warn-txt'}">Último error: ${esc(err)}</span>` : ''}</p>
    <p class="ayuda">Catálogo, existencias, ventas y cierres de caja se leen solos cada 10 minutos. Los pedidos verificados, ajustes y correcciones de conteo se suben al momento. El celular del club nunca cambia Loyverse.</p></section>`;
  if (pend.length) h += `<section class="tarjeta tarjeta-avisos"><h2>⬆︎ Por aplicar en Loyverse (${pend.length})</h2><div class="lista">${pend.map((x) => `<div class="fila inv envolver"><div class="fila-txt"><b>${esc(x.txt)}</b>
      ${x.sub ? `<span>${esc(x.sub)}</span>` : ''}${x.error ? `<span class="mal-txt">No se pudo subir: ${esc(x.error)}</span>` : ''}</div>
      <div class="fila-botones" style="margin:0">${x.cancelar ? `<button type="button" class="btn chico ghost" data-cancelar-ajuste="${esc(x.id)}">Cancelar</button>` : ''}
      <button type="button" class="btn chico" data-aplicar="${esc(x.origen)}:${esc(x.id)}">${x.error ? 'Reintentar' : 'Aplicar'}</button></div></div>`).join('')}</div></section>`;
  if (r.sin_explicar.length) h += `<section class="tarjeta tarjeta-avisos"><h2>🕵️ Cambios en Loyverse sin explicar (${r.sin_explicar.length})</h2>
    <p class="ayuda">Existencias que cambiaron directo en Loyverse (no por ventas ni por PP Staff). Puede ser un ajuste hecho a mano en el Back Office… o algo que hay que investigar.</p>
    <div class="lista">${r.sin_explicar.map((d) => `<div class="fila inv"><div class="fila-txt"><b>${esc(d.nombre)}: <span class="${Number(d.diferencia) < 0 ? 'mal-txt' : 'warn-txt'}">${esc(signo(d.diferencia))}</span></b>
      <span>Loyverse pasó de ${esc(cantidad(d.antes))} a ${esc(cantidad(d.despues))}; con las ventas debía quedar en ${esc(cantidad(d.esperado))} · entre ${esc(horaCorta(d.desde))} y ${esc(fechaHora(d.hasta))}</span></div>
      ${esAdmin ? `<button type="button" class="btn chico ghost" data-explicar="${esc(d.id)}">Ya sé qué pasó</button>` : ''}</div>`).join('')}</div></section>`;
  h += `<details class="bitacora"><summary>Últimos cambios hechos desde PP Staff (${r.movimientos.length})</summary>${r.movimientos.length ? `<div class="lista">${r.movimientos.map((m) => `<div class="fila inv"><div class="fila-txt">
    <b>${esc(m.nombre)} ${esc(signo(m.cantidad))}</b><span>${esc({ pedido: 'Pedido', ajuste: 'Ajuste', conteo: 'Conteo' }[m.origen])} · ${esc(cantidad(m.antes))} → ${esc(cantidad(m.despues))} · ${esc(m.por_nombre || '')} · ${esc(fechaHora(m.aplicado_en))}</span></div></div>`).join('')}</div>` : '<p class="detalle">Todavía no hay.</p>'}</details>`;
  h += `<details class="bitacora"><summary>Recordatorio de pedidos sin verificar</summary>${formAjustesCarga(aj)}</details>`;
  el.innerHTML = h;
  activarAjustes(el, recargar);
  el.onclick = async (e) => {
    const sy = e.target.closest('[data-sync]');
    if (sy) return conOcupado(sy, async () => { const x = await lv('sync_ahora'); if (!x.ok) aviso(msg(x), 'error', 7000); else aviso('Loyverse actualizado.', 'ok'); recargar(); });
    const ap = e.target.closest('[data-aplicar]');
    if (ap) {
      const [origen, id] = ap.dataset.aplicar.split(':');
      return conOcupado(ap, async () => {
        const x = await lv('aplicar', { origen, id });
        if (!x.ok) return aviso(msg(x), 'error', 7000);
        aviso(`Listo: ${x.lineas} artículo${x.lineas === 1 ? '' : 's'} actualizado${x.lineas === 1 ? '' : 's'} en Loyverse.`, 'ok', 5000); recargar();
      });
    }
    const ca = e.target.closest('[data-cancelar-ajuste]');
    if (ca) {
      if (!await confirmar({ titulo: 'Cancelar ajuste', texto: '¿Cancelar este ajuste? No se aplicará en Loyverse.', ok: 'Cancelar ajuste', peligro: true })) return;
      return conOcupado(ca, async () => { const x = await rpc('inv_ajuste_cancelar', { p_id: ca.dataset.cancelarAjuste }); if (!x.ok) return aviso(msg(x), 'error'); aviso('Ajuste cancelado.', 'ok'); recargar(); });
    }
    const ex = e.target.closest('[data-explicar]');
    if (ex) {
      const v = ventana(`<form class="formulario" novalidate><div class="campo"><label for="ex-n">¿Qué pasó?</label><input id="ex-n" type="text" placeholder="Ej. lo ajusté yo en el Back Office"></div>
        <button class="btn" type="submit">Guardar</button></form>`, { titulo: 'Cambio sin explicar' });
      $('form', v.el).addEventListener('submit', (ev) => {
        ev.preventDefault();
        conOcupado($('button', v.el), async () => { const x = await rpc('lv_dif_resolver', { p_id: ex.dataset.explicar, p_nota: $('#ex-n', v.el).value }); if (!x.ok) return aviso(msg(x), 'error'); v.cerrar(); recargar(); });
      });
    }
  };
}

// ================= CATÁLOGO =================
async function segCatalogo(el) {
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  let arts;
  try { arts = await articulos(); } catch (e) { el.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
  let filtro = '', soloInv = true, catSel = null;
  const head = `<section class="tarjeta tarjeta-avisos" id="cat-sol" hidden></section><p class="sub">El catálogo se copia solo de Loyverse cada 10 minutos. Aquí defines empaques (ej. caja = 24 piezas, cartón = 1000 ml), insumos y familias de sabores.</p>
    <button type="button" class="btn ghost" data-nuevo-lv style="margin-bottom:10px">＋ Artículo nuevo en Loyverse</button>
    <div class="conteo-barra"><input id="cat-buscar" type="text" placeholder="Buscar…" autocomplete="off">
      <label class="interruptor chico"><input type="checkbox" id="cat-solo" checked><span>Solo con inventario</span></label></div>
    <div class="cat-chips" id="cat-chips"></div>
    <div id="cat-lista"></div>`;
  el.innerHTML = head;
  const lista = $('#cat-lista', el);
  function pintar() {
    const base = arts.filter((a) => (!soloInv || (a.sigue_inventario && !a.tiene_receta)) && (!filtro || a.nombre.toLowerCase().includes(filtro)));
    const todas = [...new Set(base.map((a) => a.categoria || 'Sin categoría'))];
    $('#cat-chips', el).innerHTML = `<button type="button" class="cat-chip ${catSel ? '' : 'activa'}" style="--cat:#94a3b8" data-cat-sel=""><span>🗂️</span>Todas<i>${base.length}</i></button>`
      + todas.map((cat) => { const e = estiloCategoria(cat); const n = base.filter((a) => (a.categoria || 'Sin categoría') === cat).length;
        return `<button type="button" class="cat-chip ${catSel === cat ? 'activa' : ''}" style="--cat:${e.color}" data-cat-sel="${esc(cat)}"><span>${e.emoji}</span>${esc(cat)}<i>${n}</i></button>`; }).join('');
    const cats = catSel ? todas.filter((c) => c === catSel) : todas;
    lista.innerHTML = cats.map((cat) => { const e = estiloCategoria(cat); return `<section class="cat-conteo" style="--cat:${e.color}"><div class="cat-enc"><span class="cat-emoji">${e.emoji}</span><b>${esc(cat)}</b></div><div class="lista">${base.filter((a) => (a.categoria || 'Sin categoría') === cat).map((a) => `
      <button type="button" class="fila art-cat ${contable(a) ? '' : 'apagada'}" data-art="${esc(a.id)}">${miniArticulo(a, 46)}<div class="fila-txt"><b>${esc(a.nombre)}</b>
      <span>${a.lv_stock != null && a.sigue_inventario ? `Loyverse: <b class="${Number(a.lv_stock) <= Number(a.lv_minimo || 0) ? 'warn-txt' : ''}">${esc(cantidad(a.lv_stock))}</b> · ` : ''}${a.precio != null ? esc(pesos(a.precio)) : 'precio variable'} · ${a.empaque_nombre ? `1 ${esc(a.empaque_nombre)} = ${esc(cantidad(a.empaque_factor))} ${esc(unidadTxt(a, a.empaque_factor))}` : esc(a.unidad)}${a.familia ? ` · familia ${esc(a.familia)}` : ''}</span></div>
      <div class="fila-ins">${!a.activo ? '<span class="insignia gris">Inactivo</span>' : ''}${a.es_insumo ? '<span class="insignia aviso-i">Insumo</span>' : ''}${a.tiene_receta ? '<span class="insignia gris">Receta</span>' : ''}${!a.en_ultimo_export ? '<span class="insignia mal">Ya no está en Loyverse</span>' : a.lv_disponible === false ? '<span class="insignia gris">No se vende</span>' : ''}</div></button>`).join('')}</div></section>`; }).join('')
      || '<p class="detalle">Sin resultados.</p>';
    hidratarFotosArticulos(lista, api);
  }
  pintar();
  pintarSolicitudes($('#cat-sol', el), () => segCatalogo(el));
  $('#cat-buscar', el).addEventListener('input', (e) => { filtro = e.target.value.trim().toLowerCase(); pintar(); });
  $('#cat-solo', el).addEventListener('change', (e) => { soloInv = e.target.checked; pintar(); });
  $('#cat-chips', el).addEventListener('click', (e) => { const b = e.target.closest('[data-cat-sel]'); if (b) { catSel = b.dataset.catSel || null; pintar(); } });
  $('[data-nuevo-lv]', el).addEventListener('click', () => ventanaAlta(null, arts, () => segCatalogo(el)));
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-art]'); if (!b) return;
    const a = arts.find((x) => x.id === b.dataset.art);
    const v = ventana(`<form class="formulario" novalidate>
      <div class="foto-art">${miniArticulo(a, 84)}<div><p class="detalle" style="margin-top:0">${esc(a.categoria || '')} · ${a.precio != null ? esc(pesos(a.precio)) : 'precio variable'}${a.costo != null ? ` · costo ${esc(pesos(a.costo))}` : ''}</p>
        <label class="btn chico ghost archivo">📷 ${a.foto_path ? 'Cambiar foto' : 'Poner foto'}<input type="file" accept="image/*" id="ar-foto"></label>
        <p class="ayuda">La foto ayuda a reconocerlo al contar y al recibir pedidos.</p></div></div>
      <label class="interruptor"><input type="checkbox" id="ar-act" ${a.activo ? 'checked' : ''}><span>Activo (se cuenta y se puede recibir)</span></label>
      <label class="interruptor"><input type="checkbox" id="ar-ins" ${a.es_insumo ? 'checked' : ''}><span>Es insumo de recetas (leche, jamón, pan…): sale en el reporte pero no se cobra</span></label>
      <div class="campo"><label for="ar-uni">Unidad en Loyverse</label><input id="ar-uni" type="text" value="${esc(a.unidad)}" placeholder="pieza, ml, rebanada, gramo"></div>
      <div class="fila-botones" style="margin:0"><div class="campo"><label for="ar-emp">Empaque <span class="opc">(opcional)</span></label><input id="ar-emp" type="text" value="${esc(a.empaque_nombre || '')}" placeholder="caja, cartón, paquete"></div>
        <div class="campo"><label for="ar-fac">¿Cuántas unidades trae?</label><input id="ar-fac" type="number" inputmode="decimal" min="0" step="any" value="${esc(cantidad(a.empaque_factor))}"></div></div>
      <p class="ayuda">Ej. Leche: unidad “ml”, empaque “cartón”, 1000. Jamón: unidad “rebanada”, empaque “paquete”, 20. Así el empleado cuenta cartones/paquetes y la app convierte.</p>
      <div class="campo"><label for="ar-fam">Familia <span class="opc">(para detectar cobros de otro sabor)</span></label><input id="ar-fam" type="text" value="${esc(a.familia || '')}" placeholder="Ej. Gatorade 1L"></div>
      <button class="btn" type="submit">Guardar</button>
      ${contable(a) ? '<button type="button" class="btn ghost" data-ajustar style="margin-top:10px">± Ajustar existencias en Loyverse</button>' : ''}
      ${a.lv_item_id ? (a.lv_disponible === false ? '<button type="button" class="btn ghost" data-reactivar style="margin-top:10px">Volver a ponerlo a la venta en Loyverse</button>'
        : '<button type="button" class="btn peligro-suave" data-quitar-venta style="margin-top:10px">Ya no se vende: quitarlo de la venta en Loyverse</button>') : ''}</form>`, { titulo: a.nombre });
    $('[data-ajustar]', v.el)?.addEventListener('click', () => { v.cerrar(); ventanaAjuste(a); });
    v.el.addEventListener('click', async (ev) => {
      const q = ev.target.closest('[data-quitar-venta],[data-reactivar]'); if (!q) return;
      const quitar = q.matches('[data-quitar-venta]');
      if (!await confirmar({ titulo: quitar ? 'Quitar de la venta' : 'Volver a vender', texto: quitar ? `“${a.nombre}” dejará de aparecer en la caja de Loyverse y en el conteo. No se borra (se conserva su historial).` : `“${a.nombre}” vuelve a aparecer en la caja de Loyverse.`, ok: quitar ? 'Quitar' : 'Volver a vender', peligro: quitar })) return;
      conOcupado(q, async () => {
        const x = await lv(quitar ? 'baja' : 'reactivar', { articulo_id: a.id });
        if (!x.ok) return aviso(msg(x), 'error', 7000);
        v.cerrar(); aviso(quitar ? 'Quitado de la venta en Loyverse.' : 'Otra vez a la venta en Loyverse (actívalo también aquí si se cuenta).', 'ok', 5000); segCatalogo(el);
      });
    });
    hidratarFotosArticulos(v.el, api);
    $('#ar-foto', v.el).addEventListener('change', async (ev) => {
      const f = ev.target.files?.[0]; if (!f) return;
      const lbl = ev.target.closest('label'); lbl.classList.add('ocupado');
      try {
        const blob = await comprimirEvidencia(f, 500, 0.75);
        const ruta = `${a.id}.jpg`;
        await api.subirFoto(ruta, blob, 'articulos');
        const r = await rpc('inv_articulo_guardar', { p_id: a.id, p_datos: { foto_path: ruta } });
        if (!r.ok) return aviso(msg(r), 'error');
        a.foto_path = ruta; a.foto_v = new Date().toISOString();
        const m = $('.foto-art .mini-art', v.el); m.outerHTML = miniArticulo(a, 84); hidratarFotosArticulos(v.el, api);
        aviso('Foto guardada.', 'ok'); pintar();
      } catch (err) { aviso(`No se pudo subir la foto (${err.message || 'error'}).`, 'error'); }
      finally { lbl.classList.remove('ocupado'); ev.target.value = ''; }
    });
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

// Ajuste manual de existencias: entradas o salidas que no vienen de un pedido (merma, consumo, cortesía, corrección…)
const MOTIVOS_AJUSTE = [['-', 'Merma / caducado'], ['-', 'Roto o dañado'], ['-', 'Consumo interno'], ['-', 'Cortesía / regalo'], ['+', 'Entrada sin pedido'], ['+', 'Devolución de cliente'], ['±', 'Corrección de inventario'], ['±', 'Otro']];
function ventanaAjuste(a) {
  const emp = !!a.empaque_nombre && Number(a.empaque_factor) > 0;
  const v = ventana(`<form class="formulario" novalidate>
    <p class="detalle" style="margin-top:0">Para mover existencias de <b>${esc(a.nombre)}</b> sin un pedido (merma, consumo, cortesía…). Se aplica en Loyverse al guardar y queda registrado con tu nombre.</p>
    <div class="campo"><label>¿Entra o sale?</label><div class="chips">
      <label class="chip-sel ancho"><input type="radio" name="aj-sig" value="-1" checked><span>➖ Sale</span></label>
      <label class="chip-sel ancho"><input type="radio" name="aj-sig" value="1"><span>➕ Entra</span></label></div></div>
    <div class="fila-botones" style="margin:0"><div class="campo"><label for="aj-cant">Cantidad</label><input id="aj-cant" type="number" inputmode="decimal" min="0" step="any"></div>
      <div class="campo"><label for="aj-modo">En</label><select id="aj-modo">${emp ? `<option value="${esc(a.empaque_factor)}">${esc(plural(a.empaque_nombre, 2))}</option>` : ''}<option value="1">${esc(unidadTxt(a, 2))}</option></select></div></div>
    <div class="campo"><label for="aj-mot">Motivo</label><select id="aj-mot">${MOTIVOS_AJUSTE.map(([sg, m]) => `<option data-sig="${sg}">${esc(m)}</option>`).join('')}</select></div>
    <div class="campo"><label for="aj-nota">Nota <span class="opc">(opcional)</span></label><input id="aj-nota" type="text" placeholder="Ej. se cayeron 2 en la bodega"></div>
    <button class="btn" type="submit">Guardar y aplicar en Loyverse</button></form>`, { titulo: 'Ajustar existencias' });
  const f = $('form', v.el);
  $('#aj-mot', f).addEventListener('change', (e) => {
    const sg = e.target.selectedOptions[0].dataset.sig;
    if (sg === '-' || sg === '+') $(`input[name=aj-sig][value="${sg === '-' ? -1 : 1}"]`, f).checked = true;
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Number($('#aj-cant', f).value);
    if (!(n > 0)) return aviso('Escribe la cantidad (mayor a 0).', 'error');
    const total = n * Number($('#aj-modo', f).value) * Number($('input[name=aj-sig]:checked', f).value);
    conOcupado($('button[type=submit]', f), async () => {
      const r = await rpc('inv_ajuste_crear', { p_articulo: a.id, p_cantidad: total, p_motivo: $('#aj-mot', f).value, p_nota: $('#aj-nota', f).value });
      if (!r.ok) return aviso(r.error === 'falta_motivo' ? 'Elige el motivo.' : msg(r), 'error');
      const x = await lv('aplicar', { origen: 'ajuste', id: r.id });
      v.cerrar();
      if (x.ok) aviso(`Ajuste aplicado en Loyverse: ${total > 0 ? '+' : ''}${cantidad(total)} ${unidadTxt(a, Math.abs(total))}.`, 'ok', 6000);
      else aviso(`Ajuste guardado, pero no se pudo aplicar en Loyverse: ${msg(x)} Reinténtalo en Pedidos › Por aplicar en Loyverse.`, 'error', 9000);
    });
  });
}

// Crear un artículo en Loyverse (desde una solicitud del personal o directo)
async function ventanaAlta(sol, arts, alCambiar) {
  const lista = arts || await articulos().catch(() => []);
  const cats = [...new Set(lista.filter((a) => a.en_ultimo_export && a.categoria).map((a) => a.categoria))].sort();
  const v = ventana(`<form class="formulario" novalidate>
    ${sol ? `<p class="detalle" style="margin-top:0">Lo pidió ${esc(sol.perfil_nombre || '')}${sol.nota ? `: “${esc(sol.nota)}”` : ''}.</p>` : ''}
    <div class="campo"><label for="al-nom">Nombre (como saldrá en la caja)</label><input id="al-nom" type="text" value="${esc(sol?.nombre || '')}"></div>
    <div class="campo"><label for="al-cat">Categoría</label><select id="al-cat">${cats.map((c) => `<option ${c === sol?.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="">Sin categoría</option></select></div>
    <div class="fila-botones" style="margin:0"><div class="campo"><label for="al-pre">Precio de venta</label><input id="al-pre" type="number" inputmode="decimal" min="0" step="any" value="${esc(sol?.precio || '')}" placeholder="vacío = precio variable"></div>
      <div class="campo"><label for="al-cos">Costo <span class="opc">(opcional)</span></label><input id="al-cos" type="number" inputmode="decimal" min="0" step="any"></div></div>
    <label class="interruptor"><input type="checkbox" id="al-inv" checked><span>Seguir el inventario (se cuenta y se recibe en pedidos)</span></label>
    <p class="ayuda">Se crea en Loyverse con existencia 0. Lo que llegue entra con el siguiente pedido recibido.</p>
    <button class="btn" type="submit">Crear en Loyverse</button></form>`, { titulo: 'Artículo nuevo en Loyverse' });
  $('form', v.el).addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = $('#al-nom', v.el).value.trim();
    if (nombre.length < 2) return aviso('Escribe el nombre.', 'error');
    conOcupado($('button[type=submit]', v.el), async () => {
      const x = await lv('alta', { solicitud_id: sol?.id || null, nombre, categoria: $('#al-cat', v.el).value, precio: Number($('#al-pre', v.el).value) || null,
        costo: Number($('#al-cos', v.el).value) || null, sigue: $('#al-inv', v.el).checked });
      if (!x.ok) return aviso(msg(x), 'error', 7000);
      v.cerrar(); aviso(`“${nombre}” ya está en Loyverse y en el catálogo.`, 'ok', 5000); alCambiar?.();
    });
  });
}

// Solicitudes del personal: dar de alta un artículo nuevo o quitar uno que ya no se vende
async function pintarSolicitudes(el, alCambiar) {
  let l;
  try { l = await api.seleccionar('inv_solicitudes', 'select=id,tipo,articulo_id,nombre,categoria,precio,nota,foto_path,perfil_nombre,estado,respuesta,creado_en&estado=in.(pendiente,aprobada)&order=creado_en.asc'); }
  catch { el.hidden = true; return; }
  el.hidden = !l.length;
  if (!l.length) return;
  el.innerHTML = `<div class="enc-avisos"><h2>🗂️ Solicitudes del personal (${l.length})</h2></div><div class="lista">${l.map((s) => `<button type="button" class="fila" data-sol="${esc(s.id)}">
    <span class="pend-ico">${s.tipo === 'alta' ? '➕' : '➖'}</span><div class="fila-txt"><b>${s.tipo === 'alta' ? 'Dar de alta' : 'Ya no se vende'}: ${esc(s.nombre)}</b>
    <span>${esc(s.perfil_nombre || '')} · ${esc(fechaHora(s.creado_en))}${s.nota ? ` · “${esc(s.nota)}”` : ''}</span></div>
    ${s.estado === 'aprobada' ? '<span class="insignia aviso-i">Por crear en Loyverse</span>' : '<span class="insignia gris">Nueva</span>'}</button>`).join('')}</div>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-sol]'); if (!b) return;
    const s = l.find((x) => x.id === b.dataset.sol);
    const alta = s.tipo === 'alta';
    const v = ventana(`<dl class="datos"><dt>Pidió</dt><dd>${esc(s.perfil_nombre || '')} · ${esc(fechaHora(s.creado_en))}</dd>
        <dt>Artículo</dt><dd>${esc(s.nombre)}</dd>${s.categoria ? `<dt>Categoría</dt><dd>${esc(s.categoria)}</dd>` : ''}${s.precio ? `<dt>Precio sugerido</dt><dd>${esc(pesos(s.precio))}</dd>` : ''}
        ${s.nota ? `<dt>Nota</dt><dd>${esc(s.nota)}</dd>` : ''}${s.respuesta ? `<dt>Respuesta</dt><dd>${esc(s.respuesta)}</dd>` : ''}</dl>
      ${s.foto_path ? '<img class="evidencia" id="sol-foto" alt="Foto" hidden>' : ''}
      <p class="ayuda">${alta ? 'Al aprobarlo puedes crearlo directo en Loyverse (con precio y categoría) o, si ya lo creaste allá, marcarlo como hecho.'
        : 'Al aprobarlo se quita de la venta en Loyverse y se apaga en la app (ya no se cuenta ni se recibe). No se borra: se conserva su historial.'}</p>
      <div class="campo"><label for="sol-resp">Respuesta para el empleado <span class="opc">(opcional)</span></label><input id="sol-resp" type="text"></div>
      <div class="acciones">${alta ? '<button type="button" class="btn" data-crear-lv>＋ Aprobar y crear en Loyverse</button><button type="button" class="btn ghost" data-r="hecha">Ya lo creé en Loyverse</button>'
        : '<button type="button" class="btn" data-baja-lv>Aprobar y quitar de la venta</button>'}
        <button type="button" class="btn peligro-suave" data-r="rechazada">Rechazar</button></div>`, { titulo: alta ? 'Artículo nuevo' : 'Quitar artículo' });
    if (s.foto_path) api.urlsFotos([{ path: s.foto_path }], 'evidencias').then((u) => { const im = $('#sol-foto', v.el); const x = u.get(`${s.foto_path}|`); if (im && x) { im.src = x; im.hidden = false; } });
    v.el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-crear-lv]')) { v.cerrar(); return ventanaAlta(s, null, alCambiar); }
      const bj = ev.target.closest('[data-baja-lv]');
      if (bj) {
        return conOcupado(bj, async () => {
          const x = await lv('baja', { articulo_id: s.articulo_id, solicitud_id: s.id });
          if (!x.ok) return aviso(msg(x), 'error', 7000);
          await rpc('inv_sol_resolver', { p_id: s.id, p_estado: 'hecha', p_respuesta: $('#sol-resp', v.el).value });
          v.cerrar(); aviso('Listo: ya no se vende en Loyverse y se apagó en la app.', 'ok', 5000); alCambiar();
        });
      }
      const r0 = ev.target.closest('[data-r]'); if (!r0) return;
      conOcupado(r0, async () => {
        const r = await rpc('inv_sol_resolver', { p_id: s.id, p_estado: r0.dataset.r, p_respuesta: $('#sol-resp', v.el).value });
        if (!r.ok) return aviso(msg(r), 'error');
        v.cerrar(); aviso(r.estado === 'rechazada' ? 'Solicitud rechazada.' : 'Listo.', 'ok'); alCambiar();
      });
    });
  };
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
    <div class="fila-botones" style="margin:0"><div class="campo"><label for="aj-av">Hora en que se abre solo</label><input id="aj-av" type="time" data-clave="inv_conteo_aviso_hora" value="${esc(aj.inv_conteo_aviso_hora || '09:00')}"></div>
      <div class="campo"><label for="aj-lim">Hora límite del conteo</label><input id="aj-lim" type="time" data-clave="inv_conteo_hora_limite" value="${esc(aj.inv_conteo_hora_limite || '15:00')}"></div></div>
    <div class="campo"><label for="aj-max">Avisar si pasan más de estos días sin conteo</label><input id="aj-max" type="number" inputmode="numeric" min="1" max="99" data-clave="inv_conteo_max_dias" value="${esc(aj.inv_conteo_max_dias ?? 10)}"></div>
    <div class="campo"><label for="aj-tol">Tolerancia de insumos (%)</label><input id="aj-tol" type="number" inputmode="numeric" min="0" max="99" data-clave="inv_tolerancia_insumos" value="${esc(aj.inv_tolerancia_insumos ?? 20)}"></div>
    <button class="btn" type="submit">Guardar</button></form>`;
}
function formAjustesCarga(aj) {
  return `<form class="formulario aj-inv" novalidate>
    <p class="ayuda">Si hay pedidos recibidos sin verificar, se le recuerda a gerencia estos días.</p>
    <div class="campo"><label>Días</label>${chipsDias('inv_carga_dias', aj.inv_carga_dias)}</div>
    <div class="campo"><label for="aj-hc">Hora del recordatorio (y del aviso “Por pedir”)</label><input id="aj-hc" type="time" data-clave="inv_carga_hora" value="${esc(aj.inv_carga_hora || '09:00')}"></div>
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
