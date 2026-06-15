import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { ArrowLeft, Home } from 'lucide-react';

export default function NotFoundPage() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 text-center font-sans ${darkMode ? 'bg-[#060606] text-zinc-200' : 'bg-[#f8f9fa] text-zinc-800'}`}>
      <div className="max-w-sm w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className={`text-[80px] font-black tracking-tighter leading-none ${darkMode ? 'text-zinc-800' : 'text-zinc-200'}`}>
          404
        </div>
        <div className="space-y-2">
          <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
            Página no encontrada
          </h1>
          <p className={`text-[13.5px] ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
            La URL que buscás no existe o fue movida.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className={`w-full sm:w-auto h-9 px-5 rounded-xl text-[12px] font-bold border transition-all flex items-center justify-center gap-2 ${
              darkMode
                ? 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver atrás
          </button>
          <Link
            to="/dashboard"
            className={`w-full sm:w-auto h-9 px-5 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-2 ${
              darkMode
                ? 'bg-white text-zinc-900 hover:bg-zinc-100'
                : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shadow-zinc-900/10'
            }`}
          >
            <Home className="w-3.5 h-3.5" /> Ir al dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
