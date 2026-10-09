// Pestaña Inventario del empleado: recibir pedidos (con foto del ticket), conteo a ciegas y descuadres que le mandó gerencia.
import * as api from '../api.js';
import { esc, $, $$, aviso, ventana, confirmar, conOcupado, fechaCorta, fechaHora, comprimirEvidencia, cantidad, pesos, plural } from '../ui.js';

const ERR = {
  falta_ticket: 'Toma la foto del ticket.', sin_articulos: 'Agrega al menos un artículo.', cantidad_invalida: 'Revisa las cantidades (deben ser mayores a 0).',
  articulo_invalido: 'Hay un artículo que no se reconoce.', conteo_no_disponible: 'Este conteo ya no está disponible (lo cerró o reasignó gerencia).',
  sin_conexion: 'No hay internet. Revisa la conexión e intenta de nuevo.',
};
const msg = (r) => ERR[r?.error] || r?.mensaje || 'No se pudo completar. Intenta de nuevo.';
const ESTADO = { enviado: ['Por verificar', 'gris'], verificado: ['Verificado', ''], cargado: ['Cargado', ''], cancelado: ['Cancelado', 'mal'] };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const tieneEmpaque = (a) => !!a.empaque_nombre && Number(a.empaque_factor) > 0;
const unidadTxt = (a, n) => plural(a.unidad || 'pieza', n);

