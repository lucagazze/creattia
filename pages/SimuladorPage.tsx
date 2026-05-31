import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { 
  TrendingUp, DollarSign, Percent, ShoppingBag, 
  ArrowUpRight, AlertTriangle, CheckCircle, Lightbulb,
  Zap, RefreshCw, BarChart2, Calculator, Info, HelpCircle,
  Search, Eye, ArrowDown, ChevronRight, Tag
} from 'lucide-react';

export default function SimuladorPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  // 1. Simulación Inputs State (Default values targeting ARS currency)
  const [spend, setSpend] = useState<number>(1000000); // Inversión mensual
  const [cpc, setCpc] = useState<number>(150); // Costo por clic
  const [ctr, setCtr] = useState<number>(1.5); // CTR
  const [convRate, setConvRate] = useState<number>(1.2); // Tasa de conversión
  const [aov, setAov] = useState<number>(45000); // Ticket promedio
  const [cogs, setCogs] = useState<number>(40); // Costo producto (COGS %)

  // Shopify Integration states
  const [shopifySearch, setShopifySearch] = useState('');
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [unitCost, setUnitCost] = useState<number>(18000); // Costo en ARS

  // 2. Scenario state preset helper
  const applyScenario = (type: 'conservative' | 'optimized' | 'scale' | 'cyber' | 'lanzamiento') => {
    setSelectedProduct(null);
    if (type === 'conservative') {
      setSpend(500000);
      setCpc(180);
      setCtr(1.0);
      setConvRate(0.8);
      setAov(38000);
      setCogs(45);
    } else if (type === 'optimized') {
      setSpend(1200000);
      setCpc(130);
      setCtr(2.2);
      setConvRate(1.8);
      setAov(48000);
      setCogs(35);
    } else if (type === 'scale') {
      setSpend(3000000);
      setCpc(160);
      setCtr(1.8);
      setConvRate(1.4);
      setAov(55000);
      setCogs(38);
    } else if (type === 'cyber') {
      setSpend(2500000);
      setCpc(220);
      setCtr(2.5);
      setConvRate(2.5);
      setAov(42000);
      setCogs(38);
    } else if (type === 'lanzamiento') {
      setSpend(300000);
      setCpc(160);
      setCtr(1.2);
      setConvRate(0.6);
      setAov(65000);
      setCogs(45);
    }
  };

  // Shopify Products fetch
  const searchShopifyProducts = useCallback(async (query: string) => {
    if (!profile?.shopify_domain || !profile?.shopify_access_token) return;
    setLoadingProducts(true);
    try {
      const cleanDomain = profile.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const url = `/api/shopify/products.json?limit=8${query ? `&title=${encodeURIComponent(query)}` : ''}`;
      const response = await fetch(url, {
        headers: {
          'x-shopify-domain': cleanDomain,
          'x-shopify-access-token': profile.shopify_access_token
        }
      });
      if (response.ok) {
        const data = await response.json();
        setShopifyProducts(data?.products || []);
      }
    } catch (err) {
      console.error('Error fetching shopify products in simulator:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, [profile?.shopify_domain, profile?.shopify_access_token]);

  useEffect(() => {
    if (profile?.shopify_domain && profile?.shopify_access_token) {
      searchShopifyProducts(shopifySearch);
    }
  }, [shopifySearch, searchShopifyProducts, profile?.shopify_domain, profile?.shopify_access_token]);

  // Handle Shopify Product Selection
  const handleSelectProduct = (prod: any) => {
    setSelectedProduct(prod);
    const variant = prod.variants?.[0];
    if (variant && variant.price) {
      const price = parseFloat(variant.price);
      if (!isNaN(price)) {
        setAov(Math.round(price));
        // Default unit cost at 40% of price
        const initialCost = Math.round(price * 0.4);
        setUnitCost(initialCost);
        setCogs(40);
      }
    }
  };

  // Sync unitCost when aov or cogs are manually tweaked
  useEffect(() => {
    if (aov > 0) {
      setUnitCost(Math.round(aov * (cogs / 100)));
    }
  }, [cogs, aov]);

  const handleUnitCostChange = (cost: number) => {
    setUnitCost(cost);
    if (aov > 0) {
      const computedCogs = Math.min(98, Math.max(2, Math.round((cost / aov) * 100)));
      setCogs(computedCogs);
    }
  };

  // 3. Computed calculations
  const clicks = Math.round(spend / Math.max(cpc, 1));
  const impressions = Math.round(clicks / Math.max(ctr / 100, 0.001));
  const sales = Math.round(clicks * (convRate / 100));
  const revenue = sales * aov;
  const costOfGoods = Math.round(revenue * (cogs / 100));
  const netProfit = revenue - spend - costOfGoods;
  
  const roas = spend > 0 ? Number((revenue / spend).toFixed(2)) : 0;
  const cpa = sales > 0 ? Math.round(spend / sales) : 0;
  const marginPercentage = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : 0;
  const roi = spend > 0 ? Number(((netProfit / spend) * 100).toFixed(1)) : 0;

  // Break Even Calculation
  const breakEvenRoas = cogs < 100 ? Number((1 / (1 - cogs / 100)).toFixed(2)) : 99.9;
  const isUnderBreakEven = roas < breakEvenRoas;

  // Format currencies
  const fmt = (val: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(val);
  };

  // 4. Generate AI Recommendations based on current values
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    const list = [];

    // ROAS / Break-even check
    if (isUnderBreakEven) {
      list.push({
        type: 'error',
        title: 'ROAS por debajo del Punto de Equilibrio (Break-Even)',
        desc: `Tu ROAS de ${roas}x es menor al ROAS mínimo de equilibrio (${breakEvenRoas}x) requerido por tus costos del ${cogs}%. Actualmente estás perdiendo dinero en términos netos. Detener la escala y optimizar costos o precios.`,
        metric: 'Break-Even',
        action: 'Reajustar precios o bajar inversión'
      });
    } else if (roas < 1.5) {
      list.push({
        type: 'error',
        title: 'ROAS Crítico e Insostenible',
        desc: `Tu ROAS de ${roas}x no llega a cubrir los gastos operativos de publicidad. Recomendamos detener la escala de presupuesto de forma inmediata y trabajar en mejorar la conversión del sitio web por encima de 1.8% o el CTR para bajar el CPC.`,
        metric: 'ROAS',
        action: 'Optimizar Landing Page y Anuncios'
      });
    } else if (roas >= 1.5 && roas < 3.0) {
      list.push({
        type: 'warning',
        title: 'Zona de Rentabilidad Limitada',
        desc: `Un ROAS de ${roas}x está cerca del punto de equilibrio. Sugerimos implementar estrategias de Up-selling y Cross-selling (combos) para subir el ticket promedio de ${fmt(aov)} a ${fmt(aov * 1.25)} y holgar los márgenes operativos.`,
        metric: 'Ticket Promedio',
        action: 'Crear Combos de Productos'
      });
    } else {
      list.push({
        type: 'success',
        title: 'ROAS Excelente para Escalar',
        desc: `El ROAS proyectado de ${roas}x supera holgadamente tu equilibrio de ${breakEvenRoas}x. Podés incrementar la inversión un 20% a 30% de forma segura para capturar mayor volumen de pedidos.`,
        metric: 'Escalamiento',
        action: 'Incrementar Presupuesto Ads'
      });
    }

    // Conversion rate analysis
    if (convRate < 1.0) {
      list.push({
        type: 'warning',
        title: 'Tasa de Conversión Web muy Baja',
        desc: `Una conversión de ${convRate}% indica fricciones importantes en el checkout o tráfico poco calificado. Sugerimos agilizar el carro de compras, simplificar el checkout y ofrecer envío gratis.`,
        metric: 'Conversión',
        action: 'Auditar Fricciones de Checkout'
      });
    } else if (convRate >= 2.0) {
      list.push({
        type: 'success',
        title: 'Embudo Web Altamente Optimizado',
        desc: `Tu tasa de conversión del ${convRate}% está muy por encima de la media de e-commerce. Felicitaciones, tu checkout y velocidad de carga web son sumamente eficientes.`,
        metric: 'Conversión',
        action: 'Mantener Optimización'
      });
    }

    // Cost of goods sold analysis
    if (cogs > 50) {
      list.push({
        type: 'error',
        title: 'Costo de Mercadería Elevado',
        desc: `Tu costo de producto del ${cogs}% representa una presión muy fuerte sobre las ganancias netas de la operación, reduciendo tu margen al ${marginPercentage}%. Sugerimos renegociar costos con proveedores o aumentar precios de lista un 10% a 15%.`,
        metric: 'Margen Neto',
        action: 'Ajuste de Precios o Proveedor'
      });
    }

    // CTR check
    if (ctr < 1.0) {
      list.push({
        type: 'warning',
        title: 'CTR de Anuncios Bajo (Poca Relevancia)',
        desc: `Un CTR de ${ctr}% refleja anuncios con poca tasa de clic. Esto encarece tu CPC actual de ${fmt(cpc)}. Probá cambiar los ganchos iniciales en video (primeros 3 segundos) o refrescar las creatividades visuales para subirlo a 1.8%.`,
        metric: 'CTR',
        action: 'Renovar Creativos Ads'
      });
    }

    setRecommendations(list);
  }, [spend, cpc, ctr, convRate, aov, cogs, roas, marginPercentage, breakEvenRoas, isUnderBreakEven]);

  return (
    <div className="p-6 space-y-6 bg-[#f5f5f7] dark:bg-[#0a0a0a] min-h-screen text-zinc-800 dark:text-zinc-100 select-none animate-in fade-in duration-200">
      
      {/* Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Calculator className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            Simulador Financiero y Planificador de Escala
          </h1>
          <p className="text-[12px] text-zinc-550 dark:text-zinc-400 mt-1">
            Proyectá el retorno real y las ganancias netas de tu inversión en Meta Ads cruzando CPC y conversión con los precios de tu catálogo Shopify.
          </p>
        </div>

        {/* Preset Scenarios Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mr-1">Preajustes:</span>
          <button 
            onClick={() => applyScenario('conservative')}
            className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 border border-zinc-250 dark:border-zinc-800 rounded-xl text-[11px] font-bold transition-all hover:scale-[1.02]"
          >
            📉 Conservador
          </button>
          <button 
            onClick={() => applyScenario('optimized')}
            className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 border border-zinc-250 dark:border-zinc-800 rounded-xl text-[11px] font-bold transition-all hover:scale-[1.02]"
          >
            📈 Optimizado
          </button>
          <button 
            onClick={() => applyScenario('scale')}
            className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 border border-zinc-250 dark:border-zinc-800 rounded-xl text-[11px] font-bold transition-all hover:scale-[1.02]"
          >
            🚀 Escala
          </button>
          <button 
            onClick={() => applyScenario('cyber')}
            className="px-3.5 py-1.5 bg-purple-650 hover:bg-purple-700 text-white rounded-xl text-[11px] font-bold shadow-sm transition-all hover:scale-[1.02]"
          >
            ⚡ CyberMonday
          </button>
          <button 
            onClick={() => applyScenario('lanzamiento')}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black shadow-sm transition-all hover:scale-[1.02]"
          >
            🚀 Lanzamiento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Inputs & Shopify Catalog Integration (span 5) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Section: Variables de Entrada */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl p-5 space-y-5 shadow-sm">
            <h2 className="text-[13px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-900 pb-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Variables de Entrada
            </h2>

            {/* Input 1: Inversión publicitaria */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-600 dark:text-zinc-400">Presupuesto Ads Mensual</label>
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                  <span className="text-[10px] text-zinc-400">$</span>
                  <input 
                    type="number" 
                    value={spend} 
                    onChange={e => setSpend(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-24 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                  />
                </div>
              </div>
              <input 
                type="range" 
                min={50000} 
                max={5000000} 
                step={50000}
                value={spend} 
                onChange={e => setSpend(parseInt(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
              />
              <div className="flex justify-between text-[9px] text-zinc-450 font-mono">
                <span>$50k</span>
                <span>$2.5M</span>
                <span>$5.0M</span>
              </div>
            </div>

            {/* Input 2: CPC */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-600 dark:text-zinc-400">Costo por Clic (CPC)</label>
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                  <span className="text-[10px] text-zinc-400">$</span>
                  <input 
                    type="number" 
                    value={cpc} 
                    onChange={e => setCpc(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                  />
                </div>
              </div>
              <input 
                type="range" 
                min={10} 
                max={600} 
                step={5}
                value={cpc} 
                onChange={e => setCpc(parseInt(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
              />
              <div className="flex justify-between text-[9px] text-zinc-450 font-mono">
                <span>$10</span>
                <span>$300</span>
                <span>$600</span>
              </div>
            </div>

            {/* Input 3: CTR */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-600 dark:text-zinc-400">CTR (Click-Through Rate)</label>
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                  <input 
                    type="number" 
                    step={0.1}
                    value={ctr} 
                    onChange={e => setCtr(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                    className="w-16 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                  />
                  <span className="text-[10px] text-zinc-400">%</span>
                </div>
              </div>
              <input 
                type="range" 
                min={0.2} 
                max={5.0} 
                step={0.1}
                value={ctr} 
                onChange={e => setCtr(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
              />
              <div className="flex justify-between text-[9px] text-zinc-450 font-mono">
                <span>0.2%</span>
                <span>2.6%</span>
                <span>5.0%</span>
              </div>
            </div>

            {/* Input 4: Tasa conversión */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-600 dark:text-zinc-400">Tasa Conversión Tienda</label>
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                  <input 
                    type="number" 
                    step={0.1}
                    value={convRate} 
                    onChange={e => setConvRate(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                    className="w-16 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                  />
                  <span className="text-[10px] text-zinc-400">%</span>
                </div>
              </div>
              <input 
                type="range" 
                min={0.1} 
                max={5.0} 
                step={0.1}
                value={convRate} 
                onChange={e => setConvRate(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
              />
              <div className="flex justify-between text-[9px] text-zinc-450 font-mono">
                <span>0.1%</span>
                <span>2.5%</span>
                <span>5.0%</span>
              </div>
            </div>

            {/* Input 5: Ticket promedio (AOV) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-650 dark:text-zinc-400 flex items-center gap-1">
                  Ticket Promedio (AOV)
                  {selectedProduct && <span className="text-[9px] text-purple-500 font-bold">(Shopify)</span>}
                </label>
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                  <span className="text-[10px] text-zinc-400">$</span>
                  <input 
                    type="number" 
                    value={aov} 
                    onChange={e => setAov(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                  />
                </div>
              </div>
              <input 
                type="range" 
                min={5000} 
                max={250000} 
                step={2500}
                value={aov} 
                onChange={e => setAov(parseInt(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
              />
              <div className="flex justify-between text-[9px] text-zinc-450 font-mono">
                <span>$5,000</span>
                <span>$127,500</span>
                <span>$250,000</span>
              </div>
            </div>

            {/* Input 6: Costo de Mercadería (COGS) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-600 dark:text-zinc-400">Costo de Mercadería (COGS)</label>
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                  <input 
                    type="number" 
                    value={cogs} 
                    onChange={e => setCogs(Math.min(98, Math.max(2, parseInt(e.target.value) || 2)))}
                    className="w-16 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                  />
                  <span className="text-[10px] text-zinc-400">%</span>
                </div>
              </div>
              <input 
                type="range" 
                min={5} 
                max={90} 
                step={1}
                value={cogs} 
                onChange={e => setCogs(parseInt(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
              />
              <div className="flex justify-between text-[9px] text-zinc-450 font-mono">
                <span>5% (Alto Margen)</span>
                <span>47%</span>
                <span>90% (Bajo Margen)</span>
              </div>
            </div>

            {/* Costo unitario en pesos - calculator */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-900 flex justify-between items-center text-[11px] bg-zinc-50/50 dark:bg-zinc-900/20 p-2.5 rounded-xl">
              <div>
                <span className="text-zinc-500 block font-semibold">Costo Unitario Proyectado</span>
                <span className="text-[10px] text-zinc-400">Calculado en base a ticket y COGS</span>
              </div>
              <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-700 px-2 py-0.5 rounded-lg">
                <span className="text-[10px] text-zinc-400">$</span>
                <input 
                  type="number" 
                  value={unitCost} 
                  onChange={e => handleUnitCostChange(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 bg-transparent text-right focus:outline-none text-[11px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                />
              </div>
            </div>
          </div>

          {/* Shopify catalog integration card */}
          {profile?.shopify_domain && profile?.shopify_access_token && (
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl p-5 shadow-sm space-y-4 animate-in slide-in-from-bottom-2 duration-300">
              <h2 className="text-[13px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-900 pb-2">
                <ShoppingBag className="w-4 h-4 text-purple-500" />
                Catálogo Shopify Activo
              </h2>
              <p className="text-[10px] text-zinc-450 dark:text-zinc-400 leading-relaxed">
                Seleccioná un producto de tu tienda real para importar su precio de venta al simulador y proyectar su escala.
              </p>

              {/* Product search box */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar producto de tu tienda..." 
                  value={shopifySearch}
                  onChange={e => setShopifySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[11.5px] focus:outline-none focus:ring-1 focus:ring-purple-500/25 focus:border-purple-500 text-zinc-750 dark:text-zinc-300"
                />
              </div>

              {/* Product list */}
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                {loadingProducts ? (
                  <div className="text-center py-4 text-[11px] text-zinc-450 flex items-center justify-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-500" /> Cargando catálogo...
                  </div>
                ) : shopifyProducts.length === 0 ? (
                  <div className="text-center py-4 text-[11px] text-zinc-400">No se encontraron productos</div>
                ) : (
                  shopifyProducts.map((p) => {
                    const variant = p.variants?.[0];
                    const price = variant ? parseFloat(variant.price) : 0;
                    const isSelected = selectedProduct?.id === p.id;
                    return (
                      <div 
                        key={p.id}
                        onClick={() => handleSelectProduct(p)}
                        className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-purple-50/50 dark:bg-purple-950/10 border-purple-200 dark:border-purple-800/40 text-purple-900 dark:text-purple-300' 
                            : 'bg-zinc-50/45 dark:bg-zinc-900/35 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/30'
                        }`}
                      >
                        {p.image?.src ? (
                          <img src={p.image.src} alt={p.title} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] flex-shrink-0">📦</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold truncate leading-snug">{p.title}</p>
                          <span className="text-[9.5px] font-bold font-mono opacity-70">{fmt(price)}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selected product Cost unit settings */}
              {selectedProduct && (
                <div className="p-3 bg-purple-50/40 dark:bg-purple-950/5 border border-purple-100/50 dark:border-purple-900/10 rounded-2xl space-y-2.5 animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-purple-650 uppercase tracking-wider flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" /> Producto Seleccionado
                    </span>
                    <button 
                      onClick={() => setSelectedProduct(null)}
                      className="text-[9.5px] text-zinc-400 hover:text-red-500 font-bold"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-zinc-650 truncate max-w-[180px]">{selectedProduct.title}</span>
                    <span className="font-mono font-bold text-zinc-750">{fmt(aov)}</span>
                  </div>

                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-purple-100/30 dark:border-purple-900/10">
                    <div className="text-[10px] text-zinc-450 dark:text-zinc-400">
                      <span>Costo unitario real de compra</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-purple-200/50 dark:border-purple-800/40 px-2 py-0.5 rounded-lg">
                      <span className="text-[9.5px] text-zinc-400">$</span>
                      <input 
                        type="number" 
                        value={unitCost} 
                        onChange={e => handleUnitCostChange(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 bg-transparent text-right focus:outline-none text-[10.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
        
        {/* RIGHT COLUMN: Results, Funnel, Warnings & Recommendations (span 7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Main Results Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            
            {/* Box 1: ROAS */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[105px]">
              <span className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block">ROAS Proyectado</span>
              <p className={`text-2xl font-black mt-1 ${
                isUnderBreakEven ? 'text-red-500 animate-pulse' : roas >= 3.0 ? 'text-emerald-500' : 'text-zinc-800 dark:text-zinc-100'
              }`}>
                {roas}x
              </p>
              <div className="flex items-center justify-between text-[9px] font-black mt-1">
                {isUnderBreakEven ? (
                  <span className="text-red-500 uppercase">Pérdida Neto</span>
                ) : roas >= 3.0 ? (
                  <span className="text-emerald-500 uppercase">Rentable</span>
                ) : (
                  <span className="text-amber-500 uppercase font-semibold">Break-Even</span>
                )}
                <TrendingUp className="w-3.5 h-3.5 opacity-30" />
              </div>
            </div>

            {/* Box 2: Facturación */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[105px]">
              <span className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block">Facturación</span>
              <p className="text-2xl font-black mt-1 text-zinc-850 dark:text-zinc-100 truncate">
                {fmt(revenue)}
              </p>
              <span className="text-[9px] text-zinc-400 font-bold block mt-1">{sales} ventas estimadas</span>
            </div>

            {/* Box 3: Ganancia Neta */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[105px]">
              <span className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block">Ganancia Neta</span>
              <p className={`text-2xl font-black mt-1 ${
                netProfit < 0 ? 'text-red-500' : 'text-emerald-500'
              }`}>
                {fmt(netProfit)}
              </p>
              <span className="text-[9px] text-zinc-400 font-bold mt-1">Margen neto: {marginPercentage}%</span>
            </div>

            {/* Box 4: CPA */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[105px]">
              <span className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block">CPA Proyectado</span>
              <p className="text-2xl font-black mt-1 text-zinc-850 dark:text-zinc-100 truncate">
                {fmt(cpa)}
              </p>
              <span className="text-[9px] text-zinc-400 font-bold mt-1">{clicks.toLocaleString('es-AR')} clics ({ctr}% CTR)</span>
            </div>

          </div>

          {/* Break Even Info Alert Panel */}
          <div className={`p-4 rounded-3xl border flex items-center justify-between gap-3 ${
            isUnderBreakEven 
              ? 'bg-red-50/55 dark:bg-red-955/5 border-red-100 dark:border-red-950/20 text-red-900 dark:text-red-400' 
              : 'bg-zinc-55/45 dark:bg-zinc-900/10 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
          }`}>
            <div className="flex items-center gap-2.5">
              <Info className={`w-5 h-5 flex-shrink-0 ${isUnderBreakEven ? 'text-red-550' : 'text-zinc-400'}`} />
              <div>
                <p className="text-[11.5px] font-bold">Punto de Equilibrio Financiero (Break-Even)</p>
                <p className="text-[10.5px] opacity-80 leading-relaxed">
                  Para cubrir tus costos de producto del {cogs}%, requerís un ROAS mínimo de <span className="font-bold">{breakEvenRoas}x</span>. Tu ROAS proyectado es <span className="font-bold">{roas}x</span>.
                </p>
              </div>
            </div>
            {isUnderBreakEven && (
              <span className="px-2.5 py-1 text-[9px] font-black uppercase bg-red-100 dark:bg-red-500/10 text-red-650 dark:text-red-450 rounded-xl">Critico</span>
            )}
          </div>

          {/* Pipeline Sales Funnel Diagram */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-[12px] font-black text-zinc-450 uppercase tracking-widest">Embudo Comercial Proyectado</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Funnel chart (span 4) */}
              <div className="md:col-span-5 flex justify-center">
                <svg className="w-full max-w-[200px] h-[190px]" viewBox="0 0 100 100" fill="none">
                  {/* Step 1: Impressions */}
                  <polygon points="5,5 95,5 80,30 20,30" fill="url(#impressionsGrad)" opacity="0.85" />
                  {/* Step 2: Clicks */}
                  <polygon points="20,32 80,32 65,65 35,65" fill="url(#clicksGrad)" opacity="0.85" />
                  {/* Step 3: Sales */}
                  <polygon points="35,67 65,67 55,95 45,95" fill="url(#salesGrad)" opacity="0.9" />

                  {/* Gradients */}
                  <defs>
                    <linearGradient id="impressionsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#71717a" />
                      <stop offset="100%" stopColor="#52525b" />
                    </linearGradient>
                    <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>

                  {/* Text tags */}
                  <text x="50" y="18" fill="#fff" fontSize="5" fontWeight="bold" textAnchor="middle">Impresiones</text>
                  <text x="50" y="49" fill="#fff" fontSize="5" fontWeight="bold" textAnchor="middle">Clics</text>
                  <text x="50" y="82" fill="#fff" fontSize="5" fontWeight="bold" textAnchor="middle">Ventas</text>
                </svg>
              </div>

              {/* Data checklist (span 7) */}
              <div className="md:col-span-7 space-y-4">
                {/* Funnel Level 1: Impressions */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-zinc-550 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> 1. Visualizaciones (Impresiones)
                    </span>
                    <span className="font-mono">{impressions.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5">
                    <div className="bg-zinc-450 h-1.5 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>

                {/* Funnel Level 2: Clicks */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-blue-500 flex items-center gap-1">
                      <ChevronRight className="w-3.5 h-3.5" /> 2. Clics / Visitas ({ctr}% CTR)
                    </span>
                    <span className="font-mono">{clicks.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(8, (clicks/Math.max(impressions,1))*100*4))}%` }}></div>
                  </div>
                </div>

                {/* Funnel Level 3: Purchases */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-emerald-500 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> 3. Compras estimadas ({convRate}% conversión)
                    </span>
                    <span className="font-mono">{sales.toLocaleString('es-AR')} ventas</span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-1.5">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(4, (sales/Math.max(clicks,1))*100*12))}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial breakdown */}
            <div className="border-t border-zinc-100 dark:border-zinc-900 pt-3.5 grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-zinc-400 font-bold block">Inversión Ads</span>
                <span className="text-[12px] font-black text-red-500">-{fmt(spend)}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 font-bold block">Costo de Producto</span>
                <span className="text-[12px] font-black text-red-400">-{fmt(costOfGoods)}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 font-bold block">Retorno (ROI)</span>
                <span className={`text-[12px] font-black ${roi < 0 ? 'text-red-500' : 'text-emerald-500'}`}>{roi}%</span>
              </div>
            </div>

          </div>

          {/* AI Insights and Advice Section */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-sm space-y-4">
            <h2 className="text-[13px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-900 pb-2">
              <Lightbulb className="w-4 h-4 text-violet-500 animate-pulse" />
              Recomendaciones del Copiloto Financiero
            </h2>

            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <div 
                  key={i} 
                  className={`p-3.5 rounded-2xl border flex items-start gap-3 transition-all animate-in slide-in-from-top-1 duration-200 ${
                    rec.type === 'error' 
                      ? 'bg-red-50/45 dark:bg-red-955/5 border-red-100 dark:border-red-950/20 text-red-900 dark:text-red-300' 
                      : rec.type === 'success'
                        ? 'bg-emerald-50/45 dark:bg-emerald-955/5 border-emerald-100 dark:border-emerald-950/20 text-emerald-900 dark:text-emerald-300'
                        : 'bg-amber-50/45 dark:bg-amber-955/5 border-amber-100 dark:border-amber-950/20 text-amber-900 dark:text-amber-300'
                  }`}
                >
                  <div className="mt-0.5">
                    {rec.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    {rec.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                    {rec.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-[12px] font-black tracking-tight">{rec.title}</p>
                      <span className="text-[9px] font-black uppercase bg-black/[0.04] dark:bg-white/[0.04] px-1.5 py-0.5 rounded-full">{rec.metric}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">{rec.desc}</p>
                    <div className="pt-1 flex items-center gap-1 text-[9.5px] font-bold">
                      <span className="opacity-60">Acción recomendada:</span>
                      <span className="underline">{rec.action}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
