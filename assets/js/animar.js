// Animaciones del tablero: los números cuentan desde 0 y las barras crecen, una sola vez al cargar.
const quieto = () => navigator.webdriver || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function animarTablero(root) {
  if (!root) return;
  root.querySelectorAll('.graf-ventas .gv-dia').forEach((d, i) => d.style.setProperty('--i', i));
  root.classList.add('anima');
  if (quieto()) return;
  root.querySelectorAll('.kpi-grande b, .cifras b').forEach((el) => contar(el));
}

function contar(el) {
  if (el.children.length) return;
  const txt = el.textContent.trim();
  const m = txt.match(/^([^\d−-]*)([−-]?)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return;
  const [, pre, signo, num, post] = m;
  const fin = Number(num.replace(/,/g, ''));
  if (!Number.isFinite(fin) || fin === 0) return;
  const dec = (num.split('.')[1] || '').length;
  const coma = num.includes(',') || fin >= 1000;
  const fmt = (v) => (coma ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
  const dur = 700, t0 = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - (1 - p) ** 3;
    el.textContent = `${pre}${signo}${fmt(fin * e)}${post}`;
    if (p < 1) requestAnimationFrame(paso); else el.textContent = txt;
  };
  requestAnimationFrame(paso);
}