export function montarInventarioEmp(cont, { llamar, alCambio }) {
  let est = null, vista = 'inicio', muerto = false;
  const raiz = document.createElement('div');
  cont.innerHTML = ''; cont.appendChild(raiz);
  raiz.innerHTML = '<p class="cargando">Cargando inventario…</p>';

  async function cargar() {
    const r = await llamar('inv_emp_estado');
    if (muerto) return;
    if (!r.ok) { if (r.error !== 'sesion_invalida') raiz.innerHTML = `<div class="tarjeta vacio"><p>${esc(msg(r))}</p><button class="btn ghost" data-recargar>Volver a intentar</button></div>`; return; }
    est = r; alCambio?.(r);
    if (vista === 'inicio') pintarInicio();
  }

  function nuevaVista() { const d = document.createElement('div'); raiz.replaceChildren(d); return d; }

  // ---------- inicio ----------
  function pintarInicio() {
    vista = 'inicio';
    const c = est.conteo, sinVer = est.cobros.filter((b) => !b.visto_en);
    let h = '<h2 class="saludo">Inventario</h2>';
    if (c) {
      const hechos = Object.keys(c.items).length, total = est.catalogo.length;
      h += `<section class="tarjeta conteo-pend"><h2>📋 Conteo de inventario</h2>
        <p class="detalle">Cuenta todo lo que hay, sin clientes y sin tickets abiertos. Tienes hasta las ${esc(c.limite)}.</p>
        <div class="progreso"><span style="width:${total ? Math.round((hechos / total) * 100) : 0}%"></span></div>
        <p class="detalle">${hechos} de ${total} artículos contados</p>
        <button type="button" class="btn grande" data-contar>${hechos ? 'Seguir contando' : 'Empezar conteo'}</button></section>`;
    }
    for (const b of sinVer) {
      h += `<section class="tarjeta tarjeta-avisos"><h2>Descuadre del conteo del ${esc(fechaCorta(b.fecha_conteo + 'T12:00:00'))}</h2>
        <p class="detalle">Gerencia te asignó <b>${esc(pesos(b.monto))}</b>${b.nota ? ` · ${esc(b.nota)}` : ''}.</p>
        <button type="button" class="btn ghost" data-cobro="${esc(b.id)}">Ver detalle</button></section>`;
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
    const vistos = est.cobros.filter((b) => b.visto_en);
    if (vistos.length) h += `<h3 class="sub-titulo">Descuadres anteriores</h3><div class="lista">${vistos.map((b) => `<button type="button" class="fila" data-cobro="${esc(b.id)}"><div class="fila-txt"><b>Conteo del ${esc(fechaCorta(b.fecha_conteo + 'T12:00:00'))}</b><span>${esc(pesos(b.monto))}</span></div></button>`).join('')}</div>`;
    raiz.innerHTML = h;
  }

  function verCobro(id) {
    const b = est.cobros.find((x) => x.id === id);
    if (!b) return;
    const falt = b.detalle.filter((d) => d.diferencia < 0), sobr = b.detalle.filter((d) => d.diferencia > 0);
    const fila = (d) => `<li><span>${esc(d.nombre)}</span><b>${d.diferencia > 0 ? '+' : ''}${esc(cantidad(d.diferencia))}</b><i>${esc(pesos(Math.abs(d.diferencia) * (d.precio || 0)))}</i></li>`;
    const v = ventana(`<p class="detalle" style="margin-top:0">En el conteo del ${esc(fechaCorta(b.fecha_conteo + 'T12:00:00'))} se encontraron estas diferencias contra lo que dice el sistema (a precio de venta).</p>
      ${falt.length ? `<h3 class="sub-titulo">Faltó</h3><ul class="lista-dif">${falt.map(fila).join('')}</ul>` : ''}
      ${sobr.length ? `<h3 class="sub-titulo">Sobró (se resta)</h3><ul class="lista-dif">${sobr.map(fila).join('')}</ul>` : ''}
      <p class="total-dif">Te toca: <b>${esc(pesos(b.monto))}</b></p>${b.nota ? `<p class="detalle">Nota de gerencia: ${esc(b.nota)}</p>` : ''}
      <div class="acciones">${b.visto_en ? '<button type="button" class="btn ghost" data-cerrar>Cerrar</button>' : '<button type="button" class="btn" data-enterado>Enterado</button>'}</div>`, { titulo: 'Descuadre de inventario' });
    $('[data-enterado]', v.el)?.addEventListener('click', (e) => conOcupado(e.currentTarget, async () => {
      await llamar('inv_cobro_visto', { p_id: b.id }); v.cerrar(); cargar();
    }));
  }

  // ---------- recibir pedido ----------
  function pintarPedido() {
    const el = nuevaVista();
    vista = 'pedido';
    const ped = { id: uuid(), items: [], ticket: null, url: null };
    el.innerHTML = `<div class="enc-seccion"><h2>Recibir pedido</h2><button type="button" class="enlace" data-volver>Cancelar</button></div>
      <div class="formulario">
        <div class="campo"><label for="pe-prov">Proveedor <span class="opc">(opcional)</span></label><input id="pe-prov" type="text" placeholder="Ej. Coca-Cola, Sabritas, Costco"></div>
        <div class="campo"><label>Foto del ticket</label><div class="ticket-foto" id="pe-ticket"><button type="button" class="btn ghost" data-ticket>📷 Tomar foto del ticket</button></div></div>
        <div class="campo"><label for="pe-buscar">¿Qué llegó?</label><input id="pe-buscar" type="text" placeholder="Busca el artículo…" autocomplete="off">
          <div class="sugerencias" id="pe-sug"></div></div>
        <div id="pe-items" class="lista"></div>
        <button type="button" class="enlace" data-nuevo>＋ Llegó algo que no está en la lista</button>
        <div class="campo"><label for="pe-nota">Nota <span class="opc">(opcional)</span></label><input id="pe-nota" type="text" placeholder="Ej. faltó una caja, venía golpeado…"></div>
        <button type="button" class="btn grande" data-enviar>Enviar pedido</button></div>`;
    const sug = $('#pe-sug', el), lista = $('#pe-items', el);
    const pintarItems = () => {
      lista.innerHTML = ped.items.length ? ped.items.map((it, i) => {
        const a = it.articulo;
        return `<div class="fila inv item-ped" data-i="${i}"><div class="fila-txt"><b>${esc(a ? a.nombre : it.nombre_nuevo + ' (nuevo)')}</b>
          ${a && tieneEmpaque(a) ? `<span>1 ${esc(a.empaque_nombre)} = ${esc(cantidad(a.empaque_factor))} ${esc(unidadTxt(a, a.empaque_factor))}</span>` : ''}</div>
          <div class="cant-ped"><input type="number" inputmode="decimal" min="0" step="any" value="${esc(it.cantidad ?? '')}" data-cant aria-label="Cantidad">
          ${a && tieneEmpaque(a) ? `<select data-modo aria-label="Unidad"><option value="1" ${it.en_empaques ? 'selected' : ''}>${esc(plural(a.empaque_nombre, 2))}</option><option value="0" ${!it.en_empaques ? 'selected' : ''}>${esc(unidadTxt(a, 2))}</option></select>`
            : `<span class="unidad">${esc(a ? unidadTxt(a, 2) : 'piezas')}</span>`}
          <button type="button" class="icono-btn" data-quitar aria-label="Quitar">✕</button></div></div>`;
      }).join('') : '<p class="ayuda">Busca y toca cada artículo que llegó.</p>';
    };
    pintarItems();
    $('#pe-buscar', el).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (q.length < 2) { sug.innerHTML = ''; return; }
      const res = est.catalogo.filter((a) => a.nombre.toLowerCase().includes(q)).slice(0, 8);
      sug.innerHTML = res.length ? res.map((a) => `<button type="button" class="sug" data-art="${esc(a.id)}">${esc(a.nombre)}<small>${esc(a.categoria || '')}</small></button>`).join('')
        : '<p class="ayuda">No está en la lista. Usa “Llegó algo que no está en la lista”.</p>';
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
      if (e.target.closest('[data-ticket]')) return tomarTicket();
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
    function tomarTicket() {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0]; if (!f) return;
        try {
          ped.ticket = await comprimirEvidencia(f, 1600, 0.72);
          if (ped.url) URL.revokeObjectURL(ped.url);
          ped.url = URL.createObjectURL(ped.ticket);
          $('#pe-ticket', el).innerHTML = `<img class="ticket-mini" src="${ped.url}" alt="Foto del ticket"><button type="button" class="enlace" data-ticket>Tomar otra</button>`;
        } catch { aviso('No se pudo leer la foto. Intenta de nuevo.', 'error'); }
      });
      inp.click();
    }
    async function enviar() {
      if (!ped.ticket) return aviso(ERR.falta_ticket, 'error');
      if (!ped.items.length) return aviso(ERR.sin_articulos, 'error');
      if (ped.items.some((i) => !(Number(i.cantidad) > 0))) return aviso(ERR.cantidad_invalida, 'error');
      try {
        const ruta = `pedidos/${ped.id}.jpg`;
        await api.subirFoto(ruta, ped.ticket, 'tickets');
        const r = await llamar('inv_pedido_crear', {
          p_id: ped.id, p_proveedor: $('#pe-prov', el).value, p_nota: $('#pe-nota', el).value, p_ticket: ruta,
          p_items: ped.items.map((i) => (i.articulo ? { articulo_id: i.articulo.id, cantidad: Number(i.cantidad), en_empaques: !!i.en_empaques } : { nombre_nuevo: i.nombre_nuevo, cantidad: Number(i.cantidad) })),
        });
        if (!r.ok) return aviso(msg(r), 'error');
        if (r.notificacion_id) api.avisar(r.notificacion_id);
        if (ped.url) URL.revokeObjectURL(ped.url);
        aviso('Pedido enviado. Gerencia ya fue avisada.', 'ok', 4000);
        vista = 'inicio'; await cargar();
      } catch (err) { aviso(err.codigo === 'sin_conexion' ? ERR.sin_conexion : `No se pudo subir la foto del ticket (${err.message || 'error'}).`, 'error', 7000); }
    }
  }

  // ---------- conteo ----------
  function pintarConteo() {
    const el = nuevaVista();
    vista = 'conteo';
    const c = est.conteo;
    if (!c) return pintarInicio();
    const items = { ...c.items };
    const cats = [...new Set(est.catalogo.map((a) => a.categoria || 'Sin categoría'))];
    const contados = () => Object.keys(items).length;
    el.innerHTML = `<div class="enc-seccion"><h2>Conteo</h2><button type="button" class="enlace" data-volver>Salir</button></div>
      <p class="nota-aviso">Sin clientes y sin tickets abiertos. Cuenta lo que hay físicamente; no importa lo que diga el sistema.</p>
      <div class="conteo-barra"><input id="co-buscar" type="text" placeholder="Buscar artículo…" autocomplete="off"><b id="co-prog"></b></div>
      ${cats.map((cat) => `<details class="cat-conteo" open><summary>${esc(cat)} <span data-cat-prog="${esc(cat)}"></span></summary><div class="lista">
        ${est.catalogo.filter((a) => (a.categoria || 'Sin categoría') === cat).map((a) => {
          const v = items[a.id];
          const emp = tieneEmpaque(a);
          return `<div class="fila inv art-conteo ${v ? 'contado' : ''}" data-a="${esc(a.id)}" data-nombre="${esc(a.nombre.toLowerCase())}">
            <div class="fila-txt"><b>${esc(a.nombre)}</b><span data-total>${v ? `✓ ${esc(cantidad(v.contado))} ${esc(unidadTxt(a, v.contado))}` : (emp ? `1 ${esc(a.empaque_nombre)} = ${esc(cantidad(a.empaque_factor))} ${esc(unidadTxt(a, a.empaque_factor))}` : '')}</span></div>
            <div class="cant-conteo">${emp ? `<label><input type="number" inputmode="decimal" min="0" step="any" data-emp value="${esc(v?.empaques ?? '')}"><small>${esc(plural(a.empaque_nombre, 2))}</small></label>` : ''}
              <label><input type="number" inputmode="decimal" min="0" step="any" data-suel value="${esc(v ? (v.sueltas ?? (emp ? '' : v.contado)) : '')}"><small>${esc(emp ? `${unidadTxt(a, 2)} sueltos` : unidadTxt(a, 2))}</small></label></div></div>`;
        }).join('')}</div></details>`).join('')}
      <button type="button" class="btn grande" data-enviar-conteo>Enviar conteo</button>`;
    const prog = () => {
      $('#co-prog', el).textContent = `${contados()} / ${est.catalogo.length}`;
      for (const cat of cats) {
        const arts = est.catalogo.filter((a) => (a.categoria || 'Sin categoría') === cat);
        const pc = $(`[data-cat-prog="${CSS.escape(cat)}"]`, el);
        if (pc) pc.textContent = `${arts.filter((a) => items[a.id]).length}/${arts.length}`;
      }
    };
    prog();
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
      const a = est.catalogo.find((x) => x.id === f.dataset.a);
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
      const b = e.target.closest('[data-enviar-conteo]');
      if (!b) return;
      for (const [id, t] of timers) { clearTimeout(t); timers.delete(id); await guardar($(`.art-conteo[data-a="${id}"]`, el)); }
      conOcupado(b, async () => {
        let r = await llamar('inv_conteo_enviar', { p_conteo: c.id, p_forzar: false });
        if (!r.ok && r.error === 'faltan') {
          const lista = r.faltan.slice(0, 12).map((x) => x.nombre).join(', ') + (r.faltan.length > 12 ? '…' : '');
          if (!await confirmar({ titulo: `Faltan ${r.faltan.length} artículos`, texto: `No contaste: ${lista}. Si los envías así se toman como 0 (no hay). ¿Enviar de todos modos?`, ok: 'Enviar con 0' })) return;
          r = await llamar('inv_conteo_enviar', { p_conteo: c.id, p_forzar: true });
        }
        if (!r.ok) return aviso(msg(r), 'error');
        aviso('Conteo enviado. ¡Gracias!', 'ok', 4000);
        vista = 'inicio'; cargar();
      });
    });
  }

  raiz.addEventListener('click', (e) => {
    if (vista !== 'inicio') return;
    if (e.target.closest('[data-recargar]')) return cargar();
    if (e.target.closest('[data-recibir]')) return pintarPedido();
    if (e.target.closest('[data-contar]')) return pintarConteo();
    const cb = e.target.closest('[data-cobro]');
    if (cb) verCobro(cb.dataset.cobro);
  });

  cargar();
  return { destruir() { muerto = true; }, ocupado: () => vista !== 'inicio' };
}
