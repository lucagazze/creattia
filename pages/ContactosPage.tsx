import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import {
  Search, User, Mail, Phone, MapPin, 
  Loader2, MessageSquare,
  ShoppingBag, CreditCard, ShoppingCart, AlertCircle,
  Package, Truck, RefreshCw, ChevronDown, ChevronUp, Tag, AlertTriangle, X
} from 'lucide-react';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';

const fmtCurr = (n: number) => {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const PortalWrapper: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => {
  return active ? createPortal(children, document.body) : <>{children}</>;
};

const getNextPageUrl = (linkHeader: string | null) => {
  if (!linkHeader) return null;
  const nextPart = linkHeader.split(',').find(s => s.includes('rel="next"'));
  if (!nextPart) return null;
  const match = nextPart.match(/<([^>]+)>/);
  if (!match) return null;
  const fullUrl = match[1];
  try {
    const urlObj = new URL(fullUrl);
    return `/api/shopify/customers.json${urlObj.search}`;
  } catch (e) {
    const qIndex = fullUrl.indexOf('?');
    if (qIndex !== -1) {
      return `/api/shopify/customers.json${fullUrl.substring(qIndex)}`;
    }
    return null;
  }
};

const TZ = 'America/Argentina/Buenos_Aires';
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }) + ' hs';
};

