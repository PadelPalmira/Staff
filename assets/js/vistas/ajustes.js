// Ajustes (solo administrador): horarios de turnos, días cerrados, alertas, correo de prueba y limpieza de fotos.
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
    <h3 class="sub-titulo">Alertas automáticas</h3>
    <form class="tarjeta formulario" id="aj-alertas" novalidate><p class="cargando">Cargando…</p></form>
    <h3 class="sub-titulo">Correos</h3>
    <section class="tarjeta"><p class="detalle" style="margin-top:0">Las invitaciones y avisos se mandan desde Gmail. Manda una prueba a tu correo para confirmar que funciona.</p>
      <button type="button" class="btn ghost" data-probar-correo>Enviar correo de prueba</button></section>
    <h3 class="sub-titulo">Fotos</h3>
    <section class="tarjeta"><p class="detalle" style="margin-top:0">Las fotos viejas se borran solas cada madrugada según los días de arriba (así no se llena el espacio gratis de Supabase: 1 GB).</p>
      <button type="button" class="btn ghost" data-limpiar>Borrar fotos viejas ahora</button></section>`;
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

  // ---------- alertas ----------
  const CAMPOS = [
    ['tolerancia_apertura_min', 'Tolerancia para abrir turno', 'minutos después de la hora de entrada; después avisa "nadie ha abierto" y cuenta como llegada tarde', 'number'],
    ['aviso_sin_cerrar_min', 'Aviso de turno sin cerrar', 'minutos después de la hora de salida (correo al empleado y a gerencia)', 'number'],
    ['aviso_cierre_auto_horas', 'Aviso "se cerrará automáticamente"', 'horas después de la salida (correo al empleado)', 'number'],
    ['cierre_auto_hora', 'Hora del cierre automático', 'del día siguiente; las tareas pendientes quedan sin hacer y se avisa a gerencia', 'time'],
    ['margen_fuera_horario_min', 'Margen de "fuera de horario"', 'minutos; tareas marcadas o turno cerrado después de la salida + este margen avisan a gerencia', 'number'],
    ['resumen_semanal_hora', 'Correo del resumen semanal', 'hora de los lunes', 'time'],
    ['inactividad_minutos', 'Cerrar usuario por inactividad', 'minutos sin usar el celular del club', 'number'],
    ['cerro_antes_min', 'Aviso "cerró antes de su hora"', 'minutos antes de la salida; si cierra más temprano que esto, aparece en Avisos', 'number'],
    ['fotos_tareas_dias', 'Guardar fotos de tareas', 'días (7 a 365); después se borran solas. Las de incidencias se guardan hasta que se resuelven', 'number'],
    ['fotos_tickets_dias', 'Guardar fotos de tickets de pedidos', 'días (30 a 730)', 'number'],
  ];
  const fAl = $('#aj-alertas', el);
  let valores = {};
  async function cargarAlertas() {
    try {
      const filas = await api.seleccionar('ajustes', 'select=clave,valor');
      valores = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
    } catch (e) { fAl.innerHTML = `<p class="detalle">${esc(e.message)}</p>`; return; }
    fAl.innerHTML = `<label class="interruptor"><input type="checkbox" id="al-activas" ${valores.alertas_activas !== false ? 'checked' : ''}>
        <span><b>Alertas activas</b> — si las apagas, no se manda ningún aviso automático ni se cierran turnos solos.</span></label>
      <label class="interruptor"><input type="checkbox" id="al-correo-cierre" ${valores.correo_cierre_turno !== false ? 'checked' : ''}>
        <span><b>Correo al cerrar cada turno</b> — resumen a gerencia y admin: horas, tareas cumplidas, lo que faltó y la nota de relevo.</span></label>
      ${CAMPOS.map(([k, t, ayuda, tipo]) => `<div class="campo"><label for="al-${k}">${t}</label>
        <input id="al-${k}" data-clave="${k}" type="${tipo}" ${tipo === 'number' ? 'inputmode="numeric" min="0"' : ''} value="${esc(valores[k] ?? '')}">
        <p class="ayuda">${ayuda}</p></div>`).join('')}
      <button class="btn" type="submit">Guardar alertas</button>`;
  }
  fAl.addEventListener('submit', (e) => {
    e.preventDefault();
    conOcupado($('button[type=submit]', fAl), async () => {
      const cambios = [];
      const act = $('#al-activas', fAl).checked;
      if (act !== (valores.alertas_activas !== false)) cambios.push(['alertas_activas', String(act)]);
      const cc = $('#al-correo-cierre', fAl).checked;
      if (cc !== (valores.correo_cierre_turno !== false)) cambios.push(['correo_cierre_turno', String(cc)]);
      $$('[data-clave]', fAl).forEach((i) => { if (String(i.value) !== String(valores[i.dataset.clave] ?? '')) cambios.push([i.dataset.clave, i.value]); });
      if (!cambios.length) return aviso('No hay cambios.', 'info');
      for (const [k, v] of cambios) {
        const r = await api.rpc('ajuste_guardar', { p_clave: k, p_valor: v });
        if (!r.ok) return aviso(`Revisa "${(CAMPOS.find((c) => c[0] === k) || [k, 'Alertas activas'])[1]}": valor no válido.`, 'error');
      }
      aviso('Alertas guardadas.', 'ok'); cargarAlertas();
    });
  });
  cargarAlertas();

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
  $('[data-limpiar]', el).addEventListener('click', (e) => conOcupado(e.currentTarget, async () => {
    try {
      const r = await api.avisos({ accion: 'limpieza' });
      if (!r.ok) return aviso('No se pudo limpiar ahora. Se intentará en la madrugada.', 'error');
      aviso(r.evidencias || r.tickets ? `Se borraron ${r.evidencias} fotos de tareas/incidencias y ${r.tickets} de tickets.` : 'No había fotos viejas para borrar.', 'ok', 6000);
    } catch (err) { aviso(err.message, 'error'); }
  }));
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
