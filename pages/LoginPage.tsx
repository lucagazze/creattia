import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import { Loader2, Moon, Sun, Info, HelpCircle, UserCheck, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const toAuthEmail = (input: string) => {
  const clean = input.trim().toLowerCase();
  return clean.includes('@') ? clean : `${clean}@algoritmia.team`;
};

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { darkMode, toggleDarkMode } = useTheme();
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      navigate('/');
    }
  }, [session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Por favor completa todos los campos', 'error');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: toAuthEmail(email),
        password,
      });
      if (error) throw error;
    } catch (error: any) {
      showToast(error.message || 'Error al iniciar sesión', 'error');
      setLoading(false);
    }
  };




  return (
    <div 
      className={`flex flex-col font-sans overflow-hidden ${darkMode ? 'bg-[#080808]' : 'bg-[#f2f2f7]'}`}
      style={{ height: '100dvh', minHeight: '100dvh' }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-5 w-full">
        <div className="flex items-center gap-2.5">
          <img
            src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
            alt="Algoritmia"
            className="w-8 h-8 object-contain"
          />
          <div>
            <span className={`text-[14px] font-black tracking-tighter leading-none uppercase block ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              ALGORITMIA
            </span>
            <span className="text-[9px] font-bold text-violet-500 tracking-[0.25em] uppercase">Gestión</span>
          </div>
        </div>
        <button
          onClick={toggleDarkMode}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
            darkMode
              ? 'bg-white/5 border-white/8 text-zinc-400 hover:bg-white/10'
              : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50 shadow-sm'
          }`}
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>
 
      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-4 sm:pb-12 overflow-hidden">
        <div className="w-full max-w-[380px] animate-in fade-in slide-in-from-bottom-4 duration-500 my-auto py-2 sm:py-6">
 
          {/* Logo + title */}
          <div className="flex flex-col items-center mb-4 sm:mb-8">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-10 h-10 mb-2 sm:w-14 sm:h-14 sm:mb-5 object-contain"
            />
            <h1 className={`text-[18px] sm:text-[22px] font-bold tracking-tight mb-0.5 sm:mb-1 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              Bienvenido
            </h1>
            <p className={`text-[11px] sm:text-[13px] font-medium text-center ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Ingresá al ecosistema de Algoritmia
            </p>
          </div>
 
          {/* Form card */}
          <div className={`rounded-2xl p-4 sm:rounded-3xl sm:p-6 ${
            darkMode
              ? 'bg-white/[0.04] border border-white/[0.07] shadow-2xl'
              : 'bg-white border border-zinc-200/60 shadow-xl shadow-zinc-200/40'
          }`}>
            <div className="space-y-4">


              {/* Username & Password Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Email o Usuario
                  </label>
                  <input
                    type="text"
                    placeholder="ejemplo@algoritmia.team o usuario"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full h-10 px-3.5 rounded-xl border text-[13px] sm:text-[13.5px] font-medium outline-none transition-all duration-200 ${
                      darkMode
                        ? 'bg-white/5 border-white/8 text-white placeholder:text-zinc-500 focus:border-violet-500/80 focus:bg-white/[0.08]'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500/80 focus:bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.015)]'
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full h-10 pl-3.5 pr-11 rounded-xl border text-[13px] sm:text-[13.5px] font-medium outline-none transition-all duration-200 ${
                        darkMode
                          ? 'bg-white/5 border-white/8 text-white placeholder:text-zinc-500 focus:border-violet-500/80 focus:bg-white/[0.08]'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500/80 focus:bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.015)]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 hover:scale-110 active:scale-95 transition-all ${
                        darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full h-10 rounded-xl text-[13px] sm:text-[13.5px] font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    darkMode
                      ? 'bg-violet-600 text-white hover:bg-violet-500 shadow-md shadow-violet-600/20'
                      : 'bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-200/40'
                  }`}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Ingresar</span>}
                </button>
              </form>
            </div>
          </div>
 
          <div className="flex justify-center mt-3 sm:mt-5">
            <a
              href="https://wa.me/5493476245523?text=Hola,%20necesito%20ayuda%20para%20ingresar%20al%20sistema%20de%20clientes%20de%20Algoritmia."
              target="_blank"
              rel="noopener noreferrer"
              className={`text-[12px] font-medium transition-all hover:underline ${
                darkMode ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              ¿Necesitás ayuda con tu acceso?
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
