import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { ecommerce, parseOrderAttribution } from '../services/ecommerce';
import type { OrderAttribution } from '../services/ecommerce';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import {
  ShoppingCart, Search, ChevronDown, ChevronUp, Package,
  CheckCircle, AlertTriangle, RefreshCw,
  User, MapPin, Tag, Truck, CreditCard, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';

const PINK = '#ec4899';
const PAGE_SIZE = 30;

const fmtCurr = (n: number) => {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// Argentina is UTC-3, no DST. All date strings use this timezone.
const TZ = 'America/Argentina/Buenos_Aires';
// Returns YYYY-MM-DD in Argentina time
const toArgYMD = (d: Date): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
const argDateStr = (offsetDays = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toArgYMD(d);
};
const todayStr     = () => argDateStr(0);
const daysAgo      = (n: number) => argDateStr(-n);
const yesterdayStr = () => argDateStr(-1);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const label = d.toLocaleDateString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  const parts = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  const ymd = toArgYMD(d);
  if (ymd === argDateStr(0))  return { label, tag: 'Hoy',  time };
  if (ymd === argDateStr(-1)) return { label, tag: 'Ayer', time };
  return { label, tag: null, time };
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
};

// ─── badges ───────────────────────────────────────────────────────────────

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
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${cls}`}>{label}</span>;
}

function FulfillmentBadge({ status }: { status: string | null }) {
  const s = status || 'unfulfilled';
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    fulfilled:   { label: 'Enviado',    cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400', icon: <Truck className="w-2.5 h-2.5" /> },
    unfulfilled: { label: 'Sin enviar', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',   icon: <Package className="w-2.5 h-2.5" /> },
    partial:     { label: 'Parcial',    cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',        icon: <Package className="w-2.5 h-2.5" /> },
    restocked:   { label: 'Devuelto',   cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500',                                   icon: <RefreshCw className="w-2.5 h-2.5" /> },
  };
  const { label, cls, icon } = map[s] ?? { label: s, cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ─── Attribution badge ────────────────────────────────────────────────────────

const ATTR_STYLE: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  meta_ads:   { dot: 'bg-blue-500',    bg: 'bg-blue-50 dark:bg-blue-500/10',     text: 'text-blue-700 dark:text-blue-400',     border: 'border-blue-200 dark:border-blue-500/20' },
  google_ads: { dot: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-500/10',   text: 'text-amber-700 dark:text-amber-400',   border: 'border-amber-200 dark:border-amber-500/20' },
  email:      { dot: 'bg-violet-500',  bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-500/20' },
  organic:    { dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20' },
  direct:     { dot: 'bg-zinc-400',    bg: 'bg-zinc-100 dark:bg-zinc-800',       text: 'text-zinc-500 dark:text-zinc-400',     border: 'border-zinc-200 dark:border-zinc-700' },
  other:      { dot: 'bg-zinc-400',    bg: 'bg-zinc-100 dark:bg-zinc-800',       text: 'text-zinc-500 dark:text-zinc-400',     border: 'border-zinc-200 dark:border-zinc-700' },
};

const AttributionBadge = ({ attribution }: { attribution: OrderAttribution | null }) => {
  if (!attribution) return null;
  const s = ATTR_STYLE[attribution.source] ?? ATTR_STYLE.other;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-[2px] rounded-full border text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {attribution.label}
    </span>
  );
};

const AttributionFull = ({ attribution }: { attribution: OrderAttribution | null }) => {
  if (!attribution) return null;
  const s = ATTR_STYLE[attribution.source] ?? ATTR_STYLE.other;
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${s.bg} ${s.border}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
      <div>
        <p className={`text-[11px] font-black ${s.text}`}>{attribution.label}</p>
        {attribution.detail && (
          <p className="text-[10px] text-zinc-400 truncate max-w-[200px] mt-0.5">{attribution.detail}</p>
        )}
      </div>
    </div>
  );
};

// ─── Expanded Detail (shared between table row and mobile card) ───────────────

function OrderDetail({ order, productImages }: { order: any; productImages: Record<string, string> }) {
  const lineItems: any[] = order.line_items || [];
  const customerName = order.customer
    ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Sin nombre'
    : 'Sin cliente';
  const attribution = parseOrderAttribution(order);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* Products */}
      <div>
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
          <Package className="w-3 h-3" /> Productos
        </p>
        <div className="space-y-2">
          {lineItems.map((item: any, i: number) => {
            const img = item._wc_image || productImages[String(item.product_id)];
            return (
              <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-white/[0.03] border border-zinc-100 dark:border-white/[0.05]">
                <div className="shrink-0 min-w-[32px] h-8 px-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center">
                  <span className="text-[13px] font-black">×{item.quantity}</span>
                </div>
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center border border-zinc-200/60 dark:border-white/[0.06]">
                  {img
                    ? <img src={img} alt={item.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    : <Package className="w-3.5 h-3.5 text-zinc-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100 leading-snug">{item.title}</p>
                  {item.variant_title && item.variant_title !== 'Default Title' && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">{item.variant_title}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-black text-zinc-800 dark:text-zinc-200">{fmtCurr(parseFloat(item.price || 0))}</p>
                  <p className="text-[10px] text-zinc-400 font-medium mt-0.5">c/u</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cliente */}
      <div>
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
          <User className="w-3 h-3" /> Cliente
        </p>
        {order.customer ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {order.customer.email ? (
                <a
                  href={`#/cliente/${order.customer.email}`}
                  className="text-[13px] font-black text-zinc-800 dark:text-zinc-100 hover:underline hover:text-pink-500 transition-colors"
                >
                  {customerName}
                </a>
              ) : (
                <p className="text-[13px] font-black text-zinc-800 dark:text-zinc-100">{customerName}</p>
              )}
              {order.customer.orders_count === 1 && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-[3px] rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/25">
                  ✦ Nuevo cliente
                </span>
              )}
            </div>
            {order.customer.email && <p className="text-[11px] text-zinc-500">{order.customer.email}</p>}
            {order.customer.phone && <p className="text-[11px] text-zinc-500">{order.customer.phone}</p>}
            {order.customer.orders_count > 0 && (
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {fmtCurr(parseFloat(order.customer.total_spent || 0))} gastado en total
              </p>
            )}
            {order.customer.email && (
              <a
                href={`#/cliente/${order.customer.email}`}
                className="flex items-center justify-center gap-2 mt-3 w-full py-2.5 bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white rounded-xl text-[12px] font-black shadow-lg shadow-pink-500/20 transition-all hover:scale-[1.02]"
              >
                <User className="w-4 h-4" />
                Ver Perfil y Pedidos
              </a>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-zinc-400">Sin datos de cliente</p>
        )}
        {attribution && (
          <div className="mt-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
              <ShoppingCart className="w-3 h-3" /> Origen del pedido
            </p>
            <AttributionFull attribution={attribution} />
          </div>
        )}
        {order.shipping_address && (
          <div className="mt-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> Envío
            </p>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {[order.shipping_address.address1, order.shipping_address.city, order.shipping_address.province, order.shipping_address.country].filter(Boolean).join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Totales */}
      <div>
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
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
              <span className="font-bold text-zinc-700 dark:text-zinc-300">{fmtCurr(parseFloat(sl.price || 0))}</span>
            </div>
          ))}
          {parseFloat(order.total_tax || 0) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-500">Impuestos</span>
              <span className="font-bold text-zinc-700 dark:text-zinc-300">{fmtCurr(parseFloat(order.total_tax))}</span>
            </div>
          )}
          <div className="flex justify-between text-[13px] font-black border-t border-zinc-200 dark:border-white/[0.06] pt-2 mt-1">
            <span className="text-zinc-900 dark:text-white">Total</span>
            <span className="text-zinc-900 dark:text-white">{fmtCurr(parseFloat(order.total_price || 0))}</span>
          </div>
        </div>
        {order.discount_codes?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {order.discount_codes.map((dc: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                <Tag className="w-2 h-2" /> {dc.code}
              </span>
            ))}
          </div>
        )}
        <p className="text-[10px] text-zinc-400 mt-2.5">{fmtDateTime(order.created_at)}</p>
      </div>

    </div>
  );
}

