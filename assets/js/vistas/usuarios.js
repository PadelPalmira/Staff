// Administración de usuarios: lista, invitaciones por correo, creación directa, edición, PIN, entrar como, activar/desactivar y eliminar.
import * as api from '../api.js';
import { esc, $, ROL, avatar, hidratarAvatares, aviso, ventana, confirmar, conOcupado, selectorFoto, dataUrlABlob,
         campoPassword, campoPin, activarMostrar, soloNumeros, pinValido, celularValido, formatoCelular, MENSAJE_PIN,
         mostrarError, quitarError, fechaCorta, fechaHora, diasPara } from '../ui.js';

const ERR = {
  sin_permiso: 'No tienes permiso para hacer esto.', no_existe: 'No se encontró el registro.',
  nombre_invalido: 'Escribe el nombre completo.', celular_invalido: 'El celular debe tener 10 dígitos.',
  pin_invalido: MENSAJE_PIN, estado_invalido: 'Estado no válido.', rol_no_cambiable: 'Este usuario no puede cambiar de rol. Crea una invitación nueva con el rol que necesitas.',
  ultimo_admin: 'Debe quedar al menos un administrador activo.', usuario_no_disponible: 'Este usuario no está disponible.',
  ruta_invalida: 'No se pudo guardar la foto.',
};
const msg = (r) => r?.mensaje || ERR[r?.error] || 'No se pudo completar la acción.';

const GRUPOS = [['admin', 'Administradores'], ['gerencia', 'Gerencia'], ['recepcion', 'Recepción'], ['dispositivo', 'Celular del club']];
const ORIGEN = { invitacion: 'por invitación', directo: 'creado por el administrador', inicial: 'administrador inicial' };

function textoBitacora(b) {
  const d = b.detalle || {}, a = b.actor_nombre || 'Alguien';
  switch (b.accion) {
    case 'invitacion_creada': return `${a} invitó a ${d.email} (${ROL[d.rol] || d.rol})`;
    case 'invitacion_reenviada': return `${a} reenvió la invitación a ${d.email}`;
    case 'invitacion_cancelada': return `${a} canceló la invitación a ${d.email}`;
    case 'usuario_registrado': return `${d.nombre} creó su usuario (${ROL[d.rol] || d.rol})`;
    case 'usuario_creado_directo': return `${a} creó el usuario ${d.nombre} (${ROL[d.rol] || d.rol})`;
    case 'usuario_editado': {
      const c = Object.entries(d.cambios || {}).map(([k, v]) => `${k}: ${v}`).join('; ');
      return `${a} editó a ${d.nombre}${c ? ` (${c})` : ''}`;
    }
    case 'pin_cambiado': return `${a} cambió el PIN de ${d.nombre}`;
    case 'pin_desbloqueado': return `${a} quitó el bloqueo de un PIN`;
    case 'pin_bloqueado': return `El PIN de ${a} se bloqueó por intentos fallidos`;
    case 'admin_entro_como': return `${a} entró como ${d.nombre} (sin PIN)`;
    case 'usuario_eliminado': return `${a} eliminó a ${d.nombre}`;
    case 'cuenta_vinculada': return `${a} activó su cuenta`;
    case 'foto_actualizada': return `${a} cambió una foto de perfil`;
    default: return `${a}: ${b.accion}`;
  }
}

function motivoCorreo(c) {
  if (c.enviado) return '';
  if (c.error === 'sin_configurar') return 'El correo no se pudo enviar porque el servidor todavía no tiene configurada la cuenta de Gmail. Comparte el enlace por WhatsApp o configura el correo.';
  return `Gmail no aceptó el envío (${c.error}). Comparte el enlace por WhatsApp.`;
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* intento clásico */ }
  const t = document.createElement('textarea');
  t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  t.remove();
  return ok;
}

