// Notificaciones en el teléfono (push). En iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o más nuevo).
import * as api from './api.js';

export const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function aBytes(b64) {
  const p = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function registro() {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, mal) => setTimeout(() => mal(new Error('sw')), 8000))]);
  return reg;
}

// 'activo' | 'apagado' | 'bloqueado' | 'no_soportado' | 'instalar'
export async function estadoPush() {
  if (!pushSoportado()) return esIOS() && !instalada() ? 'instalar' : 'no_soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  try { const reg = await registro(); return (await reg.pushManager.getSubscription()) ? 'activo' : 'apagado'; } catch { return 'no_soportado'; }
}

export async function activarPush() {
  if (!pushSoportado()) throw new Error(esIOS() && !instalada()
    ? 'En iPhone primero instala la app: botón Compartir → “Agregar a inicio”, y ábrela desde ese ícono.'
    : 'Este teléfono o navegador no permite notificaciones.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No se dio permiso para las notificaciones. Puedes darlo en los ajustes del teléfono.');
  const r = await api.avisos({ accion: 'push_clave' });
  if (!r.ok || !r.clave) throw new Error('El servidor no tiene lista la clave de notificaciones. Intenta más tarde.');
  const reg = await registro();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(r.clave) });
  const g = await api.rpc('push_registrar', { p_sub: sub.toJSON(), p_ua: navigator.userAgent });
  if (!g.ok) throw new Error('No se pudo guardar este teléfono para las notificaciones.');
}

export async function desactivarPush() {
  try {
    const reg = await registro();
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api.rpc('push_quitar', { p_endpoint: sub.endpoint }).catch(() => null); await sub.unsubscribe(); }
  } catch { /* nada que quitar */ }
}

export const probarPush = () => api.avisos({ accion: 'push_prueba' });
