import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { ChevronRight, ChevronLeft, X, Zap } from 'lucide-react';

interface WelcomeGuideProps {
  profile: any;
}

const BASE_STEPS = [
  {
    targetId: 'tour-integraciones',
    emoji: '⚡',
    title: 'Primero: conectá tus APIs',
    desc: 'Para ver datos reales, conectá tu tienda online (Shopify, Tiendanube), Meta Ads y mensajería en Integraciones. Son los pasos que activan todo el poder de Algoritmia.',
    isFinal: false,
  },
  {
    targetId: 'tour-dashboard',
    emoji: '📊',
    title: 'Dashboard unificado',
    desc: 'Todo tu negocio en una sola pantalla. Métricas de ventas, pedidos, campañas publicitarias y comportamiento de clientes — actualizados en tiempo real.',
    isFinal: false,
  },
  {
    targetId: 'tour-perfil',
    emoji: '👤',
    title: 'Mi Perfil',
    desc: 'Configurá tu cuenta, preferencias y opciones de acceso. Desde aquí también podés gestionar el acceso de colaboradores.',
    isFinal: true,
    ctaPath: '/integraciones',
    ctaLabel: 'Ir a Integraciones',
  },
];

const META_STEPS = [
  {
    targetId: 'tour-creativos',
    emoji: '📣',
    title: 'Creativos y Meta Ads',
    desc: 'Controlá el rendimiento de cada pieza publicitaria. ROAS exacto, CTR y gasto real por creativo en un solo panel.',
    isFinal: false,
  },
  {
    targetId: 'tour-comentarios',
    emoji: '💭',
    title: 'Comentarios',
    desc: 'Moderá comentarios de tus publicaciones orgánicas y anuncios. Respondé con IA y canalizá consultas hacia la venta.',
    isFinal: true,
    ctaPath: '/comentarios',
    ctaLabel: 'Ir a Comentarios',
  },
];

const MESSAGING_STEPS = [
  {
    targetId: 'tour-mensajeria',
    emoji: '💬',
    title: 'Mensajería omnicanal',
    desc: 'Con Chatwoot conectado, tus conversaciones de WhatsApp, Instagram, Facebook y chat web viven en una misma bandeja con respuestas asistidas por IA.',
    isFinal: true,
    ctaPath: '/mensajeria',
    ctaLabel: 'Ir a Mensajería',
  },
];

const ECOM_STEPS = [
  {
    targetId: 'tour-pedidos',
    emoji: '📦',
    title: 'Pedidos en tiempo real',
    desc: 'Seguimiento de cada venta y estado de envío desde todas tus tiendas conectadas en una sola vista.',
    isFinal: false,
  },
  {
    targetId: 'tour-inventario',
    emoji: '🗃️',
    title: 'Inventario sincronizado',
    desc: 'Stock actualizado automáticamente en todas tus tiendas. Nunca más quiebres inesperados ni ventas sin stock.',
    isFinal: true,
    ctaPath: '/pedidos',
    ctaLabel: 'Ver Pedidos',
  },
];

function getIntegrationGroups(profile: any): string[] {
  const groups: string[] = [];
  const hasMessaging = !!(profile.chatwoot_url && profile.chatwoot_token);
  const hasMeta = !!(
    (profile as any).meta_access_token ||
    profile.fb_page_id ||
    profile.ig_business_id
  );
  const hasEcom = !!(
    profile.shopify_domain ||
    (profile as any).tiendanube_store_id ||
    (profile as any).woocommerce_url
  );
  if (hasMessaging) groups.push('messaging');
  if (hasMeta) groups.push('meta');
  if (hasEcom) groups.push('ec');
  return groups;
}

function getStepsForKey(key: string) {
  if (key === 'base') return BASE_STEPS;
  if (key === 'messaging') return MESSAGING_STEPS;
  if (key === 'meta') return META_STEPS;
  if (key === 'ec') return ECOM_STEPS;
  return [];
}

export const WelcomeGuide: React.FC<WelcomeGuideProps> = ({ profile }) => {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tourKey, setTourKey] = useState<string>('');

  const doneKey = `ag_tour_${profile?.id}_${tourKey}`;

  useEffect(() => {
    if (!profile?.id) return;
    try {
      const groups = getIntegrationGroups(profile);
      const nextKey = groups.length === 0
        ? 'base'
        : groups.find(group => !localStorage.getItem(`ag_tour_${profile.id}_${group}`));

      if (!nextKey) {
        setVisible(false);
        setTourKey('');
        return;
      }
      setTourKey(nextKey);
      setStep(0);
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, [
    profile?.id,
    profile?.shopify_domain,
    profile?.fb_page_id,
    profile?.ig_business_id,
    profile?.chatwoot_url,
    profile?.chatwoot_token,
    (profile as any)?.meta_access_token,
    (profile as any)?.tiendanube_store_id,
    (profile as any)?.woocommerce_url,
  ]);

  const TOUR_STEPS = getStepsForKey(tourKey);

  // Spotlight: position around current step's target element
  useEffect(() => {
    if (!visible) return;
    const current = TOUR_STEPS[step];
    if (!current) return;
    const el = document.getElementById(current.targetId);
    if (!el) { setRect(null); return; }

    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [visible, step, TOUR_STEPS]);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(doneKey, 'done'); } catch { /* ignore */ }
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1);
    else dismiss();
  };

  const prev = () => { if (step > 0) setStep(s => s - 1); };

  if (!visible || !profile || TOUR_STEPS.length === 0) return null;

  const current = TOUR_STEPS[step];
  if (!current) return null;
  const GUTTER = 6;

  return (
    <>
      {/* Spotlight box-shadow overlay */}
      {rect && (
        <div
          className="fixed z-[9991] rounded-xl pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - GUTTER,
            left: rect.left - GUTTER,
            width: rect.width + GUTTER * 2,
            height: rect.height + GUTTER * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
            border: '2px solid rgba(139, 92, 246, 0.8)',
          }}
        />
      )}
      {!rect && (
        <div className="fixed inset-0 z-[9991] pointer-events-none bg-black/65" />
      )}

      {/* Click-away trap */}
      <div className="fixed inset-0 z-[9992] cursor-default" onClick={dismiss} />

      {/* Tooltip — fixed bottom-right, never clipped */}
      <div
        onClick={e => e.stopPropagation()}
        className={`fixed z-[9993] bottom-6 right-6 w-[300px] rounded-2xl border shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-250 ${
          darkMode
            ? 'bg-[#0d0d18] border-violet-500/30 text-white'
            : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Progress bar */}
        <div className={`h-[3px] rounded-t-2xl overflow-hidden ${darkMode ? 'bg-white/5' : 'bg-zinc-100'}`}>
          <div
            className="h-full bg-violet-500 transition-all duration-300"
            style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <span className={`text-[9px] font-black uppercase tracking-[0.18em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
              {step + 1} / {TOUR_STEPS.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={dismiss}
                className={`text-[9px] font-bold underline transition-colors ${darkMode ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-300 hover:text-zinc-500'}`}
              >
                Saltar todo
              </button>
              <button
                onClick={dismiss}
                className={`p-1 rounded-lg transition-colors ${darkMode ? 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5' : 'text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100'}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
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
                  onClick={() => { dismiss(); if (current.ctaPath) navigate(current.ctaPath); }}
                  className="w-full h-8 flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-[11px] font-black transition-all shadow-lg shadow-violet-200 dark:shadow-none"
                >
                  <Zap className="w-3 h-3" /> {current.ctaLabel || 'Continuar'}
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
    </>
  );
};
