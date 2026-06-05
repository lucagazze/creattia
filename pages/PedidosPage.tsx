import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { ecommerce } from '../services/ecommerce';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import {
  ShoppingCart, Search, ChevronDown, ChevronUp, Package,
  Clock, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  User, MapPin, Tag, Truck, CreditCard, ChevronRight
} from 'lucide-react';

const PINK = '#ec4899';

// ─── helpers ───────────────────────────────────────────────────────────────

const fmtCurr = (n: number) => {
  if (typeof n !== 'number') return '—';
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

// ─── badges ────────────────────────────────────────────────────────────────

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:                { label: 'Pagado',       cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
    pending:             { label: 'Pendiente',    cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
    refunded:            { label: 'Reembolsado',  cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    partially_refunded:  { label: 'Reemb. parcial', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    voided:              { label: 'Anulado',      cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400' },
    authorized:          { label: 'Autorizado',   cls: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string | null }) {
  const s = status || 'unfulfilled';
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    fulfilled:          { label: 'Enviado',       cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400', icon: <Truck className="w-2.5 h-2.5" /> },
    unfulfilled:        { label: 'Sin enviar',    cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400', icon: <Package className="w-2.5 h-2.5" /> },
    partial:            { label: 'Parcial',       cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', icon: <Package className="w-2.5 h-2.5" /> },
    restocked:          { label: 'Devuelto',      cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500', icon: <RefreshCw className="w-2.5 h-2.5" /> },
  };
  const { label, cls, icon } = map[s] ?? { label: s, cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ─── order row ─────────────────────────────────────────────────────────────

function OrderRow({ order }: { order: any }) {
  const [open, setOpen] = useState(false);
  const customerName = order.customer
    ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Sin nombre'
    : 'Sin cliente';

  return (
    <>
      <tr
        className={`border-b border-zinc-100 dark:border-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors ${open ? 'bg-zinc-50 dark:bg-white/[0.02]' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {/* Order # */}
        <td className="px-4 py-3 text-[12px] font-black text-zinc-800 dark:text-zinc-100 whitespace-nowrap">
          #{order.order_number || order.name}
        </td>
        {/* Date */}
        <td className="px-4 py-3 text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          {fmtDate(order.created_at)}
        </td>
        {/* Customer */}
        <td className="px-4 py-3">
          <div className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100 truncate max-w-[160px]">{customerName}</div>
          {order.customer?.email && (
            <div className="text-[10px] text-zinc-400 truncate max-w-[160px]">{order.customer.email}</div>
          )}
        </td>
        {/* Items */}
        <td className="px-4 py-3 text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          {order.line_items?.reduce((s: number, i: any) => s + i.quantity, 0) ?? 0} ud.
        </td>
        {/* Payment */}
        <td className="px-4 py-3"><PaymentBadge status={order.financial_status} /></td>
        {/* Fulfillment */}
        <td className="px-4 py-3"><FulfillmentBadge status={order.fulfillment_status} /></td>
        {/* Total */}
        <td className="px-4 py-3 text-[13px] font-black text-zinc-900 dark:text-white text-right whitespace-nowrap">
          {fmtCurr(parseFloat(order.total_price || 0))}
        </td>
        {/* Expand */}
        <td className="px-3 py-3 text-zinc-400">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </td>
      </tr>

      {/* Detail expanded */}
      {open && (
        <tr className="bg-zinc-50 dark:bg-white/[0.02] border-b border-zinc-100 dark:border-white/[0.04]">
          <td colSpan={8} className="px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Products */}
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Package className="w-3 h-3" /> Productos
                </p>
                <div className="space-y-1.5">
                  {(order.line_items || []).map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100 truncate">{item.title}</p>
                        {item.variant_title && item.variant_title !== 'Default Title' && (
                          <p className="text-[10px] text-zinc-400">{item.variant_title}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-black text-zinc-700 dark:text-zinc-300">{fmtCurr(item.price)}</p>
                        <p className="text-[10px] text-zinc-400">x{item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer & Shipping */}
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> Cliente
                </p>
                {order.customer ? (
                  <div className="space-y-1">
                    <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100">{customerName}</p>
                    {order.customer.email && <p className="text-[11px] text-zinc-500">{order.customer.email}</p>}
                    {order.customer.phone && <p className="text-[11px] text-zinc-500">{order.customer.phone}</p>}
                    <p className="text-[10px] text-zinc-400 mt-1">{order.customer.orders_count ?? 0} pedidos · {fmtCurr(order.customer.total_spent ?? 0)} total</p>
                  </div>
                ) : (
                  <p className="text-[12px] text-zinc-400">Sin datos de cliente</p>
                )}

                {order.shipping_address && (
                  <div className="mt-3">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> Envío
                    </p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
                      {[order.shipping_address.address1, order.shipping_address.city, order.shipping_address.province, order.shipping_address.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <CreditCard className="w-3 h-3" /> Resumen
                </p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Subtotal</span>
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">{fmtCurr(parseFloat(order.subtotal_price || 0))}</span>
                  </div>
                  {parseFloat(order.total_discounts || 0) > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-500 flex items-center gap-1"><Tag className="w-2.5 h-2.5" /> Descuento</span>
                      <span className="font-bold text-emerald-500">- {fmtCurr(parseFloat(order.total_discounts))}</span>
                    </div>
                  )}
                  {(order.shipping_lines || []).map((sl: any, i: number) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span className="text-zinc-500 flex items-center gap-1"><Truck className="w-2.5 h-2.5" /> {sl.title}</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">{fmtCurr(sl.price)}</span>
                    </div>
                  ))}
                  {parseFloat(order.total_tax || 0) > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-500">Impuestos</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">{fmtCurr(parseFloat(order.total_tax))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[13px] font-black border-t border-zinc-200 dark:border-white/[0.06] pt-1.5 mt-1.5">
                    <span className="text-zinc-800 dark:text-white">Total</span>
                    <span className="text-zinc-900 dark:text-white">{fmtCurr(parseFloat(order.total_price || 0))}</span>
                  </div>
                </div>
                {order.discount_codes?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {order.discount_codes.map((dc: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                        <Tag className="w-2 h-2" /> {dc.code}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-zinc-400 mt-2">{fmtDateTime(order.created_at)}</p>
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Hoy',       since: () => today(),        until: () => today() },
  { label: '7 días',    since: () => daysAgo(6),     until: () => today() },
  { label: '30 días',   since: () => daysAgo(29),    until: () => today() },
  { label: '90 días',   since: () => daysAgo(89),    until: () => today() },
];

export default function PedidosPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = (isViewingAs ? viewAsProfile : authProfile) as any;

  const platform = profile?.ecommerce_platform;
  const shopifyDomain = (profile?.shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shopifyToken = profile?.shopify_access_token;

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterFulfillment, setFilterFulfillment] = useState<string>('all');
  const [preset, setPreset] = useState(2); // default 30 días
  const [since, setSince] = useState(daysAgo(29));
  const [until, setUntil] = useState(today());
  const [sortAsc, setSortAsc] = useState(false);

  const hasEcommerce = !!(shopifyDomain && shopifyToken) || !!(profile?.tiendanube_store_id) || !!(profile?.wordpress_url);

  const load = async (s: string, u: string) => {
    if (!shopifyDomain || !shopifyToken) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await ecommerce.getShopifyOrders(shopifyDomain, shopifyToken, s, u);
      const sorted = [...raw].sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setOrders(sorted);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(since, until);
  }, [since, until, shopifyDomain, shopifyToken]);

  const setPresetRange = (idx: number) => {
    setPreset(idx);
    setSince(PRESETS[idx].since());
    setUntil(PRESETS[idx].until());
  };

  const filtered = useMemo(() => {
    let list = orders;
    if (filterPayment !== 'all') list = list.filter(o => o.financial_status === filterPayment);
    if (filterFulfillment !== 'all') {
      if (filterFulfillment === 'unfulfilled') list = list.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled');
      else list = list.filter(o => o.fulfillment_status === filterFulfillment);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o => {
        const num = String(o.order_number || o.name || '').toLowerCase();
        const name = `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.toLowerCase();
        const email = (o.customer?.email || '').toLowerCase();
        return num.includes(q) || name.includes(q) || email.includes(q);
      });
    }
    if (sortAsc) return [...list].reverse();
    return list;
  }, [orders, filterPayment, filterFulfillment, search, sortAsc]);

  // Summary stats
  const stats = useMemo(() => {
    const valid = orders.filter(o => !o.cancelled_at && o.financial_status !== 'voided');
    const revenue = valid.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    const paid = valid.filter(o => o.financial_status === 'paid').length;
    const unshipped = valid.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled').length;
    return { total: valid.length, revenue, paid, unshipped };
  }, [orders]);

  if (!hasEcommerce) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <ShoppingCart className="w-7 h-7 text-zinc-400" />
        </div>
        <p className="text-[15px] font-bold text-zinc-700 dark:text-zinc-300">Sin tienda configurada</p>
        <p className="text-[13px] text-zinc-400 max-w-[280px]">Configurá tu tienda en Mi Perfil para ver los pedidos.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#0a0a0a]">
      <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <ShoppingCart className="w-6 h-6" style={{ color: PINK }} />
              Pedidos
            </h1>
            <p className="text-[12px] text-zinc-400 mt-0.5">Todos los pedidos de tu tienda</p>
          </div>
          <button
            onClick={() => load(since, until)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.06] text-[12px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total pedidos', value: stats.total.toString(), icon: ShoppingCart, color: 'text-violet-500' },
            { label: 'Ingresos', value: fmtCurr(stats.revenue), icon: CreditCard, color: 'text-emerald-500' },
            { label: 'Pagados', value: stats.paid.toString(), icon: CheckCircle, color: 'text-emerald-500' },
            { label: 'Sin enviar', value: stats.unshipped.toString(), icon: Package, color: 'text-orange-500' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/[0.05] p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
              </div>
              <p className="text-[18px] font-black text-zinc-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/[0.05] p-4 shadow-sm space-y-3">
          {/* Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setPresetRange(i)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  preset === i
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={since}
                max={until}
                onChange={e => { setPreset(-1); setSince(e.target.value); }}
                className="px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06] text-[11px] font-bold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <span className="text-[11px] text-zinc-400 font-bold">—</span>
              <input
                type="date"
                value={until}
                min={since}
                onChange={e => { setPreset(-1); setUntil(e.target.value); }}
                className="px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06] text-[11px] font-bold text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Search + status filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por # pedido, cliente o email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06] text-[12px] text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <select
              value={filterPayment}
              onChange={e => setFilterPayment(e.target.value)}
              className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06] text-[11px] font-bold text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="all">Todos los pagos</option>
              <option value="paid">Pagado</option>
              <option value="pending">Pendiente</option>
              <option value="refunded">Reembolsado</option>
              <option value="partially_refunded">Reemb. parcial</option>
              <option value="voided">Anulado</option>
            </select>
            <select
              value={filterFulfillment}
              onChange={e => setFilterFulfillment(e.target.value)}
              className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06] text-[11px] font-bold text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="all">Todos los envíos</option>
              <option value="unfulfilled">Sin enviar</option>
              <option value="fulfilled">Enviado</option>
              <option value="partial">Parcial</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <RefreshCw className="w-4 h-4 animate-spin text-violet-500" />
              <p className="text-[13px] font-bold text-zinc-400">Cargando pedidos...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <p className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">Error al cargar</p>
              <p className="text-[12px] text-zinc-400 max-w-[280px]">{error}</p>
              <button onClick={() => load(since, until)} className="mt-1 px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[12px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all">
                Reintentar
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
              <ShoppingCart className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
              <p className="text-[13px] font-bold text-zinc-500 dark:text-zinc-400">
                {orders.length === 0 ? 'Sin pedidos en este período' : 'Sin resultados para tu búsqueda'}
              </p>
            </div>
          ) : (
            <>
              {/* Result count */}
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.04] flex items-center justify-between">
                <p className="text-[11px] font-bold text-zinc-400">
                  {filtered.length} pedido{filtered.length !== 1 ? 's' : ''}
                  {orders.length !== filtered.length && ` de ${orders.length}`}
                </p>
                <button
                  onClick={() => setSortAsc(v => !v)}
                  className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                  {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {sortAsc ? 'Más antiguos primero' : 'Más recientes primero'}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-white/[0.04]">
                      {['Pedido', 'Fecha', 'Cliente', 'Items', 'Pago', 'Envío', 'Total', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-zinc-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(order => (
                      <OrderRow key={order.id} order={order} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
