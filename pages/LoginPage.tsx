import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import { Loader2, Moon, Sun, EyeOff, Eye, ArrowRight } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const toAuthEmail = (input: string) =>
  input.includes('@') ? input.trim() : `${input.trim().toLowerCase()}@car.algoritmia.com`;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { darkMode, toggleDarkMode } = useTheme();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: toAuthEmail(email), password });
      if (error) throw error;
      showToast('Bienvenido al ecosistema Algoritmia', 'success');
      navigate('/');
    } catch (error: any) {
      showToast(error.message || 'Error al iniciar sesión', 'error');
    } finally {
      setLoading(false);
    }
  };

  const inputBase = `w-full h-12 px-4 rounded-2xl border text-[14px] font-medium outline-none transition-all duration-200 ${
    darkMode
      ? 'bg-white/5 text-white placeholder:text-zinc-600'
      : 'bg-zinc-50 text-zinc-900 placeholder:text-zinc-400'
  }`;

  const inputFocus = (field: 'email' | 'password') =>
    focusedField === field
      ? darkMode
        ? 'border-violet-500/60 shadow-[0_0_0_3px_rgba(139,92,246,0.12)] bg-white/8'
        : 'border-violet-400 shadow-[0_0_0_3px_rgba(139,92,246,0.08)]'
      : darkMode
        ? 'border-white/8'
        : 'border-zinc-200';

  return (
    <div className={`min-h-screen h-screen flex flex-col font-sans overflow-hidden ${
      darkMode ? 'bg-[#080808]' : 'bg-[#f2f2f7]'
    }`}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 w-full">
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
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-[360px] animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* Logo + title */}
          <div className="flex flex-col items-center mb-10">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-14 h-14 object-contain mb-5"
            />
            <h1 className={`text-[22px] font-bold tracking-tight mb-1 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              Bienvenido
            </h1>
            <p className={`text-[13px] font-medium text-center ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Ingresá al ecosistema de Algoritmia
            </p>
          </div>

          {/* Form card */}
          <div className={`rounded-3xl p-6 ${
            darkMode
              ? 'bg-white/[0.04] border border-white/[0.07] shadow-2xl'
              : 'bg-white border border-zinc-200/60 shadow-xl shadow-zinc-200/40'
          }`}>
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="text"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                placeholder="Email o usuario"
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="email"
                className={`${inputBase} ${inputFocus('email')}`}
              />

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Contraseña"
                  className={`${inputBase} ${inputFocus('password')} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-all ${
                    darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full h-12 flex items-center justify-center gap-2 rounded-2xl text-[14px] font-bold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none ${
                    darkMode
                      ? 'bg-white text-black hover:bg-zinc-100 shadow-lg shadow-white/10'
                      : 'bg-zinc-900 text-white hover:bg-black shadow-lg shadow-zinc-900/20'
                  } hover:scale-[1.01] active:scale-[0.99]`}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Entrar <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="flex justify-center mt-5">
            <a
              href="https://wa.me/5493476245523?text=Hola,%20necesito%20ayuda%20para%20recuperar%20mi%20contrase%C3%B1a%20del%20sistema%20Algoritmia."
              target="_blank"
              rel="noopener noreferrer"
              className={`text-[12px] font-medium transition-all hover:underline ${
                darkMode ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
