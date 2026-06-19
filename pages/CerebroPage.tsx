import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useToast } from '../components/Toast';
import { supabase } from '../services/supabase';
import {
  Brain, Globe, Save, RefreshCw, Sparkles, FileText, CheckCircle2,
  ShieldAlert, ArrowUpRight, Instagram, Calendar, ShoppingBag, Package,
  ExternalLink, Search, Tag, Zap, MessageSquare, BookOpen, Loader2,
  ChevronDown, AlertCircle, Info, X, CheckCircle, Circle, ChevronRight
} from 'lucide-react';
import { AppleLoader } from '../components/ui/AppleLoader';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import { AI_BRAIN_STEPS } from '../utils/aiReadiness';

const Pill = ({ active, label, icon: Icon }: { active: boolean; label: string; icon: any }) => (
  <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg ${active ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-400'}`}>
    <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
    <Icon className="w-3 h-3" />
    {label}
  </div>
);

const SCAN_STEPS = [
  { id: 'web',    label: 'Rastreando sitio web',        detail: 'Explorando páginas, productos y contenido...' },
  { id: 'social', label: 'Leyendo Instagram y Facebook', detail: 'Analizando publicaciones, perfil y descripción...' },
  { id: 'ai',     label: 'Consolidando con IA',          detail: 'Generando descripción, tono, ofertas y FAQs...' },
  { id: 'save',   label: 'Guardando en el Cerebro',      detail: 'Actualizando memoria web y secciones...' },
];

export default function CerebroPage() {
  const { profile: authProfile, loading: authLoading, session, refreshProfile } = useAuth();
  const { viewAsProfile, isViewingAs, setViewAsProfile } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  
  const detectedPlatform = useMemo(() => {
    let platform = (profile as any)?.ecommerce_platform;
    if (profile && !platform) {
      if ((profile as any).shopify_domain && (profile as any).shopify_access_token) {
        platform = 'shopify';
      } else if ((profile as any).wordpress_url && (profile as any).woo_consumer_key && (profile as any).woo_consumer_secret) {
        platform = 'wordpress';
      } else if ((profile as any).tiendanube_store_id && (profile as any).tiendanube_access_token) {
        platform = 'tiendanube';
      }
    }
    return platform || null;
  }, [profile]);

  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'identidad' | 'memoria' | 'catalogo'>('identidad');

  // Identidad
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
  const [savedOk, setSavedOk] = useState(false);

  // Confirm scan modal
  const [showConfirmScan, setShowConfirmScan] = useState(false);

  // Scan modal
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [scanCurrentStep, setScanCurrentStep] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanPreview, setScanPreview] = useState<{ description?: string; tone?: string; offers?: string; faq?: string } | null>(null);
  const [scanLog, setScanLog] = useState<string[]>([]);

  // Contexto modal
  const [showContextModal, setShowContextModal] = useState(false);

  // Catálogo
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    setWebsiteUrl((profile as any).website_url || '');
    setBusinessDescription((profile as any).business_description || '');
    setScrapedContent((profile as any).scraped_content || '');
    setInstagramContext((profile as any).instagram_context || '');
    setBrainUpdatedAt((profile as any).brain_updated_at || null);

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

    const plt = detectedPlatform;
    if (plt) {
      const ck = `products_${profile.id}`;
      try {
        const cached = localStorage.getItem(ck);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < 3_600_000) { setProducts(data); return; }
        }
      } catch { }
      loadProducts(profile);
    }
  }, [profile?.id, authLoading, detectedPlatform]);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || session?.access_token || '';
      if (!token) throw new Error('La sesión expiró. Volvé a iniciar sesión.');
      const res = await fetch('/api/oauth?action=brain-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: profile.id,
        business_description: businessDescription,
        custom_instructions: JSON.stringify({ tone: toneInstructions, offers, faq }),
          website_url: websiteUrl
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el Cerebro.');
      const nextBrainUpdatedAt = data.brain_updated_at || new Date().toISOString();
      setBrainUpdatedAt(nextBrainUpdatedAt);
      if (isViewingAs) {
        setViewAsProfile(prev => prev ? ({
          ...prev,
          business_description: businessDescription,
          custom_instructions: JSON.stringify({ tone: toneInstructions, offers, faq }),
          website_url: websiteUrl,
          brain_updated_at: nextBrainUpdatedAt,
        } as any) : prev);
      }
      await refreshProfile();
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
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
    let plt = (p as any).ecommerce_platform;
    if (p === profile) {
      plt = detectedPlatform;
    } else if (p && !plt) {
      if (p.shopify_domain && p.shopify_access_token) {
        plt = 'shopify';
      } else if (p.wordpress_url && p.woo_consumer_key && p.woo_consumer_secret) {
        plt = 'wordpress';
      } else if (p.tiendanube_store_id && p.tiendanube_access_token) {
        plt = 'tiendanube';
      }
    }
    if (!plt) return;
    setProductsLoading(true); setProductsError(null);
    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';

      const body: any = { type: 'products', platform: plt, clientId: p.id };
      if (plt === 'shopify') { body.shopify_domain = (p as any).shopify_domain; body.shopify_access_token = (p as any).shopify_access_token; }
      else if (plt === 'wordpress') { body.wordpress_url = (p as any).wordpress_url; body.woo_consumer_key = (p as any).woo_consumer_key; body.woo_consumer_secret = (p as any).woo_consumer_secret; }
      else if (plt === 'tiendanube') { body.tiendanube_store_id = (p as any).tiendanube_store_id; body.tiendanube_access_token = (p as any).tiendanube_access_token; }
      const r = await fetch('/api/scrape-all', { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }, 
        body: JSON.stringify(body) 
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
      const { products: loaded } = await r.json();
      setProducts(loaded || []);
      if (loaded?.length) {
        try { localStorage.setItem(`products_${p.id}`, JSON.stringify({ data: loaded, ts: Date.now() })); } catch { }
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
    setShowScanModal(true);
    setScanningAll(true);
    setScanCurrentStep(0);
    setScanDone(false);
    setScanError('');
    setScanPreview(null);
    setScanLog([]);

    const addLog = (msg: string) => setScanLog(prev => [...prev, msg]);

    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';

      // ── STEP 1: Scan website ──────────────────────────────────────────
      setScanCurrentStep(0);
      addLog(`Abriendo ${websiteUrl}...`);

      const webRes = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: profile.id, url: websiteUrl, action: 'scrape-website' })
      });
      const webData = await webRes.json();
      if (!webRes.ok) throw new Error(webData.error || 'Error escaneando sitio web');

      addLog(`✓ Página de inicio leída`);
      if (webData.pages_visited?.length) {
        webData.pages_visited.forEach((p: string) => {
          try { addLog(`  → ${new URL(p).pathname}`); } catch { addLog(`  → ${p}`); }
        });
        addLog(`✓ ${webData.pages_visited.length} subpáginas escaneadas`);
      }
      const webLen = (webData.scraped_content || '').length;
      addLog(`✓ ${webLen.toLocaleString()} caracteres extraídos`);
      setScrapedContent(webData.scraped_content || '');

      // ── STEP 2: Social media ──────────────────────────────────────────
      setScanCurrentStep(1);
      addLog(`Buscando publicaciones de Instagram y Facebook...`);

      const socialRes = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: profile.id, url: websiteUrl, action: 'sync-instagram' })
      });
      const socialData = await socialRes.json();
      const socialContent: string = socialData.instagram_context || '';
      if (socialContent && socialContent !== 'Redes sociales no vinculadas.') {
        addLog(`✓ Publicaciones procesadas`);
      } else {
        addLog(`  ℹ Redes sociales no vinculadas (opcional)`);
      }
      setInstagramContext(socialContent);

      // ── STEP 3: Generate fields with AI ──────────────────────────────
      setScanCurrentStep(2);
      addLog(`Analizando con IA...`);
      addLog(`  → Extrayendo descripción del negocio`);
      addLog(`  → Detectando tono y estilo`);
      addLog(`  → Buscando ofertas activas`);
      addLog(`  → Extrayendo preguntas frecuentes`);

      const fieldsRes = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: profile.id, action: 'generate-fields' })
      });
      const fieldsData = await fieldsRes.json();
      if (!fieldsRes.ok) throw new Error(fieldsData.error || 'Error generando campos de IA');

      if (fieldsData.business_description) addLog(`✓ Descripción generada`);
      if (fieldsData.tone) addLog(`✓ Tono y estilo definido`);
      if (fieldsData.offers) addLog(`✓ Ofertas detectadas`);
      else addLog(`  ℹ Sin ofertas activas detectadas`);
      if (fieldsData.faq) {
        const faqCount = (fieldsData.faq.match(/^P:/gm) || []).length;
        addLog(`✓ ${faqCount} preguntas frecuentes extraídas`);
      }

      setBusinessDescription(fieldsData.business_description || '');
      setToneInstructions(fieldsData.tone || '');
      setOffers(fieldsData.offers || '');
      setFaq(fieldsData.faq || '');
      setBrainUpdatedAt(fieldsData.brain_updated_at || null);
      if (isViewingAs) {
        setViewAsProfile(prev => prev ? ({
          ...prev,
          business_description: fieldsData.business_description || '',
          custom_instructions: JSON.stringify({
            tone: fieldsData.tone || '',
            offers: fieldsData.offers || '',
            faq: fieldsData.faq || '',
          }),
          scraped_content: webData.scraped_content || '',
          instagram_context: socialContent,
          brain_updated_at: fieldsData.brain_updated_at || new Date().toISOString(),
        } as any) : prev);
      }
      await refreshProfile();

      // ── STEP 4: Done ──────────────────────────────────────────────────
      setScanCurrentStep(3);
      addLog(`✓ Todo guardado en el Cerebro de IA`);

      setScanPreview({
        description: fieldsData.business_description,
        tone: fieldsData.tone,
        offers: fieldsData.offers,
        faq: fieldsData.faq,
      });
      setScanDone(true);
    } catch (err: any) {
      setScanError(err.message || 'Error al escanear');
    } finally {
      setScanningAll(false);
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return 'Nunca entrenado';
    try { return new Date(d).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' hs'; } catch { return d; }
  };

  const ecommercePlatform: string = detectedPlatform || '';
  const cleanPreview = (v: string) => v.replace(/#{1,6} ?/g, '').replace(/\*\*/g, '').trim();

  const sections = [
    { key: 'desc',  label: 'Descripción del Negocio', icon: Info,        color: 'blue',   value: businessDescription, tip: 'Completalo manualmente o usá "Escanear y Entrenar"' },
    { key: 'tone',  label: 'Tono y Estilo',           icon: MessageSquare, color: 'violet', value: toneInstructions,   tip: 'El escaneo lo genera automáticamente del sitio web' },
    { key: 'offrs', label: 'Ofertas y Promociones',   icon: Tag,          color: 'amber',  value: offers,              tip: 'Escribilo manualmente con las ofertas vigentes' },
    { key: 'faq',   label: 'Preguntas Frecuentes',    icon: BookOpen,     color: 'emerald',value: faq,                 tip: 'El escaneo extrae las FAQs del sitio automáticamente' },
    { key: 'web',   label: 'Memoria Web',             icon: Globe,        color: 'indigo', value: scrapedContent,      tip: 'Usá "Escanear y Entrenar" para extraer el contenido del sitio' },
    { key: 'social',label: 'Memoria Social',          icon: Instagram,    color: 'pink',   value: instagramContext,    tip: 'Vinculá Instagram en la configuración y luego escaneá' },
    { key: 'cat',   label: 'Catálogo Conectado',      icon: ShoppingBag,  color: 'emerald',value: ecommercePlatform,   tip: 'Falta conectar la Tienda Online' },
  ];
  const contextScore = sections.filter(s => s.value).length;
  const contextPct = Math.round((contextScore / sections.length) * 100);
  const aiReady = Boolean(brainUpdatedAt && (
    businessDescription.trim() ||
    scrapedContent.trim() ||
    instagramContext.trim() ||
    toneInstructions.trim() ||
    offers.trim() ||
    faq.trim()
  ));

  return (
    <CenteredPageLoader isLoading={loading || authLoading}>
    <div className="w-full pt-3 pb-20 md:pt-6 animate-fade-in">

      <div className="page-header">
        <div className="flex items-center gap-4 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="page-title">Cerebro de IA</h1>
                {isViewingAs && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-[9px] font-black uppercase"><ShieldAlert className="w-2.5 h-2.5" />Admin</span>}
              </div>
              <p className="page-subtitle">Todo lo que sabe la IA sobre tu negocio — alimenta comentarios, mensajería y más.</p>
            </div>
          </div>
        </div>

        {/* Actions at top-right */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* Context score — clickable modal */}
          <button
            type="button"
            onClick={() => setShowContextModal(true)}
            className="flex items-center gap-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 shadow-sm hover:border-violet-300 dark:hover:border-violet-700 transition-all shrink-0"
          >
            <div className="relative w-9 h-9">
              <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e4e4e7" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#8b5cf6" strokeWidth="3"
                  strokeDasharray={`${contextPct} ${100 - contextPct}`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-violet-600">{contextPct}%</span>
            </div>
            <div className="text-left">
              <p className="text-[11px] font-black text-zinc-700 dark:text-zinc-300">Contexto IA</p>
              <p className="text-[10px] text-zinc-400">{contextScore}/{sections.length} secciones</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {activeTab === 'identidad' && (
            <button
              type="button"
              onClick={() => handleSaveSettings()}
              disabled={saving}
              className={`flex items-center gap-2 px-5 py-2.5 disabled:opacity-50 rounded-xl text-[13px] font-black shadow-sm transition-all shrink-0 ${
                savedOk 
                  ? 'bg-emerald-600 text-white shadow-emerald-200 dark:shadow-none' 
                  : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-white shadow-sm dark:shadow-none'
              }`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedOk ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Guardando…' : savedOk ? '¡Guardado!' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-0.5 mb-6 border-b border-zinc-100 dark:border-zinc-800">
        {[
          { id: 'identidad', label: 'Identidad', icon: FileText },
          { id: 'memoria',   label: 'Memoria',   icon: Brain },
          { id: 'catalogo',  label: 'Catálogo',  icon: ShoppingBag },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center gap-1.5 px-5 py-3 text-[13px] font-bold border-b-2 -mb-px transition-all ${activeTab === t.id ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {!aiReady && (
        <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/80 dark:bg-amber-500/10 p-4 md:p-5 flex flex-col md:flex-row md:items-start gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-zinc-950/60 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-black text-zinc-900 dark:text-zinc-100">
              La IA todavía no está habilitada
            </h2>
            <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-400 mt-1">
              Para usar el chat, respuestas sugeridas y análisis con IA, primero completá este análisis del negocio. Cuando quede guardado, la IA se activa automáticamente.
            </p>
            <div className="grid gap-2 mt-4 md:grid-cols-3">
              {AI_BRAIN_STEPS.map((step) => (
                <div key={step} className="rounded-xl bg-white/70 dark:bg-zinc-950/40 border border-amber-200/70 dark:border-amber-500/15 px-3 py-2 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-[11.5px] font-bold text-zinc-700 dark:text-zinc-300 leading-snug">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: IDENTIDAD ═══ */}
      {activeTab === 'identidad' && (
        <form onSubmit={handleSaveSettings} className="space-y-5">

          {/* URL + Scan */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-violet-500" />
              <span className="text-[12px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Sitio Web</span>
            </div>
            <div className="flex gap-2">
              <input type="text" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://www.mitienda.com"
                className="apple-input flex-1" />
              {websiteUrl && (
                <a href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`} target="_blank" rel="noreferrer"
                  className="px-3 flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 hover:text-zinc-900 transition-all">
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Pill active={!!websiteUrl} label={websiteUrl ? 'Web lista' : 'Sin URL'} icon={Globe} />
              <Pill active={!!(profile as any)?.ig_business_id} label={(profile as any)?.ig_username ? `@${(profile as any).ig_username}` : 'Instagram'} icon={Instagram} />
              <Pill active={!!(profile as any)?.fb_page_id} label={(profile as any)?.fb_page_name || 'Facebook'} icon={Globe} />
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <button type="button" onClick={() => websiteUrl.trim() && setShowConfirmScan(true)} disabled={!websiteUrl.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-[12px] font-bold shadow-md shadow-violet-500/20 transition-all">
                <Sparkles className="w-3.5 h-3.5" />Escanear y Entrenar
              </button>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <Calendar className="w-3.5 h-3.5" />
                <span className="font-medium">{fmtDate(brainUpdatedAt)}</span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 -mt-1">Escanea el sitio web y redes sociales — extrae descripción, tono, ofertas y preguntas frecuentes automáticamente.</p>
          </div>

          {/* 4 context cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              { key: 'desc', label: 'Descripción del Negocio', hint: 'Qué es, qué vende, quién lo maneja', icon: Info, color: 'blue', accentCls: 'focus:border-blue-500', val: businessDescription, set: setBusinessDescription, ph: 'Ej: Somos una fábrica de cuero con 20 años de tradición...' },
              { key: 'tone', label: 'Tono y Estilo', hint: 'Cómo habla la IA al responder', icon: MessageSquare, color: 'violet', accentCls: 'focus:border-violet-500', val: toneInstructions, set: setToneInstructions, ph: 'Ej: Tono informal y cercano. Voseo argentino...' },
              { key: 'offers', label: 'Ofertas y Promociones', hint: 'Descuentos activos, combos, cuotas', icon: Tag, color: 'amber', accentCls: 'focus:border-amber-500', val: offers, set: setOffers, ph: 'Ej: Hasta el 30 de junio, 15% off en todos los cueros de más de 5 metros...' },
              { key: 'faq', label: 'Preguntas Frecuentes', hint: 'Respuestas exactas que la IA debe usar', icon: BookOpen, color: 'emerald', accentCls: 'focus:border-emerald-500', val: faq, set: setFaq, ph: 'P: ¿Hacen envíos internacionales? R: Sí, vía DHL.\nP: ¿Cuál es el mínimo? R: No hay mínimo...' },
            ].map(f => (
              <div key={f.key} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg bg-${f.color}-500/10 flex items-center justify-center shrink-0`}>
                    <f.icon className={`w-3.5 h-3.5 text-${f.color}-500`} />
                  </div>
                  <div>
                    <p className="text-[12px] font-black text-zinc-800 dark:text-zinc-200">{f.label}</p>
                    <p className="text-[10px] text-zinc-400">{f.hint}</p>
                  </div>
                  {f.val && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                </div>
                <textarea value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} rows={5}
                  className="apple-textarea" />
              </div>
            ))}
          </div>

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
            <button type="submit" disabled={saving}
              className={`flex items-center gap-2 px-6 py-2.5 disabled:opacity-50 rounded-xl text-[13px] font-black shadow-md transition-all ${
                savedOk 
                  ? 'bg-emerald-600 text-white shadow-emerald-200 dark:shadow-none' 
                  : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-white shadow-sm dark:shadow-none'
              }`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedOk ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Guardando...' : savedOk ? '¡Guardado con éxito!' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      )}

      {/* ═══ TAB: MEMORIA ═══ */}
      {activeTab === 'memoria' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="flex border-b border-zinc-100 dark:border-zinc-800">
              {[
                { id: 'web', label: 'Sitio Web', icon: Globe, active: !!scrapedContent },
                { id: 'social', label: 'Instagram & Facebook', icon: Instagram, active: !!instagramContext },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveMemTab(t.id as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-[12px] font-bold border-b-2 -mb-px transition-all ${activeMemTab === t.id ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-white dark:bg-zinc-900' : 'border-transparent text-zinc-400'}`}>
                  <t.icon className="w-3.5 h-3.5" />{t.label}
                  {t.active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </button>
              ))}
            </div>
            <div className="p-5">
              {activeMemTab === 'web' ? (
                scrapedContent
                  ? <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 max-h-[500px] overflow-y-auto text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{scrapedContent}</div>
                  : <div className="text-center py-12 space-y-3"><Globe className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" /><p className="text-[13px] font-semibold text-zinc-500">Sin contenido web escaneado</p><p className="text-[11px] text-zinc-400">Configurá la URL y hacé clic en "Escanear y Entrenar"</p></div>
              ) : (
                instagramContext
                  ? <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 max-h-[500px] overflow-y-auto text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{instagramContext}</div>
                  : <div className="text-center py-12 space-y-3"><Instagram className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto" /><p className="text-[13px] font-semibold text-zinc-500">Sin contenido social sincronizado</p><p className="text-[11px] text-zinc-400">Vinculá Instagram y hacé clic en "Escanear y Entrenar"</p></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: CATÁLOGO ═══ */}
      {activeTab === 'catalogo' && (
        <div>
          {!detectedPlatform ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"><ShoppingBag className="w-6 h-6 text-zinc-400" /></div>
              <p className="text-[14px] font-semibold text-zinc-600 dark:text-zinc-400">Sin tienda conectada</p>
              <p className="text-[12px] text-zinc-400 max-w-xs">Conectá Shopify, WooCommerce o Tiendanube desde el panel de administración.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-emerald-600" /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[14px] font-black text-zinc-900 dark:text-white">Catálogo de Productos</h2>
                      {products.length > 0 && <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 uppercase">{products.length} activos</span>}
                    </div>
                    <p className="text-[10px] text-zinc-400 capitalize mt-0.5">{detectedPlatform} · La IA conoce todos estos productos</p>
                  </div>
                </div>
                <button onClick={() => { try { localStorage.removeItem(`products_${profile!.id}`); } catch {} loadProducts(); }} disabled={productsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 transition-all disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${productsLoading ? 'animate-spin' : ''}`} />{productsLoading ? 'Cargando...' : 'Actualizar'}
                </button>
              </div>
              {productsLoading && <div className="flex items-center justify-center py-16 gap-3"><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /><span className="text-[12px] text-zinc-400">Importando productos...</span></div>}
              {productsError && !productsLoading && <div className="p-5 m-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-[12px] text-red-600">{productsError}</div>}
              {products.length > 0 && !productsLoading && (
                <div className="p-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input type="text" placeholder="Buscar producto..." value={productSearch} onChange={e => setProductSearch(e.target.value)}
                      className="apple-input pl-9 h-9" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {products.filter(p => !productSearch || p.title.toLowerCase().includes(productSearch.toLowerCase()) || (p.type || '').toLowerCase().includes(productSearch.toLowerCase())).map(p => {
                      const isExp = expandedProduct === String(p.id);
                      const prices = p.variants?.map((v: any) => parseFloat(v.price) || 0) || [0];
                      const minP = Math.min(...prices), maxP = Math.max(...prices);
                      return (
                        <div key={p.id} className="border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col bg-zinc-50 dark:bg-zinc-900 hover:border-emerald-200 dark:hover:border-emerald-800/40 transition-colors">
                          {p.image ? <div className="aspect-square bg-white dark:bg-zinc-800 overflow-hidden"><img src={p.image} alt={p.title} className="w-full h-full object-cover" /></div> : <div className="aspect-square bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"><Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" /></div>}
                          <div className="p-3 flex-1 flex flex-col gap-1">
                            <p className="text-[12px] font-bold text-zinc-900 dark:text-white leading-tight line-clamp-2">{p.title}</p>
                            <div className="flex items-center gap-1 flex-wrap">{p.type && <span className="text-[9px] text-zinc-400 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded">{p.type}</span>}{p.variants?.length > 1 && <span className="text-[9px] text-zinc-400 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded">{p.variants.length} var.</span>}</div>
                            <p className="text-[13px] font-black text-emerald-600 dark:text-emerald-400 mt-auto">{minP === maxP ? `$${minP.toFixed(2)}` : `$${minP.toFixed(2)} – $${maxP.toFixed(2)}`}</p>
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
                  </div>
                </div>
              )}
              {!productsLoading && !productsError && products.length === 0 && (
                <div className="p-10 text-center space-y-3"><Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto" /><p className="text-[12px] text-zinc-400">Hacé clic en "Actualizar" para cargar los productos.</p></div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════ CONFIRM SCAN MODAL ════════ */}
      {showConfirmScan && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowConfirmScan(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-[400px] w-full shadow-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <p className="text-[15px] font-black text-zinc-900 dark:text-white">¿Escanear y Entrenar?</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">Esto va a sobrescribir el Cerebro de IA actual</p>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 mb-5">
              <p className="text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed">
                El escaneo va a reemplazar la descripción, tono, ofertas y FAQs con la información extraída del sitio. El contenido que escribiste manualmente también se va a actualizar.
              </p>
            </div>
            <p className="text-[12px] text-zinc-500 mb-5">Sitio a escanear: <span className="font-bold text-zinc-700 dark:text-zinc-300">{websiteUrl}</span></p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmScan(false)} className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[13px] font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
                Cancelar
              </button>
              <button
                onClick={() => { setShowConfirmScan(false); handleScanAndTrainAll(); }}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-black shadow-md shadow-violet-500/20 transition-all"
              >
                Sí, escanear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ SCAN MODAL ════════ */}
      {showScanModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { if (!scanningAll) setShowScanModal(false); }} />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-[620px] w-full shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${scanningAll ? 'bg-violet-500/10' : scanDone ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  {scanningAll ? <RefreshCw className="w-4 h-4 text-violet-500 animate-spin" /> : scanDone ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
                <div>
                  <p className="text-[14px] font-black text-zinc-900 dark:text-white">
                    {scanningAll ? 'Escaneando en progreso...' : scanDone ? '¡Escaneo completado!' : 'Error al escanear'}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[360px]">{websiteUrl}</p>
                </div>
              </div>
              {!scanningAll && <button onClick={() => setShowScanModal(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><X className="w-4 h-4" /></button>}
            </div>

            {/* Steps + Log (side by side when wide) */}
            <div className="flex gap-0 md:flex-row flex-col">

              {/* Steps column */}
              <div className="p-5 space-y-2 md:w-[220px] shrink-0 border-r border-zinc-100 dark:border-zinc-800">
                {SCAN_STEPS.map((step, i) => {
                  const done = scanDone ? true : i < scanCurrentStep;
                  const current = !scanDone && i === scanCurrentStep && scanningAll;
                  return (
                    <div key={step.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl transition-all ${current ? 'bg-violet-50 dark:bg-violet-950/30' : done ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : 'opacity-35'}`}>
                      <div className="shrink-0 mt-0.5">
                        {done ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : current ? <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin" /> : <Circle className="w-3.5 h-3.5 text-zinc-300" />}
                      </div>
                      <div>
                        <p className={`text-[11.5px] font-bold leading-tight ${done ? 'text-emerald-700 dark:text-emerald-400' : current ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-400'}`}>{step.label}</p>
                        {current && <p className="text-[10px] text-violet-400/80 mt-0.5 leading-snug">{step.detail}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live log column */}
              <div className="flex-1 p-4">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">Actividad en tiempo real</p>
                <div className="bg-zinc-950 rounded-xl p-3 h-[180px] overflow-y-auto space-y-0.5 font-mono">
                  {scanLog.length === 0 && (
                    <p className="text-[11px] text-zinc-600">Iniciando...</p>
                  )}
                  {scanLog.map((msg, i) => (
                    <p key={i} className={`text-[11px] leading-relaxed ${
                      msg.startsWith('✓') ? 'text-emerald-400' :
                      msg.startsWith('  ℹ') || msg.startsWith('ℹ') ? 'text-zinc-500' :
                      msg.startsWith('  →') ? 'text-blue-400' :
                      'text-zinc-300'
                    }`}>{msg}</p>
                  ))}
                  {scanningAll && (
                    <p className="text-[11px] text-violet-400 animate-pulse">▌</p>
                  )}
                </div>
              </div>
            </div>

            {/* Error */}
            {scanError && (
              <div className="mx-5 mb-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2 text-[12px] text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{scanError}
              </div>
            )}

            {/* Preview of extracted data */}
            {scanDone && scanPreview && (
              <div className="mx-5 mb-4 border border-emerald-200 dark:border-emerald-800/40 rounded-xl overflow-hidden">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2 border-b border-emerald-200 dark:border-emerald-800/40 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <p className="text-[12px] font-black text-emerald-700 dark:text-emerald-400">Datos extraídos y cargados en los campos</p>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 max-h-[220px] overflow-y-auto">
                  {[
                    { label: 'Descripción', value: scanPreview.description, color: 'text-blue-600' },
                    { label: 'Tono y Estilo', value: scanPreview.tone, color: 'text-violet-600' },
                    { label: 'Ofertas detectadas', value: scanPreview.offers, color: 'text-amber-600', empty: 'No se detectaron ofertas activas' },
                    { label: 'FAQs detectadas', value: scanPreview.faq, color: 'text-emerald-600' },
                  ].map(row => (
                    <div key={row.label} className="space-y-0.5">
                      <p className={`text-[9px] font-black uppercase tracking-wide ${row.color}`}>{row.label}</p>
                      {row.value
                        ? <p className="text-[11px] text-zinc-700 dark:text-zinc-300 line-clamp-3 leading-relaxed">{row.value}</p>
                        : <p className="text-[11px] text-zinc-400 italic">{row.empty || 'No extraído'}</p>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            {!scanningAll && (
              <div className="p-5 pt-0 flex justify-end gap-2">
                {scanDone && (
                  <button onClick={() => { setShowScanModal(false); handleSaveSettings(); }}
                    className="flex items-center gap-1.5 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[12px] font-bold transition-all">
                    <Save className="w-3.5 h-3.5" />Guardar Cambios
                  </button>
                )}
                <button onClick={() => setShowScanModal(false)} className="px-5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-[12px] font-bold transition-all">
                  {scanDone ? 'Cerrar' : 'Cancelar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ CONTEXTO IA MODAL ════════ */}
      {showContextModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowContextModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-[480px] w-full shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10">
                  <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e4e4e7" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#8b5cf6" strokeWidth="3"
                      strokeDasharray={`${contextPct} ${100 - contextPct}`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-violet-600">{contextPct}%</span>
                </div>
                <div>
                  <p className="text-[15px] font-black text-zinc-900 dark:text-white">Contexto de IA</p>
                  <p className="text-[11px] text-zinc-400">{contextScore}/{sections.length} secciones completas</p>
                </div>
              </div>
              <button onClick={() => setShowContextModal(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2">
              {sections.map(s => {
                const filled = !!s.value;
                const colorMap: Record<string, string> = { blue: 'text-blue-500 bg-blue-500/10', violet: 'text-violet-500 bg-violet-500/10', amber: 'text-amber-500 bg-amber-500/10', emerald: 'text-emerald-500 bg-emerald-500/10', indigo: 'text-indigo-500 bg-indigo-500/10', pink: 'text-pink-500 bg-pink-500/10' };
                const preview = filled ? cleanPreview(s.value) : '';
                const platformLabel: Record<string, string> = { shopify: 'Shopify', wordpress: 'WooCommerce', tiendanube: 'Tiendanube' };
                return (
                  <div key={s.key} className={`flex items-center gap-3 p-3 rounded-xl ${filled ? 'bg-emerald-50/60 dark:bg-emerald-950/10' : 'bg-zinc-50 dark:bg-zinc-800/40'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorMap[s.color]}`}>
                      <s.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">{s.label}</p>
                      {!filled && <p className="text-[10px] text-zinc-400 leading-snug">{s.tip}</p>}
                      {filled && s.key === 'cat' && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold capitalize">
                          {platformLabel[s.value] || s.value} — La IA puede ver el catálogo
                        </p>
                      )}
                      {filled && s.key !== 'cat' && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate">{preview.slice(0, 70)}{preview.length > 70 ? '…' : ''}</p>
                      )}
                    </div>
                    {filled
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      : <div className="w-4 h-4 rounded-full border-2 border-zinc-300 dark:border-zinc-600 shrink-0" />}
                  </div>
                );
              })}
            </div>
            <div className="px-5 pb-5">
              <p className="text-[11px] text-zinc-400 text-center">Más secciones completas = respuestas de la IA más precisas y personalizadas</p>
            </div>
          </div>
        </div>
      )}
    </div>
    </CenteredPageLoader>
  );
}
