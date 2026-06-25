import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';

// Route-level ErrorBoundary — resets automatically on every navigation via `key`
class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any) {
    console.error('RouteErrorBoundary caught an error:', error);
    try {
      const now = Date.now();
      const lastReloadStr = sessionStorage.getItem('last_route_error_reload_time');
      const lastReload = lastReloadStr ? parseInt(lastReloadStr, 10) : 0;
      
      if (now - lastReload > 8000) {
        // Safe to try auto-reloading once
        sessionStorage.setItem('last_route_error_reload_time', String(now));
        window.location.reload();
      } else {
        // Redirection as a fallback when reload didn't fix it
        const currentPath = window.location.pathname;
        if (currentPath !== '/') {
          sessionStorage.setItem('error_redirected_from', currentPath);
          window.location.replace('/');
        }
      }
    } catch (e) {
      console.error('Error in RouteErrorBoundary recovery logic:', e);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-[15px] font-bold text-zinc-700 dark:text-zinc-300">Error al cargar esta sección</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider hover:opacity-90 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Menu, Sun, Moon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { AIChatFloat } from '../AIChatFloat';
import { useTheme } from '../../contexts/ThemeContext';
import { metaAds } from '../../services/metaAds';
import { CenteredPageLoader } from '../ui/CenteredPageLoader';
import { useUnread } from '../../contexts/UnreadContext';
import { useToast } from '../Toast';

// Retry wrapper — automatically retries downloading a lazy chunk up to 3 times
// (1 s delay between attempts). Protects against transient network drops and
// navigation-aborted fetch requests that would otherwise throw to the error boundary.
const lazyWithRetry = (componentImport: () => Promise<any>) =>
  lazy(async () => {
    const retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        return await componentImport();
      } catch (err) {
        console.warn(`Error loading chunk (attempt ${i + 1}/${retries}):`, err);
        if (i === retries - 1) {
          const msg = String((err as any)?.message || err || '').toLowerCase();
          if (
            msg.includes('loading chunk') ||
            msg.includes('chunkloaderror') ||
            msg.includes('failed to fetch') ||
            msg.includes('module script') ||
            msg.includes('load failed') ||
            msg.includes('dynamically imported') ||
            msg.includes('dynamic import')
          ) {
            console.warn('Chunk load failed after retries. Reloading page...');
            window.location.reload();
            return { default: () => null };
          }
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return componentImport();
  });

// Lazy-loaded pages — each becomes a separate JS chunk (code splitting)
// Only the page the user navigates to gets downloaded
const DashboardPage      = lazyWithRetry(() => import('../../pages/DashboardPage'));
const CaptacionPage      = lazyWithRetry(() => import('../../pages/CaptacionPage'));
const AtencionPage       = lazyWithRetry(() => import('../../pages/AtencionPage'));
const MensajeriaPage     = lazyWithRetry(() => import('../../pages/MensajeriaPage'));
const RetencionPage      = lazyWithRetry(() => import('../../pages/RetencionPage'));
const TiendaPage         = lazyWithRetry(() => import('../../pages/TiendaPage'));
const LinksPage          = lazyWithRetry(() => import('../../pages/LinksPage'));
const ReportsPage        = lazyWithRetry(() => import('../../pages/ReportsPage'));
const AdminPage          = lazyWithRetry(() => import('../../pages/AdminPage'));
const AdminUsersPage     = lazyWithRetry(() => import('../../pages/AdminUsersPage'));
const MetaAdsPage        = lazyWithRetry(() => import('../../pages/MetaAdsPage'));
const ActivityPage       = lazyWithRetry(() => import('../../pages/ActivityPage'));
const EmailLibraryPage   = lazyWithRetry(() => import('../../pages/EmailLibraryPage'));
const EmailMarketingPage = lazyWithRetry(() => import('../../pages/EmailMarketingPage'));
const EmailMonitorPage   = lazyWithRetry(() => import('../../pages/EmailMonitorPage'));
const RedesSocialesPage  = lazyWithRetry(() => import('../../pages/RedesSocialesPage'));
const ComentariosPage    = lazyWithRetry(() => import('../../pages/ComentariosPage'));
const CerebroPage        = lazyWithRetry(() => import('../../pages/CerebroPage'));
const EntradasPage       = lazyWithRetry(() => import('../../pages/EntradasPage'));
const ContactosPage      = lazyWithRetry(() => import('../../pages/ContactosPage'));
const InformesPage       = lazyWithRetry(() => import('../../pages/InformesPage'));
const CostosPage         = lazyWithRetry(() => import('../../pages/CostosPage'));
const InventarioPage     = lazyWithRetry(() => import('../../pages/InventarioPage'));
const PedidosPage        = lazyWithRetry(() => import('../../pages/PedidosPage'));
const PerfilPage         = lazyWithRetry(() => import('../../pages/PerfilPage'));
const ClientePage        = lazyWithRetry(() => import('../../pages/ClientePage'));
const AnalisisProductosPage = lazyWithRetry(() => import('../../pages/AnalisisProductosPage'));
const IntegracionesPage  = lazyWithRetry(() => import('../../pages/IntegracionesPage'));
const PrivacidadPage     = lazyWithRetry(() => import('../../pages/PrivacidadPage'));
const SoportePage        = lazyWithRetry(() => import('../../pages/SoportePage'));
const MercadoLibrePage      = lazyWithRetry(() => import('../../pages/MercadoLibrePage'));
const NotFoundPage          = lazyWithRetry(() => import('../../pages/NotFoundPage'));

import { useViewAs } from '../../contexts/ViewAsContext';
import { WelcomeGuide } from '../ui/WelcomeGuide';

export const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();
  const { profile, signOut, user, loading, refreshProfile } = useAuth();
  const { isViewingAs, viewAsProfile } = useViewAs();
  const activeProfile = isViewingAs ? viewAsProfile : profile;
  const hasEcommerce = !!(
    ((activeProfile as any)?.ecommerce_platform === 'shopify' && (activeProfile as any)?.shopify_domain && (activeProfile as any)?.shopify_access_token) ||
    ((activeProfile as any)?.ecommerce_platform === 'wordpress' && (activeProfile as any)?.wordpress_url && (activeProfile as any)?.woo_consumer_key && (activeProfile as any)?.woo_consumer_secret) ||
    ((activeProfile as any)?.ecommerce_platform === 'tiendanube' && (activeProfile as any)?.tiendanube_store_id && (activeProfile as any)?.tiendanube_access_token)
  );
  const { unreadCount, chatwootAvailable } = useUnread();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const { showToast } = useToast();

  useEffect(() => {
    document.body.classList.add('app-typography');
    return () => {
      document.body.classList.remove('app-typography');
    };
  }, []);

  // Scroll to top on navigation/page transition
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Redirect to integrations page if Shopify or other oauth redirect lands on dashboard/other routes
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const shop = searchParams.get('shop');
    const hasOauthParam = ['shopify', 'tiendanube', 'woocommerce', 'mercadolibre', 'tiktok', 'meta'].some(param => searchParams.has(param));
    if ((shop || hasOauthParam) && location.pathname !== '/integraciones') {
      navigate(`/integraciones${window.location.search}`, { replace: true });
    }
  }, [location, navigate]);

