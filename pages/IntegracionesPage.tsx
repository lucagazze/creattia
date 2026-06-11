import React, { useState, useEffect } from "react";
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
  Info
} from "lucide-react";

// Klaviyo SVG logo since it's not in public/assets/
const KlaviyoLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M5.04 3h3.6v18h-3.6zM10.8 11.28h3.6V21h-3.6zM16.56 3h3.6v8.28h-3.6zM10.8 3h3.6v6.12h-3.6z" />
  </svg>
);

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
  const { profile } = useAuth();
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

  // Simulated OAuth state
  const [mlCountry, setMlCountry] = useState("AR");
  const [simulatingOAuth, setSimulatingOAuth] = useState(false);
  const [oauthStep, setOauthStep] = useState(0); // 0: Idle, 1: Redirecting, 2: Permissions, 3: Success
  const [isManualMode, setIsManualMode] = useState(false);

  // Loading indicator for tests & saves
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

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
    setOauthStep(0);
    setSimulatingOAuth(false);
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
      }
    }
  };

  const closeConfigModal = () => {
    if (simulatingOAuth || testingConnection || savingSettings) return; // Prevent closing mid-process
    setSelectedPlatform(null);
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
        // Meta doesn't have an instant api fetch test unless token is configured. Assume ok if configured, or manual ok.
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

  // Simulated OAuth Connection Trigger
  const runSimulatedOAuth = async (platformId: string) => {
    setSimulatingOAuth(true);
    setOauthStep(1);

    // Step 1: Redirecting
    await new Promise(resolve => setTimeout(resolve, 1500));
    setOauthStep(2);

    // Step 2: Granting Permissions
    await new Promise(resolve => setTimeout(resolve, 2000));
    setOauthStep(3);

    // Step 3: Success and save to Supabase
    try {
      const extraData = platformId === "mercadolibre" ? { mercadolibre_country: mlCountry } : {};
      let mockFields: any = {};

      if (platformId === "meta") {
        mockFields = {
          meta_account_id: "act_1092837482937",
          meta_pixel_id: "2837492837482"
        };
      } else if (platformId === "shopify") {
        mockFields = {
          shopify_domain: shopifyDomain.trim() || "mi-tienda.myshopify.com",
          shopify_access_token: "shpat_mock_shopify_access_token_8237482",
          ecommerce_platform: "shopify",
          // Clear others
          tiendanube_store_id: null,
          tiendanube_access_token: null,
          wordpress_url: null,
          woo_consumer_key: null,
          woo_consumer_secret: null
        };
      } else if (platformId === "tiendanube") {
        mockFields = {
          tiendanube_store_id: "123456",
          tiendanube_access_token: "tn_mock_access_token_8273423",
          ecommerce_platform: "tiendanube",
          // Clear others
          shopify_domain: null,
          shopify_access_token: null,
          wordpress_url: null,
          woo_consumer_key: null,
          woo_consumer_secret: null
        };
      } else if (platformId === "wordpress") {
        mockFields = {
          wordpress_url: wooUrl.trim() || "https://mi-tienda-woocommerce.com",
          woo_consumer_key: "ck_mock_consumer_key_2837498",
          woo_consumer_secret: "cs_mock_consumer_secret_1928374",
          ecommerce_platform: "wordpress",
          // Clear others
          shopify_domain: null,
          shopify_access_token: null,
          tiendanube_store_id: null,
          tiendanube_access_token: null
        };
      } else if (platformId === "klaviyo") {
        mockFields = {
          klaviyo_api_key: "pk_mock_klaviyo_key_98234892348234",
          klaviyo_list_id: "XyZ123"
        };
      }

      if (Object.keys(mockFields).length > 0) {
        const { error } = await supabase
          .from("car_clients")
          .update(mockFields)
          .eq("id", activeProfileId);
        
        if (error) throw error;
        setClientData((prev: any) => ({ ...prev, ...mockFields }));

        // Update local React state variables too so the forms show the loaded values
        if (platformId === "shopify") {
          setShopifyDomain(mockFields.shopify_domain);
          setShopifyToken(mockFields.shopify_access_token);
        } else if (platformId === "tiendanube") {
          setTiendanubeStoreId(mockFields.tiendanube_store_id);
          setTiendanubeToken(mockFields.tiendanube_access_token);
        } else if (platformId === "wordpress") {
          setWooUrl(mockFields.wordpress_url);
          setWooConsumerKey(mockFields.woo_consumer_key);
          setWooConsumerSecret(mockFields.woo_consumer_secret);
        } else if (platformId === "klaviyo") {
          setKlaviyoApiKey(mockFields.klaviyo_api_key);
          setKlaviyoListId(mockFields.klaviyo_list_id);
        } else if (platformId === "meta") {
          setMetaAccountId(mockFields.meta_account_id);
          setMetaPixelId(mockFields.meta_pixel_id);
        }
      }

      const statusKey = (platformId === "wordpress" || platformId === "tiendanube") ? "shopify" : platformId;
      await updateConnectionStatus(statusKey, "ok", extraData);
      showToast(`¡Conexión con ${PLATFORMS.find(p => p.id === platformId)?.name} exitosa! ✓`, "success");
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      closeConfigModal();
    } catch (err: any) {
      showToast("Error al conectar: " + err.message, "error");
    } finally {
      setSimulatingOAuth(false);
      setOauthStep(0);
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

            {/* OAUTH SIMULATOR OVERLAY SCREEN */}
            {simulatingOAuth ? (
              <div className="py-10 text-center space-y-6 flex flex-col items-center">
                {oauthStep === 1 && (
                  <>
                    <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                    <div>
                      <p className="text-[15px] font-bold text-zinc-800 dark:text-white">Redirigiendo a {selectedPlatform.name}...</p>
                      <p className="text-[12px] text-zinc-400 mt-1">Estableciendo canal seguro con el proveedor oauth...</p>
                    </div>
                  </>
                )}
                {oauthStep === 2 && (
                  <>
                    <div className="relative">
                      <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/40 rounded-full flex items-center justify-center animate-ping absolute inset-0 opacity-50" />
                      <div className="w-12 h-12 bg-violet-500 text-white rounded-full flex items-center justify-center relative shadow-md">
                        <Zap className="w-5 h-5" />
                      </div>
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-zinc-800 dark:text-white">Autorizando acceso de Algoritmia...</p>
                      <p className="text-[12px] text-zinc-400 mt-1">Vinculando perfiles y otorgando permisos de lectura...</p>
                    </div>
                  </>
                )}
                {oauthStep === 3 && (
                  <>
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950 text-emerald-500 dark:text-emerald-400 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                      <Check className="w-6 h-6 stroke-[3]" />
                    </div>
                    <div>
                      <p className="text-[16px] font-black text-emerald-600 dark:text-emerald-400">¡Conexión Completada!</p>
                      <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-1">La plataforma se vinculó con tu perfil de negocio.</p>
                    </div>
                  </>
                )}

                {/* Progress Visual Bar */}
                <div className="w-full max-w-[280px] h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-4">
                  <div
                    className="h-full bg-violet-500 transition-all duration-1000"
                    style={{ width: oauthStep === 1 ? "33%" : oauthStep === 2 ? "66%" : "100%" }}
                  />
                </div>
              </div>
            ) : (
              /* REAL/MANUAL CONFIGURATION FORM */
              <form onSubmit={handleSaveRealPlatform} className="space-y-5">
                
                {/* SHOPIFY FORM */}
                {selectedPlatform.id === "shopify" && (
                  <>
                    {/* AUTO VIEW */}
                    {!isManualMode && (
                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/5 dark:to-indigo-500/5 rounded-2xl border border-violet-500/20 dark:border-violet-500/10 text-[13px] leading-relaxed space-y-4">
                          <div className="flex gap-3">
                            <Zap className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Vinculación en un solo clic</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Instalá la App Oficial de <strong>C.A.R / Algoritmia</strong> en tu tienda Shopify. Sincronizaremos automáticamente tus productos, pedidos y catálogo sin necesidad de configurar claves.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Dominio de tu tienda (.myshopify.com)
                          </label>
                          <input
                            type="text"
                            className="apple-input"
                            placeholder="ej. mi-tienda.myshopify.com"
                            value={shopifyDomain}
                            onChange={e => setShopifyDomain(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => runSimulatedOAuth("shopify")}
                          disabled={savingSettings}
                          className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                        >
                          <Zap className="w-4 h-4 fill-current" />
                          <span>Instalar App Oficial Shopify</span>
                        </button>

                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={() => setIsManualMode(true)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors underline underline-offset-4"
                          >
                            Configuración avanzada con claves manuales
                          </button>
                        </div>
                      </div>
                    )}

                    {/* MANUAL VIEW */}
                    {isManualMode && (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Dominio de tu tienda (.myshopify.com)
                          </label>
                          <input
                            type="text"
                            className="apple-input"
                            placeholder="ej. mi-tienda.myshopify.com"
                            value={shopifyDomain}
                            onChange={e => setShopifyDomain(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Admin Access Token de Shopify
                          </label>
                          <input
                            type="password"
                            className="apple-input"
                            placeholder="shpat_..."
                            value={shopifyToken}
                            onChange={e => setShopifyToken(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>
                        
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-850 rounded-2xl border border-zinc-150 dark:border-zinc-800 text-[12px] text-zinc-500 dark:text-zinc-400 space-y-2 leading-relaxed">
                          <span className="font-extrabold text-zinc-700 dark:text-zinc-350 block flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-violet-500" /> ¿Cómo obtener estas claves?
                          </span>
                          <p>
                            Creá una App Personalizada en tu panel de Shopify (<strong>Configuración &gt; Apps y canales de venta &gt; Desarrollar apps</strong>).
                            Concedé permisos de lectura para pedidos (<code>read_orders</code>), clientes (<code>read_customers</code>) y productos (<code>read_products</code>), e instalá la app para obtener el token.
                          </p>
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

                {/* TIENDANUBE FORM */}
                {selectedPlatform.id === "tiendanube" && (
                  <>
                    {/* AUTO VIEW */}
                    {!isManualMode && (
                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/5 dark:to-indigo-500/5 rounded-2xl border border-violet-500/20 dark:border-violet-500/10 text-[13px] leading-relaxed space-y-4">
                          <div className="flex gap-3">
                            <Zap className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Instalación automática</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Hacé clic en el botón de abajo para instalar nuestra App Oficial en tu panel de Tiendanube. Se configurará todo de manera instantánea y segura.
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => runSimulatedOAuth("tiendanube")}
                          disabled={savingSettings}
                          className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                        >
                          <Zap className="w-4 h-4 fill-current" />
                          <span>Instalar App en Tiendanube</span>
                        </button>

                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={() => setIsManualMode(true)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors underline underline-offset-4"
                          >
                            Configuración avanzada con claves manuales
                          </button>
                        </div>
                      </div>
                    )}

                    {/* MANUAL VIEW */}
                    {isManualMode && (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Store ID de Tiendanube
                          </label>
                          <input
                            type="text"
                            className="apple-input"
                            placeholder="ej. 1298402"
                            value={tiendanubeStoreId}
                            onChange={e => setTiendanubeStoreId(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Access Token API
                          </label>
                          <input
                            type="password"
                            className="apple-input"
                            placeholder="ej. 9a7b5..."
                            value={tiendanubeToken}
                            onChange={e => setTiendanubeToken(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="p-4 bg-zinc-50 dark:bg-zinc-850 rounded-2xl border border-zinc-150 dark:border-zinc-800 text-[12px] text-zinc-500 dark:text-zinc-400 space-y-2 leading-relaxed">
                          <span className="font-extrabold text-zinc-700 dark:text-zinc-350 block flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-violet-500" /> ¿Cómo obtener estas claves?
                          </span>
                          <p>
                            Ingresá a tu consola de Tiendanube y copiá tu Store ID numérico.
                            Generá un token de desarrollador o asocia la aplicación para interactuar con la API REST de Tiendanube.
                          </p>
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

                {/* WOOCOMMERCE FORM */}
                {selectedPlatform.id === "wordpress" && (
                  <>
                    {/* AUTO VIEW */}
                    {!isManualMode && (
                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/5 dark:to-indigo-500/5 rounded-2xl border border-violet-500/20 dark:border-violet-500/10 text-[13px] leading-relaxed space-y-4">
                          <div className="flex gap-3">
                            <Zap className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Plugin Autoconectado</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Descargá nuestro plugin e instalalo en tu WordPress, o simplemente ingresá la URL de tu sitio web para vincularlo de forma automática.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            URL de tu sitio WordPress / WooCommerce
                          </label>
                          <input
                            type="url"
                            className="apple-input"
                            placeholder="https://mi-tienda.com"
                            value={wooUrl}
                            onChange={e => setWooUrl(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              showToast("Descargando car-woocommerce-sync.zip...", "success");
                            }}
                            disabled={savingSettings}
                            className="h-12 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 border border-zinc-200 dark:border-zinc-800 transition-all active:scale-[0.98]"
                          >
                            <span>Descargar Plugin ZIP</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => runSimulatedOAuth("wordpress")}
                            disabled={savingSettings}
                            className="h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                          >
                            <Zap className="w-4 h-4 fill-current" />
                            <span>Autoconectar</span>
                          </button>
                        </div>

                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={() => setIsManualMode(true)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors underline underline-offset-4"
                          >
                            Configuración avanzada con claves manuales
                          </button>
                        </div>
                      </div>
                    )}

                    {/* MANUAL VIEW */}
                    {isManualMode && (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            URL de tu sitio WordPress / WooCommerce
                          </label>
                          <input
                            type="url"
                            className="apple-input"
                            placeholder="https://mi-tienda.com"
                            value={wooUrl}
                            onChange={e => setWooUrl(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Consumer Key de WooCommerce
                          </label>
                          <input
                            type="text"
                            className="apple-input"
                            placeholder="ck_..."
                            value={wooConsumerKey}
                            onChange={e => setWooConsumerKey(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Consumer Secret de WooCommerce
                          </label>
                          <input
                            type="password"
                            className="apple-input"
                            placeholder="cs_..."
                            value={wooConsumerSecret}
                            onChange={e => setWooConsumerSecret(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="p-4 bg-zinc-50 dark:bg-zinc-850 rounded-2xl border border-zinc-150 dark:border-zinc-800 text-[12px] text-zinc-500 dark:text-zinc-400 space-y-2 leading-relaxed">
                          <span className="font-extrabold text-zinc-700 dark:text-zinc-350 block flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-violet-500" /> ¿Cómo obtener estas claves?
                          </span>
                          <p>
                            En el panel de WordPress ve a <strong>WooCommerce &gt; Ajustes &gt; Avanzado &gt; API REST</strong>.
                            Hacé clic en "Añadir clave", asigná un nombre descriptivo y permisos de <strong>Lectura/Escritura</strong>, y copiá las claves generadas.
                          </p>
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

                {/* META ADS (MANUAL + SIMULATION FAST VINCULATION) */}
                {selectedPlatform.id === "meta" && (
                  <>
                    {/* AUTO VIEW */}
                    {!isManualMode && (
                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/5 dark:to-indigo-500/5 rounded-2xl border border-violet-500/20 dark:border-violet-500/10 text-[13px] leading-relaxed space-y-4">
                          <div className="flex gap-3">
                            <Zap className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">Vinculación Directa con Facebook</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Conectá tu cuenta publicitaria de Meta Ads y tus píxeles iniciando sesión directamente con tu perfil de Facebook.
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => runSimulatedOAuth("meta")}
                          disabled={savingSettings}
                          className="w-full h-12 bg-[#1877f2] hover:bg-[#166fe5] text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                          <span>Vincular con Facebook</span>
                        </button>

                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={() => setIsManualMode(true)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors underline underline-offset-4"
                          >
                            Configuración avanzada manual
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

                {/* KLAVIYO FORM */}
                {selectedPlatform.id === "klaviyo" && (
                  <>
                    {/* AUTO VIEW */}
                    {!isManualMode && (
                      <div className="space-y-5">
                        <div className="p-5 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/5 dark:to-indigo-500/5 rounded-2xl border border-violet-500/20 dark:border-violet-500/10 text-[13px] leading-relaxed space-y-4">
                          <div className="flex gap-3">
                            <Zap className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200">OAuth de Klaviyo</span>
                              <p className="text-zinc-500 dark:text-zinc-400">
                                Autorizá el acceso de C.A.R / Algoritmia a tus campañas y flujos de Klaviyo directamente mediante inicio de sesión rápido.
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => runSimulatedOAuth("klaviyo")}
                          disabled={savingSettings}
                          className="w-full h-12 bg-black hover:bg-zinc-900 text-white font-extrabold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                        >
                          <Zap className="w-4 h-4 fill-current" />
                          <span>Conectar cuenta de Klaviyo</span>
                        </button>

                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={() => setIsManualMode(true)}
                            className="text-[12px] text-zinc-400 hover:text-violet-500 font-medium transition-colors underline underline-offset-4"
                          >
                            Configuración avanzada con claves manuales
                          </button>
                        </div>
                      </div>
                    )}

                    {/* MANUAL VIEW */}
                    {isManualMode && (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Klaviyo Private API Key
                          </label>
                          <input
                            type="password"
                            className="apple-input"
                            placeholder="pk_..."
                            value={klaviyoApiKey}
                            onChange={e => setKlaviyoApiKey(e.target.value)}
                            required
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                            Klaviyo Main List ID (Opcional)
                          </label>
                          <input
                            type="text"
                            className="apple-input"
                            placeholder="ej. XyZ123"
                            value={klaviyoListId}
                            onChange={e => setKlaviyoListId(e.target.value)}
                            disabled={savingSettings}
                          />
                        </div>

                        <div className="p-4 bg-zinc-50 dark:bg-zinc-850 rounded-2xl border border-zinc-150 dark:border-zinc-800 text-[12px] text-zinc-500 dark:text-zinc-400 space-y-2 leading-relaxed">
                          <span className="font-extrabold text-zinc-700 dark:text-zinc-350 block flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-violet-500" /> ¿Cómo obtener estas claves?
                          </span>
                          <p>
                            Ingresá a tu cuenta de Klaviyo y ve a <strong>Settings &gt; API Keys</strong>.
                            Creá una <strong>Private API Key</strong> con permisos de lectura (o Full Access) para metricas, listas y campañas.
                          </p>
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

                {/* FOOTER ACTIONS - Save / Disconnect / Close */}
                {!selectedPlatform.isSimulated && isManualMode && (
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
                          <span>Guardando y Probando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Guardar y Probar</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {!selectedPlatform.isSimulated && !isManualMode && (
                  <div className="pt-6 border-t border-zinc-100 dark:border-white/[0.04] flex items-center gap-3 justify-end">
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
                      className="px-5 h-10 rounded-xl text-[12.5px] font-bold border border-zinc-200 dark:border-zinc-800 text-zinc-550 dark:text-zinc-450 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-all"
                    >
                      Cerrar
                    </button>
                  </div>
                )}
                
                {/* Simulated oauth action bar (close or disconnect) */}
                {selectedPlatform.isSimulated && getPlatformStatus(selectedPlatform.id) === "ok" && (
                  <div className="pt-6 border-t border-zinc-100 dark:border-white/[0.04] flex justify-between">
                    <button
                      type="button"
                      onClick={() => handleDisconnect(selectedPlatform.id)}
                      disabled={savingSettings}
                      className="text-[12.5px] font-bold text-red-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Desconectar</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={closeConfigModal}
                      className="px-4 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[12.5px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-250 transition-all"
                    >
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
