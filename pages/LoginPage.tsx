import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import { Loader2, Moon, Sun, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const toAuthEmail = (input: string) => {
  const clean = input.trim().toLowerCase();
  return clean.includes('@') ? clean : `${clean}@algoritmia.team`;
};

type Mode = 'login' | 'register' | 'reset';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { darkMode, toggleDarkMode } = useTheme();
  const { session } = useAuth();

  useEffect(() => {
    if (session) navigate('/dashboard');
  }, [session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { showToast('Completá todos los campos', 'error'); return; }
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

  const mapRegisterError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes('already registered') || m.includes('already been registered')) return 'Este email ya tiene una cuenta. Iniciá sesión.';
    if (m.includes('confirmation email') || m.includes('sending')) return 'Este email ya está registrado. Probá iniciar sesión.';
    if (m.includes('invalid') && m.includes('email')) return 'El email ingresado no es válido.';
    if (m.includes('password') && m.includes('6')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Esperá unos minutos y volvé a intentar.';
    if (m.includes('network') || m.includes('fetch')) return 'Error de conexión. Verificá tu internet e intentá de nuevo.';
    return msg;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) { showToast('Completá todos los campos', 'error'); return; }
    if (password !== confirmPassword) { showToast('Las contraseñas no coinciden', 'error'); return; }
    if (password.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: toAuthEmail(email),
        password,
      });
      if (error) throw error;
      setRegistered(true);
    } catch (error: any) {
      showToast(mapRegisterError(error.message || ''), 'error');
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { showToast('Ingresá tu email', 'error'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(toAuthEmail(email), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (error: any) {
      showToast(error.message || 'Error al enviar el email', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      showToast(error.message || 'Error al iniciar sesión con Google', 'error');
      setGoogleLoading(false);
    }
  };

  const inputClass = `w-full h-11 px-3.5 rounded-xl border text-[13px] font-semibold outline-none transition-all duration-200 ${
    darkMode
      ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-emerald-500/80 focus:bg-zinc-750 focus:ring-4 focus:ring-emerald-500/10'
      : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-4 focus:ring-emerald-500/10'
  }`;

  const labelClass = `text-[9.5px] font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`;

  return (
    <div
      className={`relative flex flex-col font-sans overflow-y-auto ${darkMode ? 'bg-[#060606]' : 'bg-[#f8f9fa]'}`}
      style={{ minHeight: '100dvh' }}
    >
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b transition-all duration-300 ${darkMode ? 'bg-[#060606]/85 border-white/[0.04]' : 'bg-[#f8f9fa]/85 border-zinc-200/40'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-[68px] flex items-center justify-between">
          <div className="flex items-center gap-2.5 md:gap-3.5">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-8 h-8 md:w-9 md:h-9 object-contain"
            />
            <div>
              <span className={`text-[13px] md:text-[14px] font-bold tracking-tight uppercase leading-none block font-display ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                Algoritmia
              </span>
              <span className="text-[8px] md:text-[9px] font-bold text-violet-500 tracking-[0.24em] uppercase block mt-0.5 md:mt-1">Gestión</span>
            </div>
          </div>

          <button
            onClick={toggleDarkMode}
            className={`w-9 h-9 md:w-10 md:h-10 rounded-lg border flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
              darkMode ? 'bg-zinc-900/80 border-zinc-500/35 text-zinc-400 hover:bg-zinc-800/90 hover:border-zinc-400/45 hover:text-zinc-100' : 'bg-white border-zinc-200/60 text-zinc-500 hover:bg-zinc-50 shadow-sm'
            }`}
            aria-label="Cambiar tema"
          >
            {darkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px] text-zinc-500" />}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-4 pt-28 pb-16">
        <div className="w-full max-w-[360px] animate-in fade-in slide-in-from-bottom-5 duration-700">

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
            <h1 className={`text-[22px] font-black tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              {mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : 'Recuperar contraseña'}
            </h1>
            <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-1.5 font-semibold">
              Ecosistema de Algoritmia.
            </p>
          </div>

          {/* Toggle — only show for login/register */}
          {mode !== 'reset' && (
            <div className={`flex rounded-2xl p-1 mb-4 ${darkMode ? 'bg-white/5 border border-white/[0.06]' : 'bg-zinc-100 border border-zinc-200/60'}`}>
              {(['login', 'register'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setRegistered(false); }}
                  className={`flex-1 h-8 rounded-xl text-[11px] font-bold transition-all duration-200 ${
                    mode === m
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
                </button>
              ))}
            </div>
          )}

          {/* Card */}
          <div className={`rounded-3xl p-6 backdrop-blur-md transition-all duration-500 ${
            darkMode
              ? 'bg-[#0f0f0f]/80 border border-white/[0.07] shadow-[0_20px_50px_rgba(0,0,0,0.6)]'
              : 'bg-white/90 border border-zinc-200/60 shadow-[0_20px_40px_rgba(0,0,0,0.03)]'
          }`}>

            {/* Google button — not shown on reset flow */}
            {mode !== 'reset' && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleLoading || loading}
                  className={`w-full h-10 rounded-xl border text-[12px] font-bold flex items-center justify-center gap-2.5 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 mb-1.5 ${
                    darkMode
                      ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm'
                  }`}
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      {mode === 'register' ? 'Crear cuenta con Google' : 'Continuar con Google'}
                    </>
                  )}
                </button>
                <p className={`text-center text-[10px] font-medium mb-3 ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  {mode === 'login'
                    ? 'Google inicia sesión o crea tu cuenta si es la primera vez'
                    : 'Tu cuenta de Google se usará para crear el acceso'}
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex-1 h-px ${darkMode ? 'bg-white/10' : 'bg-zinc-200'}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>o</span>
                  <div className={`flex-1 h-px ${darkMode ? 'bg-white/10' : 'bg-zinc-200'}`} />
                </div>
              </>
            )}

            {/* Register success */}
            {mode === 'reset' ? (
              resetSent ? (
                <div className="text-center space-y-3 py-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className={`text-[13px] font-bold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Email enviado</p>
                  <p className="text-[12px] text-zinc-500">Revisá tu casilla y hacé clic en el link para restablecer tu contraseña.</p>
                  <button
                    onClick={() => { setMode('login'); setResetSent(false); setEmail(''); }}
                    className="text-[12px] font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                  >
                    ← Volver al inicio de sesión
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <p className={`text-[12px] mb-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Ingresá tu email y te enviamos un link para restablecer tu contraseña.
                  </p>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full h-9 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 ${
                      darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800'
                    }`}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar link de recuperación'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setEmail(''); }}
                    className={`w-full text-center text-[11px] font-semibold ${darkMode ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600'} transition-colors`}
                  >
                    ← Volver al inicio de sesión
                  </button>
                </form>
              )
            ) : registered ? (
              <div className="text-center space-y-3 py-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className={`text-[13px] font-bold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>¡Cuenta creada!</p>
                <p className="text-[12px] text-zinc-500">Revisá tu email para confirmar tu cuenta, luego iniciá sesión.</p>
                <button
                  onClick={() => { setMode('login'); setRegistered(false); }}
                  className="text-[12px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  Ir al inicio de sesión →
                </button>
              </div>
            ) : mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Email o Usuario</label>
                  <input
                    type="text"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 transition-all ${darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`flex-1 h-9 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 ${
                      darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800'
                    }`}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Ingresar</span>}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setPassword(''); }}
                  className={`w-full text-center text-[11px] font-semibold pt-1 ${darkMode ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600'} transition-colors`}
                >
                  Olvidé mi contraseña
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 transition-all ${darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Confirmar contraseña</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full h-9 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 ${
                    darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800'
                  }`}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Crear cuenta</span>}
                </button>
              </form>
            )}
          </div>

          {/* Help */}
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
