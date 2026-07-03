import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Loader2, RefreshCw, ArrowUpRight, X } from 'lucide-react';
import { supabase } from '../services/supabase';

// ── Analista IA ───────────────────────────────────────────────────────────────
// Resumen ejecutivo diario con acciones concretas, generado con los datos que el
// dashboard ya tiene cargados (ventas, neto real, pauta, costos, atribución).
// Se genera 1 vez por día por cliente; el cache vive en localStorage.

type BriefAction = { emoji: string; title: string; detail: string; section: string };
type Brief = { headline: string; summary: string; actions: BriefAction[] };

const SECTION_ROUTES: Record<string, string> = {
  creativos: '/admin/meta',
  ads: '/captacion',
  costos: '/costos',
  pedidos: '/pedidos',
  email: '/retencion',
  inventario: '/inventario',
};

const todayAR = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

export default function DailyBriefCard({ clientId, ready, signals }: { clientId?: string; ready: boolean; signals: any }) {
  const navigate = useNavigate();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const requestedRef = useRef<string | null>(null);
  const signalsRef = useRef<any>(signals);
  signalsRef.current = signals;
  const cacheKey = clientId ? `car_daily_brief_v1_${clientId}_${todayAR()}` : null;

  const generate = async (force = false) => {
    if (!clientId || !cacheKey) return;
    if (!force) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) { setBrief(JSON.parse(raw)); return; }
      } catch { /* cache corrupto: regenerar */ }
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId, type: 'daily-brief', signals: signalsRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.brief?.headline) {
        setBrief(data.brief);
        try { localStorage.setItem(cacheKey, JSON.stringify(data.brief)); } catch { /* storage lleno */ }
      }
    } catch (err) {
      console.error('[Analista IA] error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || !clientId) return;
    const key = `${clientId}_${todayAR()}`;
    if (requestedRef.current === key) return;
    requestedRef.current = key;
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, clientId]);

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(`car_brief_hide_${clientId}`) === '1'); } catch { /* ignore */ }
  }, [clientId]);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(`car_brief_hide_${clientId}`, '1'); } catch { /* ignore */ }
  };

  if (dismissed || (!brief && !loading)) return null;

  return (
    <div className="mb-6 rounded-2xl border border-violet-200/60 dark:border-violet-800/30 bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/50 dark:from-violet-950/30 dark:via-zinc-900/60 dark:to-fuchsia-950/20 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <p className="text-[9.5px] font-black uppercase tracking-[0.18em] text-violet-500">Analista IA · resumen del período</p>
              {loading && !brief ? (
                <p className="text-[13px] font-bold text-zinc-400 mt-0.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Leyendo tus números...
                </p>
              ) : (
                <h3 className="text-[15px] font-black text-zinc-900 dark:text-white leading-snug mt-0.5">{brief?.headline}</h3>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => generate(true)}
              disabled={loading}
              title="Regenerar análisis"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-violet-500 hover:bg-violet-500/10 transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={dismiss} title="Ocultar por hoy" className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-500/10 transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {brief && (
          <>
            <p className="text-[12.5px] font-medium text-zinc-600 dark:text-zinc-300 leading-relaxed mb-3 ml-[42px]">{brief.summary}</p>
            {brief.actions.length > 0 && (
              <div className="ml-[42px] space-y-2">
                {brief.actions.map((a, i) => {
                  const route = SECTION_ROUTES[a.section];
                  return (
                    <button
                      key={i}
                      onClick={() => route && navigate(route)}
                      disabled={!route}
                      className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        route
                          ? 'bg-white/80 dark:bg-zinc-900/60 border-violet-100 dark:border-violet-900/30 hover:border-violet-300 dark:hover:border-violet-700/50 hover:shadow-sm cursor-pointer'
                          : 'bg-white/60 dark:bg-zinc-900/40 border-zinc-100 dark:border-zinc-800/60 cursor-default'
                      }`}
                    >
                      <span className="text-[15px] leading-none mt-0.5 shrink-0">{a.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-[12.5px] font-black text-zinc-800 dark:text-zinc-100 block leading-snug">{a.title}</span>
                        <span className="text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400 block leading-snug mt-0.5">{a.detail}</span>
                      </span>
                      {route && <ArrowUpRight className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-1" />}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
