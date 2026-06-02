import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { db } from '../services/db';
import { useToast } from '../components/Toast';
import {
  Brain, Globe, Save, RefreshCw, Sparkles, FileText, CheckCircle2,
  ShieldAlert, ArrowUpRight, Instagram, Facebook, Calendar, AlertCircle,
  ShoppingBag, Package, Tag, ExternalLink, Search
} from 'lucide-react';
import { AppleLoader } from '../components/ui/AppleLoader';

export default function CerebroPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const { showToast } = useToast();

  const [businessDescription, setBusinessDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [scrapedContent, setScrapedContent] = useState('');
  const [instagramContext, setInstagramContext] = useState('');
  const [brainUpdatedAt, setBrainUpdatedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'web' | 'social'>('web');
  const [scanStep, setScanStep] = useState<string>('');

  // Products state (fetched live from ecommerce platform)
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setBusinessDescription(profile.business_description || '');
    setCustomInstructions(profile.custom_instructions || '');
    setWebsiteUrl(profile.website_url || '');
    setScrapedContent(profile.scraped_content || '');
    setInstagramContext(profile.instagram_context || '');
    setBrainUpdatedAt(profile.brain_updated_at || null);
    setLoading(false);
    // Auto-load products if platform configured
    if ((profile as any).ecommerce_platform && ((profile as any).shopify_domain || (profile as any).wordpress_url || (profile as any).tiendanube_store_id)) {
      loadProducts(profile);
    }
  }, [profile]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      const nowTimestamp = new Date().toISOString();
      await db.clients.updateField(profile.id, {
        business_description: businessDescription,
        custom_instructions: customInstructions,
        website_url: websiteUrl,
        brain_updated_at: nowTimestamp,
      });
      setBrainUpdatedAt(nowTimestamp);
      showToast('Configuración del cerebro guardada exitosamente.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Error al guardar la configuración: ' + err.message, 'error');
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
      let loaded: any[] = [];

      // Proxy via /api/products to avoid CORS on browser-side calls
      const body: any = { platform };
      if (platform === 'shopify') {
        body.shopify_domain = (p as any).shopify_domain;
        body.shopify_access_token = (p as any).shopify_access_token;
      } else if (platform === 'wordpress') {
        body.wordpress_url = (p as any).wordpress_url;
        body.woo_consumer_key = (p as any).woo_consumer_key;
        body.woo_consumer_secret = (p as any).woo_consumer_secret;
      } else if (platform === 'tiendanube') {
        body.tiendanube_store_id = (p as any).tiendanube_store_id;
        body.tiendanube_access_token = (p as any).tiendanube_access_token;
      }
      const proxyRes = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!proxyRes.ok) {
        const errData = await proxyRes.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${proxyRes.status}`);
      }
      const proxyData = await proxyRes.json();
      loaded = proxyData.products || [];

      setProducts(loaded);
      if (!loaded.length) setProductsError('No se encontraron productos activos');
    } catch (err: any) {
      setProductsError(err.message || 'Error al cargar productos');
    } finally {
      setProductsLoading(false);
    }
  };

  const handleScanAndTrainAll = async () => {
    if (!profile || !websiteUrl.trim()) {
      showToast('Por favor, ingresa una URL web válida antes de escanear.', 'warning');
      return;
    }

    setScanningAll(true);
    setScanStep('Iniciando escaneo...');
    showToast('Iniciando escaneo de Sitio Web y Redes Sociales. Esto puede tardar hasta un minuto...', 'info');
    
    try {
      // Step feedback animation simulation
      const steps = [
        'Escanenado sitio web (Home y páginas de políticas)...',
        'Conectando con feeds de Instagram y Facebook...',
        'Consolidando datos extraídos de la marca...',
        'Optimizando catálogo e instrucciones con Inteligencia Artificial...',
        'Guardando conocimiento entrenado en el Cerebro...'
      ];

      let stepIndex = 0;
      setScanStep(steps[0]);
      const interval = setInterval(() => {
        if (stepIndex < steps.length - 1) {
          stepIndex++;
          setScanStep(steps[stepIndex]);
        }
      }, 7000);

      const response = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: profile.id,
          url: websiteUrl,
        }),
      });

      clearInterval(interval);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error desconocido al escanear y entrenar.');
      }

      setScrapedContent(data.scraped_content || '');
      setInstagramContext(data.instagram_context || '');
      setBusinessDescription(data.business_description || '');
      setCustomInstructions(data.custom_instructions || '');
      setBrainUpdatedAt(data.brain_updated_at || null);
      
      showToast('¡Cerebro entrenado completamente! Se actualizaron la web, las redes sociales, el catálogo y las pautas de tono.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error al entrenar el cerebro', 'error');
    } finally {
      setScanningAll(false);
      setScanStep('');
    }
  };

  const formatLastSaved = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca escaneado';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('es-AR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' hs';
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) {
    return <AppleLoader variant="page" />;
  }

  return (
    <div className="w-full space-y-8 pt-6 px-4 md:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-3 duration-400">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              <Brain className="w-6 h-6 text-violet-500 animate-pulse" />
              Cerebro de IA
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 tracking-wider uppercase">
              BETA
            </span>
          </div>
          <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1 font-medium max-w-2xl">
            Alimenta la base de conocimiento y define las pautas de tono para que el asistente de IA responda de forma personalizada e inteligente sobre tu negocio.
          </p>
        </div>

        {isViewingAs && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-400 text-[11px] font-bold">
            <ShieldAlert className="w-4 h-4" />
            <span>Modo Administrador Activo</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form Settings */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-sm overflow-hidden transition-colors duration-300">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-[18px] h-[18px] text-zinc-400" />
                  Contexto Manual del Negocio
                </h2>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Define las pautas de comportamiento y catálogo manualmente si deseas complementarlas.
                </p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Website Input first as it is critical */}
              <div className="space-y-2">
                <label className="block text-[12px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Enlace del Sitio Web / Tienda Shopify
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://www.mitienda.com"
                      className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-medium"
                    />
                  </div>
                  {websiteUrl && (
                    <a
                      href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-100 transition-all active:scale-95"
                      title="Visitar sitio"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-normal">
                  Ingresá la URL principal de tu tienda. Es indispensable para que el escáner web pueda rastrear tus productos y políticas.
                </p>
              </div>

              {/* Business Description / Catalog */}
              <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                <label className="block text-[12px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Catálogo, Ofertas y Preguntas Clave (Contexto Oficial)
                </label>
                <textarea
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  placeholder="Ej: Vendemos calzado de cuero artesanal en Argentina. Ofrecemos 3 cuotas sin interés y envíos gratis a partir de $80.000. Los cambios se realizan dentro de los 30 días en nuestros locales..."
                  className="w-full min-h-[160px] p-4 text-[13px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-y leading-relaxed font-medium"
                />
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-normal">
                  Detalla aquí información de tus productos, promociones, políticas y respuestas frecuentes específicas que quieras que el bot use de manera prioritaria.
                </p>
              </div>

              {/* Custom Tone Instructions */}
              <div className="space-y-2">
                <label className="block text-[12px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Instrucciones de Tono y Comportamiento (AI System Rules)
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Ej: Responde siempre con tono alegre, joven e informal. Utiliza el voseo argentino (ej: 'mirá', 'comprá'). Evita sonar robótico. Usa emojis de manera moderada."
                  className="w-full min-h-[120px] p-4 text-[13px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-y leading-relaxed font-medium"
                />
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-normal">
                  Define el estilo de redacción, restricciones de vocabulario o cómo tratar al cliente. El voseo argentino es el tono por defecto altamente recomendado.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[13px] font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 active:scale-[0.98]"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-white dark:border-t-zinc-900 rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? 'Guardando...' : 'Guardar Configuración Manual'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Scraper & Brain Training Hub */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Main unified training center */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-sm p-6 space-y-6 transition-colors duration-300">
            <div>
              <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-[18px] h-[18px] text-violet-500" />
                Entrenamiento Automático Completo
              </h2>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                Escanea tu tienda y tus redes sociales simultáneamente para entrenar a tu IA.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-violet-50/50 dark:bg-violet-500/5 border border-violet-100/60 dark:border-violet-500/10 space-y-3">
              <p className="text-[11.5px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Este proceso unificado rastrea tu <strong>sitio web</strong> (productos, envíos, FAQs) y tus <strong>redes sociales vinculadas</strong>. Luego, consolida todo en el cerebro y genera las pautas de tono automáticas.
              </p>
              
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  <div className={`w-2 h-2 rounded-full ${websiteUrl ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                  <span>Sitio Web: {websiteUrl ? 'Listo para escanear' : 'No configurado'}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  <div className={`w-2 h-2 rounded-full ${(profile as any)?.ig_business_id ? 'bg-pink-500' : 'bg-zinc-300'}`} />
                  <span>Instagram: {(profile as any)?.ig_username ? `@${(profile as any).ig_username}` : 'No vinculado'}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  <div className={`w-2 h-2 rounded-full ${(profile as any)?.fb_page_id ? 'bg-blue-500' : 'bg-zinc-300'}`} />
                  <span>Facebook Page: {(profile as any)?.fb_page_name ? (profile as any).fb_page_name : ((profile as any)?.fb_page_id ? 'Vinculada' : 'No vinculada')}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleScanAndTrainAll}
                disabled={scanningAll || !websiteUrl.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-[13px] font-bold shadow-lg shadow-violet-500/20 flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"
              >
                {scanningAll ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Entrenando Cerebro...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>⚡ Escanear y Entrenar Todo</span>
                  </div>
                )}
              </button>

              {scanningAll && scanStep && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-150 dark:border-zinc-800 text-center animate-pulse">
                  <p className="text-[11px] font-bold text-violet-600 dark:text-violet-400">
                    {scanStep}
                  </p>
                </div>
              )}

              {/* Last update details */}
              <div className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-800/80 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                <span>Último entrenamiento:</span>
                <span className="font-bold text-zinc-700 dark:text-zinc-300">
                  {formatLastSaved(brainUpdatedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Consolidate Memory Previews using tabs */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-sm overflow-hidden transition-colors duration-300">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-[18px] h-[18px] text-emerald-500" />
                Conocimiento Consolidado en Memoria
              </h2>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                Información extraída y resumida que actualmente lee el asistente de IA.
              </p>
            </div>

            {/* Premium Tab Selector */}
            <div className="flex border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
              <button
                type="button"
                onClick={() => setActiveTab('web')}
                className={`flex-1 py-3 text-[12px] font-bold transition-all border-b-2 ${
                  activeTab === 'web'
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-white dark:bg-zinc-900'
                    : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  Sitio Web
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('social')}
                className={`flex-1 py-3 text-[12px] font-bold transition-all border-b-2 ${
                  activeTab === 'social'
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-white dark:bg-zinc-900'
                    : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-pink-500" />
                  Instagram & Facebook
                </div>
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'web' ? (
                scrapedContent ? (
                  <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl p-4 max-h-[300px] overflow-y-auto text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line font-medium scrollbar-hide">
                    {scrapedContent}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/80 flex items-center justify-center">
                      <Globe className="w-6 h-6 text-zinc-300 dark:text-zinc-700" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-zinc-500 dark:text-zinc-400">Sin contenido web escaneado</p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs mt-1 leading-normal">
                        Haz clic en "⚡ Escanear y Entrenar Todo" para rastrear tu sitio e importar el conocimiento.
                      </p>
                    </div>
                  </div>
                )
              ) : (
                instagramContext ? (
                  <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/50 dark:border-zinc-800/50 rounded-xl p-4 max-h-[300px] overflow-y-auto text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line font-medium scrollbar-hide">
                    {instagramContext}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/80 flex items-center justify-center">
                      <Instagram className="w-6 h-6 text-zinc-300 dark:text-zinc-700" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-zinc-500 dark:text-zinc-400">Sin contenido social sincronizado</p>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs mt-1 leading-normal">
                        La IA no ha cargado el feed de tus redes. Al hacer clic en "⚡ Escanear y Entrenar Todo" se rastrearán tus publicaciones.
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* ── PRODUCTS SECTION ── */}
        {(profile as any)?.ecommerce_platform && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-black text-zinc-900 dark:text-white">Productos de la Tienda</h2>
                    {products.length > 0 && (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                        {products.length} activos
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 capitalize">{(profile as any).ecommerce_platform}</p>
                </div>
              </div>
              <button
                onClick={() => loadProducts()}
                disabled={productsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${productsLoading ? 'animate-spin' : ''}`} />
                {productsLoading ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>

            {productsLoading && (
              <div className="flex items-center justify-center py-12 gap-3">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                <span className="text-[12px] text-zinc-400">Importando productos...</span>
              </div>
            )}

            {productsError && !productsLoading && (
              <div className="p-4 m-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-[12px] text-red-600 dark:text-red-400">{productsError}</div>
            )}

            {products.length > 0 && !productsLoading && (
              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[12px] text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {products
                    .filter(p => !productSearch || p.title.toLowerCase().includes(productSearch.toLowerCase()) || (p.type || '').toLowerCase().includes(productSearch.toLowerCase()) || (p.tags || '').toLowerCase().includes(productSearch.toLowerCase()))
                    .map((p) => {
                      const isExpanded = expandedProduct === String(p.id);
                      const minPrice = p.variants?.length > 0 ? Math.min(...p.variants.map((v: any) => parseFloat(v.price) || 0)) : 0;
                      const maxPrice = p.variants?.length > 0 ? Math.max(...p.variants.map((v: any) => parseFloat(v.price) || 0)) : 0;
                      const priceStr = minPrice === maxPrice ? `$${minPrice.toFixed(2)}` : `$${minPrice.toFixed(2)} – $${maxPrice.toFixed(2)}`;
                      return (
                        <div key={p.id} className="border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedProduct(isExpanded ? null : String(p.id))}
                            className="w-full flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                          >
                            {p.image ? (
                              <img src={p.image} alt={p.title} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-zinc-100 dark:border-zinc-800" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-zinc-400" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-bold text-zinc-900 dark:text-white truncate">{p.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {p.type && <span className="text-[9px] text-zinc-400 font-medium">{p.type}</span>}
                                {p.variants?.length > 1 && <span className="text-[9px] text-zinc-400">{p.variants.length} variantes</span>}
                              </div>
                            </div>
                            <span className="text-[12px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">{priceStr}</span>
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 space-y-2.5 border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
                              {p.description && (
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{p.description}</p>
                              )}
                              {p.tags && (
                                <p className="text-[10px] text-zinc-400"><span className="font-bold">Tags:</span> {p.tags}</p>
                              )}
                              {p.variants?.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Variantes</p>
                                  <div className="grid grid-cols-1 gap-1">
                                    {p.variants.map((v: any, vi: number) => (
                                      <div key={vi} className="flex items-center justify-between px-2 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 text-[11px]">
                                        <span className="text-zinc-600 dark:text-zinc-300 font-medium">{v.title || 'Única'}{v.sku ? ` · SKU: ${v.sku}` : ''}</span>
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${v.available ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-950 text-red-500'}`}>
                                            {v.available ? 'Stock' : 'Sin stock'}
                                          </span>
                                          <span className="font-black text-zinc-900 dark:text-white">${parseFloat(v.price || 0).toFixed(2)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {p.url && (
                                <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-violet-500 hover:underline font-bold">
                                  <ExternalLink className="w-2.5 h-2.5" /> Ver en tienda
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {products.filter(p => !productSearch || p.title.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                    <p className="text-[12px] text-zinc-400 text-center py-6">Sin resultados para "{productSearch}"</p>
                  )}
                </div>
              </div>
            )}

            {!productsLoading && !productsError && products.length === 0 && (
              <div className="p-8 text-center">
                <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-[12px] text-zinc-400">Hacé clic en "Actualizar" para cargar los productos</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
