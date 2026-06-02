import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import {
  Package, Search, RefreshCw, Save, Tag, DollarSign,
  AlertCircle, CheckCircle, Loader2, ChevronDown, ChevronRight, X,
  ShoppingBag, TrendingDown
} from 'lucide-react';
import { AppleLoader } from '../components/ui/AppleLoader';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Variant {
  id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  inventory_item_id: number;
  inventory_quantity: number;
  available: boolean;
}

interface Product {
  id: number;
  title: string;
  image: string | null;
  type: string;
  url: string;
  variants: Variant[];
}

interface EditState {
  price: string;
  compare_at_price: string;
  cost: string;
  inventory_quantity: number;
}

// ── Inline numeric input ──────────────────────────────────────────────────────
const NumCell = ({ value, onChange, prefix = '', suffix = '', placeholder = '0' }: {
  value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; placeholder?: string;
}) => (
  <div className="relative flex items-center">
    {prefix && <span className="text-[10px] text-zinc-400 absolute left-2 pointer-events-none">{prefix}</span>}
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min="0"
      step="0.01"
      className={`w-full h-8 text-[12px] font-bold text-zinc-900 dark:text-white bg-transparent border border-transparent rounded-lg hover:border-zinc-300 dark:hover:border-zinc-600 focus:border-pink-500 focus:bg-white dark:focus:bg-zinc-800 outline-none transition-all text-right pr-2 ${prefix ? 'pl-5' : 'pl-2'} ${suffix ? 'pr-6' : 'pr-2'}`}
    />
    {suffix && <span className="text-[10px] text-zinc-400 absolute right-2 pointer-events-none">{suffix}</span>}
  </div>
);

// ── Margin pill ───────────────────────────────────────────────────────────────
const MarginPill = ({ price, cost }: { price: string; cost: string }) => {
  const p = parseFloat(price) || 0;
  const c = parseFloat(cost) || 0;
  if (!p || !c) return <span className="text-[10px] text-zinc-300 dark:text-zinc-600">—</span>;
  const margin = ((p - c) / p) * 100;
  const cls = margin >= 50 ? 'text-emerald-600 dark:text-emerald-400' : margin >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  return <span className={`text-[11px] font-black ${cls}`}>{margin.toFixed(0)}%</span>;
};

