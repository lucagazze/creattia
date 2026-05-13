import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import { Loader2, Moon, Sun, EyeOff, Eye } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

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
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-500 relative overflow-hidden ${darkMode ? 'bg-[#09090b] text-white' : 'bg-[#f8fafc] text-zinc-900'}`}>
      {/* Ambient background glow */}
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[400px] rounded-full blur-[120px] pointer-events-none transition-opacity duration-1000 ${darkMode ? 'bg-violet-600/15' : 'bg-violet-400/10'}`} />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 w-full relative z-10">
        <div className="flex items-center gap-2">
          <img 
            src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} 
            alt="Algoritmia" 
            className="h-[24px] w-auto object-contain drop-shadow-sm"
          />
          <span className={`text-[17px] font-bold tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>algoritmia</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleDarkMode}
            className={`flex items-center justify-center w-[38px] h-[38px] rounded-xl border shadow-sm transition-all duration-300 ${
              darkMode 
                ? 'bg-[#18181b] border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-white/20' 
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-300'
            }`}
            title="Cambiar apariencia"
          >
            {darkMode ? <Sun className="w-[16px] h-[16px] text-amber-400" /> : <Moon className="w-[16px] h-[16px]" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-20 relative z-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-10">
            <h1 className={`text-[28px] font-bold mb-2 tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              ¡Comenzá ahora!
            </h1>
            <p className={`text-[15px] font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Ingresá con tu correo electrónico.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                className={`w-full h-12 px-4 rounded-[12px] border text-[14.5px] outline-none transition-all duration-300 ${
                  darkMode 
                    ? 'bg-[#18181b]/50 border-white/10 text-white placeholder:text-zinc-600 focus:bg-[#18181b] focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10' 
                    : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10'
                }`}
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  className={`w-full h-12 pl-4 pr-12 rounded-[12px] border text-[14.5px] outline-none transition-all duration-300 ${
                    darkMode 
                      ? 'bg-[#18181b]/50 border-white/10 text-white placeholder:text-zinc-600 focus:bg-[#18181b] focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10' 
                      : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/10'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-4 top-1/2 -translate-y-1/2 transition-colors ${darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  {showPassword ? <Eye className="w-[18px] h-[18px]" /> : <EyeOff className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 flex items-center justify-center rounded-[12px] bg-violet-600 text-white text-[15px] font-bold tracking-wide hover:bg-violet-500 active:scale-[0.98] transition-all duration-300 shadow-[0_0_20px_rgba(124,58,237,0.15)] hover:shadow-[0_0_25px_rgba(124,58,237,0.3)] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? <Loader2 className="w-[20px] h-[20px] animate-spin" /> : 'Entrar al ecosistema'}
            </button>
            
            <div className="flex justify-center pt-2">
              <a 
                href="https://wa.me/5493476245523?text=Hola,%20necesito%20ayuda%20para%20recuperar%20mi%20contrase%C3%B1a%20del%20sistema%20Algoritmia." 
                target="_blank" 
                rel="noopener noreferrer"
                className={`text-[13.5px] font-medium transition-colors hover:underline ${darkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
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
