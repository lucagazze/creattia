import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import { Lock, Mail, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';

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
      showToast('Bienvenido al ecosistema Algoritmia', 'success');
      navigate('/');
    } catch (error: any) {
      showToast(error.message || 'Error al iniciar sesión', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse delay-700" />
      
      <div className="w-full max-w-[420px] relative z-10">
        {/* Header / Logo Section */}
        <div className="flex flex-col items-center mb-12">
          <div className="relative group mb-8">
            <div className="absolute inset-0 bg-gradient-to-tr from-violet-600 to-blue-600 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
            <img 
              src="/assets/logoSinFondo.png" 
              alt="Algoritmia" 
              className="relative h-20 w-auto object-contain drop-shadow-[0_0_15px_rgba(139,92,246,0.3)]"
            />
          </div>
          
          <div className="text-center space-y-2">
            <h1 className="text-[32px] font-bold text-white tracking-tight leading-none">
              ALGORITMIA <span className="text-violet-500">GESTIÓN</span>
            </h1>
            <p className="text-zinc-500 text-[14px] font-medium tracking-wide uppercase">
              Inteligencia • Captación • Retención
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-[#111]/80 backdrop-blur-2xl rounded-[28px] border border-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="relative group">
                <label className="absolute -top-2.5 left-4 px-2 bg-[#111] text-[11px] font-bold text-violet-400 uppercase tracking-widest z-10">
                  Acceso Cliente
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Mail className="w-4 h-4 text-zinc-500 group-focus-within:text-violet-500 transition-colors" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full h-14 pl-12 pr-4 bg-transparent border border-white/10 rounded-[16px] text-white text-[15px] focus:outline-none focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10 transition-all placeholder:text-zinc-600"
                  />
                </div>
              </div>

              <div className="relative group">
                <div className="relative">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-zinc-500 group-focus-within:text-violet-500 transition-colors" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-14 pl-12 pr-4 bg-transparent border border-white/10 rounded-[16px] text-white text-[15px] focus:outline-none focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10 transition-all placeholder:text-zinc-600"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-gradient-to-r from-violet-600 to-blue-600 rounded-[16px] text-white text-[15px] font-bold shadow-[0_8px_30px_rgba(124,58,237,0.3)] hover:shadow-[0_12px_40px_rgba(124,58,237,0.4)] hover:-translate-y-[2px] active:translate-y-[0] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none group"
            >
              <div className="flex items-center justify-center gap-3">
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white/80" />
                ) : (
                  <>
                    <span>Entrar al Ecosistema</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
            </button>
          </form>
        </div>

        {/* Footer Info */}
        <div className="mt-10 flex flex-col items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/5 rounded-full">
            <ShieldCheck className="w-4 h-4 text-violet-400" />
            <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest">Servidor de Datos Seguro</span>
          </div>
          
          <div className="text-center space-y-1">
            <p className="text-zinc-500 text-[12px] font-medium">
              &copy; {new Date().getFullYear()} Algoritmia Desarrollos
            </p>
            <p className="text-zinc-700 text-[10px] font-bold uppercase tracking-tighter">
              Captación • Atención • Retención • V1.4.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
