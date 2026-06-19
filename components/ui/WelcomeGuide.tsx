import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, X } from 'lucide-react';

interface WelcomeGuideProps {
  profile: any;
}

type FeatureKey = 'meta' | 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'publisher' | 'creative';

interface FeatureAnnouncement {
  key: FeatureKey;
  targetId: string;
  title: string;
  desc: string;
  ctaPath: string;
  ctaLabel: string;
}

const FEATURE_COPY: Record<FeatureKey, Omit<FeatureAnnouncement, 'key'>> = {
  meta: {
    targetId: 'tour-meta-ads',
    title: 'Meta Ads listo',
    desc: 'Ya podés ver campañas, anuncios y creativos publicitarios de la cuenta conectada.',
    ctaPath: '/captacion',
    ctaLabel: 'Ver Meta Ads',
  },
  instagram: {
    targetId: 'tour-redes-sociales',
    title: 'Instagram conectado',
    desc: 'Se activan posts orgánicos, comentarios, métricas y publicación desde el Publicador.',
    ctaPath: '/redes-sociales',
    ctaLabel: 'Ver Instagram',
  },
  facebook: {
    targetId: 'tour-redes-sociales',
    title: 'Facebook conectado',
    desc: 'Se activan página, comentarios, publicaciones orgánicas y publicación desde el Publicador.',
    ctaPath: '/redes-sociales',
    ctaLabel: 'Ver Facebook',
  },
  tiktok: {
    targetId: 'tour-publicador',
    title: 'TikTok orgánico conectado',
    desc: 'Ya podés enviar videos al flujo orgánico de TikTok desde el Publicador.',
    ctaPath: '/publicador',
    ctaLabel: 'Ir al Publicador',
  },
  youtube: {
    targetId: 'tour-publicador',
    title: 'YouTube Shorts conectado',
    desc: 'Ya podés traer Shorts al análisis creativo y publicar videos desde el Publicador.',
    ctaPath: '/publicador',
    ctaLabel: 'Publicar Short',
  },
  publisher: {
    targetId: 'tour-publicador',
    title: 'Publicador activado',
    desc: 'Subí un video una sola vez, confirmá las cuentas exactas y programá por canal.',
    ctaPath: '/publicador',
    ctaLabel: 'Abrir Publicador',
  },
  creative: {
    targetId: 'tour-analisis-creativo',
    title: 'Análisis creativo disponible',
    desc: 'Podés analizar archivos o traer creativos desde tus cuentas conectadas.',
    ctaPath: '/analisis-creativo',
    ctaLabel: 'Analizar creativo',
  },
};

const getEnabledFeatures = (profile: any): FeatureKey[] => {
  if (!profile?.id) return [];
  const features = new Set<FeatureKey>();
  if (profile.meta_account_id) features.add('meta');
  if (profile.ig_business_id) {
    features.add('instagram');
    features.add('publisher');
    features.add('creative');
  }
  if (profile.fb_page_id) {
    features.add('facebook');
    features.add('publisher');
    features.add('creative');
  }
  if (profile.tiktok_content_access_token) {
    features.add('tiktok');
    features.add('publisher');
  }
  if (profile.youtube_access_token || profile.youtube_channel_id) {
    features.add('youtube');
    features.add('publisher');
    features.add('creative');
  }
  return Array.from(features);
};

export const WelcomeGuide: React.FC<WelcomeGuideProps> = ({ profile }) => {
  const navigate = useNavigate();
  const enabledFeatures = useMemo(() => getEnabledFeatures(profile), [profile]);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [features, setFeatures] = useState<FeatureAnnouncement[]>([]);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    const seenKey = `ag_seen_features_${profile.id}`;
    const current = enabledFeatures;

    try {
      const storedRaw = localStorage.getItem(seenKey);
      if (!storedRaw) {
        localStorage.setItem(seenKey, JSON.stringify(current));
        return;
      }

      const seen = new Set<string>(JSON.parse(storedRaw));
      const newlyEnabled = current.filter(key => !seen.has(key));
      localStorage.setItem(seenKey, JSON.stringify(current));

      if (newlyEnabled.length === 0) {
        setVisible(false);
        setFeatures([]);
        return;
      }

      setFeatures(newlyEnabled.map(key => ({ key, ...FEATURE_COPY[key] })));
      setIndex(0);
      const timer = window.setTimeout(() => setVisible(true), 500);
      return () => window.clearTimeout(timer);
    } catch {
      try { localStorage.setItem(seenKey, JSON.stringify(current)); } catch { /* ignore */ }
    }
  }, [profile?.id, enabledFeatures.join('|')]);

  const current = features[index];

  useEffect(() => {
    if (!visible || !current) return;
    const target = document.getElementById(current.targetId);
    if (!target) {
      setRect(null);
      return;
    }

    const update = () => setRect(target.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [visible, current]);

  const close = () => {
    setVisible(false);
    setFeatures([]);
  };

  const next = () => {
    if (index < features.length - 1) setIndex(value => value + 1);
    else close();
  };

  if (!visible || !current) return null;

  return (
    <>
      <div className="fixed inset-0 z-[9980] bg-zinc-950/70 backdrop-blur-[2px]" />
      {rect && (
        <div
          className="fixed z-[9981] rounded-xl pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - 7,
            left: rect.left - 7,
            width: rect.width + 14,
            height: rect.height + 14,
            boxShadow: '0 0 0 9999px rgba(9,9,11,0.30), 0 0 0 2px rgba(139,92,246,0.95), 0 18px 44px rgba(139,92,246,0.35)',
          }}
        />
      )}
      <div className="fixed inset-0 z-[9982] flex items-center justify-center p-4">
        <div className="w-full max-w-[500px] rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-2xl overflow-hidden">
          <div className="h-1 bg-zinc-100 dark:bg-white/5">
            <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${((index + 1) / features.length) * 100}%` }} />
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="w-11 h-11 rounded-2xl bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={close}
                className="w-8 h-8 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 flex items-center justify-center"
                aria-label="Cerrar novedades"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">
              Nuevo apartado activado · {index + 1}/{features.length}
            </p>
            <h2 className="mt-2 text-[24px] sm:text-[28px] font-black tracking-tight text-zinc-950 dark:text-white">
              {current.title}
            </h2>
            <p className="mt-3 text-[14px] font-semibold leading-relaxed text-zinc-500 dark:text-zinc-400">
              {current.desc}
            </p>
          </div>

          <div className="px-5 sm:px-6 py-4 bg-zinc-50 dark:bg-zinc-950/30 border-t border-zinc-100 dark:border-white/10 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={next}
              className="h-11 px-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-[13px] font-black text-zinc-600 dark:text-zinc-200"
            >
              {index < features.length - 1 ? 'Siguiente' : 'Cerrar'}
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                navigate(current.ctaPath);
              }}
              className="h-11 px-5 rounded-xl bg-zinc-950 dark:bg-violet-600 text-white text-[13px] font-black flex items-center justify-center gap-2"
            >
              {current.ctaLabel}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
