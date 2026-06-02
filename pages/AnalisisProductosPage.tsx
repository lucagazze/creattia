import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { ecommerce } from '../services/ecommerce';
import {
  Package, Search, RefreshCw, Loader2, ChevronRight,
  CheckCircle, AlertCircle, XCircle, TrendingUp, X
} from 'lucide-react';

// ── Score types ────────────────────────────────────────────────────────────────
type Score = 'pass' | 'warn' | 'fail';

const scoreEP  = (v: number): Score => v >= 50 ? 'pass' : v >= 25 ? 'warn' : 'fail';
const scoreSP  = (v: number): Score => v >= 40 ? 'pass' : v >= 20 ? 'warn' : 'fail';
const scoreRD  = (v: number): Score => v === 0 ? 'fail' : v <= 15 ? 'pass' : v <= 45 ? 'warn' : 'fail';
const totalScore = (p: any) => [scoreEP(p.entryPointPct), scoreSP(p.secondPurchasePct), scoreRD(p.repurchaseDays)].filter(s => s === 'pass').length;

const TotalBadge: React.FC<{ score: number }> = ({ score }) => {
  const map: Record<number, { label: string; cls: string }> = {
    3: { label: 'Héroe',     cls: 'bg-emerald-500 text-white' },
    2: { label: 'Candidato', cls: 'bg-blue-500 text-white' },
    1: { label: 'Potencial', cls: 'bg-amber-500 text-white' },
    0: { label: 'Débil',     cls: 'bg-zinc-400 dark:bg-zinc-600 text-white' },
  };
  const { label, cls } = map[score] ?? map[0];
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{score}/3 · {label}</span>;
};

