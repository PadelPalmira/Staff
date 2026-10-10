// Configuración de tareas (admin y gerencia): lista agrupada, crear, editar, activar/desactivar.
import * as api from '../api.js';
import { esc, $, $$, aviso, ventana, conOcupado } from '../ui.js';

const COLS = 'id,nombre,descripcion,momento,aplica,turnos,dias,regla,minutos,hora,foto,condicional,etiqueta_no_aplica,activa,orden';
const MOMENTOS = [['apertura', 'Al abrir el turno'], ['semanal', 'Semanales'], ['cierre', 'Al cerrar el turno']];
const DIAS = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];
const DIAS_LARGO = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const TURNOS = [['manana', 'Mañana'], ['tarde', 'Tarde'], ['domingo', 'Domingo']];
const ERR = {
  nombre_invalido: 'Ponle un nombre a la tarea.', minutos_invalidos: 'Escribe cuántos minutos después de abrir.', hora_invalida: 'Escribe la hora límite.',
  faltan_dias: 'Elige al menos un día para la tarea semanal.', sin_permiso: 'No tienes permiso para esto.', datos_invalidos: 'Revisa los datos.',
};

function resumenRegla(t) {
  if (t.regla === 'desde_apertura') return `${t.minutos} min después de abrir`;
  if (t.regla === 'hora_fija') return `antes de las ${String(t.hora).slice(0, 5)}`;
  if (t.regla === 'antes_cierre') return 'antes de la hora de salida';
  return 'sin límite';
}
function resumenQuien(t) {
  const q = t.aplica === 'primero' ? 'quien abre el día' : t.aplica === 'ultimo' ? 'quien cierra el día' : 'todos';
  const tn = t.turnos?.length ? ` · turno ${t.turnos.map((c) => (TURNOS.find((x) => x[0] === c) || [0, c])[1].toLowerCase()).join(' y ')}` : '';
  return q + tn;
}

