import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { 
  TrendingUp, DollarSign, Percent, ShoppingBag, 
  AlertTriangle, CheckCircle, Lightbulb,
  Zap, RefreshCw, Calculator, Info,
  Search, ChevronRight, HelpCircle
} from 'lucide-react';

export default function SimuladorPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  // 1. Simulación Inputs State (Default values in ARS)
  const [spend, setSpend] = useState<number>(1000000); // Inversión mensual en Ads
  const [roas, setRoas] = useState<number>(3.0); // ROAS estimado
  const [aov, setAov] = useState<number>(45000); // Precio de Venta (Ticket Promedio)
  const [unitCost, setUnitCost] = useState<number>(18000); // Costo unitario del producto
  const [shippingCost, setShippingCost] = useState<number>(4500); // Costo de envío unitario
  const [freeShipping, setFreeShipping] = useState<boolean>(true); // ¿Envío gratis al cliente?
  const [gatewayFee, setGatewayFee] = useState<number>(5.0); // Comisión de pasarela (e.g. MP, 5%)

  // Shopify Integration states
  const [shopifySearch, setShopifySearch] = useState('');
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Scenario presets
  const applyPreset = (type: 'conservative' | 'optimized' | 'scale') => {
    setSelectedProduct(null);
    if (type === 'conservative') {
      setSpend(400000);
      setRoas(1.8);
      setAov(35000);
      setUnitCost(18000);
      setShippingCost(4500);
      setFreeShipping(true);
      setGatewayFee(5.5);
    } else if (type === 'optimized') {
      setSpend(1200000);
      setRoas(3.2);
      setAov(45000);
      setUnitCost(16000);
      setShippingCost(4000);
      setFreeShipping(true);
      setGatewayFee(4.5);
    } else if (type === 'scale') {
      setSpend(3500000);
      setRoas(2.6);
      setAov(55000);
      setUnitCost(19000);
      setShippingCost(4500);
      setFreeShipping(true);
      setGatewayFee(4.5);
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
        setUnitCost(Math.round(price * 0.4));
      }
    }
  };

  // Calculations
  const revenue = spend * roas; // Facturación total = Inversión * ROAS
  const sales = aov > 0 ? Math.round(revenue / aov) : 0; // Pedidos estimados
  
  const costOfGoods = sales * unitCost; // Costo de compra total
  const shippingExpense = freeShipping ? (sales * shippingCost) : 0; // Costo de envío si lo absorbe la marca
  const gatewayExpense = revenue * (gatewayFee / 100); // Comisiones pasarela
  
  const totalExpenses = spend + costOfGoods + shippingExpense + gatewayExpense;
  const netProfit = revenue - totalExpenses;
  
  const marginPercentage = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : 0;
  const isProfitable = netProfit > 0;

  // Break-even ROAS (Mínimo ROAS requerido para no perder dinero)
  const unitShipping = freeShipping ? shippingCost : 0;
  const marginRate = aov > 0 ? (1 - (unitCost + unitShipping) / aov - (gatewayFee / 100)) : 0;
  const breakEvenRoas = marginRate > 0 ? Number((1 / marginRate).toFixed(2)) : 99.9;
  const isUnderBreakEven = roas < breakEvenRoas;

  // Currency Formatter (ARS)
  const fmt = (val: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(val);
  };

  // AI Advice/Tips based on values
  const [advice, setAdvice] = useState<any[]>([]);

  useEffect(() => {
    const list = [];

    if (isUnderBreakEven) {
      list.push({
        type: 'error',
        title: 'Operación a Pérdida (ROAS Crítico)',
        desc: `Tu ROAS de ${roas}x es inferior al punto de equilibrio (${breakEvenRoas}x). Con cada venta estás perdiendo dinero neto debido a la estructura de costos actuales.`,
        action: 'Subir precios de venta o renegociar costos de producto.'
      });
    } else if (roas < breakEvenRoas + 0.5) {
      list.push({
        type: 'warning',
        title: 'Márgenes Muy Ajustados',
        desc: `Estás muy cerca de tu punto de equilibrio. Cualquier incremento en el costo publicitario (CPM/CPC) o envíos absorberá por completo tu ganancia.`,
        action: 'Implementar combos (AOV superior) para holgar los márgenes.'
      });
    } else {
      list.push({
        type: 'success',
        title: 'Operación Saludable y Rentable',
        desc: `Felicitaciones. Tu ROAS proyectado supera el mínimo de equilibrio (${breakEvenRoas}x), dejándote un margen neto del ${marginPercentage}%.`,
        action: 'Considerar subir la inversión un 20% para capturar más pedidos.'
      });
    }

    if (freeShipping && shippingCost > aov * 0.15) {
      list.push({
        type: 'warning',
        title: 'Alto Costo de Envío Gratis',
        desc: `El costo de envío gratis (${fmt(shippingCost)}) representa más del 15% del valor del producto. Esto daña fuertemente tu rentabilidad neta.`,
        action: 'Ofrecer envío gratis solo a partir de un valor de compra mínimo.'
      });
    }

    if (gatewayFee > 6) {
      list.push({
        type: 'warning',
        title: 'Comisiones de Pago Elevadas',
        desc: `La pasarela de pago te está cobrando ${gatewayFee}% por transacción. Esto consume una porción importante de tus ganancias netas.`,
        action: 'Ofrecer descuentos por transferencia bancaria (e.g. 10% OFF).'
      });
    }

    setAdvice(list);
  }, [spend, roas, aov, unitCost, shippingCost, freeShipping, gatewayFee, isUnderBreakEven, breakEvenRoas, marginPercentage]);

  return (
    <div className="p-6 space-y-6 bg-[#f5f5f7] dark:bg-[#0a0a0a] min-h-screen text-zinc-800 dark:text-zinc-100 select-none animate-in fade-in duration-200">
      
      {/* Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Calculator className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            Simulador Financiero Simplificado
          </h1>
          <p className="text-[12px] text-zinc-550 dark:text-zinc-400 mt-1">
            Calculá rápidamente la rentabilidad neta de tu tienda online restándole a tus ventas los costos de publicidad, productos, envíos y pasarelas.
          </p>
        </div>

        {/* Preset Presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mr-1">Preajustes:</span>
          <button 
            onClick={() => applyPreset('conservative')}
            className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 border border-zinc-250 dark:border-zinc-800 rounded-xl text-[11px] font-bold transition-all hover:scale-[1.02]"
          >
            📉 Escenario Conservador
          </button>
          <button 
            onClick={() => applyPreset('optimized')}
            className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-850 border border-zinc-250 dark:border-zinc-800 rounded-xl text-[11px] font-bold transition-all hover:scale-[1.02]"
          >
            📈 Escenario Optimizado
          </button>
          <button 
            onClick={() => applyPreset('scale')}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black shadow-sm transition-all hover:scale-[1.02]"
          >
            🚀 Escala Publicitaria
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Inputs (span 5) */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl p-5 space-y-5 shadow-sm">
            <h2 className="text-[13px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-900 pb-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Tus Variables
            </h2>

            {/* Input 1: Inversión en Publicidad */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-655 dark:text-zinc-400">Inversión en Ads (Mensual)</label>
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

            {/* Input 2: ROAS Proyectado */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-655 dark:text-zinc-400">Retorno Publicitario (ROAS)</label>
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                  <input 
                    type="number" 
                    step={0.1}
                    value={roas} 
                    onChange={e => setRoas(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                    className="w-12 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                  />
                  <span className="text-[10px] text-zinc-400">x</span>
                </div>
              </div>
              <input 
                type="range" 
                min={1.0} 
                max={10.0} 
                step={0.1}
                value={roas} 
                onChange={e => setRoas(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
              />
              <div className="flex justify-between text-[9px] text-zinc-450 font-mono">
                <span>1.0x (Pobre)</span>
                <span>5.5x</span>
                <span>10.0x (Excelente)</span>
              </div>
            </div>

            {/* Input 3: Precio de venta */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-655 dark:text-zinc-400">Precio de Venta del Producto</label>
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
                max={150000} 
                step={2500}
                value={aov} 
                onChange={e => setAov(parseInt(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
              />
              <div className="flex justify-between text-[9px] text-zinc-450 font-mono">
                <span>$5.000</span>
                <span>$77.500</span>
                <span>$150.000</span>
              </div>
            </div>

            {/* Input 4: Costo unitario de producto */}
            <div className="flex justify-between items-center text-[12px] font-bold pt-1">
              <label className="text-zinc-655 dark:text-zinc-400">Costo Unitario del Producto</label>
              <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-1 rounded-lg">
                <span className="text-[10px] text-zinc-400">$</span>
                <input 
                  type="number" 
                  value={unitCost} 
                  onChange={e => setUnitCost(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                />
              </div>
            </div>

            {/* Input 5: Costo de envío + toggle */}
            <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-900">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <label className="text-zinc-655 dark:text-zinc-400">Costo de Envío por Venta</label>
                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-1 rounded-lg">
                  <span className="text-[10px] text-zinc-400">$</span>
                  <input 
                    type="number" 
                    value={shippingCost} 
                    onChange={e => setShippingCost(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                    disabled={!freeShipping}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/10 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-850">
                <div className="flex-1 pr-2">
                  <span className="text-[11px] font-bold block text-zinc-700 dark:text-zinc-300">¿Ofrecés Envío Gratis al Cliente?</span>
                  <span className="text-[9.5px] text-zinc-400 leading-snug block">Si marcás que sí, el costo del envío lo absorbe tu ganancia neta.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input 
                    type="checkbox" 
                    checked={freeShipping} 
                    onChange={e => setFreeShipping(e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-9 h-5 bg-zinc-200 dark:bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:height-4 after:width-4 after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            {/* Input 6: Comisión de pasarela */}
            <div className="flex justify-between items-center text-[12px] font-bold pt-2 border-t border-zinc-100 dark:border-zinc-900">
              <label className="text-zinc-655 dark:text-zinc-400">Comisión Pasarela (Mercado Pago, etc.)</label>
              <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 px-2 py-1 rounded-lg">
                <input 
                  type="number" 
                  step={0.1}
                  value={gatewayFee} 
                  onChange={e => setGatewayFee(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-12 bg-transparent text-right focus:outline-none text-[11.5px] font-mono text-zinc-800 dark:text-zinc-100 font-bold"
                />
                <span className="text-[10px] text-zinc-400">%</span>
              </div>
            </div>

          </div>

          {/* Shopify Catalog Card */}
          {profile?.shopify_domain && profile?.shopify_access_token && (
            <div className="bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl p-5 shadow-sm space-y-4">
              <h2 className="text-[13px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-900 pb-2">
                <ShoppingBag className="w-4 h-4 text-purple-500" />
                Catálogo Shopify
              </h2>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar producto de tu catálogo..." 
                  value={shopifySearch}
                  onChange={e => setShopifySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[11.5px] focus:outline-none focus:ring-1 focus:ring-purple-500/25 focus:border-purple-500 text-zinc-750 dark:text-zinc-300"
                />
              </div>

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
                      </div>
                    );
                  })
                )}
              </div>

              {selectedProduct && (
                <div className="p-3 bg-purple-50/40 dark:bg-purple-950/5 border border-purple-100/50 dark:border-purple-900/10 rounded-2xl flex items-center justify-between gap-2 animate-in zoom-in-95 duration-200 text-[11.5px]">
                  <span className="font-semibold text-zinc-650 truncate max-w-[180px]">{selectedProduct.title}</span>
                  <button 
                    onClick={() => setSelectedProduct(null)}
                    className="text-[9.5px] text-zinc-400 hover:text-red-500 font-bold"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: Profitability & Breakdown (span 7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Main Profitability Result Card */}
          <div className={`border rounded-[32px] p-6 text-white relative overflow-hidden shadow-lg ${
            isProfitable 
              ? 'bg-gradient-to-br from-emerald-600 to-teal-800 shadow-emerald-500/10' 
              : 'bg-gradient-to-br from-rose-600 to-red-800 shadow-rose-500/10'
          }`}>
            <div className="absolute top-0 right-0 w-44 h-44 bg-white/5 rounded-full translate-x-12 -translate-y-12 blur-3xl pointer-events-none" />
            
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Resultado Neto Proyectado</span>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-[10px] font-bold backdrop-blur-md">
                {isProfitable ? <CheckCircle className="w-3.5 h-3.5 text-emerald-300" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-200" />}
                {isProfitable ? 'OPERACIÓN RENTABLE' : 'OPERACIÓN CON PÉRDIDAS'}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-4xl font-black tracking-tight">{fmt(netProfit)}</p>
              <p className="text-[11.5px] opacity-80">
                {isProfitable 
                  ? `Te queda un margen neto del ${marginPercentage}% sobre tu facturación.` 
                  : `Operando a pérdida neta. Margen del ${marginPercentage}%.`
                }
              </p>
            </div>

            {/* Simple visual bar chart of expense allocation */}
            {revenue > 0 && (
              <div className="mt-6 space-y-2">
                <span className="text-[9.5px] font-bold uppercase tracking-wider block opacity-75">Distribución de Ingresos (Facturación)</span>
                <div className="w-full h-2.5 bg-black/20 rounded-full flex overflow-hidden">
                  <div 
                    title={`Publicidad: ${Math.round((spend / revenue) * 100)}%`} 
                    style={{ width: `${(spend / revenue) * 100}%` }} 
                    className="bg-amber-450 h-full"
                  />
                  <div 
                    title={`Costo Producto: ${Math.round((costOfGoods / revenue) * 100)}%`} 
                    style={{ width: `${(costOfGoods / revenue) * 100}%` }} 
                    className="bg-blue-400 h-full"
                  />
                  {shippingExpense > 0 && (
                    <div 
                      title={`Envío Gratis: ${Math.round((shippingExpense / revenue) * 100)}%`} 
                      style={{ width: `${(shippingExpense / revenue) * 100}%` }} 
                      className="bg-purple-400 h-full"
                    />
                  )}
                  <div 
                    title={`Comisión Pago: ${Math.round((gatewayExpense / revenue) * 100)}%`} 
                    style={{ width: `${(gatewayExpense / revenue) * 100}%` }} 
                    className="bg-zinc-350 h-full"
                  />
                  {netProfit > 0 && (
                    <div 
                      title={`Ganancia Neta: ${Math.round((netProfit / revenue) * 100)}%`} 
                      style={{ width: `${(netProfit / revenue) * 100}%` }} 
                      className="bg-emerald-300 h-full"
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] font-bold opacity-90 pt-1">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-amber-450" /> Publicidad ({Math.round((spend / revenue) * 100)}%)</div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-blue-400" /> Costo Producto ({Math.round((costOfGoods / revenue) * 100)}%)</div>
                  {shippingExpense > 0 && <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-purple-400" /> Costo Envío ({Math.round((shippingExpense / revenue) * 100)}%)</div>}
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-zinc-350" /> Pasarela ({Math.round((gatewayExpense / revenue) * 100)}%)</div>
                  {netProfit > 0 && <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-emerald-300" /> Ganancia Neta ({Math.round((netProfit / revenue) * 100)}%)</div>}
                </div>
              </div>
            )}
          </div>

          {/* Simple breakdown comparison */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-[12px] font-black text-zinc-450 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-zinc-100 dark:border-zinc-900">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Detalle y Cuentas del Negocio (Paso a Paso)
            </h3>
            
            <div className="space-y-4 text-[12.5px]">
              
              {/* Facturacion */}
              <div className="flex justify-between items-start py-1">
                <div>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300 block">1. Ventas Totales Proyectadas</span>
                  <span className="text-[10px] text-zinc-400 leading-snug block">Inversión Publicidad (${fmt(spend)}) × ROAS ({roas}x)</span>
                </div>
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">+{fmt(revenue)}</span>
              </div>
              
              {/* Pedidos */}
              <div className="flex justify-between items-start py-1 border-t border-zinc-50 dark:border-zinc-900/40">
                <div>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300 block">2. Cantidad de Pedidos Estimados</span>
                  <span className="text-[10px] text-zinc-400 leading-snug block">Ventas Proyectadas (${fmt(revenue)}) / Precio del Producto (${fmt(aov)})</span>
                </div>
                <span className="font-mono font-bold text-zinc-650 dark:text-zinc-400">{sales} pedidos</span>
              </div>

              {/* Inversión en Publicidad */}
              <div className="flex justify-between items-start py-1 border-t border-zinc-50 dark:border-zinc-900/40">
                <div>
                  <span className="font-bold text-zinc-750 dark:text-zinc-300 block">3. Inversión en Ads (Anuncios)</span>
                  <span className="text-[10px] text-zinc-400 leading-snug block">Tu presupuesto mensual de marketing digital</span>
                </div>
                <span className="font-mono font-bold text-rose-500">-{fmt(spend)}</span>
              </div>

              {/* Costo de Productos */}
              <div className="flex justify-between items-start py-1 border-t border-zinc-50 dark:border-zinc-900/40">
                <div>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300 block">4. Costo Total de Mercadería</span>
                  <span className="text-[10px] text-zinc-400 leading-snug block">{sales} pedidos × Costo Unitario del Producto (${fmt(unitCost)})</span>
                </div>
                <span className="font-mono font-bold text-rose-500">-{fmt(costOfGoods)}</span>
              </div>

              {/* Costo de Envíos */}
              <div className="flex justify-between items-start py-1 border-t border-zinc-50 dark:border-zinc-900/40">
                <div>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300 block">5. Costo Total de Logística / Envíos</span>
                  <span className="text-[10px] text-zinc-400 leading-snug block">
                    {freeShipping 
                      ? `${sales} pedidos × Costo de Envío por Venta (${fmt(shippingCost)})` 
                      : 'El envío lo paga el cliente, costo neto para tu marca: $0'
                    }
                  </span>
                </div>
                <span className="font-mono font-bold text-rose-500">
                  {shippingExpense > 0 ? `-${fmt(shippingExpense)}` : '$0'}
                </span>
              </div>

              {/* Comisiones Pasarela */}
              <div className="flex justify-between items-start py-1 border-t border-zinc-50 dark:border-zinc-900/40">
                <div>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300 block">6. Comisiones de Cobro ({gatewayFee}%)</span>
                  <span className="text-[10px] text-zinc-400 leading-snug block">Ventas Proyectadas (${fmt(revenue)}) × Fee Pasarela ({gatewayFee}%)</span>
                </div>
                <span className="font-mono font-bold text-rose-500">-{fmt(gatewayExpense)}</span>
              </div>

              {/* Resumen Total Costos */}
              <div className="flex justify-between items-center py-3 border-t-2 border-dashed border-zinc-150 dark:border-zinc-800 text-[14px] font-black">
                <span className="text-zinc-750 dark:text-zinc-200">Gastos Totales (Suma de 3, 4, 5 y 6)</span>
                <span className="font-mono text-rose-600 dark:text-rose-400">-{fmt(totalExpenses)}</span>
              </div>

              {/* Resultado Final */}
              <div className="flex justify-between items-center py-3.5 border-t border-zinc-250 dark:border-zinc-800 text-[15px] font-black bg-zinc-50/50 dark:bg-zinc-900/20 px-3.5 rounded-2xl">
                <span className="text-zinc-900 dark:text-white">Tu Ganancia Neta (Ventas - Gastos)</span>
                <span className={`font-mono ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {fmt(netProfit)}
                </span>
              </div>

            </div>
          </div>

          {/* Break Even Info Alert Panel */}
          <div className="bg-zinc-50/50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 flex-shrink-0 text-zinc-450 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <p className="font-bold text-zinc-750 dark:text-zinc-300">Punto de Equilibrio (Break-Even ROAS)</p>
              <p className="opacity-80">
                Para cubrir tus costos de mercadería, comisiones y envíos gratis, tu negocio necesita lograr un ROAS mínimo de <span className="font-black text-blue-600 dark:text-blue-400">{breakEvenRoas}x</span>. Si tu ROAS en Facebook es inferior a esto, tu negocio operará a pérdida.
              </p>
            </div>
          </div>

          {/* AI Recommendations Panel */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-sm space-y-4">
            <h2 className="text-[13px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-900 pb-2">
              <Lightbulb className="w-4 h-4 text-violet-500" />
              Recomendaciones de Rentabilidad
            </h2>

            <div className="space-y-2.5">
              {advice.map((rec, i) => (
                <div 
                  key={i} 
                  className={`p-3.5 rounded-2xl border flex items-start gap-2.5 transition-all ${
                    rec.type === 'error' 
                      ? 'bg-red-50/45 dark:bg-red-955/5 border-red-100 dark:border-red-950/20 text-red-900 dark:text-red-405' 
                      : rec.type === 'success'
                        ? 'bg-emerald-50/45 dark:bg-emerald-955/5 border-emerald-100 dark:border-emerald-950/20 text-emerald-900 dark:text-emerald-405'
                        : 'bg-amber-50/45 dark:bg-amber-955/5 border-amber-100 dark:border-amber-950/20 text-amber-900 dark:text-amber-405'
                  }`}
                >
                  {rec.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                  {rec.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
                  {rec.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                  <div className="space-y-0.5 flex-1 text-[11.5px]">
                    <p className="font-bold tracking-tight">{rec.title}</p>
                    <p className="opacity-90 leading-relaxed">{rec.desc}</p>
                    <div className="pt-1 text-[10px] font-bold">
                      <span className="opacity-60">Acción recomendada: </span>
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
