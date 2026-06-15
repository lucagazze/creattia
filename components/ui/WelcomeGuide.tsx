import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { ChevronRight, ChevronLeft, X, Zap, ArrowRight } from 'lucide-react';

interface WelcomeGuideProps {
  profile: any;
}

const TOUR_STEPS = [
  {
    targetId: 'tour-dashboard',
    emoji: '📊',
    title: 'Dashboard unificado',
    desc: 'Todo tu negocio en una sola pantalla. Métricas de ventas, pedidos, campañas publicitarias y comportamiento de clientes — actualizados en tiempo real.',
  },
  {
    targetId: 'tour-mensajeria',
    emoji: '💬',
    title: 'Mensajería omnicanal',
    desc: 'Una sola bandeja para Instagram DM, Facebook Messenger y WhatsApp. El Cerebro de IA redacta respuestas perfectas y convierte interacciones en ventas.',
  },
  {
    targetId: 'tour-creativos',
    emoji: '📣',
    title: 'Creativos y Meta Ads',
    desc: 'Controlá el rendimiento de cada pieza publicitaria. ROAS exacto, CTR y gasto real por creativo en un solo panel.',
  },
  {
    targetId: 'tour-inventario',
    emoji: '📦',
    title: 'Inventario en tiempo real',
    desc: 'Stock sincronizado automáticamente en todas tus tiendas conectadas. Nunca más quiebres de stock inesperados.',
  },
  {
    targetId: 'tour-integraciones',
    emoji: '⚡',
    title: '¡Configurá y empezá!',
    desc: 'Para ver datos reales, conectá tu tienda online, Meta Ads y mensajería. Son los 3 pasos que activan todo el poder de Algoritmia.',
    isFinal: true,
    ctaPath: '/integraciones',
    ctaLabel: 'Ir a Integraciones',
  },
];

export const WelcomeGuide: React.FC<WelcomeGuideProps> = ({ profile }) => {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const storageKey = `ag_tour_${profile?.id}`;

  // Show tour once per user
  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) {
        // Small delay so sidebar renders first
        const t = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  // Position spotlight on current step's target element
  useEffect(() => {
    if (!visible) return;
    const current = TOUR_STEPS[step];
    const el = document.getElementById(current.targetId);
    if (!el) { setRect(null); setTooltipPos(null); return; }

    const update = () => {
      const r = el.getBoundingClientRect();
      setRect(r);

      // Position tooltip to the right of target, or below if on right edge
      const PADDING = 12;
      const TIP_W = 280;
      const TIP_H = 180;

      let tLeft = r.right + PADDING;
      let tTop = r.top + r.height / 2 - TIP_H / 2;

      // Clamp within viewport
      if (tLeft + TIP_W > window.innerWidth - PADDING) {
        tLeft = r.left - TIP_W - PADDING;
      }
      if (tLeft < PADDING) tLeft = r.left;
      if (tTop < PADDING) tTop = PADDING;
      if (tTop + TIP_H > window.innerHeight - PADDING) tTop = window.innerHeight - TIP_H - PADDING;

      setTooltipPos({ top: tTop, left: tLeft });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [visible, step]);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(storageKey, 'done'); } catch { /* ignore */ }
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1);
    else dismiss();
  };

  const prev = () => { if (step > 0) setStep(s => s - 1); };

  if (!visible || !profile) return null;

  const current = TOUR_STEPS[step];
  const GUTTER = 8;

  return (
    <>
      {/* Dark overlay with spotlight hole */}
      <div className="fixed inset-0 z-[9990] pointer-events-none" />

      {/* Spotlight: box-shadow trick creates the dark surround + highlighted element border */}
      {rect && (
        <div
          className="fixed z-[9991] rounded-xl pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - GUTTER,
            left: rect.left - GUTTER,
            width: rect.width + GUTTER * 2,
            height: rect.height + GUTTER * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.68)',
            border: '2px solid rgba(139, 92, 246, 0.8)',
          }}
        />
      )}

      {/* Click-away trap (transparent full-screen, behind tooltip) */}
      <div
        className="fixed inset-0 z-[9992] cursor-default"
        onClick={dismiss}
      />

      {/* Tooltip */}
      {tooltipPos && (
        <div
          ref={tipRef}
          onClick={e => e.stopPropagation()}
          className={`fixed z-[9993] w-[280px] rounded-2xl border shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200 ${
            darkMode
              ? 'bg-[#0d0d18] border-violet-500/30 text-white'
              : 'bg-white border-zinc-200 text-zinc-900'
          }`}
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          {/* Progress bar */}
          <div className={`h-[3px] rounded-t-2xl overflow-hidden ${darkMode ? 'bg-white/5' : 'bg-zinc-100'}`}>
            <div
              className="h-full bg-violet-500 transition-all duration-300"
              style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
            />
          </div>

          <div className="p-5">
            {/* Step label */}
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[9px] font-black uppercase tracking-[0.18em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {step + 1} / {TOUR_STEPS.length}
              </span>
              <button
                onClick={dismiss}
                className={`p-1 rounded-lg transition-colors ${darkMode ? 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5' : 'text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100'}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Content */}
            <div className="text-2xl mb-2 leading-none">{current.emoji}</div>
            <h3 className={`text-[15px] font-black mb-2 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              {current.title}
            </h3>
            <p className={`text-[12px] font-medium leading-relaxed mb-4 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {current.desc}
            </p>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={prev}
                  className={`flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-bold border transition-all ${
                    darkMode ? 'border-white/10 text-zinc-400 hover:text-white hover:bg-white/5' : 'border-zinc-200 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="flex-1">
                {current.isFinal ? (
                  <button
                    onClick={() => { dismiss(); navigate(current.ctaPath!); }}
                    className="w-full h-8 flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-[11px] font-black transition-all shadow-lg shadow-violet-200 dark:shadow-none"
                  >
                    <Zap className="w-3 h-3" /> {current.ctaLabel}
                  </button>
                ) : (
                  <button
                    onClick={next}
                    className="w-full h-8 flex items-center justify-center gap-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-[11px] font-black transition-all hover:opacity-90"
                  >
                    Siguiente <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
