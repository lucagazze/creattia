import React, { useState, useEffect } from "react";
import { supabase, supabaseAdmin } from "../services/supabase";
import { metaAds } from "../services/metaAds";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { useNavigate } from "react-router-dom";
import { ecommerce } from "../services/ecommerce";
import { klaviyo } from "../services/klaviyo";
import {
  UserPlus,
  Users,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  Shield,
  Building2,
  RefreshCw,
  Copy,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  AlertTriangle,
  Pencil,
  Globe,
  Mail,
  Facebook,
  MessageSquare,
  Sun,
  Moon,
  MonitorPlay,
  Star,
  KeyRound,
  Clock,
  Instagram,
  ShoppingBag,
  Save,
  Sparkles,
  Brain,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Circle,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useViewAs } from "../contexts/ViewAsContext";
import { db, ClientLink } from "../services/db";
import { usePresence } from "../contexts/PresenceContext";

interface BusinessAccount {
  id?: number;
  user_id: string | null;
  email: string;
  source: 'car_clients' | 'car_business_accounts';
  created_at: string;
}

interface ClientRow {
  id: string;
  user_id: string;
  business_name: string;
  industry?: string;
  plan?: string;
  active?: boolean;
  is_admin?: boolean;
  chatwoot_url?: string;
  chatwoot_token?: string;
  meta_account_id?: string;
  meta_pixel_id?: string;
  ig_business_id?: string;
  ig_username?: string;
  klaviyo_api_key?: string;
  klaviyo_list_id?: string;
  ecommerce_platform?: string;
  shopify_domain?: string;
  shopify_access_token?: string;
  tiendanube_store_id?: string;
  tiendanube_access_token?: string;
  wordpress_url?: string;
  woo_consumer_key?: string;
  woo_consumer_secret?: string;
  client_tags?: string[];
  last_login?: string;
  created_at: string;
  fb_page_id?: string;
  fb_page_name?: string;
  fb_page_access_token?: string;
  website_url?: string;
  brain_updated_at?: string;
  products_catalog?: string;
  catalog_synced_at?: string;
}

const SCAN_STEPS = [
  { id: 'web',    label: 'Rastreando sitio web',        detail: 'Explorando páginas, productos y contenido...' },
  { id: 'social', label: 'Leyendo Instagram y Facebook', detail: 'Analizando publicaciones, perfil y descripción...' },
  { id: 'ai',     label: 'Consolidando con IA',          detail: 'Generando descripción, tono, ofertas y FAQs...' },
  { id: 'save',   label: 'Guardando en el Cerebro',      detail: 'Actualizando memoria web y secciones...' },
];

