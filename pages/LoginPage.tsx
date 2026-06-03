declare global {
  interface Window {
    google?: any;
  }
}

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import { Loader2, Moon, Sun, Info, HelpCircle, UserCheck } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { darkMode, toggleDarkMode } = useTheme();
  const { session } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  const client_id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isGoogleConfigured = !!client_id;

  useEffect(() => {
    if (session) {
      navigate('/');
    }
  }, [session, navigate]);

  const handleCredentialResponse = async (response: any) => {
    setLoading(true);
    try {
      const idToken = response.credential;
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;
      navigate('/');
    } catch (error: any) {
      showToast(error.message || 'Error al iniciar sesión con Google', 'error');
      setLoading(false);
    }
  };

  const initializeGoogleSignIn = () => {
    if (!client_id || !window.google) return;

    window.google.accounts.id.initialize({
      client_id,
      callback: handleCredentialResponse,
      ux_mode: 'popup',
    });

    if (containerRef.current) {
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: darkMode ? 'filled_black' : 'outline',
        size: 'large',
        width: containerRef.current.offsetWidth || 332,
        shape: 'rectangular',
        text: 'signin_with',
        logo_alignment: 'center',
      });
    }
  };

  useEffect(() => {
    if (!isGoogleConfigured) return;

    let script = document.getElementById('google-gsi-script') as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.id = 'google-gsi-script';
      script.onload = () => {
        initializeGoogleSignIn();
      };
      document.body.appendChild(script);
    } else if (window.google) {
      initializeGoogleSignIn();
    }

    const handleResize = () => {
      if (window.google) initializeGoogleSignIn();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [darkMode, isGoogleConfigured]);

  return (
    <div className={`min-h-screen h-screen flex flex-col font-sans overflow-hidden ${
      darkMode ? 'bg-[#080808]' : 'bg-[#f2f2f7]'
    }`}>
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
            <div className="space-y-3.5 sm:space-y-5">
              {/* Google GSI Container with Transparent Overlay */}
              <div className="relative w-full">
                {!isGoogleConfigured ? (
                  <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed font-semibold">
                    Configuración requerida: Por favor agrega la variable <code>VITE_GOOGLE_CLIENT_ID</code> en tu archivo <code>.env</code> o panel de Vercel.
                  </div>
                ) : (
                  <div className="relative w-full h-11 sm:h-12 overflow-hidden rounded-2xl">
                    {/* 1. Our beautiful original HTML button */}
                    <button
                      type="button"
                      disabled={loading}
                      className={`w-full h-full flex items-center justify-center gap-2.5 rounded-2xl text-[14px] font-bold transition-all duration-200 ${
                        darkMode
                          ? 'bg-white text-black hover:bg-zinc-100 shadow-lg shadow-white/5'
                          : 'bg-zinc-900 text-white hover:bg-black shadow-lg shadow-zinc-950/20'
                      }`}
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
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
                    
                    {/* 2. Transparent overlay of official Google button */}
                    {!loading && (
                      <div 
                        ref={containerRef} 
                        className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-[0.01] active:opacity-[0.01]" 
                        style={{ zIndex: 10 }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="relative flex py-0.5 sm:py-1 items-center">
                <div className="flex-grow border-t border-zinc-200/60 dark:border-white/[0.06]"></div>
                <span className="flex-shrink mx-3 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">¿Cómo funciona?</span>
                <div className="flex-grow border-t border-zinc-200/60 dark:border-white/[0.06]"></div>
              </div>

              {/* Instruction list */}
              <div className="space-y-2.5 sm:space-y-4">
                <div className="flex gap-2 sm:gap-3">
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    darkMode ? 'bg-white/5 text-zinc-300' : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    <Info className="w-3.5 h-3.5 sm:w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-[11px] sm:text-[12px] font-bold ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      1. Ingreso único
                    </h4>
                    <p className={`text-[10px] sm:text-[11px] leading-snug sm:leading-relaxed mt-0 sm:mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Hacé clic arriba para autenticarte. Podés usar tu cuenta personal de Google (Gmail).
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 sm:gap-3">
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    darkMode ? 'bg-white/5 text-zinc-300' : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    <UserCheck className="w-3.5 h-3.5 sm:w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-[11px] sm:text-[12px] font-bold ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      2. Vinculación automática
                    </h4>
                    <p className={`text-[10px] sm:text-[11px] leading-snug sm:leading-relaxed mt-0 sm:mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Si el correo de tu cuenta de Google ya fue invitado por el administrador, ingresarás directamente a la plataforma de tu negocio.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 sm:gap-3">
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    darkMode ? 'bg-white/5 text-zinc-300' : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    <HelpCircle className="w-3.5 h-3.5 sm:w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-[11px] sm:text-[12px] font-bold ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      ¿Sos un usuario nuevo?
                    </h4>
                    <p className={`text-[10px] sm:text-[11px] leading-snug sm:leading-relaxed mt-0 sm:mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Si ingresás por primera vez y aún no estás registrado, verás una pantalla de <strong>"Acceso pendiente"</strong>. Esperá a que el administrador te acepte la solicitud directamente.
                    </p>
                  </div>
                </div>
              </div>
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
