import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, supabaseAdmin } from '../services/supabase';
import {
  Users, Loader2, Search, RefreshCw, Building2, X,
  UserCheck, UserX, ChevronDown, ChevronUp, Link2,
  Trash2, CheckCircle2, ArrowUpDown, Plus, UserPlus,
  AlertTriangle, CalendarDays, SortAsc, SortDesc, Eye, EyeOff, KeyRound
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  provider?: string;
  businesses: BusinessAssoc[];
  full_name?: string;
}

interface BusinessAssoc {
  business_id: string;
  business_name: string;
  role: 'owner' | 'secondary';
  website_url?: string;
}

interface ClientOption {
  id: string;
  name: string;
  website_url?: string;
}

interface PendingInvite {
  id: number;
  email: string;
  business_id: string;
  business_name: string;
  created_at: string;
}

type SortKey = 'date_desc' | 'date_asc' | 'business';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(dateStr?: string) {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `Hace ${days} d`;
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProviderBadge({ provider }: { provider?: string }) {
  if (!provider) return null;
  if (provider.includes('google'))
    return <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 uppercase tracking-wide">Google</span>;
  return <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 uppercase tracking-wide">Email</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { profile } = useAuth();
  const { isViewingAs } = useViewAs();
  const navigate = useNavigate();

  // Data
  const [users, setUsers] = useState<UserRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);

  // UI state
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Delete modal
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Delete pending invite
  const [confirmDeletePendingId, setConfirmDeletePendingId] = useState<number | null>(null);
  const [deletingPending, setDeletingPending] = useState(false);

  // Accept/associate modal
  const [acceptUserId, setAcceptUserId] = useState<string | null>(null);
  const [acceptBizId, setAcceptBizId] = useState('');
  const [accepting, setAccepting] = useState(false);

  // Add new Google invitation
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newBizId, setNewBizId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Create user with email+password
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createBizId, setCreateBizId] = useState('');
  const [createShowPwd, setCreateShowPwd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Guard
  useEffect(() => {
    if (!profile?.is_admin || isViewingAs) navigate('/', { replace: true });
  }, [profile, isViewingAs, navigate]);

  // ─── Load data ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!supabaseAdmin) return;
    setLoading(true);
    try {
      const [
        authRes,
        clientsRes,
        bizAccountsRes,
        pendingRes,
      ] = await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
        supabase.from('car_clients').select('id, business_name, user_id, website_url').order('business_name'),
        supabase.from('car_business_accounts').select('user_id, email, business_id, created_at').not('user_id', 'is', null),
        supabase.from('car_business_accounts').select('id, email, business_id, created_at').is('user_id', null).order('created_at', { ascending: false }),
      ]);

      if (authRes.error) console.error("AdminUsersPage: Error listing auth users:", authRes.error);
      if (clientsRes.error) console.error("AdminUsersPage: Error fetching clients:", clientsRes.error);
      if (bizAccountsRes.error) console.error("AdminUsersPage: Error fetching business accounts:", bizAccountsRes.error);
      if (pendingRes.error) console.error("AdminUsersPage: Error fetching pending invitations:", pendingRes.error);

      const authUsers = authRes.data?.users ?? [];
      const clientsData = clientsRes.data ?? [];
      const bizAccounts = bizAccountsRes.data ?? [];
      const pendingRows = pendingRes.data ?? [];

      // Build client options
      setClients((clientsData ?? []).map(c => ({
        id: c.id,
        name: c.business_name ?? c.id,
        website_url: c.website_url,
      })));

      // Build lookup
      const bizName: Record<string, { name: string; website?: string }> = {};
      for (const c of clientsData ?? []) {
        bizName[c.id] = { name: c.business_name ?? c.id, website: c.website_url };
      }

      const userBizMap: Record<string, BusinessAssoc[]> = {};
      for (const c of clientsData ?? []) {
        if (!c.user_id) continue;
        if (!userBizMap[c.user_id]) userBizMap[c.user_id] = [];
        userBizMap[c.user_id].push({
          business_id: c.id,
          business_name: c.business_name ?? c.id,
          role: 'owner',
          website_url: c.website_url,
        });
      }
      for (const acc of bizAccounts ?? []) {
        if (!acc.user_id) continue;
        if (!userBizMap[acc.user_id]) userBizMap[acc.user_id] = [];
        userBizMap[acc.user_id].push({
          business_id: acc.business_id,
          business_name: bizName[acc.business_id]?.name ?? acc.business_id,
          role: 'secondary',
          website_url: bizName[acc.business_id]?.website,
        });
      }

      // Build pending invitations (user_id IS NULL)
      const bizNameMap: Record<string, string> = {};
      for (const c of clientsData ?? []) {
        bizNameMap[c.id] = c.business_name ?? c.id;
      }
      setPendingInvites((pendingRows ?? []).map(r => ({
        id: r.id,
        email: r.email,
        business_id: r.business_id,
        business_name: bizNameMap[r.business_id] ?? r.business_id,
        created_at: r.created_at,
      })));

      setUsers(authUsers.map((u: any) => ({
        id: u.id,
        email: u.email ?? '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        provider: u.app_metadata?.provider,
        businesses: userBizMap[u.id] ?? [],
        full_name: u.user_metadata?.full_name || u.user_metadata?.name,
      })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Delete user ────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!supabaseAdmin || !confirmDeleteId) return;
    setDeleting(true);
    try {
      // Remove from business accounts (regular client)
      const { error: err1 } = await supabase.from('car_business_accounts').delete().eq('user_id', confirmDeleteId);
      if (err1) throw err1;
      // Remove as owner (regular client)
      const { error: err2 } = await supabase.from('car_clients').update({ user_id: null }).eq('user_id', confirmDeleteId);
      if (err2) throw err2;
      // Delete from auth (remains admin client)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(confirmDeleteId);
      if (error) throw error;
      setUsers(p => p.filter(u => u.id !== confirmDeleteId));
      setConfirmDeleteId(null);
      showToast('Usuario eliminado ✓');
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Delete pending invitation ───────────────────────────────────────────
  const handleDeletePending = async () => {
    if (!confirmDeletePendingId) return;
    setDeletingPending(true);
    try {
      const { error } = await supabase
        .from('car_business_accounts')
        .delete()
        .eq('id', confirmDeletePendingId);
      if (error) throw error;
      setPendingInvites(p => p.filter(i => i.id !== confirmDeletePendingId));
      setConfirmDeletePendingId(null);
      showToast('Pre-invitación eliminada ✓');
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setDeletingPending(false);
    }
  };


  // ─── Accept / associate user to business ────────────────────────────────
  const handleAccept = async () => {
    if (!acceptUserId || !acceptBizId) return;
    setAccepting(true);
    try {
      const user = users.find(u => u.id === acceptUserId);
      if (!user) throw new Error('Usuario no encontrado');

      // Insert in car_business_accounts (linking by user_id AND email for Google fallback) using regular client (RLS)
      const { error } = await supabase.from('car_business_accounts').insert({
        business_id: acceptBizId,
        user_id: acceptUserId,
        email: user.email,
      });
      if (error) throw error;

      showToast('Usuario asociado al negocio ✓');
      setAcceptUserId(null);
      setAcceptBizId('');
      load();
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setAccepting(false);
    }
  };

  // ─── Add new Google pre-invitation ──────────────────────────────────────
  const handleAddInvitation = async () => {
    if (!newEmail || !newBizId) return;
    setAdding(true);
    setAddError('');
    try {
      const email = newEmail.trim().toLowerCase();

      // Check if email already has an entry in business accounts for this biz (regular client)
      const { data: existing, error: errExist } = await supabase
        .from('car_business_accounts')
        .select('id')
        .eq('email', email)
        .eq('business_id', newBizId)
        .maybeSingle();

      if (errExist) throw errExist;
      if (existing) throw new Error('Ese email ya está asociado a este negocio');

      // Insert pre-invitation with user_id = null (regular client)
      // When user logs in with Google, the auth context matches by email
      const { error } = await supabase.from('car_business_accounts').insert({
        business_id: newBizId,
        user_id: null,
        email,
      });
      if (error) throw error;

      showToast('Pre-invitación registrada ✓ — cuando ingrese con Google tendrá acceso automático');
      setNewEmail('');
      setNewBizId('');
      setShowAddForm(false);
      load();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  // ─── Create user with email + password ───────────────────────────────────
  // Converts a plain username to email just like the login page does
  const toAuthEmail = (input: string) => {
    const clean = input.trim().toLowerCase();
    return clean.includes('@') ? clean : `${clean}@algoritmia.team`;
  };

  const handleCreateUser = async () => {
    if (!createEmail || !createPassword) return;
    setCreating(true);
    setCreateError('');
    try {
      const email = toAuthEmail(createEmail);
      if (createPassword.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
      // Validate the username has no spaces or invalid chars
      const usernameRaw = createEmail.trim();
      if (!usernameRaw.includes('@') && !/^[a-zA-Z0-9._-]+$/.test(usernameRaw)) {
        throw new Error('El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos');
      }

      // 1. Create auth user via backend (email_confirm = true so they can log in immediately)
      const { data: createdData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: createPassword,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      const newUserId = createdData?.user?.id;
      if (!newUserId) throw new Error('No se obtuvo el ID del usuario creado');

      // 2. If a business was selected, associate the new user
      if (createBizId) {
        const { error: assocErr } = await supabase.from('car_business_accounts').insert({
          business_id: createBizId,
          user_id: newUserId,
          email,
        });
        if (assocErr) throw assocErr;
      }

      const displayName = createEmail.trim().includes('@') ? email : createEmail.trim();
      showToast(`Usuario "${displayName}" creado ✓`);
      setCreateEmail('');
      setCreatePassword('');
      setCreateBizId('');
      setShowCreateForm(false);
      load();
    } catch (err: any) {
      setCreateError(err.message || 'Error al crear el usuario');
    } finally {
      setCreating(false);
    }
  };

  // ─── Change password ────────────────────────────────────────────────────
  const handleChangePassword = async (userId: string, newPassword: string): Promise<string | null> => {
    if (!supabaseAdmin) return 'Cliente admin no disponible';
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return error.message;
    return null;
  };

  // ─── Filtered + sorted list ─────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = users.filter(u => {
      if (!search) return true;
      const q = search.toLowerCase();
      return u.email.toLowerCase().includes(q) ||
        u.businesses.some(b => b.business_name.toLowerCase().includes(q));
    });

    if (sortKey === 'date_desc') list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortKey === 'date_asc') list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else if (sortKey === 'business') list = [...list].sort((a, b) => {
      const nameA = a.businesses[0]?.business_name ?? 'zzz';
      const nameB = b.businesses[0]?.business_name ?? 'zzz';
      return nameA.localeCompare(nameB);
    });

    return list;
  }, [users, search, sortKey]);

  const withBiz = displayed.filter(u => u.businesses.length > 0);
  const withoutBiz = displayed.filter(u => u.businesses.length === 0);
  const acceptUser = users.find(u => u.id === acceptUserId);
  const confirmDeleteUser = users.find(u => u.id === confirmDeleteId);

  if (!profile?.is_admin || isViewingAs) return null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 right-5 sm:top-6 sm:right-6 z-[9999] px-4 py-3 rounded-2xl shadow-xl text-[13px] font-bold text-white animate-in slide-in-from-top-2 duration-300 ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => !deleting && setConfirmDeleteId(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-700 shadow-2xl p-7 max-w-[380px] w-full animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-[16px] font-bold text-center text-zinc-900 dark:text-white mb-1">¿Eliminar usuario?</h3>
            <p className="text-[12px] text-center text-zinc-500 dark:text-zinc-400 mb-5">
              Se eliminará <span className="font-bold text-zinc-700 dark:text-zinc-300">{confirmDeleteUser?.email}</span> de Supabase Auth y se desvinculará de todos sus negocios. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                className="flex-1 h-11 rounded-[12px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-11 rounded-[12px] bg-red-500 hover:bg-red-600 text-white text-[13px] font-bold shadow-lg shadow-red-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accept/Associate modal */}
      {acceptUserId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => !accepting && setAcceptUserId(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-700 shadow-2xl p-7 max-w-[420px] w-full animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="text-[16px] font-bold text-center text-zinc-900 dark:text-white mb-1">Aceptar usuario</h3>
            <p className="text-[12px] text-center text-zinc-500 dark:text-zinc-400 mb-5">
              Asociá <span className="font-bold text-zinc-700 dark:text-zinc-300">{acceptUser?.email}</span> a un negocio para darle acceso.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Negocio</label>
                <select
                  value={acceptBizId}
                  onChange={e => setAcceptBizId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[13px] text-zinc-900 dark:text-zinc-100 px-3 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                >
                  <option value="">Seleccionar negocio…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setAcceptUserId(null); setAcceptBizId(''); }}
                disabled={accepting}
                className="flex-1 h-11 rounded-[12px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleAccept}
                disabled={accepting || !acceptBizId}
                className="flex-1 h-11 rounded-[12px] bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-bold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Asociar y dar acceso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete pending invite confirmation modal */}
      {confirmDeletePendingId !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => !deletingPending && setConfirmDeletePendingId(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-700 shadow-2xl p-7 max-w-[380px] w-full animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-[16px] font-bold text-center text-zinc-900 dark:text-white mb-1">¿Eliminar pre-invitación?</h3>
            <p className="text-[12px] text-center text-zinc-500 dark:text-zinc-400 mb-5">
              Se eliminará <span className="font-bold text-zinc-700 dark:text-zinc-300">{pendingInvites.find(i => i.id === confirmDeletePendingId)?.email}</span> de la lista de espera. Si el usuario ya ingresó no se verá afectado.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeletePendingId(null)}
                disabled={deletingPending}
                className="flex-1 h-11 rounded-[12px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeletePending}
                disabled={deletingPending}
                className="flex-1 h-11 rounded-[12px] bg-red-500 hover:bg-red-600 text-white text-[13px] font-bold shadow-lg shadow-red-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div>
          <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight">Gestión de Usuarios</h1>
          <p className="text-[13px] text-zinc-400 mt-0.5">Usuarios registrados, asociaciones a negocios y pre-invitaciones Google</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setShowCreateForm(v => !v); setShowAddForm(false); }}
            className={`h-9 px-4 rounded-xl text-[12px] font-bold flex items-center gap-2 transition-all ${showCreateForm ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20'}`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Crear usuario
          </button>
          <button
            onClick={() => { setShowAddForm(v => !v); setShowCreateForm(false); }}
            className={`h-9 px-4 rounded-xl text-[12px] font-bold flex items-center gap-2 transition-all ${showAddForm ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200' : 'bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20'}`}
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar pre-invitación
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 pl-8 pr-8 w-48 sm:w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[12px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Create user form (email + password) ── */}
      {showCreateForm && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/30 p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-[13px] font-black text-emerald-800 dark:text-emerald-300">Crear usuario con contraseña</h2>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-500">— podrá ingresar de inmediato con su usuario o email</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1.5">Usuario o Email</label>
              <input
                type="text"
                placeholder="juanperez o juan@email.com"
                value={createEmail}
                onChange={e => setCreateEmail(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full h-10 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 px-3 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
              {createEmail.trim() && !createEmail.includes('@') && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                  Se registrará como: <span className="font-bold">{createEmail.trim().toLowerCase()}@algoritmia.team</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={createShowPwd ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  className="w-full h-10 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 px-3 pr-9 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setCreateShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  {createShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1.5">Negocio (opcional)</label>
              <select
                value={createBizId}
                onChange={e => setCreateBizId(e.target.value)}
                className="w-full h-10 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 px-3 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              >
                <option value="">Sin negocio asignado</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {createError && <p className="text-[11px] text-red-500 font-semibold">{createError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowCreateForm(false); setCreateEmail(''); setCreatePassword(''); setCreateBizId(''); setCreateError(''); }} className="h-9 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[12px] font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
              Cancelar
            </button>
            <button
              onClick={handleCreateUser}
              disabled={creating || !createEmail || !createPassword}
              className="h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-md shadow-emerald-500/20"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Crear usuario
            </button>
          </div>
        </div>
      )}

      {/* ── Add form (Google pre-invite) ── */}
      {showAddForm && (
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-950/30 p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <h2 className="text-[13px] font-black text-violet-800 dark:text-violet-300">Pre-invitación Google</h2>
            <p className="text-[11px] text-violet-500 dark:text-violet-400">— cuando el usuario inicie sesión con Google con este email, tendrá acceso automático</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider block mb-1.5">Email de Google</label>
              <input
                type="email"
                placeholder="cliente@gmail.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full h-10 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 px-3 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider block mb-1.5">Negocio</label>
              <select
                value={newBizId}
                onChange={e => setNewBizId(e.target.value)}
                className="w-full h-10 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 px-3 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
              >
                <option value="">Seleccionar negocio…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {addError && <p className="text-[11px] text-red-500 font-semibold">{addError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAddForm(false); setNewEmail(''); setNewBizId(''); setAddError(''); }} className="h-9 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[12px] font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
              Cancelar
            </button>
            <button
              onClick={handleAddInvitation}
              disabled={adding || !newEmail || !newBizId}
              className="h-9 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-md shadow-violet-500/20"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Registrar invitación
            </button>
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total usuarios', value: users.length, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
          { label: 'Con acceso', value: users.filter(u => u.businesses.length > 0).length, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Sin negocio', value: users.filter(u => u.businesses.length === 0).length, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
          { label: 'Invit. pendientes', value: pendingInvites.length, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
        ].map(stat => (
          <div key={stat.label} className={`rounded-2xl ${stat.bg} border border-black/[0.04] dark:border-white/[0.04] px-5 py-4`}>
            <p className={`text-[26px] font-black ${stat.color} leading-none`}>{stat.value}</p>
            <p className="text-[11px] font-semibold text-zinc-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Sort controls ── */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Ordenar:</span>
        {([
          { key: 'date_desc', label: 'Más recientes', icon: SortDesc },
          { key: 'date_asc',  label: 'Más antiguos',  icon: SortAsc },
          { key: 'business',  label: 'Por negocio',   icon: Building2 },
        ] as { key: SortKey; label: string; icon: any }[]).map(opt => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              onClick={() => setSortKey(opt.key)}
              className={`h-7 px-3 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                sortKey === opt.key
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Icon className="w-3 h-3" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
        </div>
      ) : (
        <>
          {/* Pre-invitaciones pendientes (user_id IS NULL) */}
          {pendingInvites.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.18em] flex items-center gap-2">
                <UserPlus className="w-3.5 h-3.5" />
                Pre-invitaciones pendientes de primer ingreso ({pendingInvites.length})
              </h2>
              <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 overflow-hidden bg-white dark:bg-zinc-900/50">
                {pendingInvites.map((inv, i) => (
                  <div
                    key={inv.id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      i < pendingInvites.length - 1 ? 'border-b border-blue-100 dark:border-blue-900/40' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-sm shadow-blue-500/20">
                      {inv.email.slice(0, 2).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{inv.email}</span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 uppercase tracking-wide">Google pendiente</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-zinc-400">
                          Negocio: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{inv.business_name}</span>
                        </span>
                        <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                          <CalendarDays className="w-2.5 h-2.5" />
                          {timeAgo(inv.created_at)}
                        </span>
                      </div>
                    </div>
                    {/* Delete */}
                    <button
                      onClick={() => setConfirmDeletePendingId(inv.id)}
                      className="h-7 w-7 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center transition-all flex-shrink-0"
                      title="Eliminar pre-invitación"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {withoutBiz.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-[0.18em] flex items-center gap-2">
                <UserX className="w-3.5 h-3.5" />
                Pendientes de aprobación ({withoutBiz.length})
              </h2>
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 overflow-hidden bg-white dark:bg-zinc-900/50">
                {withoutBiz.map((user, i) => (
                  <UserRowItem
                    key={user.id}
                    user={user}
                    isLast={i === withoutBiz.length - 1}
                    expanded={expandedId === user.id}
                    onToggle={() => setExpandedId(expandedId === user.id ? null : user.id)}
                    onDelete={() => setConfirmDeleteId(user.id)}
                    onAccept={() => { setAcceptUserId(user.id); setAcceptBizId(''); }}
                    onChangePassword={handleChangePassword}
                    showAccept
                  />
                ))}
              </div>
            </section>
          )}

          {withBiz.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.18em] flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                Usuarios con acceso ({withBiz.length})
              </h2>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50">
                {withBiz.map((user, i) => (
                  <UserRowItem
                    key={user.id}
                    user={user}
                    isLast={i === withBiz.length - 1}
                    expanded={expandedId === user.id}
                    onToggle={() => setExpandedId(expandedId === user.id ? null : user.id)}
                    onDelete={() => setConfirmDeleteId(user.id)}
                    onAccept={() => { setAcceptUserId(user.id); setAcceptBizId(''); }}
                    onChangePassword={handleChangePassword}
                    showAccept={false}
                  />
                ))}
              </div>
            </section>
          )}

          {displayed.length === 0 && pendingInvites.length === 0 && (
            <div className="text-center py-16 text-zinc-400">
              <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-[13px] font-semibold">No se encontraron usuarios</p>
              {search && <p className="text-[11px] mt-1">Probá con otro término</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── UserRowItem sub-component ────────────────────────────────────────────────
function UserRowItem({
  user, isLast, expanded, onToggle, onDelete, onAccept, onChangePassword, showAccept,
}: {
  user: UserRow;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAccept: () => void;
  onChangePassword: (userId: string, password: string) => Promise<string | null>;
  showAccept: boolean;
}) {
  const [newPwd, setNewPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const handlePwdChange = async () => {
    if (newPwd.length < 6) { setPwdError('Mínimo 6 caracteres'); return; }
    setPwdLoading(true);
    setPwdError('');
    setPwdSuccess(false);
    const err = await onChangePassword(user.id, newPwd);
    if (err) {
      setPwdError(err);
    } else {
      setPwdSuccess(true);
      setNewPwd('');
      setTimeout(() => setPwdSuccess(false), 3000);
    }
    setPwdLoading(false);
  };

  return (
    <>
      <div className={`flex items-center gap-3 px-4 py-3 transition-colors group ${!isLast ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}`}>
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-sm shadow-violet-500/20 cursor-pointer" onClick={onToggle}>
          {user.email.slice(0, 2).toUpperCase()}
        </div>

        {/* Email + meta */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 truncate">
              {user.full_name ? `${user.full_name} (${user.email})` : user.email}
            </span>
            <ProviderBadge provider={user.provider} />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
              <CalendarDays className="w-2.5 h-2.5" />
              {new Date(user.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })}
            </span>
            {user.last_sign_in_at && (
              <span className="text-[10px] text-zinc-400">Último: {timeAgo(user.last_sign_in_at)}</span>
            )}
          </div>
        </div>

        {/* Business pills */}
        <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end max-w-[200px] cursor-pointer" onClick={onToggle}>
          {user.businesses.length === 0 ? (
            <span className="text-[10px] text-amber-500 font-semibold italic">Sin negocio</span>
          ) : (
            <>
              {user.businesses.slice(0, 2).map(b => (
                <span key={b.business_id} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  b.role === 'owner'
                    ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}>
                  {b.business_name}
                </span>
              ))}
              {user.businesses.length > 2 && <span className="text-[10px] text-zinc-400">+{user.businesses.length - 2}</span>}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {showAccept && (
            <button
              onClick={onAccept}
              className="h-7 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black flex items-center gap-1 transition-all shadow-sm shadow-emerald-500/20"
              title="Asociar a un negocio"
            >
              <CheckCircle2 className="w-3 h-3" />
              Aceptar
            </button>
          )}
          <button
            onClick={onDelete}
            className="h-7 w-7 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center transition-all"
            title="Eliminar usuario"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onToggle} className="h-7 w-7 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-all">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className={`px-4 pb-4 pt-3 bg-zinc-50/60 dark:bg-zinc-800/20 space-y-4 ${!isLast ? 'border-b border-zinc-100 dark:border-zinc-800' : ''}`}>

          {/* Cambiar contraseña */}
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" /> Cambiar contraseña
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-[280px]">
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Nueva contraseña (mín. 6 caracteres)"
                  value={newPwd}
                  onChange={e => { setNewPwd(e.target.value); setPwdError(''); setPwdSuccess(false); }}
                  onKeyDown={e => e.key === 'Enter' && handlePwdChange()}
                  className="w-full h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[12px] text-zinc-900 dark:text-zinc-100 px-3 pr-9 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handlePwdChange}
                disabled={pwdLoading || !newPwd}
                className="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-sm shadow-violet-500/20"
              >
                {pwdLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Guardar
              </button>
            </div>
            {pwdError && <p className="text-[11px] text-red-500 font-semibold mt-1.5">{pwdError}</p>}
            {pwdSuccess && <p className="text-[11px] text-emerald-500 font-semibold mt-1.5">✓ Contraseña actualizada</p>}
          </div>

          {/* Negocios asociados */}
          {user.businesses.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Negocios asociados</p>
              <div className="space-y-1.5">
                {user.businesses.map(b => (
                  <div key={b.business_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 shadow-sm">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${b.role === 'owner' ? 'bg-violet-100 dark:bg-violet-500/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                      <Building2 className={`w-3.5 h-3.5 ${b.role === 'owner' ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{b.business_name}</p>
                      <p className="text-[10px] text-zinc-400">{b.role === 'owner' ? '👑 Propietario' : '👤 Secundario'}</p>
                    </div>
                    {b.website_url && (
                      <a href={b.website_url.startsWith('http') ? b.website_url : `https://${b.website_url}`} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 flex-shrink-0">
                        <Link2 className="w-3 h-3" />Web
                      </a>
                    )}
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 ${b.role === 'owner' ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                      {b.role === 'owner' ? 'Owner' : 'Secundario'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-1 border-t border-zinc-150 dark:border-zinc-800">
            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">ID Supabase</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">{user.id}</p>
          </div>
        </div>
      )}
    </>
  );
}
