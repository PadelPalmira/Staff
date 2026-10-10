// Cola sin internet del celular del club: las marcas de tareas hechas sin conexión se guardan aquí (con su hora real)
// y se mandan solas en cuanto vuelve el internet, aunque la persona ya haya salido de su usuario.
import * as api from './api.js';

const LLAVE = 'ppstaff-cola';
const oyentes = new Set();
export const alCambiarCola = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
const avisar = () => oyentes.forEach((f) => { try { f(cola().length); } catch { /* sigue */ } });

export const cola = () => api.leerLocal(LLAVE) || [];
const guardar = (l) => { api.guardarLocal(LLAVE, l.length ? l : null); avisar(); };

// Solo marcas sencillas (sin foto). Si ya había una marca de esa tarea en la cola, la nueva la reemplaza.
export function encolar({ token, tarea_id, accion, razon = null }) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const l = cola().filter((x) => !(x.token === token && x.tarea_id === tarea_id));
  l.push({ id, token, tarea_id, accion, razon, cuando: new Date().toISOString() });
  guardar(l);
  return id;
}
export const pendientesDe = (token) => cola().filter((x) => x.token === token);

let enviando = null;
// Devuelve { enviadas, fallidas } o null si no hubo conexión
export function enviarCola() {
  if (enviando) return enviando;
  enviando = (async () => {
    const l = cola();
    if (!l.length) return { enviadas: 0, fallidas: [] };
    let r;
    try { r = await api.rpc('tarea_marcar_cola', { p_items: l }); } catch { return null; }
    if (!r?.ok) return null;
    const hechos = new Set((r.resultados || []).map((x) => x.id));
    guardar(cola().filter((x) => !hechos.has(x.id)));
    (r.notificaciones || []).forEach((n) => api.avisar(n));
    const fallidas = (r.resultados || []).filter((x) => !x.ok);
    return { enviadas: (r.resultados || []).length - fallidas.length, fallidas };
  })().finally(() => { enviando = null; });
  return enviando;
}
