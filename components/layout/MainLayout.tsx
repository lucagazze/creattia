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
    const msg = String(error?.message || error || '');
    if (
      msg.includes('Loading chunk') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Failed to fetch dynamically imported module')
    ) {
      // Stale Vercel deploy — clear cache and reload once
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-[15px] font-bold text-zinc-700 dark:text-zinc-300">Error al cargar esta sección</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[13px] font-bold hover:opacity-90 transition-all"
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

// Lazy-loaded pages — each becomes a separate JS chunk (code splitting)
// Only the page the user navigates to gets downloaded
const DashboardPage      = lazy(() => import('../../pages/DashboardPage'));
const CaptacionPage      = lazy(() => import('../../pages/CaptacionPage'));
const AtencionPage       = lazy(() => import('../../pages/AtencionPage'));
const MensajeriaPage     = lazy(() => import('../../pages/MensajeriaPage'));
const RetencionPage      = lazy(() => import('../../pages/RetencionPage'));
const TiendaPage         = lazy(() => import('../../pages/TiendaPage'));
const LinksPage          = lazy(() => import('../../pages/LinksPage'));
const ReportsPage        = lazy(() => import('../../pages/ReportsPage'));
const AdminPage          = lazy(() => import('../../pages/AdminPage'));
const MetaAdsPage        = lazy(() => import('../../pages/MetaAdsPage'));
const ActivityPage       = lazy(() => import('../../pages/ActivityPage'));
const EmailLibraryPage   = lazy(() => import('../../pages/EmailLibraryPage'));
const EmailMarketingPage = lazy(() => import('../../pages/EmailMarketingPage'));
const EmailMonitorPage   = lazy(() => import('../../pages/EmailMonitorPage'));
const RedesSocialesPage  = lazy(() => import('../../pages/RedesSocialesPage'));
const MensajesDMPage     = lazy(() => import('../../pages/MensajesDMPage'));
const ComentariosPage    = lazy(() => import('../../pages/ComentariosPage'));
const CerebroPage        = lazy(() => import('../../pages/CerebroPage'));
const EntradasPage       = lazy(() => import('../../pages/EntradasPage'));
const ContactosPage      = lazy(() => import('../../pages/ContactosPage'));
const InformesPage       = lazy(() => import('../../pages/InformesPage'));
const CostosPage         = lazy(() => import('../../pages/CostosPage'));


// Minimal skeleton shown while a lazy page chunk is downloading
const PageSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1,2,3,4].map(n => (
        <div key={n} className="h-28 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl" />
      ))}
    </div>
    <div className="h-64 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl" />
  </div>
);

export const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();
  const { profile } = useAuth();
  const location = useLocation();

  // Load client-specific token into metaAds cache
  useEffect(() => {
    const clientToken = (profile as any)?.fb_page_access_token;
    const clientPageId = (profile as any)?.fb_page_id;
    if (clientPageId && clientToken) {
      metaAds.setClientPageToken(clientPageId, clientToken);
    }
  }, [profile]);

  const isFixedPage = location.pathname === '/mensajeria' || location.pathname === '/atencion';

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
              className="p-2 -ml-1.5 rounded-[8px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
            >
              <Menu className="w-[18px] h-[18px]" />
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
                : 'bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
            title="Cambiar apariencia"
          >
            {darkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
        </div>

        <div className={`flex-1 w-full print:overflow-visible print:h-auto print:p-6 ${
          location.pathname === '/atencion' || location.pathname === '/mensajeria' || location.pathname === '/contactos'
            ? 'overflow-hidden p-0 h-[calc(100vh-56px)] md:h-screen flex flex-col'
            : isFixedPage 
              ? 'overflow-hidden p-4 md:p-6 h-[calc(100vh-56px)] md:h-screen flex flex-col' 
              : 'overflow-auto p-4 md:p-8 lg:p-10 pb-8'
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
              <Route path="/admin/actividad" element={<ActivityPage />} />
              <Route path="/admin/meta" element={<MetaAdsPage />} />
              <Route path="/admin/emails" element={<EmailLibraryPage />} />
              <Route path="/admin/email-monitor" element={<EmailMonitorPage />} />
              <Route path="/email-marketing" element={<EmailMarketingPage />} />
              <Route path="/entradas" element={<EntradasPage />} />
              <Route path="/cerebro" element={<CerebroPage />} />
              <Route path="/contactos" element={<ContactosPage />} />
              <Route path="/informes" element={<InformesPage />} />
              <Route path="/costos" element={<CostosPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </RouteErrorBoundary>
        </div>
        {location.pathname !== '/atencion' && location.pathname !== '/mensajeria' && location.pathname !== '/contactos' && <AIChatFloat />}
      </main>
    </div>
  );
};