// ─── order row (desktop table) ────────────────────────────────────────────

const OrderRow = memo(function OrderRow({ order, productImages }: { order: any; productImages: Record<string, string> }) {
  const [open, setOpen] = useState(false);

  const customerName = order.customer
    ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Sin nombre'
    : 'Sin cliente';

  const { label: dateLabel, tag: dateTag, time: dateTime } = fmtDate(order.created_at);
  const attribution = parseOrderAttribution(order);

  const handleToggle = useCallback(() => setOpen(v => !v), []);

  return (
    <>
      <tr
        onClick={handleToggle}
        className={`border-b border-zinc-100/80 dark:border-white/[0.04] cursor-pointer ${
          open ? 'bg-zinc-50 dark:bg-white/[0.025]' : 'hover:bg-zinc-50/70 dark:hover:bg-white/[0.015]'
        }`}
      >
        {/* Fecha */}
        <td className="px-3 sm:px-4 py-1.5">
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1">
              {dateTag && (
                <span className={`text-[9px] font-black uppercase tracking-wider px-1 py-[0.5px] rounded shrink-0 ${
                  dateTag === 'Hoy'
                    ? 'bg-pink-500/10 dark:bg-pink-500/20 text-pink-500 dark:text-pink-400'
                    : 'bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400'
                }`}>
                  {dateTag}
                </span>
              )}
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap font-medium">{dateLabel}</span>
            </div>
            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mt-0.5">{dateTime} hs</span>
          </div>
        </td>

        {/* Cliente */}
        <td className="px-3 sm:px-4 py-1.5 max-w-[120px] sm:max-w-none">
          <div className="flex items-center gap-1.5 flex-wrap">
            {order.customer?.email ? (
              <a 
                href={`#/cliente/${order.customer.email}`} 
                onClick={(e) => e.stopPropagation()} 
                className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100 truncate hover:underline hover:text-pink-500 transition-colors"
              >
                {customerName}
              </a>
            ) : (
              <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100 truncate">{customerName}</p>
            )}
            {order.customer?.orders_count === 1 && (
              <span className="shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-[2px] rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/25">
                ✦ Nuevo
              </span>
            )}
          </div>
          {order.customer?.email && (
            <p className="text-[10px] text-zinc-400 truncate hidden sm:block mt-0.5">{order.customer.email}</p>
          )}
        </td>

        {/* Origen */}
        <td className="hidden sm:table-cell px-3 sm:px-4 py-1.5">
          {attribution ? (
            <AttributionBadge attribution={attribution} />
          ) : (
            <span className="text-[11px] text-zinc-400 dark:text-zinc-555">—</span>
          )}
        </td>

        {/* Pago */}
        <td className="hidden md:table-cell px-3 sm:px-4 py-1.5">
          <PaymentBadge status={order.financial_status} />
        </td>

        {/* Envío */}
        <td className="px-2 sm:px-4 py-1.5">
          <FulfillmentBadge status={order.fulfillment_status} />
        </td>

        {/* Total */}
        <td className="px-2 sm:px-4 py-1.5 text-right">
          <span className="text-[12px] sm:text-[13px] font-black text-zinc-900 dark:text-white whitespace-nowrap">
            {fmtCurr(parseFloat(order.total_price || 0))}
          </span>
        </td>

        {/* Expand */}
        <td className="px-2 sm:px-4 py-1.5">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
            open ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'
          }`}>
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </td>
      </tr>

      {/* ── Detail ── */}
      {open && (
        <tr className="border-b border-zinc-100/80 dark:border-white/[0.04] bg-zinc-50/70 dark:bg-white/[0.02]">
          <td colSpan={7} className="px-5 py-5">
            <OrderDetail order={order} productImages={productImages} />
          </td>
        </tr>
      )}
    </>
  );
});

// ─── order card (mobile) ──────────────────────────────────────────────────

const OrderCard = memo(function OrderCard({ order, productImages }: { order: any; productImages: Record<string, string> }) {
  const [open, setOpen] = useState(false);

  const customerName = order.customer
    ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Sin nombre'
    : 'Sin cliente';

  const { label: dateLabel, tag: dateTag, time: dateTime } = fmtDate(order.created_at);
  const attribution = parseOrderAttribution(order);

  const handleToggle = useCallback(() => setOpen(v => !v), []);

  return (
    <div className={`border-b border-zinc-100 dark:border-white/[0.04] last:border-b-0 ${open ? 'bg-zinc-50/80 dark:bg-white/[0.02]' : ''}`}>
      {/* Card summary row */}
      <button
        onClick={handleToggle}
        className="w-full px-4 py-3.5 flex items-start gap-3 text-left"
      >
        {/* Left: Date + customer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {dateTag && (
              <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-[1px] rounded shrink-0 ${
                dateTag === 'Hoy'
                  ? 'bg-pink-500/10 text-pink-500 dark:text-pink-400'
                  : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
              }`}>
                {dateTag}
              </span>
            )}
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{dateLabel} · {dateTime}hs</span>
          </div>
          <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">{customerName}</p>
          {order.customer?.email && (
            <p className="text-[10px] text-zinc-400 truncate mt-0.5">{order.customer.email}</p>
          )}
          {/* Badges row */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <PaymentBadge status={order.financial_status} />
            <FulfillmentBadge status={order.fulfillment_status} />
            {attribution && <AttributionBadge attribution={attribution} />}
            {order.customer?.orders_count === 1 && (
              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-[2px] rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/25">
                ✦ Nuevo
              </span>
            )}
          </div>
        </div>

        {/* Right: total + expander */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-[15px] font-black text-zinc-900 dark:text-white whitespace-nowrap">
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

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-5 pt-1">
          <OrderDetail order={order} productImages={productImages} />
        </div>
      )}
    </div>
  );
});

