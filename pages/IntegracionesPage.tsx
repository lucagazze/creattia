import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../services/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useViewAs } from "../contexts/ViewAsContext";
import { useToast } from "../components/Toast";
import { ecommerce } from "../services/ecommerce";
import { klaviyo } from "../services/klaviyo";
import {
  Loader2,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  Settings,
  ShieldAlert,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Zap,
  Globe,
  Trash2,
  CheckCircle2,
  ChevronRight,
  Info,
  Lock,
  Key,
  Instagram
} from "lucide-react";

interface IntegrationPlatform {
  id: string;
  name: string;
  category: "ecommerce" | "marketing" | "ads";
  description: string;
  logoUrl?: string;
  logoComponent?: React.FC<React.SVGProps<SVGSVGElement>>;
  isSimulated: boolean;
}

const PLATFORMS: IntegrationPlatform[] = [
  {
    id: "shopify",
    name: "Shopify",
    category: "ecommerce",
    description: "Sincronizá tus pedidos, inventario, clientes y catálogo de productos en tiempo real.",
    logoUrl: "/assets/shopify-bag.webp",
    isSimulated: false
  },
  {
    id: "tiendanube",
    name: "Tiendanube",
    category: "ecommerce",
    description: "Conectá tu tienda Tiendanube para importar órdenes y sincronizar productos de forma automática.",
    logoUrl: "/assets/tiendanube.webp",
    isSimulated: false
  },
  {
    id: "wordpress",
    name: "WooCommerce",
    category: "ecommerce",
    description: "Vinculá tu tienda de WordPress WooCommerce mediante REST API para consolidar datos.",
    logoUrl: "/assets/logowordpress.webp",
    isSimulated: false
  },
  {
    id: "mercadolibre",
    name: "Mercado Libre",
    category: "ecommerce",
    description: "Importá ventas y gestioná el stock de tus publicaciones del marketplace líder de LATAM.",
    logoUrl: "/assets/mercadolibre.webp",
    isSimulated: true
  },
  {
    id: "meta",
    name: "Meta Ads & Píxel",
    category: "ads",
    description: "Seguí el rendimiento de tus campañas de publicidad y optimizá conversiones de tu píxel.",
    logoUrl: "/assets/meta (1).webp",
    isSimulated: false // Supports manual setup fields or simulated oauth trigger
  },
  {
    id: "google_ads",
    name: "Google Ads",
    category: "ads",
    description: "Monitoreá el retorno de inversión (ROAS) de tus campañas de Search, Performance Max y YouTube.",
    logoUrl: "/assets/GADS.webp",
    isSimulated: true
  },
  {
    id: "tiktok_ads",
    name: "TikTok Ads",
    category: "ads",
    description: "Medí el impacto de tus creativos y campañas de video en la plataforma de mayor crecimiento.",
    logoUrl: "/assets/tiktok-icon.webp",
    isSimulated: true
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    category: "marketing",
    description: "Sincronizá flujos, listas de correo y analizá métricas de retención de clientes.",
    logoUrl: "/assets/Klaviyo-Logo-Photoroom.webp",
    isSimulated: false
  }
];

const ML_COUNTRIES = [
  { code: "AR", name: "Argentina" },
  { code: "MX", name: "México" },
  { code: "BR", name: "Brasil" },
  { code: "CO", name: "Colombia" },
  { code: "CL", name: "Chile" },
  { code: "UY", name: "Uruguay" }
];

