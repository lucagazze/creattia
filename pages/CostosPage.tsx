import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useToast } from '../components/Toast';
import { supabase } from '../services/supabase';
import { 
  ShoppingBag, Percent, CreditCard, Truck, FileText, Calendar, Plus, 
  Search, Trash2, Edit3, Save, AlertCircle, X, ChevronLeft, ChevronRight, 
  Info, Coins, Sparkles, Loader2, Landmark, Check, HelpCircle
} from 'lucide-react';
import { AppleLoader } from '../components/ui/AppleLoader';

interface CatalogVariant {
  id: string;
  title: string;
  price: number;
}

interface CatalogProduct {
  id: string;
  title: string;
  variants: CatalogVariant[];
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

const MOCK_CATALOG: CatalogProduct[] = [
  {
    id: 'prod_1',
    title: 'Remera Algodón Premium',
    variants: [
      { id: 'var_1_1', title: 'Talle S / Negro', price: 15000 },
      { id: 'var_1_2', title: 'Talle M / Negro', price: 15000 },
      { id: 'var_1_3', title: 'Talle L / Blanco', price: 15500 }
    ]
  },
  {
    id: 'prod_2',
    title: 'Pantalón Cargo Black',
    variants: [
      { id: 'var_2_1', title: 'Talle 38', price: 32000 },
      { id: 'var_2_2', title: 'Talle 40', price: 32000 },
      { id: 'var_2_3', title: 'Talle 42', price: 34000 }
    ]
  },
  {
    id: 'prod_3',
    title: 'Zapatillas Urban Run',
    variants: [
      { id: 'var_3_1', title: 'Talle 40', price: 58000 },
      { id: 'var_3_2', title: 'Talle 41', price: 58000 },
      { id: 'var_3_3', title: 'Talle 42', price: 58000 }
    ]
  },
  {
    id: 'prod_4',
    title: 'Buzo Oversize Grey',
    variants: [
      { id: 'var_4_1', title: 'Talle Único', price: 28000 }
    ]
  },
  {
    id: 'prod_5',
    title: 'Campera Bomber Leather',
    variants: [
      { id: 'var_5_1', title: 'Talle M', price: 75000 },
      { id: 'var_5_2', title: 'Talle L', price: 75000 }
    ]
  },
  {
    id: 'prod_6',
    title: 'Gorra Streetwear Cap',
    variants: [
      { id: 'var_6_1', title: 'Negro', price: 12000 },
      { id: 'var_6_2', title: 'Beige', price: 12000 }
    ]
  },
  {
    id: 'prod_7',
    title: 'Medias Element Pack x3',
    variants: [
      { id: 'var_7_1', title: 'Pack x3', price: 8000 }
    ]
  },
  {
    id: 'prod_8',
    title: 'Bermuda Jean Denim',
    variants: [
      { id: 'var_8_1', title: 'Talle 40', price: 22000 },
      { id: 'var_8_2', title: 'Talle 42', price: 22000 }
    ]
  }
];

const DEFAULT_VARIANT_COSTS: Record<string, { cost: number; packagingCost: number }> = {
  'var_1_1': { cost: 4500, packagingCost: 350 },
  'var_1_2': { cost: 4500, packagingCost: 350 },
  'var_1_3': { cost: 4650, packagingCost: 350 },
  'var_2_1': { cost: 9600, packagingCost: 350 },
  'var_2_2': { cost: 9600, packagingCost: 350 },
  'var_2_3': { cost: 10200, packagingCost: 350 },
  'var_3_1': { cost: 17400, packagingCost: 350 },
  'var_3_2': { cost: 17400, packagingCost: 350 },
  'var_3_3': { cost: 17400, packagingCost: 350 },
  'var_4_1': { cost: 8400, packagingCost: 350 },
  'var_5_1': { cost: 22500, packagingCost: 500 },
  'var_5_2': { cost: 22500, packagingCost: 500 },
  'var_6_1': { cost: 3600, packagingCost: 200 },
  'var_6_2': { cost: 3600, packagingCost: 200 },
  'var_7_1': { cost: 2400, packagingCost: 150 },
  'var_8_1': { cost: 6600, packagingCost: 300 },
  'var_8_2': { cost: 6600, packagingCost: 300 }
};

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
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [variantCosts, setVariantCosts] = useState<Record<string, { cost: number; packagingCost: number; lastUpdated?: string; vcLastUpdated?: string }>>({});
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [massPercentage, setMassPercentage] = useState('30');

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