// ─── Pagination ───────────────────────────────────────────────────────────

const Pagination = memo(function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1.5 py-5 flex-wrap">
      <button
        onClick={() => onChange(page - 1)} disabled={page === 1}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-[12px] text-zinc-400">…</span>
          : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={`w-8 h-8 rounded-xl text-[12px] font-bold ${
                page === p
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {p}
            </button>
          )
      )}
      <button
        onClick={() => onChange(page + 1)} disabled={page === totalPages}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRightIcon className="w-4 h-4" />
      </button>
    </div>
  );
});

// ─── presets ──────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Hoy',      since: () => todayStr(),     until: () => todayStr() },
  { label: 'Ayer',     since: () => yesterdayStr(),  until: () => yesterdayStr() },
  { label: '7 días',   since: () => daysAgo(6),      until: () => todayStr() },
  { label: '14 días',  since: () => daysAgo(13),     until: () => todayStr() },
  { label: '30 días',  since: () => daysAgo(29),     until: () => todayStr() },
  { label: '90 días',  since: () => daysAgo(89),     until: () => todayStr() },
];

// ─── main ─────────────────────────────────────────────────────────────────

export default function PedidosPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = (isViewingAs ? viewAsProfile : authProfile) as any;

  const shopifyDomain       = (profile?.shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shopifyToken        = profile?.shopify_access_token || '';
  const wordpressUrl        = (profile?.wordpress_url || '').replace(/\/$/, '');
  const wooConsumerKey      = profile?.woo_consumer_key || '';
  const wooConsumerSecret   = profile?.woo_consumer_secret || '';
  const tiendanubeStoreId   = profile?.tiendanube_store_id || '';
  const tiendanubeToken     = profile?.tiendanube_access_token || '';
  const isShopify           = !!(shopifyDomain && shopifyToken);
  const isWoo               = !!(wordpressUrl && wooConsumerKey && wooConsumerSecret);
  const isTiendaNube        = !!(tiendanubeStoreId && tiendanubeToken);
  const hasEcommerce        = isShopify || isWoo || isTiendaNube;

  const [orders, setOrders]               = useState<any[]>([]);
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [initialLoad, setInitialLoad]     = useState(true);

  const [search, setSearch]                       = useState('');
  const [filterPayment, setFilterPayment]         = useState<string>('all');
  const [filterFulfillment, setFilterFulfillment] = useState<string>('all');
  const [preset, setPreset]                       = useState(4); // 30 días default
  const [since, setSince]                         = useState(daysAgo(29));
  const [until, setUntil]                         = useState(todayStr());
  const [sortAsc, setSortAsc]                     = useState(false);
  const [page, setPage]                           = useState(1);

  const load = useCallback(async (s: string, u: string, isInitial = false) => {
    if (!isShopify && !isWoo && !isTiendaNube) return;
    setLoading(true);
    setError(null);
    try {
      let raw: any[] = [];
      if (isShopify) {
        const [orders, products] = await Promise.all([
          ecommerce.getShopifyOrders(shopifyDomain, shopifyToken, s, u),
          isInitial
            ? ecommerce.getProducts(shopifyDomain, shopifyToken).then(prods => {
                const map: Record<string, string> = {};
                for (const p of prods) {
                  const src = typeof p.image === 'string' ? p.image : p.image?.src;
                  if (src) map[String(p.id)] = src;
                }
                return map;
              }).catch(() => ({} as Record<string, string>))
            : Promise.resolve(null),
        ]);
        if (products !== null) setProductImages(products);
        raw = orders;
      } else if (isWoo) {
        raw = await ecommerce.getWooCommerceOrders(wordpressUrl, wooConsumerKey, wooConsumerSecret, s, u);
      } else if (isTiendaNube) {
        raw = await ecommerce.getTiendaNubeOrders(tiendanubeStoreId, tiendanubeToken, s, u);
      }
      setOrders([...raw].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (e: any) {
      setError(e?.message || 'Error al cargar pedidos');
    } finally {
      setLoading(false);
      if (isInitial) setInitialLoad(false);
    }
  }, [isShopify, isWoo, isTiendaNube, shopifyDomain, shopifyToken, wordpressUrl, wooConsumerKey, wooConsumerSecret, tiendanubeStoreId, tiendanubeToken]);

  useEffect(() => {
    load(since, until, true);
  }, [shopifyDomain, shopifyToken, wordpressUrl, wooConsumerKey, wooConsumerSecret, tiendanubeStoreId, tiendanubeToken]);

  useEffect(() => {
    if (initialLoad) return;
    load(since, until, false);
  }, [since, until]);

  const setPresetRange = useCallback((idx: number) => {
    setPreset(idx);
    setSince(PRESETS[idx].since());
    setUntil(PRESETS[idx].until());
    setPage(1);
  }, []);

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
        const name  = `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.toLowerCase();
        const email = (o.customer?.email || '').toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }
    return sortAsc ? [...list].reverse() : list;
  }, [orders, filterPayment, filterFulfillment, search, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleFilterChange = useCallback((fn: () => void) => { fn(); setPage(1); }, []);

  const stats = useMemo(() => {
    const valid = orders.filter(o => !o.cancelled_at && o.financial_status !== 'voided');
    return {
      total:     valid.length,
      revenue:   valid.reduce((s, o) => s + parseFloat(o.total_price || 0), 0),
      paid:      valid.filter(o => o.financial_status === 'paid').length,
      unshipped: valid.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled').length,
    };
  }, [orders]);

  if (!hasEcommerce) {
    return (
      <CenteredPageLoader isLoading={false}>
        <div className="w-full pt-4 pb-20 md:pt-6 flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
          <div className="w-14 h-14 rounded-[18px] bg-pink-500/10 flex items-center justify-center">
            <ShoppingCart className="w-7 h-7 text-pink-500" />
          </div>
          <p className="text-[15px] font-bold text-zinc-700 dark:text-zinc-300">Sin tienda configurada</p>
          <p className="text-[13px] text-zinc-400 max-w-[280px]">Configurá tu tienda en Mi Perfil para ver los pedidos.</p>
        </div>
      </CenteredPageLoader>
    );
  }

  return (
    <CenteredPageLoader isLoading={initialLoad && loading}>
      <div className="w-full pt-4 pb-20 md:pt-6 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(236,72,153,0.12)' }}>
            <ShoppingCart className="w-[18px] h-[18px]" style={{ color: PINK }} />
          </div>
          <div>
            <h1 className="text-[20px] font-black text-zinc-900 dark:text-white tracking-tight">Pedidos</h1>
            <p className="text-[11px] text-zinc-400 font-medium">Todos los pedidos de tu tienda</p>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { label: 'Pedidos',     value: stats.total.toString(),    icon: ShoppingCart, color: 'text-pink-500',    bg: 'bg-pink-500/10' },
            { label: 'Ingresos',    value: fmtCurr(stats.revenue),    icon: CreditCard,   color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Pagados',     value: stats.paid.toString(),      icon: CheckCircle,  color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Sin enviar',  value: stats.unshipped.toString(), icon: Package,      color: 'text-orange-500',  bg: 'bg-orange-500/10' },
          ] as const).map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white dark:bg-[#111] rounded-[14px] border border-black/[0.06] dark:border-white/[0.05] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] dark:shadow-none">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
              </div>
              <p className="text-[20px] font-black text-zinc-900 dark:text-white tracking-tight">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="bg-white dark:bg-[#111] rounded-[14px] border border-black/[0.06] dark:border-white/[0.05] shadow-[0_1px_8px_rgba(0,0,0,0.04)] dark:shadow-none p-4 space-y-3">

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setPresetRange(i)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold ${
                  preset === i
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search + status filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por cliente o email..."
                value={search}
                onChange={e => handleFilterChange(() => setSearch(e.target.value))}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-white/[0.06] text-[12px] text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterPayment}
                onChange={e => handleFilterChange(() => setFilterPayment(e.target.value))}
                className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-white/[0.06] text-[11px] font-bold text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
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
                onChange={e => handleFilterChange(() => setFilterFulfillment(e.target.value))}
                className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-white/[0.06] text-[11px] font-bold text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              >
                <option value="all">Todos los envíos</option>
                <option value="unfulfilled">Sin enviar</option>
                <option value="fulfilled">Enviado</option>
                <option value="partial">Parcial</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── List / Table ── */}
        <div className="bg-white dark:bg-[#111] rounded-[14px] border border-black/[0.06] dark:border-white/[0.05] shadow-[0_1px_8px_rgba(0,0,0,0.04)] dark:shadow-none overflow-hidden">

          {loading && !initialLoad ? (
            <div className="flex items-center justify-center py-14 gap-3">
              <RefreshCw className="w-4 h-4 animate-spin text-violet-500" />
              <p className="text-[13px] font-bold text-zinc-400">Cargando pedidos...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">Error al cargar</p>
              <p className="text-[12px] text-zinc-400 max-w-[280px]">{error}</p>
              <button
                onClick={() => load(since, until)}
                className="mt-1 px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[12px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                Reintentar
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-[13px] font-bold text-zinc-500 dark:text-zinc-400">
                {orders.length === 0 ? 'Sin pedidos en este período' : 'Sin resultados'}
              </p>
            </div>
          ) : (
            <>
              {/* Table meta */}
              <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/[0.04] flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-zinc-400">
                  {filtered.length} pedido{filtered.length !== 1 ? 's' : ''}
                  {orders.length !== filtered.length && <span className="text-zinc-300 dark:text-zinc-600"> de {orders.length}</span>}
                  {totalPages > 1 && <span className="ml-1.5 text-zinc-300 dark:text-zinc-600">· pág. {safePage}/{totalPages}</span>}
                </p>
                <button
                  onClick={() => { setSortAsc(v => !v); setPage(1); }}
                  className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span className="hidden sm:inline">{sortAsc ? 'Más antiguos' : 'Más recientes'}</span>
                </button>
              </div>

              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-zinc-100 dark:divide-white/[0.04]">
                {paginated.map(order => (
                  <OrderCard key={order.id} order={order} productImages={productImages} />
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-white/[0.04] bg-zinc-50/50 dark:bg-white/[0.015]">
                      <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em]">Fecha</th>
                      <th className="px-3 sm:px-4 py-2.5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em]">Cliente</th>
                      <th className="hidden sm:table-cell px-3 sm:px-4 py-2.5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em]">Origen</th>
                      <th className="hidden md:table-cell px-3 sm:px-4 py-2.5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em]">Pago</th>
                      <th className="px-2 sm:px-4 py-2.5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em]">Envío</th>
                      <th className="px-2 sm:px-4 py-2.5 text-right text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em]">Total</th>
                      <th className="px-2 sm:px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(order => (
                      <OrderRow key={order.id} order={order} productImages={productImages} />
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={safePage}
                totalPages={totalPages}
                onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              />
            </>
          )}
        </div>

      </div>
    </CenteredPageLoader>
  );
}
