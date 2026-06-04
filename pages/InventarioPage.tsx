import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { Package, ShoppingBag, ArrowUpRight, AlertTriangle, Search, ChevronDown, TrendingUp } from 'lucide-react';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import { ecommerce } from '../services/ecommerce';
import { presetToRange } from '../services/metaAds';

const LOW_STOCK_THRESHOLD = 5;

interface Variant {
  id: number;
  title: string;
  inventory_quantity: number;
  price: string;
}

interface Product {
  id: number;
  title: string;
  image?: { src: string };
  variants: Variant[];
}

function StockBadge({ qty }: { qty: number }) {
  if (qty <= 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 whitespace-nowrap">
      <AlertTriangle className="w-2.5 h-2.5" /> Sin stock
    </span>
  );
  if (qty <= LOW_STOCK_THRESHOLD) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 whitespace-nowrap">
      <AlertTriangle className="w-2.5 h-2.5" /> {qty} ud.
    </span>
  );
  return <span className="text-[13px] font-black text-emerald-500">{qty}</span>;
}

export default function InventarioPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = (isViewingAs ? viewAsProfile : authProfile) as any;

  const platform = profile?.ecommerce_platform;
  const shopifyDomain = (profile?.shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shopifyToken = profile?.shopify_access_token;
  const wordpressUrl = (profile?.wordpress_url || '').replace(/\/$/, '');
  const tiendanubeId = profile?.tiendanube_store_id;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'ok'>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  // Top products by orders (last 30 days) — always fresh, no cache
  const [topProducts, setTopProducts] = useState<{ title: string; quantity: number }[]>([]);
  const [topProductsMap, setTopProductsMap] = useState<Record<string, number>>({});
  const [variantOrdersMap, setVariantOrdersMap] = useState<Record<string, number>>({});
  const [loadingOrders, setLoadingOrders] = useState(false);

  const getInventoryUrl = () => {
    if (platform === 'shopify' && shopifyDomain) return { url: `https://${shopifyDomain}/admin/products`, label: `Abrir en Shopify` };
    if (platform === 'wordpress' && wordpressUrl) return { url: `${wordpressUrl}/wp-admin/edit.php?post_type=product`, label: `Abrir en WooCommerce` };
    if (platform === 'tiendanube' && tiendanubeId) return { url: `https://www.tiendanube.com/tienda/${tiendanubeId}/products`, label: `Abrir en Tiendanube` };
    return null;
  };

  const destination = getInventoryUrl();

  useEffect(() => {
    if (platform !== 'shopify' || !shopifyDomain || !shopifyToken) return;
    setLoading(true);
    setError(null);
    ecommerce.getProducts(shopifyDomain, shopifyToken)
      .then(setProducts)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [platform, shopifyDomain, shopifyToken]);

  useEffect(() => {
    if (platform !== 'shopify' || !shopifyDomain || !shopifyToken) return;
    setLoadingOrders(true);
    const range = presetToRange('last_30d');
    // Force-bypass sessionStorage cache so we get fresh data every time the page mounts
    const cacheKey = `ec:dashboard:${shopifyDomain}:${range.since}:${range.until}`;
    try { sessionStorage.removeItem(cacheKey); } catch { /* ignore */ }
    ecommerce.getDashboardData(platform, shopifyDomain, shopifyToken, range.since, range.until)
      .then(data => {
        const top = (data?.topProducts || [])
          .slice(0, 7)
          .map((p: any) => ({ title: p.title, quantity: p.quantity }));
        setTopProducts(top);
        // Build a quick lookup map: title (lowercase) -> order count
        const map: Record<string, number> = {};
        top.forEach((p: { title: string; quantity: number }) => {
          map[p.title.toLowerCase()] = p.quantity;
        });
        setTopProductsMap(map);
        setVariantOrdersMap(data?.variantOrders || {});
      })
      .catch(() => {})
      .finally(() => setLoadingOrders(false));
  }, [platform, shopifyDomain, shopifyToken]);

  // Stats per variant (flat) for filter counts
  const allVariants = useMemo(() => products.flatMap(p => p.variants.map(v => ({ ...v, inventory_quantity: v.inventory_quantity ?? 0 }))), [products]);
  const outCount = allVariants.filter(v => v.inventory_quantity <= 0).length;
  const lowCount = allVariants.filter(v => v.inventory_quantity > 0 && v.inventory_quantity <= LOW_STOCK_THRESHOLD).length;
  const okCount  = allVariants.filter(v => v.inventory_quantity > LOW_STOCK_THRESHOLD).length;

  // Filtered product list (at product level, then variants inside)
  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchSearch = !q || p.title.toLowerCase().includes(q) || p.variants.some(v => v.title.toLowerCase().includes(q));
      if (!matchSearch) return false;
      if (filter === 'out') return p.variants.some(v => (v.inventory_quantity ?? 0) <= 0);
      if (filter === 'low') return p.variants.some(v => { const qty = v.inventory_quantity ?? 0; return qty > 0 && qty <= LOW_STOCK_THRESHOLD; });
      if (filter === 'ok') return p.variants.every(v => (v.inventory_quantity ?? 0) > LOW_STOCK_THRESHOLD);
      return true;
    });
  }, [products, search, filter]);

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Click on a top-product row: find the matching product, scroll to it, expand it and flash highlight
  const jumpToProduct = useCallback((title: string) => {
    const match = products.find(p => p.title.toLowerCase() === title.toLowerCase());
    if (!match) return;

    // Reset filters/search so the product is visible in the list
    setFilter('all');
    setSearch('');

    // Expand multi-variant products so the user sees the stock breakdown
    if (match.variants.length > 1) {
      setExpanded(prev => { const next = new Set(prev); next.add(match.id); return next; });
    }

    // Scroll + highlight — give React one tick to re-render with cleared filters
    setTimeout(() => {
      const el = document.getElementById(`product-row-${match.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setHighlightedId(match.id);
      setTimeout(() => setHighlightedId(null), 1800);
    }, 80);
  }, [products]);

  const platformColor: Record<string, string> = { shopify: 'bg-emerald-500', wordpress: 'bg-blue-600', tiendanube: 'bg-cyan-500' };
  const btnColor: Record<string, string> = { shopify: 'bg-emerald-600 hover:bg-emerald-700', wordpress: 'bg-blue-600 hover:bg-blue-700', tiendanube: 'bg-cyan-600 hover:bg-cyan-700' };

  return (
    <CenteredPageLoader isLoading={loading}>
    <div className="w-full pt-4 pb-20 md:pt-6 animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-[20px] font-black text-zinc-900 dark:text-white tracking-tight">Inventario</h1>
            <p className="text-[11px] text-zinc-400 font-medium">Stock en tiempo real</p>
          </div>
        </div>
        {/* Compact button in header */}
        {destination && (
          <a
            href={destination.url}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] ${btnColor[platform] || 'bg-zinc-700'}`}
          >
            {destination.label}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {!platform ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <ShoppingBag className="w-10 h-10 text-zinc-300" />
          <p className="text-[14px] font-semibold text-zinc-500">Sin tienda conectada</p>
          <p className="text-[12px] text-zinc-400 max-w-xs">Conectá Shopify, WooCommerce o Tiendanube desde el panel de administración.</p>
        </div>
      ) : !destination ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Package className="w-10 h-10 text-zinc-300" />
          <p className="text-[14px] font-semibold text-zinc-500">Configuración incompleta</p>
          <p className="text-[12px] text-zinc-400 max-w-xs">Falta el dominio o ID de la tienda.</p>
        </div>
      ) : platform !== 'shopify' ? (
        <p className="text-[11px] text-zinc-400 text-center">Se abre en una nueva pestaña. Iniciá sesión en tu tienda si todavía no lo hiciste.</p>
      ) : (
        <>
          {/* Top products last 30 days */}
          {(loadingOrders || topProducts.length > 0) && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-[13px] font-bold text-zinc-900 dark:text-white">Más pedidos — últimos 30 días</span>
                <span className="text-[10px] text-zinc-400 ml-1">qué reponer primero</span>
              </div>
              {loadingOrders ? (
                <div className="p-4 space-y-2">
                  {[...Array(7)].map((_, i) => <div key={i} className="h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />)}
                </div>
              ) : (
                <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {topProducts.map((p, i) => {
                    const maxQty = topProducts[0]?.quantity || 1;
                    const width = Math.round((p.quantity / maxQty) * 100);
                    return (
                      <button
                        key={i}
                        onClick={() => jumpToProduct(p.title)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50/60 dark:hover:bg-emerald-900/10 active:bg-emerald-100/60 dark:active:bg-emerald-900/20 transition-colors text-left group cursor-pointer"
                      >
                        <span className="text-[11px] font-black text-zinc-400 w-5 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{p.title}</p>
                            <span className="text-[12px] font-black text-emerald-600 shrink-0">{p.quantity} ped.</span>
                          </div>
                          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Filter chips */}
          {!loading && allVariants.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setFilter('all')} className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${filter === 'all' ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}>
                Todos {allVariants.length}
              </button>
              {outCount > 0 && (
                <button onClick={() => setFilter('out')} className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${filter === 'out' ? 'bg-red-600 text-white' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                  Sin stock {outCount}
                </button>
              )}
              {lowCount > 0 && (
                <button onClick={() => setFilter('low')} className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${filter === 'low' ? 'bg-amber-500 text-white' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                  Stock bajo {lowCount}
                </button>
              )}
              {okCount > 0 && <button onClick={() => setFilter('ok')} className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${filter === 'ok' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>OK {okCount}</button>}
            </div>
          )}

          {/* Search */}
          {!loading && allVariants.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full pl-9 pr-4 py-2.5 text-[13px] rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* Product list */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-[12px] text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="text-center text-[13px] text-zinc-400 py-12">Sin resultados</p>
          ) : (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className={`h-1 w-full ${platformColor[platform] || 'bg-zinc-400'}`} />
              <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {filteredProducts.map(product => {
                  const isSingle = product.variants.length === 1;
                  const singleQty = isSingle ? (product.variants[0].inventory_quantity ?? 0) : null;
                  const isOpen = expanded.has(product.id);

                  // Worst status across all variants for the parent indicator
                  const variantQtys = product.variants.map(v => v.inventory_quantity ?? 0);
                  const hasOut = variantQtys.some(q => q <= 0);
                  const hasLow = variantQtys.some(q => q > 0 && q <= LOW_STOCK_THRESHOLD);

                  return (
                    <div key={product.id} id={`product-row-${product.id}`}>
                      {/* Parent row */}
                      <div
                        className={`flex items-center gap-3 px-4 py-2 transition-all duration-300 ${
                          !isSingle ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50' : ''
                        } ${
                          highlightedId === product.id
                            ? 'ring-2 ring-inset ring-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/15'
                            : hasOut ? 'bg-red-50/40 dark:bg-red-950/10' : hasLow ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                        }`}
                        onClick={() => !isSingle && toggle(product.id)}
                      >
                        {/* Image */}
                        {product.image?.src ? (
                          <img src={product.image.src} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0 bg-zinc-100" />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                            <Package className="w-3.5 h-3.5 text-zinc-400" />
                          </div>
                        )}

                        {/* Title + order count */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-[13px] font-semibold text-zinc-900 dark:text-white truncate">{product.title}</p>
                            {(() => {
                              const orderQty = topProductsMap[product.title.toLowerCase()];
                              return orderQty ? (
                                <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                  {orderQty} ped.
                                </span>
                              ) : null;
                            })()}
                          </div>
                          {!isSingle && (
                            <p className="text-[10px] text-zinc-400">{product.variants.length} variantes</p>
                          )}
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isSingle ? (
                            <StockBadge qty={singleQty!} />
                          ) : (
                            <>
                              {hasOut && <span className="text-[10px] font-bold text-red-500">{variantQtys.filter(q => q <= 0).length} sin stock</span>}
                              {hasLow && <span className="text-[10px] font-bold text-amber-500">{variantQtys.filter(q => q > 0 && q <= LOW_STOCK_THRESHOLD).length} bajo</span>}
                              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </>
                          )}
                        </div>
                      </div>

                      {/* Variants (expanded) */}
                      {!isSingle && isOpen && (
                        <div className="border-t border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/60">
                          {product.variants.map(v => {
                            const qty = v.inventory_quantity ?? 0;
                            const isOut = qty <= 0;
                            const isLow = qty > 0 && qty <= LOW_STOCK_THRESHOLD;
                            const variantOrderQty = variantOrdersMap[String(v.id)] || 0;
                            return (
                              <div key={v.id} className={`flex items-center gap-3 pl-14 pr-4 py-1.5 ${isOut ? 'bg-red-50/40 dark:bg-red-950/10' : isLow ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
                                <div className="flex-grow flex items-center justify-between gap-2 min-w-0">
                                  <p className="text-[12px] text-zinc-700 dark:text-zinc-300 truncate">{v.title === 'Default Title' ? product.title : v.title}</p>
                                  {variantOrderQty > 0 && (
                                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                      {variantOrderQty} ped.
                                    </span>
                                  )}
                                </div>
                                <div className="shrink-0">
                                  <StockBadge qty={qty} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </CenteredPageLoader>
  );
}
