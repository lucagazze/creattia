import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { db } from '../services/db';
import { useToast } from '../components/Toast';
import {
  Brain, Globe, Save, RefreshCw, Sparkles, FileText, CheckCircle2,
  ShieldAlert, ArrowUpRight, Instagram, Calendar, ShoppingBag, Package,
  ExternalLink, Search, Tag, Zap, MessageSquare, BookOpen, Loader2,
  ChevronDown, AlertCircle, Info
} from 'lucide-react';
import { AppleLoader } from '../components/ui/AppleLoader';

// ── Textarea field ────────────────────────────────────────────────────────────
const Field = ({ label, hint, placeholder, value, onChange, rows = 4, badge }: {
  label: string; hint: string; placeholder: string; value: string;
  onChange: (v: string) => void; rows?: number; badge?: string;
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-2">
      <label className="text-[11px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">{label}</label>
      {badge && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 uppercase tracking-wide">{badge}</span>}
    </div>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full p-3 text-[13px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-y leading-relaxed font-medium"
    />
    <p className="text-[11px] text-zinc-400 leading-snug">{hint}</p>
  </div>
);

// ── Status pill ───────────────────────────────────────────────────────────────
const Pill = ({ active, label, icon: Icon }: { active: boolean; label: string; icon: any }) => (
  <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg ${active ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-400'}`}>
    <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
    <Icon className="w-3 h-3" />
    {label}
  </div>
);

export default function CerebroPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'identidad' | 'memoria' | 'catalogo'>('identidad');

  // Identidad fields
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [toneInstructions, setToneInstructions] = useState('');
  const [offers, setOffers] = useState('');
  const [faq, setFaq] = useState('');

  // Memory
  const [scrapedContent, setScrapedContent] = useState('');
  const [instagramContext, setInstagramContext] = useState('');
  const [brainUpdatedAt, setBrainUpdatedAt] = useState<string | null>(null);
  const [activeMemTab, setActiveMemTab] = useState<'web' | 'social'>('web');

  // UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [scanStep, setScanStep] = useState('');

  // Products
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setWebsiteUrl((profile as any).website_url || '');
    setBusinessDescription((profile as any).business_description || '');
    setScrapedContent((profile as any).scraped_content || '');
    setInstagramContext((profile as any).instagram_context || '');
    setBrainUpdatedAt((profile as any).brain_updated_at || null);

    // Parse custom_instructions: new format = JSON {tone, offers, faq}, old = plain string
    const rawCI: string = (profile as any).custom_instructions || '';
    try {
      const parsed = JSON.parse(rawCI);
      setToneInstructions(parsed.tone || '');
      setOffers(parsed.offers || '');
      setFaq(parsed.faq || '');
    } catch {
      setToneInstructions(rawCI);
      setOffers('');
      setFaq('');
    }

    setLoading(false);

    // Auto-load products with localStorage cache (1h TTL)
    const platform = (profile as any).ecommerce_platform;
    if (platform) {
      const cacheKey = `products_${profile.id}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < 3_600_000) { setProducts(data); return; }
        }
      } catch { /* ignore */ }
      loadProducts(profile);
    }
  }, [profile?.id]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const structuredCI = JSON.stringify({ tone: toneInstructions, offers, faq });
      await db.clients.updateField(profile.id, {
        business_description: businessDescription,
        custom_instructions: structuredCI,
        website_url: websiteUrl,
        brain_updated_at: new Date().toISOString(),
      });
      setBrainUpdatedAt(new Date().toISOString());
      showToast('Cerebro actualizado correctamente.', 'success');
    } catch (err: any) {
      showToast('Error al guardar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadProducts = async (prof?: any) => {
    const p = prof || profile;
    if (!p) return;
    const platform = (p as any).ecommerce_platform;
    if (!platform) return;
    setProductsLoading(true);
    setProductsError(null);
    try {
      const body: any = { type: 'products', platform };
      if (platform === 'shopify') { body.shopify_domain = (p as any).shopify_domain; body.shopify_access_token = (p as any).shopify_access_token; }
      else if (platform === 'wordpress') { body.wordpress_url = (p as any).wordpress_url; body.woo_consumer_key = (p as any).woo_consumer_key; body.woo_consumer_secret = (p as any).woo_consumer_secret; }
      else if (platform === 'tiendanube') { body.tiendanube_store_id = (p as any).tiendanube_store_id; body.tiendanube_access_token = (p as any).tiendanube_access_token; }
      const r = await fetch('/api/scrape-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
      const { products: loaded } = await r.json();
      setProducts(loaded || []);
      if (loaded?.length) {
        try { localStorage.setItem(`products_${p.id}`, JSON.stringify({ data: loaded, ts: Date.now() })); } catch { /* storage full */ }
      } else {
        setProductsError('No se encontraron productos activos');
      }
    } catch (err: any) {
      setProductsError(err.message || 'Error al cargar productos');
    } finally {
      setProductsLoading(false);
    }
  };

  const handleScanAndTrainAll = async () => {
    if (!profile || !websiteUrl.trim()) { showToast('Ingresá una URL válida antes de escanear.', 'warning'); return; }
    setScanningAll(true);
    setScanStep('Iniciando escaneo...');
    showToast('Escaneando sitio web y redes sociales — puede tardar hasta 1 minuto.', 'info');
    try {
      const steps = ['Rastreando sitio web...', 'Conectando con Instagram y Facebook...', 'Consolidando datos de la marca...', 'Optimizando con IA...', 'Guardando en el Cerebro...'];
      let si = 0; setScanStep(steps[0]);
      const iv = setInterval(() => { if (si < steps.length - 1) { si++; setScanStep(steps[si]); } }, 7000);
      const res = await fetch('/api/scrape-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: profile.id, url: websiteUrl }) });
      clearInterval(iv);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      setScrapedContent(data.scraped_content || '');
      setInstagramContext(data.instagram_context || '');
      setBusinessDescription(data.business_description || '');
      // Preserve tone/offers/faq from scan result
      const rawCI: string = data.custom_instructions || '';
      try { const p = JSON.parse(rawCI); setToneInstructions(p.tone || rawCI); setOffers(p.offers || offers); setFaq(p.faq || faq); } catch { if (rawCI) setToneInstructions(rawCI); }
      setBrainUpdatedAt(data.brain_updated_at || null);
      showToast('¡Cerebro entrenado! Web, redes y tono actualizados.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al entrenar', 'error');
    } finally {
      setScanningAll(false); setScanStep('');
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return 'Nunca entrenado';
    try { return new Date(d).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' hs'; } catch { return d; }
  };

  const contextScore = [businessDescription, toneInstructions, offers, faq, scrapedContent, instagramContext].filter(Boolean).length;
  const contextPct = Math.round((contextScore / 6) * 100);

  if (loading) return <AppleLoader variant="page" />;

  return (
    <div className="w-full pt-4 pb-20 md:pt-6 px-4 md:px-0 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-violet-500" />
            </div>
            <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight">Cerebro de IA</h1>
            {isViewingAs && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-[9px] font-black uppercase tracking-wide">
                <ShieldAlert className="w-2.5 h-2.5" />Admin
              </span>
            )}
          </div>
          <p className="text-[12px] text-zinc-400 font-medium ml-11">Todo lo que sabe la IA sobre tu negocio — alimenta comentarios, mensajería y más.</p>
        </div>

        {/* Context score */}
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 shadow-sm">
          <div className="relative w-10 h-10">
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e4e4e7" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeDasharray={`${contextPct} ${100 - contextPct}`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-violet-600">{contextPct}%</span>
          </div>
          <div>
            <p className="text-[11px] font-black text-zinc-700 dark:text-zinc-300">Contexto IA</p>
            <p className="text-[10px] text-zinc-400">{contextScore}/6 secciones</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-0.5 mb-6 border-b border-zinc-100 dark:border-zinc-800">
        {[
          { id: 'identidad', label: 'Identidad', icon: FileText },
          { id: 'memoria',   label: 'Memoria',   icon: Brain },
          { id: 'catalogo',  label: 'Catálogo',  icon: ShoppingBag },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center gap-1.5 px-5 py-3 text-[13px] font-bold border-b-2 -mb-px transition-all ${activeTab === t.id ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════ TAB: IDENTIDAD ═══════════════════════ */}
      {activeTab === 'identidad' && (
        <form onSubmit={handleSaveSettings} className="space-y-5">

          {/* URL */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-violet-500" />
              <span className="text-[12px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Sitio Web</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://www.mitienda.com"
                className="flex-1 px-3 py-2.5 text-[13px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-violet-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-medium"
              />
              {websiteUrl && (
                <a href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`} target="_blank" rel="noreferrer" className="px-3 flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 hover:text-zinc-900 transition-all">
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              )}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1.5">Necesario para que la IA pueda escanear la tienda y generar contexto automático.</p>
          </div>

          {/* 4 context cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Descripción del negocio */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-zinc-800 dark:text-zinc-200">Descripción del Negocio</p>
                  <p className="text-[10px] text-zinc-400">Qué es, qué vende, quién lo maneja</p>
                </div>
                {businessDescription && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
              </div>
              <textarea
                value={businessDescription}
                onChange={e => setBusinessDescription(e.target.value)}
                placeholder="Ej: Somos una fábrica de cuero con 20 años de tradición en Argentina. Vendemos cuero skirting, latigo y harness directo de fábrica. Manuel atiende de L-V de 8 a 15hs..."
                rows={5}
                className="w-full p-3 text-[12.5px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-blue-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-y leading-relaxed"
              />
            </div>

            {/* Tono y Estilo */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-3.5 h-3.5 text-violet-500" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-zinc-800 dark:text-zinc-200">Tono y Estilo</p>
                  <p className="text-[10px] text-zinc-400">Cómo habla la IA al responder</p>
                </div>
                {toneInstructions && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
              </div>
              <textarea
                value={toneInstructions}
                onChange={e => setToneInstructions(e.target.value)}
                placeholder="Ej: Tono informal y cercano. Voseo argentino. No más de 2 oraciones en comentarios. Usar emojis con moderación. Nunca decir 'hola' ni 'gracias por tu mensaje'..."
                rows={5}
                className="w-full p-3 text-[12.5px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-violet-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-y leading-relaxed"
              />
            </div>

            {/* Ofertas */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-zinc-800 dark:text-zinc-200">Ofertas y Promociones</p>
                  <p className="text-[10px] text-zinc-400">Descuentos activos, combos, cuotas</p>
                </div>
                {offers && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
              </div>
              <textarea
                value={offers}
                onChange={e => setOffers(e.target.value)}
                placeholder="Ej: Hasta el 30 de junio, 15% off en todos los cueros de más de 5 metros. Envío gratis en compras +$100 USD. 3 cuotas sin interés con tarjeta Visa o Mastercard. Código de descuento: SUMMER15..."
                rows={5}
                className="w-full p-3 text-[12.5px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-amber-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-y leading-relaxed"
              />
            </div>

            {/* FAQ */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-zinc-800 dark:text-zinc-200">Preguntas Frecuentes</p>
                  <p className="text-[10px] text-zinc-400">Respuestas exactas que la IA debe usar</p>
                </div>
                {faq && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
              </div>
              <textarea
                value={faq}
                onChange={e => setFaq(e.target.value)}
                placeholder="P: ¿Hacen envíos internacionales? R: Sí, enviamos a todo el mundo vía DHL. El costo varía por destino.&#10;P: ¿Cuál es el mínimo de pedido? R: No tenemos mínimo. Se puede pedir desde 1 pie cuadrado.&#10;P: ¿Tienen local físico? R: Sí, estamos en..."
                rows={5}
                className="w-full p-3 text-[12.5px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-y leading-relaxed"
              />
            </div>
          </div>

          {/* How the context feeds the AI */}
          <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/30 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-bold text-violet-700 dark:text-violet-300">Todo esto alimenta las respuestas automáticas</p>
                <p className="text-[11px] text-violet-600/70 dark:text-violet-400/70 mt-0.5 leading-snug">La IA usa estas 4 secciones + el catálogo de productos + la memoria web/social cada vez que responde en comentarios, mensajería o DMs. Más contexto = respuestas más precisas.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-[13px] font-black shadow-md shadow-violet-200 dark:shadow-none transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      )}

      {/* ═══════════════════════ TAB: MEMORIA ═══════════════════════ */}
      {activeTab === 'memoria' && (
        <div className="space-y-5">

          {/* Train button */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[14px] font-black text-zinc-900 dark:text-white">Entrenamiento Automático</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">Escanea el sitio web y las redes sociales para actualizar la memoria.</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <Calendar className="w-3.5 h-3.5" />
                <span className="font-medium">{fmtDate(brainUpdatedAt)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Pill active={!!websiteUrl} label={websiteUrl ? 'Web lista' : 'Sin URL'} icon={Globe} />
              <Pill active={!!(profile as any)?.ig_business_id} label={(profile as any)?.ig_username ? `@${(profile as any).ig_username}` : 'Instagram'} icon={Instagram} />
              <Pill active={!!(profile as any)?.fb_page_id} label={(profile as any)?.fb_page_name || 'Facebook'} icon={Globe} />
            </div>

            <button
              onClick={handleScanAndTrainAll}
              disabled={scanningAll || !websiteUrl.trim()}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-[13px] font-bold shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 transition-all"
            >
              {scanningAll ? <><RefreshCw className="w-4 h-4 animate-spin" />{scanStep || 'Entrenando...'}</> : <><Sparkles className="w-4 h-4" />⚡ Escanear y Entrenar Todo</>}
            </button>
          </div>

          {/* Memory preview */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="flex border-b border-zinc-100 dark:border-zinc-800">
              {[
                { id: 'web', label: 'Sitio Web', icon: Globe, active: !!scrapedContent },
                { id: 'social', label: 'Instagram & Facebook', icon: Instagram, active: !!instagramContext },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveMemTab(t.id as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-[12px] font-bold border-b-2 -mb-px transition-all ${activeMemTab === t.id ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-white dark:bg-zinc-900' : 'border-transparent text-zinc-400'}`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </button>
              ))}
            </div>
            <div className="p-5">
              {activeMemTab === 'web' ? (
                scrapedContent ? (
                  <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 max-h-[400px] overflow-y-auto text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line">
                    {scrapedContent}
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-3">
                    <Globe className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
                    <p className="text-[13px] font-semibold text-zinc-500">Sin contenido web escaneado</p>
                    <p className="text-[11px] text-zinc-400">Configurá la URL y hacé clic en "Escanear y Entrenar"</p>
                  </div>
                )
              ) : (
                instagramContext ? (
                  <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 max-h-[400px] overflow-y-auto text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line">
                    {instagramContext}
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-3">
                    <Instagram className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
                    <p className="text-[13px] font-semibold text-zinc-500">Sin contenido social sincronizado</p>
                    <p className="text-[11px] text-zinc-400">Vinculá Instagram y hacé clic en "Escanear y Entrenar"</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAB: CATÁLOGO ═══════════════════════ */}
      {activeTab === 'catalogo' && (
        <div>
          {!(profile as any)?.ecommerce_platform ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-[14px] font-semibold text-zinc-600 dark:text-zinc-400">Sin tienda conectada</p>
              <p className="text-[12px] text-zinc-400 max-w-xs">Conectá Shopify, WooCommerce o Tiendanube desde el panel de administración.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[14px] font-black text-zinc-900 dark:text-white">Catálogo de Productos</h2>
                      {products.length > 0 && <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 uppercase">{products.length} activos</span>}
                    </div>
                    <p className="text-[10px] text-zinc-400 capitalize mt-0.5">{(profile as any).ecommerce_platform} · La IA conoce todos estos productos</p>
                  </div>
                </div>
                <button onClick={() => { try { localStorage.removeItem(`products_${profile!.id}`); } catch {} loadProducts(); }} disabled={productsLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 transition-all disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${productsLoading ? 'animate-spin' : ''}`} />{productsLoading ? 'Cargando...' : 'Actualizar'}
                </button>
              </div>

              {productsLoading && <div className="flex items-center justify-center py-16 gap-3"><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /><span className="text-[12px] text-zinc-400">Importando productos...</span></div>}
              {productsError && !productsLoading && <div className="p-5 m-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-[12px] text-red-600">{productsError}</div>}

              {products.length > 0 && !productsLoading && (
                <div className="p-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input type="text" placeholder="Buscar producto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[12px] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {products.filter(p => !productSearch || p.title.toLowerCase().includes(productSearch.toLowerCase()) || (p.type || '').toLowerCase().includes(productSearch.toLowerCase())).map(p => {
                      const isExp = expandedProduct === String(p.id);
                      const minP = p.variants?.length > 0 ? Math.min(...p.variants.map((v: any) => parseFloat(v.price) || 0)) : 0;
                      const maxP = p.variants?.length > 0 ? Math.max(...p.variants.map((v: any) => parseFloat(v.price) || 0)) : 0;
                      const priceStr = minP === maxP ? `$${minP.toFixed(2)}` : `$${minP.toFixed(2)} – $${maxP.toFixed(2)}`;
                      return (
                        <div key={p.id} className="border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col bg-zinc-50 dark:bg-zinc-900 hover:border-emerald-200 dark:hover:border-emerald-800/40 transition-colors">
                          {p.image ? <div className="aspect-square bg-white dark:bg-zinc-800 overflow-hidden"><img src={p.image} alt={p.title} className="w-full h-full object-cover" /></div> : <div className="aspect-square bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"><Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" /></div>}
                          <div className="p-3 flex-1 flex flex-col gap-1">
                            <p className="text-[12px] font-bold text-zinc-900 dark:text-white leading-tight line-clamp-2">{p.title}</p>
                            <div className="flex items-center gap-1 flex-wrap">{p.type && <span className="text-[9px] text-zinc-400 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded">{p.type}</span>}{p.variants?.length > 1 && <span className="text-[9px] text-zinc-400 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded">{p.variants.length} var.</span>}</div>
                            <p className="text-[13px] font-black text-emerald-600 dark:text-emerald-400 mt-auto">{priceStr}</p>
                          </div>
                          <button onClick={() => setExpandedProduct(isExp ? null : String(p.id))} className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-800 transition-colors">
                            <ChevronDown className={`w-3 h-3 transition-transform ${isExp ? 'rotate-180' : ''}`} />{isExp ? 'Menos' : 'Variantes'}
                          </button>
                          {isExp && (
                            <div className="px-3 pb-3 space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                              {p.description && <p className="text-[11px] text-zinc-500 leading-relaxed">{p.description}</p>}
                              {p.variants?.map((v: any, vi: number) => (
                                <div key={vi} className="flex items-center justify-between px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px]">
                                  <span className="text-zinc-600 dark:text-zinc-300 font-medium truncate mr-2">{v.title || 'Default'}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${v.available ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600' : 'bg-red-100 dark:bg-red-950 text-red-500'}`}>{v.available ? '✓' : '✗'}</span>
                                    <span className="font-black text-zinc-900 dark:text-white">${parseFloat(v.price || 0).toFixed(2)}</span>
                                  </div>
                                </div>
                              ))}
                              {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-violet-500 hover:underline font-bold"><ExternalLink className="w-2.5 h-2.5" />Ver en tienda</a>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {products.filter(p => !productSearch || p.title.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                      <div className="col-span-full text-center py-8"><p className="text-[12px] text-zinc-400">Sin resultados para "{productSearch}"</p></div>
                    )}
                  </div>
                </div>
              )}

              {!productsLoading && !productsError && products.length === 0 && (
                <div className="p-10 text-center space-y-3">
                  <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto" />
                  <p className="text-[12px] text-zinc-400">Hacé clic en "Actualizar" para cargar los productos de la tienda.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
