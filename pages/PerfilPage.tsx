import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import {
  User, Camera, KeyRound, Eye, EyeOff, CheckCircle2,
  AlertTriangle, Loader2, Mail, CalendarDays, Shield,
  Pencil, X, Save, LogOut
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';

function timeAgo(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed top-16 right-4 sm:top-6 sm:right-6 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-[13px] font-bold text-white animate-in slide-in-from-top-2 duration-300 ${type === 'success' ? 'bg-emerald-600' : 'bg-red-500'}`}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

export default function PerfilPage() {
  const { user, profile, signOut } = useAuth();
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  // ── Avatar ────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Display name ─────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || ''
  );
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  // ── Password ──────────────────────────────────────────────────────────────
  const [showPwdSection, setShowPwdSection] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState('');

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type });

  const isGoogleUser = user?.app_metadata?.provider === 'google';
  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.slice(0, 2).toUpperCase() ?? '??');

  // ── Handle avatar upload ──────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('La imagen no puede superar 3MB', 'error');
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('profiles')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('profiles').getPublicUrl(path);
      const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

      const { error: updateErr } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });
      if (updateErr) throw updateErr;

      setAvatarUrl(publicUrl);
      showToast('Foto de perfil actualizada ✓');
    } catch (err: any) {
      showToast(err.message || 'Error al subir la imagen', 'error');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Handle display name save ──────────────────────────────────────────────
  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName.trim(), name: displayName.trim() }
      });
      if (error) throw error;
      setEditingName(false);
      showToast('Nombre actualizado ✓');
    } catch (err: any) {
      showToast(err.message || 'Error al guardar el nombre', 'error');
    } finally {
      setSavingName(false);
    }
  };

  // ── Handle password change ────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPwdError('');
    if (newPwd.length < 6) { setPwdError('La contraseña nueva debe tener al menos 6 caracteres'); return; }
    if (newPwd !== confirmPwd) { setPwdError('Las contraseñas no coinciden'); return; }
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;

      setNewPwd(''); setConfirmPwd('');
      setShowPwdSection(false);
      showToast('Contraseña cambiada correctamente ✓');
    } catch (err: any) {
      setPwdError(err.message || 'Error al cambiar la contraseña');
    } finally {
      setSavingPwd(false);
    }
  };

  const inputClass = `w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 px-3 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all`;

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-in fade-in duration-300 pb-20">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight">Mi Perfil</h1>
        <p className="text-[13px] text-zinc-400 mt-0.5">Configurá tu cuenta, foto e información personal</p>
      </div>

      {/* Avatar + name card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[28px] font-black text-white">{initials}</span>
              )}
            </div>
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-lg shadow-violet-500/30 transition-all hover:scale-110 active:scale-95 disabled:opacity-60"
              title="Cambiar foto"
            >
              {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Name + email */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                  autoFocus
                  className="flex-1 h-9 rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 text-[14px] font-bold text-zinc-900 dark:text-white px-3 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName || !displayName.trim()}
                  className="h-9 w-9 rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center transition-all disabled:opacity-50"
                >
                  {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="h-9 w-9 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 flex items-center justify-center transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <p className="text-[18px] font-black text-zinc-900 dark:text-white">
                  {displayName || 'Sin nombre'}
                </p>
                <button
                  onClick={() => setEditingName(true)}
                  className="p-1 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all"
                  title="Editar nombre"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-1.5 justify-center sm:justify-start">
              <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{user?.email}</p>
            </div>

            <div className="flex items-center gap-1.5 mt-1 justify-center sm:justify-start">
              <CalendarDays className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <p className="text-[11px] text-zinc-400">Cuenta creada el {timeAgo(user?.created_at)}</p>
            </div>

            {isGoogleUser && (
              <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google Account
              </span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-zinc-400 mt-4 text-center sm:text-left">
          📷 Formatos aceptados: JPG, PNG, WEBP · Máximo 3 MB
        </p>
      </div>

      {/* Password section */}
      {!isGoogleUser && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => { setShowPwdSection(v => !v); setPwdError(''); setNewPwd(''); setConfirmPwd(''); }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <KeyRound className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[13px] font-bold text-zinc-900 dark:text-white">Cambiar contraseña</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Actualizá tu contraseña de acceso</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${showPwdSection ? 'border-amber-500 bg-amber-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
              {showPwdSection && <X className="w-3 h-3 text-white" />}
            </div>
          </button>

          {showPwdSection && (
            <div className="px-5 pb-5 space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* New */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Nueva contraseña</label>
                <div className="relative">
                  <input type={showNew ? 'text' : 'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Mínimo 6 caracteres" className={inputClass + ' pr-9'} />
                  <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {/* Confirm */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Confirmar contraseña</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Repetí la nueva contraseña" className={`${inputClass} pr-9 ${confirmPwd && confirmPwd !== newPwd ? 'border-red-400 focus:border-red-400 focus:ring-red-400' : ''}`} />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPwd && confirmPwd !== newPwd && (
                  <p className="text-[10px] text-red-500 font-semibold mt-1">Las contraseñas no coinciden</p>
                )}
              </div>

              {pwdError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold">{pwdError}</p>
                </div>
              )}

              <button
                onClick={handleChangePassword}
                disabled={savingPwd || !newPwd || !confirmPwd || newPwd !== confirmPwd}
                className="w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md shadow-amber-500/20"
              >
                {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Cambiar contraseña
              </button>
            </div>
          )}
        </div>
      )}

      {isGoogleUser && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-2xl p-4 flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-500 shrink-0" />
          <div>
            <p className="text-[12px] font-bold text-blue-700 dark:text-blue-300">Cuenta administrada por Google</p>
            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">Tu contraseña se gestiona desde tu cuenta de Google. No es posible cambiarla desde aquí.</p>
          </div>
        </div>
      )}

      {/* Account info */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
        <p className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.18em]">Información de cuenta</p>
        <div className="space-y-2.5">
          {[
            { label: 'Email', value: user?.email ?? '—' },
            { label: 'ID de usuario', value: user?.id ? user.id.slice(0, 18) + '…' : '—', mono: true },
            { label: 'Proveedor', value: isGoogleUser ? 'Google' : 'Email / Contraseña' },
            { label: 'Negocio', value: profile?.business_name ?? '—' },
            { label: 'Último acceso', value: timeAgo(user?.last_sign_in_at) || '—' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-50 dark:border-zinc-800 last:border-0">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide shrink-0">{row.label}</span>
              <span className={`text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 text-right truncate ${row.mono ? 'font-mono text-[11px]' : ''}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div className="bg-white dark:bg-zinc-900 border border-red-100 dark:border-red-900/30 rounded-2xl p-5">
        <p className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.18em] mb-3">Sesión</p>
        <button
          onClick={() => signOut()}
          className="w-full h-10 rounded-xl border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-[13px] font-bold flex items-center justify-center gap-2 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
