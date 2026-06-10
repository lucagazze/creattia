import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import {
  Search, User, Mail, Phone, MapPin, 
  Loader2, ArrowLeft, ArrowRight, MessageSquare, 
  ShoppingBag, CreditCard, ShoppingCart, AlertCircle
} from 'lucide-react';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';

const fmtCurr = (n: number) => {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function ContactosPage() {
  const navigate = useNavigate();
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const cwUrl = (profile as any)?.chatwoot_url;
  const cwToken = (profile as any)?.chatwoot_token;
  const hasChatwoot = !!(cwUrl && cwToken);

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
  const [chatwootContactId, setChatwootContactId] = useState<number | null>(null);
  const [checkingChatwoot, setCheckingChatwoot] = useState(false);

  // Common list states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters and Sorting
  const [filterType, setFilterType] = useState<'all' | 'new' | 'frequent'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'spent' | 'orders'>('name');

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

        let url = `/api/shopify/customers.json?limit=50`;
        if (search.trim()) {
          url = `/api/shopify/customers/search.json?query=${encodeURIComponent(search)}&limit=50`;
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
        
        const normalized = rawList.map((c: any) => {
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
        });

        setStoreCustomers(normalized);
        setTotalCount(normalized.length);
      }
      else if (platform === 'wordpress') {
        const url = ((profile as any).wordpress_url || '').replace(/\/$/, '');
        const ck = (profile as any).woo_consumer_key || '';
        const cs = (profile as any).woo_consumer_secret || '';
        if (!url || !ck || !cs) {
          throw new Error('WooCommerce no está configurado.');
        }

        const params = new URLSearchParams({
          per_page: '100',
          page: String(currentPage),
        });
        if (search.trim()) {
          params.set('search', search.trim());
        }

        const res = await fetch(`/api/shopify/wc/customers?${params.toString()}`, {
          headers: {
            'x-wc-base-url': url,
            'x-wc-consumer-key': ck,
            'x-wc-consumer-secret': cs
          }
        });

        if (!res.ok) throw new Error(`Error de WooCommerce: ${res.status}`);
        
        const totalCountHeader = res.headers.get('X-WP-Total');
        if (totalCountHeader) {
          setTotalCount(parseInt(totalCountHeader, 10));
        }

        const rawList = await res.json();
        const normalized = (Array.isArray(rawList) ? rawList : []).map((c: any) => {
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
        });

        setStoreCustomers(normalized);
        if (!totalCountHeader) {
          setTotalCount(normalized.length);
        }
      }
      else if (platform === 'tiendanube') {
        const storeId = (profile as any).tiendanube_store_id || '';
        const token = (profile as any).tiendanube_access_token || '';
        if (!storeId || !token) {
          throw new Error('Tiendanube no está configurada.');
        }

        const params = new URLSearchParams({
          per_page: '100',
          page: String(currentPage),
        });
        if (search.trim()) {
          params.set('q', search.trim());
        }

        const res = await fetch(`/api/shopify/tn/customers?${params.toString()}`, {
          headers: {
            'x-tn-store-id': storeId,
            'x-tn-token': token
          }
        });

        if (!res.ok) throw new Error(`Error de Tiendanube: ${res.status}`);
        
        const rawList = await res.json();
        const normalized = (Array.isArray(rawList) ? rawList : []).map((c: any) => {
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
        });

        setStoreCustomers(normalized);
        setTotalCount(150); // Pagination helper
      }
    } catch (e: any) {
      setError(e.message || 'Error al obtener clientes de la tienda.');
    } finally {
      setLoading(false);
    }
  }, [search, currentPage, profile, platform]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Search Input Change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  // Select Store Customer
  const handleSelectStoreCustomer = async (c: any) => {
    setSelectedStoreCust(c);
    setStoreCustStats(null);
    setChatwootContactId(null);
    
    if (!c) return;

    // Search Chatwoot contact by email in the background if configured
    if (cwUrl && cwToken && c.email) {
      setCheckingChatwoot(true);
      try {
        const cwData = await chatwoot.searchContacts(cwUrl, cwToken, c.email, 1);
        const contact = (cwData?.payload || cwData?.data || [])[0];
        if (contact) {
          setChatwootContactId(contact.id);
        }
      } catch (err) {
        console.warn('Error fetching Chatwoot contact:', err);
      } finally {
        setCheckingChatwoot(false);
      }
    }

    // Load stats if they are not present
    if (c.platform === 'tiendanube') {
      setLoadingStats(true);
      try {
        const storeId = (profile as any)?.tiendanube_store_id || '';
        const token = (profile as any)?.tiendanube_access_token || '';
        const oUrl = `/api/shopify/tn/orders?email=${encodeURIComponent(c.email)}&per_page=200`;
        const oRes = await fetch(oUrl, { headers: { 'x-tn-store-id': storeId, 'x-tn-token': token } });
        if (oRes.ok) {
          const oData = await oRes.json();
          const ordersList = Array.isArray(oData) ? oData : [];
          const totalSpent = ordersList.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
          setStoreCustStats({
            ordersCount: ordersList.length,
            totalSpent
          });
        }
      } catch (err) {
        console.error('Error fetching Tiendanube customer stats:', err);
      } finally {
        setLoadingStats(false);
      }
    } else {
      setStoreCustStats({
        ordersCount: c.orders_count,
        totalSpent: c.total_spent
      });
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
      // If Tiendanube, metrics are loaded asynchronously, so we don't filter them out here
      if (c.orders_count === null) return true;
      
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

  // Pagination bounds
  const startItem = (currentPage - 1) * 100 + 1;
  const endItem = Math.min(currentPage * 100, totalCount);
  const totalPages = Math.ceil(totalCount / 100) || 1;

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
      <div className="flex flex-col h-full w-full overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a0a]">
        <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT COLUMN: Customers list */}
          <div className="w-full md:w-[320px] flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300">
            
            {/* Header, Search & Filters */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 space-y-3">
              <h1 className="text-[18px] font-black tracking-tight text-zinc-900 dark:text-white">Clientes</h1>


              
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar clientes..."
                    value={search}
                    onChange={handleSearchChange}
                    className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-400 text-zinc-700 dark:text-zinc-300"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
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
                sortedCustomers.map(c => {
                  const isSelected = selectedStoreCust?.id === c.id;
                  const gradient = getAvatarGradient(c.name || String(c.id));
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
                      {/* Initials Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black bg-gradient-to-br shadow-inner flex-shrink-0 ${gradient}`}>
                        {getInitials(c.name || '')}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] truncate font-bold ${isSelected ? 'text-white' : 'text-zinc-800 dark:text-zinc-100'}`}>
                          {c.name || 'Cliente sin nombre'}
                        </p>
                        <p className={`text-[9.5px] font-mono mt-0.5 truncate ${isSelected ? 'text-blue-250' : 'text-zinc-500 dark:text-zinc-400'}`}>
                          {c.phone || c.email || 'Sin teléfono/email'}
                        </p>
                      </div>

                      {/* Gasto Total Badge */}
                      {c.total_spent !== null && c.total_spent !== undefined && c.total_spent > 0 && (
                        <span className={`text-[10.5px] font-extrabold whitespace-nowrap shrink-0 ${isSelected ? 'text-white' : 'text-zinc-700 dark:text-zinc-300'}`}>
                          {fmtCurr(c.total_spent)}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Footer */}
            {totalCount > 0 && !(platform === 'shopify') && (
              <div className="p-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 select-none">
                <span>{startItem}-{endItem} de {totalCount}</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage <= 1 || loading}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-mono">{currentPage}/{totalPages}</span>
                  <button
                    disabled={currentPage >= totalPages || loading}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Details */}
          <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-900/30 overflow-hidden relative">
            {!selectedStoreCust ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">🛍️</div>
                <p className="text-[13.5px] font-medium">Seleccioná un cliente para ver estadísticas y pedidos</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-3xl w-full">
                
                {/* Header block */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] font-black bg-gradient-to-br shadow-inner ${getAvatarGradient(selectedStoreCust.name || '')}`}>
                      {getInitials(selectedStoreCust.name || '')}
                    </div>
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
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {/* Ver Pedidos Button */}
                    <button
                      type="button"
                      onClick={() => navigate(`/cliente/${selectedStoreCust.email}`)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-[12px] font-black shadow-sm shadow-pink-500/10 transition-all active:scale-[0.98]"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      Ver Pedidos
                    </button>

                    {/* Start Chat Button (via Chatwoot linkage) */}
                    {hasChatwoot && (
                      <button
                        type="button"
                        onClick={async () => {
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
                        }}
                        disabled={checkingChatwoot || !chatwootContactId}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[12px] font-black shadow-sm shadow-blue-500/10 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                      >
                        {checkingChatwoot ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <MessageSquare className="w-4 h-4" />
                        )}
                        {chatwootContactId ? 'Iniciar Chat' : 'Sin chat activo'}
                      </button>
                    )}
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

                {hasChatwoot && !chatwootContactId && !checkingChatwoot && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-250 dark:border-amber-900/30 rounded-xl flex items-start gap-3 text-[11.5px] text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Sin vinculación directa de mensajería</p>
                      <p className="text-[10.5px] opacity-90 mt-0.5">
                        No se encontró un contacto en Chatwoot con el correo <strong>{selectedStoreCust.email}</strong>. Para chatear, buscalo por su nombre o teléfono directamente en la sección de atención.
                      </p>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </CenteredPageLoader>
  );
}
