import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import { chatwoot } from '../services/chatwoot';
import {
  ArrowLeft, User, Mail, Phone, MapPin, ShoppingBag, CreditCard,
  CheckCircle, Package, Truck, Calendar, ShoppingCart, RefreshCw,
  ExternalLink, MessageSquare, AlertTriangle, ChevronDown, ChevronUp, Tag
} from 'lucide-react';

const PINK = '#ec4899';

const fmtCurr = (n: number) => {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
        {lineItems.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900/50 border border-zinc-150/65 dark:border-white/[0.04]">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-350">
                ×{item.quantity}
              </span>
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
        ))}
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
          <span className="text-[16px] font-black text-emerald-600 dark:text-emerald-400">{fmtCurr(parseFloat(order.total_price || 0))}</span>
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
        <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400">
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
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <PaymentBadge status={order.financial_status} />
            <FulfillmentBadge status={order.fulfillment_status} order={order} />
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 self-center">
          <span className="text-[14px] font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
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

export default function ClientePage() {
  const { email } = useParams<{ email: string }>();
  const navigate = useNavigate();
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = (isViewingAs ? viewAsProfile : authProfile) as any;

  let activePlatform = profile?.ecommerce_platform;
  if (profile && !activePlatform) {
    if (profile.shopify_domain && profile.shopify_access_token) {
      activePlatform = 'shopify';
    } else if (profile.wordpress_url && profile.woo_consumer_key && profile.woo_consumer_secret) {
      activePlatform = 'wordpress';
    } else if (profile.tiendanube_store_id && profile.tiendanube_access_token) {
      activePlatform = 'tiendanube';
    }
  }

  const shopifyDomain = (profile?.shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shopifyToken = profile?.shopify_access_token || '';
  const wordpressUrl = (profile?.wordpress_url || '').replace(/\/$/, '');
  const wooConsumerKey = profile?.woo_consumer_key || '';
  const wooConsumerSecret = profile?.woo_consumer_secret || '';
  const tiendanubeStoreId = profile?.tiendanube_store_id || '';
  const tiendanubeToken = profile?.tiendanube_access_token || '';
  const cwUrl = profile?.chatwoot_url;
  const cwToken = profile?.chatwoot_token;

  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [chatwootContactId, setChatwootContactId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomerData = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setError(null);

    try {
      let ordersList: any[] = [];
      let customerInfo: any = {
        name: 'Cliente sin nombre',
        email: email,
        phone: null,
        address: null,
        orders_count: 0,
        total_spent: 0
      };

      if (activePlatform === 'shopify') {
        // Fetch Shopify customer info by email
        const cUrl = `/api/shopify/customers/search.json?query=email:${encodeURIComponent(email)}`;
        const cRes = await fetch(cUrl, { headers: { 'X-Shopify-Access-Token': shopifyToken, 'X-Shop-Domain': shopifyDomain } });
        let realShopifyCust: any = null;
        if (cRes.ok) {
          const cData = await cRes.json();
          realShopifyCust = cData.customers?.[0] || null;
        }

        // Fetch Shopify orders by email
        const oUrl = `/api/shopify/orders.json?status=any&email=${encodeURIComponent(email)}&limit=250`;
        const oRes = await fetch(oUrl, { headers: { 'X-Shopify-Access-Token': shopifyToken, 'X-Shop-Domain': shopifyDomain } });
        if (oRes.ok) {
          const oData = await oRes.json();
          ordersList = oData.orders || [];
        }

        // Normalize customer info
        if (realShopifyCust) {
          customerInfo = {
            name: `${realShopifyCust.first_name || ''} ${realShopifyCust.last_name || ''}`.trim() || 'Cliente Shopify',
            email: realShopifyCust.email,
            phone: realShopifyCust.phone || null,
            address: realShopifyCust.default_address
              ? `${realShopifyCust.default_address.address1 || ''}, ${realShopifyCust.default_address.city || ''}, ${realShopifyCust.default_address.province || ''}, ${realShopifyCust.default_address.country || ''}`.replace(/^,\s*/, '')
              : null,
            orders_count: realShopifyCust.orders_count || ordersList.length,
            total_spent: parseFloat(realShopifyCust.total_spent || 0)
          };
        } else if (ordersList.length > 0) {
          // Fallback from order history
          const lastOrder = ordersList[0];
          customerInfo = {
            name: lastOrder.customer
              ? `${lastOrder.customer.first_name || ''} ${lastOrder.customer.last_name || ''}`.trim()
              : 'Cliente Shopify',
            email: email,
            phone: lastOrder.customer?.phone || null,
            address: lastOrder.shipping_address
              ? `${lastOrder.shipping_address.address1 || ''}, ${lastOrder.shipping_address.city || ''}, ${lastOrder.shipping_address.province || ''}, ${lastOrder.shipping_address.country || ''}`.replace(/^,\s*/, '')
              : null,
            orders_count: ordersList.length,
            total_spent: ordersList.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0)
          };
        }
      } 
      else if (activePlatform === 'wordpress') {
        const wcHeaders = {
          'x-wc-base-url': wordpressUrl,
          'x-wc-consumer-key': wooConsumerKey,
          'x-wc-consumer-secret': wooConsumerSecret
        };

        // Fetch WooCommerce orders for this email
        const oUrl = `/api/shopify/wc/orders?search=${encodeURIComponent(email)}&per_page=100`;
        const oRes = await fetch(oUrl, { headers: wcHeaders });
        if (oRes.ok) {
          const oData = await oRes.json();
          const rawOrders = Array.isArray(oData) ? oData : [];
          // Double safeguard: filter by exact email match in the frontend
          const filteredOrders = rawOrders.filter((o: any) =>
            (o.billing?.email || '').toLowerCase().trim() === email.toLowerCase().trim()
          );
          ordersList = filteredOrders.map((o: any) => {
            const isCancelled = ['cancelled', 'failed'].includes(o.status);
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
                variant_title: it.meta_data?.filter((m: any) => m.display_key && !m.display_key.startsWith('_')).map((m: any) => m.display_value).join(' / ') || null
              }))
            };
          });
        }

        if (ordersList.length > 0) {
          const lastOrder = ordersList[0];
          // Fetch WooCommerce customer profile by email if registered
          const cUrl = `/api/shopify/wc/customers?email=${encodeURIComponent(email)}`;
          const cRes = await fetch(cUrl, { headers: wcHeaders });
          let realWooCust: any = null;
          if (cRes.ok) {
            const cData = await cRes.json();
            realWooCust = cData?.[0] || null;
          }

          if (realWooCust) {
            customerInfo = {
              name: `${realWooCust.first_name || ''} ${realWooCust.last_name || ''}`.trim() || 'Cliente WooCommerce',
              email: realWooCust.email,
              phone: realWooCust.billing?.phone || null,
              address: realWooCust.billing
                ? `${realWooCust.billing.address_1 || ''}, ${realWooCust.billing.city || ''}, ${realWooCust.billing.state || ''}, ${realWooCust.billing.country || ''}`.replace(/^,\s*/, '')
                : null,
              orders_count: realWooCust.orders_count || ordersList.length,
              total_spent: parseFloat(realWooCust.total_spent || 0)
            };
          } else {
            // Guest customer fallback - search for first order with a non-generic name, phone, or address
            const orderWithName = ordersList.find(o => o.customer_name && o.customer_name !== 'Cliente WooCommerce' && o.customer_name.trim() !== '') || lastOrder;
            const orderWithPhone = ordersList.find(o => o.phone && o.phone.trim() !== '') || lastOrder;
            const orderWithAddress = ordersList.find(o => o.shipping_address) || lastOrder;

            customerInfo = {
              name: orderWithName.customer_name || 'Cliente WooCommerce',
              email: email,
              phone: orderWithPhone.phone || null,
              address: orderWithAddress.shipping_address
                ? `${orderWithAddress.shipping_address.address1 || ''}, ${orderWithAddress.shipping_address.city || ''}, ${orderWithAddress.shipping_address.province || ''}, ${orderWithAddress.shipping_address.country || ''}`.replace(/^,\s*/, '')
                : null,
              orders_count: ordersList.length,
              total_spent: ordersList.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0)
            };
          }
        }
      }
      else if (activePlatform === 'tiendanube') {
        const tnHeaders = {
          'x-tn-store-id': tiendanubeStoreId,
          'x-tn-token': tiendanubeToken
        };

        // Fetch Tiendanube orders by email
        const oUrl = `/api/shopify/tn/orders?email=${encodeURIComponent(email)}&per_page=200`;
        const oRes = await fetch(oUrl, { headers: tnHeaders });
        if (oRes.ok) {
          const oData = await oRes.json();
          const rawOrders = Array.isArray(oData) ? oData : [];
          const filteredOrders = rawOrders.filter((o: any) =>
            (o.customer?.email || '').toLowerCase().trim() === email.toLowerCase().trim()
          );
          ordersList = filteredOrders.map((o: any) => {
            const isCancelled = o.status === 'cancelled';
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
                variant_title: it.variant_values ? it.variant_values.map((vv: any) => vv.es || vv.en || Object.values(vv || {})[0] || '').filter(Boolean).join(' / ') : null
              }))
            };
          });
        }

        if (ordersList.length > 0) {
          const lastOrder = ordersList[0];
          const orderWithName = ordersList.find(o => o.customer_name && o.customer_name !== 'Cliente Tiendanube' && o.customer_name.trim() !== '') || lastOrder;
          const orderWithPhone = ordersList.find(o => o.phone && o.phone.trim() !== '') || lastOrder;
          const orderWithAddress = ordersList.find(o => o.shipping_address) || lastOrder;

          customerInfo = {
            name: orderWithName.customer_name || 'Cliente Tiendanube',
            email: email,
            phone: orderWithPhone.phone || null,
            address: orderWithAddress.shipping_address
              ? `${orderWithAddress.shipping_address.address1 || ''}, ${orderWithAddress.shipping_address.city || ''}, ${orderWithAddress.shipping_address.province || ''}, ${orderWithAddress.shipping_address.country || ''}`.replace(/^,\s*/, '')
              : null,
            orders_count: ordersList.length,
            total_spent: ordersList.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0)
          };
        }
      }

      setCustomer(customerInfo);
      setOrders(ordersList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

      // Fetch Chatwoot Contact Id by email
      if (cwUrl && cwToken) {
        try {
          const cwData = await chatwoot.searchContacts(cwUrl, cwToken, email, 1);
          const contact = (cwData?.payload || cwData?.data || [])[0];
          if (contact) {
            setChatwootContactId(contact.id);
          }
        } catch (err) {
          console.warn('Error fetching Chatwoot contact:', err);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error al cargar los datos del cliente');
    } finally {
      setLoading(false);
    }
  }, [email, activePlatform, shopifyDomain, shopifyToken, wordpressUrl, wooConsumerKey, wooConsumerSecret, tiendanubeStoreId, tiendanubeToken, cwUrl, cwToken]);

  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  // Navigate to Chat
  const handleStartChat = async () => {
    if (!chatwootContactId || !cwUrl || !cwToken) return;
    try {
      const conversationsList = await chatwoot.getContactConversations(cwUrl, cwToken, chatwootContactId);
      if (conversationsList && conversationsList.length > 0) {
        navigate(`/atencion?convId=${conversationsList[0].id}`);
      } else {
        navigate('/atencion');
      }
    } catch {
      navigate('/atencion');
    }
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-pink-500 to-rose-500 text-white',
      'from-violet-500 to-purple-500 text-white',
      'from-blue-500 to-indigo-500 text-white',
      'from-emerald-500 to-teal-500 text-white',
      'from-amber-500 to-orange-500 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  const getInitials = (name: string) => {
    return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  };

  const avgTicket = useMemo(() => {
    if (orders.length === 0) return 0;
    const total = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    return total / orders.length;
  }, [orders]);

  if (loading) {
    return (
      <CenteredPageLoader isLoading={true}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-pink-500" />
          <p className="text-[13px] font-bold text-zinc-400">Cargando perfil del cliente...</p>
        </div>
      </CenteredPageLoader>
    );
  }

  if (error || !customer) {
    return (
      <div className="w-full pt-4 pb-20 flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <p className="text-[15px] font-bold text-zinc-700 dark:text-zinc-300">No se pudo cargar la información</p>
        <p className="text-[13px] text-zinc-400 max-w-[320px]">{error || 'El cliente no existe o no tiene pedidos.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[12px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          Volver atrás
        </button>
      </div>
    );
  }

  return (
    <div className="w-full pt-4 pb-20 md:pt-6 space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-white dark:bg-[#111] border border-black/[0.06] dark:border-white/[0.05] hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm dark:shadow-none"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver
      </button>

      {/* Header Card */}
      <div className="bg-white dark:bg-[#111] rounded-2xl border border-black/[0.06] dark:border-white/[0.05] p-6 shadow-sm dark:shadow-none flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-[20px] font-black bg-gradient-to-br shadow-inner ${getAvatarGradient(customer.name)}`}>
            {getInitials(customer.name)}
          </div>
          <div>
            <h1 className="text-[20px] font-black text-zinc-900 dark:text-white tracking-tight">{customer.name}</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[11px] text-zinc-400 mt-1">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {customer.email}</span>
              {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {customer.phone}</span>}
            </div>
            {customer.address && (
              <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {customer.address}
              </p>
            )}
          </div>
        </div>

        {chatwootContactId && (
          <button
            onClick={handleStartChat}
            className="flex items-center justify-center gap-2 px-4 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[12.5px] font-black shadow-md shadow-blue-500/10 transition-all active:scale-[0.98]"
          >
            <MessageSquare className="w-4 h-4" />
            Ver Chat en Atención
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Gasto Total', value: fmtCurr(customer.total_spent), icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Total Pedidos', value: `${orders.length} pedidos`, icon: ShoppingBag, color: 'text-pink-500', bg: 'bg-pink-500/10' },
          { label: 'Ticket Promedio', value: fmtCurr(avgTicket), icon: ShoppingCart, color: 'text-violet-500', bg: 'bg-violet-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-[#111] rounded-[16px] border border-black/[0.06] dark:border-white/[0.05] p-5 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6.5 h-6.5 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
            </div>
            <p className={`text-[20px] font-black tracking-tight ${label === 'Gasto Total' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Orders History List */}
      <div className="space-y-3">
        <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-55 tracking-tight px-1">Historial de Pedidos ({orders.length})</h2>
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-black/[0.06] dark:border-white/[0.05] shadow-sm dark:shadow-none overflow-hidden">
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-zinc-100 dark:divide-white/[0.04]">
            {orders.map(order => (
              <OrderMobileCard key={order.id} order={order} />
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
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
                {orders.map(order => (
                  <OrderItemRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
