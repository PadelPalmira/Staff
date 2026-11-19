// Íconos de línea (trazo 1.8, 24×24) para la navegación y las tarjetas de Inicio. Usan el color del texto.
const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const ICONO = {
  inicio: svg('<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>'),
  turnos: svg('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'),
  tareas: svg('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>'),
  pendientes: svg('<path d="M9 4h6l-1 5 3 3H7l3-3z"/><path d="M12 12v8"/>'),
  inventario: svg('<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="M4 8.5 12 13l8-4.5M12 13v7"/>'),
  mas: svg('<path d="M5 7h14M5 12h14M5 17h14"/>'),
  tablero: svg('<path d="M5 19V11M10 19V6M15 19v-5M20 19V9"/><path d="M3 19h18"/>'),
  caja: svg('<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/>'),
  cobros: svg('<circle cx="9" cy="9" r="5"/><path d="M14.5 6.2A5 5 0 1 1 11 18.5"/><path d="M9 7v4M7.5 8.5h3"/>'),
  usuarios: svg('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.3A4.5 4.5 0 0 1 21 18.5"/>'),
  ajustes: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  actividad: svg('<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>'),
  cuenta: svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  resumen: svg('<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>'),
};
