import { SUPABASE_URL, SUPABASE_KEY, APP_VERSION, APP_BUILD } from './config.js';

const $ = (id) => document.getElementById(id);

function setCard(name, state, pill, detail) {
  $('c-' + name).dataset.state = state;
  $('p-' + name).textContent = pill;
  if (detail !== undefined) $('d-' + name).textContent = detail;
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

/* 1 · Conexión con Supabase */
async function testConnection() {
  setCard('conn', 'wait', 'Probando…', 'Comprobando la conexión…');
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_KEY },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    const ms = Math.round(performance.now() - t0);
    if (res.ok) setCard('conn', 'ok', 'Conectado', `El servidor respondió en ${ms} ms.`);
    else setCard('conn', 'bad', 'Error', `El servidor respondió con el código ${res.status}.`);
  } catch (e) {
    const sinRed = !navigator.onLine;
    setCard('conn', 'bad', sinRed ? 'Sin internet' : 'Sin conexión',
      sinRed ? 'El teléfono no tiene internet en este momento.'
             : 'No se pudo llegar al servidor. Revisa el WiFi o los datos y vuelve a probar.');
  }
}

/* 2 · App instalada */
function checkInstall() {
  if (isStandalone()) {
    setCard('install', 'ok', 'Instalada', 'Estás usando la app desde la pantalla de inicio. Perfecto.');
  } else if (isIOS) {
    setCard('install', 'warn', 'Falta instalar',
      'En el iPhone: abre esta página en Safari, toca el botón Compartir (el cuadro con la flecha), ' +
      'elige "Agregar a pantalla de inicio" y ábrela desde ese ícono.');
  } else {
    setCard('install', 'warn', 'Falta instalar',
      'Desde el menú del navegador elige "Instalar app" o "Agregar a pantalla de inicio".');
  }
}

/* 3 · Notificaciones */
function checkNotifications() {
  const btn = $('b-notif');
  const soportado = 'Notification' in window && 'serviceWorker' in navigator;
  if (!soportado) {
    btn.disabled = true;
    if (isIOS && !isStandalone()) {
      setCard('notif', 'warn', 'Falta instalar',
        'En iPhone las notificaciones solo funcionan con la app instalada en la pantalla de inicio (paso 2).');
    } else {
      setCard('notif', 'bad', 'No disponible', 'Este navegador no permite notificaciones.');
    }
    return;
  }
  const p = Notification.permission;
  if (p === 'granted') setCard('notif', 'ok', 'Permitidas', 'Toca el botón para enviarte una notificación de prueba.');
  else if (p === 'denied') {
    setCard('notif', 'bad', 'Bloqueadas',
      'Las notificaciones están bloqueadas. Actívalas en Ajustes del teléfono > Notificaciones > PP Empleados.');
    btn.disabled = true;
  } else setCard('notif', 'warn', 'Falta permiso', 'Toca el botón y elige "Permitir" cuando el teléfono pregunte.');
}

async function probarNotificacion() {
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { checkNotifications(); return; }
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('PP Empleados', {
      body: 'Prueba de notificación: si ves esto, funciona.',
      icon: 'assets/img/icon-192.png',
      tag: 'prueba',
    });
    setCard('notif', 'ok', 'Funciona', 'Deberías haber recibido la notificación. Si no llegó, revisa que el teléfono no esté en No molestar.');
  } catch (e) {
    setCard('notif', 'bad', 'Error', 'No se pudo enviar la notificación de prueba.');
  }
}

/* 4 · Sin internet */
async function checkOffline() {
  const en_linea = navigator.onLine;
  if (!('serviceWorker' in navigator)) {
    setCard('offline', 'bad', 'No disponible', 'Este navegador no permite usar la app sin internet.');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const listo = !!reg.active && !!navigator.serviceWorker.controller;
    if (listo) {
      setCard('offline', 'ok', 'Lista',
        (en_linea ? 'Tienes internet. ' : 'Estás sin internet y la app abrió bien. ') +
        'La app ya quedó guardada en el teléfono para abrirse sin conexión.');
    } else {
      setCard('offline', 'warn', 'Preparando', 'La app se está guardando en el teléfono. Cierra y vuelve a abrirla en un momento.');
    }
  } catch (e) {
    setCard('offline', 'bad', 'Error', 'No se pudo preparar el modo sin internet.');
  }
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { /* se reporta en la tarjeta 4 */ }
}

async function init() {
  $('ver').textContent = `${APP_VERSION} (${APP_BUILD})`;
  $('b-conn').addEventListener('click', testConnection);
  $('b-notif').addEventListener('click', probarNotificacion);
  window.addEventListener('online', () => { checkOffline(); testConnection(); });
  window.addEventListener('offline', () => { checkOffline(); testConnection(); });
  checkInstall();
  checkNotifications();
  await registerSW();
  checkOffline();
  testConnection();
}

init();
