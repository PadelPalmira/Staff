import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import Players from "./components/Players";
import Attendance from "./components/Attendance";
import Coaches from "./components/Coaches";
import Navbar from "./components/Navbar";

export default function App() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-center py-2 bg-darkbg border-b border-miamiBlue">
        <img
          src="/assets/PadelPalmira.PNG"
          alt="Padel Palmira"
          className="h-14 w-auto object-contain"
          style={{ maxWidth: "70vw" }}
        />
      </header>
      <main className="flex-1 px-2 sm:px-4 pb-16">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jugadores" element={<Players />} />
          <Route path="/asistencia" element={<Attendance />} />
          <Route path="/entrenadores" element={<Coaches />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <Navbar current={location.pathname} />
    </div>
  );
}