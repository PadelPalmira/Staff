// URL de tu Apps Script desplegado (cambia esto por tu url)
const API_URL = "https://script.google.com/macros/s/AKfycby2OL77at1mFPXjeNXfiSQE_wSGyxM63geudLz_ERiNScQQPPCyeALYdfURKlpzrIGdwQ/exec";

export async function getJugadores() {
  const res = await fetch(`${API_URL}?action=getData`);
  return await res.json();
}
export async function addJugador(jugador) {
  const res = await fetch(`${API_URL}?action=addJugador`, {
    method: "POST",
    body: JSON.stringify(jugador),
    headers: { "Content-Type": "application/json" }
  });
  return await res.json();
}
export async function updateJugador(jugador) {
  const res = await fetch(`${API_URL}?action=updateJugador`, {
    method: "POST",
    body: JSON.stringify(jugador),
    headers: { "Content-Type": "application/json" }
  });
  return await res.json();
}
export async function deleteJugador(id) {
  const res = await fetch(`${API_URL}?action=deleteJugador`, {
    method: "POST",
    body: JSON.stringify({ id }),
    headers: { "Content-Type": "application/json" }
  });
  return await res.json();
}
export async function getEntrenadores() {
  const res = await fetch(`${API_URL}?action=getEntrenadores`);
  return await res.json();
}
export async function addEntrenador(entrenador) {
  const res = await fetch(`${API_URL}?action=addEntrenador`, {
    method: "POST",
    body: JSON.stringify(entrenador),
    headers: { "Content-Type": "application/json" }
  });
  return await res.json();
}
export async function updateEntrenador(entrenador) {
  const res = await fetch(`${API_URL}?action=updateEntrenador`, {
    method: "POST",
    body: JSON.stringify(entrenador),
    headers: { "Content-Type": "application/json" }
  });
  return await res.json();
}
export async function deleteEntrenador(id) {
  const res = await fetch(`${API_URL}?action=deleteEntrenador`, {
    method: "POST",
    body: JSON.stringify({ id }),
    headers: { "Content-Type": "application/json" }
  });
  return await res.json();
}