const CLIENT_TAGS = [
  { id: 'tienda_online', label: 'Tienda Online (E-commerce)', color: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400', desc: 'Sincroniza y monitorea datos de ventas y conversión' },
  { id: 'lead_gen', label: 'Clientes Potenciales (Leads)', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400', desc: 'Seguimiento de conversiones y captación de prospectos' },
  { id: 'whatsapp', label: 'Conversaciones (WhatsApp)', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400', desc: 'Atención a clientes y embudo por canales de mensajería' },
];

const blank = () => ({
  email: "",
  password: genPwd(),
  business_name: "",
  industry: "Dermocosmética",
  plan: "CAR Growth",
  website_url: "",
});

function genPwd() {
  const c =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
  return Array.from(
    { length: 14 },
    () => c[Math.floor(Math.random() * c.length)],
  ).join("");
}

const PLANS = ["CAR Growth", "CAR Full"];
const INDUSTRIES = [
  "Dermocosmética",
  "Nutrición Deportiva",
  "Mascotas",
  "Moda y Accesorios",
  "Hogar y Deco",
  "Salud y Bienestar",
  "Otro",
];

const toAuthEmail = (input: string) => {
  const clean = input.trim().toLowerCase();
  return clean.includes('@') ? clean : `${clean}@car.algoritmia.com`;
};

const inputCls =
  "w-full h-10 rounded-[9px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3.5 text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all";
const labelCls =
  "text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 mb-1.5 block";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function SectionBox({
  title,
  badge,
  children,
  status,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  status?: "ok" | "error" | null;
}) {
  return (
    <div className="rounded-[12px] border border-zinc-100 dark:border-zinc-700/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-700/60">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-zinc-500 dark:text-zinc-400">
          {title}
        </span>
        {badge && (
          <span className="text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-full font-medium">
            {badge}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {status === "ok" && (
            <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold uppercase">
              <Check className="w-3 h-3" /> Conectado
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-1 text-red-500 text-[10px] font-bold uppercase">
              <X className="w-3 h-3" /> Error
            </div>
          )}
        </div>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

// ── Connection verification persistence ───────────────────────────────────────
const CONN_KEY = (clientId: string, type: string) => `conn_v_${clientId}_${type}`;
const CONN_TTL = 7 * 24 * 3600 * 1000; // 7 days

// Badge component: green=verified, amber=configured-unverified, grey=not configured
// tick prop forces re-render when connection status changes
const ConnBadge = ({ hasValue, clientId, connectionStatuses, type, label, children, tick: _tick }: {
  hasValue: boolean; clientId: string; connectionStatuses?: any; type: string; label: string; children: React.ReactNode; tick?: number;
}) => {
  if (!hasValue) {
    return (
      <span title={`${label}: no configurado`}
        className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
        {children}
      </span>
    );
  }
  const verified = connectionStatuses?.[type] === 'ok' || (() => {
    try {
      const ts = localStorage.getItem(`conn_v_${clientId}_${type}`);
      if (ts && Date.now() - Number(ts) < 7 * 24 * 3600 * 1000) return true;
    } catch {}
    return false;
  })();
  return (
    <span title={`${label}: ${verified ? '✓ Verificado' : 'Configurado (sin verificar)'}`}
      className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black relative ${
        verified
          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-400/30'
          : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
      }`}>
      {children}
      {verified && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-zinc-900" />}
    </span>
  );
};

export default function AdminPage() {
  const { profile, session } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { viewAsProfile, setViewAsProfile } = useViewAs();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connTick, setConnTick] = useState(0); // increments on every conn verification → forces badge re-render
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [metaAccounts, setMetaAccounts] = useState<any[]>([]);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingShopify, setTestingShopify] = useState(false);
  const [testingWoo, setTestingWoo] = useState(false);
  const [testingTiendanube, setTestingTiendanube] = useState(false);
  const [testingKlaviyo, setTestingKlaviyo] = useState(false);
  const [testingMeta, setTestingMeta] = useState(false);
  const [testingChatwoot, setTestingChatwoot] = useState(false);
  const [testingIg, setTestingIg] = useState(false);
  const [discoveredIgAccounts, setDiscoveredIgAccounts] = useState<any[]>([]);
  const [loadingIgAccounts, setLoadingIgAccounts] = useState(false);
  const [discoveredFbPages, setDiscoveredFbPages] = useState<any[]>([]);
  const [loadingFbPages, setLoadingFbPages] = useState(false);
  const [testingFbPage, setTestingFbPage] = useState(false);
  // Client Facebook connection modal (admin connects on behalf of client)
  const [clientPagesModal, setClientPagesModal] = useState<{ pages: any[]; clientId: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "integrations" | "users" | "links">("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [catalogSyncResult, setCatalogSyncResult] = useState<{ count: number; source: string; synced_at: string } | null>(null);

  // Custom links state
  const [clientLinks, setClientLinks] = useState<ClientLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [linksToDelete, setLinksToDelete] = useState<number[]>([]);

  // Business accounts state
  const [businessAccounts, setBusinessAccounts] = useState<BusinessAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccPwd, setNewAccPwd] = useState(() => genPwd());
  const [showNewAccPwd, setShowNewAccPwd] = useState(false);
  const [newAccGoogleOnly, setNewAccGoogleOnly] = useState(true);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [deletingAccountKey, setDeletingAccountKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [changingPwdFor, setChangingPwdFor] = useState<string | null>(null);
  const [changingPwd, setChangingPwd] = useState('');
  const [showChangingPwd, setShowChangingPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // IA Scan Modal state
  const [iaModalClient, setIaModalClient] = useState<ClientRow | null>(null);
  const [iaModalUrl, setIaModalUrl] = useState("");
  const [iaScanning, setIaScanning] = useState(false);
  const [iaCurrentStep, setIaCurrentStep] = useState(0);
  const [iaDone, setIaDone] = useState(false);
  const [iaError, setIaError] = useState("");
  const [iaLog, setIaLog] = useState<string[]>([]);

  const openIaModal = (client: ClientRow, customUrl?: string) => {
    setIaModalClient(client);
    setIaModalUrl(customUrl || client.website_url || "");
    setIaScanning(false);
    setIaCurrentStep(0);
    setIaDone(false);
    setIaError("");
    setIaLog([]);
  };

  const handleRunIaScan = async () => {
    if (!iaModalClient || !iaModalUrl.trim()) {
      showToast('Ingresá una URL válida antes de escanear.', 'warning');
      return;
    }
    setIaScanning(true);
    setIaCurrentStep(0);
    setIaDone(false);
    setIaError('');
    setIaLog([]);

    const addLog = (msg: string) => setIaLog(prev => [...prev, msg]);

    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';

      addLog(`Guardando URL: ${iaModalUrl}...`);
      const { error: urlErr } = await supabase
        .from("car_clients")
        .update({ website_url: iaModalUrl })
        .eq("id", iaModalClient.id);
      if (urlErr) throw urlErr;
      addLog(`✓ URL guardada con éxito`);

      // ── STEP 1: Scan website ──────────────────────────────────────────
      setIaCurrentStep(0);
      addLog(`Abriendo ${iaModalUrl}...`);

      const webRes = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: iaModalClient.id, url: iaModalUrl, action: 'scrape-website' })
      });
      const webData = await webRes.json();
      if (!webRes.ok) throw new Error(webData.error || 'Error escaneando sitio web');

      addLog(`✓ Página de inicio leída`);
      if (webData.pages_visited?.length) {
        webData.pages_visited.forEach((p: string) => {
          try { addLog(`  → ${new URL(p).pathname}`); } catch { addLog(`  → ${p}`); }
        });
        addLog(`✓ ${webData.pages_visited.length} subpáginas escaneadas`);
      }
      const webLen = (webData.scraped_content || '').length;
      addLog(`✓ ${webLen.toLocaleString()} caracteres extraídos`);

      // ── STEP 2: Social media ──────────────────────────────────────────
      setIaCurrentStep(1);
      addLog(`Buscando publicaciones de Instagram y Facebook...`);

      const socialRes = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: iaModalClient.id, url: iaModalUrl, action: 'sync-instagram' })
      });
      const socialData = await socialRes.json();
      const socialContent: string = socialData.instagram_context || '';
      if (socialContent && socialContent !== 'Redes sociales no vinculadas.') {
        addLog(`✓ Publicaciones procesadas`);
      } else {
        addLog(`  ℹ Redes sociales no vinculadas (opcional)`);
      }

      // ── STEP 3: Generate fields with AI ──────────────────────────────
      setIaCurrentStep(2);
      addLog(`Analizando con IA...`);
      addLog(`  → Extrayendo descripción del negocio`);
      addLog(`  → Detectando tono y estilo`);
      addLog(`  → Buscando ofertas activas`);
      addLog(`  → Extrayendo preguntas frecuentes`);

      const fieldsRes = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: iaModalClient.id, action: 'generate-fields' })
      });
      const fieldsData = await fieldsRes.json();
      if (!fieldsRes.ok) throw new Error(fieldsData.error || 'Error generando campos de IA');

      if (fieldsData.business_description) addLog(`✓ Descripción generada`);
      if (fieldsData.tone) addLog(`✓ Tono y estilo definido`);
      if (fieldsData.offers) addLog(`✓ Ofertas detectadas`);
      else addLog(`  ℹ Sin ofertas activas detectadas`);
      if (fieldsData.faq) {
        const faqCount = (fieldsData.faq.match(/^P:/gm) || []).length;
        addLog(`✓ ${faqCount} preguntas frecuentes extraídas`);
      }

      // ── STEP 4: Done ──────────────────────────────────────────────────
      setIaCurrentStep(3);
      addLog(`✓ Todo guardado en el Cerebro de IA`);
      setIaDone(true);
      showToast('Cerebro IA entrenado y guardado correctamente.', 'success');
      load();
    } catch (err: any) {
      setIaError(err.message || 'Error al escanear');
      addLog(`❌ Error: ${err.message || 'Error al escanear'}`);
    } finally {
      setIaScanning(false);
    }
  };

  const saveConnOk = async (clientId: string, type: string) => {
    try { localStorage.setItem(CONN_KEY(clientId, type), String(Date.now())); } catch {}
    
    // Update local clients state immediately
    setClients(prev => prev.map(c => {
      if (c.id === clientId) {
        const current = (c as any).connection_statuses || {};
        return { ...c, connection_statuses: { ...current, [type]: 'ok' } };
      }
      return c;
    }));
    if (editingClient && editingClient.id === clientId) {
      setEditingClient((prev: any) => {
        if (!prev) return null;
        const current = prev.connection_statuses || {};
        return { ...prev, connection_statuses: { ...current, [type]: 'ok' } };
      });
    }

    try {
      const { data } = await supabase
        .from('car_clients')
        .select('connection_statuses')
        .eq('id', clientId)
        .maybeSingle();
      const current = data?.connection_statuses || {};
      await supabase
        .from('car_clients')
        .update({ connection_statuses: { ...current, [type]: 'ok' } })
        .eq('id', clientId);
    } catch (e) {
      console.error('Error saving connection ok status:', e);
    }
  };

  const saveConnErr = async (clientId: string, type: string) => {
    try { localStorage.removeItem(CONN_KEY(clientId, type)); } catch {}

    // Update local clients state immediately
    setClients(prev => prev.map(c => {
      if (c.id === clientId) {
        const current = (c as any).connection_statuses || {};
        return { ...c, connection_statuses: { ...current, [type]: 'error' } };
      }
      return c;
    }));
    if (editingClient && editingClient.id === clientId) {
      setEditingClient((prev: any) => {
        if (!prev) return null;
        const current = prev.connection_statuses || {};
        return { ...prev, connection_statuses: { ...current, [type]: 'error' } };
      });
    }

    try {
      const { data } = await supabase
        .from('car_clients')
        .select('connection_statuses')
        .eq('id', clientId)
        .maybeSingle();
      const current = data?.connection_statuses || {};
      await supabase
        .from('car_clients')
        .update({ connection_statuses: { ...current, [type]: 'error' } })
        .eq('id', clientId);
    } catch (e) {
      console.error('Error saving connection error status:', e);
    }
  };

  const [unlinkedUsers, setUnlinkedUsers] = useState<any[]>([]);
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [associatingUser, setAssociatingUser] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  // Estados de conexión persistentes (locales al formulario por ahora)
  const [statuses, setStatuses] = useState<
    Record<string, "ok" | "error" | null>
  >({});

  const loadDiscoveredIgAccounts = async (quiet = true) => {
    setLoadingIgAccounts(true);
    try {
      const res = await metaAds.getDiscoverableInstagramAccounts();
      setDiscoveredIgAccounts(res?.data || []);
      if (!quiet) showToast("¡Cuentas de Instagram sincronizadas! ✓", "success");
    } catch (err: any) {
      if (!quiet) {
        showToast("Error al sincronizar Instagram: " + (err.message || "token inválido"), "error");
      }
    } finally {
      setLoadingIgAccounts(false);
    }
  };

  const loadDiscoveredFbPages = async (quiet = true) => {
    setLoadingFbPages(true);
    try {
      const res = await metaAds.getDiscoverableFacebookPages();
      setDiscoveredFbPages(res?.data || []);
      if (!quiet) showToast("¡Páginas de Facebook sincronizadas! ✓", "success");
    } catch (err: any) {
      if (!quiet) {
        showToast("Error al sincronizar Facebook: " + (err.message || "token inválido"), "error");
      }
    } finally {
      setLoadingFbPages(false);
    }
  };

  useEffect(() => {
    metaAds
      .getAllAdAccounts()
      .then((res) => setMetaAccounts(res?.data || []))
      .catch(() => {});

    loadDiscoveredIgAccounts(true);
    loadDiscoveredFbPages(true);
  }, []);

  // Handle Facebook Login Redirect Callback (Hash Parameters)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.replace("#", "?"));
      const accessToken = params.get("access_token");
      if (accessToken) {
        // Clear hash immediately
        window.history.replaceState(null, "", window.location.pathname + window.location.search);

        const pendingClientId = localStorage.getItem('fb_pending_client_id');

        if (pendingClientId) {
          // ── CLIENT connection flow ──────────────────────────────────────────
          // Admin connected on behalf of a client. Fetch accessible pages and
          // show a picker so admin can select the client's page.
          localStorage.removeItem('fb_pending_client_id');
          fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}&limit=100&fields=id,name,access_token,instagram_business_account{id,username,name}`)
            .then(r => r.json())
            .then(data => {
              if (data.error) throw new Error(data.error.message);
              const pages = (data.data || []).map((p: any) => ({ ...p, _userToken: accessToken }));
              setClientPagesModal({ pages, clientId: pendingClientId });
            })
            .catch(err => showToast('Error al cargar páginas de Facebook: ' + err.message, 'error'));
        } else {
          // ── AGENCY connection flow (existing behavior) ──────────────────────
          const saveToken = async () => {
            setSavingConfig(true);
            try {
              const { error } = await supabase
                .from("AgencySettings")
                .upsert({ key: "meta_ads_token", value: accessToken }, { onConflict: "key" });
              if (error) {
                showToast("Error al guardar el token de Facebook: " + error.message, "error");
              } else {
                localStorage.setItem("meta_ads_token", accessToken);
                showToast("¡Cuenta de Facebook de Agencia vinculada! ✓", "success");
                loadDiscoveredIgAccounts(true);
                loadDiscoveredFbPages(true);
              }
            } catch (err: any) {
              showToast("Error inesperado: " + (err.message || String(err)), "error");
            } finally {
              setSavingConfig(false);
            }
          };
          saveToken();
        }
      }
    }
  }, []);

  const handleMetaLogin = () => {
    const appId = '1248660836711922'; // The Meta App ID
    const redirectUri = window.location.origin + window.location.pathname;
    const scopes = [
      'read_insights',
      'publish_video',
      'catalog_management',
      'pages_show_list',
      'ads_management',
      'ads_read',
      'business_management',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_comments',
      'instagram_manage_insights',
      'instagram_content_publish',
      'leads_retrieval',
      'whatsapp_business_management',
      'instagram_manage_messages',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_read_user_content',
      'pages_manage_ads',
      'pages_manage_posts',
      'pages_manage_engagement'
    ].join(',');

    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=token`;
    window.location.href = oauthUrl;
  };

  // Connect Facebook on behalf of a specific client (admin flow)
  const handleConnectFacebookForClient = () => {
    if (!editingClient) return;
    try {
      localStorage.setItem('fb_pending_client_id', editingClient.id);
    } catch (e) {
      console.warn("Storage full: could not save fb_pending_client_id", e);
    }
    handleMetaLogin(); // Same OAuth flow, but the redirect handler checks fb_pending_client_id
  };

  // Save the selected page as the client's connected Facebook page
  const handleSaveClientPage = async (page: any, clientId: string) => {
    try {
      const igId = page.instagram_business_account?.id || null;
      const igUsername = page.instagram_business_account?.username || null;
      const updateData: any = {
        fb_page_id: page.id,
        fb_page_name: page.name,
        fb_page_access_token: page.access_token,
      };
      if (igId) { updateData.ig_business_id = igId; updateData.ig_username = igUsername; }

      const { error } = await supabase.from('car_clients').update(updateData).eq('id', clientId);
      if (error) throw error;

      metaAds.setClientPageToken(page.id, page.access_token);
      setClientPagesModal(null);
      showToast(`✅ "${page.name}" vinculada al cliente`, 'success');
      load();
      // Update the open edit panel if we're editing this client
      if (editingClient?.id === clientId) {
        setEditForm((p: any) => ({
          ...p,
          fb_page_id: page.id,
          fb_page_name: page.name,
          fb_page_access_token: page.access_token,
          ...(igId ? { ig_business_id: igId, ig_username: igUsername } : {}),
        }));
        setEditingClient((prev: any) => prev ? ({ ...prev, ...updateData }) : null);
      }
    } catch (err: any) {
      showToast('Error al guardar: ' + err.message, 'error');
    }
  };

  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (profile && !profile.is_admin) navigate("/", { replace: true });
  }, [profile, navigate]);

  const loadUnlinkedUsers = async () => {
    if (!supabaseAdmin) return;
    setLoadingUnlinked(true);
    try {
      const [allAuthRes, clientsRes, assocRes] = await Promise.all([
        supabaseAdmin.auth.admin.listUsers(),
        supabase.from('car_clients').select('user_id, business_name'),
        supabase.from('car_business_accounts').select('user_id, email, business_id')
      ]);

      if (allAuthRes.error) throw allAuthRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (assocRes.error) throw assocRes.error;

      const authUsers = allAuthRes.data.users || [];
      const clientsData = clientsRes.data || [];
      const assocData = assocRes.data || [];

      // Find users not mapped in car_clients or car_business_accounts
      const unlinked = authUsers.filter((u: any) => {
        const isOwner = clientsData.some((c: any) => c.user_id === u.id);
        const isAssoc = assocData.some((a: any) => a.user_id === u.id);
        return !isOwner && !isAssoc;
      });

      setUnlinkedUsers(unlinked);
    } catch (err: any) {
      console.error("Error loading unlinked users:", err);
    } finally {
      setLoadingUnlinked(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("car_clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) showToast("Error: " + error.message, "error");
    else setClients(data ?? []);
    
    if (supabaseAdmin) {
      await loadUnlinkedUsers();
    }
    setLoading(false);
  };

  const handleAssociateUser = async (userId: string, email: string, clientId: string) => {
    if (!supabaseAdmin) return;
    setAssociatingUser(userId);
    try {
      const { error } = await supabase.from('car_business_accounts').insert({
        business_id: clientId,
        user_id: userId,
        email: email
      });
      if (error) throw error;
      showToast('Usuario asociado con éxito ✓', 'success');
      load(); // Reload to refresh unlinked list and clients
    } catch (err: any) {
      showToast('Error al asociar: ' + err.message, 'error');
    } finally {
      setAssociatingUser(null);
    }
  };

  const handleDeleteUnlinkedUser = async (userId: string) => {
    if (!supabaseAdmin) return;
    if (!window.confirm('¿Estás seguro de que deseas eliminar este usuario de la autenticación?')) return;
    setDeletingUser(userId);
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
      showToast('Usuario eliminado con éxito ✓', 'success');
      load(); // Reload to refresh unlinked list
    } catch (err: any) {
      showToast('Error al eliminar: ' + err.message, 'error');
    } finally {
      setDeletingUser(null);
    }
  };

  useEffect(() => {
    load();
    
    // Subscribe to changes in car_clients for live updates (last_login, etc)
    const channel = supabase
      .channel('car_clients_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'car_clients' }, (payload: any) => {
        if (payload.eventType === 'UPDATE') {
          setClients(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
        } else if (payload.eventType === 'INSERT') {
          setClients(prev => {
            if (prev.some(c => c.id === payload.new.id)) return prev;
            return [...prev, payload.new].sort((a, b) => (a.business_name || '').localeCompare(b.business_name || ''));
          });
        } else if (payload.eventType === 'DELETE') {
          setClients(prev => prev.filter(c => c.id === payload.old.id));
        } else {
          load();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (editingClient && activeTab === "users") {
      loadAccounts(editingClient.id, editingClient.user_id ?? null);
    }
  }, [editingClient?.id, activeTab]);

  const copy = (t: string, l: string) => {
    navigator.clipboard.writeText(t);
    showToast(l + " copiado ✓", "success");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseAdmin) {
      showToast("Falta VITE_SUPABASE_SERVICE_ROLE_KEY en el .env", "error");
      return;
    }
    setCreating(true);
    try {
      const { data: auth, error: authErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: toAuthEmail(form.email),
          password: form.password,
          email_confirm: true,
        });
      if (authErr) throw authErr;

      const { error: dbErr } = await supabase.from("car_clients").insert({
        user_id: auth.user.id,
        business_name: form.business_name,
        industry: form.industry || null,
        plan: form.plan,
        website_url: form.website_url || null,
        active: true,
        is_admin: false,
      });
      if (dbErr) throw dbErr;

      showToast(`✅ "${form.business_name}" creado`, "success");
      setShowForm(false);
      setForm(blank());
      load();
    } catch (err: any) {
      showToast("Error: " + err.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (c: ClientRow) => {
    const { error } = await supabase
      .from("car_clients")
      .update({ active: !c.active })
      .eq("id", c.id);
    if (error) showToast("Error: " + error.message, "error");
    else {
      showToast((!c.active ? "Activado" : "Desactivado") + " ✓", "success");
      load();
    }
  };

  const loadAccounts = async (clientId: string, mainUserId: string | null) => {
    setLoadingAccounts(true);
    const accounts: BusinessAccount[] = [];
    if (mainUserId && supabaseAdmin) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(mainUserId);
      if (data?.user) {
        accounts.push({
          user_id: data.user.id,
          email: data.user.email ?? '',
          source: 'car_clients',
          created_at: data.user.created_at,
        });
      }
    }
    const { data: assoc } = await supabase
      .from('car_business_accounts')
      .select('*')
      .eq('business_id', clientId)
      .order('created_at', { ascending: true });
    for (const acc of assoc ?? []) {
      accounts.push({ id: acc.id, user_id: acc.user_id, email: acc.email, source: 'car_business_accounts', created_at: acc.created_at });
    }
    setBusinessAccounts(accounts);
    setLoadingAccounts(false);
  };

  const handleCreateAccount = async (clientId: string, mainUserId: string | null) => {
    if (!newAccEmail || !supabaseAdmin) return;
    setCreatingAccount(true);
    try {
      const authEmail = toAuthEmail(newAccEmail);

      if (newAccGoogleOnly) {
        // Pre-invitation: insert into car_business_accounts with user_id = null
        // When the user signs in with Google OAuth for the first time, the system
        // automatically links their user_id via the email fallback in db.profile.getByUserId
        const { error: dbErr } = await supabase.from('car_business_accounts').insert({
          business_id: clientId,
          user_id: null,
          email: authEmail,
        });
        if (dbErr) throw dbErr;
        showToast('Invitación Google registrada ✓', 'success');
      } else {
        const { data: auth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password: newAccPwd,
          email_confirm: true,
        });
        if (authErr) throw authErr;
        const { error: dbErr } = await supabase.from('car_business_accounts').insert({
          business_id: clientId,
          user_id: auth.user.id,
          email: authEmail,
        });
        if (dbErr) throw dbErr;
        showToast('Cuenta creada ✓', 'success');
      }

      setNewAccEmail('');
      setNewAccPwd(genPwd());
      loadAccounts(clientId, mainUserId);
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleDeleteAccount = async (acc: BusinessAccount, clientId: string, mainUserId: string | null) => {
    if (!supabaseAdmin) return;
    const accKey = acc.user_id ?? acc.email;
    setDeletingAccountKey(accKey);
    try {
      if (acc.source === 'car_clients') {
        const { error } = await supabase.from('car_clients').update({ user_id: null }).eq('id', clientId);
        if (error) throw error;
        load();
      } else {
        const { error } = await supabase.from('car_business_accounts').delete().eq('id', acc.id!);
        if (error) throw error;
      }
      // Only delete from auth if the user has actually signed up (user_id is set)
      if (acc.user_id) {
        await supabaseAdmin.auth.admin.deleteUser(acc.user_id);
      }
      setBusinessAccounts((p) => p.filter((a) => (a.user_id ?? a.email) !== accKey));
      setConfirmDeleteKey(null);
      showToast('Cuenta eliminada ✓', 'success');
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setDeletingAccountKey(null);
    }
  };

  const handleChangePwd = async (userId: string) => {
    if (!changingPwd || !supabaseAdmin) return;
    setSavingPwd(true);
    try {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: changingPwd });
      if (error) throw error;
      showToast('Contraseña actualizada ✓', 'success');
      setChangingPwdFor(null);
      setChangingPwd('');
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const openEdit = async (c: ClientRow) => {
    if (c.fb_page_id) {
      try {
        localStorage.setItem('active_fb_page_id', c.fb_page_id);
      } catch (e) {
        console.warn("Storage full: could not save active_fb_page_id", e);
      }
      if ((c as any).fb_page_access_token) {
        metaAds.setClientPageToken(c.fb_page_id, (c as any).fb_page_access_token);
      }
    } else {
      localStorage.removeItem('active_fb_page_id');
    }

    setActiveTab("general");
    setEditForm({
      business_name: c.business_name || "",
      industry: c.industry || "",
      plan: c.plan || "",
      active: c.active,
      meta_account_id: c.meta_account_id || "",
      ig_business_id: c.ig_business_id || "",
      ig_username: c.ig_username || "",
      klaviyo_api_key: c.klaviyo_api_key || "",
      chatwoot_url: c.chatwoot_url || "",
      chatwoot_token: c.chatwoot_token || "",
      ecommerce_platform: c.ecommerce_platform || "",
      shopify_domain: c.shopify_domain || "",
      shopify_access_token: c.shopify_access_token || "",
      tiendanube_store_id: c.tiendanube_store_id || "",
      tiendanube_access_token: c.tiendanube_access_token || "",
      wordpress_url: c.wordpress_url || "",
      woo_consumer_key: c.woo_consumer_key || "",
      woo_consumer_secret: c.woo_consumer_secret || "",
      client_tags: c.client_tags || [],
      new_password: "",
      fb_page_id: c.fb_page_id || "",
      fb_page_name: c.fb_page_name || "",
      fb_page_access_token: (c as any).fb_page_access_token || "",
      website_url: c.website_url || "",
    });
    setStatuses({});
    setEditingClient(c);
    setLinksToDelete([]);
    setLoadingLinks(true);
    const links = await db.links.getByClientId(c.id).catch(() => []);
    setClientLinks(links);
    setLoadingLinks(false);
  };

  const closeEdit = () => {
    setEditingClient(null);
    localStorage.removeItem('active_fb_page_id');
  };

  const handleRemoveLink = (idx: number, link: ClientLink) => {
    if (link.id) setLinksToDelete((p) => [...p, link.id]);
    setClientLinks((p) => p.filter((_, i) => i !== idx));
  };

  const handleAddLink = () => {
    setClientLinks((p) => [
      ...p,
      {
        client_id: editingClient!.id,
        label: "",
        url: "",
        sort_order: p.length,
      } as any,
    ]);
  };

  const ef = (k: string, v: any) =>
    setEditForm((p: any) => ({ ...p, [k]: v }));

  const testShopify = async () => {
    if (!editForm.shopify_domain || !editForm.shopify_access_token) {
      showToast("Ingresá el dominio y el token para probar", "warning");
      return;
    }
    setTestingShopify(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await ecommerce.getShopifyOrders(
        editForm.shopify_domain,
        editForm.shopify_access_token,
        today,
        today,
      );
      showToast("¡Conexión con Shopify Exitosa! ✓", "success");
      if (editingClient) saveConnOk(editingClient.id, 'shopify');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, shopify: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Shopify: " + (err.message || "Verificá los datos"),
        "error",
      );
      if (editingClient) saveConnErr(editingClient.id, 'shopify');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, shopify: "error" }));
    } finally {
      setTestingShopify(false);
    }
  };

  const testWoo = async () => {
    if (!editForm.wordpress_url || !editForm.woo_consumer_key || !editForm.woo_consumer_secret) {
      showToast("Ingresá la URL, Consumer Key y Consumer Secret", "warning");
      return;
    }
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const token = freshSession?.access_token || '';

    setTestingWoo(true);
    try {
      const res = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: editingClient?.id || '',
          type: 'products',
          platform: 'wordpress',
          wordpress_url: editForm.wordpress_url,
          woo_consumer_key: editForm.woo_consumer_key,
          woo_consumer_secret: editForm.woo_consumer_secret
        })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.products) {
        throw new Error("No se pudo conectar con WooCommerce.");
      }
      showToast('¡Conexión con WooCommerce exitosa! ✓', 'success');
      if (editingClient) saveConnOk(editingClient.id, 'shopify');
      setConnTick(t => t + 1);
      setStatuses((p) => ({ ...p, shopify: 'ok' }));
    } catch (err: any) {
      showToast('Error WooCommerce: ' + (err.message || 'Verificá los datos'), 'error');
      if (editingClient) saveConnErr(editingClient.id, 'shopify');
      setConnTick(t => t + 1);
      setStatuses((p) => ({ ...p, shopify: 'error' }));
    } finally {
      setTestingWoo(false);
    }
  };

  const testTiendanube = async () => {
    if (!editForm.tiendanube_store_id || !editForm.tiendanube_access_token) {
      showToast("Ingresá el Store ID y el Access Token de Tiendanube", "warning");
      return;
    }
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const token = freshSession?.access_token || '';

    setTestingTiendanube(true);
    try {
      const res = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: editingClient?.id || '',
          type: 'products',
          platform: 'tiendanube',
          tiendanube_store_id: editForm.tiendanube_store_id,
          tiendanube_access_token: editForm.tiendanube_access_token
        })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.products) {
        throw new Error("No se pudo conectar con Tiendanube.");
      }
      showToast('¡Conexión con Tiendanube exitosa! ✓', 'success');
      if (editingClient) saveConnOk(editingClient.id, 'shopify');
      setConnTick(t => t + 1);
      setStatuses((p) => ({ ...p, shopify: 'ok' }));
    } catch (err: any) {
      showToast('Error Tiendanube: ' + (err.message || 'Verificá los datos'), 'error');
      if (editingClient) saveConnErr(editingClient.id, 'shopify');
      setConnTick(t => t + 1);
      setStatuses((p) => ({ ...p, shopify: 'error' }));
    } finally {
      setTestingTiendanube(false);
    }
  };

  const testKlaviyo = async () => {
    if (!editForm.klaviyo_api_key) {
      showToast("Ingresá la API Key de Klaviyo para probar", "warning");
      return;
    }
    setTestingKlaviyo(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await klaviyo.getDashboardData(
        editForm.klaviyo_api_key,
        today,
        today,
      );
      if (!res)
        throw new Error("No se pudo obtener datos (verificá la API Key)");
      showToast("¡Conexión con Klaviyo Exitosa! ✓", "success");
      if (editingClient) saveConnOk(editingClient.id, 'klaviyo');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, klaviyo: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Klaviyo: " + (err.message || "Verificá la API Key"),
        "error",
      );
      if (editingClient) saveConnErr(editingClient.id, 'klaviyo');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, klaviyo: "error" }));
    } finally {
      setTestingKlaviyo(false);
    }
  };

  const testMeta = async () => {
    if (!editForm.meta_account_id) {
      showToast("Seleccioná una cuenta de Meta para probar", "warning");
      return;
    }
    setTestingMeta(true);
    try {
      const res = await metaAds.getAccount(editForm.meta_account_id);
      if (!res || res.error)
        throw new Error("No se pudo obtener datos (verificá el Token General)");
      showToast("¡Conexión con Meta Exitosa! ✓", "success");
      if (editingClient) saveConnOk(editingClient.id, 'meta');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, meta: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Meta: " + (err.message || "Verificá la cuenta"),
        "error",
      );
      if (editingClient) saveConnErr(editingClient.id, 'meta');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, meta: "error" }));
    } finally {
      setTestingMeta(false);
    }
  };

  const syncCatalog = async () => {
    if (!editingClient?.id) return;
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const token = freshSession?.access_token || '';

    setSyncingCatalog(true);
    setCatalogSyncResult(null);
    try {
      const res = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: editingClient.id, action: 'sync-catalog' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al sincronizar');
      setCatalogSyncResult({ count: data.count, source: data.source, synced_at: data.synced_at });
      setEditingClient((prev: any) => prev ? { ...prev, catalog_synced_at: data.synced_at } : prev);
      showToast(`Catálogo sincronizado: ${data.count} productos · ${data.source}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al sincronizar catálogo', 'error');
    } finally {
      setSyncingCatalog(false);
    }
  };

  const testInstagram = async () => {
    if (!editForm.ig_business_id) {
      showToast("Ingresá o seleccioná un ID de Instagram para probar", "warning");
      return;
    }
    setTestingIg(true);
    try {
      const res = await metaAds.getInstagramProfile(editForm.ig_business_id);
      if (!res || res.error)
        throw new Error("No se pudo obtener el perfil (verificá el ID de Instagram y el Token General)");
      showToast(`¡Conexión con Instagram Exitosa! (@${res.username}) ✓`, "success");
      if (editingClient) saveConnOk(editingClient.id, 'instagram');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, instagram: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Instagram: " + (err.message || "Verificá la cuenta"),
        "error",
      );
      if (editingClient) saveConnErr(editingClient.id, 'instagram');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, instagram: "error" }));
    } finally {
      setTestingIg(false);
    }
  };

  const testFacebookPage = async () => {
    if (!editForm.fb_page_id) {
      showToast("Ingresá o seleccioná un ID de Página de Facebook para probar", "warning");
      return;
    }
    setTestingFbPage(true);
    try {
      // Temporarily cache the new token if provided, so the test uses it
      if (editForm.fb_page_access_token) {
        metaAds.setClientPageToken(editForm.fb_page_id, editForm.fb_page_access_token);
      }

      const res = await metaAds.getFacebookPageInfo(editForm.fb_page_id);
      if (!res || res.error)
        throw new Error("No se pudo obtener la Página (verificá el ID de la Página y el Token)");
      
      showToast(`¡Conexión con Facebook Exitosa! (${res.name}) ✓`, "success");
      if (editingClient) saveConnOk(editingClient.id, 'facebook');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, facebook: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Facebook: " + (err.message || "Verificá la cuenta"),
        "error",
      );
      if (editingClient) saveConnErr(editingClient.id, 'facebook');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, facebook: "error" }));
    } finally {
      setTestingFbPage(false);
    }
  };

  const handleSelectIgAccount = (id: string) => {
    const selected = discoveredIgAccounts.find(acc => acc.igId === id);
    if (selected) {
      setEditForm((p: any) => ({
        ...p,
        ig_business_id: selected.igId,
        ig_username: selected.username,
        fb_page_id: selected.pageId || p.fb_page_id || "",
        fb_page_name: selected.pageName || p.fb_page_name || ""
      }));
    } else {
      setEditForm((p: any) => ({
        ...p,
        ig_business_id: "",
        ig_username: "",
      }));
    }
  };

  const handleSelectFbPage = (id: string) => {
    const selected = discoveredFbPages.find(page => page.id === id);
    if (selected) {
      setEditForm((p: any) => ({
        ...p,
        fb_page_id: selected.id,
        fb_page_name: selected.name
      }));
    } else {
      setEditForm((p: any) => ({
        ...p,
        fb_page_id: "",
        fb_page_name: ""
      }));
    }
  };

  const testChatwoot = async () => {
    if (!editForm.chatwoot_url || !editForm.chatwoot_token) {
      showToast("Ingresá la URL y el Token de Chatwoot", "warning");
      return;
    }
    setTestingChatwoot(true);
    try {
      const res = await fetch(editForm.chatwoot_url, { mode: "no-cors" });
      showToast(
        "¡Dominio de Chatwoot alcanzado! ✓ (Validación parcial)",
        "success",
      );
      if (editingClient) saveConnOk(editingClient.id, 'chatwoot');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, chatwoot: "ok" }));
    } catch (err: any) {
      showToast("Error Chatwoot: El dominio no responde", "error");
      if (editingClient) saveConnErr(editingClient.id, 'chatwoot');
        setConnTick(t => t + 1);
setStatuses((p) => ({ ...p, chatwoot: "error" }));
    } finally {
      setTestingChatwoot(false);
    }
  };

  const saveConfig = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editingClient) return;
    setSavingConfig(true);

    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const token = freshSession?.access_token || '';

    // Auto-test all configured connections before saving
    const errors: string[] = [];
    const testResults: Record<string, 'ok' | 'error'> = {};

    if (editForm.shopify_domain && editForm.shopify_access_token) {
      try {
        const today = new Date().toISOString().split('T')[0];
        await ecommerce.getShopifyOrders(editForm.shopify_domain, editForm.shopify_access_token, today, today);
        testResults.shopify = 'ok';
        saveConnOk(editingClient.id, 'shopify');
      } catch { testResults.shopify = 'error'; saveConnErr(editingClient.id, 'shopify'); errors.push('Shopify'); }
    }
    if (editForm.ecommerce_platform === 'wordpress' && editForm.wordpress_url && editForm.woo_consumer_key && editForm.woo_consumer_secret) {
      try {
        const res = await fetch('/api/scrape-all', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            clientId: editingClient.id,
            type: 'products',
            platform: 'wordpress',
            wordpress_url: editForm.wordpress_url,
            woo_consumer_key: editForm.woo_consumer_key,
            woo_consumer_secret: editForm.woo_consumer_secret
          })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!data.products || data.products.length === 0) throw new Error();
        testResults.shopify = 'ok';
        saveConnOk(editingClient.id, 'shopify');
      } catch {
        testResults.shopify = 'error';
        saveConnErr(editingClient.id, 'shopify');
        errors.push('WooCommerce');
      }
    }
    if (editForm.ecommerce_platform === 'tiendanube' && editForm.tiendanube_store_id && editForm.tiendanube_access_token) {
      try {
        const res = await fetch('/api/scrape-all', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            clientId: editingClient.id,
            type: 'products',
            platform: 'tiendanube',
            tiendanube_store_id: editForm.tiendanube_store_id,
            tiendanube_access_token: editForm.tiendanube_access_token
          })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!data.products) throw new Error();
        testResults.shopify = 'ok';
        saveConnOk(editingClient.id, 'shopify');
      } catch {
        testResults.shopify = 'error';
        saveConnErr(editingClient.id, 'shopify');
        errors.push('Tiendanube');
      }
    }
    if (editForm.meta_account_id) {
      try {
        await metaAds.getAccount(editForm.meta_account_id);
        testResults.meta = 'ok'; saveConnOk(editingClient.id, 'meta');
      } catch { testResults.meta = 'error'; saveConnErr(editingClient.id, 'meta'); errors.push('Meta Ads'); }
    }
    if (editForm.fb_page_id) {
      try {
        if (editForm.fb_page_access_token) metaAds.setClientPageToken(editForm.fb_page_id, editForm.fb_page_access_token);
        const res = await metaAds.getFacebookPageInfo(editForm.fb_page_id);
        if (!res || res.error) throw new Error();
        testResults.facebook = 'ok'; saveConnOk(editingClient.id, 'facebook');
      } catch { testResults.facebook = 'error'; saveConnErr(editingClient.id, 'facebook'); errors.push('Facebook'); }
    }
    if (editForm.klaviyo_api_key) {
      try {
        const today = new Date().toISOString().split("T")[0];
        await klaviyo.getDashboardData(editForm.klaviyo_api_key, today, today);
        testResults.klaviyo = 'ok'; saveConnOk(editingClient.id, 'klaviyo');
      } catch { testResults.klaviyo = 'error'; saveConnErr(editingClient.id, 'klaviyo'); errors.push('Klaviyo'); }
    }
    if (editForm.chatwoot_url && editForm.chatwoot_token) {
      try {
        await fetch(editForm.chatwoot_url, { mode: 'no-cors' });
        testResults.chatwoot = 'ok'; saveConnOk(editingClient.id, 'chatwoot');
      } catch { testResults.chatwoot = 'error'; saveConnErr(editingClient.id, 'chatwoot'); errors.push('Chatwoot'); }
    }
    setStatuses(prev => ({ ...prev, ...testResults }));
    if (Object.keys(testResults).length > 0) setConnTick(t => t + 1);

    try {
      // Core fields — definitely exist in DB
      // Core fields confirmed in DB schema
      const corePayload: Record<string, any> = {
        business_name: editForm.business_name || null,
        plan: editForm.plan || null,
        active: editForm.active,
        meta_account_id: editForm.meta_account_id || null,
        ig_business_id: editForm.ig_business_id || null,
        ig_username: editForm.ig_username || null,
        klaviyo_api_key: editForm.klaviyo_api_key || null,
        chatwoot_url: editForm.chatwoot_url || null,
        chatwoot_token: editForm.chatwoot_token || null,
        ecommerce_platform: editForm.ecommerce_platform || null,
        shopify_domain: editForm.shopify_domain || null,
        shopify_access_token: editForm.shopify_access_token || null,
        tiendanube_store_id: editForm.tiendanube_store_id || null,
        tiendanube_access_token: editForm.tiendanube_access_token || null,
        wordpress_url: editForm.wordpress_url || null,
        woo_consumer_key: editForm.woo_consumer_key || null,
        woo_consumer_secret: editForm.woo_consumer_secret || null,
        fb_page_id: editForm.fb_page_id || null,
        fb_page_name: editForm.fb_page_name || null,
        fb_page_access_token: editForm.fb_page_access_token || null,
        website_url: editForm.website_url || null,
      };

      const { error } = await supabase
        .from("car_clients")
        .update(corePayload)
        .eq("id", editingClient.id);

      if (error) {
        console.error('[saveConfig] Supabase error:', JSON.stringify(error));
        throw new Error(error.message || JSON.stringify(error));
      }

      const isValidUuid = (v?: string) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      if (editForm.new_password && supabaseAdmin) {
        if (!isValidUuid(editingClient.user_id)) {
          throw new Error('Este cliente no tiene un usuario de auth asociado. No se puede cambiar la contraseña.');
        }
        const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(
          editingClient.user_id,
          { password: editForm.new_password },
        );
        if (pwdErr) throw pwdErr;
      }

      // Save custom links
      let order = 0;
      for (const link of clientLinks) {
        if (link.label && link.url) {
          const payload = {
            client_id: editingClient.id,
            label: link.label,
            url: link.url,
            sort_order: order++,
          };
          if (link.id) {
            await supabase.from("car_links").update(payload).eq("id", link.id);
          } else {
            await supabase.from("car_links").insert(payload);
          }
        }
      }
      for (const id of linksToDelete) {
        await db.links.delete(id);
      }

      if (errors.length === 0) {
        showToast("Guardado y todas las conexiones verificadas ✓", "success");
      } else {
        showToast(`Guardado ✓ — Conexiones con error: ${errors.join(", ")}. Revisá las credenciales.`, "warning");
      }
      closeEdit();
      load();
    } catch (err: any) {
      showToast("Error al guardar: " + err.message, "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const { onlineUsers, onlineCount } = usePresence();

  const filteredClients = clients.filter((c) =>
    c.business_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Scan all clients ─────────────────────────────────────────────────────
  const [scanningAll, setScanningAll] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number; current: string; errors: string[] } | null>(null);

  const handleScanAll = async () => {
    if (scanningAll) return;
    const withUrl = clients.filter((c: any) => (c as any).website_url);
    if (withUrl.length === 0) { showToast('Ningún cliente tiene URL configurada.', 'warning'); return; }
    setScanningAll(true);
    setScanProgress({ done: 0, total: withUrl.length, current: '', errors: [] });
    const errors: string[] = [];

    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const token = freshSession?.access_token || '';

    for (let i = 0; i < withUrl.length; i++) {
      const cl: any = withUrl[i];
      setScanProgress({ done: i, total: withUrl.length, current: cl.business_name, errors });
      try {
        const base = { clientId: cl.id, url: cl.website_url };
        await fetch('/api/scrape-all', { 
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }, 
          body: JSON.stringify({ ...base, action: 'scrape-website' }) 
        });
        await fetch('/api/scrape-all', { 
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }, 
          body: JSON.stringify({ ...base, action: 'sync-instagram' }) 
        });
        await fetch('/api/scrape-all', { 
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }, 
          body: JSON.stringify({ clientId: cl.id, action: 'generate-fields' }) 
        });
      } catch (e: any) {
        errors.push(`${cl.business_name}: ${e.message}`);
      }
    }
    setScanProgress({ done: withUrl.length, total: withUrl.length, current: '', errors });
    setScanningAll(false);
    showToast(`Escaneo completado: ${withUrl.length - errors.length}/${withUrl.length} negocios actualizados.`, errors.length ? 'warning' : 'success');
  };

  if (profile && !profile.is_admin) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-[6px] bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-[22px] font-semibold text-zinc-900 dark:text-white tracking-[-0.03em]">
              Gestión de Clientes
            </h1>
          </div>
          <p className="text-[13px] text-zinc-500">
            Creá y administrá los portales de tus clientes C.A.R
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Online Users Indicator */}
          <div className="h-9 px-3 rounded-[9px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-2 mr-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
              {onlineCount} {onlineCount === 1 ? 'usuario activo' : 'usuarios activos'}
            </span>
          </div>

          <button
            onClick={toggleDarkMode}
            className="h-9 w-9 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex items-center justify-center shadow-sm"
            title="Cambiar apariencia"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={load}
            className="h-9 px-3 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex items-center gap-2 text-[13px] font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          <button
            onClick={handleScanAll}
            disabled={scanningAll}
            className="h-9 px-3 rounded-[9px] bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white transition-all flex items-center gap-2 text-[13px] font-bold shadow-md shadow-violet-500/20"
            title="Escanear sitio web, redes e IA de todos los negocios"
          >
            {scanningAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            {scanningAll ? `Escaneando ${scanProgress?.done ?? 0}/${scanProgress?.total ?? 0}…` : 'Escanear todos'}
          </button>
          <button
            onClick={handleMetaLogin}
            disabled={savingConfig}
            className="h-9 px-3.5 rounded-[9px] border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-[13px] font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Facebook className="w-4 h-4" /> Conectar Facebook
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="h-9 px-4 rounded-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(109,40,217,0.25)] hover:shadow-[0_4px_12px_rgba(109,40,217,0.35)] hover:-translate-y-[1px] transition-all flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" /> Nuevo Cliente
          </button>
        </div>
      </div>

      {/* Online Users List (Detailed) */}
      {onlineCount > 0 && (
        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 duration-500">
          {Object.entries(onlineUsers).map(([userId, presences]) => {
            const p = presences[0] as any;
            return (
              <div 
                key={userId} 
                className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-black/[0.05] dark:border-white/[0.05] shadow-sm"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                  {p.business_name}
                </span>
                <span className="text-[9px] font-medium text-zinc-400">
                  {new Date(p.online_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Scan-all progress banner */}
      {scanProgress && (
        <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {scanningAll ? <Loader2 className="w-4 h-4 text-violet-500 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              <p className="text-[13px] font-bold text-violet-700 dark:text-violet-300">
                {scanningAll
                  ? `Escaneando Cerebro IA — ${scanProgress.done}/${scanProgress.total} negocios`
                  : `Escaneo completado — ${scanProgress.total - scanProgress.errors.length}/${scanProgress.total} actualizados`}
              </p>
            </div>
            {!scanningAll && (
              <button onClick={() => setScanProgress(null)} className="text-zinc-400 hover:text-zinc-700 p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="w-full bg-violet-200/50 dark:bg-violet-900/30 rounded-full h-1.5 mb-2">
            <div className="bg-violet-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${scanProgress.total > 0 ? (scanProgress.done / scanProgress.total) * 100 : 0}%` }} />
          </div>
          {scanningAll && scanProgress.current && (
            <p className="text-[11px] text-violet-500/70">Procesando: {scanProgress.current}…</p>
          )}
          {scanProgress.errors.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {scanProgress.errors.map((e, i) => <p key={i} className="text-[11px] text-red-500">✗ {e}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Service role key warning */}
      {!supabaseAdmin && (
        <div className="flex items-start gap-3 p-4 rounded-[12px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed">
            <p className="font-semibold mb-0.5">Falta la Service Role Key</p>
            <p>
              Para crear usuarios desde la app, agregá en el archivo{" "}
              <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">
                .env
              </code>
              :<br />
              <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">
                VITE_SUPABASE_SERVICE_ROLE_KEY=tu_key
              </code>
              <br />
              La encontrás en:{" "}
              <strong>
                Supabase Dashboard → Settings → API → service_role
              </strong>
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-violet-500" /> Nuevo Cliente
            </h2>
            <button
              onClick={() => setShowForm(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="p-6 space-y-5">
            {/* Acceso */}
            <SectionBox title="Acceso al Portal">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Email o usuario *">
                  <input
                    type="text"
                    required
                    value={form.email}
                    onChange={(e) => f("email", e.target.value)}
                    placeholder="fransa o cliente@empresa.com"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className={inputCls}
                  />
                </Field>
                <Field label="Contraseña inicial *">
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      required
                      value={form.password}
                      onChange={(e) => f("password", e.target.value)}
                      className={inputCls + " pr-20 font-mono"}
                    />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => setShowPwd((s) => !s)}
                        className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                      >
                        {showPwd ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => copy(form.password, "Contraseña")}
                        className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => f("password", genPwd())}
                    className="mt-1.5 text-[11px] text-violet-500 hover:text-violet-600 font-medium"
                  >
                    ↻ Nueva contraseña
                  </button>
                </Field>
              </div>
            </SectionBox>

            {/* Negocio */}
            <SectionBox title="Datos del Negocio">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Nombre del negocio *">
                  <input
                    type="text"
                    required
                    value={form.business_name}
                    onChange={(e) => f("business_name", e.target.value)}
                    placeholder="Mi Marca S.A."
                    className={inputCls}
                  />
                </Field>
                <Field label="Industria">
                  <select
                    value={form.industry}
                    onChange={(e) => f("industry", e.target.value)}
                    className={inputCls}
                  >
                    {INDUSTRIES.map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="URL del sitio web">
                <input
                  type="url"
                  value={form.website_url}
                  onChange={(e) => f("website_url", e.target.value)}
                  placeholder="https://minegocio.com"
                  className={inputCls}
                />
              </Field>
              <Field label="Plan C.A.R">
                <div className="flex gap-2">
                  {PLANS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => f("plan", p)}
                      className={`flex-1 h-10 rounded-[9px] border text-[13px] font-semibold transition-all ${form.plan === p ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400" : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
            </SectionBox>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-10 px-5 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !supabaseAdmin}
                className="h-10 px-6 rounded-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(109,40,217,0.25)] hover:shadow-[0_4px_12px_rgba(109,40,217,0.35)] hover:-translate-y-[1px] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Crear Cliente
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pending Google Logins Access Requests */}
      {supabaseAdmin && unlinkedUsers.length > 0 && (
        <div className="bg-amber-50/50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
            <h3 className="text-[14px] font-bold text-amber-800 dark:text-amber-400">
              Solicitudes de Acceso Pendientes ({unlinkedUsers.length})
            </h3>
            <span className="text-[10px] bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold">
              Google / OAuth
            </span>
          </div>
          <p className="text-[12px] text-amber-700/80 dark:text-amber-400/80 mb-4 leading-relaxed">
            Estos correos intentaron ingresar al portal con su cuenta de Google pero no están vinculados a ningún negocio. Podés asociarlos rápidamente a un negocio para darles acceso o eliminarlos.
          </p>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                    <th className="px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Usuario</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Web / Negocio</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Asociar a Negocio</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {unlinkedUsers.map(u => (
                    <UnlinkedUserRow
                      key={u.id}
                      user={u}
                      clients={clients}
                      associatingUser={associatingUser}
                      deletingUser={deletingUser}
                      onAssociate={handleAssociateUser}
                      onDelete={handleDeleteUnlinkedUser}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Search and Clients List */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-11 pr-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-[14px] focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all outline-none"
          />
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Clients Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.04] dark:border-white/[0.04]">
            <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            <span className="text-[13px] text-zinc-500">Cargando clientes...</span>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.04] dark:border-white/[0.04]">
            <Building2 className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
            <p className="text-[14px] font-medium text-zinc-500">
              No se encontraron clientes
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((c) => {
              const active = !!(
                c.meta_account_id ||
                c.klaviyo_api_key ||
                c.chatwoot_url ||
                c.ecommerce_platform ||
                (c as any).ig_business_id
              );
              const isCurrentlyViewing = viewAsProfile?.id === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => openEdit(c)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-xl px-5 py-4 cursor-pointer hover:border-violet-300 dark:hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/[0.02] dark:hover:shadow-none transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold flex-shrink-0 group-hover:scale-105 transition-transform">
                      {c.business_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-zinc-900 dark:text-white truncate">
                          {c.business_name}
                        </span>
                        {onlineUsers[c.id] && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="En línea" />
                        )}
                      </div>
                      {isCurrentlyViewing && (
                        <span className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold block mt-0.5">
                          Sesión Activa
                        </span>
                      )}

                      {/* Connection badges — 🟢 verde=verificado · 🟡 amarillo=sin verificar · ⚪ gris=no configurado */}
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {/* IA Brain Status badge */}
                        <div 
                          className={`h-5 px-1.5 rounded flex items-center gap-1 text-[9px] font-black shrink-0 ${
                            c.brain_updated_at 
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-400/30' 
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                          }`}
                          title={c.brain_updated_at ? `Cerebro IA analizado: ${new Date(c.brain_updated_at).toLocaleString()}` : 'Cerebro IA sin analizar'}
                        >
                          <span className={`w-1.5 h-1.5 rounded-sm shrink-0 ${c.brain_updated_at ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400 dark:bg-zinc-650'}`} />
                          <span>{c.brain_updated_at ? new Date(c.brain_updated_at).toLocaleDateString("es-AR", { day: '2-digit', month: 'short' }) : 'IA'}</span>
                        </div>

                        {/* Catalog Status badge */}
                        {(() => {
                          let count = 0;
                          if (c.products_catalog) {
                            try {
                              const parsed = typeof c.products_catalog === 'string' ? JSON.parse(c.products_catalog) : c.products_catalog;
                              if (Array.isArray(parsed)) count = parsed.length;
                            } catch (_) {}
                          }
                          const hasCatalog = count > 0;
                          return (
                            <div 
                              className={`h-5 px-1.5 rounded flex items-center gap-1 text-[9px] font-black shrink-0 ${
                                hasCatalog 
                                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 ring-1 ring-blue-400/30' 
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                              }`}
                              title={hasCatalog ? `Catálogo sincronizado: ${count} productos · Última vez: ${c.catalog_synced_at ? new Date(c.catalog_synced_at).toLocaleString() : 'Desconocida'}` : 'Catálogo vacío o no sincronizado'}
                            >
                              <span className={`w-1.5 h-1.5 rounded-sm shrink-0 ${hasCatalog ? 'bg-blue-500' : 'bg-zinc-400 dark:bg-zinc-650'}`} />
                              <span>{hasCatalog ? `${count} PRODS` : 'SIN CAT'}</span>
                            </div>
                          );
                        })()}

                        <ConnBadge hasValue={!!c.meta_account_id} clientId={c.id} connectionStatuses={(c as any).connection_statuses} type="meta" label="Meta Ads" tick={connTick}>M</ConnBadge>
                        <ConnBadge hasValue={!!c.fb_page_id} clientId={c.id} connectionStatuses={(c as any).connection_statuses} type="facebook" label={c.fb_page_name ? `Facebook: ${c.fb_page_name}` : 'Facebook'} tick={connTick}>
                          <Facebook className="w-2.5 h-2.5" />
                        </ConnBadge>
                        <ConnBadge hasValue={!!c.ig_username} clientId={c.id} connectionStatuses={(c as any).connection_statuses} type="instagram" label={c.ig_username ? `Instagram: @${c.ig_username}` : 'Instagram'} tick={connTick}>
                          <Instagram className="w-2.5 h-2.5" />
                        </ConnBadge>
                        <ConnBadge 
                          hasValue={!!c.ecommerce_platform && (
                            (c.ecommerce_platform === 'shopify' && !!c.shopify_access_token) ||
                            (c.ecommerce_platform === 'wordpress' && !!c.woo_consumer_key && !!c.woo_consumer_secret) ||
                            (c.ecommerce_platform === 'tiendanube' && !!c.tiendanube_access_token)
                          )} 
                          clientId={c.id} 
                          connectionStatuses={(c as any).connection_statuses} 
                          type="shopify" 
                          label={c.ecommerce_platform ? `Tienda: ${c.ecommerce_platform}` : 'Sin tienda'} 
                          tick={connTick}
                        >
                          {c.ecommerce_platform === 'shopify' ? 'S' : c.ecommerce_platform === 'tiendanube' ? 'TN' : c.ecommerce_platform === 'wordpress' ? 'WP' : 'T'}
                        </ConnBadge>
                        <ConnBadge hasValue={!!c.klaviyo_api_key} clientId={c.id} connectionStatuses={(c as any).connection_statuses} type="klaviyo" label="Klaviyo" tick={connTick}>K</ConnBadge>
                        <ConnBadge hasValue={!!(c.chatwoot_url && c.chatwoot_token)} clientId={c.id} connectionStatuses={(c as any).connection_statuses} type="chatwoot" label="Chatwoot (Mensajería)" tick={connTick}>C</ConnBadge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      title="Analizar Cerebro IA"
                      onClick={() => openIaModal(c)}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all flex items-center justify-center bg-white dark:bg-zinc-900"
                    >
                      <Brain className="w-4 h-4" />
                    </button>
                    {active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                        Inactivo
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
                  {/* Editing Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center md:p-4 p-0">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl h-full md:h-[85vh] rounded-none md:rounded-2xl flex overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex-col md:flex-row animate-in fade-in zoom-in-95 duration-200">
            
            {/* Mobile Top Navigation & Header */}
            <div className="flex md:hidden flex-col bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0">
              {/* Header: Logo, Client Name, Close button, View As */}
              <div className="flex items-center justify-between p-4 pb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-[13px] font-bold shadow-md flex-shrink-0">
                    {editingClient.business_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-zinc-900 dark:text-white truncate text-[13px] leading-tight">
                      {editingClient.business_name}
                    </h4>
                    <p className="text-[9px] text-zinc-400">
                      ID: {editingClient.id.slice(0, 8)}...
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* View As Button Mobile */}
                  <button
                    type="button"
                    onClick={async () => {
                      setViewAsProfile(
                        viewAsProfile?.id === editingClient.id
                          ? null
                          : { ...editingClient, is_admin: false } as any,
                      );
                      closeEdit();
                      if (viewAsProfile?.id !== editingClient.id) navigate("/dashboard");
                    }}
                    className={`py-1.5 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all border ${
                      viewAsProfile?.id === editingClient.id
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <MonitorPlay className="w-3.5 h-3.5" />
                    {viewAsProfile?.id === editingClient.id ? "Detener" : "Ver como"}
                  </button>
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => closeEdit()}
                    className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-all shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tab Selector Mobile: Horizontal Scrollable Row */}
              <div className="flex border-t border-zinc-100 dark:border-zinc-800/80 px-2 overflow-x-auto scrollbar-none">
                {[
                  { id: "general", label: "General", icon: UserPlus },
                  { id: "integrations", label: "Conexiones", icon: Globe },
                  { id: "users", label: "Accesos", icon: Users },
                  { id: "links", label: "Accesos Directos", icon: Copy },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`py-2.5 px-3.5 text-[11px] font-bold flex items-center gap-1.5 transition-all border-b-2 whitespace-nowrap ${
                        isActive
                          ? "border-violet-500 text-violet-600 dark:text-violet-400"
                          : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? "text-violet-500" : "text-zinc-400"}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sidebar navigation (desktop only) */}
            <div className="hidden md:flex w-64 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-100 dark:border-zinc-800 p-5 flex-col justify-between flex-shrink-0">
              <div className="space-y-6">
                {/* Client Profile Header */}
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-[16px] font-bold shadow-md shadow-violet-500/10">
                    {editingClient.business_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-zinc-900 dark:text-white truncate text-[14px]">
                      {editingClient.business_name}
                    </h4>
                    <p className="text-[10px] text-zinc-400">
                      ID: {editingClient.id.slice(0, 8)}...
                    </p>
                  </div>
                </div>

                {/* View As Button in Sidebar */}
                <button
                  type="button"
                  onClick={async () => {
                    setViewAsProfile(
                      viewAsProfile?.id === editingClient.id
                        ? null
                        : { ...editingClient, is_admin: false } as any,
                    );
                    closeEdit();
                    if (viewAsProfile?.id !== editingClient.id) navigate("/dashboard");
                  }}
                  className={`w-full py-2 px-3 rounded-lg text-[11px] font-bold flex items-center justify-center gap-2 transition-all border ${
                    viewAsProfile?.id === editingClient.id
                      ? "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/10"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <MonitorPlay className="w-4 h-4" />
                  {viewAsProfile?.id === editingClient.id ? "Detener Vista" : "Ver como Cliente"}
                </button>

                {/* Vertical Navigation Tabs */}
                <nav className="flex flex-col gap-1">
                  {[
                    { id: "general", label: "General", icon: UserPlus },
                    { id: "integrations", label: "Conexiones / API", icon: Globe },
                    { id: "users", label: "Usuarios / Accesos", icon: Users },
                    { id: "links", label: "Accesos Directos", icon: Copy },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`w-full py-2 px-3 rounded-lg text-[12px] font-semibold flex items-center gap-2.5 transition-all text-left ${
                          isActive
                            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold"
                            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/60 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-violet-500" : "text-zinc-400"}`} />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Close Modal Button */}
              <button
                type="button"
                onClick={() => closeEdit()}
                className="w-full py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-center transition-all bg-white dark:bg-zinc-900"
              >
                Cerrar Panel
              </button>
            </div>

            {/* Content pane */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Header inside pane (desktop only) */}
              <div className="hidden md:flex px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 justify-between items-center bg-white dark:bg-zinc-900">
                <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  {activeTab === "general" && <UserPlus className="w-4 h-4 text-violet-500" />}
                  {activeTab === "integrations" && <Globe className="w-4 h-4 text-violet-500" />}
                  {activeTab === "users" && <Users className="w-4 h-4 text-violet-500" />}
                  {activeTab === "links" && <Copy className="w-4 h-4 text-violet-500" />}
                  {activeTab === "general" && "Configuración General"}
                  {activeTab === "integrations" && "Conexiones e Integraciones"}
                  {activeTab === "users" && "Usuarios con Acceso"}
                  {activeTab === "links" && "Accesos Directos"}
                </h3>
              </div>

              {/* Form body */}
              <form onSubmit={saveConfig} className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col justify-between">
                <div className="space-y-6">
                  {activeTab === "general" && (
                    <div className="space-y-6">
                      <Field label="Estado del Cliente">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => ef("active", !editForm.active)}
                            className={`w-10 h-6 rounded-full transition-all relative outline-none border border-transparent ${
                              editForm.active ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm ${
                                editForm.active ? "right-1" : "left-1"
                              }`}
                            />
                          </button>
                          <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
                            {editForm.active ? "Cliente Activo" : "Cliente Inactivo (Bloquea accesos de usuario)"}
                          </span>
                        </div>
                      </Field>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Nombre de la Empresa">
                          <input
                            type="text"
                            required
                            value={editForm.business_name || ""}
                            onChange={(e) => ef("business_name", e.target.value)}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Industria">
                          <select
                            value={editForm.industry || ""}
                            onChange={(e) => ef("industry", e.target.value)}
                            className={inputCls}
                          >
                            {INDUSTRIES.map((i) => (
                              <option key={i}>{i}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <Field label="Plan C.A.R">
                        <div className="flex gap-2">
                          {PLANS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => ef("plan", p)}
                              className={`flex-1 h-10 rounded-[9px] border text-[12px] font-semibold transition-all ${
                                editForm.plan === p
                                  ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400"
                                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </Field>

                      <Field label="URL del sitio web">
                        <input
                          type="url"
                          value={editForm.website_url || ""}
                          onChange={(e) => ef("website_url", e.target.value)}
                          placeholder="https://minegocio.com"
                          className={inputCls}
                        />
                      </Field>

                      <SectionBox title="Cerebro de IA (Análisis)" badge="IA">
                        <div className="space-y-3">
                          <p className="text-[12px] text-zinc-500 leading-relaxed">
                            El Cerebro de IA almacena toda la información contextual de este negocio para responder dudas en la mensajería y comentarios.
                          </p>
                          <div className="flex items-center justify-between flex-wrap gap-2.5 pt-1">
                            <div>
                              {editingClient.brain_updated_at ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Analizado: {new Date(editingClient.brain_updated_at).toLocaleDateString("es-AR", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} hs
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50">
                                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                                  Sin analizar
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => openIaModal(editingClient, editForm.website_url)}
                              className="h-9 px-4 rounded-[9px] bg-violet-600 hover:bg-violet-750 text-white text-[12px] font-bold transition-all shadow-md shadow-violet-500/10 flex items-center gap-1.5"
                            >
                              <Brain className="w-4 h-4" />
                              <span>Analizar con IA</span>
                            </button>
                          </div>
                        </div>
                      </SectionBox>

                      <SectionBox title="Catálogo de Productos" badge="Tienda">
                        <div className="space-y-3">
                          <p className="text-[12px] text-zinc-500 leading-relaxed font-medium">
                            Sincronizá el catálogo de productos de la tienda (WooCommerce, Shopify, Tiendanube o Meta) para que la IA responda con precios e información exacta.
                          </p>
                          <div className="flex items-center justify-between flex-wrap gap-2.5 pt-1">
                            <div>
                              {(() => {
                                let count = 0;
                                if (editingClient.products_catalog) {
                                  try {
                                    const parsed = typeof editingClient.products_catalog === 'string' ? JSON.parse(editingClient.products_catalog) : editingClient.products_catalog;
                                    if (Array.isArray(parsed)) count = parsed.length;
                                  } catch (_) {}
                                }
                                const hasCatalog = count > 0;
                                return hasCatalog ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    Sincronizado: {count} productos · {editingClient.catalog_synced_at ? new Date(editingClient.catalog_synced_at).toLocaleDateString("es-AR", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Fecha desconocida'} hs
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50">
                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                                    Sin catálogo sincronizado
                                  </span>
                                );
                              })()}
                            </div>
                            <button
                              type="button"
                              onClick={syncCatalog}
                              disabled={syncingCatalog}
                              className={`h-9 px-4 rounded-[9px] text-[12px] font-bold transition-all shadow-md flex items-center gap-1.5 ${
                                syncingCatalog 
                                  ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-450 cursor-not-allowed' 
                                  : 'bg-blue-600 hover:bg-blue-750 text-white shadow-blue-500/10'
                              }`}
                            >
                              <RefreshCw className={`w-4 h-4 ${syncingCatalog ? 'animate-spin' : ''}`} />
                              <span>{syncingCatalog ? 'Sincronizando...' : 'Sincronizar Catálogo'}</span>
                            </button>
                          </div>
                        </div>
                      </SectionBox>

                      {/* Objetivos */}
                      <SectionBox title="Tipo de Cliente y Objetivos" badge="Tags">
                        <div className="flex flex-col gap-2">
                          <p className="text-[11px] text-zinc-500 mb-1">
                            Seleccioná los objetivos de este cliente. Esto determinará qué métricas y secciones se mostrarán en su Dashboard.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {CLIENT_TAGS.map((tag) => {
                              const isSelected = editForm.client_tags?.includes(tag.id);
                              const isPrimary = editForm.client_tags?.[0] === tag.id;
                              return (
                                <div
                                  key={tag.id}
                                  onClick={() => {
                                    let list = [...(editForm.client_tags || [])];
                                    if (isSelected) {
                                      list = list.filter((x) => x !== tag.id);
                                    } else {
                                      list.push(tag.id);
                                    }
                                    ef("client_tags", list);
                                  }}
                                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1 relative ${
                                    isSelected
                                      ? "border-violet-500 bg-violet-50/50 dark:bg-violet-500/5"
                                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${tag.color}`}>
                                      {tag.label}
                                    </span>
                                    {isSelected && (
                                      <Check className="w-3.5 h-3.5 text-violet-500 ml-auto" />
                                    )}
                                  </div>
                                  <p className="text-[10px] text-zinc-400 mt-1">
                                    {tag.desc}
                                  </p>
                                  {isSelected && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const list = [tag.id, ...(editForm.client_tags || []).filter((x: string) => x !== tag.id)];
                                        ef("client_tags", list);
                                      }}
                                      className={`mt-2 py-1 px-2 rounded text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 self-start border transition-all ${
                                        isPrimary
                                          ? "bg-violet-600 text-white border-violet-600"
                                          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50"
                                      }`}
                                    >
                                      <Star className="w-3 h-3" fill={isPrimary ? "currentColor" : "none"} strokeWidth={isPrimary ? 0 : 2} />
                                      {isPrimary ? "Métrica Principal" : "Hacer Principal"}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </SectionBox>
                    </div>
                  )}

                  {activeTab === "integrations" && (
                    <div className="space-y-4">

                      {/* 1. TIENDA ONLINE */}
                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                              <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-[13px] font-black text-zinc-900 dark:text-white">Tienda Online</p>
                              <p className="text-[10px] text-zinc-400">Shopify · Tiendanube · WooCommerce</p>
                            </div>
                          </div>
                          {(() => {
                            const hasCreds = editForm.ecommerce_platform && (
                              (editForm.ecommerce_platform === "shopify" && !!editForm.shopify_access_token) ||
                              (editForm.ecommerce_platform === "wordpress" && !!editForm.woo_consumer_key && !!editForm.woo_consumer_secret) ||
                              (editForm.ecommerce_platform === "tiendanube" && !!editForm.tiendanube_access_token)
                            );
                            if (!hasCreds) return <span className="text-[11px] text-zinc-400">No configurado</span>;
                            return statuses.shopify === "ok" ? (
                              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Conectado</span>
                            ) : statuses.shopify === "error" ? (
                              <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-500"><X className="w-3.5 h-3.5" /> Error</span>
                            ) : (
                              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">⚠ Sin verificar</span>
                            );
                          })()}
                        </div>
                        <div className="p-5 space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            {["shopify","tiendanube","wordpress"].map(p => (
                              <button key={p} type="button" onClick={() => ef("ecommerce_platform", editForm.ecommerce_platform === p ? "" : p)}
                                className={`h-9 rounded-xl text-[11px] font-black border transition-all ${editForm.ecommerce_platform === p ? "bg-emerald-600 text-white border-emerald-600" : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-400"}`}>
                                {p === "shopify" ? "Shopify" : p === "tiendanube" ? "Tiendanube" : "WooCommerce"}
                              </button>
                            ))}
                          </div>
                          {editForm.ecommerce_platform === "shopify" && (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Field label="Dominio Shopify (ej: tienda.myshopify.com)">
                                  <input type="text" value={editForm.shopify_domain} onChange={e => ef("shopify_domain", e.target.value)} placeholder="tienda.myshopify.com" className={inputCls} />
                                </Field>
                                <Field label="Admin Access Token (shpat_...)">
                                  <input type="password" value={editForm.shopify_access_token} onChange={e => ef("shopify_access_token", e.target.value)} placeholder="shpat_xxxxxxxxxx" className={inputCls} />
                                </Field>
                              </div>
                              <button type="button" onClick={testShopify} disabled={testingShopify || !editForm.shopify_domain || !editForm.shopify_access_token}
                                className={`w-full h-10 rounded-xl text-[12px] font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${statuses.shopify === "ok" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-100 text-white dark:text-zinc-900"}`}>
                                {testingShopify ? <Loader2 className="w-4 h-4 animate-spin" /> : statuses.shopify === "ok" ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                                {testingShopify ? "Verificando..." : statuses.shopify === "ok" ? "Conexión verificada ✓" : "Verificar Conexión Shopify"}
                              </button>
                            </div>
                          )}
                          {editForm.ecommerce_platform === "tiendanube" && (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Field label="Store ID"><input type="text" value={editForm.tiendanube_store_id} onChange={e => ef("tiendanube_store_id", e.target.value)} placeholder="1234567" className={inputCls} /></Field>
                                <Field label="Access Token"><input type="password" value={editForm.tiendanube_access_token} onChange={e => ef("tiendanube_access_token", e.target.value)} placeholder="token" className={inputCls} /></Field>
                              </div>
                              <button type="button" onClick={testTiendanube} disabled={testingTiendanube || !editForm.tiendanube_store_id || !editForm.tiendanube_access_token}
                                className={`w-full h-10 rounded-xl text-[12px] font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${statuses.shopify === "ok" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-100 text-white dark:text-zinc-900"}`}>
                                {testingTiendanube ? <Loader2 className="w-4 h-4 animate-spin" /> : statuses.shopify === "ok" ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                                {testingTiendanube ? "Verificando..." : statuses.shopify === "ok" ? "Conexión Tiendanube verificada ✓" : "Verificar Tiendanube"}
                              </button>
                            </div>
                          )}
                          {editForm.ecommerce_platform === "wordpress" && (
                            <div className="space-y-3">
                              <Field label="URL del sitio"><input type="text" value={editForm.wordpress_url} onChange={e => ef("wordpress_url", e.target.value)} placeholder="https://mitienda.com" className={inputCls} /></Field>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Field label="Consumer Key (ck_...)"><input type="password" value={editForm.woo_consumer_key} onChange={e => ef("woo_consumer_key", e.target.value)} placeholder="ck_xxx" className={inputCls} /></Field>
                                <Field label="Consumer Secret (cs_...)"><input type="password" value={editForm.woo_consumer_secret} onChange={e => ef("woo_consumer_secret", e.target.value)} placeholder="cs_xxx" className={inputCls} /></Field>
                              </div>
                              <button type="button" onClick={testWoo} disabled={testingWoo || !editForm.wordpress_url || !editForm.woo_consumer_key || !editForm.woo_consumer_secret}
                                className={`w-full h-10 rounded-xl text-[12px] font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${statuses.shopify === "ok" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-100 text-white dark:text-zinc-900"}`}>
                                {testingWoo ? <Loader2 className="w-4 h-4 animate-spin" /> : statuses.shopify === "ok" ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                                {testingWoo ? "Verificando..." : statuses.shopify === "ok" ? "Conexión WooCommerce verificada ✓" : "Verificar WooCommerce"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. META ADS */}
                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                              <Facebook className="w-3.5 h-3.5 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-[13px] font-black text-zinc-900 dark:text-white">Meta Ads</p>
                              <p className="text-[10px] text-zinc-400">Cuenta publicitaria para captación</p>
                            </div>
                          </div>
                          {editForm.meta_account_id ? (
                            statuses.meta === "ok" ? <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Conectado</span>
                            : statuses.meta === "error" ? <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-500"><X className="w-3.5 h-3.5" /> Error</span>
                            : <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">⚠ Sin verificar</span>
                          ) : <span className="text-[11px] text-zinc-400">No configurado</span>}
                        </div>
                        <div className="p-5 space-y-3">
                          <Field label="Cuenta publicitaria">
                            <select value={editForm.meta_account_id} onChange={e => ef("meta_account_id", e.target.value)} className={inputCls}>
                              <option value="">Seleccionar cuenta...</option>
                              {metaAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.id})</option>)}
                            </select>
                          </Field>
                          <button type="button" onClick={testMeta} disabled={testingMeta || !editForm.meta_account_id}
                            className={`w-full h-10 rounded-xl text-[12px] font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${statuses.meta === "ok" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
                            {testingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : statuses.meta === "ok" ? <Check className="w-4 h-4" /> : <Facebook className="w-4 h-4" />}
                            {testingMeta ? "Verificando..." : statuses.meta === "ok" ? "Meta Ads conectado ✓" : "Verificar Meta Ads"}
                          </button>
                        </div>
                      </div>

                      {/* 3. FACEBOOK & INSTAGRAM */}
                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-pink-500/10 flex items-center justify-center">
                              <Instagram className="w-3.5 h-3.5 text-pink-500" />
                            </div>
                            <div>
                              <p className="text-[13px] font-black text-zinc-900 dark:text-white">Facebook & Instagram</p>
                              <p className="text-[10px] text-zinc-400">Comentarios, DMs y mensajería</p>
                            </div>
                          </div>
                          {editForm.fb_page_id ? (
                            (statuses.facebook === "ok" || statuses.instagram === "ok") ? <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Conectado</span>
                            : (statuses.facebook === "error" || statuses.instagram === "error") ? <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-500"><X className="w-3.5 h-3.5" /> Error</span>
                            : <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">⚠ Sin verificar</span>
                          ) : <span className="text-[11px] text-zinc-400">No configurado</span>}
                        </div>
                        <div className="p-5 space-y-3">
                          {editingClient && (editingClient as any).fb_page_access_token && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              Token activo · {(editingClient as any).fb_page_name || editingClient.fb_page_id}{(editingClient as any).ig_username ? ` · @${(editingClient as any).ig_username}` : ""}
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label="Página de Facebook">
                              <div className="flex gap-1.5">
                                <select value={editForm.fb_page_id || ""} onChange={e => handleSelectFbPage(e.target.value)} className={`${inputCls} flex-1`} disabled={loadingFbPages}>
                                  <option value="">-- Seleccionar --</option>
                                  {discoveredFbPages.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                                  {editForm.fb_page_id && !discoveredFbPages.some(p => p.id === editForm.fb_page_id) && (
                                    <option value={editForm.fb_page_id}>{editForm.fb_page_name || "Página actual"} ({editForm.fb_page_id})</option>
                                  )}
                                </select>
                                <button type="button" onClick={() => loadDiscoveredFbPages(false)} disabled={loadingFbPages} className="px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 flex items-center justify-center transition-all">
                                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFbPages ? "animate-spin" : ""}`} />
                                </button>
                              </div>
                            </Field>
                            <Field label="Cuenta de Instagram">
                              <div className="flex gap-1.5">
                                <select value={editForm.ig_business_id || ""} onChange={e => handleSelectIgAccount(e.target.value)} className={`${inputCls} flex-1`} disabled={loadingIgAccounts}>
                                  <option value="">-- Seleccionar --</option>
                                  {discoveredIgAccounts.map(a => <option key={a.igId} value={a.igId}>{a.name || a.username} (@{a.username})</option>)}
                                  {editForm.ig_business_id && !discoveredIgAccounts.some(a => a.igId === editForm.ig_business_id) && (
                                    <option value={editForm.ig_business_id}>{editForm.ig_username ? `@${editForm.ig_username}` : "Cuenta actual"}</option>
                                  )}
                                </select>
                                <button type="button" onClick={() => loadDiscoveredIgAccounts(false)} disabled={loadingIgAccounts} className="px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 flex items-center justify-center transition-all">
                                  <RefreshCw className={`w-3.5 h-3.5 ${loadingIgAccounts ? "animate-spin" : ""}`} />
                                </button>
                              </div>
                            </Field>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={testFacebookPage} disabled={testingFbPage || !editForm.fb_page_id}
                              className={`h-10 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${statuses.facebook === "ok" ? "bg-emerald-600 text-white" : "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"}`}>
                              {testingFbPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : statuses.facebook === "ok" ? <Check className="w-3.5 h-3.5" /> : <Facebook className="w-3.5 h-3.5" />}
                              {testingFbPage ? "Verificando..." : statuses.facebook === "ok" ? "Facebook OK" : "Verificar Facebook"}
                            </button>
                            <button type="button" onClick={testInstagram} disabled={testingIg || !editForm.ig_business_id}
                              className={`h-10 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${statuses.instagram === "ok" ? "bg-emerald-600 text-white" : "bg-gradient-to-r from-pink-500 to-purple-600 text-white"}`}>
                              {testingIg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : statuses.instagram === "ok" ? <Check className="w-3.5 h-3.5" /> : <Instagram className="w-3.5 h-3.5" />}
                              {testingIg ? "Verificando..." : statuses.instagram === "ok" ? "Instagram OK" : "Verificar Instagram"}
                            </button>
                          </div>
                          <details className="group">
                            <summary className="text-[10px] font-semibold text-zinc-400 cursor-pointer flex items-center gap-1 hover:text-zinc-600 dark:hover:text-zinc-200">
                              <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" /> Campos manuales avanzados
                            </summary>
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field label="Instagram ID"><input type="text" value={editForm.ig_business_id || ""} onChange={e => ef("ig_business_id", e.target.value)} placeholder="17841400000000000" className={inputCls} /></Field>
                              <Field label="Instagram Username"><input type="text" value={editForm.ig_username || ""} onChange={e => ef("ig_username", e.target.value.replace("@",""))} placeholder="mi_cuenta" className={inputCls} /></Field>
                              <Field label="Facebook Page ID"><input type="text" value={editForm.fb_page_id || ""} onChange={e => ef("fb_page_id", e.target.value)} placeholder="10000000000000" className={inputCls} /></Field>
                              <Field label="Facebook Page Name"><input type="text" value={editForm.fb_page_name || ""} onChange={e => ef("fb_page_name", e.target.value)} placeholder="Mi Página" className={inputCls} /></Field>
                              <Field label="Page Access Token"><input type="text" value={editForm.fb_page_access_token || ""} onChange={e => ef("fb_page_access_token", e.target.value)} placeholder="EAARv..." className={inputCls} /></Field>
                            </div>
                          </details>
                        </div>
                      </div>

                      {/* 4. KLAVIYO */}
                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                              <Mail className="w-3.5 h-3.5 text-yellow-600" />
                            </div>
                            <div>
                              <p className="text-[13px] font-black text-zinc-900 dark:text-white">Klaviyo</p>
                              <p className="text-[10px] text-zinc-400">Email marketing y automatizaciones · opcional</p>
                            </div>
                          </div>
                          {editForm.klaviyo_api_key ? (
                            statuses.klaviyo === "ok" ? <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Conectado</span>
                            : statuses.klaviyo === "error" ? <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-500"><X className="w-3.5 h-3.5" /> Error</span>
                            : <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">⚠ Sin verificar</span>
                          ) : <span className="text-[11px] text-zinc-400">No configurado · opcional</span>}
                        </div>
                        <div className="p-5 space-y-3">
                          <Field label="Klaviyo Private API Key (pk_...)">
                            <input type="password" value={editForm.klaviyo_api_key} onChange={e => ef("klaviyo_api_key", e.target.value)} placeholder="pk_xxxxxxxxxxxxxxxxxxxx" className={inputCls} />
                          </Field>
                          <button type="button" onClick={testKlaviyo} disabled={testingKlaviyo || !editForm.klaviyo_api_key}
                            className={`w-full h-10 rounded-xl text-[12px] font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${statuses.klaviyo === "ok" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-yellow-500 hover:bg-yellow-600 text-white"}`}>
                            {testingKlaviyo ? <Loader2 className="w-4 h-4 animate-spin" /> : statuses.klaviyo === "ok" ? <Check className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                            {testingKlaviyo ? "Verificando..." : statuses.klaviyo === "ok" ? "Klaviyo conectado ✓" : "Verificar Klaviyo"}
                          </button>
                        </div>
                      </div>

                      {/* 5. CHATWOOT */}
                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                              <MessageSquare className="w-3.5 h-3.5 text-violet-500" />
                            </div>
                            <div>
                              <p className="text-[13px] font-black text-zinc-900 dark:text-white">Chatwoot</p>
                              <p className="text-[10px] text-zinc-400">Sistema de mensajería y soporte · opcional</p>
                            </div>
                          </div>
                          {editForm.chatwoot_url && editForm.chatwoot_token ? (
                            statuses.chatwoot === "ok" ? <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Conectado</span>
                            : statuses.chatwoot === "error" ? <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-500"><X className="w-3.5 h-3.5" /> Error</span>
                            : <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">⚠ Sin verificar</span>
                          ) : <span className="text-[11px] text-zinc-400">No configurado · opcional</span>}
                        </div>
                        <div className="p-5 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label="URL Chatwoot (ej: https://chat.tuempresa.com)">
                              <input type="text" value={editForm.chatwoot_url} onChange={e => ef("chatwoot_url", e.target.value)} placeholder="https://chatwoot.com" className={inputCls} />
                            </Field>
                            <Field label="User Access Token">
                              <input type="password" value={editForm.chatwoot_token} onChange={e => ef("chatwoot_token", e.target.value)} placeholder="Token de acceso personal" className={inputCls} />
                            </Field>
                          </div>
                          <button type="button" onClick={testChatwoot} disabled={testingChatwoot || !editForm.chatwoot_url || !editForm.chatwoot_token}
                            className={`w-full h-10 rounded-xl text-[12px] font-black flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${statuses.chatwoot === "ok" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-violet-600 hover:bg-violet-700 text-white"}`}>
                            {testingChatwoot ? <Loader2 className="w-4 h-4 animate-spin" /> : statuses.chatwoot === "ok" ? <Check className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                            {testingChatwoot ? "Verificando..." : statuses.chatwoot === "ok" ? "Chatwoot conectado ✓" : "Verificar Chatwoot"}
                          </button>
                        </div>
                      </div>

                      {/* SAVE — auto-testa todo y reporta */}
                      <div className="pt-2">
                        <p className="text-[10px] text-zinc-400 text-center mb-2">Al guardar se verifican automáticamente todas las conexiones configuradas</p>
                        <button type="button" onClick={saveConfig as any} disabled={savingConfig}
                          className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-black flex items-center justify-center gap-2 transition-all shadow-md shadow-violet-500/20">
                          {savingConfig ? <><Loader2 className="w-4 h-4 animate-spin" />Verificando y guardando...</> : <><Save className="w-4 h-4" />Guardar Conexiones</>}
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === "users" && (
                    <div className="space-y-6">
                      <SectionBox title="Cuentas con Acceso / Usuarios" badge="Usuarios">
                        <div className="space-y-4">
                          {loadingAccounts ? (
                            <div className="flex justify-center py-6">
                              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                            </div>
                          ) : (
                            <div className="rounded-[10px] border border-zinc-100 dark:border-zinc-800 overflow-hidden overflow-x-auto">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
                                    <th className="px-4 py-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Email</th>
                                    <th className="px-4 py-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Creado</th>
                                    <th className="px-4 py-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-right">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                  {businessAccounts.length === 0 ? (
                                    <tr>
                                      <td colSpan={3} className="text-center py-6 text-[12px] text-zinc-400">
                                        Sin cuentas de acceso configuradas.
                                      </td>
                                    </tr>
                                  ) : (
                                    businessAccounts.map((acc) => {
                                      const accKey = acc.user_id ?? acc.email;
                                      const isGooglePending = !acc.user_id;
                                      return (
                                      <React.Fragment key={accKey}>
                                        <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                                          <td className="px-4 py-3 text-[13px] font-mono text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
                                            <div className="flex items-center gap-2">
                                              <span className="truncate">{acc.email}</span>
                                              {isGooglePending && (
                                                <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                                                  Google pendiente
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 text-[11px] text-zinc-400 hidden sm:table-cell">
                                            {new Date(acc.created_at).toLocaleDateString("es-AR")}
                                          </td>
                                          <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 justify-end">
                                              {confirmDeleteKey !== accKey && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setConfirmDeleteKey(accKey);
                                                  }}
                                                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-zinc-800 transition-all"
                                                  title="Eliminar cuenta"
                                                >
                                                  <X className="w-3.5 h-3.5" />
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>

                                        {confirmDeleteKey === accKey && (
                                          <tr className="bg-red-50/60 dark:bg-red-500/5">
                                            <td colSpan={3} className="px-4 py-3">
                                              <div className="flex items-center gap-3">
                                                <span className="text-[12px] text-red-600 dark:text-red-400 font-medium flex-1">
                                                  ¿Eliminar <span className="font-bold font-mono text-[11px] bg-red-100 dark:bg-red-500/20 px-1 py-0.5 rounded">{acc.email}</span>?
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => setConfirmDeleteKey(null)}
                                                  className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex-shrink-0"
                                                >
                                                  Cancelar
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteAccount(acc, editingClient.id, editingClient.user_id ?? null)}
                                                  disabled={deletingAccountKey === accKey}
                                                  className="h-8 px-4 rounded-lg bg-red-500 text-white text-[11px] font-bold hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                                                >
                                                  {deletingAccountKey === accKey && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                  Sí, eliminar
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Agregar cuenta */}
                          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                            <h5 className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">
                              Agregar Cuenta de Acceso
                            </h5>

                            {/* Google-only invitation form */}
                            <div className="grid gap-3 grid-cols-1">
                              <div className="w-full">
                                <label className={labelCls}>Email de Google</label>
                                <input
                                  type="text"
                                  placeholder="ejemplo@gmail.com"
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  value={newAccEmail}
                                  onChange={(e) => setNewAccEmail(e.target.value)}
                                  className={inputCls}
                                />
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-snug mt-1.5">
                                  El cliente ingresará al portal usando esta cuenta de Google. No necesita contraseña.
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCreateAccount(editingClient.id, editingClient.user_id ?? null)}
                              disabled={creatingAccount || !newAccEmail || !supabaseAdmin}
                              className="w-full h-10 rounded-[9px] text-white text-[12px] font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
                            >
                              {creatingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                              Registrar invitación Google
                            </button>
                          </div>
                        </div>
                      </SectionBox>
                    </div>
                  )}

                  {activeTab === "links" && (
                    <div className="space-y-6">
                      <SectionBox title="Accesos Directos" badge="L — Links">
                        <div className="space-y-4">
                          {loadingLinks ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {clientLinks.map((link, idx) => (
                                <div
                                  key={idx}
                                  className="flex gap-2 items-start bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800"
                                >
                                  <div className="flex-1 space-y-2">
                                    <input
                                      type="text"
                                      placeholder="Nombre (ej: Carpeta Ads)"
                                      value={link.label}
                                      onChange={(e) => {
                                        const nl = [...clientLinks];
                                        nl[idx].label = e.target.value;
                                        setClientLinks(nl);
                                      }}
                                      className={inputCls}
                                    />
                                    <input
                                      type="url"
                                      placeholder="URL (ej: https://drive.google.com/...)"
                                      value={link.url}
                                      onChange={(e) => {
                                        const nl = [...clientLinks];
                                        nl[idx].url = e.target.value;
                                        setClientLinks(nl);
                                      }}
                                      className={inputCls}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLink(idx, link)}
                                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-55 dark:hover:bg-zinc-800 rounded-lg transition-all"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={handleAddLink}
                                className="w-full h-10 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 text-[12px] font-semibold hover:border-violet-500 hover:text-violet-500 transition-all flex items-center justify-center gap-2 bg-zinc-50/30 dark:bg-zinc-800/30"
                              >
                                + Agregar Acceso Directo
                              </button>
                            </div>
                          )}
                        </div>
                      </SectionBox>
                    </div>
                  )}
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => closeEdit()}
                    className="h-10 px-5 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="h-10 px-6 rounded-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(109,40,217,0.25)] hover:shadow-[0_4px_12px_rgba(109,40,217,0.35)] hover:-translate-y-[1px] transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Client Facebook Page Picker Modal ────────────────────────────── */}
      {clientPagesModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={() => setClientPagesModal(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6 max-w-[420px] w-full max-h-[80vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-[#1877F2]/10 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-[#1877F2]" />
              </div>
              <div>
                <h2 className="text-[16px] font-black text-zinc-900 dark:text-white">Seleccioná la Página del Cliente</h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">Elegí qué página vincular a este cliente</p>
              </div>
            </div>

            {clientPagesModal.pages.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 text-[13px]">
                <p>No se encontraron páginas con tu cuenta.</p>
                <p className="text-[11px] mt-1">Asegurate de ser admin de la página del cliente.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {clientPagesModal.pages.map((page: any) => (
                  <button
                    key={page.id}
                    onClick={() => handleSaveClientPage(page, clientPagesModal.clientId)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-[#1877F2] dark:hover:border-[#1877F2]/60 hover:bg-[#1877F2]/5 dark:hover:bg-[#1877F2]/10 transition-all text-left active:scale-[0.98]"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#1877F2]/10 flex items-center justify-center flex-shrink-0">
                      <Facebook className="w-4.5 h-4.5 text-[#1877F2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">{page.name}</p>
                      <p className="text-[10px] text-zinc-400 font-mono">{page.id}</p>
                      {page.instagram_business_account && (
                        <p className="text-[10px] text-pink-500 font-bold mt-0.5">
                          IG: @{page.instagram_business_account.username}
                        </p>
                      )}
                    </div>
                    <Check className="w-4 h-4 text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setClientPagesModal(null)}
              className="w-full mt-4 h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[13px] font-bold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── IA Scan Modal ────────────────────────────────────────────────── */}
      {iaModalClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-violet-500" />
                <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">
                  Análisis con IA: {iaModalClient.business_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !iaScanning && setIaModalClient(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-650 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all disabled:opacity-30"
                disabled={iaScanning}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              <div>
                <label className={labelCls}>URL del Negocio para Escanear</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={iaModalUrl}
                    onChange={(e) => setIaModalUrl(e.target.value)}
                    placeholder="https://minegocio.com"
                    disabled={iaScanning}
                    className={inputCls}
                  />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Se guardará y usará esta URL para rastrear el sitio web y detectar información.
                </p>
              </div>

              {/* Progress Steps */}
              {(iaScanning || iaLog.length > 0) && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-3">
                    {SCAN_STEPS.map((step, idx) => {
                      const isPending = idx > iaCurrentStep;
                      const isCurrent = idx === iaCurrentStep && iaScanning;
                      const isDone = idx < iaCurrentStep || (idx === iaCurrentStep && iaDone);

                      return (
                        <div key={step.id} className="flex gap-3 items-start">
                          <div className="mt-0.5">
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : isCurrent ? (
                              <Loader2 className="w-4 h-4 text-violet-500 animate-spin shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-zinc-300 dark:text-zinc-700 shrink-0" />
                            )}
                          </div>
                          <div>
                            <p className={`text-[12px] font-bold leading-none ${isDone ? 'text-zinc-900 dark:text-zinc-100' : isCurrent ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400'}`}>
                              {step.label}
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Logs Console */}
                  <div className="bg-zinc-900 dark:bg-black text-[11px] font-mono p-4 rounded-xl text-zinc-350 h-40 overflow-y-auto space-y-1 scrollbar-hide border border-zinc-800">
                    {iaLog.map((log, i) => (
                      <p key={i} className={log.startsWith('❌') ? 'text-red-400' : log.startsWith('✓') ? 'text-emerald-400' : 'text-zinc-400'}>
                        {log}
                      </p>
                    ))}
                    {iaScanning && (
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <span className="w-1 h-3 bg-zinc-500 animate-pulse" />
                        <span>procesando...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {iaError && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-xl p-3.5 flex gap-2.5 items-start text-red-650 dark:text-red-450 text-[12px]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5">Ocurrió un error en el análisis</span>
                    {iaError}
                  </div>
                </div>
              )}

              {iaDone && (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 rounded-xl p-3.5 flex gap-2.5 items-start text-emerald-650 dark:text-emerald-450 text-[12px]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5">Análisis completado</span>
                    Se extrajeron todos los datos del negocio, tono e instrucciones. Ya están cargados en el Cerebro de IA.
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIaModalClient(null)}
                disabled={iaScanning}
                className="h-9 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-[12px] font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
              >
                Cerrar
              </button>
              {!iaDone && (
                <button
                  type="button"
                  onClick={handleRunIaScan}
                  disabled={iaScanning || !iaModalUrl.trim()}
                  className="h-9 px-5 rounded-xl bg-violet-600 hover:bg-violet-750 disabled:opacity-50 text-white text-[12px] font-bold flex items-center gap-1.5 transition-all shadow"
                >
                  {iaScanning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Analizando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Comenzar Análisis</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DR({
  label,
  value,
  onCopy,
  secret,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  secret?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <code className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded truncate max-w-[180px]">
          {secret && !show ? "••••••••••••" : value}
        </code>
        {secret && (
          <button
            onClick={() => setShow((s) => !s)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 transition-all"
          >
            {show ? (
              <EyeOff className="w-3 h-3" />
            ) : (
              <Eye className="w-3 h-3" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

const UnlinkedUserRow = ({
  user,
  clients,
  associatingUser,
  deletingUser,
  onAssociate,
  onDelete,
}: {
  user: any;
  clients: any[];
  associatingUser: string | null;
  deletingUser: string | null;
  onAssociate: (userId: string, email: string, clientId: string) => void;
  onDelete: (userId: string) => void;
}) => {
  const [selectedClientId, setSelectedClientId] = useState("");
  const isAssociating = associatingUser === user.id;
  const isDeleting = deletingUser === user.id;

  return (
    <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
      <td className="px-4 py-3 text-[13px] text-zinc-700 dark:text-zinc-300 truncate max-w-[220px]">
        {user.user_metadata?.full_name && (
          <div className="font-bold text-zinc-900 dark:text-white mb-0.5">{user.user_metadata.full_name}</div>
        )}
        <div className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{user.email}</div>
      </td>
      <td className="px-4 py-3 text-[13px] text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate">
        {user.user_metadata?.business_name_request ? (
          <span className="font-bold text-zinc-800 dark:text-zinc-200">
            {user.user_metadata.business_name_request}
          </span>
        ) : user.user_metadata?.website_url ? (
          <span className="font-medium text-zinc-600 dark:text-zinc-400">
            {user.user_metadata.website_url}
          </span>
        ) : (
          <span className="text-zinc-400 dark:text-zinc-600 italic">No especificado</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 max-w-xs">
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            disabled={isAssociating || isDeleting}
            className="h-8 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-[12px] font-medium outline-none focus:border-violet-500 transition-all flex-grow"
          >
            <option value="">Seleccionar negocio...</option>
            {clients.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedClientId || isAssociating || isDeleting}
            onClick={() => onAssociate(user.id, user.email, selectedClientId)}
            className="h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[12px] font-bold flex items-center gap-1 transition-all"
          >
            {isAssociating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Asociar"}
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            disabled={isAssociating || isDeleting}
            onClick={() => onDelete(user.id)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
            title="Eliminar usuario de autenticación"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}