export async function montarUsuarios(el, ctx, yo) {
  let datos = { perfiles: [], invitaciones: [], bitacora: [] };
  let vivo = true;
  ctx.alDesmontar(() => { vivo = false; });

  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) el.innerHTML = '<p class="cargando">Cargando usuarios…</p>';
    try {
      const [perfiles, invitaciones, bitacora] = await Promise.all([
        api.seleccionar('perfiles', 'select=id,nombre_completo,email,celular,rol,estado,tiene_pin,pin_bloqueado_hasta,foto_path,foto_actualizada,origen,creado_en&order=creado_en.asc'),
        api.seleccionar('invitaciones', 'select=id,email,rol,expira_en,correo_enviado_en,correo_error,reenvios,creada_en&estado=eq.pendiente&order=creada_en.desc'),
        api.seleccionar('bitacora', 'select=id,creado_en,actor_nombre,accion,detalle&order=id.desc&limit=40'),
      ]);
      datos = { perfiles, invitaciones, bitacora };
    } catch (e) {
      if (!vivo) return;
      if (e.codigo === 'sin_sesion') return ctx.recargar();
      el.innerHTML = `<div class="tarjeta vacio"><p><b>No se pudieron cargar los usuarios</b></p><p>${esc(e.message)}</p><button class="btn ghost" data-reintentar>Volver a intentar</button></div>`;
      $('[data-reintentar]', el).addEventListener('click', () => cargar());
      return;
    }
    if (vivo) pintar();
  }

  function pintar() {
    const { perfiles, invitaciones, bitacora } = datos;
    const filaPerfil = (p) => {
      const bloqueado = p.pin_bloqueado_hasta && new Date(p.pin_bloqueado_hasta) > new Date();
      const ins = [
        p.id === yo.id ? '<span class="insignia">Tú</span>' : '',
        p.estado === 'inactivo' ? '<span class="insignia gris">Inactivo</span>' : '',
        (!p.tiene_pin && ['recepcion', 'gerencia'].includes(p.rol)) ? '<span class="insignia aviso-i">Sin PIN</span>' : '',
        bloqueado ? '<span class="insignia mal">PIN bloqueado</span>' : '',
      ].join('');
      return `<button type="button" class="fila ${p.estado === 'inactivo' ? 'apagada' : ''}" data-perfil="${esc(p.id)}">${avatar(p, 'md')}
        <span class="fila-txt"><b>${esc(p.nombre_completo)}</b><span>${esc(p.email)}${p.celular ? ' · ' + esc(formatoCelular(p.celular)) : ''}</span></span>
        <span class="fila-ins">${ins}</span></button>`;
    };
    const filaInv = (i) => {
      const dias = diasPara(i.expira_en);
      const vence = dias < 0 ? 'Venció' : (dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`);
      const correo = i.correo_enviado_en ? 'correo enviado ✓' : (i.correo_error === 'sin_configurar' ? 'correo sin enviar' : (i.correo_error ? 'correo falló' : ''));
      return `<div class="fila inv"><span class="fila-ico" aria-hidden="true">✉</span>
        <span class="fila-txt"><b>${esc(i.email)}</b><span>${esc(ROL[i.rol])} · ${vence}${correo ? ' · ' + correo : ''}</span></span>
        <span class="fila-acc"><button type="button" class="btn chico ghost" data-reenviar="${esc(i.id)}">Reenviar</button>
        <button type="button" class="enlace mal" data-cancelar-inv="${esc(i.id)}">Cancelar</button></span></div>`;
    };
    el.innerHTML = `<div class="enc-seccion"><h2>Usuarios</h2><button type="button" class="btn chico" data-agregar>＋ Agregar</button></div>
      ${invitaciones.length ? `<h3 class="sub-titulo">Invitaciones pendientes (${invitaciones.length})</h3><div class="lista">${invitaciones.map(filaInv).join('')}</div>` : ''}
      ${GRUPOS.map(([rol, titulo]) => {
        const l = perfiles.filter((p) => p.rol === rol);
        return l.length ? `<h3 class="sub-titulo">${titulo} (${l.length})</h3><div class="lista">${l.map(filaPerfil).join('')}</div>` : '';
      }).join('')}
      ${!perfiles.some((p) => p.rol === 'recepcion') && !invitaciones.length ? '<div class="tarjeta vacio"><p>Todavía no hay recepcionistas.</p><p>Toca <b>＋ Agregar</b> e invita a la primera por correo.</p></div>' : ''}
      <details class="bitacora"><summary>Registro de cambios</summary>
        ${bitacora.length ? `<ul>${bitacora.map((b) => `<li><span>${esc(fechaHora(b.creado_en))}</span> ${esc(textoBitacora(b))}</li>`).join('')}</ul>` : '<p class="detalle">Aún no hay cambios.</p>'}</details>`;
    hidratarAvatares(el);
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-agregar]')) return ventanaAgregar();
    const fila = t.closest('[data-perfil]');
    if (fila) return ventanaDetalle(fila.dataset.perfil);
    const re = t.closest('[data-reenviar]');
    if (re) return conOcupado(re, async () => {
      try {
        const r = await api.funcion('reenviar', { invitacion_id: re.dataset.reenviar });
        if (!r.ok) return aviso(msg(r), 'error');
        const v = ventana('', { titulo: 'Invitación reenviada' });
        resultadoInvitacion(v, r);
        cargar({ silencioso: true });
      } catch (err) { aviso(err.message, 'error'); }
    });
    const ca = t.closest('[data-cancelar-inv]');
    if (ca) {
      if (!await confirmar({ titulo: 'Cancelar invitación', texto: 'La persona ya no podrá usar el enlace que recibió. ¿Cancelar la invitación?', ok: 'Cancelar invitación', peligro: true })) return;
      try {
        const r = await api.rpc('admin_cancelar_invitacion', { p_id: ca.dataset.cancelarInv });
        if (!r.ok) return aviso(msg(r), 'error');
        aviso('Invitación cancelada.', 'ok');
        cargar({ silencioso: true });
      } catch (err) { aviso(err.message, 'error'); }
    }
  });

  // ---------- agregar ----------
  function ventanaAgregar() {
    const v = ventana(`<div class="opciones">
      <button type="button" class="opcion principal" data-op="invitar"><b>Invitar por correo</b>
        <span>Recomendado. La persona recibe un enlace y crea su propio usuario: nombre, celular, PIN y foto.</span></button>
      <button type="button" class="opcion" data-op="directo"><b>Crear usuario directamente</b>
        <span>Tú llenas los datos y defines el PIN, sin invitación.</span></button></div>`, { titulo: 'Agregar usuario' });
    v.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-op]');
      if (!b) return;
      if (b.dataset.op === 'invitar') formInvitar(v); else formDirecto(v);
    });
  }

  function formInvitar(v) {
    v.poner(`<form class="formulario" novalidate>
      <div class="campo"><label for="i-email">Correo de la persona</label>
        <input id="i-email" type="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="nombre@correo.com" required></div>
      <div class="campo"><label for="i-rol">Rol</label>
        <select id="i-rol"><option value="recepcion">Recepción</option><option value="gerencia">Gerencia</option></select>
        <p class="ayuda">Recepción entra con su PIN en el celular del club. Gerencia entra con su correo y una contraseña que elige al registrarse.</p></div>
      <button class="btn" type="submit">Enviar invitación</button></form>`);
    const form = $('form', v.el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); quitarError(form);
      const email = $('#i-email', form).value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return mostrarError(form, 'Escribe un correo válido.');
      await conOcupado($('button[type=submit]', form), async () => {
        try {
          const r = await api.funcion('invitar', { email, rol: $('#i-rol', form).value });
          if (!r.ok) return mostrarError(form, msg(r));
          resultadoInvitacion(v, r);
          cargar({ silencioso: true });
        } catch (err) { mostrarError(form, err.message); }
      });
    });
  }

  function resultadoInvitacion(v, r) {
    const enviado = r.correo.enviado;
    const wa = `https://wa.me/?text=${encodeURIComponent(`Hola, te invito a PP Staff de Padel Palmira. Crea tu usuario aquí: ${r.enlace}`)}`;
    v.poner(`<div class="resultado">
      ${enviado ? `<div class="palomita" aria-hidden="true">✓</div><h3>Invitación enviada</h3><p>Mandamos el correo a <b>${esc(r.invitacion.email)}</b>. Vence el ${esc(fechaCorta(r.invitacion.expira_en))}.</p>`
        : `<h3>Invitación creada</h3><p class="nota-aviso">${esc(motivoCorreo(r.correo))}</p>`}
      <p class="ayuda">También puedes compartir el enlace directamente:</p>
      <div class="enlace-caja"><input id="enlace-inv" readonly value="${esc(r.enlace)}"><button type="button" class="btn chico ghost" data-copiar>Copiar</button></div>
      <a class="btn ghost" target="_blank" rel="noopener" href="${esc(wa)}">Compartir por WhatsApp</a>
      <button type="button" class="btn" data-cerrar>Listo</button></div>`);
    $('#enlace-inv', v.el).addEventListener('focus', (e) => e.target.select());
    $('[data-copiar]', v.el).addEventListener('click', async (e) => {
      const boton = e.currentTarget;
      const ok = await copiar(r.enlace);
      boton.textContent = ok ? 'Copiado ✓' : 'Copia a mano';
    });
  }

  function formDirecto(v) {
    v.poner(`<form class="formulario" novalidate>
      <div class="campo"><label for="d-rol">Rol</label>
        <select id="d-rol"><option value="recepcion">Recepción</option><option value="gerencia">Gerencia</option>
          <option value="admin">Administrador</option><option value="dispositivo">Cuenta del celular del club</option></select>
        <p class="ayuda" id="d-ayuda-rol"></p></div>
      <div class="campo" data-roles="recepcion gerencia admin"><label for="d-nombre">Nombre completo</label>
        <input id="d-nombre" type="text" autocomplete="off" autocapitalize="words"></div>
      <div class="campo"><label for="d-email">Correo</label>
        <input id="d-email" type="email" inputmode="email" autocapitalize="off" spellcheck="false"></div>
      <div class="campo" data-roles="recepcion gerencia admin"><label for="d-cel">Celular <span class="opc" data-opc-roles="admin">(opcional)</span></label>
        <input id="d-cel" type="tel" inputmode="numeric" placeholder="10 dígitos"></div>
      <div data-roles="recepcion gerencia admin">${campoPin('d-pin', 'PIN (4 números)')}</div>
      <div data-roles="gerencia admin dispositivo">${campoPassword('d-pass', 'Contraseña de la cuenta', { ayuda: 'Mínimo 8 caracteres. Se usa con el correo para entrar.' })}</div>
      <div class="campo" data-roles="recepcion gerencia admin"><label>Foto de perfil</label><div id="d-foto"></div></div>
      <button class="btn" type="submit">Crear usuario</button></form>`);
    const form = $('form', v.el);
    activarMostrar(form); soloNumeros(form);
    const foto = selectorFoto($('#d-foto', form), {});
    const rolSel = $('#d-rol', form);
    const AYUDA = {
      recepcion: 'Entra desde el celular del club con su PIN.',
      gerencia: 'Entra con su correo y contraseña. El PIN es para desbloquear la app.',
      admin: 'Entra con su correo y contraseña. Ve todo y puede entrar como cualquier usuario.',
      dispositivo: 'Es la cuenta que queda siempre abierta en el celular del club (por ejemplo padelpalmirastaff@gmail.com). Las recepcionistas no la conocen: ellas solo tocan su nombre y escriben su PIN.',
    };
    const aplicar = () => {
      const rol = rolSel.value;
      $('#d-ayuda-rol', form).textContent = AYUDA[rol];
      form.querySelectorAll('[data-roles]').forEach((n) => { n.hidden = !n.dataset.roles.split(' ').includes(rol); });
      form.querySelectorAll('[data-opc-roles]').forEach((n) => { n.hidden = !n.dataset.opcRoles.split(' ').includes(rol); });
    };
    rolSel.addEventListener('change', aplicar); aplicar();
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); quitarError(form);
      const rol = rolSel.value;
      const nombre = $('#d-nombre', form).value.trim().replace(/\s+/g, ' ');
      const email = $('#d-email', form).value.trim().toLowerCase();
      const cel = $('#d-cel', form).value.trim(), pin = $('#d-pin', form).value, pass = $('#d-pass', form).value;
      if (rol !== 'dispositivo' && (nombre.length < 3)) return mostrarError(form, 'Escribe el nombre completo.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return mostrarError(form, 'Escribe un correo válido.');
      if (['recepcion', 'gerencia'].includes(rol) && !celularValido(cel)) return mostrarError(form, 'El celular debe tener 10 dígitos.');
      if (rol === 'admin' && cel && !celularValido(cel)) return mostrarError(form, 'El celular debe tener 10 dígitos.');
      if (['recepcion', 'gerencia'].includes(rol) && !pinValido(pin)) return mostrarError(form, MENSAJE_PIN);
      if (rol === 'admin' && pin && !pinValido(pin)) return mostrarError(form, MENSAJE_PIN);
      if (rol !== 'recepcion' && pass.length < 8) return mostrarError(form, 'La contraseña debe tener al menos 8 caracteres.');
      await conOcupado($('button[type=submit]', form), async () => {
        try {
          const r = await api.funcion('crear_directo', {
            rol, nombre_completo: nombre, email, celular: cel || null, pin: pin || null,
            password: rol === 'recepcion' ? null : pass, foto: rol === 'dispositivo' ? null : foto.valor(),
          });
          if (!r.ok) return mostrarError(form, msg(r));
          v.cerrar();
          aviso(`Usuario creado: ${r.perfil.nombre_completo}.`, 'ok');
          cargar({ silencioso: true });
        } catch (err) { mostrarError(form, err.message); }
      });
    });
  }

  // ---------- detalle de un usuario ----------
  function ventanaDetalle(id) {
    const p = datos.perfiles.find((x) => x.id === id);
    if (!p) return;
    const esYo = p.id === yo.id;
    const bloqueado = p.pin_bloqueado_hasta && new Date(p.pin_bloqueado_hasta) > new Date();
    const tel = String(p.celular || '').replace(/\D/g, '');
    const v = ventana(`<div class="detalle-cab">${avatar(p, 'xl')}<h3>${esc(p.nombre_completo)}</h3>
        <p><span class="insignia">${esc(ROL[p.rol])}</span>${p.estado === 'inactivo' ? ' <span class="insignia gris">Inactivo</span>' : ''}${esYo ? ' <span class="insignia">Tú</span>' : ''}</p></div>
      <dl class="datos"><dt>Correo</dt><dd>${esc(p.email)}</dd>
        ${tel ? `<dt>Celular</dt><dd><a href="tel:${esc(tel)}">${esc(formatoCelular(tel))}</a> · <a target="_blank" rel="noopener" href="https://wa.me/52${esc(tel.slice(-10))}">WhatsApp</a></dd>` : ''}
        ${p.rol !== 'dispositivo' ? `<dt>PIN</dt><dd>${p.tiene_pin ? (bloqueado ? 'Bloqueado por intentos fallidos' : 'Asignado') : 'Sin PIN'}</dd>` : ''}
        <dt>Alta</dt><dd>${esc(fechaCorta(p.creado_en))} · ${esc(ORIGEN[p.origen] || '')}</dd></dl>
      <div class="acciones">
        ${p.rol === 'recepcion' && p.estado === 'activo' ? `<button type="button" class="btn" data-a="como">Entrar como ${esc(p.nombre_completo.split(' ')[0])} (sin PIN)</button>` : ''}
        <button type="button" class="btn ghost" data-a="editar">Editar datos</button>
        ${p.rol !== 'dispositivo' ? `<button type="button" class="btn ghost" data-a="pin">${p.tiene_pin ? 'Cambiar PIN' : 'Asignar PIN'}</button>` : ''}
        ${bloqueado ? '<button type="button" class="btn ghost" data-a="desbloquear">Quitar bloqueo del PIN</button>' : ''}
        ${esYo ? '' : `<button type="button" class="btn ghost" data-a="estado">${p.estado === 'activo' ? 'Desactivar usuario' : 'Activar usuario'}</button>
        <button type="button" class="btn peligro-suave" data-a="eliminar">Eliminar usuario</button>`}</div>`, { titulo: 'Usuario' });
    hidratarAvatares(v.el);
    v.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'como') return conOcupado(b, async () => {
        try {
          const r = await api.rpc('admin_entrar_como', { p_perfil_id: p.id });
          if (!r.ok) return aviso(msg(r), 'error');
          v.cerrar(); ctx.entrarComo(r.token, r.perfil);
        } catch (err) { aviso(err.message, 'error'); }
      });
      if (a === 'editar') { v.cerrar(); return ventanaEditar(p); }
      if (a === 'pin') { v.cerrar(); return ventanaPin(p); }
      if (a === 'desbloquear') return conOcupado(b, async () => {
        try {
          const r = await api.rpc('admin_desbloquear_pin', { p_id: p.id });
          if (!r.ok) return aviso(msg(r), 'error');
          v.cerrar(); aviso('PIN desbloqueado.', 'ok'); cargar({ silencioso: true });
        } catch (err) { aviso(err.message, 'error'); }
      });
      if (a === 'estado') {
        const activar = p.estado !== 'activo';
        if (!await confirmar({ titulo: activar ? 'Activar usuario' : 'Desactivar usuario',
          texto: activar ? `${p.nombre_completo} podrá volver a entrar.` : `${p.nombre_completo} ya no podrá entrar a la app. Su historial se conserva y puedes activarlo de nuevo.`,
          ok: activar ? 'Activar' : 'Desactivar', peligro: !activar })) return;
        try {
          const r = await api.rpc('admin_actualizar_perfil', { p_id: p.id, p_nombre: p.nombre_completo, p_celular: p.celular, p_rol: p.rol, p_estado: activar ? 'activo' : 'inactivo' });
          if (!r.ok) return aviso(msg(r), 'error');
          v.cerrar(); aviso(activar ? 'Usuario activado.' : 'Usuario desactivado.', 'ok'); cargar({ silencioso: true });
        } catch (err) { aviso(err.message, 'error'); }
      }
      if (a === 'eliminar') {
        if (!await confirmar({ titulo: 'Eliminar usuario', texto: `Se borra a ${p.nombre_completo} definitivamente (datos, foto y acceso). Si solo quieres que no entre, mejor desactívalo. ¿Eliminar?`, ok: 'Eliminar', peligro: true })) return;
        try {
          const r = await api.funcion('eliminar', { perfil_id: p.id });
          if (!r.ok) return aviso(msg(r), 'error');
          v.cerrar(); aviso('Usuario eliminado.', 'ok'); cargar({ silencioso: true });
        } catch (err) { aviso(err.message, 'error'); }
      }
    });
  }

  async function ventanaEditar(p) {
    const v = ventana(`<form class="formulario" novalidate>
      <div class="campo"><label for="e-nombre">Nombre completo</label><input id="e-nombre" type="text" value="${esc(p.nombre_completo)}" autocapitalize="words"></div>
      ${p.rol !== 'dispositivo' ? `<div class="campo"><label for="e-cel">Celular</label><input id="e-cel" type="tel" inputmode="numeric" value="${esc(p.celular || '')}"></div>` : ''}
      ${['admin', 'gerencia'].includes(p.rol) && p.id !== yo.id ? `<div class="campo"><label for="e-rol">Rol</label><select id="e-rol">
        <option value="gerencia" ${p.rol === 'gerencia' ? 'selected' : ''}>Gerencia</option><option value="admin" ${p.rol === 'admin' ? 'selected' : ''}>Administrador</option></select></div>` : ''}
      ${p.rol !== 'dispositivo' ? '<div class="campo"><label>Foto de perfil</label><div id="e-foto"></div></div>' : ''}
      <p class="ayuda">El correo no se puede cambiar aquí.</p>
      <button class="btn" type="submit">Guardar cambios</button></form>`, { titulo: `Editar a ${p.nombre_completo.split(' ')[0]}` });
    const form = $('form', v.el);
    let foto = null;
    if (p.rol !== 'dispositivo') {
      let actual = null;
      if (p.foto_path) { const m = await api.urlsFotos([{ path: p.foto_path, v: p.foto_actualizada }]); actual = m.get(`${p.foto_path}|${p.foto_actualizada || ''}`) || null; }
      foto = selectorFoto($('#e-foto', form), { nombre: p.nombre_completo, fotoActual: actual });
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); quitarError(form);
      const nombre = $('#e-nombre', form).value.trim().replace(/\s+/g, ' ');
      const cel = $('#e-cel', form)?.value.trim() ?? p.celular;
      const rol = $('#e-rol', form)?.value ?? p.rol;
      if (nombre.length < 3) return mostrarError(form, 'Escribe el nombre completo.');
      if (p.rol !== 'dispositivo' && cel && !celularValido(cel)) return mostrarError(form, 'El celular debe tener 10 dígitos.');
      if (['recepcion', 'gerencia'].includes(p.rol) && !cel) return mostrarError(form, 'El celular es obligatorio.');
      await conOcupado($('button[type=submit]', form), async () => {
        try {
          if (foto?.cambio()) {
            await api.subirFoto(`${p.id}.jpg`, await dataUrlABlob(foto.valor()));
            const rf = await api.rpc('admin_actualizar_foto', { p_id: p.id, p_path: `${p.id}.jpg` });
            if (!rf.ok) return mostrarError(form, msg(rf));
          }
          const r = await api.rpc('admin_actualizar_perfil', { p_id: p.id, p_nombre: nombre, p_celular: cel, p_rol: rol, p_estado: p.estado });
          if (!r.ok) return mostrarError(form, msg(r));
          v.cerrar(); aviso('Cambios guardados.', 'ok'); cargar({ silencioso: true });
        } catch (err) { mostrarError(form, err.message); }
      });
    });
  }

  function ventanaPin(p) {
    const v = ventana(`<form class="formulario" novalidate>
      <p class="detalle">${p.tiene_pin ? 'Define un PIN nuevo' : 'Define el PIN'} para <b>${esc(p.nombre_completo)}</b>. Si tiene una sesión abierta con el PIN anterior, se cierra.</p>
      ${campoPin('p-pin', 'PIN nuevo (4 números)')}${campoPin('p-pin2', 'Repite el PIN')}
      <button class="btn" type="submit">Guardar PIN</button></form>`, { titulo: p.tiene_pin ? 'Cambiar PIN' : 'Asignar PIN' });
    const form = $('form', v.el);
    soloNumeros(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); quitarError(form);
      const a = $('#p-pin', form).value, b = $('#p-pin2', form).value;
      if (!pinValido(a)) return mostrarError(form, MENSAJE_PIN);
      if (a !== b) return mostrarError(form, 'Los dos PIN no coinciden.');
      await conOcupado($('button[type=submit]', form), async () => {
        try {
          const r = await api.rpc('admin_reset_pin', { p_id: p.id, p_pin: a });
          if (!r.ok) return mostrarError(form, msg(r));
          v.cerrar(); aviso('PIN guardado.', 'ok'); cargar({ silencioso: true });
        } catch (err) { mostrarError(form, err.message); }
      });
    });
  }

  cargar();
}
