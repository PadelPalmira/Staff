// CSV de Loyverse: leer el export de artículos y generar el archivo de importación (mismas columnas, UTF-8 sin BOM, fin de línea \n).

export function parsearCSV(texto) {
  const t = String(texto || '').replace(/^﻿/, '');
  const filas = []; let fila = []; let campo = ''; let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c !== ''));
}

const num = (v) => { const s = String(v ?? '').trim(); if (s === '' || s.toLowerCase() === 'variable') return ''; const n = Number(s); return Number.isFinite(n) ? n : ''; };

// Devuelve { columnas, tienda, filas:[{handle, ref, nombre, categoria, sigue, receta, precio, costo, stock, fila}] } o lanza Error con mensaje claro
export function leerExportLoyverse(texto) {
  const tabla = parsearCSV(texto);
  if (tabla.length < 2) throw new Error('El archivo está vacío.');
  const columnas = tabla[0].map((c) => c.trim());
  const idx = (pred) => columnas.findIndex(pred);
  const iHandle = idx((c) => c === 'Handle');
  const iNombre = idx((c) => c === 'Nombre' || c === 'Name');
  const iStock = idx((c) => /^(En inventario|In stock) \[/.test(c));
  if (iHandle < 0 || iNombre < 0 || iStock < 0) throw new Error('Este no parece el export de artículos de Loyverse (faltan columnas Handle, Nombre o En inventario).');
  const iRef = idx((c) => c === 'REF' || c === 'SKU');
  const iCat = idx((c) => c === 'Categoria' || c === 'Categoría' || c === 'Category');
  const iCosto = idx((c) => c === 'Coste' || c === 'Costo' || c === 'Cost');
  const iSigue = idx((c) => /^Seguir el inventario$/i.test(c) || c === 'Track stock');
  const iPrecio = idx((c) => /^(Precio|Price) \[/.test(c));
  const iComp = idx((c) => c === 'REF del componente' || c === 'Component SKU');
  const iOpc = idx((c) => c === 'Opción 1 valor' || c === 'Option 1 value');
  const tienda = (columnas[iStock].match(/\[(.*)\]/) || [])[1] || '';
  const filas = [];
  let actual = null, padre = null;
  for (const f of tabla.slice(1)) {
    const v = (i) => (i >= 0 ? (f[i] ?? '') : '');
    const handle = v(iHandle).trim();
    if (!handle) { if (actual && v(iComp).trim()) actual.receta = true; continue; } // renglón extra de receta
    const fila = {}; columnas.forEach((c, i) => { fila[c] = f[i] ?? ''; });
    const esVariante = padre && padre.handleReal === handle && !v(iNombre).trim();
    const base = esVariante ? padre : null;
    const opcion = v(iOpc).trim();
    actual = {
      handleReal: handle,
      handle: handle, ref: v(iRef).trim(),
      nombre: esVariante ? `${base.nombreBase} · ${opcion || v(iRef).trim()}` : v(iNombre).trim(),
      nombreBase: esVariante ? base.nombreBase : v(iNombre).trim(),
      categoria: esVariante ? base.categoria : v(iCat).trim(),
      sigue: esVariante ? base.sigue : v(iSigue).trim().toUpperCase() === 'Y', receta: !!v(iComp).trim(),
      precio: num(v(iPrecio)), costo: num(v(iCosto)), stock: num(v(iStock)), fila,
    };
    if (esVariante) {
      // artículo con variantes: cada variante es un artículo propio (clave = handle#REF) y el primero también se renombra
      if (!padre.variante) { padre.variante = true; padre.handle = `${padre.handleReal}#${padre.ref}`; padre.nombre = `${padre.nombreBase} · ${padre.opcion || padre.ref}`; }
      actual.variante = true; actual.handle = `${handle}#${actual.ref}`;
    } else { padre = actual; actual.opcion = opcion; }
    filas.push(actual);
  }
  if (!filas.length) throw new Error('El archivo no trae artículos.');
  return { columnas, tienda, columnaStock: columnas[iStock], filas };
}

const celda = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const fmtStock = (n) => (Math.round(Number(n) * 1000) / 1000).toFixed(3);

// cambios: Map clave -> nuevo stock. exportFresco: resultado de leerExportLoyverse del export recién subido.
// Se incluyen solo los artículos con cambio; si un artículo tiene variantes, van todas sus filas (en su orden) para que Loyverse las entienda.
export function generarImportacion(exportFresco, cambios) {
  const { columnas, columnaStock, filas } = exportFresco;
  const handles = new Set(filas.filter((f) => cambios.has(f.handle)).map((f) => f.handleReal));
  const out = [columnas.map(celda).join(',')];
  for (const f of filas) {
    if (!handles.has(f.handleReal)) continue;
    const nuevo = cambios.has(f.handle) ? fmtStock(cambios.get(f.handle)) : f.fila[columnaStock];
    out.push(columnas.map((c) => celda(c === columnaStock ? nuevo : (f.fila[c] ?? ''))).join(','));
  }
  return out.join('\n');
}

export function descargarTexto(nombre, texto, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}

export function leerArchivo(file) {
  return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => mal(new Error('No se pudo leer el archivo.')); r.readAsText(file, 'utf-8'); });
}
