// Cliente ligero de Supabase (sin librerías): sesión, funciones de la base de datos, función del servidor y fotos.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const LLAVE = 'ppstaff-auth';
const memoria = new Map(); // respaldo si el navegador bloquea el almacenamiento

export function guardarLocal(k, v) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  if (v == null) memoria.delete(k); else memoria.set(k, v);
}
export function leerLocal(k) {
  try { const t = localStorage.getItem(k); if (t != null) return JSON.parse(t); } catch { /* sin almacenamiento */ }
  return memoria.has(k) ? memoria.get(k) : null;
}

export class ApiError extends Error {
  constructor(codigo, mensaje, status = 0) { super(mensaje || codigo); this.codigo = codigo; this.status = status; }
}

let sesion = leerLocal(LLAVE); // { access_token, refresh_token, expires_at, user: {id, email} }
const oyentes = new Set();
export const onSesion = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
function fijarSesion(s) { sesion = s; guardarLocal(LLAVE, s); oyentes.forEach((f) => f(!!s)); }

export const haySesion = () => !!sesion;
export const usuarioAuth = () => sesion?.user ?? null;

async function pedir(ruta, { metodo = 'GET', cuerpo, headers = {}, token, crudo = false } = {}) {
  let res;
  try {
    res = await fetch(SUPABASE_URL + ruta, {
      method: metodo,
      headers: { apikey: SUPABASE_KEY, ...(cuerpo !== undefined && !(cuerpo instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
                 ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: cuerpo === undefined ? undefined : (cuerpo instanceof Blob ? cuerpo : JSON.stringify(cuerpo)),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('sin_conexion', 'No hay conexión con el servidor. Revisa el internet e intenta de nuevo.');
  }
  if (crudo) return res;
  const texto = await res.text();
  let datos = null;
  if (texto) { try { datos = JSON.parse(texto); } catch { datos = texto; } }
  if (!res.ok) {
    const msg = (datos && (datos.msg || datos.message || datos.error_description || datos.error)) || `Error ${res.status}`;
    throw new ApiError((datos && (datos.error_code || datos.code)) || 'error', String(msg), res.status);
  }
  return datos;
}

// ---------- sesión ----------
function desdeRespuesta(d) {
  return { access_token: d.access_token, refresh_token: d.refresh_token,
           expires_at: Date.now() + (d.expires_in ?? 3600) * 1000, user: { id: d.user?.id, email: d.user?.email } };
}
export async function entrar(email, password) {
  try {
    const d = await pedir('/auth/v1/token?grant_type=password', { metodo: 'POST', cuerpo: { email: String(email).trim().toLowerCase(), password } });
    fijarSesion(desdeRespuesta(d));
  } catch (e) {
    if (e.status === 400 || e.status === 422) throw new ApiError('credenciales', 'Correo o contraseña incorrectos.', e.status);
    if (e.status === 429) throw new ApiError('muchos_intentos', 'Demasiados intentos. Espera un momento e intenta de nuevo.', 429);
    throw e;
  }
}
export async function salir() {
  const t = sesion?.access_token;
  fijarSesion(null);
  if (t) { try { await pedir('/auth/v1/logout', { metodo: 'POST', token: t }); } catch { /* ya se cerró localmente */ } }
}

let refrescando = null;
async function tokenVigente() {
  if (!sesion) throw new ApiError('sin_sesion', 'Inicia sesión para continuar.', 401);
  if (sesion.expires_at - Date.now() > 60000) return sesion.access_token;
  if (!refrescando) {
    refrescando = (async () => {
      try {
        const d = await pedir('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', cuerpo: { refresh_token: sesion.refresh_token } });
        fijarSesion(desdeRespuesta(d));
      } catch (e) {
        if (e.codigo === 'sin_conexion') { if (sesion.expires_at > Date.now()) return; throw e; }
        fijarSesion(null);
        throw new ApiError('sin_sesion', 'Tu sesión terminó. Inicia sesión de nuevo.', 401);
      } finally { refrescando = null; }
    })();
  }
  await refrescando;
  return sesion.access_token;
}

// ---------- base de datos ----------
export async function rpc(nombre, args = {}) {
  const t = await tokenVigente();
  return pedir(`/rest/v1/rpc/${nombre}`, { metodo: 'POST', cuerpo: args, token: t });
}
export async function seleccionar(tabla, consulta) {
  const t = await tokenVigente();
  return pedir(`/rest/v1/${tabla}?${consulta}`, { token: t });
}

// ---------- función del servidor ----------
// Devuelve siempre el objeto de la respuesta ({ok:true,...} o {ok:false,error,mensaje}); solo lanza si no hay conexión.
export async function funcion(accion, datos = {}, { conSesion = true } = {}) {
  const t = conSesion ? await tokenVigente() : null;
  const res = await pedir('/functions/v1/gestion-usuarios', { metodo: 'POST', cuerpo: { accion, ...datos }, token: t || SUPABASE_KEY, crudo: true });
  try { return await res.json(); } catch { return { ok: false, error: 'error_interno', mensaje: 'La respuesta del servidor no se entendió.' }; }
}

// Aviso por correo a admin y gerencia (no bloquea: si falla, el aviso igual queda en la app)
export async function avisar(notificacionId) {
  try {
    const t = await tokenVigente();
    await pedir('/functions/v1/avisos', { metodo: 'POST', cuerpo: { notificacion_id: notificacionId }, token: t, crudo: true });
  } catch { /* sin internet: el aviso queda en la app */ }
}

// ---------- fotos ----------
const cacheFotos = new Map(); // "ruta|version" -> { url, vence }
export async function urlsFotos(items, bucket = 'avatares') {
  const salida = new Map();
  const faltan = [];
  for (const it of items) {
    if (!it.path) continue;
    const k = `${it.path}|${it.v || ''}`;
    const c = cacheFotos.get(bucket + '/' + k);
    if (c && c.vence > Date.now()) salida.set(k, c.url); else faltan.push({ k, path: it.path });
  }
  if (faltan.length) {
    try {
      const t = await tokenVigente();
      const unicos = [...new Set(faltan.map((f) => f.path))];
      const r = await pedir(`/storage/v1/object/sign/${bucket}`, { metodo: 'POST', cuerpo: { expiresIn: 3600, paths: unicos }, token: t });
      const porRuta = new Map((r || []).filter((x) => x.signedURL && !x.error).map((x) => [x.path, `${SUPABASE_URL}/storage/v1${x.signedURL}`]));
      for (const f of faltan) {
        const url = porRuta.get(f.path);
        if (url) { cacheFotos.set(bucket + '/' + f.k, { url, vence: Date.now() + 50 * 60000 }); salida.set(f.k, url); }
      }
    } catch { /* sin fotos: se muestran las iniciales */ }
  }
  return salida;
}
export async function subirFoto(ruta, blob, bucket = 'avatares') {
  const t = await tokenVigente();
  await pedir(`/storage/v1/object/${bucket}/${ruta}`, { metodo: 'POST', cuerpo: blob, token: t, headers: { 'x-upsert': 'true', 'Content-Type': 'image/jpeg' } });
  for (const k of [...cacheFotos.keys()]) if (k.startsWith(bucket + '/' + ruta + '|')) cacheFotos.delete(k);
}
