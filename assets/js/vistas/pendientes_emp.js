// Pestaña "Pendientes" del empleado: sus pendientes, incidencias abiertas del club y sus solicitudes.
// Puede crear pendientes (para sí o para un compañero), reportar incidencias/imprevistos, pedir cosas y pedir que se cierre algo ya resuelto.
import * as api from '../api.js';
import { esc, $, $$, aviso, ventana, conOcupado, mostrarError, quitarError, fechaHora } from '../ui.js';
import { TIPOS, PRIORIDADES, ZONAS, ESTADOS, tarjetaPendiente, historialHtml, hidratarFotosPend, campoFotoOpcional, subirFotoPend, nuevoId, fechaLimiteTxt } from '../pend.js';

const ERR = {
  falta_titulo: 'Escribe un título (mínimo 3 letras).', falta_texto: 'Escribe algo o agrega una foto.', perfil_invalido: 'Ese compañero ya no está activo.',
  no_existe: 'Ya no existe o ya se cerró.', datos_invalidos: 'Revisa los datos.', sin_conexion: 'No hay internet. Intenta cuando vuelva la señal.',
};
const msg = (r) => ERR[r?.error] || r?.mensaje || 'No se pudo completar. Intenta de nuevo.';

export function montarPendientesEmp(el, { llamar, perfil, alCambio, inicial = null }) {
  let datos = null, muerto = false;
  el.innerHTML = `<div class="enc-seccion"><h2>Pendientes</h2></div>
    <div class="botones-nuevo">
      <button type="button" class="btn-nuevo" data-nuevo="pendiente"><span>📌</span>Pendiente</button>
      <button type="button" class="btn-nuevo amarillo" data-nuevo="incidencia"><span>🛠️</span>Incidencia</button>
      <button type="button" class="btn-nuevo" data-nuevo="solicitud"><span>✋</span>Pedir / sugerir</button>
    </div>
    <div id="pe-lista"><p class="cargando">Cargando…</p></div>`;
  const lista = $('#pe-lista', el);

  async function cargar() {
    const r = await llamar('pend_emp_lista');
    if (muerto) return;
    if (!r.ok) { if (r.error !== 'sesion_invalida') lista.innerHTML = `<div class="tarjeta vacio"><p>${esc(msg(r))}</p><button class="btn ghost" data-recargar>Volver a intentar</button></div>`; return; }
    datos = r;
    alCambio?.(r.pendientes.length);
    pintar();
  }
  function pintar() {
    const mios = datos.pendientes.filter((p) => p.tipo === 'pendiente');
    const inc = datos.pendientes.filter((p) => p.tipo === 'incidencia');
    const sol = datos.pendientes.filter((p) => p.tipo === 'solicitud');
    let h = '';
    const seccion = (titulo, l, vacio) => `<h3 class="sub-titulo">${titulo} (${l.length})</h3>${l.length ? `<div class="lista">${l.map((p) => tarjetaPendiente(p)).join('')}</div>` : `<p class="detalle">${vacio}</p>`}`;
    h += seccion('📌 Pendientes', mios, 'No tienes pendientes. 🎉');
    h += seccion('🛠️ Incidencias del club', inc, 'No hay nada descompuesto reportado.');
    if (sol.length) h += seccion('✋ Mis solicitudes', sol, '');
    if (datos.resueltos.length) h += `<h3 class="sub-titulo">Resueltos esta semana</h3><div class="lista">${datos.resueltos.map((p) => tarjetaPendiente(p)).join('')}</div>`;
    h += '<p class="ayuda">La prioridad sube sola cada semana que algo sigue abierto, y también si ya pasó su fecha.</p>';
    lista.innerHTML = h;
  }

  // ---------- crear ----------
  function nuevo(tipo) {
    const t = TIPOS[tipo];
    const otros = (datos?.companeros || []).filter((c) => c.id !== perfil.id);
    const v = ventana(`<form class="formulario" novalidate>
      <p class="detalle">${esc(t.ayuda)}</p>
      <div class="campo"><label for="pn-tit">${tipo === 'incidencia' ? '¿Qué pasó?' : tipo === 'solicitud' ? '¿Qué necesitas o sugieres?' : '¿Qué hay que hacer?'}</label>
        <input id="pn-tit" type="text" maxlength="90" placeholder="${tipo === 'incidencia' ? 'Ej. Se fundió un foco de la cancha 2' : tipo === 'solicitud' ? 'Ej. Faltan bolsas de basura grandes' : 'Ej. Llamar al proveedor de agua'}"></div>
      <div class="campo"><label for="pn-desc">Detalles <span class="opc">(opcional)</span></label><textarea id="pn-desc" rows="3"></textarea></div>
      ${tipo === 'solicitud' ? `<div class="campo"><label for="pn-cat">Tipo de solicitud</label><select id="pn-cat">
        <option value="">Material o compra</option><option value="Cambio de tarea">Cambiar una tarea del checklist</option>
        <option value="Tarea nueva">Sugerir una tarea (semanal o de turno)</option><option value="Otro">Otra cosa</option></select></div>` : ''}
      <div class="campo"><label for="pn-zona">Zona</label><select id="pn-zona"><option value="">—</option>${ZONAS.map((z) => `<option>${esc(z)}</option>`).join('')}</select></div>
      <div class="campo"><label>Prioridad</label><div class="chips">${[1, 2, 3, 4].map((n) => `<label class="chip-sel ancho"><input type="radio" name="prio" value="${n}" ${n === (tipo === 'incidencia' ? 3 : 2) ? 'checked' : ''}><span>${PRIORIDADES[n]}</span></label>`).join('')}</div></div>
      ${tipo === 'pendiente' && otros.length ? `<div class="campo"><label for="pn-para">¿Para quién?</label><select id="pn-para"><option value="">Para mí</option>
        ${otros.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select>
        <p class="ayuda">Si es para un compañero, le aparece en sus Pendientes de inmediato. Gerencia puede cancelarlo.</p></div>` : ''}
      <div class="campo"><label>Foto <span class="opc">(opcional)</span></label><div id="pn-foto"></div></div>
      <button class="btn" type="submit">${tipo === 'incidencia' ? 'Reportar incidencia' : tipo === 'solicitud' ? 'Enviar solicitud' : 'Crear pendiente'}</button></form>`, { titulo: `${t.ico} ${t.nombre}` });
    const f = $('form', v.el);
    const foto = campoFotoOpcional($('#pn-foto', f));
    f.addEventListener('submit', (e) => {
      e.preventDefault(); quitarError(f);
      let titulo = $('#pn-tit', f).value.trim();
      if (titulo.length < 3) return mostrarError(f, ERR.falta_titulo);
      const cat = $('#pn-cat', f)?.value;
      if (cat) titulo = `${cat}: ${titulo}`;
      conOcupado($('button[type=submit]', f), async () => {
        const id = nuevoId();
        let ruta = null;
        if (foto.blob()) {
          try { ruta = await subirFotoPend(id, foto.blob(), 'inicial'); }
          catch (err) { return mostrarError(f, err.codigo === 'sin_conexion' ? ERR.sin_conexion : 'No se pudo subir la foto. Intenta de nuevo o quítala.'); }
        }
        const r = await llamar('pend_emp_crear', { p_id: id, p_tipo: tipo, p_titulo: titulo, p_descripcion: $('#pn-desc', f).value, p_zona: $('#pn-zona', f).value,
          p_prioridad: Number($('input[name=prio]:checked', f)?.value || 2), p_foto: ruta, p_asignado_perfil: $('#pn-para', f)?.value || null });
        if (!r.ok) return mostrarError(f, msg(r));
        if (r.notificacion_id) api.avisar(r.notificacion_id);
        v.cerrar();
        aviso(tipo === 'incidencia' ? 'Incidencia reportada. Se avisó a gerencia.' : tipo === 'solicitud' ? 'Solicitud enviada a gerencia.' : 'Pendiente creado.', 'ok');
        cargar();
      });
    });
  }

  // ---------- detalle ----------
  function detalle(p) {
    const t = TIPOS[p.tipo] || TIPOS.pendiente;
    const abierto = ['abierto', 'en_proceso', 'solicita_cierre'].includes(p.estado);
    const v = ventana(`<div class="detalle-cab"><h3>${t.ico} ${esc(p.titulo)}</h3>
        <p class="sub">${esc(ESTADOS[p.estado] || p.estado)} · prioridad ${esc(PRIORIDADES[p.prioridad_efectiva ?? p.prioridad])}${p.fecha_limite ? ` · ${fechaLimiteTxt(p.fecha_limite)}` : ''}</p></div>
      <dl class="datos">${p.zona ? `<dt>Zona</dt><dd>${esc(p.zona)}</dd>` : ''}${p.asignado_nombre ? `<dt>Para</dt><dd>${esc(p.asignado_nombre)}</dd>` : ''}
        <dt>Lo creó</dt><dd>${esc(p.creado_por_nombre || '—')} · ${esc(fechaHora(p.creado_en))}</dd>${p.resolucion ? `<dt>Resolución</dt><dd>${esc(p.resolucion)}</dd>` : ''}</dl>
      ${p.descripcion ? `<p class="texto-ventana">${esc(p.descripcion)}</p>` : ''}
      ${p.foto_path ? `<img class="evidencia" data-foto="${esc(p.foto_path)}" alt="Foto" hidden>` : ''}
      ${historialHtml(p.notas)}
      ${abierto ? `<form class="formulario" id="pd-nota" novalidate style="margin-top:14px">
        <div class="campo"><label for="pd-txt">${p.tipo === 'incidencia' ? '¿Cómo sigue?' : 'Agregar nota o avance'}</label><textarea id="pd-txt" rows="2" placeholder="Escribe aquí…"></textarea></div>
        <div id="pd-foto"></div>
        <div class="fila-botones"><button type="submit" class="btn ghost" data-tipo="avance">Guardar nota</button>
        ${p.estado === 'solicita_cierre' ? '<button type="button" class="btn" disabled>Ya pediste cerrarlo</button>' : '<button type="submit" class="btn" data-tipo="solicita_cierre">✓ Ya quedó</button>'}</div>
        <p class="ayuda">“Ya quedó” le pide a gerencia que lo cierre; solo gerencia lo marca como resuelto.</p></form>` : ''}`, { titulo: t.nombre });
    hidratarFotosPend(v.el);
    const f = $('#pd-nota', v.el);
    if (!f) return;
    const foto = campoFotoOpcional($('#pd-foto', f), 'Foto (opcional)');
    let tipoNota = 'avance';
    $$('button[data-tipo]', f).forEach((b) => b.addEventListener('click', () => { tipoNota = b.dataset.tipo; }));
    f.addEventListener('submit', (e) => {
      e.preventDefault(); quitarError(f);
      const boton = e.submitter || $(`button[data-tipo="${tipoNota}"]`, f);
      tipoNota = boton?.dataset.tipo || tipoNota;
      const texto = $('#pd-txt', f).value.trim();
      if (texto.length < 3 && !foto.blob()) return mostrarError(f, tipoNota === 'solicita_cierre' ? 'Cuenta brevemente qué se hizo (o agrega una foto de cómo quedó).' : ERR.falta_texto);
      conOcupado(boton, async () => {
        let ruta = null;
        if (foto.blob()) { try { ruta = await subirFotoPend(p.id, foto.blob()); } catch { return mostrarError(f, 'No se pudo subir la foto. Intenta de nuevo.'); } }
        const r = await llamar('pend_emp_nota', { p_id: p.id, p_tipo: tipoNota, p_texto: texto, p_foto: ruta });
        if (!r.ok) return mostrarError(f, msg(r));
        if (r.notificacion_id) api.avisar(r.notificacion_id);
        v.cerrar(); aviso(tipoNota === 'solicita_cierre' ? 'Listo. Gerencia lo va a revisar para cerrarlo.' : 'Nota guardada.', 'ok'); cargar();
      });
    });
  }

  el.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nuevo]');
    if (n) return nuevo(n.dataset.nuevo);
    if (e.target.closest('[data-recargar]')) return cargar();
    const b = e.target.closest('[data-pend]');
    if (b && datos) {
      const p = [...datos.pendientes, ...datos.resueltos].find((x) => x.id === b.dataset.pend);
      if (p) detalle(p);
    }
  });
  cargar().then(() => { if (inicial && !muerto) nuevo(inicial); });
  return { destruir() { muerto = true; }, recargar: cargar, nuevo };
}
