import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, BarChart2, Mail, Link2, FileText, Sun, Moon, X, LogOut, MessageCircle, Shield, ShoppingBag, AlertTriangle, Activity, Library, Workflow
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useViewAs } from '../../contexts/ViewAsContext';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, darkMode, toggleDarkMode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { viewAsProfile, setViewAsProfile, isViewingAs } = useViewAs();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Use viewAsProfile if active, otherwise use real profile
  const activeProfile = isViewingAs ? viewAsProfile : profile;

  const hasTag = (tag: string) => {
    if (!activeProfile) return false;
    const tags = (activeProfile as any).client_tags;
    // Default to 'tienda_online' if no tags exist
    if (!tags || tags.length === 0) return tag === 'tienda_online';
    return tags.includes(tag);
  };

  const navItems = [
    { path: '/',          icon: Home,          label: 'Inicio',         condition: true },
    { path: '/captacion', icon: BarChart2,      label: 'C — Captación',  condition: !!activeProfile?.meta_account_id },
    { path: '/atencion',  icon: MessageCircle,  label: 'A — Atención',   condition: !!activeProfile?.chatwoot_token },
    { path: '/retencion', icon: Mail,           label: 'R — Retención',  condition: !!activeProfile?.klaviyo_api_key && hasTag('tienda_online') },
    { path: '/tienda',    icon: ShoppingBag,    label: 'Tienda Online',  condition: !!(activeProfile as any)?.ecommerce_platform && hasTag('tienda_online') },
    { path: '/links',           icon: Link2,    label: 'Mis Accesos',      condition: true },
    { path: '/email-marketing', icon: Mail,     label: 'Email Marketing',  condition: true },
    { path: '/reportes',        icon: FileText, label: 'Reportes',         condition: true },
  ].filter(item => item.condition);

  const initials = activeProfile?.business_name
    ? activeProfile.business_name.slice(0, 2).toUpperCase()
    : '??';

  const handleSignOut = async () => {
    setShowLogoutModal(false);
    await signOut();
  };

  const exitViewAs = () => {
    setViewAsProfile(null);
    navigate('/admin');
    setIsOpen(false);
  };

  return (
    <>
      {/* Logout confirmation modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowLogoutModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-700 shadow-2xl p-8 max-w-[360px] w-full text-center animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white mb-2">¿Cerrar sesión?</h2>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-6">
              Vas a salir del portal. Tendrás que volver a ingresar con tu usuario y contraseña.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 h-11 rounded-[12px] border border-zinc-200 dark:border-zinc-700 text-[13px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSignOut}
                className="flex-1 h-11 rounded-[12px] bg-red-500 hover:bg-red-600 text-white text-[13px] font-bold shadow-lg shadow-red-500/20 transition-all"
              >
                Sí, cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-md z-[280] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-[300] w-[240px]
        bg-white dark:bg-[#09090b]
        border-r border-zinc-200 dark:border-white/[0.05]
        flex flex-col
        transform transition-all duration-300 ease-in-out
        md:translate-x-0 md:static md:h-screen
        ${isOpen ? 'translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.2)]' : '-translate-x-full'}
      `}>

        {/* View-as banner */}
        {isViewingAs && (
          <div className="flex-shrink-0 mx-3 mt-3 bg-violet-600 rounded-[10px] px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-violet-200 uppercase tracking-widest">Viendo como</p>
              <p className="text-[12px] font-bold text-white truncate">{viewAsProfile?.business_name}</p>
            </div>
            <button
              onClick={exitViewAs}
              className="flex-shrink-0 p-1 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all"
              title="Volver al admin"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Logo / Brand */}
        <div className="h-[72px] flex items-center px-6 border-b border-zinc-100 dark:border-white/[0.03] flex-shrink-0">
          <div className="flex items-center gap-3 group">
            <img 
              src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} 
              alt="Algoritmia" 
              className="w-10 h-10 object-contain group-hover:scale-110 transition-transform drop-shadow-sm"
            />
            <div className="flex flex-col">
              <span className="text-[14px] font-black text-zinc-900 dark:text-white tracking-tighter leading-none uppercase">ALGORITMIA</span>
              <span className="text-[10px] font-bold text-violet-500 tracking-[0.2em] mt-1 uppercase">Gestión</span>
            </div>
          </div>
          
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggleDarkMode}
              className="hidden md:block p-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
              title="Cambiar apariencia"
            >
              {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              className="md:hidden p-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8 scrollbar-hide">
          {/* Main Section */}
          <div className="space-y-1">
            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] px-3 mb-4">
              Mi Dashboard
            </p>
            {navItems.map(({ path, icon: Icon, label }) => {
              const isActive = location.pathname === path ||
                (path !== '/' && location.pathname.startsWith(path));
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => window.innerWidth < 768 && setIsOpen(false)}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-150 active:scale-[0.98] ${
                    isActive
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-black/15 dark:shadow-white/5'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06] hover:shadow-sm'
                  }`}
                >
                  <Icon className={`w-[17px] h-[17px] flex-shrink-0 transition-all duration-150 ${
                    isActive
                      ? 'text-white dark:text-zinc-900'
                      : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 group-hover:scale-110'
                  }`} />
                  <span className="tracking-tight flex-1">{label}</span>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-violet-400 dark:bg-violet-500" />}
                </Link>
              );
            })}
          </div>

          {/* Admin Section — only visible when NOT viewing as another client */}
          {profile?.is_admin && !isViewingAs && (
            <div className="space-y-1">
              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] px-3 mb-4">
                Administración
              </p>
            <Link
              to="/admin"
              onClick={() => window.innerWidth < 768 && setIsOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 ${
                location.pathname === '/admin'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/5'
              }`}
            >
              <Shield className="w-[18px] h-[18px]" />
              <span>Gestión Clientes</span>
            </Link>
            <Link
              to="/admin/actividad"
              onClick={() => window.innerWidth < 768 && setIsOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 ${
                location.pathname === '/admin/actividad'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/5'
              }`}
            >
              <Activity className="w-[18px] h-[18px]" />
              <span>Monitoreo Actividad</span>
            </Link>
            <Link
              to="/admin/emails"
              onClick={() => window.innerWidth < 768 && setIsOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 ${
                location.pathname === '/admin/emails'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/5'
              }`}
            >
              <Library className="w-[18px] h-[18px]" />
              <span>Email Library</span>
            </Link>
            <Link
              to="/admin/email-monitor"
              onClick={() => window.innerWidth < 768 && setIsOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 ${
                location.pathname === '/admin/email-monitor'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/5'
              }`}
            >
              <Workflow className="w-[18px] h-[18px]" />
              <span>Email Monitor</span>
            </Link>
            </div>
          )}
        </nav>

        {/* Footer Info */}
        <div className="flex-shrink-0 p-4 border-t border-zinc-100 dark:border-white/[0.03] bg-zinc-50/50 dark:bg-white/[0.01]">
          <div className="flex items-center gap-3 bg-white dark:bg-[#111] p-3 rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-800 to-black dark:from-zinc-200 dark:to-white text-white dark:text-black flex items-center justify-center text-[12px] font-black shadow-inner">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">
                {activeProfile?.business_name || 'Mi Empresa'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isViewingAs ? 'bg-violet-500' : 'bg-emerald-500'}`} />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                  {isViewingAs ? 'Vista Admin' : 'Online'}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {!isViewingAs && (
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
