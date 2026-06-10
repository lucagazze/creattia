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
      className={`relative flex flex-col font-sans overflow-hidden transition-colors duration-500 ${darkMode ? 'bg-[#060606]' : 'bg-[#f8f9fa]'}`}
      style={{ height: '100dvh', minHeight: '100dvh' }}
    >
      {/* Decorative Glow Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 dark:bg-violet-600/[0.07] blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-pink-500/10 dark:bg-pink-500/[0.05] blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 w-full">
        <div className="flex items-center gap-3">
          <img
            src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
            alt="Algoritmia"
            className="w-7 h-7 object-contain"
          />
          <div>
            <span className={`text-[13px] font-black tracking-tighter leading-none uppercase block ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              ALGORITMIA
            </span>
            <span className="text-[8.5px] font-bold text-violet-500 tracking-[0.25em] uppercase">Gestión</span>
          </div>
        </div>
        <button
          onClick={toggleDarkMode}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
            darkMode
              ? 'bg-white/5 border-white/8 text-zinc-400 hover:bg-white/10 hover:text-white'
              : 'bg-white border-zinc-200/80 text-zinc-500 hover:bg-zinc-50 shadow-sm'
          }`}
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
        </button>
      </header>
 
      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-12 overflow-hidden">
        <div className="w-full max-w-[360px] animate-in fade-in slide-in-from-bottom-5 duration-700 my-auto py-4">
          {/* Logo + title */}
          <div className="flex flex-col items-center mb-6 text-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-500 ${
              darkMode ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-white border border-zinc-200/50 shadow-sm'
            }`}>
              <img
                src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
                alt="Algoritmia"
                className="w-9 h-9 object-contain"
              />
            </div>
            <h1 className={`text-[15px] font-black tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              Ingresar al ecosistema de Algoritmia
            </h1>
          </div>
 
          {/* Form card */}
          <div className={`rounded-3xl p-6 backdrop-blur-md transition-all duration-500 ${
            darkMode
              ? 'bg-[#0f0f0f]/80 border border-white/[0.07] shadow-[0_20px_50px_rgba(0,0,0,0.6)]'
              : 'bg-white/90 border border-zinc-200/60 shadow-[0_20px_40px_rgba(0,0,0,0.03)]'
          }`}>
            <div className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                
                {/* Username Input */}
                <div className="space-y-1.5">
                  <label className={`text-[9.5px] font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Email o Usuario
                  </label>
                  <input
                    type="text"
                    placeholder="ejemplo@algoritmia.team o usuario"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full h-11 px-3.5 rounded-xl border text-[13px] font-semibold outline-none transition-all duration-200 ${
                      darkMode
                        ? 'bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-violet-500/80 focus:bg-white/[0.07] focus:ring-4 focus:ring-violet-500/10'
                        : 'bg-zinc-50 border-zinc-200/80 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500/80 focus:bg-white focus:ring-4 focus:ring-violet-500/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]'
                    }`}
                  />
                </div>
 
                {/* Password Input */}
                <div className="space-y-1.5">
                  <label className={`text-[9.5px] font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full h-11 pl-3.5 pr-11 rounded-xl border text-[13px] font-semibold outline-none transition-all duration-200 ${
                        darkMode
                          ? 'bg-white/5 border-white/10 text-white placeholder:text-zinc-500 focus:border-violet-500/80 focus:bg-white/[0.07] focus:ring-4 focus:ring-violet-500/10'
                          : 'bg-zinc-50 border-zinc-200/80 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500/80 focus:bg-white focus:ring-4 focus:ring-violet-500/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 hover:scale-110 active:scale-95 transition-all ${
                        darkMode ? 'text-zinc-500 hover:text-zinc-350' : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
 
                {/* White Login Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full h-11 rounded-xl text-[13px] font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
                    darkMode
                      ? 'bg-white text-zinc-950 hover:bg-zinc-100 shadow-[0_4px_20px_rgba(255,255,255,0.12)] border border-transparent'
                      : 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:border-zinc-300'
                  }`}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                  ) : (
                    <span>Ingresar</span>
                  )}
                </button>
              </form>
            </div>
          </div>
 
          {/* Help Link */}
          <div className="flex justify-center mt-6">
            <a
              href="https://wa.me/5493476245523?text=Hola,%20necesito%20ayuda%20para%20ingresar%20al%20sistema%20de%20clientes%20de%20Algoritmia."
              target="_blank"
              rel="noopener noreferrer"
              className={`text-[11.5px] font-semibold tracking-wide transition-all hover:underline ${
                darkMode ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-500'
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
