import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useTheme } from '../contexts/ThemeContext';

export function useAIGate() {
  const [pendingFn, setPendingFn] = useState<null | (() => void)>(null);
  const { profile } = useAuth();
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  const activeProfile = isViewingAs ? viewAsProfile : profile;
  const isReady = !!(activeProfile?.business_description || activeProfile?.scraped_content);

  const gate = useCallback((fn: () => void) => {
    if (isReady) { fn(); return; }
    setPendingFn(() => fn);
  }, [isReady]);

  const dismiss = () => setPendingFn(null);

  const handleContinue = () => {
    const fn = pendingFn;
    setPendingFn(null);
    fn?.();
  };

  const handleGoToCerebro = () => {
    setPendingFn(null);
    navigate('/cerebro');
  };

  const AIGate = pendingFn !== null ? (
    <div className="fixed inset-0 z-[950] flex min-h-[100dvh] w-screen items-center justify-center p-4" onClick={dismiss}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${
          darkMode
            ? 'bg-zinc-900 border-white/10 text-white'
            : 'bg-white border-zinc-200 text-zinc-900 shadow-zinc-900/10'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          className={`absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            darkMode
              ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          <X className="w-4 h-4" />
        </button>

        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
          darkMode ? 'bg-white/5 border border-white/10' : 'bg-zinc-100 border border-zinc-200'
        }`}>
          <Brain className="w-5 h-5 text-violet-400" />
        </div>

        <h3 className={`text-[15px] font-bold mb-2 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
          Cerebro de IA sin configurar
        </h3>
        <p className={`text-[13px] leading-relaxed mb-5 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Para que la IA funcione de forma personalizada, configurá primero el Cerebro con información de tu negocio.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleGoToCerebro}
            className={`h-9 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-2 ${
              darkMode
                ? 'bg-white text-zinc-900 hover:bg-zinc-100'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            Configurar Cerebro
          </button>
          <button
            onClick={handleContinue}
            className={`h-9 rounded-xl text-[12px] font-semibold transition-all flex items-center justify-center gap-2 ${
              darkMode
                ? 'bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                : 'bg-zinc-50 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            Continuar de todas formas
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { gate, isReady, AIGate };
}
