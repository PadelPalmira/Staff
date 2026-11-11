// Pestaña Inventario del empleado: recibir pedidos (con foto del ticket), conteo a ciegas y descuadres que le mandó gerencia.
import * as api from '../api.js';
import { estiloCategoria, miniArticulo, hidratarFotosArticulos } from '../categorias.js';
import { esc, $, $$, aviso, ventana, confirmar, conOcupado, fechaCorta, fechaHora, comprimirEvidencia, cantidad, pesos, plural } from '../ui.js';
import { campoAdjuntos } from '../pend.js';

const ERR = {
  falta_ticket: 'Toma la foto del ticket o sube la imagen / PDF.', falta_motivo_dano: 'Di qué le pasó a lo que llegó mal.', falta_foto_dano: 'Toma la foto de lo que llegó mal.', sin_articulos: 'Agrega al menos un artículo.', cantidad_invalida: 'Revisa las cantidades (deben ser mayores a 0).',
  articulo_invalido: 'Hay un artículo que no se reconoce.', conteo_no_disponible: 'Este conteo ya no está disponible (lo cerró o reasignó gerencia).', en_curso: 'Alguien más ya está haciendo el conteo.',
  sin_conexion: 'No hay internet. Revisa la conexión e intenta de nuevo.',
  falta_foto: 'Toma la foto o sube la captura del comprobante.', falta_ref: 'Escribe el número de ticket o toma la foto del ticket.',
  ya_pagado: 'Este pago ya se avisó.', cerrado: 'Ya se cerró el tiempo para explicar este conteo.',
};
const METODO = { efectivo: '💵 Efectivo en caja', transferencia: '🏦 Transferencia', tarjeta: '💳 Tarjeta / ticket en Loyverse', en_mano: '🤝 Lo recibió gerencia' };
const origenCobro = (b) => (b.origen === 'caja' ? `Descuadre de caja del ${fechaCorta(b.fecha_caja + 'T12:00:00')}` : `Conteo del ${fechaCorta(b.fecha_conteo + 'T12:00:00')}`);
const msg = (r) => ERR[r?.error] || r?.mensaje || 'No se pudo completar. Intenta de nuevo.';
const ESTADO = { enviado: ['Por verificar', 'gris'], verificado: ['Verificado', ''], cargado: ['Cargado', ''], cancelado: ['Cancelado', 'mal'] };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const tieneEmpaque = (a) => !!a.empaque_nombre && Number(a.empaque_factor) > 0;
const unidadTxt = (a, n) => plural(a.unidad || 'pieza', n);
const MOTIVOS_DANO = ['Golpeado', 'Abierto', 'Roto', 'Caducado', 'No llegó'];
const MAX_PDF = 6 * 1024 * 1024;

