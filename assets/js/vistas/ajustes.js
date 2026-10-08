// Ajustes (solo administrador): horarios de turnos, días cerrados y correo de prueba.
import * as api from '../api.js';
import { esc, $, $$, aviso, ventana, confirmar, conOcupado } from '../ui.js';
import { hoyMx } from './turnos.js';

const DIAS = [[1, 'L', 'lun'], [2, 'M', 'mar'], [3, 'M', 'mié'], [4, 'J', 'jue'], [5, 'V', 'vie'], [6, 'S', 'sáb'], [7, 'D', 'dom']];
const hh = (t) => String(t || '').slice(0, 5);
const ERR = { horario_invalido: 'La hora de salida debe ser después de la de entrada.', faltan_dias: 'Elige al menos un día.', fecha_invalida: 'Elige una fecha.', sin_permiso: 'Solo el administrador puede hacer esto.' };
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export async function montarAjustes(el) {
  el.innerHTML = `<div class="enc-seccion"><h2>Ajustes</h2></div>
    <h3 class="sub-titulo">Horarios de los turnos</h3><div id="aj-turnos" class="lista"><p class="cargando">Cargando…</p></div>
    <div class="enc-seccion" style="margin-top:22px"><h3 class="sub-titulo" style="margin:0">Días cerrados</h3><button type="button" class="btn chico" data-nuevo-dia>＋ Agregar</button></div>
    <p class="ayuda">En un día cerrado (feriado, mantenimiento…) la app avisa al empleado antes de abrir turno. No bloquea nada.</p>
    <div id="aj-dias" class="lista"></div>
    <h3 class="sub-titulo">Correos</h3>
    <section class="tarjeta"><p class="detalle" style="margin-top:0">Las invitaciones y avisos se mandan desde Gmail. Manda una prueba a tu correo para confirmar que funciona.</p>
      <button type="button" class="btn ghost" data-probar-correo>Enviar correo de prueba</button></section>`;
  const cTurnos = $('#aj-turnos', el), cDias = $('#aj-dias', el);
  let tipos = [];

  async function cargar() {
    try {
      tipos = await api.seleccionar('tipos_turno', 'select=clave,nombre,dias,inicio,fin,es_primero,es_ultimo,orden,activo&order=orden.asc');
      const dias = await api.seleccionar('dias_cerrados', `select=fecha,motivo,activo&activo=eq.true&fecha=gte.${hoyMx()}&order=fecha.asc`);
      cTurnos.innerHTML = tipos.map((t) => `<button type="button" class="fila ${t.activo ? '' : 'apagada'}" data-clave="${esc(t.clave)}"><div class="fila-txt"><b>${esc(t.nombre)}</b>
        <span>${esc(hh(t.inicio))} – ${esc(hh(t.fin))} · ${t.dias.map((d) => DIAS[d - 1][2]).join(', ')}</span></div>${t.activo ? '' : '<span class="insignia gris">Apagado</span>'}</button>`).join('');
      cDias.innerHTML = dias.length ? dias.map((d) => `<div class="fila inv"><div class="fila-txt"><b class="cap">${esc(fechaLarga(d.fecha))}</b><span>${esc(d.motivo || 'Sin motivo')}</span></div>
        <button type="button" class="btn chico ghost" data-reabrir="${esc(d.fecha)}">Quitar</button></div>`).join('') : '<p class="detalle">No hay días cerrados próximos.</p>';
    } catch (e) { cTurnos.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; }
  }

  function editarTurno(t) {
    const v = ventana(`<form class="formulario" novalidate>
      <div class="campo"><label for="h-nombre">Nombre</label><input id="h-nombre" type="text" value="${esc(t.nombre)}"></div>
      <div class="fila-botones" style="margin:0"><div class="campo"><label for="h-ini">Entrada</label><input id="h-ini" type="time" value="${esc(hh(t.inicio))}"></div>
        <div class="campo"><label for="h-fin">Salida</label><input id="h-fin" type="time" value="${esc(hh(t.fin))}"></div></div>
      <div class="campo"><label>Días en que aplica</label><div class="chips">${DIAS.map(([n, l, g]) => `<label class="chip-sel"><input type="checkbox" name="dia" value="${n}" ${t.dias.includes(n) ? 'checked' : ''}><span>${l}<small>${g}</small></span></label>`).join('')}</div></div>
      <label class="interruptor"><input type="checkbox" id="h-act" ${t.activo ? 'checked' : ''}><span>Turno activo</span></label>
      <p class="ayuda">Los cambios aplican a los turnos que se abran desde ahora.</p>
      <button class="btn" type="submit">Guardar</button></form>`, { titulo: `Turno ${t.nombre}` });
    const f = $('form', v.el);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      conOcupado($('button', f), async () => {
        const r = await api.rpc('tipo_turno_guardar', { p_clave: t.clave, p_nombre: $('#h-nombre', f).value, p_inicio: $('#h-ini', f).value, p_fin: $('#h-fin', f).value,
          p_dias: $$('input[name=dia]:checked', f).map((i) => Number(i.value)), p_activo: $('#h-act', f).checked });
        if (!r.ok) return aviso(ERR[r.error] || 'No se pudo guardar.', 'error');
        v.cerrar(); aviso('Horario guardado.', 'ok'); cargar();
      });
    });
  }

  function nuevoDia() {
    const v = ventana(`<form class="formulario" novalidate>
      <div class="campo"><label for="d-fecha">Fecha</label><input id="d-fecha" type="date" min="${hoyMx()}" value="${hoyMx()}"></div>
      <div class="campo"><label for="d-mot">Motivo <span class="opc">(opcional)</span></label><input id="d-mot" type="text" placeholder="Ej. Feriado, mantenimiento"></div>
      <button class="btn" type="submit">Marcar día cerrado</button></form>`, { titulo: 'Día cerrado' });
    const f = $('form', v.el);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      conOcupado($('button', f), async () => {
        const r = await api.rpc('dia_cerrado_guardar', { p_fecha: $('#d-fecha', f).value || null, p_motivo: $('#d-mot', f).value, p_activo: true });
        if (!r.ok) return aviso(ERR[r.error] || 'No se pudo guardar.', 'error');
        v.cerrar(); aviso('Día cerrado guardado.', 'ok'); cargar();
      });
    });
  }

  cTurnos.addEventListener('click', (e) => { const b = e.target.closest('[data-clave]'); if (b) editarTurno(tipos.find((t) => t.clave === b.dataset.clave)); });
  $('[data-nuevo-dia]', el).addEventListener('click', nuevoDia);
  cDias.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-reabrir]');
    if (!b) return;
    if (!await confirmar({ titulo: 'Quitar día cerrado', texto: `¿Volver a abrir el ${fechaLarga(b.dataset.reabrir)}?`, ok: 'Quitar' })) return;
    const r = await api.rpc('dia_cerrado_guardar', { p_fecha: b.dataset.reabrir, p_motivo: null, p_activo: false });
    if (!r.ok) return aviso(ERR[r.error] || 'No se pudo.', 'error');
    aviso('Listo.', 'ok'); cargar();
  });
  $('[data-probar-correo]', el).addEventListener('click', (e) => conOcupado(e.currentTarget, async () => {
    try {
      const r = await api.funcion('probar_correo');
      if (!r.ok) return aviso(r.mensaje || 'No se pudo enviar la prueba.', 'error');
      if (r.correo.enviado) aviso(`Correo de prueba enviado a ${r.correo.destino}. Revisa tu bandeja.`, 'ok', 6000);
      else if (r.correo.error === 'sin_configurar') aviso('Falta configurar la cuenta de Gmail en el servidor (contraseña de aplicación).', 'error', 7000);
      else aviso(`Gmail no aceptó el envío: ${r.correo.error}`, 'error', 8000);
    } catch (err) { aviso(err.message, 'error'); }
  }));
  cargar();
}
