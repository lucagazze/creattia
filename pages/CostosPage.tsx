import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useToast } from '../components/Toast';
import { 
  ShoppingBag, Percent, CreditCard, Truck, FileText, Calendar, Plus, 
  Search, Trash2, Edit3, Save, AlertCircle, X, ChevronLeft, ChevronRight, 
  Info, Coins, Sparkles, Loader2, Landmark, Check, HelpCircle
} from 'lucide-react';

interface ProductCost {
  productId: string;
  title: string;
  cost: number;
  margin: number;
  packagingCost: number;
  lastUpdated: string;
}

interface AdditionalCostItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cost: number;
  dailyCost: number;
  currency: string;
  adSpend: boolean;
  platform: string;
}

const DEFAULT_PRODUCTS = [
  { id: 'prod_1', title: 'Remera Algodón Premium', price: 15000 },
  { id: 'prod_2', title: 'Pantalón Cargo Black', price: 32000 },
  { id: 'prod_3', title: 'Zapatillas Urban Run', price: 58000 },
  { id: 'prod_4', title: 'Buzo Oversize Grey', price: 28000 }
];

export default function CostosPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const profileId = profile?.id || 'default';
  const { showToast } = useToast();

  // Accordion Open/Close states
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    productos: true,
    plataforma: false,
    pago: false,
    envios: false,
    adicionales: false,
    dashboard: false
  });

  const toggleAccordion = (key: string) => {
    setOpenAccordions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // State values
  const [productCosts, setProductCosts] = useState<ProductCost[]>([]);
  const [platformCommissions, setPlatformCommissions] = useState({
    shopify: 2.0,
    tiendanube: 1.5,
    mercadolibre: 10.0,
    custom: 0.0
  });
  const [paymentFees, setPaymentFees] = useState({
    tiendanubeCPT: 0,
    shopifyFees: 1,
    iibb: 0
  });
  const [gateways, setGateways] = useState<Record<string, 'configured' | 'pending'>>({
    pagonube: 'configured',
    mercadopago: 'configured',
    gocuotas: 'pending',
    ualabis: 'pending',
    modo: 'pending'
  });
  const [shipping, setShipping] = useState({
    type: 'custom' as 'order' | 'custom',
    customShippingCost: 1500
  });

  // Additional costs lists
  const [additionalCosts, setAdditionalCosts] = useState<{
    equipo: AdditionalCostItem[];
    otros: AdditionalCostItem[];
    campanas: AdditionalCostItem[];
  }>({
    equipo: [
      { id: 'eq_1', name: 'aa', startDate: '2025-09-10', endDate: '2025-09-25', cost: 213, dailyCost: 13.3, currency: 'LOCAL', adSpend: false, platform: 'Meta' }
    ],
    otros: [
      { id: 'ot_1', name: 'Revenue', startDate: '2025-10-14', endDate: '2025-10-14', cost: 1000, dailyCost: 1000.0, currency: 'USD', adSpend: false, platform: '-' }
    ],
    campanas: [
      { id: 'ca_1', name: 'adspend', startDate: '2025-11-04', endDate: '2025-11-04', cost: 1000, dailyCost: 1000.0, currency: 'USD', adSpend: true, platform: '-' }
    ]
  });

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`car_costs_${profileId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.productCosts) setProductCosts(parsed.productCosts);
        if (parsed.platformCommissions) setPlatformCommissions(parsed.platformCommissions);
        if (parsed.paymentFees) setPaymentFees(parsed.paymentFees);
        if (parsed.gateways) setGateways(parsed.gateways);
        if (parsed.shipping) setShipping(parsed.shipping);
        if (parsed.additionalCosts) setAdditionalCosts(parsed.additionalCosts);
      } catch (e) {
        console.error('Error loading costs from localstorage:', e);
      }
    } else {
      // Set defaults for the tables
      setProductCosts([
        { productId: 'prod_1', title: 'Remera Algodón Premium', cost: 4500, margin: 70, packagingCost: 350, lastUpdated: new Date().toISOString().split('T')[0] },
        { productId: 'prod_2', title: 'Pantalón Cargo Black', cost: 9800, margin: 69.3, packagingCost: 350, lastUpdated: new Date().toISOString().split('T')[0] }
      ]);
    }
  }, [profileId]);

  // Save helper
  const saveToLocalStorage = (updatedData: any) => {
    const currentData = {
      productCosts,
      platformCommissions,
      paymentFees,
      gateways,
      shipping,
      additionalCosts,
      ...updatedData
    };
    localStorage.setItem(`car_costs_${profileId}`, JSON.stringify(currentData));
  };

  // ─── SECTION 1: PRODUCT COSTS ──────────────────────────────────────────
  const [shopifySearch, setShopifySearch] = useState('');
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  // Custom inputs for product cost config
  const [customCost, setCustomCost] = useState('');
  const [customPackaging, setCustomPackaging] = useState('350');
  const [customMargin, setCustomMargin] = useState('');

  // Shopify Products fetch
  const searchShopifyProducts = useCallback(async (query: string) => {
    const isShopify = profile?.ecommerce_platform === 'shopify' && profile?.shopify_domain && profile?.shopify_access_token;
    if (!isShopify) {
      // Mock search
      setLoadingProducts(true);
      setTimeout(() => {
        const filtered = DEFAULT_PRODUCTS.filter(p => p.title.toLowerCase().includes(query.toLowerCase()));
        setShopifyProducts(filtered);
        setLoadingProducts(false);
      }, 300);
      return;
    }
    
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
      console.error('Error fetching shopify products:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, [profile?.shopify_domain, profile?.shopify_access_token, profile?.ecommerce_platform]);

  useEffect(() => {
    searchShopifyProducts(shopifySearch);
  }, [shopifySearch, searchShopifyProducts]);

  const handleSelectProduct = (prod: any) => {
    setSelectedProduct(prod);
    const price = prod.variants?.[0]?.price || prod.price || 0;
    if (price) {
      // default cost is 30% of price
      const estimatedCost = Math.round(price * 0.3);
      setCustomCost(String(estimatedCost));
      // margin = ((price - cost) / price) * 100
      const marginVal = parseFloat((((price - estimatedCost) / price) * 100).toFixed(1));
      setCustomMargin(String(marginVal));
    } else {
      setCustomCost('');
      setCustomMargin('');
    }
  };

  const handleCostChange = (val: string) => {
    setCustomCost(val);
    const price = selectedProduct?.variants?.[0]?.price || selectedProduct?.price || 0;
    if (price && val) {
      const costNum = parseFloat(val);
      const marginVal = parseFloat((((price - costNum) / price) * 100).toFixed(1));
      setCustomMargin(String(marginVal));
    }
  };

  const handleAddProductCost = () => {
    if (!selectedProduct || !customCost) return;
    
    const newCostItem: ProductCost = {
      productId: selectedProduct.id || selectedProduct.product_id || String(Date.now()),
      title: selectedProduct.title,
      cost: parseFloat(customCost) || 0,
      margin: parseFloat(customMargin) || 0,
      packagingCost: parseFloat(customPackaging) || 0,
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    const updated = [newCostItem, ...productCosts.filter(p => p.productId !== newCostItem.productId)];
    setProductCosts(updated);
    saveToLocalStorage({ productCosts: updated });
    setSelectedProduct(null);
    setShopifySearch('');
    setCustomCost('');
    showToast('Costo de producto configurado con éxito.', 'success');
  };

  const handleDeleteProductCost = (id: string) => {
    const updated = productCosts.filter(p => p.productId !== id);
    setProductCosts(updated);
    saveToLocalStorage({ productCosts: updated });
    showToast('Costo de producto eliminado.', 'info');
  };

  // ─── SECTION 2: PLATFORM COMMISSIONS ──────────────────────────────────
  const handleSavePlatformCommissions = () => {
    saveToLocalStorage({ platformCommissions });
    showToast('Comisiones de plataforma guardadas con éxito.', 'success');
  };

  // ─── SECTION 3: PAYMENT GATEWAYS ──────────────────────────────────────
  const handleSavePaymentFees = () => {
    saveToLocalStorage({ paymentFees });
    showToast('Tasas de comisiones de pago guardadas con éxito.', 'success');
  };

  const toggleGatewayStatus = (gatewayKey: string) => {
    const nextStatus = gateways[gatewayKey] === 'configured' ? 'pending' : 'configured';
    const updatedGateways = {
      ...gateways,
      [gatewayKey]: nextStatus
    };
    setGateways(updatedGateways);
    saveToLocalStorage({ gateways: updatedGateways });
    showToast(`${gatewayKey.toUpperCase()} cambiado a ${nextStatus === 'configured' ? 'Configurado' : 'Pendiente'}.`, 'success');
  };

  // ─── SECTION 4: SHIPPING COSTS ────────────────────────────────────────
  const handleSaveShipping = () => {
    saveToLocalStorage({ shipping });
    showToast('Costos de envíos configurados con éxito.', 'success');
  };

  // ─── SECTION 5: ADDITIONAL COSTS ──────────────────────────────────────
  // Search inputs
  const [searchEquipo, setSearchEquipo] = useState('');
  const [searchOtros, setSearchOtros] = useState('');
  const [searchCampanas, setSearchCampanas] = useState('');

  // Pagination states
  const [pageEquipo, setPageEquipo] = useState(1);
  const [pageOtros, setPageOtros] = useState(1);
  const [pageCampanas, setPageCampanas] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCostItem, setEditingCostItem] = useState<AdditionalCostItem | null>(null);

  // Form states for Modal
  const [modalType, setModalType] = useState<'equipo' | 'otros' | 'campanas'>('equipo');
  const [modalName, setModalName] = useState('');
  const [modalStartDate, setModalStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalEndDate, setModalEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalCost, setModalCost] = useState('');
  const [modalCurrency, setModalCurrency] = useState('LOCAL');
  const [modalAdSpend, setModalAdSpend] = useState(false);
  const [modalPlatform, setModalPlatform] = useState('-');

  // Filtered lists
  const filteredEquipo = useMemo(() => {
    return additionalCosts.equipo.filter(item => 
      item.name.toLowerCase().includes(searchEquipo.toLowerCase())
    );
  }, [additionalCosts.equipo, searchEquipo]);

  const filteredOtros = useMemo(() => {
    return additionalCosts.otros.filter(item => 
      item.name.toLowerCase().includes(searchOtros.toLowerCase())
    );
  }, [additionalCosts.otros, searchOtros]);

  const filteredCampanas = useMemo(() => {
    return additionalCosts.campanas.filter(item => 
      item.name.toLowerCase().includes(searchCampanas.toLowerCase())
    );
  }, [additionalCosts.campanas, searchCampanas]);

  // Paginated lists
  const paginatedEquipo = useMemo(() => {
    const start = (pageEquipo - 1) * rowsPerPage;
    return filteredEquipo.slice(start, start + rowsPerPage);
  }, [filteredEquipo, pageEquipo, rowsPerPage]);

  const paginatedOtros = useMemo(() => {
    const start = (pageOtros - 1) * rowsPerPage;
    return filteredOtros.slice(start, start + rowsPerPage);
  }, [filteredOtros, pageOtros, rowsPerPage]);

  const paginatedCampanas = useMemo(() => {
    const start = (pageCampanas - 1) * rowsPerPage;
    return filteredCampanas.slice(start, start + rowsPerPage);
  }, [filteredCampanas, pageCampanas, rowsPerPage]);

  // Totals calculations
  const totalEquipoCost = useMemo(() => {
    return additionalCosts.equipo.reduce((sum, item) => sum + item.cost, 0);
  }, [additionalCosts.equipo]);

  const totalOtrosCost = useMemo(() => {
    return additionalCosts.otros.reduce((sum, item) => sum + item.cost, 0);
  }, [additionalCosts.otros]);

  const totalCampanasCost = useMemo(() => {
    return additionalCosts.campanas.reduce((sum, item) => sum + item.cost, 0);
  }, [additionalCosts.campanas]);

  const grandTotalCost = totalEquipoCost + totalOtrosCost + totalCampanasCost;

  // Open Modal to Add
  const handleOpenAddModal = (type: 'equipo' | 'otros' | 'campanas') => {
    setModalType(type);
    setEditingCostItem(null);
    setModalName('');
    setModalStartDate(new Date().toISOString().split('T')[0]);
    setModalEndDate(new Date().toISOString().split('T')[0]);
    setModalCost('');
    setModalCurrency('LOCAL');
    setModalAdSpend(type === 'campanas');
    setModalPlatform(type === 'equipo' ? 'Meta' : '-');
    setShowAddModal(true);
  };

  // Open Modal to Edit
  const handleOpenEditModal = (item: AdditionalCostItem, type: 'equipo' | 'otros' | 'campanas') => {
    setModalType(type);
    setEditingCostItem(item);
    setModalName(item.name);
    setModalStartDate(item.startDate);
    setModalEndDate(item.endDate);
    setModalCost(String(item.cost));
    setModalCurrency(item.currency);
    setModalAdSpend(item.adSpend);
    setModalPlatform(item.platform);
    setShowAddModal(true);
  };

  // Save Modal Action
  const handleSaveModalCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName || !modalCost) {
      showToast('Por favor complete todos los campos obligatorios.', 'warning');
      return;
    }

    const costNum = parseFloat(modalCost) || 0;
    
    // Daily cost calculation
    const start = new Date(modalStartDate);
    const end = new Date(modalEndDate);
    const dayDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const dailyCost = parseFloat((costNum / dayDiff).toFixed(1));

    const updatedItem: AdditionalCostItem = {
      id: editingCostItem?.id || `cost_${Date.now()}`,
      name: modalName,
      startDate: modalStartDate,
      endDate: modalEndDate,
      cost: costNum,
      dailyCost,
      currency: modalCurrency,
      adSpend: modalAdSpend,
      platform: modalPlatform
    };

    const typeKey = modalType;
    let listCopy = [...additionalCosts[typeKey]];

    if (editingCostItem) {
      listCopy = listCopy.map(c => c.id === editingCostItem.id ? updatedItem : c);
      showToast('Costo adicional actualizado.', 'success');
    } else {
      listCopy.unshift(updatedItem);
      showToast('Costo adicional agregado con éxito.', 'success');
    }

    const updatedAdditional = {
      ...additionalCosts,
      [typeKey]: listCopy
    };

    setAdditionalCosts(updatedAdditional);
    saveToLocalStorage({ additionalCosts: updatedAdditional });
    setShowAddModal(false);
  };

  // Delete cost row
  const handleDeleteCostItem = (id: string, type: 'equipo' | 'otros' | 'campanas') => {
    const updatedList = additionalCosts[type].filter(item => item.id !== id);
    const updatedAdditional = {
      ...additionalCosts,
      [type]: updatedList
    };
    setAdditionalCosts(updatedAdditional);
    saveToLocalStorage({ additionalCosts: updatedAdditional });
    showToast('Costo eliminado con éxito.', 'info');
  };

  // ─── SECTION 6: DASHBOARD SYNC ────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  
  const handleRequestDashboardSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setOpenAccordions(prev => ({ ...prev, dashboard: false }));
      showToast('¡Dashboard actualizado! Se cargaron los datos de costos del período (últimos 30 días).', 'success');
    }, 1500);
  };

  return (
    <div className="max-w-[1200px] mx-auto animate-fade-in pb-20 text-zinc-900 dark:text-zinc-100">
      
      {/* Title Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-black tracking-tight text-zinc-900 dark:text-white uppercase mb-1">
          Gestión de costos
        </h1>
        <p className="text-[13px] text-zinc-400 font-bold uppercase tracking-wider">
          Costos
        </p>
      </div>

      {/* Accordions Stack */}
      <div className="space-y-4">
        
        {/* Accordion 1: Costos de productos */}
        <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] overflow-hidden shadow-sm transition-all">
          <button 
            onClick={() => toggleAccordion('productos')}
            className="w-full flex items-center justify-between p-5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="text-[15px] font-bold text-zinc-900 dark:text-white">
                Costos de productos
              </span>
            </div>
            <ChevronLeft className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openAccordions.productos ? '-rotate-90' : ''}`} />
          </button>

          {openAccordions.productos && (
            <div className="p-6 border-t border-zinc-100 dark:border-white/[0.03] space-y-6">
              
              {/* Product Configuration Search */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-300">
                    Configurar Costo de Producto
                  </h4>
                  
                  {/* Search box */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                      type="text"
                      placeholder="Buscar producto de la tienda..."
                      value={shopifySearch}
                      onChange={e => setShopifySearch(e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[13px] focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>

                  {/* Search results */}
                  {shopifySearch && (
                    <div className="border border-zinc-100 dark:border-white/[0.05] bg-zinc-50 dark:bg-zinc-900/60 rounded-xl overflow-hidden max-h-[200px] overflow-y-auto divide-y divide-zinc-100 dark:divide-white/[0.03]">
                      {loadingProducts ? (
                        <div className="p-4 flex items-center justify-center text-zinc-400 text-[12px]">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Buscando catálogo...
                        </div>
                      ) : shopifyProducts.length === 0 ? (
                        <div className="p-4 text-zinc-400 text-[12px] text-center">
                          No se encontraron productos.
                        </div>
                      ) : (
                        shopifyProducts.map(p => (
                          <button
                            key={p.id}
                            onClick={() => handleSelectProduct(p)}
                            className="w-full p-3 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors text-left flex justify-between items-center text-[12px]"
                          >
                            <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate pr-4">{p.title}</span>
                            <span className="font-black text-violet-500 shrink-0">
                              ${(p.variants?.[0]?.price || p.price || 0).toLocaleString('es-AR')}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Form to configure selected product */}
                  {selectedProduct && (
                    <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.03] space-y-4 animate-in fade-in duration-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] uppercase font-black text-violet-500">Producto Seleccionado</p>
                          <h5 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{selectedProduct.title}</h5>
                        </div>
                        <button 
                          onClick={() => setSelectedProduct(null)} 
                          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-400 mb-1">Costo Unitario</label>
                          <input 
                            type="number"
                            placeholder="0"
                            value={customCost}
                            onChange={e => handleCostChange(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold text-zinc-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-400 mb-1">Embalaje / Envase</label>
                          <input 
                            type="number"
                            placeholder="350"
                            value={customPackaging}
                            onChange={e => setCustomPackaging(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold text-zinc-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-400 mb-1">Margen Neto (%)</label>
                          <input 
                            type="text"
                            disabled
                            value={customMargin ? `${customMargin}%` : '-'}
                            className="w-full h-10 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleAddProductCost}
                        className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[12px] font-bold shadow-md transition-all active:scale-[0.98]"
                      >
                        Guardar Costo
                      </button>
                    </div>
                  )}
                </div>

                {/* Info Box */}
                <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-150 dark:border-white/[0.02] flex flex-col justify-center">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mb-1">Costos de Mercadería</h4>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        Definir los costos unitarios de tus productos permite que la plataforma calcule la ganancia neta exacta en el Dashboard principal restando el costo de mercadería vendida (COGS) de tu facturación bruta.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table of Configured Costs */}
              <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-white/[0.03]">
                <h4 className="text-[13px] font-bold text-zinc-900 dark:text-white">
                  Costos de Productos Guardados
                </h4>

                <div className="overflow-x-auto border border-zinc-150 dark:border-white/[0.05] rounded-xl">
                  <table className="w-full text-[12px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-150 dark:border-white/[0.05] text-zinc-400 font-bold">
                        <th className="p-3">Producto</th>
                        <th className="p-3">Costo de Producto</th>
                        <th className="p-3">Embalaje / Caja</th>
                        <th className="p-3">Margen Proyectado</th>
                        <th className="p-3">Última Actualización</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.03]">
                      {productCosts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-zinc-400">
                            No hay costos de productos configurados todavía.
                          </td>
                        </tr>
                      ) : (
                        productCosts.map(p => (
                          <tr key={p.productId} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.01]">
                            <td className="p-3 font-bold text-zinc-800 dark:text-zinc-200">{p.title}</td>
                            <td className="p-3 font-black text-emerald-600 dark:text-emerald-400">${p.cost.toLocaleString('es-AR')}</td>
                            <td className="p-3 text-zinc-500">${p.packagingCost}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-[11px]">
                                {p.margin}%
                              </span>
                            </td>
                            <td className="p-3 text-zinc-400">{p.lastUpdated}</td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleDeleteProductCost(p.productId)}
                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Accordion 2: Comisiones de plataforma */}
        <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] overflow-hidden shadow-sm transition-all">
          <button 
            onClick={() => toggleAccordion('plataforma')}
            className="w-full flex items-center justify-between p-5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500">
                <Percent className="w-4 h-4" />
              </div>
              <span className="text-[15px] font-bold text-zinc-900 dark:text-white">
                Comisiones de plataforma
              </span>
            </div>
            <ChevronLeft className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openAccordions.plataforma ? '-rotate-90' : ''}`} />
          </button>

          {openAccordions.plataforma && (
            <div className="p-6 border-t border-zinc-100 dark:border-white/[0.03] space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Shopify */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-[10px] font-black">SF</div>
                    <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">Shopify Fee</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        value={platformCommissions.shopify}
                        onChange={e => setPlatformCommissions(prev => ({ ...prev, shopify: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-10 px-3 pr-8 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[13px] font-black text-zinc-900 dark:text-white"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[12px]">%</span>
                    </div>
                  </div>
                </div>

                {/* Tiendanube */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center text-blue-500 text-[10px] font-black">TN</div>
                    <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">Tiendanube Fee</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        value={platformCommissions.tiendanube}
                        onChange={e => setPlatformCommissions(prev => ({ ...prev, tiendanube: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-10 px-3 pr-8 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[13px] font-black text-zinc-900 dark:text-white"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[12px]">%</span>
                    </div>
                  </div>
                </div>

                {/* Mercado Libre */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-yellow-500/10 flex items-center justify-center text-yellow-500 text-[10px] font-black">ML</div>
                    <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">MercadoLibre Fee</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        value={platformCommissions.mercadolibre}
                        onChange={e => setPlatformCommissions(prev => ({ ...prev, mercadolibre: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-10 px-3 pr-8 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[13px] font-black text-zinc-900 dark:text-white"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[12px]">%</span>
                    </div>
                  </div>
                </div>

                {/* Personalizado */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-violet-500/10 flex items-center justify-center text-violet-500 text-[10px] font-black">OT</div>
                    <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">Comisión Custom</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        value={platformCommissions.custom}
                        onChange={e => setPlatformCommissions(prev => ({ ...prev, custom: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-10 px-3 pr-8 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[13px] font-black text-zinc-900 dark:text-white"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[12px]">%</span>
                    </div>
                  </div>
                </div>

              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSavePlatformCommissions}
                  className="h-10 px-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[12px] font-bold shadow-md hover:opacity-90 transition-all flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Guardar Comisiones
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Accordion 3: Comisiones de pago */}
        <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] overflow-hidden shadow-sm transition-all">
          <button 
            onClick={() => toggleAccordion('pago')}
            className="w-full flex items-center justify-between p-5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Landmark className="w-4 h-4" />
              </div>
              <span className="text-[15px] font-bold text-zinc-900 dark:text-white">
                Comisiones de pago
              </span>
            </div>
            <ChevronLeft className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openAccordions.pago ? '-rotate-90' : ''}`} />
          </button>

          {openAccordions.pago && (
            <div className="p-6 border-t border-zinc-100 dark:border-white/[0.03] space-y-6">
              
              {/* Fee Inputs row */}
              <div className="space-y-4">
                {/* TN CPT */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04] gap-4">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center text-blue-500 text-[10px] font-black shrink-0 mt-0.5">TN</div>
                    <div>
                      <h5 className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                        Fees de TiendaNube (CPT)
                        <HelpCircle className="w-3.5 h-3.5 text-zinc-400 cursor-help" title="Cost por transacción cobrado por la plataforma" />
                      </h5>
                      <p className="text-[10px] text-zinc-400 mt-0.5">0% (IVA incl.)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={paymentFees.tiendanubeCPT}
                      onChange={e => setPaymentFees(prev => ({ ...prev, tiendanubeCPT: parseFloat(e.target.value) || 0 }))}
                      className="w-20 h-9 px-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold text-right"
                    />
                    <button onClick={handleSavePaymentFees} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-[11px] font-bold">Guardar</button>
                  </div>
                </div>

                {/* Shopify Fees */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04] gap-4">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-[10px] font-black shrink-0 mt-0.5">SF</div>
                    <div>
                      <h5 className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                        Fees de Shopify
                        <HelpCircle className="w-3.5 h-3.5 text-zinc-400 cursor-help" title="Comisión de pasarela según plan de Shopify" />
                      </h5>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Comisión adicional por pasarelas externas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={paymentFees.shopifyFees}
                      onChange={e => setPaymentFees(prev => ({ ...prev, shopifyFees: parseFloat(e.target.value) || 0 }))}
                      className="w-20 h-9 px-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold text-right"
                    />
                    <button onClick={handleSavePaymentFees} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-[11px] font-bold">Guardar</button>
                  </div>
                </div>

                {/* IIBB */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04] gap-4">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded bg-zinc-500/10 flex items-center justify-center text-zinc-500 text-[10px] font-black shrink-0 mt-0.5">IB</div>
                    <div>
                      <h5 className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                        IIBB (Tiendanube y MercadoLibre)
                        <HelpCircle className="w-3.5 h-3.5 text-zinc-400 cursor-help" title="Retenciones provinciales aplicadas en cobros" />
                      </h5>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Impuesto sobre Ingresos Brutos</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={paymentFees.iibb}
                      onChange={e => setPaymentFees(prev => ({ ...prev, iibb: parseFloat(e.target.value) || 0 }))}
                      className="w-20 h-9 px-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold text-right"
                    />
                    <button onClick={handleSavePaymentFees} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-[11px] font-bold">Guardar</button>
                  </div>
                </div>
              </div>

              {/* Gateway integration lists */}
              <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-white/[0.03]">
                <h4 className="text-[13px] font-bold text-zinc-900 dark:text-white mb-2">
                  Pasarelas de Pago Integradas
                </h4>

                <div className="space-y-2.5">
                  {/* PagoNube */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-150 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 text-[10px] font-black">PN</div>
                      <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">pagonube</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${gateways.pagonube === 'configured' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                        {gateways.pagonube === 'configured' ? 'Configurado' : 'Pendiente'}
                      </span>
                      <button 
                        onClick={() => toggleGatewayStatus('pagonube')} 
                        className="px-3 py-1 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-[11px] font-bold text-zinc-700 dark:text-zinc-300 transition-colors"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  {/* Mercado Pago */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-150 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 text-[10px] font-black">MP</div>
                      <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">mercado pago</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${gateways.mercadopago === 'configured' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                        {gateways.mercadopago === 'configured' ? 'Configurado' : 'Pendiente'}
                      </span>
                      <button 
                        onClick={() => toggleGatewayStatus('mercadopago')} 
                        className="px-3 py-1 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-[11px] font-bold text-zinc-700 dark:text-zinc-300 transition-colors"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  {/* GO cuotas */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-150 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-500 text-[10px] font-black">GC</div>
                      <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">GO cuotas</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${gateways.gocuotas === 'configured' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                        {gateways.gocuotas === 'configured' ? 'Configurado' : 'Pendiente'}
                      </span>
                      <button 
                        onClick={() => toggleGatewayStatus('gocuotas')} 
                        className="px-3 py-1 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-[11px] font-bold text-zinc-700 dark:text-zinc-300 transition-colors"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  {/* Ualá Bis */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-150 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500 text-[10px] font-black">UB</div>
                      <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">ualábis</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${gateways.ualabis === 'configured' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                        {gateways.ualabis === 'configured' ? 'Configurado' : 'Pendiente'}
                      </span>
                      <button 
                        onClick={() => toggleGatewayStatus('ualabis')} 
                        className="px-3 py-1 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-[11px] font-bold text-zinc-700 dark:text-zinc-300 transition-colors"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  {/* MODO */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-150 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-[10px] font-black">MD</div>
                      <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">MODO</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${gateways.modo === 'configured' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
                        {gateways.modo === 'configured' ? 'Configurado' : 'Pendiente'}
                      </span>
                      <button 
                        onClick={() => toggleGatewayStatus('modo')} 
                        className="px-3 py-1 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-[11px] font-bold text-zinc-700 dark:text-zinc-300 transition-colors"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}
        </div>

        {/* Accordion 4: Costos de Envíos */}
        <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] overflow-hidden shadow-sm transition-all">
          <button 
            onClick={() => toggleAccordion('envios')}
            className="w-full flex items-center justify-between p-5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
                <Truck className="w-4 h-4" />
              </div>
              <span className="text-[15px] font-bold text-zinc-900 dark:text-white">
                Costos de Envíos
              </span>
            </div>
            <ChevronLeft className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openAccordions.envios ? '-rotate-90' : ''}`} />
          </button>

          {openAccordions.envios && (
            <div className="p-6 border-t border-zinc-100 dark:border-white/[0.03] space-y-6">
              
              {/* Rules selection */}
              <div className="space-y-4">
                <h4 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-300 flex items-center gap-1.5">
                  Costos de envío de la Tienda: 💵 🔗
                </h4>
                
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-white/[0.04] bg-zinc-50 dark:bg-zinc-900/40 cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors">
                    <input 
                      type="radio"
                      name="shipping_type"
                      checked={shipping.type === 'order'}
                      onChange={() => setShipping(prev => ({ ...prev, type: 'order' }))}
                      className="w-4 h-4 text-violet-600 focus:ring-violet-500 dark:bg-zinc-800 border-zinc-300"
                    />
                    <div className="flex-1">
                      <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">Utilizar costos de envío de la orden</span>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Usa la tarifa de envío exacta reportada por Shopify o Tiendanube para cada pedido.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-white/[0.04] bg-zinc-50 dark:bg-zinc-900/40 cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors">
                    <input 
                      type="radio"
                      name="shipping_type"
                      checked={shipping.type === 'custom'}
                      onChange={() => setShipping(prev => ({ ...prev, type: 'custom' }))}
                      className="w-4 h-4 text-violet-600 focus:ring-violet-500 dark:bg-zinc-800 border-zinc-300"
                    />
                    <div className="flex-1">
                      <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">Utilizar costos de envío personalizados</span>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Utiliza un valor de costo de envío fijo configurado manualmente para simular gastos.</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Mercado Libre Box */}
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <h4 className="text-[13px] font-bold text-amber-500 flex items-center gap-2">
                  <span>📦</span> Costos de envío de Mercado Libre:
                </h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Utilizaremos los costos de envío de la orden de Mercado Libre y en caso de envío Privado/Flex, utilizaremos los costos de envío personalizados.
                </p>
              </div>

              {/* Custom shipping cost fields */}
              {shipping.type === 'custom' && (
                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-white/[0.04] bg-zinc-50 dark:bg-zinc-900/20 space-y-4">
                  <h4 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-rose-500" /> Costos de envío personalizados:
                  </h4>
                  <div className="max-w-xs">
                    <label className="block text-[10px] font-bold text-zinc-400 mb-1">Costo Fijo de Envío Promedio</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[12px]">$</span>
                      <input 
                        type="number"
                        placeholder="1500"
                        value={shipping.customShippingCost}
                        onChange={e => setShipping(prev => ({ ...prev, customShippingCost: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-10 pl-7 pr-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/[0.05] text-[13px] font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Save */}
              <div className="pt-2 flex justify-center">
                <button
                  onClick={handleSaveShipping}
                  className="w-full sm:w-[320px] h-11 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-[12px] font-black shadow-md transition-colors"
                >
                  Guardar
                </button>
              </div>

            </div>
          )}
        </div>

        {/* Accordion 5: Costos Adicionales */}
        <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] overflow-hidden shadow-sm transition-all">
          <button 
            onClick={() => toggleAccordion('adicionales')}
            className="w-full flex items-center justify-between p-5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-500">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-[15px] font-bold text-zinc-900 dark:text-white">
                Costos Adicionales
              </span>
            </div>
            <ChevronLeft className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openAccordions.adicionales ? '-rotate-90' : ''}`} />
          </button>

          {openAccordions.adicionales && (
            <div className="p-6 border-t border-zinc-100 dark:border-white/[0.03] space-y-8">
              
              {/* Summary Card with action to add cost */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-white/[0.04] gap-4">
                <div>
                  <h4 className="text-[14px] font-black text-zinc-900 dark:text-white">Resumen</h4>
                  <p className="text-[11px] text-zinc-400 mt-1">Total de egresos registrados en las 3 áreas de costos recurrentes.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Total Costos</span>
                    <span className="text-[20px] font-black text-violet-500">${grandTotalCost.toLocaleString('es-AR')}</span>
                  </div>
                  <button
                    onClick={() => handleOpenAddModal('equipo')}
                    className="h-10 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[12px] font-black flex items-center gap-1.5 shadow-lg shadow-violet-500/10 transition-all active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar Costo
                  </button>
                </div>
              </div>

              {/* Table section 1: Equipo */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-bold text-zinc-950 dark:text-zinc-50">Equipo</h4>
                  <button 
                    onClick={() => handleOpenAddModal('equipo')}
                    className="text-[11px] font-bold text-violet-500 hover:text-violet-600"
                  >
                    + Agregar Equipo
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative max-w-xs flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input 
                      type="text"
                      placeholder="Filtrar por Nombre..."
                      value={searchEquipo}
                      onChange={e => { setSearchEquipo(e.target.value); setPageEquipo(1); }}
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[11px] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-zinc-150 dark:border-white/[0.05] rounded-xl">
                  <table className="w-full text-[12px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-150 dark:border-white/[0.05] text-zinc-400 font-bold">
                        <th className="p-3">Nombre</th>
                        <th className="p-3">Fecha Inicio</th>
                        <th className="p-3">Fecha Fin / Recurrencia</th>
                        <th className="p-3">Costo</th>
                        <th className="p-3">Costo Diario</th>
                        <th className="p-3">Moneda</th>
                        <th className="p-3 text-center">Ad Spend</th>
                        <th className="p-3">Plataforma</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.03]">
                      {paginatedEquipo.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-zinc-400">No se encontraron costos de equipo.</td>
                        </tr>
                      ) : (
                        paginatedEquipo.map(item => (
                          <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.01]">
                            <td className="p-3 font-bold text-zinc-800 dark:text-zinc-200">{item.name}</td>
                            <td className="p-3 text-zinc-500">{item.startDate.split('-').reverse().join('/')}</td>
                            <td className="p-3 text-zinc-500">{item.endDate.split('-').reverse().join('/')}</td>
                            <td className="p-3 font-bold">${item.cost.toLocaleString()}</td>
                            <td className="p-3 font-bold text-violet-500">${item.dailyCost.toLocaleString()}</td>
                            <td className="p-3 text-zinc-400">{item.currency}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-block w-2 h-2 rounded-full ${item.adSpend ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                            </td>
                            <td className="p-3">
                              {item.platform === 'Meta' ? (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-sky-500">
                                  <span>∞</span> Meta
                                </span>
                              ) : item.platform}
                            </td>
                            <td className="p-3 text-right shrink-0">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handleOpenEditModal(item, 'equipo')} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><Edit3 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDeleteCostItem(item.id, 'equipo')} className="p-1 text-zinc-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2">
                  <span>{Math.ceil(filteredEquipo.length / rowsPerPage)} páginas</span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span>Filas por pagina</span>
                      <select 
                        value={rowsPerPage} 
                        onChange={e => setRowsPerPage(parseInt(e.target.value))}
                        className="h-7 rounded border border-zinc-200 dark:border-white/[0.05] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-1 font-bold focus:outline-none"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        disabled={pageEquipo <= 1}
                        onClick={() => setPageEquipo(pageEquipo - 1)}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-white/5 rounded disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 h-6 rounded border border-zinc-200 dark:border-white/[0.05] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center justify-center font-bold">{pageEquipo}</span>
                      <button 
                        disabled={pageEquipo >= Math.ceil(filteredEquipo.length / rowsPerPage)}
                        onClick={() => setPageEquipo(pageEquipo + 1)}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-white/5 rounded disabled:opacity-30"
                      >
                        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table section 2: Otros */}
              <div className="space-y-3 pt-6 border-t border-zinc-100 dark:border-white/[0.03]">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-bold text-zinc-950 dark:text-zinc-50">Otros</h4>
                  <button 
                    onClick={() => handleOpenAddModal('otros')}
                    className="text-[11px] font-bold text-violet-500 hover:text-violet-600"
                  >
                    + Agregar Otros
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative max-w-xs flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input 
                      type="text"
                      placeholder="Filtrar por Nombre..."
                      value={searchOtros}
                      onChange={e => { setSearchOtros(e.target.value); setPageOtros(1); }}
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[11px] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-zinc-150 dark:border-white/[0.05] rounded-xl">
                  <table className="w-full text-[12px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-150 dark:border-white/[0.05] text-zinc-400 font-bold">
                        <th className="p-3">Nombre</th>
                        <th className="p-3">Fecha Inicio</th>
                        <th className="p-3">Fecha Fin / Recurrencia</th>
                        <th className="p-3">Costo</th>
                        <th className="p-3">Costo Diario</th>
                        <th className="p-3">Moneda</th>
                        <th className="p-3 text-center">Ad Spend</th>
                        <th className="p-3">Plataforma</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.03]">
                      {paginatedOtros.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-zinc-400">No se encontraron otros costos.</td>
                        </tr>
                      ) : (
                        paginatedOtros.map(item => (
                          <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.01]">
                            <td className="p-3 font-bold text-zinc-800 dark:text-zinc-200">{item.name}</td>
                            <td className="p-3 text-zinc-500">{item.startDate.split('-').reverse().join('/')}</td>
                            <td className="p-3 text-zinc-500">{item.endDate.split('-').reverse().join('/')}</td>
                            <td className="p-3 font-bold">${item.cost.toLocaleString()}</td>
                            <td className="p-3 font-bold text-violet-500">${item.dailyCost.toLocaleString()}</td>
                            <td className="p-3 text-zinc-400">{item.currency}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-block w-2 h-2 rounded-full ${item.adSpend ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                            </td>
                            <td className="p-3 text-zinc-400">{item.platform}</td>
                            <td className="p-3 text-right shrink-0">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handleOpenEditModal(item, 'otros')} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><Edit3 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDeleteCostItem(item.id, 'otros')} className="p-1 text-zinc-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2">
                  <span>{Math.ceil(filteredOtros.length / rowsPerPage)} páginas</span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span>Filas por pagina</span>
                      <select 
                        value={rowsPerPage} 
                        onChange={e => setRowsPerPage(parseInt(e.target.value))}
                        className="h-7 rounded border border-zinc-200 dark:border-white/[0.05] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-1 font-bold focus:outline-none"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        disabled={pageOtros <= 1}
                        onClick={() => setPageOtros(pageOtros - 1)}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-white/5 rounded disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 h-6 rounded border border-zinc-200 dark:border-white/[0.05] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center justify-center font-bold">{pageOtros}</span>
                      <button 
                        disabled={pageOtros >= Math.ceil(filteredOtros.length / rowsPerPage)}
                        onClick={() => setPageOtros(pageOtros + 1)}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-white/5 rounded disabled:opacity-30"
                      >
                        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table section 3: Campañas */}
              <div className="space-y-3 pt-6 border-t border-zinc-100 dark:border-white/[0.03]">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-bold text-zinc-950 dark:text-zinc-50">Campañas</h4>
                  <button 
                    onClick={() => handleOpenAddModal('campanas')}
                    className="text-[11px] font-bold text-violet-500 hover:text-violet-600"
                  >
                    + Agregar Campaña
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative max-w-xs flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input 
                      type="text"
                      placeholder="Filtrar por Nombre..."
                      value={searchCampanas}
                      onChange={e => { setSearchCampanas(e.target.value); setPageCampanas(1); }}
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[11px] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-zinc-150 dark:border-white/[0.05] rounded-xl">
                  <table className="w-full text-[12px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-150 dark:border-white/[0.05] text-zinc-400 font-bold">
                        <th className="p-3">Nombre</th>
                        <th className="p-3">Fecha Inicio</th>
                        <th className="p-3">Fecha Fin / Recurrencia</th>
                        <th className="p-3">Costo</th>
                        <th className="p-3">Costo Diario</th>
                        <th className="p-3">Moneda</th>
                        <th className="p-3 text-center">Ad Spend</th>
                        <th className="p-3">Plataforma</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.03]">
                      {paginatedCampanas.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-zinc-400">No se encontraron campañas configuradas.</td>
                        </tr>
                      ) : (
                        paginatedCampanas.map(item => (
                          <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.01]">
                            <td className="p-3 font-bold text-zinc-800 dark:text-zinc-200">{item.name}</td>
                            <td className="p-3 text-zinc-500">{item.startDate.split('-').reverse().join('/')}</td>
                            <td className="p-3 text-zinc-500">{item.endDate.split('-').reverse().join('/')}</td>
                            <td className="p-3 font-bold">${item.cost.toLocaleString()}</td>
                            <td className="p-3 font-bold text-violet-500">${item.dailyCost.toLocaleString()}</td>
                            <td className="p-3 text-zinc-400">{item.currency}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-block w-2.5 h-2.5 rounded-full ${item.adSpend ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                            </td>
                            <td className="p-3 text-zinc-400">{item.platform}</td>
                            <td className="p-3 text-right shrink-0">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handleOpenEditModal(item, 'campanas')} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><Edit3 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDeleteCostItem(item.id, 'campanas')} className="p-1 text-zinc-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2">
                  <span>{Math.ceil(filteredCampanas.length / rowsPerPage)} páginas</span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span>Filas por pagina</span>
                      <select 
                        value={rowsPerPage} 
                        onChange={e => setRowsPerPage(parseInt(e.target.value))}
                        className="h-7 rounded border border-zinc-200 dark:border-white/[0.05] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-1 font-bold focus:outline-none"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        disabled={pageCampanas <= 1}
                        onClick={() => setPageCampanas(pageCampanas - 1)}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-white/5 rounded disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 h-6 rounded border border-zinc-200 dark:border-white/[0.05] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center justify-center font-bold">{pageCampanas}</span>
                      <button 
                        disabled={pageCampanas >= Math.ceil(filteredCampanas.length / rowsPerPage)}
                        onClick={() => setPageCampanas(pageCampanas + 1)}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-white/5 rounded disabled:opacity-30"
                      >
                        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Dashboard Sync Section */}
        <div className="border-t border-zinc-200 dark:border-white/[0.05] pt-4">
          <p className="text-[13px] font-bold text-zinc-950 dark:text-zinc-50 mb-3">Dashboard</p>
          <div className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-500/20 rounded-[16px] overflow-hidden shadow-sm transition-all">
            <button 
              onClick={handleRequestDashboardSync}
              disabled={syncing}
              className="w-full flex items-center justify-between p-5 hover:bg-amber-500/5 dark:hover:bg-white/[0.02] transition-colors text-left disabled:opacity-70"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500 shrink-0">
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-bold text-amber-600 dark:text-amber-400 block">
                    Solicitar llenar tu dashboard (Ultimos 30 dias)
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Sincroniza y recalcula los ingresos contra los costos del último mes.</p>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-amber-500 -rotate-90 shrink-0 ml-4" />
            </button>
          </div>
        </div>

      </div>

      {/* Modal Dialog for Adding/Editing Additional Cost Items */}
      {showAddModal && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <form 
            onSubmit={handleSaveModalCost}
            className="relative bg-white dark:bg-[#111113] rounded-[24px] border border-zinc-200 dark:border-white/[0.05] shadow-2xl p-6 max-w-md w-full animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[16px] font-black text-zinc-900 dark:text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-violet-500" />
                {editingCostItem ? 'Editar Costo Adicional' : 'Agregar Costo Adicional'}
              </h3>
              <button 
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-150 dark:hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              
              {/* Type Select */}
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Área de Costo</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['equipo', 'otros', 'campanas'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setModalType(t);
                        if (t === 'campanas') setModalAdSpend(true);
                        if (t === 'equipo') setModalPlatform('Meta');
                      }}
                      className={`h-9 rounded-xl text-[11px] font-bold uppercase transition-all ${modalType === t ? 'bg-violet-600 text-white shadow-md' : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-100'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Nombre / Identificador</label>
                <input 
                  type="text"
                  required
                  placeholder="Ej: Servidor Web, Diseñador, etc."
                  value={modalName}
                  onChange={e => setModalName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[13px] font-bold text-zinc-900 dark:text-white"
                />
              </div>

              {/* Cost & Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Costo Total</label>
                  <input 
                    type="number"
                    required
                    placeholder="0"
                    value={modalCost}
                    onChange={e => setModalCost(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[13px] font-bold text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Moneda</label>
                  <select 
                    value={modalCurrency}
                    onChange={e => setModalCurrency(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[13px] font-bold text-zinc-900 dark:text-white"
                  >
                    <option value="LOCAL">LOCAL (ARS/etc)</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Fecha Inicio</label>
                  <input 
                    type="date"
                    required
                    value={modalStartDate}
                    onChange={e => setModalStartDate(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Fecha Fin</label>
                  <input 
                    type="date"
                    required
                    value={modalEndDate}
                    onChange={e => setModalEndDate(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold"
                  />
                </div>
              </div>

              {/* Ad Spend & Platform row */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2 p-3 rounded-xl border border-zinc-200 dark:border-white/[0.04] bg-zinc-50 dark:bg-zinc-900/30 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={modalAdSpend}
                    onChange={e => setModalAdSpend(e.target.checked)}
                    className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">Ad Spend</span>
                </label>

                <div>
                  <select 
                    value={modalPlatform}
                    onChange={e => setModalPlatform(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.05] text-[12px] font-bold"
                  >
                    <option value="-">- (Ninguna)</option>
                    <option value="Meta">Meta</option>
                    <option value="Google">Google</option>
                    <option value="TikTok">TikTok</option>
                  </select>
                </div>
              </div>

            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[13px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-bold shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98]"
              >
                {editingCostItem ? 'Guardar Cambios' : 'Agregar Costo'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
