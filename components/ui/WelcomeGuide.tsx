import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { Check, X, ChevronRight, Zap } from 'lucide-react';

interface WelcomeGuideProps {
  profile: any;
}

export const WelcomeGuide: React.FC<WelcomeGuideProps> = ({ profile }) => {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const storageKey = `ag_guide_${profile?.id}`;

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === 'done') setDismissed(true);
    } catch {}
  }, [storageKey]);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(storageKey, 'done'); } catch {}
  };

  const steps = [
    {
      id: 'profile',
      emoji: '🏢',
      label: 'Perfil del negocio',
      desc: 'Nombre, industria y descripción de tu empresa',
      done: !!(profile?.business_name && profile.business_name.length > 3 && !profile.business_name.includes('@')),
      path: '/perfil',
    },
    {
      id: 'store',
      emoji: '🛒',
      label: 'Tienda online',
      desc: 'Shopify, Tiendanube, WooCommerce o Mercado Libre',
      done: !!(profile?.ecommerce_platform),
      path: '/integraciones',
    },
    {
      id: 'meta',
      emoji: '📣',
      label: 'Meta Ads',
      desc: 'Facebook e Instagram — campañas y análisis',
      done: !!(profile?.meta_account_id),
      path: '/integraciones',
    },
    {
      id: 'chat',
      emoji: '💬',
      label: 'Mensajería unificada',
      desc: 'WhatsApp, Instagram DM, Facebook Messenger',
      done: !!(profile?.chatwoot_token),
      path: '/integraciones',
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;

  if (dismissed || allDone) return null;

  const progress = (doneCount / steps.length) * 100;
  const nextStep = steps.find(s => !s.done);

  return (
    <div className={`mb-6 rounded-2xl border relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500 ${
      darkMode ? 'bg-[#0d0d18] border-violet-500/20' : 'bg-gradient-to-br from-violet-50/60 to-white border-violet-200/60'
    }`}>
      {/* Progress bar */}
      <div className={`h-0.5 ${darkMode ? 'bg-white/5' : 'bg-violet-100'}`}>
        <div
          className="h-full bg-violet-500 transition-all duration-700 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-violet-500" />
              </div>
              <h3 className={`text-[13px] font-black tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                ¡Bienvenido! Configurá tu cuenta en 4 pasos
              </h3>
            </div>
            <p className={`text-[10.5px] font-medium ml-8 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {doneCount === 0
                ? 'Conectá tus canales para ver datos reales en el dashboard'
                : `${doneCount} de ${steps.length} pasos completados — ¡vas muy bien!`}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            title="Cerrar guía"
            className={`p-1 rounded-lg transition-all flex-shrink-0 ${darkMode ? 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {steps.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => navigate(step.path)}
              className={`text-left p-3 rounded-xl border transition-all group relative ${
                step.done
                  ? (darkMode
                      ? 'bg-emerald-950/20 border-emerald-500/20'
                      : 'bg-emerald-50/70 border-emerald-200/60')
                  : (darkMode
                      ? 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05] hover:border-violet-500/30'
                      : 'bg-white border-zinc-200/60 hover:border-violet-300/80 hover:shadow-sm')
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[16px] leading-none">{step.emoji}</span>
                {step.done ? (
                  <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    darkMode ? 'border-zinc-700 group-hover:border-violet-500' : 'border-zinc-200 group-hover:border-violet-400'
                  }`}>
                    <span className={`text-[8px] font-black ${darkMode ? 'text-zinc-600 group-hover:text-violet-400' : 'text-zinc-400 group-hover:text-violet-500'}`}>{idx + 1}</span>
                  </div>
                )}
              </div>
              <p className={`text-[10.5px] font-bold leading-snug ${
                step.done
                  ? (darkMode ? 'text-zinc-500' : 'text-zinc-400')
                  : (darkMode ? 'text-zinc-200' : 'text-zinc-700')
              }`}>
                {step.label}
              </p>
              <p className={`text-[9.5px] mt-0.5 font-medium leading-snug ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {step.desc}
              </p>
              {!step.done && (
                <ChevronRight className={`w-3 h-3 absolute bottom-2.5 right-2.5 transition-all ${darkMode ? 'text-zinc-700 group-hover:text-violet-500 group-hover:translate-x-0.5' : 'text-zinc-300 group-hover:text-violet-400 group-hover:translate-x-0.5'}`} />
              )}
            </button>
          ))}
        </div>

        {/* CTA */}
        {nextStep && (
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/[0.04] flex items-center justify-between">
            <button
              onClick={() => navigate(nextStep.path)}
              className="text-[11px] font-black text-violet-500 hover:text-violet-400 flex items-center gap-1 transition-colors"
            >
              Siguiente: {nextStep.label} <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDismiss}
              className={`text-[10px] font-medium transition-colors ${darkMode ? 'text-zinc-700 hover:text-zinc-500' : 'text-zinc-300 hover:text-zinc-400'}`}
            >
              Explorar primero
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
