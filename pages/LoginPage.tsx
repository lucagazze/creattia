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

  const handleGoogleSignIn = () => {
    setLoading(true);
    
    const client_id = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
    const redirect_uri = window.location.origin;
    const nonce = Math.random().toString(36).substring(2);
    
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${client_id}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&response_type=id_token` +
      `&scope=openid%20email%20profile` +
      `&prompt=select_account` +
      `&nonce=${nonce}`;

    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const popup = window.open(
      url,
      'google-signin',
      `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`
    );

    if (!popup) {
      showToast('Por favor habilita los popups para iniciar sesión con Google', 'error');
      setLoading(false);
      return;
    }

    const interval = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(interval);
          setLoading(false);
          return;
        }

        const currentUrl = popup.location.href;
        if (currentUrl.includes(redirect_uri) && popup.location.hash) {
          clearInterval(interval);
          
          const hash = popup.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const idToken = params.get('id_token');
          
          popup.close();
          
          if (idToken) {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: idToken,
            });
            if (error) throw error;
          } else {
            throw new Error('No se recibió el token de Google');
          }
        }
      } catch (err: any) {
        if (err.name !== 'SecurityError' && !err.message?.includes('cross-origin')) {
          clearInterval(interval);
          popup.close();
          showToast(err.message || 'Error en autenticación', 'error');
          setLoading(false);
        }
      }
    }, 100);
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
              {/* Google login at the top */}
              <div className="space-y-3">
                <p className={`text-[11px] font-semibold text-center leading-relaxed ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Si no tenés una cuenta, ingresá con Google para solicitar tu invitación.
                </p>
                <div className="relative w-full h-11 sm:h-12 overflow-hidden rounded-2xl">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGoogleSignIn}
                    className={`w-full h-full flex items-center justify-center gap-2.5 rounded-2xl text-[14px] font-bold transition-all duration-200 ${
                      darkMode
                        ? 'bg-white text-black hover:bg-zinc-100 shadow-lg shadow-white/5'
                        : 'bg-zinc-900 text-white hover:bg-black shadow-lg shadow-zinc-950/20'
                    }`}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Iniciando sesión...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        <span>Acceder con Google</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-zinc-200/60 dark:border-white/[0.06]"></div>
                <span className="flex-shrink mx-3 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">o ingresá con tu correo</span>
                <div className="flex-grow border-t border-zinc-200/60 dark:border-white/[0.06]"></div>
              </div>

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
                    className={`w-full h-11 sm:h-12 px-4 rounded-2xl border text-[13.5px] font-semibold outline-none transition-all duration-200 ${
                      darkMode
                        ? 'bg-white/5 border-white/8 text-white placeholder:text-zinc-650 focus:border-violet-500/80 focus:bg-white/[0.08]'
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
                      className={`w-full h-11 sm:h-12 pl-4 pr-11 rounded-2xl border text-[13.5px] font-semibold outline-none transition-all duration-200 ${
                        darkMode
                          ? 'bg-white/5 border-white/8 text-white placeholder:text-zinc-650 focus:border-violet-500/80 focus:bg-white/[0.08]'
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
                  className={`w-full h-11 sm:h-12 rounded-2xl text-[14px] font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                    darkMode
                      ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-650/20'
                      : 'bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-200/50'
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
