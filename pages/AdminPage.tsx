import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../services/supabase';
import { metaAds } from '../services/metaAds';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus, Users, Eye, EyeOff, Check, X, Loader2,
  Shield, Building2, RefreshCw, Copy, ChevronDown, ChevronUp,
  AlertTriangle, Pencil
} from 'lucide-react';

interface ClientRow {
  id: string; user_id: string; business_name: string;
  industry?: string; plan?: string; active?: boolean; is_admin?: boolean;
  chatwoot_url?: string; chatwoot_token?: string;
  meta_account_id?: string; meta_pixel_id?: string;
  klaviyo_api_key?: string; klaviyo_list_id?: string;
  created_at: string;
}

const blank = () => ({
  email: '', password: genPwd(), business_name: '', industry: 'Dermocosmética',
  plan: 'CAR Growth'
});

function genPwd() {
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
  return Array.from({ length: 14 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

const PLANS = ['CAR Growth', 'CAR Full'];
const INDUSTRIES = ['Dermocosmética','Nutrición Deportiva','Mascotas','Moda y Accesorios','Hogar y Deco','Salud y Bienestar','Otro'];

const inputCls = 'w-full h-10 rounded-[9px] border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3.5 text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all';
const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 mb-1.5 block';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>;
}

function SectionBox({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-zinc-100 dark:border-zinc-700/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-700/60">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-zinc-500 dark:text-zinc-400">{title}</span>
        {badge && <span className="text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-full font-medium">{badge}</span>}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

export default function AdminPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

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

  useEffect(() => {
    metaAds.getAllAdAccounts().then(res => setMetaAccounts(res?.data || [])).catch(() => {});
  }, []);

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => { if (profile && !profile.is_admin) navigate('/', { replace: true }); }, [profile, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('car_clients').select('*').order('created_at', { ascending: false });
    if (error) showToast('Error: ' + error.message, 'error');
    else setClients(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); showToast(l + ' copiado ✓', 'success'); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseAdmin) {
      showToast('Falta VITE_SUPABASE_SERVICE_ROLE_KEY en el .env', 'error');
      return;
    }
    setCreating(true);
    try {
      const { data: auth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: form.email, password: form.password, email_confirm: true,
      });
      if (authErr) throw authErr;

      const { error: dbErr } = await supabase.from('car_clients').insert({
        user_id: auth.user.id,
        business_name: form.business_name,
        industry: form.industry || null,
        plan: form.plan,
        active: true, is_admin: false,
      });
      if (dbErr) throw dbErr;

      showToast(`✅ "${form.business_name}" creado`, 'success');
      setShowForm(false);
      setForm(blank());
      load();
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (c: ClientRow) => {
    const { error } = await supabase.from('car_clients').update({ active: !c.active }).eq('id', c.id);
    if (error) showToast('Error: ' + error.message, 'error');
    else { showToast((!c.active ? 'Activado' : 'Desactivado') + ' ✓', 'success'); load(); }
  };

  const openEdit = (c: ClientRow) => {
    setEditForm({
      meta_account_id: c.meta_account_id || '',
      klaviyo_api_key: c.klaviyo_api_key || '',
      chatwoot_url: c.chatwoot_url || '',
      chatwoot_token: c.chatwoot_token || ''
    });
    setEditingClient(c);
  };

  const ef = (k: string, v: string) => setEditForm((p: any) => ({ ...p, [k]: v }));

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setSavingConfig(true);
    try {
      const { error } = await supabase.from('car_clients').update({
        meta_account_id: editForm.meta_account_id || null,
        klaviyo_api_key: editForm.klaviyo_api_key || null,
        chatwoot_url: editForm.chatwoot_url || null,
        chatwoot_token: editForm.chatwoot_token || null,
      }).eq('id', editingClient.id);
      
      if (error) throw error;
      showToast('Integraciones actualizadas ✓', 'success');
      setEditingClient(null);
      load();
    } catch (err: any) {
      showToast('Error al guardar: ' + err.message, 'error');
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
            <h1 className="text-[22px] font-semibold text-zinc-900 dark:text-white tracking-[-0.03em]">Gestión de Clientes</h1>
          </div>
          <p className="text-[13px] text-zinc-500">Creá y administrá los portales de tus clientes C.A.R</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="h-9 px-3 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex items-center gap-2 text-[13px] font-medium">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="h-9 px-4 rounded-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(109,40,217,0.25)] hover:shadow-[0_4px_12px_rgba(109,40,217,0.35)] hover:-translate-y-[1px] transition-all flex items-center gap-2">
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
            <p>Para crear usuarios desde la app, agregá en el archivo <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">.env</code>:<br />
            <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">VITE_SUPABASE_SERVICE_ROLE_KEY=tu_key</code><br />
            La encontrás en: <strong>Supabase Dashboard → Settings → API → service_role</strong></p>
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
            <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="p-6 space-y-5">

            {/* Acceso */}
            <SectionBox title="Acceso al Portal">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Email *">
                  <input type="email" required value={form.email} onChange={e => f('email', e.target.value)} placeholder="cliente@empresa.com" className={inputCls} />
                </Field>
                <Field label="Contraseña inicial *">
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} required value={form.password} onChange={e => f('password', e.target.value)} className={inputCls + ' pr-20 font-mono'} />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
                      <button type="button" onClick={() => setShowPwd(s => !s)} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all">
                        {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" onClick={() => copy(form.password, 'Contraseña')} className="p-1.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <button type="button" onClick={() => f('password', genPwd())} className="mt-1.5 text-[11px] text-violet-500 hover:text-violet-600 font-medium">↻ Nueva contraseña</button>
                </Field>
              </div>
            </SectionBox>

            {/* Negocio */}
            <SectionBox title="Datos del Negocio">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Nombre del negocio *">
                  <input type="text" required value={form.business_name} onChange={e => f('business_name', e.target.value)} placeholder="Mi Marca S.A." className={inputCls} />
                </Field>
                <Field label="Industria">
                  <select value={form.industry} onChange={e => f('industry', e.target.value)} className={inputCls}>
                    {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Plan C.A.R">
                <div className="flex gap-2">
                  {PLANS.map(p => (
                    <button key={p} type="button" onClick={() => f('plan', p)}
                      className={`flex-1 h-10 rounded-[9px] border text-[13px] font-semibold transition-all ${form.plan === p ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
            </SectionBox>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="h-10 px-5 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                Cancelar
              </button>
              <button type="submit" disabled={creating || !supabaseAdmin} className="h-10 px-6 rounded-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(109,40,217,0.25)] hover:shadow-[0_4px_12px_rgba(109,40,217,0.35)] hover:-translate-y-[1px] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2">
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <><Check className="w-4 h-4" /> Crear Cliente</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Clients list */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
          <Users className="w-4 h-4 text-zinc-400" />
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-white">Clientes</h2>
          <span className="ml-auto text-[12px] font-semibold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full">{clients.length}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            <span className="text-[13px] text-zinc-500">Cargando...</span>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Building2 className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
            <p className="text-[14px] font-medium text-zinc-500">No hay clientes aún</p>
            <p className="text-[12px] text-zinc-400">Creá el primer cliente con el botón de arriba</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {clients.map(c => (
              <div key={c.id} className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
                    {c.business_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-zinc-900 dark:text-white truncate">{c.business_name}</p>
                      {c.is_admin && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">Admin</span>}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.active ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                        {c.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.industry && <span className="text-[11px] text-zinc-500">{c.industry}</span>}
                      {c.plan && <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">{c.plan}</span>}
                      <span className="text-[11px] text-zinc-400">{new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-[5px] border ${c.meta_account_id ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
                        Meta: {c.meta_account_id ? (metaAccounts.find(a => a.id === c.meta_account_id)?.name || c.meta_account_id) : 'No configurado'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-[5px] border ${c.klaviyo_api_key ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
                        Klaviyo: {c.klaviyo_api_key ? 'Conectado' : 'No configurado'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-[5px] border ${c.chatwoot_url ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20' : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
                        Chatwoot: {c.chatwoot_url ? 'Conectado' : 'No configurado'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => toggleActive(c)} className={`p-2 rounded-[7px] transition-all ${c.active ? 'text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'}`}
                      title={c.active ? 'Desactivar' : 'Activar'}>
                      {c.active ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => openEdit(c)} className="p-2 rounded-[7px] text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all" title="Configurar Integraciones">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="p-2 rounded-[7px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                      {expanded === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {expanded === c.id && (
                  <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {c.meta_account_id ? <DR label="Meta Account" value={metaAccounts.find(a => a.id === c.meta_account_id)?.name || c.meta_account_id} /> : <DR label="Meta Account" value="No configurado" />}
                    {c.klaviyo_api_key && <DR label="Klaviyo API Key" value={c.klaviyo_api_key} secret />}
                    {c.chatwoot_url && <DR label="Chatwoot URL" value={c.chatwoot_url} />}
                    {c.chatwoot_token && <DR label="Chatwoot Token" value={c.chatwoot_token} secret />}
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
                <RefreshCw className="w-4 h-4 text-violet-500" /> Integraciones: {editingClient.business_name}
              </h3>
              <button onClick={() => setEditingClient(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={saveConfig} className="p-6 space-y-6">
              {/* Meta Ads */}
              <SectionBox title="Meta Ads" badge="C — Captación">
                <Field label="Ad Account">
                  <select value={editForm.meta_account_id} onChange={e => ef('meta_account_id', e.target.value)} className={inputCls}>
                    <option value="">Seleccionar cuenta...</option>
                    {metaAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.id})</option>
                    ))}
                  </select>
                </Field>
              </SectionBox>

              {/* Klaviyo */}
              <SectionBox title="Klaviyo" badge="R — Retención">
                <div className="grid grid-cols-1 gap-4">
                  <Field label="API Key de Klaviyo (Privada)">
                    <input type="text" value={editForm.klaviyo_api_key} onChange={e => ef('klaviyo_api_key', e.target.value)} placeholder="pk_xxxxxxxxxxxxxxxx" className={inputCls} />
                  </Field>
                </div>
              </SectionBox>

              {/* Chatwoot */}
              <SectionBox title="Chatwoot" badge="A — Atención">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="URL del chat">
                    <input type="url" value={editForm.chatwoot_url} onChange={e => ef('chatwoot_url', e.target.value)} placeholder="https://app.chatwoot.com" className={inputCls} />
                  </Field>
                  <Field label="Token del widget">
                    <input type="text" value={editForm.chatwoot_token} onChange={e => ef('chatwoot_token', e.target.value)} placeholder="token_xxxxxx" className={inputCls} />
                  </Field>
                </div>
              </SectionBox>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button type="button" onClick={() => setEditingClient(null)} className="h-10 px-5 rounded-[9px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={savingConfig} className="h-10 px-6 rounded-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold shadow hover:-translate-y-[1px] transition-all disabled:opacity-50 flex items-center gap-2">
                  {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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

function DR({ label, value, onCopy, secret }: { label: string; value: string; onCopy?: () => void; secret?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <code className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded truncate max-w-[180px]">
          {secret && !show ? '••••••••••••' : value}
        </code>
        {secret && (
          <button onClick={() => setShow(s => !s)} className="p-1 rounded text-zinc-400 hover:text-zinc-600 transition-all">
            {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
}
