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
import { db } from '../../services/db';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const MetaLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M16.92 7.76c-1.34 0-2.6.58-3.48 1.62-.88-1.04-2.14-1.62-3.48-1.62-2.58 0-4.66 2.08-4.66 4.66s2.08 4.66 4.66 4.66c1.34 0 2.6-.58 3.48-1.62.88 1.04 2.14 1.62 3.48 1.62 2.58 0 4.66-2.08 4.66-4.66s-2.08-4.66-4.66-4.66zm0 7.32c-1.46 0-2.65-1.19-2.65-2.65s1.19-2.65 2.65-2.65 2.65 1.19 2.65 2.65-1.19 2.65-2.65 2.65zm-7.04 0C8.42 15.08 7.23 13.89 7.23 12.43s1.19-2.65 2.65-2.65 2.65 1.19 2.65 2.65-1.19 2.65-2.65 2.65z" />
  </svg>
);

const KlaviyoLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M5.04 3h3.6v18h-3.6zM10.8 11.28h3.6V21h-3.6zM16.56 3h3.6v8.28h-3.6zM10.8 3h3.6v6.12h-3.6z" />
  </svg>
);

const ShopifyLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M18.7 6.1L12.3.4C12.1.2 11.9.2 11.7.4L5.3 6.1c-.2.2-.3.4-.2.7l2.1 14.8c0 .2.2.4.4.4h8.8c.2 0 .4-.2.4-.4l2.1-14.8c0-.3-.1-.5-.2-.7zM12 2.6l4.2 3.8H7.8L12 2.6z" />
  </svg>
);

const TiendanubeLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M19.36 10.04a6 6 0 0 0-11.32-1.58 4.5 4.5 0 0 0-2.54 8.24h14.16a4.5 4.5 0 0 0-.3-6.66z" />
  </svg>
);

const WordpressLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.11 17.65c-2.48 0-4.63-1.28-5.86-3.21l3.35-9.15.02.01c.78 2.36 1.34 4.09 1.68 5.16.51 1.61.98 2.65 1.41 3.59l-.6 3.6zm1.19-.07l.86-3.29c.35-1.12.65-2.28 1-3.6.46-1.57.85-2.61 1.18-3.6l.08.31c.4 1.49.7 2.63 1 3.79l-4.12 6.39zm-9.08-3.79C3.12 14.54 2.5 13.34 2.5 12c0-2.4 1-4.57 2.6-6.14l4.24 11.66-5.12-1.73zm8.38-11.89c.35 0 .66.21.66.56 0 .3-.17.52-.39.78-.34.39-.73.86-.73 1.61 0 .6.3 1.07.6 1.63.34.6.73 1.25.73 2.15 0 .82-.3 1.46-.6 2.06l-3.24-9.35a7.35 7.35 0 0 1 5.98.56zm4.84.44a7.43 7.43 0 0 1 1.78 4.7c0 1.94-.75 3.7-1.98 5.02l-4.22-12.16c2.02.51 3.52 1.43 4.42 2.44z" />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, darkMode, toggleDarkMode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, user } = useAuth();
  const { viewAsProfile, setViewAsProfile, isViewingAs } = useViewAs();
  const { unreadCount, pendingCommentsCount, commentsLoading, unreadLoading, pendingOrdersCount, ordersLoading } = useUnread();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [hasLinks, setHasLinks] = useState(false);

  // Use viewAsProfile if active, otherwise use real profile
  const activeProfile = isViewingAs ? viewAsProfile : profile;

  React.useEffect(() => {
    if (!activeProfile?.id) {
      setHasLinks(false);
      return;
    }
    db.links.getByClientId(activeProfile.id)
      .then(data => {
        setHasLinks(data && data.length > 0);
      })
      .catch(err => {
        console.error("Error loading links in sidebar:", err);
        setHasLinks(false);
      });
  }, [activeProfile?.id]);

  const detectedPlatform = React.useMemo(() => {
    const prof: any = activeProfile;
    const platform = prof?.ecommerce_platform;
    if (platform === 'shopify' && prof?.shopify_domain && prof?.shopify_access_token) return 'shopify';
    if (platform === 'wordpress' && prof?.wordpress_url && prof?.woo_consumer_key && prof?.woo_consumer_secret) return 'wordpress';
    if (platform === 'tiendanube' && prof?.tiendanube_store_id && prof?.tiendanube_access_token) return 'tiendanube';
    return null;
  }, [activeProfile]);

  // Channel flags — based on what the client has configured
  const hasChatwoot  = !!(activeProfile?.chatwoot_url && activeProfile?.chatwoot_token);
  const hasMeta      = !!(activeProfile?.meta_account_id);
  const hasKlaviyo   = !!(activeProfile?.klaviyo_api_key);
  const connectionStatuses = activeProfile?.connection_statuses || {};
  const hasEcommerce = !!(
    activeProfile?.ecommerce_platform &&
    (connectionStatuses.shopify === 'ok' || connectionStatuses.shopify === 'connected')
  );
  const hasRedes = !!(
    activeProfile?.fb_page_id ||
    (activeProfile as any)?.ig_business_id
  );

  // Admins always see all pages (including unconfigured ones, shown dimmed)
  const isAdmin = !!(profile?.is_admin);
  const hasMercadoLibre = (activeProfile as any)?.connection_statuses?.mercadolibre === 'ok';

  // Sidebar Menu Items
  const principalItems = [
    { path: '/',               icon: Home,          label: 'Inicio',          configured: true },
    { path: '/mensajeria',     icon: MessageSquare, label: 'Mensajería',      configured: hasChatwoot, badge: unreadCount },
    { path: '/entradas',       icon: Inbox,         label: 'Bandejas de Entrada', configured: hasChatwoot },
    { path: '/comentarios',    icon: MessageCircle, label: 'Comentarios',     configured: hasRedes, badge: pendingCommentsCount },
    { path: '/redes-sociales', icon: Instagram,     label: 'Redes Sociales',  configured: hasRedes },
    { path: '/pedidos',        icon: ShoppingCart,  label: 'Pedidos',         configured: hasEcommerce, badge: pendingOrdersCount, badgeLoading: ordersLoading },
    { path: '/inventario',     icon: Package,       label: 'Inventario',      configured: hasEcommerce },
    { path: '/clientes',       icon: Users,         label: 'Clientes',        configured: hasEcommerce },
  ].filter(i => isAdmin || i.configured);

  const metricasItems = [
    { path: '/tienda',       icon: ShoppingBag,   label: 'Tienda Online', configured: hasEcommerce },
    { path: '/mercadolibre', icon: ShoppingBag,   label: 'Mercado Libre', configured: hasMercadoLibre },
    { path: '/captacion',    icon: BarChart2,     label: 'Meta Ads',     configured: hasMeta },
    { path: '/atencion',     icon: MessageCircle, label: 'Atención',      configured: hasChatwoot },
    { path: '/retencion',    icon: Mail,          label: 'Email Marketing',     configured: hasKlaviyo },
  ].filter(i => isAdmin || i.configured);

  const activosItems = [
    { path: '/analisis-productos',  icon: BarChart2,  label: 'Análisis Productos', configured: hasEcommerce },
    { path: '/admin/meta',          icon: Target,     label: 'Creativos Ads',      configured: hasMeta },
    { path: '/email-marketing',     icon: Send,       label: 'Plantillas Email',   configured: hasKlaviyo },
  ].filter(i => isAdmin || i.configured);

  const configuracionItems = [
    { path: '/perfil',           icon: User,   label: 'Mi Perfil',      configured: true },
    { path: '/links',            icon: Link2,  label: 'Mis Accesos',    configured: hasLinks },
    { path: '/integraciones',    icon: Workflow, label: 'Integraciones',  configured: true },
    { path: '/cerebro',          icon: Brain,  label: 'Cerebro de IA',  configured: true, adminOnly: true },
  ].filter(i => (!i.adminOnly || isAdmin) && (isAdmin || i.configured));

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
    const isMetaAds = item.label === 'Meta Ads';
    const isTiendaOnline = item.label === 'Tienda Online';
    const isEmailMarketing = item.label === 'Email Marketing';
    const isMercadoLibre = item.label === 'Mercado Libre';

    const renderIcon = () => {
      const className = `w-4 h-4 flex-shrink-0 transition-all duration-150 ${
        isActive
          ? (isMetaAds
              ? 'text-[#0081fb]'
              : isEmailMarketing
                ? 'text-[#15B374]'
                : isTiendaOnline
                  ? (detectedPlatform === 'shopify'
                      ? 'text-[#95BF47]'
                      : detectedPlatform === 'tiendanube'
                        ? 'text-[#4c53c0]'
                        : detectedPlatform === 'wordpress'
                          ? 'text-[#21759b]'
                          : 'text-white dark:text-zinc-950')
                  : 'text-white dark:text-zinc-950')
          : isUnconfigured
            ? 'text-zinc-350 dark:text-zinc-600'
            : isMetaAds
              ? 'text-[#0081fb]'
              : isEmailMarketing
                ? 'text-[#15B374] group-hover:scale-110'
                : isTiendaOnline
                  ? (detectedPlatform === 'shopify'
                      ? 'text-[#95BF47] group-hover:scale-110'
                      : detectedPlatform === 'tiendanube'
                        ? 'text-[#4c53c0] group-hover:scale-110'
                        : detectedPlatform === 'wordpress'
                          ? 'text-[#21759b] group-hover:scale-110'
                          : 'text-zinc-450 dark:text-zinc-550 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 group-hover:scale-110')
                  : 'text-zinc-450 dark:text-zinc-550 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 group-hover:scale-110'
      }`;

      if (isMetaAds) {
        return <img src="/assets/meta (1).webp" alt="Meta" className="w-4 h-4 object-contain flex-shrink-0 transition-all duration-150 group-hover:scale-110" />;
      }
      if (isEmailMarketing) {
        return <img src="/assets/Klaviyo-Logo-Photoroom.webp" alt="Klaviyo" className="w-4 h-4 object-contain flex-shrink-0 transition-all duration-150 group-hover:scale-110" />;
      }
      if (isMercadoLibre) {
        return <img src="/assets/logomercadolibre.png" alt="Mercado Libre" className="w-4 h-4 object-contain flex-shrink-0 transition-all duration-150 group-hover:scale-110" />;
      }
      if (isTiendaOnline) {
        if (detectedPlatform === 'shopify') return <img src="/assets/shopify-bag.webp" alt="Shopify" className="w-4 h-4 object-contain flex-shrink-0 transition-all duration-150 group-hover:scale-110" />;
        if (detectedPlatform === 'tiendanube') {
          const showDarkLogo = isActive ? darkMode : !darkMode;
          return <img src={showDarkLogo ? "/assets/tiendanubeoscuro.png" : "/assets/tiendanube.webp"} alt="Tiendanube" className="w-4 h-4 object-contain flex-shrink-0 transition-all duration-150 group-hover:scale-110" />;
        }
        if (detectedPlatform === 'wordpress') return <img src="/assets/logowordpress.webp" alt="WooCommerce" className="w-4 h-4 object-contain flex-shrink-0 transition-all duration-150 group-hover:scale-110" />;
        return <ShoppingBag className={className} />;
      }

      return <Icon className={className} />;
    };

    return (
      <Link
        key={item.path}
        to={item.path}
        title={isUnconfigured ? `${item.label} (no configurado)` : item.label}
        onClick={() => window.innerWidth < 768 && setIsOpen(false)}
        className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[11px] md:text-[12px] font-bold transition-all duration-150 active:scale-[0.98] ${
          isActive
            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-md shadow-black/10 dark:shadow-white/5'
            : isUnconfigured
              ? 'text-zinc-350 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/[0.03] opacity-50'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.05] hover:shadow-sm'
        }`}
      >
        {renderIcon()}
        <span className="tracking-tight flex-1">{item.label}</span>
        {/* Unread badge / Loading spinner */}
        {((item.path === '/comentarios' && commentsLoading) || (item.path === '/mensajeria' && unreadLoading) || (item.path === '/pedidos' && ordersLoading)) ? (
          <Loader2 className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 animate-spin shrink-0" />
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
        {isActive && !badgeCount && !item.badgeLoading && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 dark:bg-violet-400" />}
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
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
              Principal
            </p>
            {principalItems.map(item => renderItem(item))}
          </div>

          {/* Metricas — solo si hay al menos 1 item */}
          {metricasItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
                Metricas
              </p>
              {metricasItems.map(item => renderItem(item))}
            </div>
          )}

          {/* Activos — solo si hay al menos 1 item */}
          {activosItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
                Activos
              </p>
              {activosItems.map(item => renderItem(item))}
            </div>
          )}

          {/* Configuración */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
              Configuración
            </p>
            {configuracionItems.map(item => renderItem(item))}
          </div>

          {/* Administración */}
          {profile?.is_admin && !isViewingAs && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-[0.2em] px-3.5 mb-2.5 flex items-center gap-2 select-none">
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