export default function IntegracionesPage() {
  const { profile, refreshProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const { showToast } = useToast();

  const activeProfile = isViewingAs ? viewAsProfile : profile;
  const activeProfileId = activeProfile?.id;

  const [clientData, setClientData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "ecommerce" | "ads" | "marketing">("all");

  // Modals state
  const [selectedPlatform, setSelectedPlatform] = useState<IntegrationPlatform | null>(null);
  
  // Real Form credentials state
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");

  const [tiendanubeStoreId, setTiendanubeStoreId] = useState("");
  const [tiendanubeToken, setTiendanubeToken] = useState("");

  const [wooUrl, setWooUrl] = useState("");
  const [wooConsumerKey, setWooConsumerKey] = useState("");
  const [wooConsumerSecret, setWooConsumerSecret] = useState("");

  const [klaviyoApiKey, setKlaviyoApiKey] = useState("");
  const [klaviyoListId, setKlaviyoListId] = useState("");

  const [metaAccountId, setMetaAccountId] = useState("");
  const [metaPixelId, setMetaPixelId] = useState("");
  const [metaToken, setMetaToken] = useState("");

  // OAuth state
  const [mlCountry, setMlCountry] = useState("AR");
  const [oauthLoading, setOauthLoading] = useState(false); // loading when initiating real OAuth
  const [isManualMode, setIsManualMode] = useState(false);

  // URL param success/error detection after OAuth callback redirect
  const [oauthResult, setOauthResult] = useState<{ platform: string; status: 'success' | 'error'; reason?: string } | null>(null);

  // Meta combined connection modal (accounts + pages in one step)
  const [metaCombinedModal, setMetaCombinedModal] = useState<{
    clientId: string;
    accounts: { id: string; name: string; account_status: number; currency?: string }[];
    pages: any[];
    selectedAccountId: string;
    selectedPage: any | null;
  } | null>(null);
  const [savingMetaCombined, setSavingMetaCombined] = useState(false);
  const [metaLoadingText, setMetaLoadingText] = useState("");

  // Loading indicator for tests & saves
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Detect OAuth callback result from URL params ──────────────────────────────
  // This fires when the user lands back on /#/integraciones after:
  //   a) popup was blocked → meta-callback.html redirected here with ?meta=select#/integraciones
  //   b) any other OAuth platform redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopify    = params.get('shopify');
    const tiendanube = params.get('tiendanube');
    const meta       = params.get('meta');
    const reason     = params.get('reason');

    if (shopify === 'success') {
      setOauthResult({ platform: 'shopify', status: 'success' });
      showToast('¡Shopify conectado exitosamente! ✓', 'success');
      window.history.replaceState({}, '', '/#/integraciones');
    } else if (shopify === 'error') {
      setOauthResult({ platform: 'shopify', status: 'error', reason: reason || '' });
      showToast('Error al conectar Shopify: ' + (reason || 'desconocido'), 'error');
      window.history.replaceState({}, '', '/#/integraciones');
    } else if (tiendanube === 'success') {
      setOauthResult({ platform: 'tiendanube', status: 'success' });
      showToast('¡Tiendanube conectado exitosamente! ✓', 'success');
      window.history.replaceState({}, '', '/#/integraciones');
    } else if (tiendanube === 'error') {
      setOauthResult({ platform: 'tiendanube', status: 'error', reason: reason || '' });
      showToast('Error al conectar Tiendanube: ' + (reason || 'desconocido'), 'error');
      window.history.replaceState({}, '', '/#/integraciones');
    } else if (meta === 'select') {
      // Main-window fallback: popup was blocked, meta-callback.html redirected here.
      const cid = params.get('clientId') || '';
      window.history.replaceState({}, '', '/#/integraciones');
      fetchMetaDataAndShowCombined(cid);
    } else if (meta === 'error') {
      setOauthResult({ platform: 'meta', status: 'error', reason: reason || '' });
      showToast('Error al conectar Meta Ads: ' + (reason || 'desconocido'), 'error');
      window.history.replaceState({}, '', '/#/integraciones');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for messages from meta-callback.html popup ─────────────────────────
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'meta-select') {
        const cid = e.data.clientId as string;
        if (!cid) return;
        setOauthLoading(false);
        setSelectedPlatform(null);
        fetchMetaDataAndShowCombined(cid);
      } else if (e.data?.type === 'meta-error') {
        setOauthLoading(false);
        const r = (e.data.reason as string) || 'unknown';
        showToast('Error al conectar Meta Ads: ' + r.replace(/_/g, ' '), 'error');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeProfileId) {
      loadClientData();
    }
  }, [activeProfileId]);

  const loadClientData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("car_clients")
        .select("*")
        .eq("id", activeProfileId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setClientData(data);
        // Prefill forms
        setShopifyDomain(data.shopify_domain || "");
        setShopifyToken(data.shopify_access_token || "");
        setTiendanubeStoreId(data.tiendanube_store_id || "");
        setTiendanubeToken(data.tiendanube_access_token || "");
        setWooUrl(data.wordpress_url || "");
        setWooConsumerKey(data.woo_consumer_key || "");
        setWooConsumerSecret(data.woo_consumer_secret || "");
        setKlaviyoApiKey(data.klaviyo_api_key || "");
        setKlaviyoListId(data.klaviyo_list_id || "");
        setMetaAccountId(data.meta_account_id || "");
        setMetaPixelId(data.meta_pixel_id || "");
        setMetaToken(data.facebook_access_token || "");
        
        // ML Country fallback
        if (data.connection_statuses?.mercadolibre_country) {
          setMlCountry(data.connection_statuses.mercadolibre_country);
        }
      }
    } catch (err: any) {
      showToast("Error al cargar configuración: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const updateConnectionStatus = async (type: string, status: "ok" | "error" | null, extraData: Record<string, any> = {}) => {
    if (!activeProfileId) return;
    try {
      const { data } = await supabase
        .from("car_clients")
        .select("connection_statuses")
        .eq("id", activeProfileId)
        .maybeSingle();

      const current = data?.connection_statuses || {};
      let updated = { ...current };
      
      if (status === null) {
        delete updated[type];
      } else {
        updated[type] = status;
      }

      // Add any custom extra data (like country code for ML)
      Object.entries(extraData).forEach(([k, v]) => {
        if (v === null) {
          delete updated[k];
        } else {
          updated[k] = v;
        }
      });

      const { error } = await supabase
        .from("car_clients")
        .update({ connection_statuses: updated })
        .eq("id", activeProfileId);

      if (error) throw error;

      setClientData((prev: any) => prev ? { ...prev, connection_statuses: updated } : null);
    } catch (e) {
      console.error("Error updating connection status:", e);
    }
  };

  const openConfigModal = (platform: IntegrationPlatform) => {
    setSelectedPlatform(platform);
    setOauthLoading(false);
    setIsManualMode(false);
    // Refresh modal form values from clientData
    if (clientData) {
      if (platform.id === "shopify") {
        setShopifyDomain(clientData.shopify_domain || "");
        setShopifyToken(clientData.shopify_access_token || "");
      } else if (platform.id === "tiendanube") {
        setTiendanubeStoreId(clientData.tiendanube_store_id || "");
        setTiendanubeToken(clientData.tiendanube_access_token || "");
      } else if (platform.id === "wordpress") {
        setWooUrl(clientData.wordpress_url || "");
        setWooConsumerKey(clientData.woo_consumer_key || "");
        setWooConsumerSecret(clientData.woo_consumer_secret || "");
      } else if (platform.id === "klaviyo") {
        setKlaviyoApiKey(clientData.klaviyo_api_key || "");
        setKlaviyoListId(clientData.klaviyo_list_id || "");
      } else if (platform.id === "meta") {
        setMetaAccountId(clientData.meta_account_id || "");
        setMetaPixelId(clientData.meta_pixel_id || "");
        setMetaToken(clientData.facebook_access_token || "");
      }
    }
  };

  const closeConfigModal = (force?: any) => {
    const isForced = force === true;
    if (!isForced && (testingConnection || savingSettings)) return;
    setOauthLoading(false);
    setSelectedPlatform(null);
  };

  // ── REAL OAUTH: Shopify ───────────────────────────────────────────────────────
  const startShopifyOAuth = async () => {
    if (!shopifyDomain.trim()) {
      showToast('Ingresá el dominio de tu tienda Shopify primero', 'warning');
      return;
    }
    if (!activeProfileId) return;
    setOauthLoading(true);
    try {
      const cleanDomain = shopifyDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
      const res = await fetch(`/api/oauth?action=shopify-authorize&shop=${encodeURIComponent(cleanDomain)}&clientId=${encodeURIComponent(activeProfileId)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al iniciar OAuth');
      }
      const { authorizeUrl } = await res.json();
      // Redirect to Shopify authorization page
      window.location.href = authorizeUrl;
    } catch (err: any) {
      showToast(err.message || 'Error al conectar con Shopify', 'error');
      setOauthLoading(false);
    }
  };

  // ── REAL OAUTH: TiendaNube ────────────────────────────────────────────────────
  const startTiendanubeOAuth = async () => {
    if (!activeProfileId) return;
    setOauthLoading(true);
    try {
      const res = await fetch(`/api/oauth?action=tiendanube-authorize&clientId=${encodeURIComponent(activeProfileId)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al iniciar OAuth');
      }
      const { authorizeUrl } = await res.json();
      window.location.href = authorizeUrl;
    } catch (err: any) {
      showToast(err.message || 'Error al conectar con Tiendanube', 'error');
      setOauthLoading(false);
    }
  };

  // ── REAL OAUTH: Meta (popup) ──────────────────────────────────────────────────
  // The OAuth flow:
  //   1. Open popup → Facebook → /api/oauth?action=meta-callback → /meta-callback.html
  //   2. meta-callback.html posts message (postMessage + BroadcastChannel + localStorage)
  //      and calls window.close() to close the popup
  //   3. Main window listeners receive the message and show the account selection modal
  //   4. If popup was blocked → main window navigated to Facebook → came back to
  //      /?meta=select&clientId=...#/integraciones → IntegracionesPage useEffect handles it
  const startMetaOAuth = async () => {
    if (!activeProfileId) return;

    // Close the config modal INSTANTLY — no waiting for the API call.
    // The loading overlay will handle the visual feedback from here on.
    setSelectedPlatform(null);
    setOauthLoading(true);
    setMetaLoadingText('Iniciando conexión con Facebook...');

    try {
      const res = await fetch(`/api/oauth?action=meta-authorize&clientId=${encodeURIComponent(activeProfileId)}`);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al iniciar OAuth con Meta');
      }
      const { authorizeUrl } = await res.json();

      setMetaLoadingText('Abriendo Facebook Login...');

      // Try to open a popup
      const popup = window.open(authorizeUrl, 'meta_oauth', 'width=600,height=700,scrollbars=yes,resizable=yes');

      if (!popup) {
        // Popup blocked — redirect the main window. meta-callback.html will redirect
        // back to /?meta=select&clientId=...#/integraciones so our useEffect handles it.
        setMetaLoadingText('');
        window.location.href = authorizeUrl;
        return;
      }

      setMetaLoadingText('Esperando que completes el login en Facebook...');

      // ─ Popup opened — listen for the callback from meta-callback.html ──────────
      let handled = false;

      const handleMetaSelect = (cid: string) => {
        if (handled) return;
        handled = true;
        clearInterval(pollTimer);
        clearInterval(closeTimer);
        try { bc.close(); } catch {}
        window.removeEventListener('storage', storageHandler);
        localStorage.removeItem('meta_oauth_complete');
        fetchMetaDataAndShowCombined(cid);
      };

      // Method 1: BroadcastChannel
      const bc = new BroadcastChannel('meta_oauth');
      bc.onmessage = (event) => {
        if (event.data?.type === 'meta-select') handleMetaSelect(event.data.clientId as string);
        if (event.data?.type === 'meta-error') {
          if (handled) return;
          handled = true;
          clearInterval(pollTimer); clearInterval(closeTimer);
          try { bc.close(); } catch {}
          window.removeEventListener('storage', storageHandler);
          setMetaLoadingText('');
          showToast('Error al conectar Meta Ads: ' + String(event.data.reason || '').replace(/_/g, ' '), 'error');
        }
      };

      // Method 2: localStorage storage event
      const storageHandler = (e: StorageEvent) => {
        if (e.key === 'meta_oauth_complete' && e.newValue) {
          try { handleMetaSelect(JSON.parse(e.newValue).clientId as string); } catch {}
        }
      };
      window.addEventListener('storage', storageHandler);

      // Method 3: Server polling every 3s — ultimate fallback
      const pollTimer = setInterval(async () => {
        if (handled) { clearInterval(pollTimer); return; }
        try {
          const r = await fetch(`/api/oauth?action=meta-status&clientId=${encodeURIComponent(activeProfileId)}`);
          const { ready } = await r.json();
          if (ready) handleMetaSelect(activeProfileId);
        } catch {}
      }, 3000);

      // Detect popup close — give 1.5s for in-flight messages, then cleanup
      const closeTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(closeTimer);
          setTimeout(() => {
            if (!handled) {
              handled = true;
              clearInterval(pollTimer);
              try { bc.close(); } catch {}
              window.removeEventListener('storage', storageHandler);
              setMetaLoadingText('');
              refreshProfile().then(() => loadClientData());
            }
          }, 1500);
        }
      }, 500);

      // Safety timeout: 3 minutes
      setTimeout(() => {
        if (!handled) {
          handled = true;
          clearInterval(pollTimer);
          clearInterval(closeTimer);
          try { bc.close(); } catch {}
          window.removeEventListener('storage', storageHandler);
          setMetaLoadingText('');
        }
      }, 180000);

    } catch (err: any) {
      showToast(err.message || 'Error al conectar con Meta Ads', 'error');
      setOauthLoading(false);
      setMetaLoadingText('');
    }
  };

  // ── Fetch accounts + pages in parallel, then show combined modal ──────────────
  const fetchMetaDataAndShowCombined = async (clientId: string) => {
    setMetaLoadingText('Obteniendo cuentas y páginas de Meta...');
    try {
      const [accountsRes, pagesRes] = await Promise.all([
        fetch(`/api/oauth?action=meta-accounts&clientId=${encodeURIComponent(clientId)}`),
        fetch(`/api/oauth?action=meta-pages&clientId=${encodeURIComponent(clientId)}`)
      ]);
      const [accountsJson, pagesJson] = await Promise.all([
        accountsRes.json(),
        pagesRes.json()
      ]);
      if (accountsJson.error) {
        showToast('Error al obtener cuentas: ' + accountsJson.error, 'error');
        return;
      }
      const accounts: { id: string; name: string; account_status: number; currency?: string }[] = accountsJson.accounts || [];
      const pages: any[] = pagesJson.pages || [];
      // Auto-select the first account if only one exists
      const autoAccountId = accounts.length === 1 ? accounts[0].id : '';
      // Auto-select the first page if only one exists
      const autoPage = pages.length === 1 ? pages[0] : null;
      setMetaCombinedModal({
        clientId,
        accounts,
        pages,
        selectedAccountId: autoAccountId,
        selectedPage: autoPage,
      });
    } catch {
      showToast('Error al obtener datos de Meta', 'error');
    } finally {
      setMetaLoadingText('');
    }
  };

  // ── Save combined selection (account + page) to DB ───────────────────────────
  const saveCombinedMetaSelection = async () => {
    if (!metaCombinedModal?.selectedAccountId || !metaCombinedModal?.selectedPage) return;
    setSavingMetaCombined(true);
    try {
      const { selectedAccountId, selectedPage, clientId } = metaCombinedModal;
      const igId = selectedPage.instagram_business_account?.id || null;
      const igUsername = selectedPage.instagram_business_account?.username || null;
      const fieldsToUpdate = {
        meta_account_id: selectedAccountId,
        fb_page_id: selectedPage.id,
        fb_page_name: selectedPage.name,
        fb_page_access_token: selectedPage.access_token,
        ig_business_id: igId,
        ig_username: igUsername,
      };
      const currentStatuses = clientData?.connection_statuses || {};
      const { error } = await supabase
        .from('car_clients')
        .update({ ...fieldsToUpdate, connection_statuses: { ...currentStatuses, meta: 'ok' } })
        .eq('id', clientId);
      if (error) throw error;
      if (selectedPage.id && selectedPage.access_token) {
        localStorage.setItem(`fb_pat_${selectedPage.id}`, selectedPage.access_token);
        localStorage.setItem('active_fb_page_id', selectedPage.id);
      }
      setMetaCombinedModal(null);
      setOauthResult({ platform: 'meta', status: 'success' });
      showToast('¡Meta Ads y Redes Sociales conectados exitosamente! ✓', 'success');
      refreshProfile().then(() => loadClientData());
    } catch (err: any) {
      showToast('Error al guardar: ' + err.message, 'error');
    } finally {
      setSavingMetaCombined(false);
    }
  };

  // Real connection testing functions
  const testShopifyConnection = async (domain: string, token: string): Promise<boolean> => {
    try {
      const today = new Date().toISOString().split("T")[0];
      await ecommerce.getShopifyOrders(domain, token, today, today);
      return true;
    } catch {
      return false;
    }
  };

  const testTiendanubeConnection = async (storeId: string, token: string): Promise<boolean> => {
    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const authToken = freshSession?.access_token || "";
      const res = await fetch("/api/scrape-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          clientId: activeProfileId,
          type: "products",
          platform: "tiendanube",
          tiendanube_store_id: storeId,
          tiendanube_access_token: token
        })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.products;
    } catch {
      return false;
    }
  };

  const testWooConnection = async (url: string, key: string, secret: string): Promise<boolean> => {
    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const authToken = freshSession?.access_token || "";
      const res = await fetch("/api/scrape-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          clientId: activeProfileId,
          type: "products",
          platform: "wordpress",
          wordpress_url: url,
          woo_consumer_key: key,
          woo_consumer_secret: secret
        })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.products;
    } catch {
      return false;
    }
  };

  const testKlaviyoConnection = async (key: string): Promise<boolean> => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await klaviyo.getDashboardData(key, today, today);
      return !!res;
    } catch {
      return false;
    }
  };

  const handleSaveRealPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlatform || !activeProfileId) return;

    setSavingSettings(true);
    setTestingConnection(true);

    let fieldsToUpdate: any = {};
    let isConnected = false;
    let typeName = selectedPlatform.id;

    try {
      if (selectedPlatform.id === "shopify") {
        if (!shopifyDomain.trim() || !shopifyToken.trim()) {
          showToast("Ingresá el dominio y el access token", "warning");
          setSavingSettings(false);
          setTestingConnection(false);
          return;
        }
        fieldsToUpdate = {
          shopify_domain: shopifyDomain.trim(),
          shopify_access_token: shopifyToken.trim(),
          ecommerce_platform: "shopify"
        };
        // test it
        isConnected = await testShopifyConnection(shopifyDomain.trim(), shopifyToken.trim());
      } else if (selectedPlatform.id === "tiendanube") {
        if (!tiendanubeStoreId.trim() || !tiendanubeToken.trim()) {
          showToast("Ingresá el Store ID y el access token", "warning");
          setSavingSettings(false);
          setTestingConnection(false);
          return;
        }
        fieldsToUpdate = {
          tiendanube_store_id: tiendanubeStoreId.trim(),
          tiendanube_access_token: tiendanubeToken.trim(),
          ecommerce_platform: "tiendanube"
        };
        isConnected = await testTiendanubeConnection(tiendanubeStoreId.trim(), tiendanubeToken.trim());
      } else if (selectedPlatform.id === "wordpress") {
        if (!wooUrl.trim() || !wooConsumerKey.trim() || !wooConsumerSecret.trim()) {
          showToast("Ingresá la URL de WooCommerce, el Consumer Key y Consumer Secret", "warning");
          setSavingSettings(false);
          setTestingConnection(false);
          return;
        }
        fieldsToUpdate = {
          wordpress_url: wooUrl.trim(),
          woo_consumer_key: wooConsumerKey.trim(),
          woo_consumer_secret: wooConsumerSecret.trim(),
          ecommerce_platform: "wordpress"
        };
        isConnected = await testWooConnection(wooUrl.trim(), wooConsumerKey.trim(), wooConsumerSecret.trim());
        typeName = "shopify"; // Backend stores status as 'shopify' for all ecommerce integrations
      } else if (selectedPlatform.id === "klaviyo") {
        if (!klaviyoApiKey.trim()) {
          showToast("Ingresá la API Key de Klaviyo", "warning");
          setSavingSettings(false);
          setTestingConnection(false);
          return;
        }
        fieldsToUpdate = {
          klaviyo_api_key: klaviyoApiKey.trim(),
          klaviyo_list_id: klaviyoListId.trim() || null
        };
        isConnected = await testKlaviyoConnection(klaviyoApiKey.trim());
      } else if (selectedPlatform.id === "meta") {
        fieldsToUpdate = {
          meta_account_id: metaAccountId.trim() || null,
          meta_pixel_id: metaPixelId.trim() || null
        };
        // If we have a facebook_access_token saved from OAuth, keep it
        if (metaToken) fieldsToUpdate.facebook_access_token = metaToken;
        // Meta: connection ok if account ID is filled
        isConnected = !!metaAccountId.trim();
      }

      // 1. Update fields in car_clients
      const { error } = await supabase
        .from("car_clients")
        .update(fieldsToUpdate)
        .eq("id", activeProfileId);

      if (error) throw error;

      // 2. Update local state
      setClientData((prev: any) => ({ ...prev, ...fieldsToUpdate }));

      // 3. Update connection_statuses in Supabase and locally
      const statusKey = (selectedPlatform.id === "wordpress" || selectedPlatform.id === "tiendanube") ? "shopify" : selectedPlatform.id;
      await updateConnectionStatus(statusKey, isConnected ? "ok" : "error");

      if (isConnected) {
        showToast(`¡Conexión con ${selectedPlatform.name} exitosa y guardada! ✓`, "success");
        closeConfigModal();
      } else {
        showToast(`Credenciales guardadas, pero falló la prueba de conexión con ${selectedPlatform.name}.`, "warning");
      }
    } catch (err: any) {
      showToast("Error al guardar credenciales: " + err.message, "error");
    } finally {
      setSavingSettings(false);
      setTestingConnection(false);
    }
  };

  const handleDisconnect = async (platformId: string) => {
    if (!window.confirm(`¿Estás seguro de que querés desconectar ${PLATFORMS.find(p => p.id === platformId)?.name}?`)) {
      return;
    }

    setSavingSettings(true);

    let fieldsToUpdate: any = {};
    let statusKey = platformId;

    if (platformId === "shopify") {
      fieldsToUpdate = {
        shopify_domain: null,
        shopify_access_token: null,
        ecommerce_platform: null
      };
    } else if (platformId === "tiendanube") {
      fieldsToUpdate = {
        tiendanube_store_id: null,
        tiendanube_access_token: null,
        ecommerce_platform: null
      };
      statusKey = "shopify";
    } else if (platformId === "wordpress") {
      fieldsToUpdate = {
        wordpress_url: null,
        woo_consumer_key: null,
        woo_consumer_secret: null,
        ecommerce_platform: null
      };
      statusKey = "shopify";
    } else if (platformId === "klaviyo") {
      fieldsToUpdate = {
        klaviyo_api_key: null,
        klaviyo_list_id: null
      };
    } else if (platformId === "meta") {
      fieldsToUpdate = {
        meta_account_id: null,
        meta_pixel_id: null
      };
    }

    try {
      // 1. Update database
      if (Object.keys(fieldsToUpdate).length > 0) {
        const { error } = await supabase
          .from("car_clients")
          .update(fieldsToUpdate)
          .eq("id", activeProfileId);

        if (error) throw error;
        setClientData((prev: any) => ({ ...prev, ...fieldsToUpdate }));
      }

      // 2. Clear status
      let extraData: Record<string, any> = {};
      if (platformId === "mercadolibre") {
        extraData = { mercadolibre_country: null };
      }
      await updateConnectionStatus(statusKey, null, extraData);

      showToast("Plataforma desconectada correctamente.", "success");
      closeConfigModal();
    } catch (err: any) {
      showToast("Error al desconectar: " + err.message, "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Simulated OAuth for Mercado Libre, Google Ads, TikTok (still no real integration)
  const runSimulatedOAuth = async (platformId: string) => {
    setOauthLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const extraData = platformId === "mercadolibre" ? { mercadolibre_country: mlCountry } : {};
      const statusKey = platformId;
      await updateConnectionStatus(statusKey, "ok", extraData);
      showToast(`¡Conexión con ${PLATFORMS.find(p => p.id === platformId)?.name} registrada! ✓`, "success");
      closeConfigModal();
    } catch (err: any) {
      showToast("Error al conectar: " + err.message, "error");
    } finally {
      setOauthLoading(false);
    }
  };

  const getPlatformStatus = (platformId: string): "ok" | "error" | "disconnected" => {
    if (!clientData) return "disconnected";
    
    let key = platformId;
    if (platformId === "wordpress" || platformId === "tiendanube") {
      key = "shopify";
      // Double check active platform matches
      if (clientData.ecommerce_platform !== platformId) {
        return "disconnected";
      }
    }

    const statuses = clientData.connection_statuses || {};
    return statuses[key] || "disconnected";
  };

  const filteredPlatforms = PLATFORMS.filter(p => {
    if (activeTab === "all") return true;
    return p.category === activeTab;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center animate-in fade-in duration-200">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 font-medium">Cargando integraciones...</p>
      </div>
    );
  }



  return (
    <div className="space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">

      {/* Loading Overlay */}
      {metaLoadingText && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-xs text-center">
            <Loader2 className="w-9 h-9 text-blue-500 animate-spin" />
            <p className="text-white font-bold text-[13px]">{metaLoadingText}</p>
          </div>
        </div>
      )}

      {/* Meta Combined Connection Modal — Ad Account + Page/Instagram in one step */}
      {metaCombinedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[88vh]">

            {/* Header */}
            <div className="p-5 border-b border-zinc-800 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-[#1877f2]/15 border border-[#1877f2]/20 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-[#1877f2]">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-white font-bold text-[15px] leading-tight">Configurar Meta Ads</h2>
                <p className="text-zinc-500 text-xs mt-0.5">Seleccioná tu cuenta publicitaria y página de Facebook</p>
              </div>
              <button
                onClick={() => setMetaCombinedModal(null)}
                className="text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-800 shrink-0"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* ─ Step 1: Ad Account ─ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-[#1877f2] flex items-center justify-center text-[10px] font-black text-white shrink-0">1</div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Cuenta publicitaria</p>
                </div>
                {metaCombinedModal.accounts.length === 0 ? (
                  <div className="p-4 rounded-xl border border-zinc-700/50 bg-zinc-800/30 text-center">
                    <p className="text-zinc-500 text-sm">No se encontraron cuentas publicitarias</p>
                    <p className="text-zinc-600 text-xs mt-1">Verificá que tu cuenta tenga acceso a Meta Business.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {metaCombinedModal.accounts.map(acc => {
                      const isSelected = metaCombinedModal.selectedAccountId === acc.id;
                      return (
                        <button
                          key={acc.id}
                          onClick={() => setMetaCombinedModal(prev => prev ? { ...prev, selectedAccountId: acc.id } : null)}
                          disabled={savingMetaCombined}
                          className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-[#1877f2] bg-[#1877f2]/10 ring-1 ring-[#1877f2]/20'
                              : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
                          } disabled:opacity-50`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-white font-semibold text-sm truncate">{acc.name}</p>
                              <p className="text-zinc-500 text-xs mt-0.5">{acc.id}{acc.currency ? ` · ${acc.currency}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className={`w-2 h-2 rounded-full ${acc.account_status === 1 ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-[#1877f2] flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white stroke-[3]" />
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ─ Step 2: Facebook Page + Instagram ─ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center text-[10px] font-black text-white shrink-0">2</div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Página de Facebook & Instagram</p>
                </div>
                {metaCombinedModal.pages.length === 0 ? (
                  <div className="p-4 rounded-xl border border-zinc-700/50 bg-zinc-800/30 text-center space-y-1">
                    <p className="text-zinc-500 text-sm">No se encontraron páginas de Facebook</p>
                    <p className="text-zinc-600 text-xs">Asegurate de ser administrador de al menos una página.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {metaCombinedModal.pages.map(page => {
                      const isSelected = metaCombinedModal.selectedPage?.id === page.id;
                      const ig = page.instagram_business_account;
                      return (
                        <button
                          key={page.id}
                          onClick={() => setMetaCombinedModal(prev => prev ? { ...prev, selectedPage: page } : null)}
                          disabled={savingMetaCombined}
                          className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-pink-500 bg-pink-500/10 ring-1 ring-pink-500/20'
                              : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
                          } disabled:opacity-50`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-white font-semibold text-sm truncate">{page.name}</p>
                              {ig ? (
                                <div className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-pink-400 bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded-full">
                                  <Instagram className="w-3 h-3" />
                                  <span>@{ig.username}</span>
                                </div>
                              ) : (
                                <p className="text-zinc-600 text-xs mt-1">Sin Instagram vinculado</p>
                              )}
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center shrink-0 mt-0.5">
                                <Check className="w-3 h-3 text-white stroke-[3]" />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-800 shrink-0 space-y-2">
              {(!metaCombinedModal.selectedAccountId || !metaCombinedModal.selectedPage) && (
                <p className="text-center text-zinc-600 text-xs">
                  {!metaCombinedModal.selectedAccountId && 'Seleccioná una cuenta publicitaria'}
                  {!metaCombinedModal.selectedAccountId && !metaCombinedModal.selectedPage && ' y '}
                  {!metaCombinedModal.selectedPage && 'una página de Facebook'}
                  {' '}para continuar
                </p>
              )}
              <button
                onClick={saveCombinedMetaSelection}
                disabled={!metaCombinedModal.selectedAccountId || !metaCombinedModal.selectedPage || savingMetaCombined}
                className="w-full h-11 bg-[#1877f2] hover:bg-[#166fe5] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-[13px] flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#1877f2]/20"
              >
                {savingMetaCombined ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>  
                ) : (
                  <><Check className="w-4 h-4 stroke-[2.5]" /> Conectar Meta Ads</>  
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Zap className="w-6 h-6 text-violet-500" />
            <span>Integraciones</span>
          </h1>
          <p className="page-subtitle">
            Conectá tus canales de venta, pasarelas de pago y píxeles de publicidad para centralizar tus métricas y optimizar la IA.
          </p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-zinc-200 dark:border-white/[0.06] pb-0.5 gap-6 select-none overflow-x-auto shrink-0">
        {[
          { id: "all", label: "Todas" },
          { id: "ecommerce", label: "Tiendas Online" },
          { id: "ads", label: "Publicidad" },
          { id: "marketing", label: "Marketing Directo" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 text-[13px] font-bold border-b-2 transition-all relative whitespace-nowrap ${
              activeTab === tab.id
                ? "border-violet-500 text-violet-500 dark:text-violet-400 font-extrabold"
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredPlatforms.map(platform => {
          const status = getPlatformStatus(platform.id);
          const Logo = platform.logoComponent;

          return (
            <div
              key={platform.id}
              className="card-premium flex flex-col justify-between hover:scale-[1.01] transition-all hover:shadow-[0_12px_24px_rgba(0,0,0,0.04)] dark:hover:border-zinc-800 group relative overflow-hidden"
            >
              <div>
                {/* Card Top / Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                    {platform.logoUrl ? (
                      <img src={platform.logoUrl} alt={platform.name} className="w-6 h-6 object-contain" />
                    ) : Logo ? (
                      <Logo className="w-5 h-5 text-[#15B374]" />
                    ) : null}
                  </div>

                  {/* Status Badges */}
                  <div>
                    {status === "ok" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">
                        <Check className="w-3 h-3 stroke-[3]" /> Conectado
                      </span>
                    ) : status === "error" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10 px-2.5 py-1 rounded-full">
                        <AlertCircle className="w-3 h-3 stroke-[3]" /> Error
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 bg-zinc-50 dark:text-zinc-500 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                        Desconectado
                      </span>
                    )}
                  </div>
                </div>

                {/* Title & Info */}
                <h3 className="text-[16px] font-extrabold text-zinc-900 dark:text-white mb-2 leading-tight">
                  {platform.name}
                </h3>
                <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium mb-6">
                  {platform.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-zinc-100 dark:border-white/[0.03] flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                  {platform.isSimulated ? "Conexión OAuth" : "Conexión Directa"}
                </span>

                <button
                  onClick={() => openConfigModal(platform)}
                  className={`h-9 px-4 rounded-xl text-[12px] font-extrabold flex items-center gap-1.5 transition-all shadow-sm ${
                    status === "ok"
                      ? "bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-350"
                      : "bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950"
                  }`}
                >
                  {status === "ok" ? (
                    <>
                      <Settings className="w-3.5 h-3.5" />
                      <span>Configurar</span>
                    </>
                  ) : (
                    <>
                      <span>Conectar</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Dialog */}
      {selectedPlatform && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={closeConfigModal}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

          {/* Modal Container */}
          <div
            className="relative bg-white dark:bg-zinc-900 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 sm:p-8 max-w-[500px] w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header info */}
            <div className="flex items-center gap-4 mb-6 pb-5 border-b border-zinc-100 dark:border-white/[0.04]">
              <div className="w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                {selectedPlatform.logoUrl && (
                  <img src={selectedPlatform.logoUrl} alt={selectedPlatform.name} className="w-6 h-6 object-contain" />
                )}
              </div>
              <div>
                <h2 className="text-[18px] font-black text-zinc-900 dark:text-white leading-tight">
                  {getPlatformStatus(selectedPlatform.id) === "ok" ? "Configuración de" : "Conectar"} {selectedPlatform.name}
                </h2>
                <p className="text-[12px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider mt-1">
                  {selectedPlatform.category === "ecommerce" ? "Canal de Venta" : selectedPlatform.category === "ads" ? "Canal Publicitario" : "Email Marketing"}
                </p>
              </div>
              
              {/* Close Button */}
              <button
                onClick={closeConfigModal}
                className="ml-auto p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* OAUTH LOADING OVERLAY (while waiting for redirect or popup) */}
            {oauthLoading ? (
              <div className="py-12 text-center space-y-5 flex flex-col items-center">
                <div className="relative">
                  <div className="w-14 h-14 bg-violet-100 dark:bg-violet-900/40 rounded-full flex items-center justify-center animate-ping absolute inset-0 opacity-40" />
                  <div className="w-14 h-14 bg-violet-500 text-white rounded-full flex items-center justify-center relative shadow-lg">
                    <Lock className="w-6 h-6" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[15px] font-bold text-zinc-800 dark:text-white">Conectando con {selectedPlatform.name}...</p>
                  <p className="text-[12px] text-zinc-400">Estableciendo canal seguro OAuth. No cerrés esta ventana.</p>
                </div>
                <div className="w-full max-w-[240px] h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
                <button
                  type="button"
                  onClick={() => closeConfigModal(true)}
                  className="text-[11px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mt-2"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              /* REAL/MANUAL CONFIGURATION FORM */
              <form onSubmit={handleSaveRealPlatform} className="space-y-5">
                
                {/* SHOPIFY FORM */}
                {selectedPlatform.id === "shopify" && (
                  <>
                    {/* OAUTH VIEW (default) */}
                    {!isManualMode && (
                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/5 dark:to-teal-500/5 rounded-2xl border border-emerald-500/20 dark:border-emerald-500/10 text-[13px] leading-relaxed space-y-3">
                          <div className="flex gap-3">
                            <Lock className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Conexión OAuth Segura</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Vas a ser redirigido a Shopify para autorizar el acceso. Se conectarán automáticamente tus pedidos, inventario y clientes.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {['Pedidos', 'Productos', 'Clientes', 'Inventario'].map(s => (
                              <span key={s} className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />{s}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Dominio de tu tienda Shopify *
                          </label>
                          <input
                            type="text"
                            className="apple-input"
                            placeholder="ej. mi-tienda.myshopify.com"
                            value={shopifyDomain}
                            onChange={e => setShopifyDomain(e.target.value)}
                            disabled={oauthLoading}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={startShopifyOAuth}
                          disabled={oauthLoading || !shopifyDomain.trim()}
                          className="w-full h-12 bg-[#96BF48] hover:bg-[#85ab3f] text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
                        >
                          {oauthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <img src="/assets/shopify-bag.webp" alt="" className="w-4 h-4 object-contain" />}
                          <span>{oauthLoading ? 'Conectando...' : 'Autorizar con Shopify'}</span>
                        </button>

                        <div className="text-center pt-1">
                          <button type="button" onClick={() => setIsManualMode(true)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors underline underline-offset-4">
                            Tengo un Admin API Token (manual)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* MANUAL VIEW (Admin API Token) */}
                    {isManualMode && (
                      <div className="space-y-4">
                        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-[12px] text-amber-700 dark:text-amber-400 flex gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>Usá esta opción solo si ya tenés un <strong>Admin API Token</strong> de una app personalizada de Shopify.</span>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Dominio de tu tienda
                          </label>
                          <input type="text" className="apple-input" placeholder="ej. mi-tienda.myshopify.com"
                            value={shopifyDomain} onChange={e => setShopifyDomain(e.target.value)} required disabled={savingSettings} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Admin Access Token
                          </label>
                          <input type="password" className="apple-input" placeholder="shpat_..."
                            value={shopifyToken} onChange={e => setShopifyToken(e.target.value)} required disabled={savingSettings} />
                        </div>
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-850 rounded-2xl border border-zinc-150 dark:border-zinc-800 text-[12px] text-zinc-500 dark:text-zinc-400 space-y-2 leading-relaxed">
                          <span className="font-extrabold text-zinc-700 dark:text-zinc-350 flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-violet-500" /> ¿Cómo obtener el token?
                          </span>
                          <p>En Shopify: <strong>Configuración → Apps → Desarrollar apps → Crear app</strong>. Permisos necesarios: <code>read_orders</code>, <code>read_customers</code>, <code>read_products</code>.</p>
                        </div>
                        <div className="text-center">
                          <button type="button" onClick={() => setIsManualMode(false)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors">
                            ← Usar OAuth (recomendado)
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* TIENDANUBE FORM */}
                {selectedPlatform.id === "tiendanube" && (
                  <>
                    {/* OAUTH VIEW (default) */}
                    {!isManualMode && (
                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-cyan-500/10 to-sky-500/10 dark:from-cyan-500/5 dark:to-sky-500/5 rounded-2xl border border-cyan-500/20 dark:border-cyan-500/10 text-[13px] leading-relaxed space-y-3">
                          <div className="flex gap-3">
                            <Lock className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Conexión OAuth con Tiendanube</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Vas a ser redirigido al portal de Tiendanube para autorizar el acceso. Tus órdenes, productos y datos de clientes se sincronizarán de forma automática.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {['Órdenes', 'Productos', 'Clientes', 'Estadísticas'].map(s => (
                              <span key={s} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 px-2 py-0.5 rounded-full">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />{s}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={startTiendanubeOAuth}
                          disabled={oauthLoading}
                          className="w-full h-12 bg-[#07B3C2] hover:bg-[#069aaa] text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
                        >
                          {oauthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <img src="/assets/tiendanube.webp" alt="" className="w-4 h-4 object-contain" />}
                          <span>{oauthLoading ? 'Conectando...' : 'Autorizar con Tiendanube'}</span>
                        </button>

                        <div className="text-center pt-1">
                          <button type="button" onClick={() => setIsManualMode(true)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors underline underline-offset-4">
                            Tengo Store ID + Access Token (manual)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* MANUAL VIEW */}
                    {isManualMode && (
                      <div className="space-y-4">
                        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-[12px] text-amber-700 dark:text-amber-400 flex gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>Usá esta opción solo si ya tenés las credenciales de la API de Tiendanube.</span>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Store ID</label>
                          <input type="text" className="apple-input" placeholder="ej. 1298402"
                            value={tiendanubeStoreId} onChange={e => setTiendanubeStoreId(e.target.value)} required disabled={savingSettings} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Access Token</label>
                          <input type="password" className="apple-input" placeholder="ej. 9a7b5..."
                            value={tiendanubeToken} onChange={e => setTiendanubeToken(e.target.value)} required disabled={savingSettings} />
                        </div>
                        <div className="text-center">
                          <button type="button" onClick={() => setIsManualMode(false)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors">
                            ← Usar OAuth (recomendado)
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* WOOCOMMERCE FORM - direct real credentials (no simulated OAuth) */}
                {selectedPlatform.id === "wordpress" && (
                  <>
                    {!isManualMode && (

                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/5 dark:to-indigo-500/5 rounded-2xl border border-blue-500/20 dark:border-blue-500/10 text-[13px] leading-relaxed space-y-3">
                          <div className="flex gap-3">
                            <Key className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Conexión via REST API</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                WooCommerce usa autenticación por clave de API. Generá tus claves en el panel de WordPress en menos de 1 minuto.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Step-by-step guide */}
                        <div className="space-y-2.5">
                          {[
                            { n: 1, text: 'En WordPress ve a WooCommerce → Ajustes → Avanzado → API REST' },
                            { n: 2, text: 'Hacé clic en "Añadir clave", ponele un nombre (ej. "Algoritmia") y permisos Lectura' },
                            { n: 3, text: 'Copiá el Consumer Key y Consumer Secret generados, y pegálos aquí' }
                          ].map(step => (
                            <div key={step.n} className="flex gap-3 items-start">
                              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">{step.n}</div>
                              <p className="text-[12px] text-zinc-600 dark:text-zinc-400">{step.text}</p>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">URL del sitio</label>
                            <input type="url" className="apple-input" placeholder="https://mi-tienda.com"
                              value={wooUrl} onChange={e => setWooUrl(e.target.value)} required disabled={savingSettings} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Consumer Key</label>
                            <input type="text" className="apple-input" placeholder="ck_..."
                              value={wooConsumerKey} onChange={e => setWooConsumerKey(e.target.value)} required disabled={savingSettings} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Consumer Secret</label>
                            <input type="password" className="apple-input" placeholder="cs_..."
                              value={wooConsumerSecret} onChange={e => setWooConsumerSecret(e.target.value)} required disabled={savingSettings} />
                          </div>
                        </div>
                      </div>
                    )}
                    {isManualMode && (
                      <div className="text-center py-4">
                        <button type="button" onClick={() => setIsManualMode(false)}
                          className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors">← Ocultar guía</button>
                      </div>
                    )}
                  </>
                )}

                {/* MERCADO LIBRE (SIMULATED OAUTH WITH COUNTRY SELECTOR) */}
                {selectedPlatform.id === "mercadolibre" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                        País de tu cuenta de Mercado Libre
                      </label>
                      <select
                        className="apple-select w-full"
                        value={mlCountry}
                        onChange={e => setMlCountry(e.target.value)}
                        disabled={savingSettings}
                      >
                        {ML_COUNTRIES.map(c => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="p-4 bg-zinc-50 dark:bg-zinc-850 rounded-2xl border border-zinc-150 dark:border-zinc-800 text-[12px] text-zinc-500 dark:text-zinc-400 space-y-1 leading-relaxed">
                      <p>
                        Mercado Libre requiere vinculación mediante autenticación de cuenta oficial (OAuth 2.0). 
                        Al hacer clic en "Conectar", se iniciará el flujo de autorización correspondiente para el país seleccionado ({ML_COUNTRIES.find(c => c.code === mlCountry)?.name}).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => runSimulatedOAuth("mercadolibre")}
                      disabled={savingSettings}
                      className="w-full h-11 bg-[#ffe600] text-[#111] hover:bg-[#ffe000] font-black rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      <Globe className="w-4 h-4" />
                      <span>Conectar vía Mercado Libre OAuth</span>
                    </button>
                  </div>
                )}

                {/* META ADS - Real Facebook OAuth popup */}
                {selectedPlatform.id === "meta" && (
                  <>
                    {/* OAUTH VIEW (default) */}
                    {!isManualMode && (
                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 dark:from-blue-600/5 dark:to-indigo-600/5 rounded-2xl border border-blue-600/20 dark:border-blue-600/10 text-[13px] leading-relaxed space-y-3">
                          <div className="flex gap-3">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#1877f2] shrink-0 mt-0.5">
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Vinculación con Facebook Login</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Iniciás sesión con tu cuenta de Facebook. Algoritmia accede de forma segura a tus cuentas publicitarias para importar métricas reales.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {['Cuentas publicitarias', 'Campañas', 'Métricas ROAS', 'Insights'].map(s => (
                              <span key={s} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />{s}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={startMetaOAuth}
                          disabled={oauthLoading}
                          className="w-full h-12 bg-[#1877f2] hover:bg-[#166fe5] text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
                        >
                          {oauthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                          )}
                          <span>{oauthLoading ? 'Abriendo Facebook...' : 'Vincular con Facebook'}</span>
                        </button>

                        <div className="text-center pt-1">
                          <button type="button" onClick={() => setIsManualMode(true)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors underline underline-offset-4">
                            Ingresar Ad Account ID manualmente
                          </button>
                        </div>
                      </div>
                    )}

                    {/* MANUAL VIEW */}
                    {isManualMode && (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Meta Ad Account ID
                          </label>
                          <input
                            type="text"
                            className="apple-input"
                            placeholder="ej. act_1029384758"
                            value={metaAccountId}
                            onChange={e => setMetaAccountId(e.target.value)}
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Meta Pixel ID (Opcional)
                          </label>
                          <input
                            type="text"
                            className="apple-input"
                            placeholder="ej. 9283749283"
                            value={metaPixelId}
                            onChange={e => setMetaPixelId(e.target.value)}
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={() => setIsManualMode(false)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors"
                          >
                            ← Volver a Conexión Automática
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* GOOGLE ADS (SIMULATED OAUTH) */}
                {selectedPlatform.id === "google_ads" && (
                  <div className="space-y-4 py-2">
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">
                      Hacé clic abajo para iniciar sesión con tu cuenta de Google y autorizar el acceso de lectura a tus cuentas publicitarias de Google Ads.
                    </p>
                    <button
                      type="button"
                      onClick={() => runSimulatedOAuth("google_ads")}
                      disabled={savingSettings}
                      className="w-full h-11 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2.5 shadow-sm transition-all"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>Iniciar sesión con Google</span>
                    </button>
                  </div>
                )}

                {/* TIKTOK ADS (SIMULATED OAUTH) */}
                {selectedPlatform.id === "tiktok_ads" && (
                  <div className="space-y-4 py-2">
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">
                      TikTok requiere vinculación segura OAuth para conectarse a tu Business Center y leer tus campañas publicitarias.
                    </p>
                    <button
                      type="button"
                      onClick={() => runSimulatedOAuth("tiktok_ads")}
                      disabled={savingSettings}
                      className="w-full h-11 bg-black hover:bg-zinc-900 text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      <img src="/assets/tiktok-icon.webp" alt="TikTok" className="w-4 h-4 object-contain shrink-0 invert dark:invert-0" />
                      <span>Conectar con TikTok Business</span>
                    </button>
                  </div>
                )}

                {/* KLAVIYO FORM - direct API Key (Klaviyo has no real OAuth for private API) */}
                {selectedPlatform.id === "klaviyo" && (
                  <div className="space-y-5">
                    <div className="p-5 bg-gradient-to-br from-green-500/10 to-emerald-500/10 dark:from-green-500/5 dark:to-emerald-500/5 rounded-2xl border border-green-500/20 dark:border-green-500/10 text-[13px] leading-relaxed space-y-3">
                      <div className="flex gap-3">
                        <Key className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Private API Key de Klaviyo</span>
                          <p className="text-zinc-500 dark:text-zinc-400">
                            Klaviyo usa autenticación por API Key privada. Se genera en segundos desde tu cuenta y da acceso a todas tus métricas y listas.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Step guide */}
                    <div className="space-y-2.5">
                      {[
                        { n: 1, text: 'Ingresá a Klaviyo → Settings → API Keys' },
                        { n: 2, text: 'Hacé clic en "Create Private API Key" con acceso Full o de lectura' },
                        { n: 3, text: 'Copiá la clave generada (empieza con pk_) y pegála aquí' }
                      ].map(step => (
                        <div key={step.n} className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">{step.n}</div>
                          <p className="text-[12px] text-zinc-600 dark:text-zinc-400">{step.text}</p>
                        </div>
                      ))}
                    </div>

                    <a
                      href="https://www.klaviyo.com/settings/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-[12px] font-bold text-green-600 dark:text-green-400 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ir a Klaviyo API Keys →
                    </a>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Private API Key *</label>
                        <input type="password" className="apple-input" placeholder="pk_..."
                          value={klaviyoApiKey} onChange={e => setKlaviyoApiKey(e.target.value)} required disabled={savingSettings} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">List ID principal (opcional)</label>
                        <input type="text" className="apple-input" placeholder="ej. XyZ123"
                          value={klaviyoListId} onChange={e => setKlaviyoListId(e.target.value)} disabled={savingSettings} />
                      </div>
                    </div>
                  </div>
                )}

                {/* FOOTER ACTIONS - Save / Disconnect / Close */}
                {/* Show save button for all real platforms (manual or not) */}
                {!selectedPlatform.isSimulated && (
                  ['shopify', 'tiendanube', 'wordpress', 'klaviyo', 'meta'].includes(selectedPlatform.id)
                ) && (
                  // Show save/connect button only when there are real credentials to save (manual mode or woo/klaviyo)
                  (isManualMode || selectedPlatform.id === 'wordpress' || selectedPlatform.id === 'klaviyo' || (selectedPlatform.id === 'meta' && isManualMode))
                ) && (
                  <div className="pt-6 border-t border-zinc-100 dark:border-white/[0.04] flex items-center gap-3">
                    
                    {/* Disconnect button if already connected */}
                    {getPlatformStatus(selectedPlatform.id) === "ok" && (
                      <button
                        type="button"
                        onClick={() => handleDisconnect(selectedPlatform.id)}
                        disabled={savingSettings || testingConnection}
                        className="mr-auto text-[12.5px] font-bold text-red-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Desconectar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={closeConfigModal}
                      disabled={savingSettings || testingConnection}
                      className="ml-auto px-4 h-10 rounded-xl text-[12.5px] font-bold border border-zinc-200 dark:border-zinc-800 text-zinc-550 dark:text-zinc-450 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-all"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={savingSettings || testingConnection}
                      className="px-5 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[12.5px] font-extrabold flex items-center gap-2 shadow-md shadow-violet-500/10 transition-all disabled:opacity-50"
                    >
                      {(savingSettings || testingConnection) ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Probando conexión...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Guardar y Probar Conexión</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Footer for OAuth-based platforms (shopify/tiendanube/meta in auto mode): just disconnect + close */}
                {!selectedPlatform.isSimulated && !isManualMode &&
                  ['shopify', 'tiendanube', 'meta'].includes(selectedPlatform.id) && (
                  <div className="pt-6 border-t border-zinc-100 dark:border-white/[0.04] flex items-center gap-3 justify-end">
                    {getPlatformStatus(selectedPlatform.id) === "ok" && (
                      <button type="button" onClick={() => handleDisconnect(selectedPlatform.id)}
                        disabled={savingSettings || testingConnection}
                        className="mr-auto text-[12.5px] font-bold text-red-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4" /><span>Desconectar</span>
                      </button>
                    )}
                    <button type="button" onClick={closeConfigModal}
                      disabled={oauthLoading || savingSettings}
                      className="px-5 h-10 rounded-xl text-[12.5px] font-bold border border-zinc-200 dark:border-zinc-800 text-zinc-550 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-all">
                      Cerrar
                    </button>
                  </div>
                )}

                {/* Footer for simulated OAuth platforms (mercadolibre, google_ads, tiktok_ads) */}
                {selectedPlatform.isSimulated && getPlatformStatus(selectedPlatform.id) === "ok" && (
                  <div className="pt-6 border-t border-zinc-100 dark:border-white/[0.04] flex justify-between">
                    <button type="button" onClick={() => handleDisconnect(selectedPlatform.id)}
                      disabled={savingSettings}
                      className="text-[12.5px] font-bold text-red-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4" /><span>Desconectar</span>
                    </button>
                    <button type="button" onClick={closeConfigModal}
                      className="px-4 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[12.5px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-250 transition-all">
                      Cerrar
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
