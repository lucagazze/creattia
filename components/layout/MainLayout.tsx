import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

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
    const msg = String(error?.message || error || '').toLowerCase();
    if (
      msg.includes('loading chunk') ||
      msg.includes('chunkloaderror') ||
      msg.includes('failed to fetch') ||
      msg.includes('module script') ||
      msg.includes('load failed') ||
      msg.includes('dynamically imported') ||
      msg.includes('dynamic import')
    ) {
      // Stale Vercel/Vite deploy or network drop — clear cache and reload once
      window.location.reload();
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
            className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shadow-sm"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Menu, Sun, Moon, AlertCircle, Globe, Check, Loader2, Building2, Clock, ArrowRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { AIChatFloat } from '../AIChatFloat';
import { useTheme } from '../../contexts/ThemeContext';
import { metaAds } from '../../services/metaAds';
import { AppleLoader } from '../ui/AppleLoader';
import { TopLoadingBar } from '../ui/TopLoadingBar';
import { CenteredPageLoader } from '../ui/CenteredPageLoader';
import { useUnread } from '../../contexts/UnreadContext';

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
const MensajesDMPage     = lazyWithRetry(() => import('../../pages/MensajesDMPage'));
const ComentariosPage    = lazyWithRetry(() => import('../../pages/ComentariosPage'));
const CerebroPage        = lazyWithRetry(() => import('../../pages/CerebroPage'));
const EntradasPage       = lazyWithRetry(() => import('../../pages/EntradasPage'));
const ContactosPage      = lazyWithRetry(() => import('../../pages/ContactosPage'));
const InformesPage       = lazyWithRetry(() => import('../../pages/InformesPage'));
const CostosPage         = lazyWithRetry(() => import('../../pages/CostosPage'));
const InventarioPage     = lazyWithRetry(() => import('../../pages/InventarioPage'));
const PedidosPage        = lazyWithRetry(() => import('../../pages/PedidosPage'));
const PerfilPage         = lazyWithRetry(() => import('../../pages/PerfilPage'));


import { useViewAs } from '../../contexts/ViewAsContext';

// Loader within the content area — sidebar stays visible
const PageSkeleton = () => (
  <CenteredPageLoader isLoading={true}>{null}</CenteredPageLoader>
);

export const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();
  const { profile, signOut, user } = useAuth();
  const { isViewingAs, viewAsProfile } = useViewAs();
  const activeProfile = isViewingAs ? viewAsProfile : profile;
  const { unreadCount } = useUnread();
  const location = useLocation();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Scroll to top on navigation/page transition
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [savingBusinessName, setSavingBusinessName] = useState(false);
  const [businessNameSaved, setBusinessNameSaved] = useState(false);

  // Sync existing metadata business name / website url on mount
  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name);
    } else if (user?.user_metadata?.name) {
      setFullName(user.user_metadata.name);
    }

    if (user?.user_metadata?.business_name_request) {
      setBusinessName(user.user_metadata.business_name_request);
      setBusinessNameSaved(true);
    } else if (user?.user_metadata?.website_url) {
      setBusinessName(user.user_metadata.website_url);
      setBusinessNameSaved(true);
    }
  }, [user]);

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

  }, [activeProfile]);

  const handleSaveBusinessName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !fullName.trim()) return;
    setSavingBusinessName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          business_name_request: businessName.trim(),
          website_url: businessName.trim() // store in both for backward compatibility in table columns
        }
      });
      if (error) throw error;
      setBusinessNameSaved(true);
    } catch (err: any) {
      console.error("Error updating business name:", err);
    } finally {
      setSavingBusinessName(false);
    }
  };

  // Guard: if profile is null (and loading is false, which is guaranteed here), show onboarding / pending screen
  if (!profile) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 text-center ${
        darkMode ? 'bg-[#080808]' : 'bg-[#f2f2f7]'
      }`}>
        <div className={`max-w-md w-full rounded-[24px] p-8 border shadow-xl text-zinc-900 dark:text-white transition-all ${
          darkMode
            ? 'bg-white/[0.04] border-white/[0.07] shadow-2xl'
            : 'bg-white border-zinc-200/60 shadow-zinc-200/40'
        }`}>
          {!businessNameSaved ? (
            // Phase 1: Guided step-by-step registration requesting name and business url
            <form onSubmit={handleSaveBusinessName} className="space-y-6">
              <div className="w-12 h-12 rounded-[16px] bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center mx-auto">
                <Building2 className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="text-[18px] font-bold mb-1.5">Registro de Acceso</h2>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Para ingresar al ecosistema de Algoritmia, por favor completá tus datos <strong className="text-violet-500 dark:text-violet-400 font-bold">por única vez</strong> para enviar la solicitud de acceso.
                </p>
              </div>

              <div className="text-left space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  Nombre completo
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="ej. Juan Pérez"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={savingBusinessName}
                    className={`w-full h-11 px-4 rounded-xl border text-[13px] outline-none transition-all font-medium ${
                      darkMode
                        ? 'bg-white/5 border-white/8 text-white focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/60'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500'
                    }`}
                  />
                </div>
              </div>

              <div className="text-left space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  Nombre del negocio
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="ej. Mi Negocio"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    disabled={savingBusinessName}
                    className={`w-full h-11 px-4 rounded-xl border text-[13px] outline-none transition-all font-medium ${
                      darkMode
                        ? 'bg-white/5 border-white/8 text-white focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/60'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500'
                    }`}
                  />
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="submit"
                  disabled={savingBusinessName || !businessName.trim() || !fullName.trim()}
                  className={`w-full h-11 flex items-center justify-center gap-2 rounded-xl text-[13px] font-bold transition-all disabled:opacity-50 ${
                    darkMode
                      ? 'bg-white text-black hover:bg-zinc-100 shadow-md'
                      : 'bg-zinc-900 text-white hover:bg-black shadow-md shadow-zinc-900/10'
                  }`}
                >
                  {savingBusinessName ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Enviar Solicitud</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => signOut()}
                  className={`w-full h-11 rounded-xl text-[13px] font-bold border transition-all ${
                    darkMode
                      ? 'border-white/8 hover:bg-white/5 text-zinc-400'
                      : 'border-zinc-200 hover:bg-zinc-50 text-zinc-500'
                  }`}
                >
                  Cerrar sesión
                </button>
              </div>
            </form>
          ) : (
            // Phase 2: Pending Approval indicator screen
            <div className="space-y-6">
              <div className="w-12 h-12 rounded-[16px] bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h2 className="text-[18px] font-bold mb-1.5 text-center">Solicitud de Acceso Enviada</h2>
                <div className="text-[13px] text-zinc-500 dark:text-zinc-400 space-y-4 leading-relaxed text-center">
                  <p>
                    Tu solicitud para vincular el negocio <strong className="text-zinc-800 dark:text-zinc-200">"{businessName}"</strong> ha sido registrada con éxito.
                  </p>
                  <div className="bg-zinc-50 dark:bg-zinc-800/40 p-3.5 rounded-2xl border border-zinc-100/50 dark:border-zinc-800/60 text-left text-[12px] text-zinc-600 dark:text-zinc-300">
                    <span className="font-bold text-amber-600 dark:text-amber-400 block mb-1">💬 ¿Qué pasa ahora?</span>
                    Te enviaremos una notificación por <strong>WhatsApp</strong> en cuanto el administrador apruebe tu acceso. Una vez que la recibas, ya podrás ingresar al ecosistema.
                  </div>
                  <p className="font-bold text-violet-500 dark:text-violet-400 text-[13.5px]">
                    Ya podés cerrar esta pestaña o salir del sitio.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/60 text-center">
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-[11px] font-bold text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors uppercase tracking-wider"
                >
                  Salir / Cambiar cuenta de Google
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isFixedPage = location.pathname === '/mensajeria';

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 transition-colors duration-300 print:bg-white">
      <div className="print:hidden">
        <Sidebar
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen relative print:overflow-visible print:h-auto">
        {/* Mobile header — fixed so it never scrolls away */}
        <div className="print:hidden md:hidden h-14 border-b border-black/[0.06] dark:border-white/[0.05] flex items-center justify-between px-4 bg-white/80 dark:bg-[#161618]/80 backdrop-blur-xl fixed top-0 inset-x-0 z-[200]">
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
                ? 'bg-zinc-900 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800' 
                : 'bg-white border-zinc-200 text-zinc-650 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
            title="Cambiar apariencia"
          >
            {darkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
        </div>

        <div ref={scrollContainerRef} className={`flex-1 w-full print:overflow-visible print:h-auto print:p-6 ${
          location.pathname === '/mensajeria' || location.pathname === '/contactos'
            ? 'overflow-hidden p-0 h-[calc(100dvh-56px)] md:h-screen flex flex-col'
            : isFixedPage 
              ? 'overflow-hidden p-4 md:p-6 h-[calc(100dvh-56px)] md:h-screen flex flex-col' 
              : 'overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 md:p-8 lg:p-10 pb-8'
        }`}>
          {/* Spacer so content starts below the fixed mobile header */}
          <div className="h-14 md:hidden" />
          <RouteErrorBoundary key={location.pathname}>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
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
              <Route path="/admin/usuarios" element={profile?.is_admin && !isViewingAs ? <AdminUsersPage /> : <Navigate to="/" replace />} />
              <Route path="/admin/actividad" element={<ActivityPage />} />
              <Route path="/admin/meta" element={<MetaAdsPage />} />
              <Route path="/admin/emails" element={<EmailLibraryPage />} />
              <Route path="/admin/email-monitor" element={<EmailMonitorPage />} />
              <Route path="/email-marketing" element={<EmailMarketingPage />} />
              <Route path="/entradas" element={<EntradasPage />} />
              <Route path="/cerebro" element={profile?.is_admin ? <CerebroPage /> : <Navigate to="/" replace />} />
              <Route path="/pedidos" element={<PedidosPage />} />
              <Route path="/inventario" element={<InventarioPage />} />
              <Route path="/analisis-productos" element={<Navigate to="/tienda" replace />} />
              <Route path="/contactos" element={<ContactosPage />} />
              <Route path="/informes" element={<InformesPage />} />
              <Route 
                path="/costos" 
                element={profile?.is_admin && !isViewingAs ? <CostosPage /> : <Navigate to="/" replace />} 
              />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </RouteErrorBoundary>
        </div>
        {location.pathname !== '/mensajeria' && location.pathname !== '/contactos' && <AIChatFloat />}
      </main>
    </div>
  );
};