export default function AnalisisProductosPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [productAnalysis, setProductAnalysis] = useState<any[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [modalProduct, setModalProduct] = useState<any>(null);
  const [productCacheDate, setProductCacheDate] = useState<Date | null>(null);

  const p = profile as any;

  const saveAnalysisToDB = async (results: any[], clientId: string) => {
    try {
      await fetch('/api/scrape-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'save-analysis', clientId, data: results }),
      });
    } catch { }
  };

  const loadProductAnalysis = async (forceRefresh = false) => {
    if (!p?.shopify_domain || !p?.shopify_access_token) return;
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(`pa:${p.shopify_domain}`);
        if (raw) {
          const { data, ts } = JSON.parse(raw) as { data: any[]; ts: number };
          setProductAnalysis(data);
          setProductCacheDate(new Date(ts));
          return;
        }
      } catch { }
      try {
        const dbRes = await fetch('/api/scrape-all', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'load-analysis', clientId: p.id }),
        });
        if (dbRes.ok) {
          const dbData = await dbRes.json();
          if (dbData.found && dbData.results?.length) {
            setProductAnalysis(dbData.results);
            const calcDate = new Date(dbData.calculated_at);
            setProductCacheDate(calcDate);
            try { localStorage.setItem(`pa:${p.shopify_domain}`, JSON.stringify({ data: dbData.results, ts: calcDate.getTime() })); } catch { }
            return;
          }
        }
      } catch { }
    }
    setProductLoading(true);
    setProductError(null);
    try {
      const results = await ecommerce.analyzeProducts(p.shopify_domain, p.shopify_access_token, forceRefresh);
      setProductAnalysis(results);
      const now = new Date();
      setProductCacheDate(now);
      try { localStorage.setItem(`pa:${p.shopify_domain}`, JSON.stringify({ data: results, ts: now.getTime() })); } catch { }
      if (p.id) saveAnalysisToDB(results, p.id);
    } catch (err: any) {
      setProductError(err.message || 'Error al analizar productos');
    } finally {
      setProductLoading(false);
    }
  };

  useEffect(() => { loadProductAnalysis(false); }, [p?.id]);

  const badgeCls = (s: Score | string) =>
    s === 'pass' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
    s === 'warn' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' :
    'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400';

  return (
    <div className="w-full pt-4 pb-20 md:pt-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-pink-500" />
          </div>
          <div>
            <h1 className="text-[20px] font-black text-zinc-900 dark:text-white tracking-tight">Análisis de Productos</h1>
            <p className="text-[11px] text-zinc-400 font-medium">
              Entry point, tasa de 2ª compra, velocidad de recompra y cross-sell — basado en pedidos reales
              {productCacheDate && ` · calculado el ${productCacheDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {productAnalysis.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Buscar producto..." className="pl-8 pr-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12px] text-zinc-700 dark:text-zinc-300 outline-none focus:border-pink-400 w-48 transition-all" />
            </div>
          )}
          <button onClick={() => loadProductAnalysis(true)} disabled={productLoading} title="Recalcular todo" className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${productLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {productLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-pink-100 dark:border-pink-900/30" />
            <div className="absolute inset-0 rounded-full border-4 border-t-pink-500 animate-spin" />
          </div>
          <p className="text-[13px] font-bold text-zinc-600 dark:text-zinc-400">Analizando pedidos de los últimos 2 años...</p>
          <p className="text-[11px] text-zinc-400">Esto puede tardar 30-60 segundos la primera vez</p>
        </div>
      ) : productError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <XCircle className="w-8 h-8 text-red-400" />
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400">{productError}</p>
          <button onClick={() => loadProductAnalysis(true)} className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 text-white rounded-lg text-[12px] font-bold"><RefreshCw className="w-3 h-3" />Reintentar</button>
        </div>
      ) : productAnalysis.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-zinc-400" />
          </div>
          <p className="text-[14px] font-semibold text-zinc-600 dark:text-zinc-400">Análisis de productos</p>
          <p className="text-[12px] text-zinc-400 max-w-xs">Analiza todos los pedidos de la tienda para encontrar qué productos traen más clientes nuevos y cuáles generan recompra.</p>
          <button onClick={() => loadProductAnalysis(true)} className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-[13px] font-bold shadow-md shadow-pink-200 dark:shadow-none transition-all">
            <TrendingUp className="w-4 h-4" />Analizar Productos
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Productos analizados', value: productAnalysis.length, color: 'text-zinc-900 dark:text-white' },
              { label: 'Pedidos totales', value: productAnalysis.reduce((s, p) => s + p.totalOrders, 0).toLocaleString(), color: 'text-zinc-900 dark:text-white' },
              { label: 'Héroes (3/3)', value: productAnalysis.filter(p => totalScore(p) === 3).length, color: 'text-emerald-600' },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 text-center">
                <p className={`text-[24px] font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-zinc-400 font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Products list */}
          <div className="space-y-2">
            {productAnalysis
              .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
              .map(p => {
                const score = totalScore(p);
                return (
                  <div
                    key={p.name}
                    className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl cursor-pointer hover:border-pink-200 dark:hover:border-pink-900/50 hover:shadow-sm transition-all"
                    onClick={() => setModalProduct(p)}
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${score === 3 ? 'bg-emerald-500' : score === 2 ? 'bg-blue-500' : score === 1 ? 'bg-amber-500' : 'bg-zinc-300'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-bold text-zinc-900 dark:text-white">{p.name}</span>
                        <span className="text-[11px] text-zinc-400 font-medium ml-2">{p.totalOrders} pedidos</span>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeCls(scoreEP(p.entryPointPct))}`}>
                          {p.entryPointPct}% primer pedido
                        </span>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeCls(scoreSP(p.secondPurchasePct))}`}>
                          {p.secondPurchasePct}% vuelven
                        </span>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeCls(scoreRD(p.repurchaseDays))}`}>
                          {p.repurchaseDays > 0 ? `${p.repurchaseDays} días` : 'sin retorno'}
                        </span>
                      </div>
                      <TotalBadge score={score} />
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Product Modal */}
      {modalProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setModalProduct(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl max-w-[680px] w-full flex flex-col max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-black text-zinc-900 dark:text-white">{modalProduct.name}</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">{modalProduct.totalOrders} pedidos · Precio prom: ${modalProduct.avgPrice?.toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2">
                <TotalBadge score={totalScore(modalProduct)} />
                <button onClick={() => setModalProduct(null)} className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Primer Pedido', value: `${modalProduct.entryPointPct}%`, sub: `${modalProduct.firstPurchases} primeras compras`, s: scoreEP(modalProduct.entryPointPct), q: '¿Con qué frecuencia es la primera compra de un cliente nuevo?' },
                  { label: 'Vuelven a Comprar', value: `${modalProduct.secondPurchasePct}%`, sub: 'de quienes lo compraron primero', s: scoreSP(modalProduct.secondPurchasePct), q: '¿Qué tan bien retiene clientes este producto?' },
                  { label: 'Días hasta 2ª Compra', value: modalProduct.repurchaseDays > 0 ? `${modalProduct.repurchaseDays} días` : 'Sin datos', sub: 'promedio', s: scoreRD(modalProduct.repurchaseDays), q: '¿Qué tan rápido vuelve el dinero al negocio?' },
                  { label: 'Ticket del Pedido', value: modalProduct.combinedAOV > 0 ? `$${modalProduct.combinedAOV.toFixed(0)}` : '—', sub: `precio solo: $${modalProduct.avgPrice?.toFixed(0)}`, s: 'neutral', q: '¿Cuánto gasta el cliente en el pedido que contiene este producto?' },
                ].map(m => {
                  const bgMap: Record<string, string> = { pass: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40', warn: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40', fail: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40', neutral: 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700' };
                  const valMap: Record<string, string> = { pass: 'text-emerald-700 dark:text-emerald-300', warn: 'text-amber-700 dark:text-amber-300', fail: 'text-red-700 dark:text-red-400', neutral: 'text-zinc-900 dark:text-white' };
                  return (
                    <div key={m.label} className={`rounded-xl p-3.5 border ${bgMap[m.s]}`}>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1">{m.label}</p>
                      <p className={`text-[22px] font-black leading-none ${valMap[m.s]}`}>{m.value}</p>
                      <p className="text-[10px] text-zinc-500 mt-1">{m.sub}</p>
                      <p className="text-[10px] text-zinc-400 mt-2 leading-snug italic">{m.q}</p>
                    </div>
                  );
                })}
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl p-4">
                <p className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wide mb-2">Qué significa esto</p>
                <p className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {(() => {
                    const fp = modalProduct.firstPurchases || 0;
                    const total = modalProduct.totalOrders || 1;
                    const returned = Math.round((modalProduct.secondPurchasePct / 100) * fp);
                    const days = modalProduct.repurchaseDays;
                    return (
                      <>
                        <strong>{fp} de los {total} pedidos</strong> ({modalProduct.entryPointPct}%) fueron la primera compra del cliente en la tienda.{' '}
                        {fp > 0 && modalProduct.secondPurchasePct > 0
                          ? <><strong>{returned} de esos {fp} clientes</strong> ({modalProduct.secondPurchasePct}%) volvieron a comprar{days > 0 ? `, en promedio a los ${days} días` : ''}.</>
                          : 'Ninguno de esos clientes volvió a comprar en el período analizado.'}
                      </>
                    );
                  })()}
                </p>
              </div>
              {modalProduct.crossSell?.length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wide mb-3">Después compran</p>
                  <div className="flex flex-wrap gap-2">
                    {modalProduct.crossSell.map((cs: any) => (
                      <div key={cs.name} className="flex items-center gap-2 bg-pink-50 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-900/30 rounded-xl px-3 py-2">
                        <ChevronRight className="w-3 h-3 text-pink-400 shrink-0" />
                        <span className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200">{cs.name}</span>
                        <span className="text-[11px] font-black text-pink-600 dark:text-pink-400">{cs.pct}% de clientes</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <strong>Precisión:</strong> Datos 100% reales de tus pedidos de los últimos 2 años. Entry point, tasa de retorno y días son métricas exactas calculadas por email del cliente.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
