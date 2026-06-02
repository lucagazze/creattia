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
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useViewAs } from "../contexts/ViewAsContext";
import { db, ClientLink } from "../services/db";
import { usePresence } from "../contexts/PresenceContext";

interface BusinessAccount {
  id?: number;
  user_id: string;
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
}

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

const toAuthEmail = (input: string) =>
  input.includes('@') ? input.trim() : `${input.trim().toLowerCase()}@car.algoritmia.com`;

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

export default function AdminPage() {
  const { profile } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { viewAsProfile, setViewAsProfile } = useViewAs();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [deletingAccountUserId, setDeletingAccountUserId] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [changingPwdFor, setChangingPwdFor] = useState<string | null>(null);
  const [changingPwd, setChangingPwd] = useState('');
  const [showChangingPwd, setShowChangingPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

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
    localStorage.setItem('fb_pending_client_id', editingClient.id);
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

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("car_clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) showToast("Error: " + error.message, "error");
    else setClients(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    
    // Subscribe to changes in car_clients for live updates (last_login, etc)
    const channel = supabase
      .channel('car_clients_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'car_clients' }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    const client = supabaseAdmin ?? supabase;
    const { data: assoc } = await client
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
      const { data: auth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password: newAccPwd,
        email_confirm: true,
      });
      if (authErr) throw authErr;
      const { error: dbErr } = await supabaseAdmin.from('car_business_accounts').insert({
        business_id: clientId,
        user_id: auth.user.id,
        email: authEmail,
      });
      if (dbErr) throw dbErr;
      showToast('Cuenta creada ✓', 'success');
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
    setDeletingAccountUserId(acc.user_id);
    try {
      if (acc.source === 'car_clients') {
        const { error } = await supabaseAdmin.from('car_clients').update({ user_id: null }).eq('id', clientId);
        if (error) throw error;
        load();
      } else {
        const { error } = await supabaseAdmin.from('car_business_accounts').delete().eq('id', acc.id!);
        if (error) throw error;
      }
      await supabaseAdmin.auth.admin.deleteUser(acc.user_id);
      setBusinessAccounts((p) => p.filter((a) => a.user_id !== acc.user_id));
      setConfirmDeleteUserId(null);
      showToast('Cuenta eliminada ✓', 'success');
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setDeletingAccountUserId(null);
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
      localStorage.setItem('active_fb_page_id', c.fb_page_id);
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
      setStatuses((p) => ({ ...p, shopify: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Shopify: " + (err.message || "Verificá los datos"),
        "error",
      );
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
    setTestingWoo(true);
    try {
      const base = editForm.wordpress_url.replace(/\/$/, '');
      const creds = btoa(`${editForm.woo_consumer_key}:${editForm.woo_consumer_secret}`);
      const res = await fetch(`${base}/wp-json/wc/v3/products?per_page=1`, {
        headers: { 'Authorization': `Basic ${creds}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('¡Conexión con WooCommerce exitosa! ✓', 'success');
      setStatuses((p) => ({ ...p, shopify: 'ok' }));
    } catch (err: any) {
      showToast('Error WooCommerce: ' + (err.message || 'Verificá los datos'), 'error');
      setStatuses((p) => ({ ...p, shopify: 'error' }));
    } finally {
      setTestingWoo(false);
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
      setStatuses((p) => ({ ...p, klaviyo: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Klaviyo: " + (err.message || "Verificá la API Key"),
        "error",
      );
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
      setStatuses((p) => ({ ...p, meta: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Meta: " + (err.message || "Verificá la cuenta"),
        "error",
      );
      setStatuses((p) => ({ ...p, meta: "error" }));
    } finally {
      setTestingMeta(false);
    }
  };

  const syncCatalog = async () => {
    if (!editingClient?.id) return;
    setSyncingCatalog(true);
    setCatalogSyncResult(null);
    try {
      const res = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      setStatuses((p) => ({ ...p, instagram: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Instagram: " + (err.message || "Verificá la cuenta"),
        "error",
      );
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
      
      // Fetch permissions to show the user what's enabled
      let permissionsMsg = "";
      try {
        const tokenToTest = editForm.fb_page_access_token || localStorage.getItem(`fb_pat_${editForm.fb_page_id}`) || "";
        if (tokenToTest) {
          const permRes = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${tokenToTest}`).then(r => r.json());
          if (permRes?.data) {
            const granted = permRes.data.filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
            const keyPerms = ['instagram_manage_messages', 'instagram_manage_comments', 'pages_messaging', 'pages_show_list'];
            const active = keyPerms.filter(p => granted.includes(p));
            permissionsMsg = ` | Permisos activos: ${active.join(', ') || 'ninguno'}`;
          }
        }
      } catch (e) {
        console.error("Error fetching permissions:", e);
      }

      showToast(`¡Conexión con Facebook Exitosa! (${res.name})${permissionsMsg} ✓`, "success");
      setStatuses((p) => ({ ...p, facebook: "ok" }));
    } catch (err: any) {
      showToast(
        "Error Facebook: " + (err.message || "Verificá la cuenta"),
        "error",
      );
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
      setStatuses((p) => ({ ...p, chatwoot: "ok" }));
    } catch (err: any) {
      showToast("Error Chatwoot: El dominio no responde", "error");
      setStatuses((p) => ({ ...p, chatwoot: "error" }));
    } finally {
      setTestingChatwoot(false);
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setSavingConfig(true);
    try {
      const { error } = await supabase
        .from("car_clients")
        .update({
          business_name: editForm.business_name || null,
          industry: editForm.industry || null,
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
          client_tags: editForm.client_tags || [],
          fb_page_id: editForm.fb_page_id || null,
          fb_page_name: editForm.fb_page_name || null,
          fb_page_access_token: editForm.fb_page_access_token || null,
        })
        .eq("id", editingClient.id);

      if (error) throw error;

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

      showToast("Actualizado correctamente ✓", "success");
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
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-850 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center justify-center text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold flex-shrink-0 group-hover:scale-105 transition-transform">
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

                      {/* Connection badges grid */}
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {/* Meta Ads */}
                        <span title="Cuenta Publicitaria Meta" className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black ${c.meta_account_id ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>M</span>
                        {/* Facebook Page */}
                        <span title={c.fb_page_id && (c as any).fb_page_access_token ? `Facebook: ${c.fb_page_name || c.fb_page_id}` : 'Facebook no conectado'} className={`w-5 h-5 rounded flex items-center justify-center ${c.fb_page_id && (c as any).fb_page_access_token ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                          <Facebook className="w-2.5 h-2.5" />
                        </span>
                        {/* Instagram */}
                        <span title={c.ig_username ? `Instagram: @${c.ig_username}` : 'Instagram no conectado'} className={`w-5 h-5 rounded flex items-center justify-center ${c.ig_username ? 'bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                          <Instagram className="w-2.5 h-2.5" />
                        </span>
                        {/* Tienda */}
                        <span title={c.ecommerce_platform ? `Tienda: ${c.ecommerce_platform}` : 'Sin tienda'} className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black ${c.ecommerce_platform && (c.shopify_access_token || (c as any).tiendanube_access_token || (c as any).woo_consumer_key) ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                          {c.ecommerce_platform === 'shopify' ? 'S' : c.ecommerce_platform === 'tiendanube' ? 'TN' : c.ecommerce_platform === 'wordpress' ? 'WP' : 'T'}
                        </span>
                        {/* Klaviyo */}
                        <span title={c.klaviyo_api_key ? 'Klaviyo conectado' : 'Klaviyo no conectado'} className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black ${c.klaviyo_api_key ? 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>K</span>
                        {/* Chatwoot */}
                        <span title={c.chatwoot_url ? 'Chatwoot conectado' : 'Chatwoot no conectado'} className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black ${c.chatwoot_url ? 'bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>C</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-4xl h-[85vh] flex overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex-col md:flex-row animate-in fade-in zoom-in-95 duration-200">
            {/* Sidebar navigation */}
            <div className="w-full md:w-64 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-150 dark:border-zinc-800 p-5 flex flex-col justify-between flex-shrink-0">
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
                    const clientProfile: any = {
                      id: editingClient.id,
                      user_id: editingClient.user_id,
                      business_name: editingClient.business_name,
                      industry: editingClient.industry,
                      plan: editingClient.plan,
                      active: editingClient.active,
                      is_admin: editingClient.is_admin,
                      meta_account_id: editingClient.meta_account_id,
                      ig_business_id: (editingClient as any).ig_business_id,
                      ig_username: (editingClient as any).ig_username,
                      fb_page_id: (editingClient as any).fb_page_id,
                      fb_page_name: (editingClient as any).fb_page_name,
                      fb_page_access_token: (editingClient as any).fb_page_access_token,
                      klaviyo_api_key: editingClient.klaviyo_api_key,
                      chatwoot_url: editingClient.chatwoot_url,
                      chatwoot_token: editingClient.chatwoot_token,
                      ecommerce_platform: editingClient.ecommerce_platform,
                      shopify_domain: editingClient.shopify_domain,
                      shopify_access_token: editingClient.shopify_access_token,
                      client_tags: editingClient.client_tags || [],
                    };
                    setViewAsProfile(
                      viewAsProfile?.id === editingClient.id ? null : clientProfile,
                    );
                    closeEdit();
                    if (viewAsProfile?.id !== editingClient.id) navigate("/");
                  }}
                  className={`w-full py-2 px-3 rounded-lg text-[11px] font-bold flex items-center justify-center gap-2 transition-all border ${
                    viewAsProfile?.id === editingClient.id
                      ? "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/10"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850"
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
                            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/60 dark:hover:bg-zinc-850"
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
              {/* Header inside pane */}
              <div className="px-6 py-4 border-b border-zinc-150 dark:border-zinc-850 flex justify-between items-center bg-white dark:bg-zinc-900">
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
                    <div className="space-y-6">
                      {/* E-commerce */}
                      <SectionBox
                        title="Plataforma de E-commerce"
                        badge="S / T — Tienda"
                        status={statuses.shopify}
                      >
                        <Field label="Plataforma Integrada">
                          <select
                            value={editForm.ecommerce_platform}
                            onChange={(e) => ef("ecommerce_platform", e.target.value)}
                            className={inputCls}
                          >
                            <option value="">Ninguna / Desconectada</option>
                            <option value="shopify">Shopify</option>
                            <option value="tiendanube">Tiendanube</option>
                            <option value="wordpress">WordPress / WooCommerce</option>
                          </select>
                        </Field>

                        {editForm.ecommerce_platform === "shopify" && (
                          <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-3 border border-zinc-100 dark:border-zinc-800">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field label="Dominio Shopify (ej: mi-tienda.myshopify.com)">
                                <input
                                  type="text"
                                  value={editForm.shopify_domain}
                                  onChange={(e) => ef("shopify_domain", e.target.value)}
                                  placeholder="tienda.myshopify.com"
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="Admin Access Token (shpat_...)">
                                <input
                                  type="password"
                                  value={editForm.shopify_access_token}
                                  onChange={(e) => ef("shopify_access_token", e.target.value)}
                                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
                                  className={inputCls}
                                />
                              </Field>
                            </div>
                            <button
                              type="button"
                              onClick={testShopify}
                              disabled={testingShopify || !editForm.shopify_domain || !editForm.shopify_access_token}
                              className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[11px] font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
                            >
                              {testingShopify ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Probar Conexión Shopify
                            </button>
                          </div>
                        )}

                        {editForm.ecommerce_platform === "tiendanube" && (
                          <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-3 border border-zinc-100 dark:border-zinc-800">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field label="Store ID Tiendanube">
                                <input type="text" value={editForm.tiendanube_store_id} onChange={(e) => ef("tiendanube_store_id", e.target.value)} placeholder="1234567" className={inputCls} />
                              </Field>
                              <Field label="Access Token Tiendanube">
                                <input type="password" value={editForm.tiendanube_access_token} onChange={(e) => ef("tiendanube_access_token", e.target.value)} placeholder="Token de acceso API" className={inputCls} />
                              </Field>
                            </div>
                          </div>
                        )}

                        {editForm.ecommerce_platform === "wordpress" && (
                          <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-3 border border-zinc-100 dark:border-zinc-800">
                            <p className="text-[10px] text-zinc-400">WooCommerce → Ajustes → REST API → Crear clave con permisos de Lectura</p>
                            <Field label="URL del sitio (ej: https://mitienda.com)">
                              <input type="text" value={editForm.wordpress_url} onChange={(e) => ef("wordpress_url", e.target.value)} placeholder="https://mitienda.com" className={inputCls} />
                            </Field>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field label="Consumer Key (ck_...)">
                                <input type="password" value={editForm.woo_consumer_key} onChange={(e) => ef("woo_consumer_key", e.target.value)} placeholder="ck_xxxxxxxx" className={inputCls} />
                              </Field>
                              <Field label="Consumer Secret (cs_...)">
                                <input type="password" value={editForm.woo_consumer_secret} onChange={(e) => ef("woo_consumer_secret", e.target.value)} placeholder="cs_xxxxxxxx" className={inputCls} />
                              </Field>
                            </div>
                            <button type="button" onClick={testWoo} disabled={testingWoo || !editForm.wordpress_url || !editForm.woo_consumer_key || !editForm.woo_consumer_secret} className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[11px] font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2">
                              {testingWoo ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Probar Conexión WooCommerce
                            </button>
                          </div>
                        )}
                      </SectionBox>

                      {/* Redes Sociales y Meta Ads */}
                      <SectionBox
                        title="Redes Sociales & Meta Ads"
                        badge="Meta — Integración"
                        status={
                          statuses.facebook === "error" || statuses.meta === "error" || statuses.instagram === "error"
                            ? "error"
                            : (statuses.facebook === "ok" || statuses.meta === "ok" || statuses.instagram === "ok")
                              ? "ok"
                              : null
                        }
                      >
                        <div className="space-y-4">
                          {/* 1. Meta Ads Account */}
                          <Field label="Cuenta publicitaria de Meta (Captación)">
                            <select
                              value={editForm.meta_account_id}
                              onChange={(e) => ef("meta_account_id", e.target.value)}
                              className={inputCls}
                            >
                              <option value="">Seleccionar cuenta...</option>
                              {metaAccounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name} ({acc.id})
                                </option>
                              ))}
                            </select>
                          </Field>
                          <button
                            type="button"
                            onClick={testMeta}
                            disabled={testingMeta || !editForm.meta_account_id}
                            className="w-full h-9 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                          >
                            {testingMeta ? <Loader2 className="w-3 h-3 animate-spin" /> : <Facebook className="w-3 h-3" />}
                            Probar Conexión Meta Ads
                          </button>

                          {/* 2. Page & Token status */}
                          <div className="mt-4 pt-4 border-t border-zinc-150 dark:border-zinc-800 space-y-4">
                            <span className="text-[11.5px] font-black uppercase tracking-[0.07em] text-zinc-550 dark:text-zinc-400 block">Conexión de Redes Sociales (Facebook/Instagram)</span>
                            {editingClient && (editingClient as any).fb_page_access_token ? (
                              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-400 font-bold leading-normal">
                                <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p>Redes Sociales: Conectado ✓ — Mensajes, comentarios e Instagram activos</p>
                                  <p className="text-[9.5px] text-emerald-600/80 dark:text-emerald-400/80 font-medium mt-0.5">
                                    Página vinculada: {(editingClient as any).fb_page_name || editingClient.fb_page_id}
                                    {(editingClient as any).ig_username ? ` · Instagram: @${(editingClient as any).ig_username}` : ''}
                                  </p>
                                </div>
                              </div>
                            ) : null}

                            {/* Admin connect button */}
                            <button
                              type="button"
                              onClick={handleConnectFacebookForClient}
                              className="w-full h-9 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-[11px] font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-[#1877F2]/20"
                            >
                              <Facebook className="w-3.5 h-3.5" />
                              {(editingClient as any)?.fb_page_access_token ? 'Reconectar Facebook/Instagram' : 'Conectar Facebook/Instagram'}
                            </button>
                          </div>

                          {/* 3. Facebook Page & Instagram selectors side-by-side */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-4 border-t border-zinc-150 dark:border-zinc-800">
                            {/* Facebook Page Selection */}
                            <Field label="Página de Facebook Vinculada">
                              <div className="flex gap-1.5">
                                <select
                                  value={editForm.fb_page_id || ""}
                                  onChange={(e) => handleSelectFbPage(e.target.value)}
                                  className={`${inputCls} flex-1`}
                                  disabled={loadingFbPages}
                                >
                                  <option value="">-- Seleccionar página --</option>
                                  {discoveredFbPages.map((page) => (
                                    <option key={page.id} value={page.id}>
                                      {page.name} ({page.id})
                                    </option>
                                  ))}
                                  {editForm.fb_page_id && !discoveredFbPages.some(page => page.id === editForm.fb_page_id) && (
                                    <option value={editForm.fb_page_id}>
                                      {editForm.fb_page_name || "Página actual"} ({editForm.fb_page_id})
                                    </option>
                                  )}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => loadDiscoveredFbPages(false)}
                                  disabled={loadingFbPages}
                                  title="Refrescar páginas"
                                  className="px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 flex items-center justify-center transition-all"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFbPages ? "animate-spin" : ""}`} />
                                </button>
                              </div>
                            </Field>

                            {/* Instagram Selection */}
                            <Field label="Cuenta de Instagram Vinculada">
                              <div className="flex gap-1.5">
                                <select
                                  value={editForm.ig_business_id || ""}
                                  onChange={(e) => handleSelectIgAccount(e.target.value)}
                                  className={`${inputCls} flex-1`}
                                  disabled={loadingIgAccounts}
                                >
                                  <option value="">-- Seleccionar cuenta --</option>
                                  {discoveredIgAccounts.map((acc) => (
                                    <option key={acc.igId} value={acc.igId}>
                                      {acc.name || acc.username} (@{acc.username})
                                    </option>
                                  ))}
                                  {editForm.ig_business_id && !discoveredIgAccounts.some(acc => acc.igId === editForm.ig_business_id) && (
                                    <option value={editForm.ig_business_id}>
                                      {editForm.ig_username ? `@${editForm.ig_username}` : "Cuenta actual"} ({editForm.ig_business_id})
                                    </option>
                                  )}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => loadDiscoveredIgAccounts(false)}
                                  disabled={loadingIgAccounts}
                                  title="Refrescar cuentas"
                                  className="px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 flex items-center justify-center transition-all"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${loadingIgAccounts ? "animate-spin" : ""}`} />
                                </button>
                              </div>
                            </Field>
                          </div>

                          {/* 4. Test connection buttons */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4 pt-4 border-t border-zinc-150 dark:border-zinc-800">
                            <button
                              type="button"
                              onClick={testFacebookPage}
                              disabled={testingFbPage || !editForm.fb_page_id}
                              className="h-9 rounded-lg border border-zinc-250 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-750 dark:text-zinc-300 text-[11px] font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5"
                            >
                              {testingFbPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Facebook className="w-3.5 h-3.5" />}
                              Probar Página Facebook
                            </button>
                            <button
                              type="button"
                              onClick={testInstagram}
                              disabled={testingIg || !editForm.ig_business_id}
                              className="h-9 rounded-lg border border-zinc-250 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-750 dark:text-zinc-300 text-[11px] font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5"
                            >
                              {testingIg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>}
                              Probar Cuenta Instagram
                            </button>
                          </div>

                          {/* Catalog sync */}
                          {editingClient?.meta_account_id && (
                            <div className="mt-4 pt-4 border-t border-zinc-150 dark:border-zinc-800 space-y-2">
                              <span className="text-[11.5px] font-black uppercase tracking-[0.07em] text-zinc-550 dark:text-zinc-400 block">Catálogo de Productos</span>
                              {(editingClient as any).catalog_synced_at ? (
                                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                  <span>Catálogo sincronizado · {new Date((editingClient as any).catalog_synced_at).toLocaleDateString('es-AR')}</span>
                                </div>
                              ) : catalogSyncResult ? (
                                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                  <span>{catalogSyncResult.count} productos · {catalogSyncResult.source}</span>
                                </div>
                              ) : (
                                <p className="text-[10px] text-zinc-400">Sin catálogo sincronizado. Sincronizá para que la IA conozca todos los productos.</p>
                              )}
                              <button
                                type="button"
                                onClick={syncCatalog}
                                disabled={syncingCatalog}
                                className="w-full h-9 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold hover:bg-emerald-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                {syncingCatalog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                {syncingCatalog ? 'Sincronizando catálogo...' : (editingClient as any).catalog_synced_at ? 'Re-sincronizar catálogo' : 'Sincronizar catálogo desde Meta'}
                              </button>
                            </div>
                          )}

                          {/* 5. Manual configurations details drop downs */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                            <div className="border border-zinc-100 dark:border-zinc-800 rounded-lg p-2.5 bg-zinc-50/50 dark:bg-zinc-800/20">
                              <details className="group">
                                <summary className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 cursor-pointer select-none flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200">
                                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                                  Detalles Manuales Instagram
                                </summary>
                                <div className="mt-2 space-y-2">
                                  <Field label="Instagram ID">
                                    <input
                                      type="text"
                                      value={editForm.ig_business_id || ""}
                                      onChange={(e) => ef("ig_business_id", e.target.value)}
                                      placeholder="17841400000000000"
                                      className={inputCls}
                                    />
                                  </Field>
                                  <Field label="Instagram Username (sin @)">
                                    <input
                                      type="text"
                                      value={editForm.ig_username || ""}
                                      onChange={(e) => ef("ig_username", e.target.value.replace('@', ''))}
                                      placeholder="mi_cuenta"
                                      className={inputCls}
                                    />
                                  </Field>
                                </div>
                              </details>
                            </div>

                            <div className="border border-zinc-100 dark:border-zinc-800 rounded-lg p-2.5 bg-zinc-50/50 dark:bg-zinc-800/20">
                              <details className="group">
                                <summary className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 cursor-pointer select-none flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200">
                                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                                  Detalles Manuales Facebook
                                </summary>
                                <div className="mt-2 space-y-2">
                                  <Field label="Facebook Page ID">
                                    <input
                                      type="text"
                                      value={editForm.fb_page_id || ""}
                                      onChange={(e) => ef("fb_page_id", e.target.value)}
                                      placeholder="10000000000000"
                                      className={inputCls}
                                    />
                                  </Field>
                                  <Field label="Facebook Page Name">
                                    <input
                                      type="text"
                                      value={editForm.fb_page_name || ""}
                                      onChange={(e) => ef("fb_page_name", e.target.value)}
                                      placeholder="Mi Página"
                                      className={inputCls}
                                    />
                                  </Field>
                                  <Field label="Access Token">
                                    <input
                                      type="text"
                                      value={editForm.fb_page_access_token || ""}
                                      onChange={(e) => ef("fb_page_access_token", e.target.value)}
                                      placeholder="EAARv..."
                                      className={inputCls}
                                    />
                                  </Field>
                                </div>
                              </details>
                            </div>
                          </div>

                        </div>
                      </SectionBox>

                      {/* Klaviyo */}
                      <SectionBox
                        title="Klaviyo Email Marketing"
                        badge="K — Email"
                        status={statuses.klaviyo}
                      >
                        <Field label="Klaviyo API Private Key (pk_...)">
                          <input
                            type="password"
                            value={editForm.klaviyo_api_key}
                            onChange={(e) => ef("klaviyo_api_key", e.target.value)}
                            placeholder="pk_xxxxxxxxxxxxxxxxxxxx"
                            className={inputCls}
                          />
                        </Field>
                        <button
                          type="button"
                          onClick={testKlaviyo}
                          disabled={testingKlaviyo || !editForm.klaviyo_api_key}
                          className="w-full h-9 mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[11px] font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
                        >
                          {testingKlaviyo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          Probar Conexión Klaviyo
                        </button>
                      </SectionBox>

                      {/* Chatwoot */}
                      <SectionBox
                        title="Chatwoot Support System"
                        badge="S — Soporte"
                        status={statuses.chatwoot}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Field label="URL Chatwoot (ej: https://chat.empresa.com)">
                            <input
                              type="text"
                              value={editForm.chatwoot_url}
                              onChange={(e) => ef("chatwoot_url", e.target.value)}
                              placeholder="https://chatwoot.com"
                              className={inputCls}
                            />
                          </Field>
                          <Field label="User/Agent Access Token">
                            <input
                              type="password"
                              value={editForm.chatwoot_token}
                              onChange={(e) => ef("chatwoot_token", e.target.value)}
                              placeholder="Token de acceso personal"
                              className={inputCls}
                            />
                          </Field>
                        </div>
                        <button
                          type="button"
                          onClick={testChatwoot}
                          disabled={testingChatwoot || !editForm.chatwoot_url || !editForm.chatwoot_token}
                          className="w-full h-9 mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[11px] font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
                        >
                          {testingChatwoot ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                          Probar Conexión Chatwoot
                        </button>
                      </SectionBox>
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
                            <div className="rounded-[10px] border border-zinc-150 dark:border-zinc-800 overflow-hidden">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="bg-zinc-50 dark:bg-zinc-850 border-b border-zinc-150 dark:border-zinc-800">
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
                                    businessAccounts.map((acc) => (
                                      <React.Fragment key={acc.user_id}>
                                        <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                                          <td className="px-4 py-3 text-[13px] font-mono text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
                                            {acc.email}
                                          </td>
                                          <td className="px-4 py-3 text-[11px] text-zinc-400 hidden sm:table-cell">
                                            {new Date(acc.created_at).toLocaleDateString("es-AR")}
                                          </td>
                                          <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 justify-end">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (changingPwdFor === acc.user_id) {
                                                    setChangingPwdFor(null);
                                                    setChangingPwd('');
                                                  } else {
                                                    setChangingPwdFor(acc.user_id);
                                                    setChangingPwd(genPwd());
                                                    setShowChangingPwd(false);
                                                    setConfirmDeleteUserId(null);
                                                  }
                                                }}
                                                className={`p-1.5 rounded-lg transition-all ${
                                                  changingPwdFor === acc.user_id
                                                    ? "bg-violet-100 dark:bg-violet-500/20 text-violet-600"
                                                    : "text-zinc-400 hover:text-violet-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                                }`}
                                                title="Cambiar contraseña"
                                              >
                                                <KeyRound className="w-3.5 h-3.5" />
                                              </button>
                                              {confirmDeleteUserId !== acc.user_id && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setConfirmDeleteUserId(acc.user_id);
                                                    setChangingPwdFor(null);
                                                    setChangingPwd('');
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

                                        {changingPwdFor === acc.user_id && (
                                          <tr className="bg-violet-50/50 dark:bg-violet-500/5">
                                            <td colSpan={3} className="px-4 py-3">
                                              <div className="flex flex-col sm:flex-row gap-2 items-end">
                                                <div className="flex-1 w-full">
                                                  <label className={labelCls}>Nueva contraseña</label>
                                                  <div className="relative">
                                                    <input
                                                      type={showChangingPwd ? "text" : "password"}
                                                      value={changingPwd}
                                                      onChange={(e) => setChangingPwd(e.target.value)}
                                                      className={inputCls + " pr-20 font-mono"}
                                                      placeholder="Mínimo 6 caracteres"
                                                    />
                                                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
                                                      <button type="button" onClick={() => setShowChangingPwd((s) => !s)} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-all">
                                                        {showChangingPwd ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                      </button>
                                                      <button type="button" onClick={() => copy(changingPwd, "Contraseña")} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-all" title="Copiar">
                                                        <Copy className="w-3 h-3" />
                                                      </button>
                                                      <button type="button" onClick={() => setChangingPwd(genPwd())} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-all" title="Generar">
                                                        <RefreshCw className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                </div>
                                                <div className="flex gap-2 flex-shrink-0">
                                                  <button type="button" onClick={() => { setChangingPwdFor(null); setChangingPwd(''); }} className="h-10 px-3 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-[12px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                                                    Cancelar
                                                  </button>
                                                  <button type="button" onClick={() => handleChangePwd(acc.user_id)} disabled={savingPwd || !changingPwd} className="h-10 px-4 rounded-[9px] bg-violet-600 text-white text-[12px] font-semibold flex items-center gap-2 hover:bg-violet-700 transition-all disabled:opacity-50">
                                                    {savingPwd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                    Guardar
                                                  </button>
                                                </div>
                                              </div>
                                            </td>
                                          </tr>
                                        )}

                                        {confirmDeleteUserId === acc.user_id && (
                                          <tr className="bg-red-50/60 dark:bg-red-500/5">
                                            <td colSpan={3} className="px-4 py-3">
                                              <div className="flex items-center gap-3">
                                                <span className="text-[12px] text-red-600 dark:text-red-400 font-medium flex-1">
                                                  ¿Eliminar <span className="font-bold font-mono text-[11px] bg-red-100 dark:bg-red-500/20 px-1 py-0.5 rounded">{acc.email}</span>?
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => setConfirmDeleteUserId(null)}
                                                  className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex-shrink-0"
                                                >
                                                  Cancelar
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteAccount(acc, editingClient.id, editingClient.user_id ?? null)}
                                                  disabled={deletingAccountUserId === acc.user_id}
                                                  className="h-8 px-4 rounded-lg bg-red-500 text-white text-[11px] font-bold hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                                                >
                                                  {deletingAccountUserId === acc.user_id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                  Sí, eliminar
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Agregar cuenta */}
                          <div className="mt-4 pt-4 border-t border-zinc-150 dark:border-zinc-800 space-y-3">
                            <h5 className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">
                              Crear Nueva Cuenta de Acceso
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="w-full">
                                <label className={labelCls}>Usuario o Email</label>
                                <input
                                  type="text"
                                  placeholder="usuario o email@empresa.com"
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  value={newAccEmail}
                                  onChange={(e) => setNewAccEmail(e.target.value)}
                                  className={inputCls}
                                />
                              </div>
                              <div className="w-full">
                                <label className={labelCls}>Contraseña Inicial</label>
                                <div className="relative">
                                  <input
                                    type={showNewAccPwd ? "text" : "password"}
                                    value={newAccPwd}
                                    onChange={(e) => setNewAccPwd(e.target.value)}
                                    className={inputCls + " pr-20 font-mono"}
                                  />
                                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
                                    <button type="button" onClick={() => setShowNewAccPwd((s) => !s)} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-all">
                                      {showNewAccPwd ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    </button>
                                    <button type="button" onClick={() => copy(newAccPwd, "Contraseña")} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-all" title="Copiar">
                                      <Copy className="w-3 h-3" />
                                    </button>
                                    <button type="button" onClick={() => setNewAccPwd(genPwd())} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 transition-all" title="Generar nueva">
                                      <RefreshCw className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCreateAccount(editingClient.id, editingClient.user_id ?? null)}
                              disabled={creatingAccount || !newAccEmail || !supabaseAdmin}
                              className="w-full h-10 rounded-[9px] bg-violet-600 text-white text-[12px] font-semibold flex items-center justify-center gap-2 hover:bg-violet-700 transition-all disabled:opacity-50"
                            >
                              {creatingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                              Agregar cuenta de acceso
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
                                  className="flex gap-2 items-start bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-150 dark:border-zinc-800"
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
                                className="w-full h-10 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 text-[12px] font-semibold hover:border-violet-500 hover:text-violet-500 transition-all flex items-center justify-center gap-2 bg-zinc-50/30 dark:bg-zinc-850/30"
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
                <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-zinc-150 dark:border-zinc-800">
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