  useEffect(() => {
    if (location.pathname !== '/mensajeria') return;
    const chatwootStatus = (activeProfile as any)?.connection_statuses?.chatwoot;
    const hasHealthyChatwoot = !!(
      activeProfile?.chatwoot_url &&
      activeProfile?.chatwoot_token &&
      (chatwootStatus === 'ok' || chatwootStatus === 'connected') &&
      chatwootAvailable !== false
    );
    if (!hasHealthyChatwoot) {
      navigate('/integraciones', { replace: true });
    }
  }, [location.pathname, activeProfile, chatwootAvailable, navigate]);

  // Listen for new orders to show global notification
  useEffect(() => {
    const handleNewOrder = () => {
      if (location.pathname !== '/pedidos') {
        showToast(
          <div 
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              navigate('/pedidos');
            }}
          >
            ¡Llegó un pedido nuevo! 🛍️ <span className="underline ml-1">Ver</span>
          </div>,
          'success'
        );
      }
    };
    window.addEventListener('car_new_order_event', handleNewOrder);
    return () => window.removeEventListener('car_new_order_event', handleNewOrder);
  }, [location.pathname, showToast, navigate]);

  // Check for auto-recovery redirect from a crashed route
  useEffect(() => {
    try {
      const redirectedFrom = sessionStorage.getItem('error_redirected_from');
      if (redirectedFrom) {
        sessionStorage.removeItem('error_redirected_from');
        showToast('Hubo un problema al cargar la sección anterior. Te redirigimos al inicio.', 'warning');
      }
    } catch (e) {
      console.warn('Could not read error_redirected_from from sessionStorage', e);
    }
  }, [location.pathname, showToast]);

  // Auto-create profile for new users (Google OAuth or email signup)
  // When the profile is freshly created, redirect to integrations with welcome flag
  useEffect(() => {
    if (!profile && user && !loading) {
      fetch('/api/oauth?action=ensure-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      })
        .then(r => r.json())
        .then(data => {
          refreshProfile();
          if (data?.created) {
            navigate('/integraciones?welcome=1', { replace: true });
          }
        })
        .catch(console.error);
    }
  }, [profile, user, loading]);

  // Load client-specific token into metaAds cache
  useEffect(() => {
    const clientToken = (activeProfile as any)?.fb_page_access_token;
    const clientPageId = (activeProfile as any)?.fb_page_id;
    if (clientPageId && clientToken) {
      metaAds.setClientPageToken(clientPageId, clientToken);
    }
    if (clientPageId) {
      try {
        localStorage.setItem('active_fb_page_id', clientPageId);
      } catch (e) {
        console.warn("Storage full: could not save active_fb_page_id", e);
      }
    }

    const userToken = (activeProfile as any)?.facebook_access_token;
    if (userToken) {
      localStorage.setItem('current_facebook_access_token', userToken);
    } else {
      localStorage.removeItem('current_facebook_access_token');
    }

  }, [activeProfile]);

  // Guard: if profile is null, show loading while auto-creating via ensure-profile
  if (!profile) {
    return (
      <CenteredPageLoader isLoading={true} message="Preparando tu cuenta...">
        <div />
      </CenteredPageLoader>
    );
  }

  const isFixedPage = location.pathname === '/mensajeria';

  return (
    <div className="app-shell flex min-h-screen bg-[#f5f5f7] dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 transition-colors duration-300 print:bg-white" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className="print:hidden">
        <Sidebar
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen relative print:overflow-visible print:h-auto">
        {/* Compact header — fixed so it never scrolls away on mobile/tablet/narrow desktop */}
        <div className="print:hidden xl:hidden h-14 border-b border-black/[0.06] dark:border-white/[0.05] flex items-center justify-between px-4 bg-white/80 dark:bg-[#161618]/80 backdrop-blur-xl fixed top-0 inset-x-0 z-[200]">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-1.5 rounded-[8px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all relative"
            >
              <Menu className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-950 animate-pulse" />
              )}
            </button>
            <span className="ml-2 text-[15px] font-bold text-zinc-900 dark:text-white tracking-tight uppercase">
              ALGORITMIA <span className="text-violet-500 ml-0.5">GESTIÓN</span>
            </span>
          </div>

          <button
            onClick={toggleDarkMode}
            className={`p-1.5 rounded-[8px] border shadow-sm transition-all ${
              darkMode 
                ? 'bg-zinc-950 border-white/10 text-zinc-350 hover:text-white hover:bg-zinc-900' 
                : 'bg-white border-zinc-200 text-zinc-650 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
            title="Cambiar apariencia"
          >
            {darkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
        </div>

        <div id="main-scroll-container" ref={scrollContainerRef} className={`flex-1 w-full print:overflow-visible print:h-auto print:p-6 ${
          location.pathname === '/mensajeria' || location.pathname === '/clientes'
            ? 'overflow-hidden p-0 h-[calc(100dvh-56px)] xl:h-screen flex flex-col'
            : location.pathname === '/admin/meta'
              ? 'overflow-x-hidden overflow-y-auto px-2 py-3 sm:px-3 sm:py-4 md:p-5 xl:p-6 pb-8'
              : isFixedPage 
                ? 'overflow-hidden p-4 md:p-6 h-[calc(100dvh-56px)] xl:h-screen flex flex-col'
                : 'overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 md:p-6 xl:p-8 2xl:p-10 pb-8'
        }`}>
          {/* Spacer so content starts below the fixed mobile header */}
          <div className="h-14 xl:hidden" />
          {/* Feature announcements only appear after a new integration activates app sections. */}
          {activeProfile && (
            <WelcomeGuide profile={activeProfile} />
          )}
          <RouteErrorBoundary key={location.pathname}>
          <Suspense fallback={<CenteredPageLoader isLoading={true} message="Cargando sección..."><div /></CenteredPageLoader>}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/captacion" element={<CaptacionPage />} />
              <Route path="/redes-sociales" element={<RedesSocialesPage />} />
              <Route path="/mensajeria" element={<MensajeriaPage />} />
              <Route path="/comentarios" element={<ComentariosPage />} />
              <Route path="/atencion" element={<AtencionPage />} />
              <Route path="/retencion" element={<RetencionPage />} />
              <Route path="/tienda" element={<TiendaPage />} />
              <Route path="/links" element={<LinksPage />} />
              <Route path="/reportes" element={<ReportsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/usuarios" element={profile?.is_admin && !isViewingAs ? <AdminUsersPage /> : <Navigate to="/dashboard" replace />} />
              <Route path="/admin/actividad" element={<ActivityPage />} />
              <Route path="/admin/meta" element={<MetaAdsPage />} />
              <Route path="/admin/emails" element={<EmailLibraryPage />} />
              <Route path="/admin/email-monitor" element={<EmailMonitorPage />} />
              <Route path="/email-marketing" element={<EmailMarketingPage />} />
              <Route path="/publicador" element={<Navigate to="/dashboard" replace />} />
              <Route path="/publicaciones" element={<Navigate to="/dashboard" replace />} />
              <Route path="/entradas" element={<EntradasPage />} />
              <Route path="/cerebro" element={<CerebroPage />} />
              <Route path="/pedidos" element={<PedidosPage />} />
              <Route path="/inventario" element={<InventarioPage />} />
              <Route path="/analisis-productos" element={<AnalisisProductosPage />} />
              <Route path="/clientes" element={<ContactosPage />} />
              <Route path="/informes" element={<InformesPage />} />
              <Route 
                path="/costos" 
                element={hasEcommerce || profile?.is_admin ? <CostosPage /> : <Navigate to="/dashboard" replace />} 
              />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route path="/cliente/:email" element={<ClientePage />} />
              <Route path="/integraciones" element={<IntegracionesPage />} />
              <Route path="/mercadolibre" element={<MercadoLibrePage />} />
              <Route path="/analisis-creativo" element={<Navigate to="/dashboard" replace />} />
              <Route path="/privacidad" element={<PrivacidadPage />} />
              <Route path="/soporte" element={<SoportePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          </RouteErrorBoundary>
        </div>
        {location.pathname !== '/mensajeria' && location.pathname !== '/clientes' && <AIChatFloat />}
      </main>
    </div>
  );
};
