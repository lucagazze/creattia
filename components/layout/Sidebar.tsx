import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, BarChart2, Mail, Link2, FileText, Sun, Moon, X, LogOut, MessageCircle, Shield, ShoppingBag,
  AlertTriangle, Activity, Library, Workflow, Instagram, Inbox, MessageSquare, Brain, Users, Package,
  Calculator, Coins, Target, Send, Zap, Building2, Loader2, User, ShoppingCart
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useViewAs } from '../../contexts/ViewAsContext';
import { useUnread } from '../../contexts/UnreadContext';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, darkMode, toggleDarkMode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, user } = useAuth();
  const { viewAsProfile, setViewAsProfile, isViewingAs } = useViewAs();
  const { unreadCount, pendingCommentsCount, commentsLoading, unreadLoading, pendingOrdersCount, ordersLoading } = useUnread();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Use viewAsProfile if active, otherwise use real profile
  const activeProfile = isViewingAs ? viewAsProfile : profile;

  // Channel flags — based on what the client has configured
  const hasChatwoot  = !!(activeProfile?.chatwoot_url && activeProfile?.chatwoot_token);
  const hasMeta      = !!(activeProfile?.meta_account_id);
  const hasKlaviyo   = !!(activeProfile?.klaviyo_api_key);
  const hasEcommerce = !!(
    activeProfile?.shopify_domain ||
    activeProfile?.tiendanube_store_id ||
    (activeProfile as any)?.wordpress_url ||
    activeProfile?.ecommerce_platform === 'wordpress'
  );
  const hasRedes = !!(
    activeProfile?.fb_page_id ||
    (activeProfile as any)?.ig_business_id
  );

  // Admins always see all pages (including unconfigured ones, shown dimmed)
  const isAdmin = !!(profile?.is_admin);

  // Sidebar Menu Items
  const principalItems = [
    { path: '/',               icon: Home,          label: 'Inicio',          configured: true },
    { path: '/mensajeria',     icon: MessageSquare, label: 'Mensajería',      configured: hasChatwoot, badge: unreadCount },
    { path: '/comentarios',    icon: MessageCircle, label: 'Comentarios',     configured: hasRedes, badge: pendingCommentsCount },
    { path: '/redes-sociales', icon: Instagram,     label: 'Redes Sociales',  configured: hasRedes },
    { path: '/contactos',      icon: Users,         label: 'Contactos',       configured: hasChatwoot },
    { path: '/pedidos',         icon: ShoppingCart,  label: 'Pedidos',         configured: hasEcommerce, badge: pendingOrdersCount, badgeLoading: ordersLoading },
    { path: '/inventario',     icon: Package,       label: 'Inventario',      configured: hasEcommerce },
  ].filter(i => isAdmin || i.configured);

  const metricasItems = [
    { path: '/tienda',    icon: ShoppingBag,   label: 'Tienda Online', configured: hasEcommerce },
    { path: '/captacion', icon: BarChart2,     label: 'Captación',     configured: hasMeta },
    { path: '/atencion',  icon: MessageCircle, label: 'Atención',      configured: hasChatwoot },
    { path: '/retencion', icon: Mail,          label: 'Retención',     configured: hasKlaviyo },
  ].filter(i => isAdmin || i.configured);

  const activosItems = [
    { path: '/admin/meta',      icon: Target, label: 'Creativos Ads',    configured: hasMeta },
    { path: '/email-marketing', icon: Send,   label: 'Email Marketing',  configured: hasKlaviyo },
  ].filter(i => isAdmin || i.configured);

  const configuracionItems = [
    { path: '/perfil',           icon: User,   label: 'Mi Perfil',      configured: true },
    { path: '/links',            icon: Link2,  label: 'Mis Accesos',    configured: true },
    { path: '/cerebro',          icon: Brain,  label: 'Cerebro de IA',  configured: true, adminOnly: true },
  ].filter(i => !i.adminOnly || isAdmin);

  const adminItems = [
    { path: '/admin',                  icon: Building2, label: 'Gestión Negocios' },
    { path: '/admin/usuarios',         icon: Users,     label: 'Gestión Usuarios' },
    { path: '/admin/actividad',        icon: Activity,  label: 'Monitoreo Actividad' },
    { path: '/admin/emails',           icon: Library,   label: 'Email Library' },
    { path: '/admin/email-monitor',    icon: Workflow,  label: 'Email Monitor' },
    { path: '/costos',                 icon: Coins,     label: 'Costos' },
  ];

  const isActivePath = (itemPath: string) => {
    const [path, search] = itemPath.split('?');
    if (search) {
      return location.pathname === path && location.search === `?${search}`;
    }
    if (path === '/') {
      return location.pathname === '/';
    }
    // Exact match for /admin to avoid it activating for /admin/usuarios etc.
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const userDisplayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Usuario';
  const initials = userDisplayName
    ? userDisplayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  const handleSignOut = async () => {
    setShowLogoutModal(false);
    await signOut();
  };

  const exitViewAs = () => {
    setViewAsProfile(null);
    navigate('/admin');
    setIsOpen(false);
  };

  const renderItem = (item: { path: string; icon: any; label: string; badge?: number; badgeLoading?: boolean; configured?: boolean }) => {
    const Icon = item.icon;
    const isActive = isActivePath(item.path);
    const badgeCount = (item.badge ?? 0);
    const isUnconfigured = isAdmin && item.configured === false;
    return (
      <Link
        key={item.path}
        to={item.path}
        title={isUnconfigured ? `${item.label} (no configurado)` : item.label}
        onClick={() => window.innerWidth < 768 && setIsOpen(false)}
        className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-bold transition-all duration-150 active:scale-[0.98] ${
          isActive
            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-md shadow-black/10 dark:shadow-white/5'
            : isUnconfigured
              ? 'text-zinc-350 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/[0.03] opacity-50'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.05] hover:shadow-sm'
        }`}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 transition-all duration-150 ${
          isActive
            ? 'text-white dark:text-zinc-950'
            : isUnconfigured
              ? 'text-zinc-350 dark:text-zinc-600'
              : 'text-zinc-450 dark:text-zinc-500 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 group-hover:scale-110'
        }`} />
        <span className="tracking-tight flex-1">{item.label}</span>
        {/* Unread badge / Loading spinner */}
        {((item.path === '/comentarios' && commentsLoading) || (item.path === '/mensajeria' && unreadLoading) || (item.path === '/pedidos' && ordersLoading)) ? (
          <Loader2 className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400 animate-spin shrink-0" />
        ) : badgeCount > 0 ? (
          <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm shadow-red-500/30 animate-in fade-in zoom-in-90 duration-300">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        ) : null}
        {/* Unconfigured indicator for admins */}
        {isUnconfigured && !isActive && (
          <span className="flex-shrink-0 w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
        )}
        {isActive && !badgeCount && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 dark:bg-violet-400" />}
      </Link>
    );
  };


  return (
    <>
      {/* Logout confirmation modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={() => setShowLogoutModal(false)}>
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
        fixed inset-y-0 left-0 z-[300] md:w-[220px] w-[220px]
        bg-white dark:bg-[#09090b]
        border-r border-zinc-200 dark:border-white/[0.05]
        flex flex-col
        transform transition-all duration-300 ease-in-out
        md:translate-x-0 md:static md:h-screen
        ${isOpen ? 'translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.2)]' : '-translate-x-full'}
      `}>

        {/* View-as banner */}
        {isViewingAs && profile?.is_admin && (
          <div className="flex-shrink-0 mx-3 mt-3 bg-violet-600 rounded-[10px] px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-violet-200 uppercase tracking-widest animate-in fade-in duration-200">Viendo como</p>
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
        <div className="h-[72px] flex items-center px-5 border-b border-zinc-100 dark:border-white/[0.03] flex-shrink-0">
          <div className="flex items-center gap-2.5 group">
            <img 
              src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} 
              alt="Algoritmia" 
              className="w-9 h-9 object-contain group-hover:scale-110 transition-transform drop-shadow-sm"
            />
            <div className="flex flex-col animate-in fade-in duration-200">
              <span className="text-[13px] font-black text-zinc-900 dark:text-white tracking-tighter leading-none uppercase">ALGORITMIA</span>
              <span className="text-[9px] font-bold text-violet-500 tracking-[0.2em] mt-1 uppercase">Gestión</span>
            </div>
          </div>
          
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggleDarkMode}
              className="hidden md:block p-1.5 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
              title="Cambiar apariencia"
            >
              {darkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
            <button
              className="md:hidden p-1.5 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-7 scrollbar-hide">
          
          {/* Principal */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
              Principal
            </p>
            {principalItems.map(item => renderItem(item))}
          </div>

          {/* Metricas — solo si hay al menos 1 item */}
          {metricasItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Metricas
              </p>
              {metricasItems.map(item => renderItem(item))}
            </div>
          )}

          {/* Activos — solo si hay al menos 1 item */}
          {activosItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Activos
              </p>
              {activosItems.map(item => renderItem(item))}
            </div>
          )}

          {/* Configuración */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Configuración
            </p>
            {configuracionItems.map(item => renderItem(item))}
          </div>

          {/* Administración */}
          {profile?.is_admin && !isViewingAs && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Administración
              </p>
              {adminItems.map(item => renderItem(item))}
            </div>
          )}
        </nav>

        {/* Footer Info */}
        <div className="flex-shrink-0 p-3 border-t border-zinc-100 dark:border-white/[0.03] bg-zinc-50/50 dark:bg-white/[0.01]">
          <div className="flex items-center gap-2.5 bg-white dark:bg-[#111] p-2.5 rounded-xl border border-zinc-200 dark:border-white/[0.05] shadow-sm">
            <Link
              to="/perfil"
              onClick={() => window.innerWidth < 768 && setIsOpen(false)}
              className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-85 active:scale-[0.98] transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-zinc-800 to-black dark:from-zinc-200 dark:to-white text-white dark:text-black flex items-center justify-center text-[11px] font-black shadow-inner overflow-hidden shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-bold text-zinc-900 dark:text-white truncate">
                  {userDisplayName}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-zinc-400 truncate block max-w-[130px]">
                    {activeProfile?.business_name || 'Mi Empresa'}
                  </span>
                </div>
              </div>
            </Link>
            {!isViewingAs && (
              <button
                onClick={() => setShowLogoutModal(true)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex-shrink-0"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