export default function InventarioPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [locationId, setLocationId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const p = profile as any;
  const domain = p?.shopify_domain?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '';
  const token = p?.shopify_access_token || '';
  const shopifyHeaders = { 'X-Shopify-Access-Token': token, 'X-Shop-Domain': domain, 'Content-Type': 'application/json' };

  // ── Load products + costs + location ─────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!domain || !token) return;
    setLoading(true);
    setError(null);
    try {
      // Parallel: products + costs + location
      const [prodRes, costsRes, locRes] = await Promise.all([
        fetch('/api/scrape-all', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'products', platform: 'shopify', shopify_domain: domain, shopify_access_token: token }),
        }),
        p?.id ? fetch('/api/scrape-all', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'load-costs', clientId: p.id }),
        }) : Promise.resolve(null),
        fetch('/api/shopify/locations.json', { headers: shopifyHeaders }),
      ]);

      const prodData = await prodRes.json();
      setProducts(prodData.products || []);
      setLastUpdated(new Date());

      // Set costs into edit state
      if (costsRes?.ok) {
        const costsData = await costsRes.json();
        const costMap: Record<string, string> = {};
        (costsData.costs || []).forEach((c: any) => { costMap[String(c.variant_id)] = String(c.cost); });
        setEdits(prev => {
          const next = { ...prev };
          Object.keys(costMap).forEach(vid => {
            next[vid] = { ...next[vid], cost: costMap[vid] };
          });
          return next;
        });
      }

      if (locRes.ok) {
        const locData = await locRes.json();
        const locs = locData.locations || [];
        if (locs.length > 0) setLocationId(locs[0].id);
      } else if (locRes.status === 403) {
        setError('El token de Shopify no tiene el permiso "read_locations". Regenerá el token con acceso a Ubicaciones e Inventario.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [domain, token, p?.id]);

  useEffect(() => { if (domain && token) loadData(); }, [domain, token]);

  // ── Edit helpers ──────────────────────────────────────────────────────────
  const getEdit = (v: Variant): EditState => ({
    price: edits[v.id]?.price ?? v.price ?? '',
    compare_at_price: edits[v.id]?.compare_at_price ?? v.compare_at_price ?? '',
    cost: edits[v.id]?.cost ?? '',
    inventory_quantity: edits[v.id]?.inventory_quantity ?? v.inventory_quantity ?? 0,
  });

  const setField = (variantId: string, field: keyof EditState, value: string | number) => {
    setEdits(prev => ({ ...prev, [variantId]: { ...getEditById(variantId), [field]: value } }));
    setSavedIds(prev => { const n = new Set(prev); n.delete(variantId); return n; });
  };

  const getEditById = (variantId: string): EditState => {
    const v = products.flatMap(p => p.variants).find(v => String(v.id) === variantId);
    if (!v) return { price: '', compare_at_price: '', cost: '', inventory_quantity: 0 };
    return edits[variantId] ?? { price: v.price, compare_at_price: v.compare_at_price ?? '', cost: '', inventory_quantity: v.inventory_quantity };
  };

  const isDirty = (v: Variant) => {
    const e = edits[String(v.id)];
    if (!e) return false;
    return (e.price !== undefined && e.price !== v.price) ||
      (e.compare_at_price !== undefined && e.compare_at_price !== (v.compare_at_price ?? '')) ||
      e.cost !== undefined && e.cost !== '' ||
      (e.inventory_quantity !== undefined && e.inventory_quantity !== v.inventory_quantity);
  };

  // ── Save a variant ────────────────────────────────────────────────────────
  const saveVariant = async (v: Variant, productId: number) => {
    const vid = String(v.id);
    const e = getEditById(vid);
    setSavingIds(prev => new Set([...prev, vid]));
    try {
      // 1. Update price + compare_at_price
      const priceChanged = e.price !== v.price || e.compare_at_price !== (v.compare_at_price ?? '');
      if (priceChanged) {
        const body: any = { variant: { id: v.id, price: e.price } };
        if (e.compare_at_price !== '') body.variant.compare_at_price = e.compare_at_price || null;
        else body.variant.compare_at_price = null;
        const r = await fetch(`/api/shopify/variants/${v.id}.json`, {
          method: 'PUT', headers: shopifyHeaders, body: JSON.stringify(body),
        });
        if (!r.ok) {
          let msg = `Error ${r.status}`;
          try { const d = await r.json(); msg = d?.errors ? JSON.stringify(d.errors) : d?.error || msg; } catch {}
          if (r.status === 403) msg = `403 Forbidden — el token de Shopify no tiene el permiso "write_products". Regenerá el token con acceso de escritura a Productos.`;
          throw new Error(msg);
        }
        // Update local product data
        setProducts(prev => prev.map(prod =>
          prod.id === productId ? {
            ...prod, variants: prod.variants.map(pv =>
              pv.id === v.id ? { ...pv, price: e.price, compare_at_price: e.compare_at_price || null } : pv
            )
          } : prod
        ));
      }

      // 2. Update inventory quantity
      if (e.inventory_quantity !== v.inventory_quantity && locationId) {
        const r = await fetch('/api/shopify/inventory_levels/set.json', {
          method: 'POST', headers: shopifyHeaders,
          body: JSON.stringify({ location_id: locationId, inventory_item_id: v.inventory_item_id, available: Number(e.inventory_quantity) }),
        });
        if (!r.ok) console.warn('Stock update failed:', r.status);
        else {
          setProducts(prev => prev.map(prod =>
            prod.id === productId ? { ...prod, variants: prod.variants.map(pv => pv.id === v.id ? { ...pv, inventory_quantity: Number(e.inventory_quantity) } : pv) } : prod
          ));
        }
      }

      // 3. Save cost to DB
      if (e.cost !== '' && p?.id) {
        await fetch('/api/scrape-all', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'save-costs', clientId: p.id, costs: [{ variant_id: v.id, cost: parseFloat(e.cost) }] }),
        });
      }

      setSavedIds(prev => new Set([...prev, vid]));
      setTimeout(() => setSavedIds(prev => { const n = new Set(prev); n.delete(vid); return n; }), 2000);
    } catch (err: any) {
      alert(err.message || 'Error al guardar');
    } finally {
      setSavingIds(prev => { const n = new Set(prev); n.delete(vid); return n; });
    }
  };

  // ── Save ALL dirty variants ───────────────────────────────────────────────
  const saveAll = async () => {
    const dirty = products.flatMap(prod => prod.variants.filter(v => isDirty(v)).map(v => ({ v, pid: prod.id })));
    for (const { v, pid } of dirty) await saveVariant(v, pid);
  };

  const dirtyCount = products.flatMap(p => p.variants).filter(v => isDirty(v)).length;

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = products.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.type.toLowerCase().includes(search.toLowerCase()) || p.variants.some(v => v.sku.toLowerCase().includes(search.toLowerCase())));

  if (!domain || !token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <ShoppingBag className="w-6 h-6 text-zinc-400" />
        </div>
        <p className="text-[14px] font-semibold text-zinc-600 dark:text-zinc-400">Tienda no conectada</p>
        <p className="text-[12px] text-zinc-400 max-w-xs">Conectá Shopify desde el panel de administración para gestionar el inventario.</p>
      </div>
    );
  }

  return (
    <div className="w-full pt-4 pb-20 md:pt-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-[20px] font-black text-zinc-900 dark:text-white tracking-tight">Inventario</h1>
            <p className="text-[11px] text-zinc-400 font-medium">
              {products.length > 0 ? `${products.length} productos · ${products.flatMap(p => p.variants).length} variantes` : 'Cargando...'}
              {lastUpdated && ` · actualizado ${lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto o SKU..." className="pl-8 pr-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[12px] text-zinc-700 dark:text-zinc-300 outline-none focus:border-emerald-500 w-52 transition-all" />
          </div>
          <button onClick={loadData} disabled={loading} title="Recargar desde Shopify" className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {dirtyCount > 0 && (
            <button onClick={saveAll} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[12px] font-black shadow-sm transition-all">
              <Save className="w-3.5 h-3.5" />
              Guardar {dirtyCount} cambio{dirtyCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-[12px] text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center py-24 gap-3 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[13px]">Importando inventario desde Shopify...</span>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[32px_1fr_80px_80px_90px_90px_90px_56px_48px] gap-0 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-black text-zinc-400 uppercase tracking-wider">
            <div />
            <div>Producto / Variante</div>
            <div className="text-right">Stock</div>
            <div className="text-right">Costo</div>
            <div className="text-right">Precio</div>
            <div className="text-right">Precio Original</div>
            <div className="text-right">Margen</div>
            <div />
            <div />
          </div>

          {/* Products */}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-[12px] text-zinc-400">
              {search ? `Sin resultados para "${search}"` : 'No hay productos'}
            </div>
          )}

          {filtered.map(prod => {
            const isExpanded = expandedIds.has(prod.id) || prod.variants.length === 1;
            const hasOffer = prod.variants.some(v => getEditById(String(v.id)).compare_at_price);
            return (
              <div key={prod.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                {/* Product header */}
                <div
                  className={`grid grid-cols-[32px_1fr_80px_80px_90px_90px_90px_56px_48px] gap-0 px-4 py-3 items-center cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors ${prod.variants.length === 1 ? 'cursor-default' : ''}`}
                  onClick={() => {
                    if (prod.variants.length <= 1) return;
                    setExpandedIds(prev => {
                      const n = new Set(prev);
                      if (n.has(prod.id)) n.delete(prod.id); else n.add(prod.id);
                      return n;
                    });
                  }}
                >
                  {/* Expand icon */}
                  <div className="flex items-center justify-center text-zinc-300">
                    {prod.variants.length > 1 ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : null}
                  </div>

                  {/* Image + name */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    {prod.image ? (
                      <img src={prod.image} alt={prod.title} className="w-8 h-8 rounded-lg object-cover border border-zinc-100 dark:border-zinc-700 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                        <Package className="w-3.5 h-3.5 text-zinc-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-zinc-900 dark:text-white truncate">{prod.title}</p>
                      {prod.type && <p className="text-[10px] text-zinc-400">{prod.type}{prod.variants.length > 1 ? ` · ${prod.variants.length} variantes` : ''}</p>}
                    </div>
                    {hasOffer && <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 uppercase">Oferta</span>}
                  </div>

                  {/* Show aggregated data for multi-variant products */}
                  {prod.variants.length > 1 ? (
                    <>
                      <div className="text-right text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                        {prod.variants.reduce((s, v) => s + (v.inventory_quantity || 0), 0)}
                      </div>
                      <div />
                      <div className="text-right text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                        {prod.variants.length === 1 ? `$${prod.variants[0].price}` : `$${Math.min(...prod.variants.map(v => parseFloat(v.price) || 0)).toFixed(2)}`}
                      </div>
                      <div />
                      <div />
                      <div />
                      <div />
                    </>
                  ) : null}
                </div>

                {/* Variant rows */}
                {(isExpanded || prod.variants.length === 1) && prod.variants.map(v => {
                  const vid = String(v.id);
                  const e = getEditById(vid);
                  const dirty = isDirty(v);
                  const saving = savingIds.has(vid);
                  const saved = savedIds.has(vid);
                  const isOnSale = e.compare_at_price !== '';

                  return (
                    <div
                      key={v.id}
                      className={`grid grid-cols-[32px_1fr_80px_80px_90px_90px_90px_56px_48px] gap-0 px-4 py-2 items-center border-t border-zinc-50 dark:border-zinc-800/60 ${dirty ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}
                    >
                      <div />

                      {/* Variant name + SKU */}
                      <div className="pl-10 min-w-0">
                        {prod.variants.length > 1 && <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">{v.title || 'Default'}</p>}
                        {v.sku && <p className="text-[10px] text-zinc-400 font-mono">{v.sku}</p>}
                      </div>

                      {/* Stock */}
                      <div>
                        <NumCell
                          value={String(e.inventory_quantity)}
                          onChange={val => setField(vid, 'inventory_quantity', parseInt(val) || 0)}
                          placeholder="0"
                        />
                      </div>

                      {/* Cost */}
                      <div>
                        <NumCell
                          value={e.cost}
                          onChange={val => setField(vid, 'cost', val)}
                          prefix="$"
                          placeholder="0.00"
                        />
                      </div>

                      {/* Price */}
                      <div>
                        <NumCell
                          value={e.price}
                          onChange={val => setField(vid, 'price', val)}
                          prefix="$"
                          placeholder="0.00"
                        />
                      </div>

                      {/* Compare at price (sale) */}
                      <div>
                        {isOnSale ? (
                          <div className="relative">
                            <NumCell
                              value={e.compare_at_price}
                              onChange={val => setField(vid, 'compare_at_price', val)}
                              prefix="$"
                              placeholder="0.00"
                            />
                            <button
                              onClick={() => setField(vid, 'compare_at_price', '')}
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-zinc-400 hover:bg-red-500 text-white flex items-center justify-center"
                              title="Quitar oferta"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setField(vid, 'compare_at_price', e.price)}
                            className="w-full flex items-center justify-center gap-1 py-1 text-[10px] font-bold text-zinc-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/20 rounded-lg transition-all border border-dashed border-zinc-200 dark:border-zinc-700 hover:border-pink-300"
                            title="Activar precio de oferta"
                          >
                            <Tag className="w-3 h-3" />
                            Oferta
                          </button>
                        )}
                      </div>

                      {/* Margin */}
                      <div className="flex items-center justify-end pr-1">
                        <MarginPill price={e.price} cost={e.cost} />
                      </div>

                      {/* Status */}
                      <div className="flex items-center justify-center">
                        {isOnSale && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 uppercase">Sale</span>}
                        {!v.available && !isOnSale && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/30 text-red-600 uppercase">Sin stock</span>}
                      </div>

                      {/* Save button */}
                      <div className="flex items-center justify-center">
                        {saved ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : saving ? (
                          <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                        ) : dirty ? (
                          <button
                            onClick={() => saveVariant(v, prod.id)}
                            className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-all shadow-sm"
                            title="Guardar cambios"
                          >
                            <Save className="w-3 h-3" />
                          </button>
                        ) : (
                          <div className="w-7 h-7" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <p className="text-[10px] text-zinc-400 mt-4 text-center leading-relaxed">
        Los cambios de precio y stock se guardan directamente en Shopify. El costo se guarda en la base de datos local.
        <br />Para activar una oferta: hacé click en "Oferta" y el precio original se guarda como precio de referencia cruzado en la tienda.
      </p>
    </div>
  );
}
