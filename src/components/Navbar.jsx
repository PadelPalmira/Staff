import React from "react";
import { Link } from "react-router-dom";
import { FaHome, FaUsers, FaCalendarCheck, FaUserTie } from "react-icons/fa";

const items = [
  { to: "/", icon: <FaHome />, label: "Dashboard" },
  { to: "/jugadores", icon: <FaUsers />, label: "Jugadores" },
  { to: "/asistencia", icon: <FaCalendarCheck />, label: "Asistencia" },
  { to: "/entrenadores", icon: <FaUserTie />, label: "Entrenadores" },
];

export default function Navbar({ current }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-darkbg border-t border-miamiPink flex justify-around py-2 z-40 sm:static sm:border-none">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`flex flex-col items-center text-xs 
            ${current === item.to ? "text-miamiPink" : "text-miamiBlue"} 
            transition-colors duration-200`}
        >
          <span className="text-lg">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}