// Badges
function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:               { label: 'Pagado',         cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
    pending:            { label: 'Pendiente',      cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
    refunded:           { label: 'Reembolsado',    cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    partially_refunded: { label: 'Reemb. parcial', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    voided:             { label: 'Anulado',        cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400' },
    authorized:         { label: 'Autorizado',     cls: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${cls}`}>{label}</span>;
}

function FulfillmentBadge({ status, order }: { status: string | null; order?: any }) {
  const s = status || 'unfulfilled';
  const isLocalPickup = order && (
    (order.shipping_lines || []).some((sl: any) => {
      const title = (sl.title || '').toLowerCase();
      return title.includes('retiro') || title.includes('local') || title.includes('pick') || title.includes('sucursal') || title.includes('showroom') || title.includes('tienda');
    }) ||
    (order.shipping_lines || []).some((sl: any) => {
      const method = (sl.method_id || '').toLowerCase();
      return method.includes('local_pickup');
    })
  );
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    fulfilled:   { label: 'Enviado',    cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400', icon: <Truck className="w-2.5 h-2.5" /> },
    unfulfilled: isLocalPickup
      ? { label: 'Listo para retiro', cls: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400', icon: <Package className="w-2.5 h-2.5" /> }
      : { label: 'Sin enviar', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',   icon: <Package className="w-2.5 h-2.5" /> },
    partial:     { label: 'Parcial',    cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',        icon: <Package className="w-2.5 h-2.5" /> },
    restocked:   { label: 'Devuelto',   cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',                                   icon: <RefreshCw className="w-2.5 h-2.5" /> },
  };
  const { label, cls, icon } = map[s] ?? { label: s, cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${cls}`}>
      {icon}{label}
    </span>
  );
}// ─── Shared expanded detail ────────────────────────────────────────────────

function OrderExpandedDetail({ order }: { order: any }) {
  const lineItems = order.line_items || [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Products List */}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">Productos</p>
        {lineItems.map((item: any, idx: number) => {
          const img = item._wc_image;
          return (
            <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900/50 border border-zinc-150/65 dark:border-white/[0.04]">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="shrink-0 min-w-[28px] h-7 px-1.5 rounded bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center">
                  <span className="text-[11px] font-black">×{item.quantity}</span>
                </div>
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center border border-zinc-200/60 dark:border-white/[0.06]">
                  {img ? (
                    <img src={img} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <ShoppingBag className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{item.title}</p>
                  {item.variant_title && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">{item.variant_title}</p>
                  )}
                </div>
              </div>
              <span className="text-[12px] font-bold shrink-0 text-zinc-800 dark:text-zinc-200">
                {fmtCurr(parseFloat(item.price || 0) * item.quantity)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Order breakdown */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-150/65 dark:border-white/[0.04] rounded-2xl p-4 flex flex-col justify-between">
        <div>
          <p className="text-[10px] font-black text-zinc-450 uppercase tracking-wider mb-3">Resumen de Pago</p>
          <div className="space-y-2 text-[11px] font-medium text-zinc-500">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="text-zinc-700 dark:text-zinc-300 font-bold">{fmtCurr(parseFloat(order.subtotal_price || 0))}</span>
            </div>
            {parseFloat(order.total_discounts || 0) > 0 && (
              <div className="flex justify-between text-emerald-500 font-bold">
                <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Descuento</span>
                <span>- {fmtCurr(parseFloat(order.total_discounts))}</span>
              </div>
            )}
            {parseFloat(order.total_tax || 0) > 0 && (
              <div className="flex justify-between">
                <span>Impuestos</span>
                <span className="text-zinc-700 dark:text-zinc-300 font-bold">{fmtCurr(parseFloat(order.total_tax))}</span>
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-dashed border-zinc-200 dark:border-zinc-800 pt-3 mt-3 flex justify-between items-baseline">
          <span className="text-[12px] font-black text-zinc-800 dark:text-zinc-150">Total Facturado</span>
          <span className="text-[16px] font-black text-pink-500 dark:text-pink-400">{fmtCurr(parseFloat(order.total_price || 0))}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Desktop table row ─────────────────────────────────────────────────────

function OrderItemRow({ order }: { order: any }) {
  const [open, setOpen] = useState(false);
  const lineItems = order.line_items || [];
  const firstItem = lineItems[0];
  const extraCount = lineItems.length - 1;

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        className={`border-b border-zinc-100/80 dark:border-white/[0.04] cursor-pointer transition-colors ${
          open ? 'bg-zinc-50 dark:bg-white/[0.025]' : 'hover:bg-zinc-50/70 dark:hover:bg-white/[0.015]'
        }`}
      >
        <td className="px-4 py-3">
          <span className="text-[11px] text-zinc-600 dark:text-zinc-350 font-semibold">
            {fmtDateTime(order.created_at)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {lineItems.length > 0 ? `${lineItems.length} ít${lineItems.length === 1 ? 'em' : 'ems'}` : '—'}
          </span>
        </td>
        <td className="px-4 py-3"><PaymentBadge status={order.financial_status} /></td>
        <td className="px-4 py-3"><FulfillmentBadge status={order.fulfillment_status} order={order} /></td>
        <td className="px-4 py-3 text-right font-black text-zinc-900 dark:text-white">
          {fmtCurr(parseFloat(order.total_price || 0))}
        </td>
        <td className="px-4 py-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center ml-auto bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white transition-colors">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </td>
      </tr>

      {open && (
        <tr className="bg-zinc-50/50 dark:bg-white/[0.01] border-b border-zinc-100/80 dark:border-white/[0.04]">
          <td colSpan={6} className="px-6 py-4">
            <OrderExpandedDetail order={order} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Mobile order card ─────────────────────────────────────────────────────

function OrderMobileCard({ order }: { order: any }) {
  const [open, setOpen] = useState(false);
  const lineItems = order.line_items || [];
  const firstItem = lineItems[0];
  const extraCount = lineItems.length - 1;

  return (
    <div className={`border-b border-zinc-100 dark:border-white/[0.04] last:border-b-0 ${open ? 'bg-zinc-50/60 dark:bg-white/[0.015]' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3.5 flex items-start gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">{fmtDateTime(order.created_at)}</p>

          <div className="flex items-center gap-1.5 flex-wrap">
            <PaymentBadge status={order.financial_status} />
            <FulfillmentBadge status={order.fulfillment_status} order={order} />
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 self-center">
          <span className="text-[14px] font-black text-zinc-900 dark:text-white whitespace-nowrap">
            {fmtCurr(parseFloat(order.total_price || 0))}
          </span>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            open
              ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
          }`}>
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <OrderExpandedDetail order={order} />
        </div>
      )}
    </div>
  );
}

export default function ContactosPage() {
  const navigate = useNavigate();
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  // Auto-detect platform just like PedidosPage
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

  const hasStore = !!platform;

  // Store customers states
  const [storeCustomers, setStoreCustomers] = useState<any[]>([]);
  const [selectedStoreCust, setSelectedStoreCust] = useState<any>(null);
  const [storeCustStats, setStoreCustStats] = useState<{ ordersCount: number; totalSpent: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [selectedCustOrders, setSelectedCustOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Common list states
  const [loading, setLoading] = useState(true);
  const [loadingBackground, setLoadingBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Filters and Sorting
  const [filterType, setFilterType] = useState<'all' | 'new' | 'frequent'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'spent' | 'orders'>('recent');

  // Load Store Customers
  const loadData = useCallback(async () => {
    if (!profile || !platform) {
      setStoreCustomers([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (platform === 'shopify') {
        const domain = ((profile as any).shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        const token = (profile as any).shopify_access_token || '';
        if (!domain || !token) {
          throw new Error('Shopify no está configurado.');
        }

        let url = `/api/shopify/customers.json?limit=250`;
        if (search.trim()) {
          url = `/api/shopify/customers/search.json?query=${encodeURIComponent(search)}&limit=250`;
        }

        const res = await fetch(url, {
          headers: {
            'X-Shopify-Access-Token': token,
            'X-Shop-Domain': domain,
          }
        });

        if (!res.ok) throw new Error(`Error de Shopify: ${res.status}`);
        const data = await res.json();
        const rawList = data.customers || [];
        
        const normalizeShopify = (c: any) => {
          return {
            id: c.id,
            first_name: c.first_name || '',
            last_name: c.last_name || '',
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Cliente sin nombre',
            email: c.email || '',
            phone: c.phone || '',
            orders_count: c.orders_count || 0,
            total_spent: parseFloat(c.total_spent || 0),
            address: c.default_address
              ? `${c.default_address.address1 || ''}, ${c.default_address.city || ''}, ${c.default_address.province || ''}, ${c.default_address.country || ''}`.replace(/^,\s*/, '')
              : null,
            platform: 'shopify'
          };
        };

        let currentList = rawList.map(normalizeShopify);

        // Fetch subsequent pages sequentially (due to Shopify cursor restriction)
        let linkHeader = res.headers.get('Link');
        let nextUrl = getNextPageUrl(linkHeader);
        let pagesFetched = 1;

        if (nextUrl && pagesFetched < 10) {
          setLoadingBackground(true);
          while (nextUrl && pagesFetched < 10) {
            try {
              const bRes = await fetch(nextUrl, {
                headers: {
                  'X-Shopify-Access-Token': token,
                  'X-Shop-Domain': domain,
                }
              });
              if (!bRes.ok) break;
              const bData = await bRes.json();
              const bRaw = bData.customers || [];
              if (bRaw.length === 0) break;
              
              const normalizedB = bRaw.map(normalizeShopify);
              currentList = [...currentList, ...normalizedB];
              
              linkHeader = bRes.headers.get('Link');
              nextUrl = getNextPageUrl(linkHeader);
              pagesFetched++;
            } catch (err) {
              console.error('Error fetching background Shopify page:', err);
              break;
            }
          }
          setLoadingBackground(false);
        }

        setStoreCustomers(currentList);
        setTotalCount(currentList.length);
      }
      else if (platform === 'wordpress') {
        const url = ((profile as any).wordpress_url || '').replace(/\/$/, '');
        const ck = (profile as any).woo_consumer_key || '';
        const cs = (profile as any).woo_consumer_secret || '';
        if (!url || !ck || !cs) {
          throw new Error('WooCommerce no está configurado.');
        }

        const wcHeaders = {
          'x-wc-base-url': url,
          'x-wc-consumer-key': ck,
          'x-wc-consumer-secret': cs
        };

        const normalizeWoo = (c: any) => {
          return {
            id: c.id,
            first_name: c.first_name || '',
            last_name: c.last_name || '',
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Cliente sin nombre',
            email: c.email || '',
            phone: c.billing?.phone || c.shipping?.phone || c.phone || '',
            orders_count: c.orders_count || 0,
            total_spent: parseFloat(c.total_spent || 0),
            address: c.billing?.address_1
              ? `${c.billing.address_1 || ''}, ${c.billing.city || ''}, ${c.billing.state || ''}, ${c.billing.country || ''}`.replace(/^,\s*/, '')
              : null,
            platform: 'wordpress'
          };
        };

        const mergeWooCustomers = (registered: any[], orders: any[]) => {
          const map = new Map<string, any>();
          
          for (const c of registered) {
            if (c.email) map.set(c.email.toLowerCase().trim(), c);
          }

          for (const o of orders) {
            const email = (o.billing?.email || o.shipping?.email || '').toLowerCase().trim();
            if (!email) continue;
            
            if (map.has(email)) {
              const existing = map.get(email);
              if (existing.orders_count === 0 && o.customer_id === 0) {
                existing.orders_count = 1;
                existing.total_spent = parseFloat(o.total || 0);
              }
            } else {
              const first_name = o.billing?.first_name || o.shipping?.first_name || '';
              const last_name = o.billing?.last_name || o.shipping?.last_name || '';
              const phone = o.billing?.phone || o.shipping?.phone || '';
              const address = o.shipping?.address_1
                ? `${o.shipping.address_1 || ''}, ${o.shipping.city || ''}, ${o.shipping.state || ''}, ${o.shipping.country || ''}`.replace(/^,\s*/, '')
                : o.billing?.address_1
                ? `${o.billing.address_1 || ''}, ${o.billing.city || ''}, ${o.billing.state || ''}, ${o.billing.country || ''}`.replace(/^,\s*/, '')
                : null;
              
              map.set(email, {
                id: `guest_${o.id}`,
                first_name,
                last_name,
                name: `${first_name} ${last_name}`.trim() || 'Cliente WooCommerce (Invitado)',
                email,
                phone,
                orders_count: 1,
                total_spent: parseFloat(o.total || 0),
                address,
                platform: 'wordpress',
                is_guest: true
              });
            }
          }
          return Array.from(map.values());
        };

        // 1. Fetch first page of registered customers
        const params = new URLSearchParams({
          per_page: '100',
          page: '1',
        });
        if (search.trim()) {
          params.set('search', search.trim());
        }

        const res = await fetch(`/api/shopify/wc/customers?${params.toString()}`, {
          headers: wcHeaders
        });

        if (!res.ok) throw new Error(`Error de WooCommerce: ${res.status}`);
        const rawList = await res.json();

        // 2. Fetch first page of orders to get guest checkouts
        const oParams = new URLSearchParams({
          per_page: '100',
          page: '1',
        });
        if (search.trim()) {
          oParams.set('search', search.trim());
        }
        const oRes = await fetch(`/api/shopify/wc/orders?${oParams.toString()}`, {
          headers: wcHeaders
        });
        const rawOrders = oRes.ok ? await oRes.json() : [];

        // Check total pages to fetch in parallel
        const totalPagesHeader = res.headers.get('X-WP-TotalPages');
        const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
        const totalOrderPagesHeader = oRes.headers.get('X-WP-TotalPages');
        const totalOrderPages = totalOrderPagesHeader ? parseInt(totalOrderPagesHeader, 10) : 1;

        let maxPagesToFetch = Math.min(Math.max(totalPages, totalOrderPages), 10);
        
        let allCustPagesData = [rawList];
        let allOrderPagesData = [rawOrders];

        if (maxPagesToFetch > 1) {
          setLoadingBackground(true);
          const pagePromises = [];
          for (let p = 2; p <= maxPagesToFetch; p++) {
            if (p <= totalPages) {
              const cParams = new URLSearchParams({ per_page: '100', page: String(p) });
              if (search.trim()) cParams.set('search', search.trim());
              pagePromises.push(
                fetch(`/api/shopify/wc/customers?${cParams.toString()}`, { headers: wcHeaders })
                  .then(r => r.ok ? r.json() : [])
                  .catch(() => [])
              );
            } else {
              pagePromises.push(Promise.resolve([]));
            }

            if (p <= totalOrderPages) {
              const ordParams = new URLSearchParams({ per_page: '100', page: String(p) });
              if (search.trim()) ordParams.set('search', search.trim());
              pagePromises.push(
                fetch(`/api/shopify/wc/orders?${ordParams.toString()}`, { headers: wcHeaders })
                  .then(r => r.ok ? r.json() : [])
                  .catch(() => [])
              );
            } else {
              pagePromises.push(Promise.resolve([]));
            }
          }

          const results = await Promise.all(pagePromises);
          for (let i = 0; i < results.length; i += 2) {
            allCustPagesData.push(results[i] || []);
            allOrderPagesData.push(results[i + 1] || []);
          }
          setLoadingBackground(false);
        }

        let fullRegisteredList = [];
        for (const pageCusts of allCustPagesData) {
          fullRegisteredList.push(...(Array.isArray(pageCusts) ? pageCusts : []).map(normalizeWoo));
        }

        let fullOrdersList = [];
        for (const pageOrders of allOrderPagesData) {
          fullOrdersList.push(...(Array.isArray(pageOrders) ? pageOrders : []));
        }

        const finalMergedList = mergeWooCustomers(fullRegisteredList, fullOrdersList);
        setStoreCustomers(finalMergedList);
        setTotalCount(finalMergedList.length);
      }
      else if (platform === 'tiendanube') {
        const storeId = (profile as any).tiendanube_store_id || '';
        const token = (profile as any).tiendanube_access_token || '';
        if (!storeId || !token) {
          throw new Error('Tiendanube no está configurada.');
        }

        const tnHeaders = {
          'x-tn-store-id': storeId,
          'x-tn-token': token
        };

        const normalizeTn = (c: any) => {
          const defaultAddr = c.addresses?.find((a: any) => a.default) || c.addresses?.[0] || null;
          const addressStr = defaultAddr
            ? `${defaultAddr.address || ''}, ${defaultAddr.city || ''}, ${defaultAddr.province || ''}, ${defaultAddr.country || ''}`.replace(/^,\s*/, '')
            : null;

          return {
            id: c.id,
            first_name: (c.name || '').split(' ')[0] || '',
            last_name: (c.name || '').split(' ').slice(1).join(' ') || '',
            name: c.name || 'Cliente sin nombre',
            email: c.email || '',
            phone: c.phone || c.addresses?.find((a: any) => a.phone)?.phone || '',
            orders_count: null,
            total_spent: null,
            address: addressStr,
            platform: 'tiendanube'
          };
        };

        const params = new URLSearchParams({
          per_page: '100',
          page: '1',
        });
        if (search.trim()) {
          params.set('q', search.trim());
        }

        const res = await fetch(`/api/shopify/tn/customers?${params.toString()}`, {
          headers: tnHeaders
        });

        if (!res.ok) throw new Error(`Error de Tiendanube: ${res.status}`);
        
        const rawList = await res.json();
        let finalTnList = (Array.isArray(rawList) ? rawList : []).map(normalizeTn);

        if (rawList.length === 100) {
          setLoadingBackground(true);
          const tnPromises = [];
          for (let p = 2; p <= 10; p++) {
            const cParams = new URLSearchParams({ per_page: '100', page: String(p) });
            if (search.trim()) cParams.set('q', search.trim());
            tnPromises.push(
              fetch(`/api/shopify/tn/customers?${cParams.toString()}`, { headers: tnHeaders })
                .then(r => r.ok ? r.json() : [])
                .catch(() => [])
            );
          }

          const results = await Promise.all(tnPromises);
          for (const bRaw of results) {
            const normalizedB = (Array.isArray(bRaw) ? bRaw : []).map(normalizeTn);
            finalTnList.push(...normalizedB);
          }
          setLoadingBackground(false);
        }

        setStoreCustomers(finalTnList);
        setTotalCount(finalTnList.length);
      }
    } catch (e: any) {
      setError(e.message || 'Error al obtener clientes de la tienda.');
    } finally {
      setLoading(false);
    }
  }, [search, profile, platform]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Search Input Change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setVisibleCount(100);
  };

  // Select Store Customer
  const handleSelectStoreCustomer = async (c: any) => {
    setSelectedStoreCust(c);
    setStoreCustStats(null);
    setSelectedCustOrders([]);
    setOrdersError(null);
    
    if (!c) return;

    // Load stats and orders list
    setLoadingStats(true);
    setLoadingOrders(true);
    try {
      let ordersList: any[] = [];
      const email = c.email;

      const domain = ((profile as any).shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      const token = (profile as any).shopify_access_token || '';
      const wordpressUrl = ((profile as any).wordpress_url || '').replace(/\/$/, '');
      const wooConsumerKey = (profile as any).woo_consumer_key || '';
      const wooConsumerSecret = (profile as any).woo_consumer_secret || '';
      const tiendanubeStoreId = (profile as any).tiendanube_store_id || '';
      const tiendanubeToken = (profile as any).tiendanube_access_token || '';

      if (email) {
        if (platform === 'shopify') {
          const oUrl = `/api/shopify/orders.json?status=any&email=${encodeURIComponent(email)}&limit=250`;
          const oRes = await fetch(oUrl, {
            headers: {
              'X-Shopify-Access-Token': token,
              'X-Shop-Domain': domain,
            }
          });
          if (oRes.ok) {
            const oData = await oRes.json();
            ordersList = oData.orders || [];
          }
        } 
        else if (platform === 'wordpress') {
          const wcHeaders = {
            'x-wc-base-url': wordpressUrl,
            'x-wc-consumer-key': wooConsumerKey,
            'x-wc-consumer-secret': wooConsumerSecret
          };

          const oUrl = `/api/shopify/wc/orders?search=${encodeURIComponent(email)}&per_page=100`;
          const oRes = await fetch(oUrl, { headers: wcHeaders });
          if (oRes.ok) {
            const oData = await oRes.json();
            const rawOrders = Array.isArray(oData) ? oData : [];
            const filteredOrders = rawOrders.filter((o: any) =>
              (o.billing?.email || '').toLowerCase().trim() === email.toLowerCase().trim()
            );
            ordersList = filteredOrders.map((o: any) => {
              const financial_status = o.status === 'completed' || o.status === 'processing' ? 'paid' : o.status === 'refunded' ? 'refunded' : 'pending';
              const fulfillment_status = o.status === 'completed' ? 'fulfilled' : 'unfulfilled';
              
              const customerName = (() => {
                const billName = o.billing ? `${o.billing.first_name || ''} ${o.billing.last_name || ''}`.trim() : '';
                if (billName) return billName;
                const shipName = o.shipping ? `${o.shipping.first_name || ''} ${o.shipping.last_name || ''}`.trim() : '';
                if (shipName) return shipName;
                return 'Cliente WooCommerce';
              })();

              return {
                id: o.id,
                order_number: o.number,
                name: `#${o.number}`,
                created_at: o.date_created,
                financial_status,
                fulfillment_status,
                total_price: o.total,
                subtotal_price: o.subtotal || String(parseFloat(o.total || '0') - parseFloat(o.total_tax || '0') - parseFloat(o.shipping_total || '0')),
                total_tax: o.total_tax,
                total_discounts: o.discount_total,
                customer_name: customerName,
                phone: o.billing?.phone || o.shipping?.phone || null,
                shipping_address: o.shipping?.address_1 ? {
                  address1: o.shipping.address_1,
                  city: o.shipping.city,
                  province: o.shipping.state,
                  country: o.shipping.country,
                } : null,
                line_items: (o.line_items || []).map((it: any) => ({
                  title: it.name,
                  quantity: it.quantity,
                  price: it.price,
                  variant_title: it.meta_data?.filter((m: any) => m.display_key && !m.display_key.startsWith('_')).map((m: any) => m.display_value).join(' / ') || null,
                  _wc_image: it.image?.src || null
                }))
              };
            });
          }
        }
        else if (platform === 'tiendanube') {
          const tnHeaders = {
            'x-tn-store-id': tiendanubeStoreId,
            'x-tn-token': tiendanubeToken
          };
 
          const oUrl = `/api/shopify/tn/orders?email=${encodeURIComponent(email)}&per_page=200`;
          const oRes = await fetch(oUrl, { headers: tnHeaders });
          if (oRes.ok) {
            const oData = await oRes.json();
            const rawOrders = Array.isArray(oData) ? oData : [];
            const filteredOrders = rawOrders.filter((o: any) =>
              (o.customer?.email || '').toLowerCase().trim() === email.toLowerCase().trim()
            );
            ordersList = filteredOrders.map((o: any) => {
              const payStatus = o.payment_status;
              const financial_status = payStatus === 'paid' ? 'paid' : payStatus === 'refunded' ? 'refunded' : payStatus === 'voided' ? 'voided' : 'pending';
              const fulfillment_status = (o.shipping_status === 'shipped' || o.shipping_status === 'delivered') ? 'fulfilled' : 'unfulfilled';
              
              const customerName = o.customer?.name || o.shipping_address?.name || 'Cliente Tiendanube';
 
              return {
                id: o.id,
                order_number: o.number,
                name: `#${o.number}`,
                created_at: o.created_at,
                financial_status,
                fulfillment_status,
                total_price: o.total,
                subtotal_price: o.subtotal,
                total_tax: o.tax,
                total_discounts: o.discount,
                customer_name: customerName,
                phone: o.customer?.phone || o.shipping_address?.phone || null,
                shipping_address: o.shipping_address ? {
                  address1: o.shipping_address.address,
                  city: o.shipping_address.city,
                  province: o.shipping_address.province,
                  country: o.shipping_address.country,
                } : null,
                line_items: (o.products || []).map((it: any) => ({
                  title: it.name,
                  quantity: it.quantity,
                  price: it.price,
                  variant_title: it.variant_values ? it.variant_values.map((vv: any) => vv.es || vv.en || Object.values(vv || {})[0] || '').filter(Boolean).join(' / ') : null,
                  _wc_image: it.image?.src || null
                }))
              };
            });
          }
        }
      }

      const sorted = ordersList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSelectedCustOrders(sorted);

      const totalSpent = sorted.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
      setStoreCustStats({
        ordersCount: sorted.length,
        totalSpent
      });
    } catch (err: any) {
      console.error('Error fetching customer orders:', err);
      setOrdersError('No se pudieron obtener los pedidos.');
    } finally {
      setLoadingStats(false);
      setLoadingOrders(false);
    }
  };

  // Avatar Initials + Gradient builder
  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-pink-500 to-rose-500 text-white',
      'from-violet-500 to-purple-500 text-white',
      'from-blue-500 to-indigo-500 text-white',
      'from-emerald-500 to-teal-500 text-white',
      'from-amber-500 to-orange-500 text-white',
      'from-sky-500 to-cyan-500 text-white',
    ];
    if (!name) return gradients[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  // Filters logic
  const filteredCustomers = useMemo(() => {
    return storeCustomers.filter(c => {
      // Show only customers who purchased from the store (orders_count > 0 or unknown null)
      if (c.orders_count !== null && c.orders_count <= 0) return false;
      
      if (filterType === 'new') {
        return c.orders_count === 1;
      }
      if (filterType === 'frequent') {
        return c.orders_count > 1;
      }
      return true;
    });
  }, [storeCustomers, filterType]);

  // Sorting logic
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'spent') {
        const spentA = a.total_spent || 0;
        const spentB = b.total_spent || 0;
        return spentB - spentA;
      }
      if (sortBy === 'orders') {
        const countA = a.orders_count || 0;
        const countB = b.orders_count || 0;
        return countB - countA;
      }
      // Default: 'recent'
      const idA = typeof a.id === 'number' ? a.id : parseInt(a.id) || 0;
      const idB = typeof b.id === 'number' ? b.id : parseInt(b.id) || 0;
      return idB - idA;
    });
  }, [filteredCustomers, sortBy]);

  // Infinite scroll: visible slice
  const visibleCustomers = useMemo(() => {
    return sortedCustomers.slice(0, visibleCount);
  }, [sortedCustomers, visibleCount]);

  // Reset visible window when filter/sort changes
  useEffect(() => { setVisibleCount(100); }, [search, sortBy]);

  // IntersectionObserver sentinel to load more
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && visibleCount < sortedCustomers.length) {
        setVisibleCount(c => Math.min(c + 100, sortedCustomers.length));
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCount, sortedCustomers.length]);

  if (!hasStore) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-16 text-center bg-[#f5f5f7] dark:bg-[#0a0a0a]">
        <div className="max-w-md w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-[32px] p-8 md:p-10 shadow-xl animate-in fade-in zoom-in-95 duration-300">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 flex items-center justify-center mb-6">
            <ShoppingBag className="w-8 h-8" />
          </div>

          <h2 className="text-[24px] font-black tracking-tight text-zinc-900 dark:text-white mb-2">
            Conectá tu Tienda Online
          </h2>
          <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mb-8 leading-relaxed">
            Vinculá Shopify, WooCommerce o Tiendanube en tu panel de accesos para poder visualizar, filtrar y analizar a todos tus clientes.
          </p>

          <button
            type="button"
            onClick={() => navigate('/links')}
            className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white text-[13px] font-black rounded-2xl transition-all shadow-sm shadow-pink-500/10 active:scale-[0.98]"
          >
            Vincular Tienda en Mis Accesos
          </button>
        </div>
      </div>
    );
  }

  return (
    <CenteredPageLoader isLoading={loading && storeCustomers.length === 0}>
      <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a0a]">
        <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT COLUMN: Customers list */}
          <div className={`w-full md:w-[320px] flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300 ${selectedStoreCust ? 'hidden md:flex' : 'flex'}`}>
            
            {/* Header, Search & Filters */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="page-title text-[18px] sm:text-[20px]">Clientes</h1>
                {loadingBackground && (
                  <span className="flex items-center gap-1 text-[10.5px] text-zinc-400 dark:text-zinc-500 font-black">
                    <Loader2 className="w-3 h-3 animate-spin text-pink-500" />
                    Cargando...
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-455 dark:text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar clientes..."
                    value={search}
                    onChange={handleSearchChange}
                    className="w-full pl-9 pr-3 h-8 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[11.5px] outline-none transition-all duration-200 text-zinc-750 dark:text-zinc-350 focus:border-blue-500/80 focus:bg-white dark:focus:bg-zinc-950 focus:ring-4 focus:ring-blue-500/10 placeholder:text-zinc-405"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-8 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 text-[11px] font-bold text-zinc-650 dark:text-zinc-450 outline-none transition-all duration-200 cursor-pointer focus:border-blue-500/80 focus:bg-white dark:focus:bg-zinc-950 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="recent">Recientes</option>
                  <option value="name">Nombre</option>
                  <option value="spent">Mayor Gasto</option>
                  <option value="orders">Más Pedidos</option>
                </select>
              </div>
            </div>

            {/* List scroll container */}
            <div className="flex-1 overflow-y-auto py-2 space-y-1">
              {loading && storeCustomers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <p className="text-[11px] text-zinc-400">Obteniendo clientes...</p>
                </div>
              ) : error ? (
                <div className="p-4 text-[11px] text-red-500 font-semibold">{error}</div>
              ) : sortedCustomers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
                  <User className="w-8 h-8 opacity-40" />
                  <p className="text-[12px] font-bold">Sin clientes</p>
                </div>
              ) : (
                <>
                  {visibleCustomers.map(c => {
                    const isSelected = selectedStoreCust?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelectStoreCustomer(c)}
                        className={`mx-2.5 my-0.5 px-2.5 py-1.5 flex items-center gap-2.5 transition-all duration-200 cursor-pointer rounded-xl group ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/10'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/35 border border-transparent'
                        }`}
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {/* Pedidos Count */}
                          <span className={`inline-flex items-center justify-center shrink-0 min-w-[18px] h-[18px] px-1 rounded-md text-[9.5px] font-black tracking-tighter ${
                            isSelected 
                              ? 'bg-white/20 text-white' 
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}>
                            {c.orders_count ?? 0}
                          </span>
                          <p className={`text-[12px] truncate font-bold flex-1 ${isSelected ? 'text-white' : 'text-zinc-800 dark:text-zinc-100'}`}>
                            {c.email || c.name || 'Sin email'}
                          </p>
                        </div>

                        {/* Gasto Total Badge */}
                        {c.total_spent !== null && c.total_spent !== undefined && c.total_spent > 0 && (
                          <span className={`text-[10.5px] font-extrabold whitespace-nowrap shrink-0 ${isSelected ? 'text-white' : 'text-emerald-500 dark:text-emerald-400'}`}>
                            {fmtCurr(c.total_spent)}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="py-1">
                    {visibleCount < sortedCustomers.length && (
                      <div className="flex justify-center py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <PortalWrapper active={isMobile && !!selectedStoreCust}>
            <>
            {/* Backdrop — mobile only, closes on tap */}
            {selectedStoreCust && (
              <div className="fixed inset-0 z-[500] bg-black/70 md:hidden" onClick={() => setSelectedStoreCust(null)} />
            )}
            <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${selectedStoreCust ? 'fixed inset-0 z-[501] bg-white dark:bg-zinc-950 md:relative md:inset-auto md:z-auto md:bg-zinc-50 md:dark:bg-zinc-900/30 md:flex' : 'relative hidden md:flex'}`}>
            {!selectedStoreCust ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">🛍️</div>
                <p className="text-[13.5px] font-medium">Seleccioná un cliente para ver estadísticas y pedidos</p>
              </div>
            ) : (
              <>
                {/* Sticky mobile header with close button */}
                <div className="md:hidden flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="min-w-0">
                    <p className="text-[14px] font-black text-zinc-900 dark:text-white truncate">{selectedStoreCust.name}</p>
                    <p className="text-[10px] text-zinc-400 font-medium">Perfil del cliente</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStoreCust(null)}
                    className="ml-3 flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-750 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-all shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 min-w-0 overflow-y-auto p-6 md:p-8 space-y-6 w-full">

                {/* Header block */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
                  <div>
                    <h2 className="text-[20px] font-black tracking-tight text-zinc-900 dark:text-white">{selectedStoreCust.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        Plataforma:
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                        {selectedStoreCust.platform === 'wordpress' ? 'WooCommerce' : selectedStoreCust.platform}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  </div>
                </div>

                {/* E-commerce stats grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    {
                      label: 'Gasto Total',
                      value: loadingStats
                        ? 'Cargando...'
                        : storeCustStats?.totalSpent !== null && storeCustStats?.totalSpent !== undefined
                          ? fmtCurr(storeCustStats.totalSpent)
                          : '—',
                      icon: CreditCard,
                      color: 'text-emerald-500',
                      bg: 'bg-emerald-500/10'
                    },
                    {
                      label: 'Total Pedidos',
                      value: loadingStats
                        ? 'Cargando...'
                        : storeCustStats?.ordersCount !== null && storeCustStats?.ordersCount !== undefined
                          ? `${storeCustStats.ordersCount} pedidos`
                          : '—',
                      icon: ShoppingBag,
                      color: 'text-pink-500',
                      bg: 'bg-pink-500/10'
                    },
                    {
                      label: 'Ticket Promedio',
                      value: loadingStats
                        ? 'Cargando...'
                        : storeCustStats?.totalSpent && storeCustStats?.ordersCount
                          ? fmtCurr(storeCustStats.totalSpent / storeCustStats.ordersCount)
                          : '—',
                      icon: ShoppingCart,
                      color: 'text-violet-500',
                      bg: 'bg-violet-500/10'
                    }
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white dark:bg-[#161618] border border-zinc-150 dark:border-zinc-800/60 rounded-[16px] p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                          <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
                      </div>
                      <p className="text-[18px] font-black text-zinc-900 dark:text-white tracking-tight">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Store customer details block */}
                <div className="bg-white dark:bg-[#161618] border border-zinc-150 dark:border-zinc-800/60 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-[13px] font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60 pb-2">
                    Información de Contacto
                  </h3>

                  <div className="space-y-3.5 text-[12.5px]">
                    {selectedStoreCust.email && (
                      <div className="flex items-start gap-3 text-zinc-600 dark:text-zinc-300">
                        <Mail className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Correo Electrónico</p>
                          <a href={`mailto:${selectedStoreCust.email}`} className="font-bold hover:underline hover:text-pink-500">
                            {selectedStoreCust.email}
                          </a>
                        </div>
                      </div>
                    )}

                    {selectedStoreCust.phone && (
                      <div className="flex items-start gap-3 text-zinc-600 dark:text-zinc-300">
                        <Phone className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Teléfono</p>
                          <p className="font-bold">{selectedStoreCust.phone}</p>
                        </div>
                      </div>
                    )}

                    {selectedStoreCust.address && (
                      <div className="flex items-start gap-3 text-zinc-600 dark:text-zinc-300">
                        <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Dirección de Envío</p>
                          <p className="font-bold">{selectedStoreCust.address}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>



                {/* Orders History List */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-[13px] font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wider px-1">
                    Historial de Pedidos ({selectedCustOrders.length})
                  </h3>
                  
                  {loadingOrders ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 bg-white dark:bg-[#161618] border border-zinc-150 dark:border-zinc-800/60 rounded-2xl">
                      <Loader2 className="w-5 h-5 animate-spin text-pink-500" />
                      <p className="text-[11px] text-zinc-400">Cargando historial de pedidos...</p>
                    </div>
                  ) : ordersError ? (
                    <div className="p-4 text-[11px] text-red-500 font-semibold bg-white dark:bg-[#161618] border border-zinc-150 dark:border-zinc-800/60 rounded-2xl">
                      {ordersError}
                    </div>
                  ) : selectedCustOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 bg-white dark:bg-[#161618] border border-zinc-150 dark:border-zinc-800/60 rounded-2xl text-zinc-400 gap-2">
                      <ShoppingBag className="w-7 h-7 opacity-40" />
                      <p className="text-[12px] font-bold">Sin pedidos registrados</p>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-[#161618] border border-zinc-150 dark:border-zinc-800/60 rounded-2xl shadow-sm dark:shadow-none overflow-hidden w-full animate-in fade-in duration-300">
                      {/* Mobile: card list */}
                      <div className="md:hidden divide-y divide-zinc-100 dark:divide-white/[0.04]">
                        {selectedCustOrders.map(order => (
                          <OrderMobileCard key={order.id} order={order} />
                        ))}
                      </div>
                      {/* Desktop: table */}
                      <div className="hidden md:block">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-zinc-100 dark:border-white/[0.04] bg-zinc-50/50 dark:bg-white/[0.015]">
                              <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Fecha</th>
                              <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Productos</th>
                              <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Pago</th>
                              <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider">Envío</th>
                              <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider text-right">Total</th>
                              <th className="px-4 py-3"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedCustOrders.map(order => (
                              <OrderItemRow key={order.id} order={order} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </>
          )}
          </div>
            </>
        </PortalWrapper>
        </div>
      </div>
    </CenteredPageLoader>
  );
}