export function montarInventarioEmp(cont, { llamar, alCambio }) {
  let est = null, vista = 'inicio', muerto = false;
  const listaConteo = (c) => (c?.articulos ? est.catalogo.filter((a) => c.articulos.includes(a.id)) : est.catalogo);
  const raiz = document.createElement('div');
  cont.innerHTML = ''; cont.appendChild(raiz);
  raiz.innerHTML = '<p class="cargando">Cargando inventario…</p>';

  async function cargar() {
    const [r, d] = await Promise.all([llamar('inv_emp_estado'), llamar('inv_conteo_diferencias').catch(() => null)]);
    if (muerto) return;
    if (!r.ok) { if (r.error !== 'sesion_invalida') raiz.innerHTML = `<div class="tarjeta vacio"><p>${esc(msg(r))}</p><button class="btn ghost" data-recargar>Volver a intentar</button></div>`; return; }
    est = r; est.difs = d?.ok ? d.conteos : []; alCambio?.(r);
    if (vista === 'inicio') pintarInicio();
  }

  function nuevaVista() { const d = document.createElement('div'); raiz.replaceChildren(d); return d; }

  // ---------- inicio ----------
  function pintarInicio() {
    vista = 'inicio';
    const c = est.conteo;
    const debe = est.cobros.filter((b) => b.pago_estado === 'debe'), porConf = est.cobros.filter((b) => b.pago_estado === 'por_confirmar');
    let h = '<h2 class="saludo">Inventario</h2>';
    if (c) {
      const hechos = Object.keys(c.items).length, total = listaConteo(c).length;
      const ahora = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
      h += `<section class="tarjeta conteo-pend"><h2>📋 ${c.reconteo ? 'Reconteo' : 'Conteo de inventario'}</h2>
        <p class="detalle">${c.reconteo ? `Gerencia pide volver a contar ${total} artículo${total === 1 ? '' : 's'}.` : 'Cuenta todo lo que hay.'} Puedes seguir vendiendo mientras cuentas: la app descuenta sola lo que se venda.${c.limite && ahora < c.limite ? ` Tienes hasta las ${esc(c.limite)}.` : ''}</p>
        <div class="progreso"><span style="width:${total ? Math.round((hechos / total) * 100) : 0}%"></span></div>
        <p class="detalle">${hechos} de ${total} artículos contados</p>
        <button type="button" class="btn grande" data-contar>${hechos ? 'Seguir contando' : 'Empezar conteo'}</button></section>`;
    } else {
      h += `<section class="tarjeta"><h2>📋 Conteo de inventario</h2>
        <p class="detalle">Puedes hacer un conteo cuando quieras (por ejemplo al recibir o entregar tu turno). Se compara con Loyverse y gerencia lo revisa.</p>
        <button type="button" class="btn grande" data-contar>📋 Hacer conteo</button></section>`;
    }
    for (const b of debe) {
      h += `<section class="tarjeta tarjeta-avisos cobro-pend"><h2>💸 Debes ${esc(pesos(b.monto))}</h2>
        <p class="detalle">${esc(origenCobro(b))}${b.nota ? ` · ${esc(b.nota)}` : ''}</p>
        ${b.pago_rechazo ? `<p class="nota-mal">Gerencia no encontró tu pago: “${esc(b.pago_rechazo)}”. Vuelve a avisar cuando pagues.</p>` : ''}
        <div class="fila-botones" style="margin:0"><button type="button" class="btn" data-pagar="${esc(b.id)}">✅ Ya pagué</button>
        <button type="button" class="btn ghost" data-cobro="${esc(b.id)}">Ver detalle</button></div></section>`;
    }
    for (const b of porConf) {
      h += `<section class="tarjeta cobro-espera"><h2>⏳ Pagaste ${esc(pesos(b.monto))}</h2>
        <p class="detalle">${esc(origenCobro(b))} · ${esc(METODO[b.pago_metodo] || '')}. Gerencia lo está confirmando.</p></section>`;
    }
    for (const d of est.difs || []) {
      const items = d.items.filter((i) => !i.es_insumo || i.diferencia < 0);
      if (!items.length) continue;
      const explicados = items.filter((i) => i.mi_explicacion).length;
      h += `<section class="tarjeta difs-conteo"><h2>🧮 Diferencias del conteo del ${esc(fechaCorta(d.fecha + 'T12:00:00'))}</h2>
        <p class="detalle">${d.puede_explicar ? `Contó ${esc(d.contado_por_nombre || '—')}. Si sabes por qué falta o sobra algo (se contó mal, se rompió, se regaló…), explícalo. Tienes hasta el ${esc(fechaHora(d.explicar_hasta))}`
          : d.estado === 'revisado' ? 'Gerencia ya revisó este conteo.' : 'Ya se cerró el tiempo para explicar. Gerencia lo está revisando.'}</p>
        <button type="button" class="btn ${d.puede_explicar ? '' : 'ghost'}" data-difs="${esc(d.id)}">${d.puede_explicar ? `Ver y explicar (${items.length})` : 'Ver diferencias'}</button>
        ${d.puede_explicar && explicados ? `<p class="ayuda">Explicaste ${explicados} de ${items.length}.</p>` : ''}</section>`;
    }
    h += `<button type="button" class="btn grande" data-recibir>＋ Recibir pedido</button>
      <p class="ayuda">Cuando llegue un proveedor: captura lo que llegó y toma la foto del ticket. Gerencia lo revisa después.</p>`;
    h += '<h3 class="sub-titulo">Mis pedidos</h3>';
    h += est.pedidos.length ? `<div class="lista">${est.pedidos.map((p) => {
      const [t, cl] = ESTADO[p.estado] || [p.estado, 'gris'];
      return `<div class="fila inv"><div class="fila-txt"><b>${esc(fechaHora(p.creado_en))}${p.proveedor ? ` · ${esc(p.proveedor)}` : ''}</b>
        <span>${p.items.map((i) => `${esc(cantidad(i.cantidad))} ${esc(i.en_empaques ? plural(i.empaque_nombre, i.cantidad) : plural(i.unidad || 'pieza', i.cantidad))} ${esc(i.nombre)}`).join(' · ')}</span>
        ${p.comentario ? `<span class="warn-txt">Gerencia: ${esc(p.comentario)}</span>` : ''}</div><span class="insignia ${cl}">${esc(t)}</span></div>`;
    }).join('')}</div>` : '<p class="detalle">Todavía no has recibido pedidos.</p>';
    const SOL = { pendiente: ['En revisión', 'gris'], aprobada: ['Aprobada · se crea en Loyverse', ''], hecha: ['Listo', ''], rechazada: ['No aprobada', 'mal'] };
    h += `<h3 class="sub-titulo">Artículos del catálogo</h3>
      <div class="fila-botones" style="margin-top:0"><button type="button" class="btn ghost" data-sol-alta>＋ Pedir artículo nuevo</button>
      <button type="button" class="btn ghost" data-sol-baja>➖ Ya no se vende</button></div>
      <p class="ayuda">¿Llegó algo que no está en la lista o ya no se vende algo? Avísale a gerencia aquí.</p>`;
    if (est.solicitudes?.length) h += `<div class="lista">${est.solicitudes.map((x) => { const [t, cl] = SOL[x.estado] || [x.estado, 'gris'];
      return `<div class="fila inv"><span class="pend-ico">${x.tipo === 'alta' ? '➕' : '➖'}</span><div class="fila-txt"><b>${esc(x.nombre)}</b><span>${esc(fechaHora(x.creado_en))}${x.respuesta ? ` · Gerencia: ${esc(x.respuesta)}` : ''}</span></div>
        <span class="insignia ${cl}">${esc(t)}</span></div>`; }).join('')}</div>`;
    const pagados = est.cobros.filter((b) => b.pago_estado === 'pagado');
    if (pagados.length) h += `<h3 class="sub-titulo">Cobros pagados</h3><div class="lista">${pagados.map((b) => `<button type="button" class="fila" data-cobro="${esc(b.id)}"><div class="fila-txt"><b>${esc(origenCobro(b))}</b><span>${esc(pesos(b.monto))} · ${esc(METODO[b.pago_metodo] || '')}</span></div><span class="insignia">Pagado</span></button>`).join('')}</div>`;
    raiz.innerHTML = h;
  }

  function verCobro(id) {
    const b = est.cobros.find((x) => x.id === id);
    if (!b) return;
    const det = b.detalle || [];
    const falt = det.filter((d) => d.diferencia < 0), sobr = det.filter((d) => d.diferencia > 0);
    const fila = (d) => `<li><span>${esc(d.nombre)}</span><b>${d.diferencia > 0 ? '+' : ''}${esc(cantidad(d.diferencia))}</b><i>${esc(pesos(Math.abs(d.diferencia) * (d.precio || 0)))}</i></li>`;
    const v = ventana(`${b.origen === 'caja' ? `<p class="detalle" style="margin-top:0">La caja del ${esc(fechaCorta(b.fecha_caja + 'T12:00:00'))} cerró con un faltante de <b>${esc(pesos(Math.abs(b.caja_diferencia || 0)))}</b>.</p>`
      : `<p class="detalle" style="margin-top:0">En el conteo del ${esc(fechaCorta(b.fecha_conteo + 'T12:00:00'))} se encontraron estas diferencias contra lo que dice el sistema (a precio de venta).</p>`}
      ${falt.length ? `<h3 class="sub-titulo">Faltó</h3><ul class="lista-dif">${falt.map(fila).join('')}</ul>` : ''}
      ${sobr.length ? `<h3 class="sub-titulo">Sobró (se resta)</h3><ul class="lista-dif">${sobr.map(fila).join('')}</ul>` : ''}
      <p class="total-dif">Te toca: <b>${esc(pesos(b.monto))}</b></p>${b.nota ? `<p class="detalle">Nota de gerencia: ${esc(b.nota)}</p>` : ''}
      ${b.pago_estado === 'pagado' ? `<p class="nota-info">✅ Pagado · ${esc(METODO[b.pago_metodo] || '')}</p>` : b.pago_estado === 'por_confirmar' ? '<p class="nota-info">⏳ Avisaste que ya pagaste. Gerencia lo está confirmando.</p>' : ''}
      <div class="acciones">${b.pago_estado === 'debe' ? '<button type="button" class="btn" data-pagar-v>✅ Ya pagué</button>' : ''}
        ${b.visto_en ? '<button type="button" class="btn ghost" data-cerrar>Cerrar</button>' : '<button type="button" class="btn ghost" data-enterado>Enterado</button>'}</div>`, { titulo: b.origen === 'caja' ? 'Descuadre de caja' : 'Descuadre de inventario' });
    $('[data-enterado]', v.el)?.addEventListener('click', (e) => conOcupado(e.currentTarget, async () => {
      await llamar('inv_cobro_visto', { p_id: b.id }); v.cerrar(); cargar();
    }));
    $('[data-pagar-v]', v.el)?.addEventListener('click', () => { v.cerrar(); ventanaPago(b.id); });
    if (!b.visto_en) llamar('inv_cobro_visto', { p_id: b.id }).then(() => { b.visto_en = new Date().toISOString(); }).catch(() => {});
  }

  function ventanaPago(id) {
    const b = est.cobros.find((x) => x.id === id);
    if (!b) return;
    const AYUDA = {
      efectivo: 'Mete el dinero a la caja y regístralo en Loyverse como <b>Entrada de efectivo</b> (Turno › Entradas/salidas de efectivo) con el comentario “Pago de tu nombre”. Gerencia lo revisa en Loyverse.',
      transferencia: 'Transfiere a la cuenta del club y <b>toma foto o sube la captura del comprobante</b>.',
      tarjeta: 'Cobra en Loyverse un ticket por el monto y <b>escribe el número de ticket</b> o toma la foto del ticket.',
    };
    const v = ventana(`<form class="formulario" novalidate><p class="detalle" style="margin-top:0">${esc(origenCobro(b))} · <b>${esc(pesos(b.monto))}</b></p>
      <fieldset class="campo"><legend>¿Cómo pagaste?</legend><div class="opciones-pago">
        ${['efectivo', 'transferencia', 'tarjeta'].map((m, i) => `<label class="opcion-pago"><input type="radio" name="pg-m" value="${m}" ${i === 0 ? 'checked' : ''}><span>${METODO[m]}</span></label>`).join('')}</div></fieldset>
      <p class="nota-info" id="pg-ayuda">${AYUDA.efectivo}</p>
      <div class="campo" id="pg-ref-c" hidden><label for="pg-ref">Número de ticket en Loyverse</label><input id="pg-ref" type="text" maxlength="40" placeholder="Ej. 2-1045"></div>
      <div class="campo"><label>Comprobante <span class="opc" id="pg-opc">(opcional)</span></label><div id="pg-adj"></div></div>
      <div class="campo"><label for="pg-nota">Nota <span class="opc">(opcional)</span></label><input id="pg-nota" type="text" maxlength="200"></div>
      <button class="btn grande" type="submit">Avisar que ya pagué</button></form>`, { titulo: '✅ Ya pagué' });
    const adj = campoAdjuntos($('#pg-adj', v.el), 'Tomar foto');
    const metodo = () => $('input[name=pg-m]:checked', v.el).value;
    v.el.addEventListener('change', (e) => {
      if (e.target.name !== 'pg-m') return;
      const m = metodo();
      $('#pg-ayuda', v.el).innerHTML = AYUDA[m];
      $('#pg-ref-c', v.el).hidden = m !== 'tarjeta';
      $('#pg-opc', v.el).textContent = m === 'transferencia' ? '(obligatorio)' : m === 'tarjeta' ? '(o el número de ticket)' : '(opcional)';
    });
    $('form', v.el).addEventListener('submit', (ev) => {
      ev.preventDefault();
      const m = metodo(), ref = m === 'tarjeta' ? $('#pg-ref', v.el).value.trim() : '';
      if (m === 'transferencia' && !adj.blob()) return aviso(ERR.falta_foto, 'error');
      if (m === 'tarjeta' && !ref && !adj.blob()) return aviso(ERR.falta_ref, 'error');
      conOcupado($('button[type=submit]', v.el), async () => {
        let foto = null;
        try { foto = await adj.subir(b.id, Date.now().toString(36), 'cobros'); } catch { return aviso('No se pudo subir el comprobante. Revisa el internet e intenta de nuevo.', 'error'); }
        const r = await llamar('inv_cobro_pagar', { p_id: b.id, p_metodo: m, p_foto: foto, p_ref: ref || null, p_nota: $('#pg-nota', v.el).value });
        if (!r.ok) return aviso(msg(r), 'error');
        v.cerrar(); aviso('Listo. Gerencia va a confirmar tu pago.', 'ok', 5000); cargar();
      });
    });
  }

  function verDiferencias(id) {
    const d = (est.difs || []).find((x) => x.id === id);
    if (!d) return;
    const items = d.items.filter((i) => !i.es_insumo || i.diferencia < 0);
    const fila = (i) => {
      const dinero = i.precio != null ? ` · ${pesos(Math.abs(i.diferencia) * i.precio)}` : '';
      const dec = d.estado === 'revisado' ? (i.diferencia < 0 ? (i.no_cobrar ? '<span class="insignia">Perdonado</span>' : '<span class="insignia mal">Se cobra</span>') : '') : '';
      return `<div class="fila inv dif-emp" data-art="${esc(i.articulo_id)}"><div class="fila-txt"><b>${esc(i.nombre)}</b>
        <span class="${i.diferencia < 0 ? 'mal-txt' : 'ok-txt'}">${i.diferencia < 0 ? 'Faltan' : 'Sobran'} ${esc(cantidad(Math.abs(i.diferencia)))} ${esc(unidadTxt(i, Math.abs(i.diferencia)))}${esc(dinero)} · contaron ${esc(cantidad(i.contado))}</span>
        ${i.mi_explicacion ? `<span>💬 Tú: ${esc(i.mi_explicacion)}</span>` : ''}
        ${i.explicaciones.map((x) => `<span>💬 ${esc(x.nombre)}: ${esc(x.texto)}</span>`).join('')}</div>
        ${d.puede_explicar ? `<button type="button" class="btn ghost chico" data-explicar>${i.mi_explicacion ? 'Cambiar' : 'Explicar'}</button>` : dec}</div>`;
    };
    const v = ventana(`<p class="detalle" style="margin-top:0">Conteo del ${esc(fechaCorta(d.fecha + 'T12:00:00'))} contra lo que dice Loyverse. ${d.puede_explicar ? 'Gerencia decide qué se cobra y qué se perdona.' : ''}</p>
      <div class="lista">${items.map(fila).join('')}</div>`, { titulo: '🧮 Diferencias del conteo' });
    v.el.addEventListener('click', (e) => {
      const bt = e.target.closest('[data-explicar]'); if (!bt) return;
      const i = items.find((x) => x.articulo_id === bt.closest('[data-art]').dataset.art);
      const w = ventana(`<form class="formulario" novalidate><p class="detalle" style="margin-top:0"><b>${esc(i.nombre)}</b>: ${i.diferencia < 0 ? 'faltan' : 'sobran'} ${esc(cantidad(Math.abs(i.diferencia)))}</p>
        <div class="campo"><label for="ex-t">¿Qué pasó?</label><textarea id="ex-t" rows="3" maxlength="300" placeholder="Ej. se contó mal, había más en la bodega / se rompió una / se le dio a un cliente">${esc(i.mi_explicacion || '')}</textarea></div>
        <div class="chips-rapidos">${['Se contó mal', 'Se rompió / se echó a perder', 'Estaba en un ticket abierto', 'Cortesía para un cliente', 'No sé qué pasó'].map((t) => `<button type="button" class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <button class="btn" type="submit">Guardar</button></form>`, { titulo: 'Explicar diferencia' });
      w.el.addEventListener('click', (ev) => { const c = ev.target.closest('[data-t]'); if (c) { const t = $('#ex-t', w.el); t.value = t.value ? `${t.value.trim()}. ${c.dataset.t}` : c.dataset.t; t.focus(); } });
      $('form', w.el).addEventListener('submit', (ev) => {
        ev.preventDefault();
        conOcupado($('button[type=submit]', w.el), async () => {
          const r = await llamar('inv_conteo_explicar', { p_conteo: d.id, p_articulo: i.articulo_id, p_texto: $('#ex-t', w.el).value });
          if (!r.ok) return aviso(msg(r), 'error');
          w.cerrar(); v.cerrar(); aviso('Guardado. Gerencia lo va a ver al revisar el conteo.', 'ok', 4000);
          await cargar(); verDiferencias(d.id);
        });
      });
    });
  }

  // ---------- recibir pedido ----------
  function pintarPedido() {
    const el = nuevaVista();
    vista = 'pedido';
    const ped = { id: uuid(), items: [], ticket: null, url: null };
    el.innerHTML = `<div class="enc-seccion"><h2>Recibir pedido</h2><button type="button" class="enlace" data-volver>Cancelar</button></div>
      <div class="formulario">
        <div class="campo"><label for="pe-prov">Proveedor <span class="opc">(opcional)</span></label><input id="pe-prov" type="text" placeholder="Ej. Coca-Cola, Sabritas, Costco"></div>
        <div class="campo"><label>Ticket del proveedor</label><div class="ticket-foto" id="pe-ticket"></div></div>
        <div class="campo"><label for="pe-buscar">¿Qué llegó?</label><input id="pe-buscar" type="text" placeholder="Busca el artículo…" autocomplete="off">
          <div class="sugerencias" id="pe-sug"></div></div>
        <div id="pe-items" class="lista"></div>
        <button type="button" class="enlace" data-nuevo>＋ Llegó algo que no está en la lista</button>
        <div class="campo"><label for="pe-nota">Nota <span class="opc">(opcional)</span></label><input id="pe-nota" type="text" placeholder="Ej. faltó una caja, venía golpeado…"></div>
        <button type="button" class="btn grande" data-enviar>Enviar pedido</button></div>`;
    const sug = $('#pe-sug', el), lista = $('#pe-items', el);
    const pintarTicket = () => {
      const t = $('#pe-ticket', el);
      const botones = `<div class="fila-botones" style="margin-top:0"><button type="button" class="btn ghost" data-ticket="foto">📷 Tomar foto</button><button type="button" class="btn ghost" data-ticket="archivo">📎 Subir imagen o PDF</button></div>`;
      if (!ped.ticket) { t.innerHTML = `${botones}<p class="ayuda">Si te mandaron el ticket digital (WhatsApp o correo), súbelo con “Subir imagen o PDF”.</p>`; return; }
      t.innerHTML = `${ped.esPdf ? `<p class="pdf-chip">📄 ${esc(ped.nombreArchivo || 'ticket.pdf')}</p>` : `<img class="ticket-mini" src="${ped.url}" alt="Ticket">`}${botones}`;
    };
    pintarTicket();
    const pintarItems = () => {
      lista.innerHTML = ped.items.length ? ped.items.map((it, i) => {
        const a = it.articulo;
        return `<div class="fila inv item-ped" data-i="${i}">${a ? miniArticulo(a, 38) : ''}<div class="fila-txt"><b>${esc(a ? a.nombre : it.nombre_nuevo + ' (nuevo)')}</b>
          ${a && tieneEmpaque(a) ? `<span>1 ${esc(a.empaque_nombre)} = ${esc(cantidad(a.empaque_factor))} ${esc(unidadTxt(a, a.empaque_factor))}</span>` : ''}
          ${it.dano ? `<span class="mal-txt">⚠️ ${esc(cantidad(it.dano.cantidad))} llegaron mal (${esc(it.dano.motivo.toLowerCase())}) · no se suman <button type="button" class="enlace" data-dano>Cambiar</button></span>`
            : '<button type="button" class="enlace dano-btn" data-dano>⚠️ Llegó algo mal</button>'}</div>
          <div class="cant-ped"><input type="number" inputmode="decimal" min="0" step="any" value="${esc(it.cantidad ?? '')}" data-cant aria-label="Cantidad">
          ${a && tieneEmpaque(a) ? `<select data-modo aria-label="Unidad"><option value="1" ${it.en_empaques ? 'selected' : ''}>${esc(plural(a.empaque_nombre, 2))}</option><option value="0" ${!it.en_empaques ? 'selected' : ''}>${esc(unidadTxt(a, 2))}</option></select>`
            : `<span class="unidad">${esc(a ? unidadTxt(a, 2) : 'piezas')}</span>`}
          <button type="button" class="icono-btn" data-quitar aria-label="Quitar">✕</button></div></div>`;
      }).join('') : '<p class="ayuda">Busca y toca cada artículo que llegó.</p>';
      hidratarFotosArticulos(lista, api);
    };
    pintarItems();
    $('#pe-buscar', el).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (q.length < 2) { sug.innerHTML = ''; return; }
      const res = est.catalogo.filter((a) => a.nombre.toLowerCase().includes(q)).slice(0, 8);
      sug.innerHTML = res.length ? res.map((a) => `<button type="button" class="sug" data-art="${esc(a.id)}">${miniArticulo(a, 36)}<span class="sug-txt">${esc(a.nombre)}<small>${esc(a.categoria || '')}</small></span></button>`).join('')
        : '<p class="ayuda">No está en la lista. Usa “Llegó algo que no está en la lista”.</p>';
      hidratarFotosArticulos(sug, api);
    });
    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-art]');
      if (s) {
        const a = est.catalogo.find((x) => x.id === s.dataset.art);
        if (!ped.items.some((i) => i.articulo?.id === a.id)) ped.items.push({ articulo: a, cantidad: '', en_empaques: tieneEmpaque(a) });
        $('#pe-buscar', el).value = ''; sug.innerHTML = ''; pintarItems();
        $(`.item-ped[data-i="${ped.items.findIndex((i) => i.articulo?.id === a.id)}"] [data-cant]`, el)?.focus();
        return;
      }
      const q = e.target.closest('[data-quitar]');
      if (q) { ped.items.splice(Number(q.closest('[data-i]').dataset.i), 1); pintarItems(); return; }
      if (e.target.closest('[data-nuevo]')) return nuevoArticulo();
      const tk = e.target.closest('[data-ticket]');
      if (tk) return tomarTicket(tk.dataset.ticket);
      const dn = e.target.closest('[data-dano]');
      if (dn) return ventanaDano(ped.items[Number(dn.closest('[data-i]').dataset.i)]);
      if (e.target.closest('[data-volver]')) {
        if (!ped.items.length && !ped.ticket) return pintarInicio();
        return confirmar({ titulo: 'Cancelar pedido', texto: 'Se perderá lo que capturaste. ¿Salir?', ok: 'Salir', peligro: true }).then((ok) => { if (ok) pintarInicio(); });
      }
      const env = e.target.closest('[data-enviar]');
      if (env) conOcupado(env, enviar);
    });
    lista.addEventListener('input', (e) => {
      const f = e.target.closest('[data-i]'); if (!f) return;
      const it = ped.items[Number(f.dataset.i)];
      if (e.target.matches('[data-cant]')) it.cantidad = e.target.value;
    });
    lista.addEventListener('change', (e) => {
      const f = e.target.closest('[data-i]'); if (!f) return;
      if (e.target.matches('[data-modo]')) ped.items[Number(f.dataset.i)].en_empaques = e.target.value === '1';
    });
    function nuevoArticulo() {
      const v = ventana(`<form class="formulario" novalidate><p class="detalle">Gerencia lo dará de alta en el catálogo.</p>
        <div class="campo"><label for="nn-nom">¿Qué es?</label><input id="nn-nom" type="text" placeholder="Ej. Agua Bonafont 1L"></div>
        <div class="campo"><label for="nn-cant">¿Cuántas piezas?</label><input id="nn-cant" type="number" inputmode="decimal" min="0" step="any"></div>
        <button class="btn" type="submit">Agregar</button></form>`, { titulo: 'Artículo nuevo' });
      $('form', v.el).addEventListener('submit', (e) => {
        e.preventDefault();
        const n = $('#nn-nom', v.el).value.trim(), c = $('#nn-cant', v.el).value;
        if (n.length < 2 || !(Number(c) > 0)) return aviso('Escribe el nombre y la cantidad.', 'error');
        ped.items.push({ nombre_nuevo: n, cantidad: c, en_empaques: false }); v.cerrar(); pintarItems();
      });
    }
    function tomarTicket(modo) {
      const inp = document.createElement('input');
      inp.type = 'file';
      if (modo === 'foto') { inp.accept = 'image/*'; inp.setAttribute('capture', 'environment'); } else inp.accept = 'image/*,application/pdf,.pdf';
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0]; if (!f) return;
        const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        try {
          if (pdf) {
            if (f.size > MAX_PDF) return aviso('El PDF pesa más de 6 MB. Mándale captura de pantalla del ticket.', 'error', 6000);
            ped.ticket = new Blob([f], { type: 'application/pdf' }); ped.esPdf = true; ped.nombreArchivo = f.name;
          } else {
            ped.ticket = await comprimirEvidencia(f, 1600, 0.72); ped.esPdf = false;
          }
          if (ped.url) URL.revokeObjectURL(ped.url);
          ped.url = pdf ? null : URL.createObjectURL(ped.ticket);
          pintarTicket();
        } catch { aviso('No se pudo leer el archivo. Intenta de nuevo.', 'error'); }
      });
      inp.click();
    }
    // Lo que llegó mal: no se suma a inventario y se reporta como incidencia (con foto obligatoria)
    function ventanaDano(it) {
      const d = it.dano || { cantidad: '', motivo: '', blob: null, url: null };
      let blob = d.blob, url = d.url;
      const nombre = it.articulo ? it.articulo.nombre : it.nombre_nuevo;
      const v = ventana(`<form class="formulario" novalidate><p class="detalle">Lo que llegó mal <b>no se suma al inventario</b> y queda como incidencia para que gerencia reclame al proveedor.</p>
        <div class="campo"><label for="dn-cant">¿Cuántas piezas de <b>${esc(nombre)}</b> llegaron mal?</label><input id="dn-cant" type="number" inputmode="decimal" min="0" step="any" value="${esc(d.cantidad)}"></div>
        <div class="campo"><label>¿Qué les pasó?</label><div class="chips">${MOTIVOS_DANO.map((m) => `<label class="chip-sel ancho"><input type="radio" name="dn-mot" value="${esc(m)}" ${d.motivo === m ? 'checked' : ''}><span>${esc(m)}</span></label>`).join('')}</div></div>
        <div class="campo"><label>Foto (obligatoria)</label><div id="dn-foto">${url ? `<img class="ticket-mini" src="${url}" alt="Foto">` : ''}<button type="button" class="btn ghost" data-dn-foto>📷 ${url ? 'Tomar otra' : 'Tomar foto'}</button></div></div>
        <p class="ayuda">En “cantidad” del artículo pon solo las que llegaron bien.</p>
        <div class="fila-botones">${it.dano ? '<button type="button" class="btn ghost" data-dn-quitar>Quitar</button>' : ''}<button class="btn" type="submit">Guardar</button></div></form>`, { titulo: '⚠️ Llegó mal' });
      const f = $('form', v.el);
      $('[data-dn-foto]', f).addEventListener('click', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
        inp.addEventListener('change', async () => {
          const x = inp.files?.[0]; if (!x) return;
          try { blob = await comprimirEvidencia(x); if (url && url !== d.url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob);
            $('#dn-foto', f).innerHTML = `<img class="ticket-mini" src="${url}" alt="Foto"><button type="button" class="btn ghost" data-dn-foto>📷 Tomar otra</button>`;
            $('[data-dn-foto]', f).addEventListener('click', () => inp.click());
          } catch { aviso('No se pudo leer la foto.', 'error'); }
        });
        inp.click();
      });
      $('[data-dn-quitar]', f)?.addEventListener('click', () => { it.dano = null; v.cerrar(); pintarItems(); });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const c = Number($('#dn-cant', f).value), m = $('input[name=dn-mot]:checked', f)?.value;
        if (!(c > 0)) return aviso('Escribe cuántas piezas llegaron mal.', 'error');
        if (!m) return aviso(ERR.falta_motivo_dano, 'error');
        if (!blob) return aviso(ERR.falta_foto_dano, 'error');
        it.dano = { cantidad: c, motivo: m, blob, url };
        v.cerrar(); pintarItems();
      });
    }
    async function enviar() {
      if (!ped.ticket) return aviso(ERR.falta_ticket, 'error');
      if (!ped.items.length) return aviso(ERR.sin_articulos, 'error');
      if (ped.items.some((i) => !(Number(i.cantidad) > 0) && !(i.dano && (i.cantidad === '' || Number(i.cantidad) === 0)))) return aviso(ERR.cantidad_invalida, 'error');
      try {
        const ruta = `pedidos/${ped.id}.${ped.esPdf ? 'pdf' : 'jpg'}`;
        await api.subirFoto(ruta, ped.ticket, 'tickets');
        const danos = [];
        for (const [n, i] of ped.items.entries()) {
          if (!i.dano) continue;
          const rd = `pedidos/${ped.id}/dano-${n}.jpg`;
          await api.subirFoto(rd, i.dano.blob, 'evidencias');
          danos[n] = rd;
        }
        const extra = (i, n) => (i.dano ? { danadas: i.dano.cantidad, dano_motivo: i.dano.motivo, dano_foto: danos[n] } : {});
        const r = await llamar('inv_pedido_crear', {
          p_id: ped.id, p_proveedor: $('#pe-prov', el).value, p_nota: $('#pe-nota', el).value, p_ticket: ruta,
          p_items: ped.items.map((i, n) => ({ ...(i.articulo ? { articulo_id: i.articulo.id, cantidad: Number(i.cantidad) || 0, en_empaques: !!i.en_empaques } : { nombre_nuevo: i.nombre_nuevo, cantidad: Number(i.cantidad) || 0 }), ...extra(i, n) })),
        });
        if (!r.ok) return aviso(msg(r), 'error');
        if (r.notificacion_id) api.avisar(r.notificacion_id);
        if (ped.url) URL.revokeObjectURL(ped.url);
        aviso(r.danados ? 'Pedido enviado. Lo que llegó mal quedó como incidencia y gerencia ya fue avisada.' : 'Pedido enviado. Gerencia ya fue avisada.', 'ok', 5000);
        vista = 'inicio'; await cargar();
      } catch (err) { aviso(err.codigo === 'sin_conexion' ? ERR.sin_conexion : `No se pudo subir el ticket o las fotos (${err.message || 'error'}).`, 'error', 7000); }
    }
  }

  // ---------- conteo ----------
  const REGLAS_CONTEO = `<ul class="reglas-conteo">
      <li>📦 Cuenta <b>físicamente</b> cada artículo: refri, bodega, mostrador y exhibición.</li>
      <li>🔢 Si viene en caja o paquete, pon cuántas cajas <b>y</b> cuántas piezas sueltas.</li>
      <li>💳 Si vendes algo mientras cuentas, cóbralo en Loyverse en ese momento (no dejes tickets abiertos).</li>
      <li>✅ <b>Cuenta dos veces</b> antes de enviar.</li></ul>`;
  const AVISO_COBRO = '<p class="nota-mal">⚠️ Tu conteo se compara con Loyverse. <b>Si hay faltantes, se te pueden cobrar.</b> Revisa dos veces que todo esté bien contado.</p>';
  async function iniciarConteo() {
    const r = await llamar('inv_conteo_iniciar');
    if (!r.ok) return aviso(r.error === 'en_curso' ? r.mensaje : msg(r), 'error', 7000);
    await cargar();
    if (!est?.conteo) return aviso('No se pudo abrir el conteo. Intenta de nuevo.', 'error');
    if (Object.keys(est.conteo.items).length) return pintarConteo();
    const v = ventana(`<div class="nota-mal aviso-tickets">🧾 <b>Antes de contar, cobra o cierra TODOS los tickets abiertos en Loyverse.</b><br>
        Lo que está en un ticket abierto todavía cuenta como existencia en Loyverse, así que <b>va a salir como faltante</b> en el conteo y se te puede cobrar.</div>
      ${AVISO_COBRO}${REGLAS_CONTEO}
      <label class="interruptor confirmar-conteo"><input type="checkbox" id="tk-ok"><span>Ya revisé: <b>no hay tickets abiertos</b> en Loyverse</span></label>
      <div class="acciones"><button type="button" class="btn grande" data-ok disabled>Empezar a contar</button></div>`, { titulo: 'Antes de empezar' });
    $('#tk-ok', v.el).addEventListener('change', (ev) => { $('[data-ok]', v.el).disabled = !ev.target.checked; });
    $('[data-ok]', v.el).addEventListener('click', () => { v.cerrar(); pintarConteo(); });
  }
  function pintarConteo() {
    const el = nuevaVista();
    vista = 'conteo';
    const c = est.conteo;
    if (!c) return pintarInicio();
    const items = { ...c.items };
    const lista = listaConteo(c);
    const cats = [...new Set(lista.map((a) => a.categoria || 'Sin categoría'))];
    const contados = () => Object.keys(items).length;
    el.innerHTML = `<div class="enc-seccion"><h2>${c.reconteo ? 'Reconteo' : 'Conteo'}</h2><button type="button" class="enlace" data-volver>Salir</button></div>
      ${AVISO_COBRO}
      <p class="nota-aviso">Cuenta lo que hay físicamente, artículo por artículo. Si vendes algo, cóbralo en Loyverse en ese momento (no dejes tickets abiertos).</p>
      <div class="conteo-barra"><input id="co-buscar" type="text" placeholder="Buscar artículo…" autocomplete="off"><b id="co-prog"></b></div>
      <div class="cat-chips" role="navigation" aria-label="Categorías">${cats.map((cat) => { const e = estiloCategoria(cat); return `<button type="button" class="cat-chip" style="--cat:${e.color}" data-ir-cat="${esc(cat)}"><span>${e.emoji}</span>${esc(cat)}<i data-cat-prog="${esc(cat)}"></i></button>`; }).join('')}</div>
      ${cats.map((cat) => { const e = estiloCategoria(cat); return `<section class="cat-conteo" style="--cat:${e.color}" data-cat="${esc(cat)}"><div class="cat-enc"><span class="cat-emoji">${e.emoji}</span><b>${esc(cat)}</b><i data-cat-prog="${esc(cat)}"></i></div><div class="lista">
        ${lista.filter((a) => (a.categoria || 'Sin categoría') === cat).map((a) => {
          const v = items[a.id];
          const emp = tieneEmpaque(a);
          return `<div class="fila inv art-conteo ${v ? 'contado' : ''}" data-a="${esc(a.id)}" data-nombre="${esc(a.nombre.toLowerCase())}">
            ${miniArticulo(a, 46)}
            <div class="fila-txt"><b>${esc(a.nombre)}</b><span data-total>${v ? `✓ ${esc(cantidad(v.contado))} ${esc(unidadTxt(a, v.contado))}` : (emp ? `1 ${esc(a.empaque_nombre)} = ${esc(cantidad(a.empaque_factor))} ${esc(unidadTxt(a, a.empaque_factor))}` : '')}</span></div>
            <div class="cant-conteo">${emp ? `<label><input type="number" inputmode="decimal" min="0" step="any" data-emp value="${esc(v?.empaques ?? '')}"><small>${esc(plural(a.empaque_nombre, 2))}</small></label>` : ''}
              <label><input type="number" inputmode="decimal" min="0" step="any" data-suel value="${esc(v ? (v.sueltas ?? (emp ? '' : v.contado)) : '')}"><small>${esc(emp ? `${unidadTxt(a, 2)} sueltos` : unidadTxt(a, 2))}</small></label></div></div>`;
        }).join('')}</div></section>`; }).join('')}
      <button type="button" class="btn grande" data-enviar-conteo>Enviar conteo</button>`;
    const prog = () => {
      $('#co-prog', el).textContent = `${contados()} / ${lista.length}`;
      for (const cat of cats) {
        const arts = lista.filter((a) => (a.categoria || 'Sin categoría') === cat);
        const n = arts.filter((a) => items[a.id]).length;
        $$(`[data-cat-prog="${CSS.escape(cat)}"]`, el).forEach((pc) => { pc.textContent = `${n}/${arts.length}`; pc.closest('.cat-chip, .cat-enc')?.classList.toggle('completa', n === arts.length); });
      }
    };
    prog();
    hidratarFotosArticulos(el, api);
    const timers = new Map();
    el.addEventListener('input', (e) => {
      if (e.target.id === 'co-buscar') {
        const q = e.target.value.trim().toLowerCase();
        $$('.art-conteo', el).forEach((f) => { f.hidden = q && !f.dataset.nombre.includes(q); });
        return;
      }
      const f = e.target.closest('.art-conteo'); if (!f) return;
      clearTimeout(timers.get(f.dataset.a));
      timers.set(f.dataset.a, setTimeout(() => guardar(f), 700));
    });
    el.addEventListener('focusout', (e) => { const f = e.target.closest?.('.art-conteo'); if (f && timers.has(f.dataset.a)) { clearTimeout(timers.get(f.dataset.a)); timers.delete(f.dataset.a); guardar(f); } });
    async function guardar(f) {
      timers.delete(f.dataset.a);
      const a = lista.find((x) => x.id === f.dataset.a);
      const ve = $('[data-emp]', f)?.value ?? '', vs = $('[data-suel]', f).value;
      const emp = ve === '' ? null : Number(ve), sue = vs === '' ? null : Number(vs);
      if ((emp != null && emp < 0) || (sue != null && sue < 0)) return aviso('No se permiten números negativos.', 'error');
      const r = await llamar('inv_conteo_guardar', { p_conteo: c.id, p_articulo: a.id, p_empaques: emp, p_sueltas: sue });
      if (muerto) return;
      if (!r.ok) { f.classList.add('error-conteo'); return aviso(msg(r), 'error'); }
      f.classList.remove('error-conteo');
      if (r.contado == null) { delete items[a.id]; f.classList.remove('contado'); $('[data-total]', f).textContent = ''; }
      else { items[a.id] = { empaques: emp, sueltas: sue, contado: r.contado }; f.classList.add('contado'); $('[data-total]', f).textContent = `✓ ${cantidad(r.contado)} ${unidadTxt(a, r.contado)}`; }
      c.items = { ...items };
      prog();
    }
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-volver]')) { vista = 'inicio'; return cargar(); }
      const ic = e.target.closest('[data-ir-cat]');
      if (ic) { const sec = $(`section[data-cat="${CSS.escape(ic.dataset.irCat)}"]`, el); if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - 130, behavior: 'smooth' }); return; }
      const b = e.target.closest('[data-enviar-conteo]');
      if (!b) return;
      for (const [id, t] of timers) { clearTimeout(t); timers.delete(id); await guardar($(`.art-conteo[data-a="${id}"]`, el)); }
      const faltan = lista.filter((a) => !items[a.id]);
      const v = ventana(`${AVISO_COBRO}
        <p class="detalle">Contaste <b>${contados()} de ${lista.length}</b> artículos.</p>
        ${faltan.length ? `<p class="nota-aviso">Te faltan ${faltan.length}: ${esc(faltan.slice(0, 12).map((a) => a.nombre).join(', '))}${faltan.length > 12 ? '…' : ''}.<br><b>Si los envías así cuentan como 0 (no hay)</b> y saldrían como faltantes.</p>` : ''}
        <label class="interruptor confirmar-conteo"><input type="checkbox" id="cf-ok"><span>Conté todo <b>dos veces</b> y estoy seguro de que está bien</span></label>
        <div class="acciones"><button type="button" class="btn grande" data-enviar-ya disabled>Enviar conteo</button>
          <button type="button" class="btn ghost" data-revisar>Revisar otra vez</button></div>`, { titulo: 'Antes de enviar' });
      $('#cf-ok', v.el).addEventListener('change', (ev) => { $('[data-enviar-ya]', v.el).disabled = !ev.target.checked; });
      $('[data-revisar]', v.el).addEventListener('click', () => { v.cerrar(); const f = faltan[0] && $(`.art-conteo[data-a="${faltan[0].id}"]`, el); f?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      $('[data-enviar-ya]', v.el).addEventListener('click', (ev) => conOcupado(ev.currentTarget, async () => {
        const r = await llamar('inv_conteo_enviar', { p_conteo: c.id, p_forzar: true });
        if (!r.ok) return aviso(msg(r), 'error');
        v.cerrar(); aviso('Conteo enviado. En unos minutos aparecen aquí las diferencias para que puedan explicarlas. ¡Gracias!', 'ok', 7000);
        vista = 'inicio'; cargar();
      }));
    });
  }

  // ---------- pedir alta / baja de un artículo ----------
  function ventanaSolicitud(tipo) {
    const alta = tipo === 'alta';
    const cats = (est.categorias || []).slice().sort();
    const v = ventana(`<form class="formulario" novalidate>
      ${alta ? `<p class="detalle" style="margin-top:0">Gerencia lo revisa y, si lo aprueba, lo da de alta en Loyverse. Después aparece en la lista para contar y recibir.</p>
        <div class="campo"><label for="sa-nom">Nombre del artículo</label><input id="sa-nom" type="text" maxlength="80" placeholder="Ej. Gatorade Zero 600 ml"></div>
        <div class="campo"><label for="sa-cat">Categoría</label><select id="sa-cat"><option value="">—</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="campo"><label for="sa-precio">Precio de venta sugerido <span class="opc">($, opcional)</span></label><input id="sa-precio" type="number" inputmode="decimal" min="0" step="any"></div>`
      : `<p class="detalle" style="margin-top:0">Elige el artículo que ya no se vende en el club. Gerencia lo revisa y lo quita de la lista.</p>
        <div class="campo"><label for="sb-buscar">Artículo</label><input id="sb-buscar" type="text" placeholder="Busca el artículo…" autocomplete="off"><div class="lista" id="sb-sug" style="margin-top:6px"></div></div>
        <p class="detalle" id="sb-elegido" hidden></p>`}
      <div class="campo"><label for="sa-nota">${alta ? 'Nota' : '¿Por qué?'} ${alta ? '<span class="opc">(opcional)</span>' : ''}</label><input id="sa-nota" type="text" placeholder="${alta ? 'Ej. lo piden mucho los clientes' : 'Ej. el proveedor ya no lo trae'}"></div>
      <div class="campo"><label>Foto <span class="opc">(opcional)</span></label><label class="btn ghost chico">📷 Tomar foto<input type="file" accept="image/*" capture="environment" class="oculto-accesible" id="sa-foto"></label>
        <img class="evidencia previa-mini" id="sa-prev" alt="" hidden></div>
      <button class="btn" type="submit">Enviar a gerencia</button></form>`, { titulo: alta ? '＋ Artículo nuevo' : '➖ Ya no se vende' });
    const f = $('form', v.el);
    let elegido = null, blob = null;
    $('#sa-foto', f).addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try { blob = await comprimirEvidencia(file); const im = $('#sa-prev', f); im.src = URL.createObjectURL(blob); im.hidden = false; } catch { aviso('No se pudo leer la foto.', 'error'); }
    });
    if (!alta) {
      $('#sb-buscar', f).addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const l = q.length < 2 ? [] : est.catalogo.filter((a) => a.nombre.toLowerCase().includes(q)).slice(0, 8);
        $('#sb-sug', f).innerHTML = l.map((a) => `<button type="button" class="fila" data-elegir="${esc(a.id)}">${miniArticulo(a, 36)}<div class="fila-txt"><b>${esc(a.nombre)}</b></div></button>`).join('');
        hidratarFotosArticulos($('#sb-sug', f), api);
      });
      $('#sb-sug', f).addEventListener('click', (e) => {
        const b = e.target.closest('[data-elegir]'); if (!b) return;
        elegido = est.catalogo.find((a) => a.id === b.dataset.elegir);
        $('#sb-sug', f).innerHTML = ''; $('#sb-buscar', f).value = '';
        const p = $('#sb-elegido', f); p.hidden = false; p.innerHTML = `Elegido: <b>${esc(elegido.nombre)}</b>`;
      });
    }
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const nota = $('#sa-nota', f).value.trim();
      if (alta && $('#sa-nom', f).value.trim().length < 3) return aviso('Escribe el nombre del artículo.', 'error');
      if (!alta && !elegido) return aviso('Busca y elige el artículo.', 'error');
      if (!alta && nota.length < 3) return aviso('Escribe por qué ya no se vende.', 'error');
      conOcupado($('button[type=submit]', f), async () => {
        let ruta = null;
        if (blob) { try { ruta = `inventario/${uuid()}.jpg`; await api.subirFoto(ruta, blob, 'evidencias'); } catch { return aviso('No se pudo subir la foto. Intenta de nuevo o quítala.', 'error'); } }
        const r = await llamar('inv_sol_crear', { p_tipo: tipo, p_articulo: elegido?.id || null, p_nombre: alta ? $('#sa-nom', f).value : null,
          p_categoria: alta ? $('#sa-cat', f).value : null, p_precio: alta ? Number($('#sa-precio', f).value) || null : null, p_nota: nota, p_foto: ruta });
        if (!r.ok) return aviso({ ya_solicitado: 'Ya hay una solicitud para quitar ese artículo.', falta_nombre: 'Escribe el nombre del artículo.', falta_nota: 'Escribe por qué ya no se vende.' }[r.error] || msg(r), 'error');
        if (r.notificacion_id) api.avisar(r.notificacion_id);
        v.cerrar(); aviso('Listo, se le avisó a gerencia.', 'ok'); cargar();
      });
    });
  }

  raiz.addEventListener('click', (e) => {
    if (vista !== 'inicio') return;
    if (e.target.closest('[data-sol-alta]')) return ventanaSolicitud('alta');
    if (e.target.closest('[data-sol-baja]')) return ventanaSolicitud('baja');
    if (e.target.closest('[data-recargar]')) return cargar();
    if (e.target.closest('[data-recibir]')) return pintarPedido();
    const bc = e.target.closest('[data-contar]');
    if (bc) return conOcupado(bc, iniciarConteo);
    const cb = e.target.closest('[data-cobro]');
    if (cb) return verCobro(cb.dataset.cobro);
    const pg = e.target.closest('[data-pagar]');
    if (pg) return ventanaPago(pg.dataset.pagar);
    const df = e.target.closest('[data-difs]');
    if (df) return verDiferencias(df.dataset.difs);
  });

  cargar();
  return { destruir() { muerto = true; }, ocupado: () => vista !== 'inicio' };
}