  // Shopify/Tiendanube Product Catalog Fetching
  const loadProductCatalog = useCallback(async () => {
    const isShopify = profile?.ecommerce_platform === 'shopify' && profile?.shopify_domain && profile?.shopify_access_token;
    if (!isShopify) {
      setCatalogProducts(MOCK_CATALOG);
      return;
    }

    setLoadingProducts(true);
    try {
      const shopifyDomain = profile?.shopify_domain || '';
      const cleanDomain = shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const url = `/api/shopify/products.json?limit=100`;
      const response = await fetch(url, {
        headers: {
          'x-shopify-domain': cleanDomain,
          'x-shopify-access-token': profile?.shopify_access_token || ''
        } as Record<string, string>
      });
      if (response.ok) {
        const data = await response.json();
        const apiProds = data?.products || [];
        const mapped: CatalogProduct[] = apiProds.map((p: any) => {
          const variants = p.variants && p.variants.length > 0
            ? p.variants.map((v: any) => ({
                id: String(v.id),
                title: v.title,
                price: parseFloat(v.price) || 0
              }))
            : [{
                id: String(p.id),
                title: 'Único',
                price: parseFloat(p.price) || 0
              }];
          return {
            id: String(p.id),
            title: p.title,
            variants
          };
        });
        setCatalogProducts(mapped);
      } else {
        setCatalogProducts(MOCK_CATALOG);
      }
    } catch (err) {
      console.error('Error fetching shopify products:', err);
      setCatalogProducts(MOCK_CATALOG);
    } finally {
      setLoadingProducts(false);
    }
  }, [profile?.shopify_domain, profile?.shopify_access_token, profile?.ecommerce_platform]);