export async function montarTareasAdmin(el, ctx, yo) {
  let tareas = [];
  el.innerHTML = `<div class="enc-seccion"><h2>Tareas</h2><button type="button" class="btn chico" data-nueva>＋ Nueva</button></div>
    <p class="sub">Esto es lo que ve el personal en su checklist. Los cambios aplican a los turnos que se abran desde ahora; los turnos ya abiertos no cambian.</p>
    <section class="tarjeta tarjeta-avisos" id="tareas-problema" hidden></section>
    <div id="lista-tareas-cfg"><p class="cargando">Cargando…</p></div>
    <div class="enc-seccion" style="margin-top:22px"><h3 class="sub-titulo" style="margin:0">🔔 Recordatorios</h3><button type="button" class="btn chico" data-nuevo-rec>＋ Nuevo</button></div>
    <p class="ayuda">Avisos a una hora fija para quien esté en turno (en la pantalla y, si está activado, como notificación en el celular del club). No cuentan como tarea.</p>
    <div id="lista-rec" class="lista"></div>`;
  const cont = $('#lista-tareas-cfg', el);
  const cRec = $('#lista-rec', el), cProb = $('#tareas-problema', el);
  let recs = [];
  async function cargarRec() {
    try { recs = await api.seleccionar('recordatorios', 'select=id,texto,turnos,dias,horas,activo&order=creado_en.asc'); } catch { recs = []; }
    cRec.innerHTML = recs.length ? recs.map((r) => `<button type="button" class="fila ${r.activo ? '' : 'apagada'}" data-rec="${esc(r.id)}"><div class="fila-txt"><b>${esc(r.texto)}</b>
      <span>${(r.horas || []).map((h) => String(h).slice(0, 5)).join(', ')} · ${r.turnos?.length ? r.turnos.map((c) => (TURNOS.find((x) => x[0] === c) || [0, c])[1].toLowerCase()).join(' y ') : 'todos los turnos'}${r.dias?.length ? ` · ${r.dias.map((d) => DIAS_LARGO[d]).join(', ')}` : ''}</span></div>
      ${r.activo ? '' : '<span class="insignia gris">Apagado</span>'}</button>`).join('') : '<p class="detalle">No hay recordatorios.</p>';
  }
  function formRec(r) {
    const nuevo = !r;
    r = r || { texto: '', turnos: null, dias: null, horas: ['10:00'], activo: true };
    const v = ventana(`<form class="formulario" novalidate>
      <div class="campo"><label for="r-txt">Texto del recordatorio</label><input id="r-txt" type="text" maxlength="120" value="${esc(r.texto)}" placeholder="Ej. Revisa el WhatsApp del club"></div>
      <div class="campo"><label for="r-horas">Horas <span class="opc">(separadas por coma, formato 24 h)</span></label><input id="r-horas" type="text" inputmode="numeric" value="${esc((r.horas || []).map((h) => String(h).slice(0, 5)).join(', '))}" placeholder="10:00, 13:30"></div>
      <div class="campo"><label>Turnos <span class="opc">(si no marcas ninguno, en todos)</span></label>
        <div class="chips">${TURNOS.map(([k, n]) => `<label class="chip-sel ancho"><input type="checkbox" name="rturno" value="${k}" ${r.turnos?.includes(k) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
      <div class="campo"><label>Días <span class="opc">(si no marcas ninguno, todos)</span></label>
        <div class="chips">${DIAS.map(([n, l]) => `<label class="chip-sel"><input type="checkbox" name="rdia" value="${n}" ${r.dias?.includes(n) ? 'checked' : ''}><span>${l}<small>${DIAS_LARGO[n]}</small></span></label>`).join('')}</div></div>
      <label class="interruptor"><input type="checkbox" id="r-act" ${r.activo ? 'checked' : ''}><span>Activo</span></label>
      <button class="btn" type="submit">${nuevo ? 'Crear recordatorio' : 'Guardar'}</button></form>`, { titulo: nuevo ? 'Nuevo recordatorio' : 'Recordatorio' });
    const f = $('form', v.el);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const horas = $('#r-horas', f).value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).map((x) => (/^\d{1,2}$/.test(x) ? `${x}:00` : x));
      if (!horas.length || horas.some((h) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(h))) return aviso('Escribe las horas como 10:00, 13:30.', 'error');
      conOcupado($('button[type=submit]', f), async () => {
        const res = await api.rpc('recordatorio_guardar', { p_id: nuevo ? null : r.id, p_datos: { texto: $('#r-txt', f).value, horas,
          turnos: $$('input[name=rturno]:checked', f).map((i) => i.value), dias: $$('input[name=rdia]:checked', f).map((i) => Number(i.value)), activo: $('#r-act', f).checked } });
        if (!res.ok) return aviso(res.error === 'falta_texto' ? 'Escribe el texto (mínimo 3 letras).' : res.error === 'hora_invalida' ? 'Revisa las horas.' : 'No se pudo guardar.', 'error');
        v.cerrar(); aviso('Recordatorio guardado.', 'ok'); cargarRec();
      });
    });
  }
  // Tareas que más se atrasan o no se hacen (últimos 30 días) con una sugerencia
  async function cargarProblema() {
    let r;
    try { r = await api.rpc('tareas_problema', { p_dias: 30 }); } catch { return; }
    const l = (r?.tareas || []).slice(0, 6);
    cProb.hidden = !l.length;
    if (!l.length) return;
    const tip = (t) => {
      if (t.sin_hacer + t.no_se_pudo > t.tarde) return t.no_se_pudo > t.sin_hacer ? 'Seguido “no se puede”: revisa si falta material o herramienta.' : 'Muchas veces no se hace: ¿sigue siendo necesaria? ¿se entiende bien?';
      if (t.regla === 'desde_apertura') return `Se hace tarde: prueba darle más de ${t.minutos} min desde que abren.`;
      if (t.regla === 'hora_fija') return `Se hace tarde: prueba mover la hora límite (${String(t.hora).slice(0, 5)}).`;
      return 'Se hace tarde: revisa el tiempo límite o explícala al equipo.';
    };
    cProb.innerHTML = `<div class="enc-avisos"><h2>🧐 Tareas con problemas (30 días)</h2></div><div class="lista">${l.map((t) => `<div class="fila inv"><div class="fila-txt">
      <b>${esc(t.nombre)}</b><span>${t.pct_problema}% con problema de ${t.total} · ${t.tarde} tarde · ${t.sin_hacer} sin hacer · ${t.no_se_pudo} no se pudo</span>
      <span class="ok-txt">💡 ${esc(tip(t))}</span></div></div>`).join('')}</div>`;
  }
  $('[data-nuevo-rec]', el).addEventListener('click', () => formRec(null));
  cRec.addEventListener('click', (e) => { const b = e.target.closest('[data-rec]'); if (b) formRec(recs.find((x) => x.id === b.dataset.rec)); });
  cargarRec(); cargarProblema();

  async function cargar() {
    try { tareas = await api.seleccionar('tareas_plantilla', `select=${COLS}&order=orden.asc,nombre.asc`); }
    catch (e) { cont.innerHTML = `<div class="tarjeta vacio"><p>${esc(e.message)}</p></div>`; return; }
    pintar();
  }
  function pintar() {
    let h = '';
    for (const [mom, titulo] of MOMENTOS) {
      const l = tareas.filter((t) => t.momento === mom);
      if (!l.length) continue;
      h += `<h3 class="sub-titulo">${titulo}</h3><div class="lista">${l.map((t) => `<button type="button" class="fila ${t.activa ? '' : 'apagada'}" data-id="${esc(t.id)}">
        <div class="fila-txt"><b>${esc(t.nombre)}</b><span>${esc(resumenRegla(t))} · ${esc(resumenQuien(t))}${t.momento === 'semanal' && t.dias ? ` · ${t.dias.map((d) => DIAS_LARGO[d]).join(', ')}` : ''}</span></div>
        <div class="fila-ins">${t.activa ? '' : '<span class="insignia gris">Apagada</span>'}${t.foto ? '<span>📷</span>' : ''}${t.condicional ? '<span class="insignia aviso-i">Condicional</span>' : ''}</div></button>`).join('')}</div>`;
    }
    cont.innerHTML = h || '<div class="tarjeta vacio"><p><b>No hay tareas.</b></p><p>Toca “Nueva” para crear la primera.</p></div>';
  }

  function formulario(t) {
    const nueva = !t;
    t = t || { nombre: '', descripcion: '', momento: 'apertura', aplica: 'todos', turnos: null, dias: null, regla: 'sin_limite', minutos: 15, hora: '', foto: false, condicional: false, etiqueta_no_aplica: '', activa: true, orden: 100 };
    const v = ventana(`<form class="formulario" novalidate>
      <div class="campo"><label for="t-nombre">Nombre de la tarea</label><input id="t-nombre" type="text" value="${esc(t.nombre)}" placeholder="Ej. Revisar baños"></div>
      <div class="campo"><label for="t-desc">Notas para el personal <span class="opc">(opcional)</span></label><input id="t-desc" type="text" value="${esc(t.descripcion || '')}"></div>
      <div class="campo"><label for="t-mom">¿Cuándo se hace?</label><select id="t-mom">${MOMENTOS.map(([k, n]) => `<option value="${k}" ${t.momento === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="campo" id="g-dias" ${t.momento === 'semanal' ? '' : 'hidden'}><label>Días de la semana</label>
        <div class="chips">${DIAS.map(([n, l]) => `<label class="chip-sel"><input type="checkbox" name="dia" value="${n}" ${t.dias?.includes(n) ? 'checked' : ''}><span>${l}<small>${DIAS_LARGO[n]}</small></span></label>`).join('')}</div></div>
      <div class="campo"><label for="t-apl">¿Quién la hace?</label><select id="t-apl">
        <option value="todos" ${t.aplica === 'todos' ? 'selected' : ''}>Todos los turnos</option>
        <option value="primero" ${t.aplica === 'primero' ? 'selected' : ''}>Solo quien abre el día (turno de la mañana)</option>
        <option value="ultimo" ${t.aplica === 'ultimo' ? 'selected' : ''}>Solo quien cierra el día (turno de la tarde)</option></select></div>
      <div class="campo"><label>Turnos donde aparece <span class="opc">(si no marcas ninguno, en todos)</span></label>
        <div class="chips">${TURNOS.map(([k, n]) => `<label class="chip-sel ancho"><input type="checkbox" name="turno" value="${k}" ${t.turnos?.includes(k) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
      <div class="campo"><label for="t-reg">Tiempo límite</label><select id="t-reg">
        <option value="sin_limite" ${t.regla === 'sin_limite' ? 'selected' : ''}>Sin límite</option>
        <option value="desde_apertura" ${t.regla === 'desde_apertura' ? 'selected' : ''}>Minutos después de abrir el turno</option>
        <option value="hora_fija" ${t.regla === 'hora_fija' ? 'selected' : ''}>Antes de una hora fija</option>
        <option value="antes_cierre" ${t.regla === 'antes_cierre' ? 'selected' : ''}>Antes de la hora de salida</option></select></div>
      <div class="campo" id="g-min" hidden><label for="t-min">Minutos después de abrir</label><input id="t-min" type="number" inputmode="numeric" min="0" max="600" value="${t.minutos ?? 15}"></div>
      <div class="campo" id="g-hora" hidden><label for="t-hora">Hora límite</label><input id="t-hora" type="time" value="${esc(String(t.hora || '').slice(0, 5))}"></div>
      <label class="interruptor"><input type="checkbox" id="t-foto" ${t.foto ? 'checked' : ''}><span>Pide una foto como evidencia</span></label>
      <label class="interruptor"><input type="checkbox" id="t-cond" ${t.condicional ? 'checked' : ''}><span>Puede “no aplicar” (ej. “no hubo clases hoy”)</span></label>
      <div class="campo" id="g-etq" hidden><label for="t-etq">Texto del botón “no aplica”</label><input id="t-etq" type="text" value="${esc(t.etiqueta_no_aplica || '')}" placeholder="No aplica hoy"></div>
      <div class="campo"><label for="t-ord">Orden en la lista <span class="opc">(número chico = sale primero)</span></label><input id="t-ord" type="number" inputmode="numeric" value="${t.orden ?? 100}"></div>
      <label class="interruptor"><input type="checkbox" id="t-act" ${t.activa ? 'checked' : ''}><span>Tarea activa (si la apagas, deja de aparecer en turnos nuevos)</span></label>
      <button class="btn" type="submit">${nueva ? 'Crear tarea' : 'Guardar cambios'}</button></form>`, { titulo: nueva ? 'Nueva tarea' : 'Editar tarea' });
    const f = $('form', v.el);
    const sync = () => {
      $('#g-dias', f).hidden = $('#t-mom', f).value !== 'semanal';
      $('#g-min', f).hidden = $('#t-reg', f).value !== 'desde_apertura';
      $('#g-hora', f).hidden = $('#t-reg', f).value !== 'hora_fija';
      $('#g-etq', f).hidden = !$('#t-cond', f).checked;
    };
    f.addEventListener('change', sync); sync();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const datos = {
        nombre: $('#t-nombre', f).value, descripcion: $('#t-desc', f).value, momento: $('#t-mom', f).value, aplica: $('#t-apl', f).value,
        turnos: $$('input[name=turno]:checked', f).map((i) => i.value), dias: $$('input[name=dia]:checked', f).map((i) => Number(i.value)),
        regla: $('#t-reg', f).value, minutos: $('#t-min', f).value, hora: $('#t-hora', f).value, foto: $('#t-foto', f).checked,
        condicional: $('#t-cond', f).checked, etiqueta_no_aplica: $('#t-etq', f).value, activa: $('#t-act', f).checked, orden: Number($('#t-ord', f).value) || 100,
      };
      if (datos.momento !== 'semanal') datos.dias = [];
      conOcupado($('button[type=submit]', f), async () => {
        try {
          const r = await api.rpc('tarea_plantilla_guardar', { p_id: nueva ? null : t.id, p_datos: datos });
          if (!r.ok) return aviso(ERR[r.error] || 'No se pudo guardar.', 'error');
          v.cerrar(); aviso(nueva ? 'Tarea creada.' : 'Cambios guardados.', 'ok'); cargar();
        } catch (err) { aviso(err.message, 'error'); }
      });
    });
  }

  $('[data-nueva]', el).addEventListener('click', () => formulario(null));
  cont.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) formulario(tareas.find((t) => t.id === b.dataset.id));
  });
  cargar();
}
