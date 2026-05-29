import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import { Loader2, Moon, Sun, EyeOff, Eye } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const toAuthEmail = (input: string) =>
  input.includes('@') ? input.trim() : `${input.trim().toLowerCase()}@car.algoritmia.com`;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${darkMode ? 'bg-[#0a0a0a] text-white' : 'bg-[#f5f5f7] text-zinc-900'}`}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 w-full relative z-10">
        <div className="flex items-center gap-3">
          <img 
            src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} 
            alt="Algoritmia" 
            className="w-8 h-8 object-contain drop-shadow-sm"
          />
          <div className="flex flex-col">
            <span className={`text-[15px] font-black tracking-tighter leading-none uppercase ${darkMode ? 'text-white' : 'text-zinc-900'}`}>ALGORITMIA</span>
            <span className="text-[10px] font-bold text-zinc-500 tracking-[0.2em] mt-0.5 uppercase">Gestión</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleDarkMode}
            className={`flex items-center justify-center w-9 h-9 rounded-xl border shadow-sm transition-all duration-300 ${
              darkMode 
                ? 'bg-[#111] border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800' 
                : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
            title="Cambiar apariencia"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-20 relative z-10">
        <div className="w-full max-w-[360px]">
          <div className="mb-10 text-center">
            <h1 className={`text-[24px] font-bold mb-2 tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              Iniciar Sesión
            </h1>
            <p className={`text-[14px] font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Accede al ecosistema Algoritmia.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-3">
              <input
                type="text"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email o usuario"
                autoCapitalize="none"
                autoCorrect="off"
                className={`w-full h-11 px-4 rounded-xl border text-[16px] md:text-[14px] font-medium outline-none transition-all duration-200 ${
                  darkMode 
                    ? 'bg-[#111] border-white/10 text-white placeholder:text-zinc-600 focus:border-white/20 focus:bg-[#161618]' 
                    : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-zinc-50'
                }`}
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  className={`w-full h-11 pl-4 pr-11 rounded-xl border text-[16px] md:text-[14px] font-medium outline-none transition-all duration-200 ${
                    darkMode 
                      ? 'bg-[#111] border-white/10 text-white placeholder:text-zinc-600 focus:border-white/20 focus:bg-[#161618]' 
                      : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-zinc-50'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors p-1 ${darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full h-11 flex items-center justify-center rounded-xl text-[14px] font-bold tracking-wide transition-all duration-200 shadow-sm disabled:opacity-50 disabled:pointer-events-none ${
                darkMode 
                  ? 'bg-white text-black hover:bg-zinc-200' 
                  : 'bg-zinc-900 text-white hover:bg-black'
              }`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar'}
            </button>
            
            <div className="flex justify-center pt-3">
              <a 
                href="https://wa.me/5493476245523?text=Hola,%20necesito%20ayuda%20para%20recuperar%20mi%20contrase%C3%B1a%20del%20sistema%20Algoritmia." 
                target="_blank" 
                rel="noopener noreferrer"
                className={`text-[12px] font-medium transition-colors hover:underline ${darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