  // Load from localStorage and Supabase
  useEffect(() => {
    if (!profileId) return;

    const fetchCosts = async () => {
      setLoadingProducts(true);
      try {
        // Fetch variant costs
        const { data: varData, error: varError } = await supabase
          .from('car_variant_costs')
          .select('variant_id, cost, packaging_cost, updated_at')
          .eq('client_id', profileId);
          
        if (varError) throw varError;
        
        let maxTime: Date | null = null;
        const varCostsMap: Record<string, { cost: number; packagingCost: number; lastUpdated?: string }> = {};
        if (varData && varData.length > 0) {
          varData.forEach((row: any) => {
            varCostsMap[row.variant_id] = {
              cost: parseFloat(row.cost),
              packagingCost: parseFloat(row.packaging_cost) || 0,
              lastUpdated: row.updated_at ? row.updated_at.split('T')[0] : undefined
            };
            if (row.updated_at) {
              const d = new Date(row.updated_at);
              if (!maxTime || d > maxTime) maxTime = d;
            }
          });
          setVariantCosts(varCostsMap);
        } else {
          setVariantCosts(DEFAULT_VARIANT_COSTS);
        }

        // Fetch additional costs
        const { data: addData, error: addError } = await supabase
          .from('car_additional_costs')
          .select('id, category, name, start_date, end_date, cost, daily_cost, currency, ad_spend, platform, updated_at')
          .eq('client_id', profileId);
          
        if (addError) throw addError;
        
        if (addData) {
          const equipoList: AdditionalCostItem[] = [];
          const otrosList: AdditionalCostItem[] = [];
          const campanasList: AdditionalCostItem[] = [];
          
          addData.forEach((row: any) => {
            const mappedItem: AdditionalCostItem = {
              id: row.id,
              name: row.name,
              startDate: row.start_date,
              endDate: row.end_date,
              cost: parseFloat(row.cost),
              dailyCost: parseFloat(row.daily_cost),
              currency: row.currency,
              adSpend: row.ad_spend,
              platform: row.platform
            };
            if (row.category === 'equipo') equipoList.push(mappedItem);
            else if (row.category === 'otros') otrosList.push(mappedItem);
            else if (row.category === 'campanas') campanasList.push(mappedItem);

            if (row.updated_at) {
              const d = new Date(row.updated_at);
              if (!maxTime || d > maxTime) maxTime = d;
            }
          });
          
          setAdditionalCosts({
            equipo: equipoList,
            otros: otrosList,
            campanas: campanasList
          });
        }

        if (maxTime) {
          const formatted = (maxTime as Date).toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          setLastUpdatedTime(formatted);
        }
      } catch (err) {
        console.error('Error fetching costs from Supabase:', err);
        showToast('Error al cargar costos de la base de datos.', 'error');
        setVariantCosts(DEFAULT_VARIANT_COSTS);
      } finally {
        setLoadingProducts(false);
      }
    };

    const saved = localStorage.getItem(`car_costs_${profileId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.platformCommissions) setPlatformCommissions(parsed.platformCommissions);
        if (parsed.paymentFees) setPaymentFees(parsed.paymentFees);
        if (parsed.gateways) setGateways(parsed.gateways);
        if (parsed.shipping) setShipping(parsed.shipping);
      } catch (e) {
        console.error('Error loading config from localstorage:', e);
      }
    }

    fetchCosts();
  }, [profileId, loadProductCatalog]);

  // Save helper
  const saveToLocalStorage = (updatedData: any) => {
    const currentData = {
      platformCommissions,
      paymentFees,
      gateways,
      shipping,
      ...updatedData
    };
    try {
      localStorage.setItem(`car_costs_${profileId}`, JSON.stringify(currentData));
    } catch (e) { /* ignore quota full */ }
  };

  useEffect(() => {
    loadProductCatalog();
  }, [loadProductCatalog]);

  const handleUpdateCost = async (variantId: string, cost: number, packagingCost: number) => {
    const nowShort = new Date().toISOString().split('T')[0];
    const updated = {
      ...variantCosts,
      [variantId]: { cost, packagingCost, lastUpdated: nowShort }
    };
    setVariantCosts(updated);

    try {
      const { error } = await supabase
        .from('car_variant_costs')
        .upsert({
          client_id: profileId,
          variant_id: variantId,
          cost,
          packaging_cost: packagingCost,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'client_id,variant_id'
        });
      if (error) throw error;
      setLastUpdatedTime(new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }));
    } catch (err) {
      console.error('Error saving variant cost to Supabase:', err);
      showToast('Error al guardar costo en la base de datos.', 'error');
    }
  };

  const handleApplyMassEdit = async () => {
    const pct = parseFloat(massPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      showToast('Por favor ingrese un porcentaje válido entre 0 y 100.', 'warning');
      return;
    }

    const updated = { ...variantCosts };
    const upsertRows: any[] = [];
    const nowStr = new Date().toISOString();
    const nowShort = nowStr.split('T')[0];

    catalogProducts.forEach(prod => {
      prod.variants.forEach(variant => {
        const calculatedCost = Math.round(variant.price * (pct / 100));
        const currentPackaging = updated[variant.id]?.packagingCost ?? 350;
        
        updated[variant.id] = {
          cost: calculatedCost,
          packagingCost: currentPackaging,
          lastUpdated: nowShort
        };

        upsertRows.push({
          client_id: profileId,
          variant_id: variant.id,
          cost: calculatedCost,
          packaging_cost: currentPackaging,
          updated_at: nowStr
        });
      });
    });

    setVariantCosts(updated);

    try {
      const { error } = await supabase
        .from('car_variant_costs')
        .upsert(upsertRows, {
          onConflict: 'client_id,variant_id'
        });
      if (error) throw error;
      showToast(`Se aplicó el costo del ${pct}% de forma masiva a todos los productos.`, 'success');
      setLastUpdatedTime(new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }));
    } catch (err) {
      console.error('Error mass saving variant costs to Supabase:', err);
      showToast('Error al guardar costos masivos en la base de datos.', 'error');
    }
  };

  const calculateMargin = (price: number, cost: number, packagingCost: number) => {
    if (!price) return 0;
    const marginVal = ((price - cost - packagingCost) / price) * 100;
    return parseFloat(marginVal.toFixed(1));
  };

  const filteredCatalog = useMemo(() => {
    return catalogProducts.filter(p => 
      p.title.toLowerCase().includes(catalogSearch.toLowerCase())
    );
  }, [catalogProducts, catalogSearch]);

  const lastCatalogUpdate = useMemo(() => {
    let maxDate = '';
    Object.values(variantCosts).forEach((vc: any) => {
      if (vc.lastUpdated && vc.lastUpdated > maxDate) {
        maxDate = vc.vcLastUpdated || vc.lastUpdated;
      }
    });
    return maxDate || null;
  }, [variantCosts]);

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
    const updatedGateways: Record<string, 'pending' | 'configured'> = {
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
  const handleSaveModalCost = async (e: React.FormEvent) => {
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

    const category = modalType;

    const dbRow: any = {
      client_id: profileId,
      category,
      name: modalName,
      start_date: modalStartDate,
      end_date: modalEndDate,
      cost: costNum,
      daily_cost: dailyCost,
      currency: modalCurrency,
      ad_spend: modalAdSpend,
      platform: modalPlatform,
      updated_at: new Date().toISOString()
    };

    try {
      let savedItem: AdditionalCostItem;
      if (editingCostItem) {
        // Update
        const { data, error } = await supabase
          .from('car_additional_costs')
          .update(dbRow)
          .eq('id', editingCostItem.id)
          .select();
        if (error) throw error;
        savedItem = {
          id: data[0].id,
          name: data[0].name,
          startDate: data[0].start_date,
          endDate: data[0].end_date,
          cost: parseFloat(data[0].cost),
          dailyCost: parseFloat(data[0].daily_cost),
          currency: data[0].currency,
          adSpend: data[0].ad_spend,
          platform: data[0].platform
        };
        showToast('Costo adicional actualizado.', 'success');
      } else {
        // Insert
        const { data, error } = await supabase
          .from('car_additional_costs')
          .insert(dbRow)
          .select();
        if (error) throw error;
        savedItem = {
          id: data[0].id,
          name: data[0].name,
          startDate: data[0].start_date,
          endDate: data[0].end_date,
          cost: parseFloat(data[0].cost),
          dailyCost: parseFloat(data[0].daily_cost),
          currency: data[0].currency,
          adSpend: data[0].ad_spend,
          platform: data[0].platform
        };
        showToast('Costo adicional agregado con éxito.', 'success');
      }
      setLastUpdatedTime(new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }));

      // Update UI state
      let listCopy = [...additionalCosts[category]];
      if (editingCostItem) {
        listCopy = listCopy.map(c => c.id === editingCostItem.id ? savedItem : c);
      } else {
        listCopy.unshift(savedItem);
      }
      
      setAdditionalCosts(prev => ({
        ...prev,
        [category]: listCopy
      }));
      setShowAddModal(false);
    } catch (err) {
      console.error('Error saving additional cost to Supabase:', err);
      showToast('Error al guardar costo adicional en la base de datos.', 'error');
    }
  };

  // Delete cost row
  const handleDeleteCostItem = async (id: string, type: 'equipo' | 'otros' | 'campanas') => {
    try {
      const { error } = await supabase
        .from('car_additional_costs')
        .delete()
        .eq('id', id);
      if (error) throw error;

      const updatedList = additionalCosts[type].filter(item => item.id !== id);
      setAdditionalCosts(prev => ({
        ...prev,
        [type]: updatedList
      }));
      showToast('Costo eliminado con éxito.', 'info');
      setLastUpdatedTime(new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }));
    } catch (err) {
      console.error('Error deleting additional cost from Supabase:', err);
      showToast('Error al eliminar costo de la base de datos.', 'error');
    }
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
    <div className="w-full px-4 md:px-6 animate-fade-in pb-20 text-zinc-900 dark:text-zinc-100">
      
      <div className="page-header mb-8">
        <div>
          <h1 className="page-title uppercase">
            Gestión de costos
          </h1>
          <p className="page-subtitle uppercase tracking-wider">
            Costos
          </p>
        </div>
        {lastUpdatedTime && (
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold w-fit border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Última actualización: {lastUpdatedTime}
          </div>
        )}
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
                <span className="text-[15px] font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  Costos de productos
                  {lastCatalogUpdate && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold ml-1">
                      Guardado: {lastCatalogUpdate}
                    </span>
                  )}
                </span>
              </div>
              <ChevronLeft className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openAccordions.productos ? '-rotate-90' : ''}`} />
            </button>

          {openAccordions.productos && (
            <div className="p-6 border-t border-zinc-100 dark:border-white/[0.03] space-y-6">
              
              {/* Edición Masiva & Search Toolbar */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text"
                    placeholder="Filtrar productos por nombre..."
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                    className="apple-input pl-10"
                  />
                </div>

                {/* Mass percentage edit */}
                <div className="flex items-center gap-2 justify-end bg-zinc-50 dark:bg-white/[0.02] p-2 px-3 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                  <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                  <span className="text-[11.5px] font-bold text-zinc-650 dark:text-zinc-300">Costo Masivo:</span>
                  <div className="relative">
                    <input 
                      type="number"
                      placeholder="30"
                      value={massPercentage}
                      onChange={e => setMassPercentage(e.target.value)}
                      className="w-16 h-8 px-2 pr-5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-[12px] font-black text-center text-zinc-900 dark:text-white outline-none focus:border-zinc-400 dark:focus:border-zinc-650 transition-colors"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[10px]">%</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">del precio</span>
                  <button
                    onClick={handleApplyMassEdit}
                    className="h-8 px-3 bg-violet-600 hover:bg-violet-750 text-white rounded-lg text-[11.5px] font-bold shadow-md transition-all active:scale-[0.98]"
                  >
                    Aplicar a todos
                  </button>
                </div>
              </div>

              {/* Table / List */}
              <div className="space-y-4">
                {loadingProducts ? (
                  <AppleLoader variant="table" count={5} />
                ) : filteredCatalog.length === 0 ? (
                  <div className="py-12 text-center text-zinc-400 text-[12px]">
                    No se encontraron productos en el catálogo.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-zinc-100 dark:border-white/[0.05] rounded-2xl bg-white dark:bg-[#111113]">
                    <table className="w-full text-[12px] text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-white/[0.05] text-zinc-400 font-bold select-none">
                          <th className="p-3.5 pl-5">Producto / Variante</th>
                          <th className="p-3.5">Precio de Venta</th>
                          <th className="p-3.5">Costo Unitario</th>
                          <th className="p-3.5">Caja / Embalaje</th>
                          <th className="p-3.5 text-center">Margen Neto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.03]">
                        {filteredCatalog.map(p => {
                          const hasMultipleVariants = p.variants.length > 1;
                          return (
                            <React.Fragment key={p.id}>
                              {/* Product Header Row (if multiple variants) */}
                              {hasMultipleVariants && (
                                <tr className="bg-zinc-50/40 dark:bg-white/[0.005] select-none">
                                  <td colSpan={5} className="p-3.5 pl-5 font-bold text-zinc-800 dark:text-zinc-200">
                                    <div className="flex items-center gap-2">
                                      <ShoppingBag className="w-3.5 h-3.5 text-zinc-450 dark:text-zinc-500" />
                                      {p.title}
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                                        {p.variants.length} variantes
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {/* Variants rows */}
                              {p.variants.map(v => {
                                const cost = variantCosts[v.id]?.cost ?? 0;
                                const packaging = variantCosts[v.id]?.packagingCost ?? 350;
                                const margin = calculateMargin(v.price, cost, packaging);

                                let badgeClass = "bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700";
                                if (margin > 20) {
                                  badgeClass = "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15";
                                } else if (margin >= 0) {
                                  badgeClass = "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15";
                                } else {
                                  badgeClass = "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/15";
                                }

                                return (
                                  <tr key={v.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.01] transition-colors">
                                    <td className="p-3.5 pl-5">
                                      {hasMultipleVariants ? (
                                        <div className="flex items-center gap-2 pl-4">
                                          <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                                          <span className="text-zinc-500 dark:text-zinc-400">{v.title}</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <ShoppingBag className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                                          <span className="font-bold text-zinc-800 dark:text-zinc-200">{p.title}</span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-3.5 font-bold text-zinc-800 dark:text-zinc-200">
                                      ${v.price.toLocaleString('es-AR')}
                                    </td>
                                    <td className="p-3.5">
                                      <div className="relative flex items-center max-w-[120px]">
                                        <span className="absolute left-2.5 text-zinc-400 font-bold text-[11px] select-none">$</span>
                                        <input 
                                          type="number"
                                          value={variantCosts[v.id]?.cost ?? ''}
                                          onChange={e => handleUpdateCost(v.id, parseFloat(e.target.value) || 0, packaging)}
                                          className="w-full h-8 pl-6 pr-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-650 text-[11.5px] font-black text-zinc-900 dark:text-white focus:outline-none transition-colors"
                                          placeholder="0"
                                        />
                                      </div>
                                    </td>
                                    <td className="p-3.5">
                                      <div className="relative flex items-center max-w-[100px]">
                                        <span className="absolute left-2.5 text-zinc-400 font-bold text-[11px] select-none">$</span>
                                        <input 
                                          type="number"
                                          value={variantCosts[v.id]?.packagingCost ?? ''}
                                          onChange={e => handleUpdateCost(v.id, cost, parseFloat(e.target.value) || 0)}
                                          className="w-full h-8 pl-6 pr-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-650 text-[11.5px] font-black text-zinc-900 dark:text-white focus:outline-none transition-colors"
                                          placeholder="350"
                                        />
                                      </div>
                                    </td>
                                    <td className="p-3.5 text-center">
                                      <span className={`inline-flex px-2 py-0.5 rounded-full font-black text-[11px] ${badgeClass}`}>
                                        {margin}%
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
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
                    <img src="/assets/shopify-bag.webp" alt="Shopify" className="w-6 h-6 object-contain shrink-0" />
                    <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">Shopify Fee</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        value={platformCommissions.shopify}
                        onChange={e => setPlatformCommissions(prev => ({ ...prev, shopify: parseFloat(e.target.value) || 0 }))}
                        className="apple-input pr-8 font-black text-zinc-900 dark:text-zinc-100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[12px]">%</span>
                    </div>
                  </div>
                </div>

                {/* Tiendanube */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <img src="/assets/tiendanubeoscuro.png" alt="Tiendanube" className="w-6 h-6 object-contain shrink-0" />
                    <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">Tiendanube Fee</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        value={platformCommissions.tiendanube}
                        onChange={e => setPlatformCommissions(prev => ({ ...prev, tiendanube: parseFloat(e.target.value) || 0 }))}
                        className="apple-input pr-8 font-black text-zinc-900 dark:text-zinc-100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[12px]">%</span>
                    </div>
                  </div>
                </div>

                {/* Mercado Libre */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <img src="/assets/logomercadolibre.png" alt="Mercado Libre" className="w-6 h-6 object-contain shrink-0" />
                    <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">MercadoLibre Fee</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        value={platformCommissions.mercadolibre}
                        onChange={e => setPlatformCommissions(prev => ({ ...prev, mercadolibre: parseFloat(e.target.value) || 0 }))}
                        className="apple-input pr-8 font-black text-zinc-900 dark:text-zinc-100"
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
                        className="apple-input pr-8 font-black text-zinc-900 dark:text-zinc-100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[12px]">%</span>
                    </div>
                  </div>
                </div>

              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSavePlatformCommissions}
                  className="h-9 px-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90 flex items-center gap-2"
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
                        <span title="Cost por transacción cobrado por la plataforma">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-400 cursor-help" />
                        </span>
                      </h5>
                      <p className="text-[10px] text-zinc-400 mt-0.5">0% (IVA incl.)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={paymentFees.tiendanubeCPT}
                      onChange={e => setPaymentFees(prev => ({ ...prev, tiendanubeCPT: parseFloat(e.target.value) || 0 }))}
                      className="w-20 h-9 px-3 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-[12px] font-bold text-right outline-none focus:border-zinc-400 dark:focus:border-zinc-650 focus:bg-white dark:focus:bg-zinc-900 transition-all"
                    />
                    <button onClick={handleSavePaymentFees} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90">Guardar</button>
                  </div>
                </div>

                {/* Shopify Fees */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04] gap-4">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-[10px] font-black shrink-0 mt-0.5">SF</div>
                    <div>
                      <h5 className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                        Fees de Shopify
                        <span title="Comisión de pasarela según plan de Shopify">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-400 cursor-help" />
                        </span>
                      </h5>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Comisión adicional por pasarelas externas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={paymentFees.shopifyFees}
                      onChange={e => setPaymentFees(prev => ({ ...prev, shopifyFees: parseFloat(e.target.value) || 0 }))}
                      className="w-20 h-9 px-3 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-[12px] font-bold text-right outline-none focus:border-zinc-400 dark:focus:border-zinc-650 focus:bg-white dark:focus:bg-zinc-900 transition-all"
                    />
                    <button onClick={handleSavePaymentFees} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90">Guardar</button>
                  </div>
                </div>

                {/* IIBB */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-white/[0.04] gap-4">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded bg-zinc-500/10 flex items-center justify-center text-zinc-500 text-[10px] font-black shrink-0 mt-0.5">IB</div>
                    <div>
                      <h5 className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                        IIBB (Tiendanube y MercadoLibre)
                        <span title="Retenciones provinciales aplicadas en cobros">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-400 cursor-help" />
                        </span>
                      </h5>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Impuesto sobre Ingresos Brutos</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      value={paymentFees.iibb}
                      onChange={e => setPaymentFees(prev => ({ ...prev, iibb: parseFloat(e.target.value) || 0 }))}
                      className="w-20 h-9 px-3 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-[12px] font-bold text-right outline-none focus:border-zinc-400 dark:focus:border-zinc-650 focus:bg-white dark:focus:bg-zinc-900 transition-all"
                    />
                    <button onClick={handleSavePaymentFees} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90">Guardar</button>
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
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
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
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
                    <div className="flex items-center gap-3">
                      <img src="/assets/logomercadolibre.png" alt="Mercado Pago" className="w-8 h-8 object-contain shrink-0" />
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
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
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
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
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
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-white/[0.04] bg-white dark:bg-zinc-900/30">
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
                        className="apple-input pl-7 font-bold text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Save */}
              <div className="pt-2 flex justify-center">
                <button
                  onClick={handleSaveShipping}
                  className="w-full sm:w-[320px] h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90 flex items-center justify-center gap-1.5"
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
                      className="apple-input pl-9 h-9 text-[11px]"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-zinc-100 dark:border-white/[0.05] rounded-xl">
                  <table className="w-full text-[12px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-white/[0.05] text-zinc-400 font-bold">
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
                        className="h-7 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 px-1.5 font-bold outline-none focus:border-zinc-400 dark:focus:border-zinc-650 transition-colors cursor-pointer"
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
                      className="apple-input pl-9 h-9 text-[11px]"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-zinc-100 dark:border-white/[0.05] rounded-xl">
                  <table className="w-full text-[12px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-white/[0.05] text-zinc-400 font-bold">
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
                            <td className="p-3 text-zinc-400">
                              {item.platform === 'Meta' ? (
                                <div className="flex items-center gap-1.5">
                                  <img src="/assets/meta (1).webp" alt="Meta" className="w-4 h-4 object-contain shrink-0" />
                                  <span className="text-zinc-650 dark:text-zinc-350">Meta</span>
                                </div>
                              ) : item.platform === 'Google' ? (
                                <div className="flex items-center gap-1.5">
                                  <img src="/assets/GADS.webp" alt="Google" className="w-4 h-4 object-contain shrink-0" />
                                  <span className="text-zinc-650 dark:text-zinc-350">Google</span>
                                </div>
                              ) : item.platform === 'TikTok' ? (
                                <div className="flex items-center gap-1.5">
                                  <img src="/assets/logotiktok.png" alt="TikTok" className="w-4 h-4 object-contain shrink-0" />
                                  <span className="text-zinc-650 dark:text-zinc-350">TikTok</span>
                                </div>
                              ) : (
                                item.platform
                              )}
                            </td>
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
                      className="apple-input pl-9 h-9 text-[11px]"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-zinc-100 dark:border-white/[0.05] rounded-xl">
                  <table className="w-full text-[12px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-white/[0.05] text-zinc-400 font-bold">
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
                            <td className="p-3 text-zinc-400">
                              {item.platform === 'Meta' ? (
                                <div className="flex items-center gap-1.5">
                                  <img src="/assets/meta (1).webp" alt="Meta" className="w-4 h-4 object-contain shrink-0" />
                                  <span className="text-zinc-650 dark:text-zinc-350">Meta</span>
                                </div>
                              ) : item.platform === 'Google' ? (
                                <div className="flex items-center gap-1.5">
                                  <img src="/assets/GADS.webp" alt="Google" className="w-4 h-4 object-contain shrink-0" />
                                  <span className="text-zinc-650 dark:text-zinc-350">Google</span>
                                </div>
                              ) : item.platform === 'TikTok' ? (
                                <div className="flex items-center gap-1.5">
                                  <img src="/assets/logotiktok.png" alt="TikTok" className="w-4 h-4 object-contain shrink-0" />
                                  <span className="text-zinc-650 dark:text-zinc-350">TikTok</span>
                                </div>
                              ) : (
                                item.platform
                              )}
                            </td>
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
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5"
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
                  className="apple-input font-bold"
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
                    className="apple-input font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Moneda</label>
                  <select 
                    value={modalCurrency}
                    onChange={e => setModalCurrency(e.target.value)}
                    className="apple-select w-full"
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
                    className="apple-input text-[12px] font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Fecha Fin</label>
                  <input 
                    type="date"
                    required
                    value={modalEndDate}
                    onChange={e => setModalEndDate(e.target.value)}
                    className="apple-input text-[12px] font-bold"
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
                    className="apple-select w-full text-[12px]"
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
