import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showToast('Bienvenido al portal C.A.R', 'success');
      navigate('/');
    } catch (error: any) {
      showToast(error.message || 'Error al iniciar sesión', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-[360px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-[0_4px_20px_rgba(109,40,217,0.3)] mb-5">
            <span className="text-white text-[20px] font-bold tracking-tight">C</span>
          </div>
          <h1 className="text-[22px] font-semibold text-zinc-900 dark:text-white tracking-[-0.03em]">
            Portal C.A.R
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-500 mt-1">
            Ingresá para ver tus métricas
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.05] dark:border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-500 mb-1.5 block">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="w-full h-10 rounded-[10px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3.5 text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-violet-500 transition-all"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-500 mb-1.5 block">
                Contraseña
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 rounded-[10px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3.5 text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-violet-500 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 mt-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold tracking-[-0.01em] rounded-[10px] shadow-[0_2px_8px_rgba(109,40,217,0.25)] hover:shadow-[0_4px_12px_rgba(109,40,217,0.35)] hover:-translate-y-[1px] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Iniciando sesión...
                </span>
              ) : 'Ingresar al Portal'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-600 mt-6">
          Desarrollado por Algoritmia
        </p>
      </div>
    </div>
  );
}
