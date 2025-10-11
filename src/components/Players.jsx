import React, { useEffect, useState } from "react";
import { getJugadores, addJugador, updateJugador, deleteJugador, getEntrenadores } from "../utils/api";
import { FaPlus, FaEdit, FaTrash } from "react-icons/fa";

const colores = {
  Pagado: "bg-green-500",
  Pendiente: "bg-yellow-400"
};

const bordeAlerta = (clases) => (clases <= 2 ? "border-2 border-red-500" : "");

function JugadorForm({ onSave, data, onClose, entrenadores }) {
  const [form, setForm] = useState(
    data || { nombre: "", edad: "", tel: "", tipo: "", dias: "", horario: "", entrenadores: "", pago: "", clases: 4 }
  );
  useEffect(() => { setForm(data || { nombre: "", edad: "", tel: "", tipo: "", dias: "", horario: "", entrenadores: "", pago: "", clases: 4 }); }, [data]);
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex justify-center items-center">
      <form className="bg-darkbg p-6 rounded-lg shadow-lg w-full max-w-md space-y-3 border border-miamiBlue"
        onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <h3 className="text-xl font-bold text-miamiPink">{data ? "Editar" : "Añadir"} Jugador</h3>
        <input required className="input" placeholder="Nombre" value={form.nombre}
          onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
        <input className="input" type="number" placeholder="Edad" value={form.edad}
          onChange={e => setForm(f => ({ ...f, edad: e.target.value }))} />
        <input className="input" placeholder="Teléfono" value={form.tel}
          onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} />
        <select required className="input" value={form.tipo}
          onChange={e => setForm(f => ({ ...f, tipo: e.target.value, pago: precios(e.target.value), clases: numClases(e.target.value) }))}>
          <option value="">Tipo de clase</option>
          <option value="Academia Adultos">Academia Adultos</option>
          <option value="Academia Niños">Academia Niños</option>
          <option value="Privada Suelta">Privada Suelta</option>
          <option value="Privada Paquete">Privada Paquete (4 clases)</option>
        </select>
        <input className="input" placeholder="Días (ej: Lun, Mie)" value={form.dias}
          onChange={e => setForm(f => ({ ...f, dias: e.target.value }))} />
        <input className="input" placeholder="Horario (ej: 19:00)" value={form.horario}
          onChange={e => setForm(f => ({ ...f, horario: e.target.value }))} />
        <div>
          <label className="block mb-1">Entrenadores</label>
          <select
            className="input"
            value={form.entrenadores}
            onChange={e => setForm(f => ({ ...f, entrenadores: e.target.value }))}
          >
            <option value="">Selecciona entrenador</option>
            {entrenadores.map(e => (
              <option key={e.id} value={e.nombre}>{e.nombre}</option>
            ))}
          </select>
        </div>
        <input className="input" type="number" placeholder="Pago" value={form.pago}
          onChange={e => setForm(f => ({ ...f, pago: e.target.value }))} />
        <input className="input" type="number" placeholder="Clases restantes" value={form.clases}
          onChange={e => setForm(f => ({ ...f, clases: e.target.value }))} />
        <div className="flex justify-between gap-2">
          <button type="button" onClick={onClose} className="btn bg-gray-600 text-white">Cancelar</button>
          <button type="submit" className="btn bg-miamiPink text-darkbg font-bold">{data ? "Actualizar" : "Añadir"}</button>
        </div>
      </form>
    </div>
  );
}

// Precios inteligentes
const precios = (tipo) => {
  if (tipo === "Academia Adultos") return 2200;
  if (tipo === "Academia Niños") return 1800;
  if (tipo === "Privada Suelta") return 600;
  if (tipo === "Privada Paquete") return 2000;
  return "";
};
const numClases = (tipo) => {
  if (tipo === "Privada Suelta") return 1;
  if (tipo === "Privada Paquete") return 4;
  return 4;
};

export default function Players() {
  const [jugadores, setJugadores] = useState([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [entrenadores, setEntrenadores] = useState([]);
  const load = async () => setJugadores(await getJugadores());
  useEffect(() => { load(); getEntrenadores().then(setEntrenadores); }, []);
  const agruparPor = (arr, key) => arr.reduce((a, j) => {
    const k = j[key] || "Sin Grupo";
    a[k] = a[k] || []; a[k].push(j); return a;
  }, {});
  const grupos = agruparPor(jugadores, "horario");

  return (
    <div className="pt-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-miamiBlue">Jugadores</h2>
        <button className="btn bg-miamiPink text-darkbg font-bold flex items-center gap-2" onClick={() => setModal(true)}>
          <FaPlus /> Añadir
        </button>
      </div>
      {Object.entries(grupos).map(([hora, js]) => (
        <div key={hora} className="mb-6">
          <h3 className="font-bold mb-2 text-miamiPink">{hora}</h3>
          <div className="flex flex-wrap gap-4">
            {js.map(j => (
              <div key={j.id} className={`w-64 p-4 rounded-lg shadow-lg bg-darkbg ${colores[j.pago] || "bg-gray-700"} ${bordeAlerta(Number(j.clases))}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-lg">{j.nombre}</span>
                  <span className="text-xs">#{j.id.slice(-4)}</span>
                </div>
                <div>Clases restantes: <b>{j.clases}</b></div>
                <div>Pago: <span className={j.pago === "Pagado" ? "text-green-200" : "text-yellow-200"}>{j.pago}</span></div>
                <div className="text-xs">Entrenador: {j.entrenadores || "-"}</div>
                <div className="flex gap-2 mt-3">
                  <button className="btn bg-miamiBlue text-darkbg flex-1" onClick={() => { setEdit(j); setModal(true); }}><FaEdit /></button>
                  <button className="btn bg-red-600 text-white flex-1" onClick={async () => { if (window.confirm("¿Eliminar jugador?")) { await deleteJugador(j.id); load(); } }}><FaTrash /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {modal && (
        <JugadorForm
          entrenadores={entrenadores}
          data={edit}
          onSave={async (f) => {
            if (edit) await updateJugador({ ...edit, ...f }); else await addJugador(f);
            setModal(false); setEdit(null); load();
          }}
          onClose={() => { setModal(false); setEdit(null); }}
        />
      )}
    </div>
  );
}