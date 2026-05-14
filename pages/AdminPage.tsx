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
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useViewAs } from "../contexts/ViewAsContext";
import { db, ClientLink } from "../services/db";

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
  klaviyo_api_key?: string;
  klaviyo_list_id?: string;
  ecommerce_platform?: string;
  shopify_domain?: string;
  shopify_access_token?: string;
  tiendanube_store_id?: string;
  tiendanube_access_token?: string;
  client_tags?: string[];
  created_at: string;
}

const CLIENT_TAGS = [
  { id: 'tienda_online', label: 'Tienda Online (E-commerce)', color: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400' },
  { id: 'lead_gen', label: 'Clientes Potenciales (Leads)', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  { id: 'whatsapp', label: 'Conversaciones (WhatsApp)', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
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
  const [testingKlaviyo, setTestingKlaviyo] = useState(false);
  const [testingMeta, setTestingMeta] = useState(false);
  const [testingChatwoot, setTestingChatwoot] = useState(false);

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

  useEffect(() => {
    metaAds
      .getAllAdAccounts()
      .then((res) => setMetaAccounts(res?.data || []))
      .catch(() => {});
  }, []);

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
          email: form.email,
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
      const { data: auth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: newAccEmail,
        password: newAccPwd,
        email_confirm: true,
      });
      if (authErr) throw authErr;
      const { error: dbErr } = await supabaseAdmin.from('car_business_accounts').insert({
        business_id: clientId,
        user_id: auth.user.id,
        email: newAccEmail,
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
    setEditForm({
      meta_account_id: c.meta_account_id || "",
      klaviyo_api_key: c.klaviyo_api_key || "",
      chatwoot_url: c.chatwoot_url || "",
      chatwoot_token: c.chatwoot_token || "",
      ecommerce_platform: c.ecommerce_platform || "",
      shopify_domain: c.shopify_domain || "",
      shopify_access_token: c.shopify_access_token || "",
      tiendanube_store_id: c.tiendanube_store_id || "",
      tiendanube_access_token: c.tiendanube_access_token || "",
      client_tags: c.client_tags || [],
      new_password: "",
    });
    setEditingClient(c);
    setLinksToDelete([]);
    setLoadingLinks(true);
    const links = await db.links.getByClientId(c.id).catch(() => []);
    setClientLinks(links);
    setLoadingLinks(false);
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

  const ef = (k: string, v: string | string[]) =>
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
          meta_account_id: editForm.meta_account_id || null,
          klaviyo_api_key: editForm.klaviyo_api_key || null,
          chatwoot_url: editForm.chatwoot_url || null,
          chatwoot_token: editForm.chatwoot_token || null,
          ecommerce_platform: editForm.ecommerce_platform || null,
          shopify_domain: editForm.shopify_domain || null,
          shopify_access_token: editForm.shopify_access_token || null,
          tiendanube_store_id: editForm.tiendanube_store_id || null,
          tiendanube_access_token: editForm.tiendanube_access_token || null,
          client_tags: editForm.client_tags || [],
        })
        .eq("id", editingClient.id);

      if (error) throw error;

      if (editForm.new_password && supabaseAdmin) {
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
      setEditingClient(null);
      load();
    } catch (err: any) {
      showToast("Error al guardar: " + err.message, "error");
    } finally {
      setSavingConfig(false);
    }
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
            onClick={() => setShowForm(!showForm)}
            className="h-9 px-4 rounded-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(109,40,217,0.25)] hover:shadow-[0_4px_12px_rgba(109,40,217,0.35)] hover:-translate-y-[1px] transition-all flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" /> Nuevo Cliente
          </button>
        </div>
      </div>

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
                <Field label="Email *">
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => f("email", e.target.value)}
                    placeholder="cliente@empresa.com"
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

      {/* Clients list */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <Users className="w-4 h-4 text-zinc-400" />
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-white">
            Clientes
          </h2>
          <span className="ml-auto text-[12px] font-semibold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full">
            {clients.length}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            <span className="text-[13px] text-zinc-500">Cargando...</span>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Building2 className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
            <p className="text-[14px] font-medium text-zinc-500">
              No hay clientes aún
            </p>
            <p className="text-[12px] text-zinc-400">
              Creá el primer cliente con el botón de arriba
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {clients.map((c) => (
              <div key={c.id} className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
                    {c.business_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-zinc-900 dark:text-white truncate">
                        {c.business_name}
                      </p>
                      {c.is_admin && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          Admin
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.active ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}
                      >
                        {c.active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.industry && (
                        <span className="text-[11px] text-zinc-500">
                          {c.industry}
                        </span>
                      )}
                      {c.plan && (
                        <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
                          {c.plan}
                        </span>
                      )}
                      {c.client_tags && c.client_tags.length > 0 && (
                        <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-700 pl-3">
                          {c.client_tags.map(tagId => {
                            const tagInfo = CLIENT_TAGS.find(t => t.id === tagId);
                            if (!tagInfo) return null;
                            return (
                              <span key={tagId} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tagInfo.color}`}>
                                {tagInfo.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <span className="text-[11px] text-zinc-400 ml-auto">
                        {new Date(c.created_at).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-[5px] border ${c.meta_account_id ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20" : "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 border-zinc-200 dark:border-zinc-700"}`}
                      >
                        Meta:{" "}
                        {c.meta_account_id
                          ? metaAccounts.find((a) => a.id === c.meta_account_id)
                              ?.name || c.meta_account_id
                          : "No configurado"}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-[5px] border ${c.klaviyo_api_key ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20" : "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 border-zinc-200 dark:border-zinc-700"}`}
                      >
                        Klaviyo: {c.klaviyo_api_key ? "Conectado" : "No conf."}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-[5px] border ${c.chatwoot_url ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20" : "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 border-zinc-200 dark:border-zinc-700"}`}
                      >
                        Chat: {c.chatwoot_url ? "Conectado" : "No conf."}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-[5px] border ${c.ecommerce_platform ? "bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-500/20" : "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 border-zinc-200 dark:border-zinc-700"}`}
                      >
                        Tienda:{" "}
                        {c.ecommerce_platform === "shopify"
                          ? "Shopify"
                          : c.ecommerce_platform === "tiendanube"
                            ? "Tiendanube"
                            : "No conf."}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={async () => {
                        // Build a ClientProfile-like object from the ClientRow
                        const clientProfile: any = {
                          id: c.id,
                          user_id: c.user_id,
                          business_name: c.business_name,
                          industry: c.industry,
                          plan: c.plan,
                          active: c.active,
                          is_admin: c.is_admin,
                          meta_account_id: c.meta_account_id,
                          klaviyo_api_key: c.klaviyo_api_key,
                          chatwoot_url: c.chatwoot_url,
                          chatwoot_token: c.chatwoot_token,
                          ecommerce_platform: c.ecommerce_platform,
                          shopify_domain: c.shopify_domain,
                          shopify_access_token: c.shopify_access_token,
                          client_tags: c.client_tags || [],
                        };
                        setViewAsProfile(
                          viewAsProfile?.id === c.id ? null : clientProfile,
                        );
                        if (viewAsProfile?.id !== c.id) navigate("/");
                      }}
                      className={`p-2 rounded-[7px] transition-all text-[10px] font-bold flex items-center gap-1 ${
                        viewAsProfile?.id === c.id
                          ? "bg-violet-600 text-white shadow-md shadow-violet-300/20"
                          : "text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10"
                      }`}
                      title="Ver como este cliente"
                    >
                      <MonitorPlay className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {viewAsProfile?.id === c.id ? "Viendo" : "Ver"}
                      </span>
                    </button>
                    <button
                      onClick={() => toggleActive(c)}
                      className={`p-2 rounded-[7px] transition-all ${c.active ? "text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"}`}
                      title={c.active ? "Desactivar" : "Activar"}
                    >
                      {c.active ? (
                        <X className="w-3.5 h-3.5" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      className="p-2 rounded-[7px] text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all"
                      title="Configurar Integraciones"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const next = expanded === c.id ? null : c.id;
                        setExpanded(next);
                        if (next) {
                          setNewAccEmail('');
                          setNewAccPwd(genPwd());
                          setChangingPwdFor(null);
                          setChangingPwd('');
                          setConfirmDeleteUserId(null);
                          loadAccounts(c.id, c.user_id ?? null);
                        }
                      }}
                      className="p-2 rounded-[7px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                    >
                      {expanded === c.id ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {expanded === c.id && (
                  <div className="mt-3 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-zinc-400">
                      Cuentas con acceso
                    </p>

                    {/* Tabla */}
                    <div className="rounded-[10px] border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-800">
                            <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.07em] text-zinc-400">Email</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.07em] text-zinc-400 hidden sm:table-cell">Creada</th>
                            <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.07em] text-zinc-400">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {loadingAccounts ? (
                            <tr>
                              <td colSpan={3} className="text-center py-6">
                                <Loader2 className="w-4 h-4 animate-spin text-zinc-400 mx-auto" />
                              </td>
                            </tr>
                          ) : businessAccounts.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-center py-6 text-[12px] text-zinc-400">
                                Sin cuentas
                              </td>
                            </tr>
                          ) : (
                            businessAccounts.map((acc) => (
                              <React.Fragment key={acc.user_id}>
                                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                  <td className="px-4 py-3 text-[13px] font-mono text-zinc-700 dark:text-zinc-300">
                                    {acc.email}
                                  </td>
                                  <td className="px-4 py-3 text-[12px] text-zinc-400 hidden sm:table-cell">
                                    {new Date(acc.created_at).toLocaleDateString("es-AR")}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1 justify-end">
                                      {/* Cambiar contraseña */}
                                      <button
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
                                        className={`p-1.5 rounded-[6px] transition-all ${changingPwdFor === acc.user_id ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600' : 'text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10'}`}
                                        title="Cambiar contraseña"
                                      >
                                        <KeyRound className="w-3.5 h-3.5" />
                                      </button>
                                      {/* Eliminar — paso 1 */}
                                      {confirmDeleteUserId !== acc.user_id && (
                                        <button
                                          onClick={() => {
                                            setConfirmDeleteUserId(acc.user_id);
                                            setChangingPwdFor(null);
                                            setChangingPwd('');
                                          }}
                                          className="p-1.5 rounded-[6px] text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                                          title="Eliminar cuenta"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>

                                {/* Cambiar contraseña — fila expandible */}
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

                                {/* Eliminar — paso 2 confirmación */}
                                {confirmDeleteUserId === acc.user_id && (
                                  <tr className="bg-red-50/60 dark:bg-red-500/5">
                                    <td colSpan={3} className="px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        <span className="text-[13px] text-red-600 dark:text-red-400 font-medium flex-1">
                                          ¿Eliminar <span className="font-bold font-mono">{acc.email}</span>? Esta acción no se puede deshacer.
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteUserId(null)}
                                          className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex-shrink-0"
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteAccount(acc, c.id, c.user_id ?? null)}
                                          disabled={deletingAccountUserId === acc.user_id}
                                          className="h-8 px-4 rounded-lg bg-red-500 text-white text-[12px] font-bold hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                                        >
                                          {deletingAccountUserId === acc.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
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

                    {/* Agregar cuenta */}
                    <div className="flex flex-col sm:flex-row gap-2 items-end">
                      <div className="flex-1 w-full">
                        <label className={labelCls}>Email nueva cuenta</label>
                        <input
                          type="email"
                          placeholder="email@empresa.com"
                          value={newAccEmail}
                          onChange={(e) => setNewAccEmail(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div className="flex-1 w-full">
                        <label className={labelCls}>Contraseña inicial</label>
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
                      <button
                        type="button"
                        onClick={() => handleCreateAccount(c.id, c.user_id ?? null)}
                        disabled={creatingAccount || !newAccEmail || !supabaseAdmin}
                        className="h-10 px-4 rounded-[9px] bg-violet-600 text-white text-[13px] font-semibold flex items-center gap-2 hover:bg-violet-700 transition-all disabled:opacity-50 flex-shrink-0 w-full sm:w-auto"
                      >
                        {creatingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        Agregar cuenta
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editing Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center sticky top-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur z-10">
              <h3 className="text-[16px] font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-violet-500" /> Integraciones:{" "}
                {editingClient.business_name}
              </h3>
              <button
                onClick={() => setEditingClient(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveConfig} className="p-6 space-y-6">
              {/* Etiquetas / Tipo de Cliente */}
              <SectionBox title="Tipo de Cliente y Objetivos" badge="Tags">
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] text-zinc-500 mb-1">
                    Seleccioná los objetivos de este cliente. Esto determinará qué métricas y secciones se mostrarán en su Dashboard.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CLIENT_TAGS.map((tag) => {
                      const isSelected = editForm.client_tags?.includes(tag.id);
                      const isPrimary = editForm.client_tags?.[0] === tag.id;
                      
                      return (
                        <div
                          key={tag.id}
                          className={`relative flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                            isSelected
                              ? "border-violet-500 bg-violet-50/50 dark:bg-violet-500/10"
                              : "border-zinc-200 dark:border-zinc-700 hover:border-violet-300"
                          }`}
                        >
                          <label className="flex items-center gap-3 cursor-pointer flex-1">
                            <div className="mt-0.5">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800"
                                checked={isSelected}
                                onChange={(e) => {
                                  const newTags = e.target.checked
                                    ? [...(editForm.client_tags || []), tag.id]
                                    : (editForm.client_tags || []).filter((t: string) => t !== tag.id);
                                  ef("client_tags", newTags);
                                }}
                              />
                            </div>
                            <div>
                              <span className="text-[13px] font-semibold text-zinc-900 dark:text-white block">
                                {tag.label}
                              </span>
                            </div>
                          </label>
                          
                          {isSelected && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                if (isPrimary) return;
                                const tags = [...(editForm.client_tags || [])];
                                const index = tags.indexOf(tag.id);
                                if (index > -1) {
                                  tags.splice(index, 1);
                                  tags.unshift(tag.id);
                                  ef("client_tags", tags);
                                }
                              }}
                              className={`p-1.5 rounded-lg transition-all ${isPrimary ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10 shadow-sm' : 'text-zinc-400 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                              title={isPrimary ? "Esta es la Métrica Principal del Inicio" : "Convertir en Métrica Principal"}
                            >
                              <Star className="w-4 h-4" fill={isPrimary ? "currentColor" : "none"} strokeWidth={isPrimary ? 0 : 2} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </SectionBox>

              {/* Meta Ads */}
              <SectionBox
                title="Meta Ads"
                badge="C — Captación"
                status={statuses.meta}
              >
                <Field label="Ad Account">
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
                  {testingMeta ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Facebook className="w-3 h-3" />
                  )}
                  Probar Conexión Meta
                </button>
              </SectionBox>

              {/* Klaviyo */}
              <SectionBox
                title="Klaviyo"
                badge="R — Retención"
                status={statuses.klaviyo}
              >
                <div className="grid grid-cols-1 gap-4">
                  <Field label="API Key de Klaviyo (Privada)">
                    <input
                      type="text"
                      value={editForm.klaviyo_api_key}
                      onChange={(e) => ef("klaviyo_api_key", e.target.value)}
                      placeholder="pk_xxxxxxxxxxxxxxxx"
                      className={inputCls}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={testKlaviyo}
                    disabled={testingKlaviyo || !editForm.klaviyo_api_key}
                    className="w-full h-9 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                  >
                    {testingKlaviyo ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Mail className="w-3 h-3" />
                    )}
                    Probar Conexión Klaviyo
                  </button>
                </div>
              </SectionBox>

              {/* Chatwoot */}
              <SectionBox
                title="Chatwoot"
                badge="A — Atención"
                status={statuses.chatwoot}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="URL del chat">
                    <input
                      type="url"
                      value={editForm.chatwoot_url}
                      onChange={(e) => ef("chatwoot_url", e.target.value)}
                      placeholder="https://app.chatwoot.com"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Token del widget">
                    <input
                      type="text"
                      value={editForm.chatwoot_token}
                      onChange={(e) => ef("chatwoot_token", e.target.value)}
                      placeholder="token_xxxxxx"
                      className={inputCls}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={testChatwoot}
                  disabled={testingChatwoot || !editForm.chatwoot_url}
                  className="w-full h-9 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                >
                  {testingChatwoot ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <MessageSquare className="w-3 h-3" />
                  )}
                  Probar Conexión Chatwoot
                </button>
              </SectionBox>

              {/* E-commerce */}
              <SectionBox
                title="Tienda Online (E-commerce)"
                badge="T — Tienda"
                status={statuses.shopify}
              >
                <div className="grid grid-cols-1 gap-4">
                  <Field label="Plataforma">
                    <select
                      value={editForm.ecommerce_platform}
                      onChange={(e) => ef("ecommerce_platform", e.target.value)}
                      className={inputCls}
                    >
                      <option value="">No configurado</option>
                      <option value="shopify">Shopify</option>
                      <option value="tiendanube">Tiendanube</option>
                    </select>
                  </Field>

                  {editForm.ecommerce_platform === "shopify" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Dominio Shopify">
                        <input
                          type="text"
                          value={editForm.shopify_domain}
                          onChange={(e) => ef("shopify_domain", e.target.value)}
                          placeholder="mitienda.myshopify.com"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Access Token (Admin API)">
                        <input
                          type="text"
                          value={editForm.shopify_access_token}
                          onChange={(e) =>
                            ef("shopify_access_token", e.target.value)
                          }
                          placeholder="shpat_xxxxxx"
                          className={inputCls}
                        />
                      </Field>
                      <div className="md:col-span-2">
                        <button
                          type="button"
                          onClick={testShopify}
                          disabled={testingShopify}
                          className="w-full h-9 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[12px] font-bold hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-all flex items-center justify-center gap-2"
                        >
                          {testingShopify ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                              Probando conexión...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" /> Probar
                              Conexión con Shopify
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {editForm.ecommerce_platform === "tiendanube" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="ID de Tienda (Store ID)">
                        <input
                          type="text"
                          value={editForm.tiendanube_store_id}
                          onChange={(e) =>
                            ef("tiendanube_store_id", e.target.value)
                          }
                          placeholder="1234567"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Access Token">
                        <input
                          type="text"
                          value={editForm.tiendanube_access_token}
                          onChange={(e) =>
                            ef("tiendanube_access_token", e.target.value)
                          }
                          placeholder="bearer token..."
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </SectionBox>

              {/* Password Change */}
              <SectionBox title="Acceso y Seguridad">
                <div className="grid grid-cols-1 gap-4">
                  <Field label="Nueva Contraseña (dejar vacío para no cambiar)">
                    <div className="relative">
                      <input
                        type={showPwd ? "text" : "password"}
                        value={editForm.new_password}
                        onChange={(e) => ef("new_password", e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className={inputCls + " pr-20"}
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
                          onClick={() => ef("new_password", genPwd())}
                          className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                          title="Generar"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </Field>
                </div>
              </SectionBox>

              {/* Custom Links */}
              <SectionBox title="Accesos Directos" badge="L — Links">
                <div className="space-y-4">
                  {loadingLinks ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {clientLinks.map((link, idx) => (
                        <div
                          key={idx}
                          className="flex gap-2 items-start bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-700"
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
                            className="mt-1 p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddLink}
                        className="w-full h-9 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 text-[12px] font-semibold hover:border-violet-500 hover:text-violet-500 transition-all flex items-center justify-center gap-2 bg-zinc-50/50 dark:bg-zinc-800/30"
                      >
                        + Agregar Acceso Directo
                      </button>
                    </div>
                  )}
                </div>
              </SectionBox>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="h-10 px-5 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="h-10 px-6 rounded-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold shadow hover:-translate-y-[1px] transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {savingConfig ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Guardar Configuración
                </button>
              </div>
            </form>
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
