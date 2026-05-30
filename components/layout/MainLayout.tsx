import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
          isFixedPage 
            ? 'overflow-hidden p-4 md:p-6 h-[calc(100vh-56px)] md:h-screen flex flex-col' 
            : 'overflow-auto p-4 md:p-8 lg:p-10 pb-48 md:pb-40 xl:pb-44'
        }`}>
          {/* Spacer so content starts below the fixed mobile header */}
          <div className="h-14 md:hidden" />
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/captacion" element={<CaptacionPage />} />
              <Route path="/redes-sociales" element={<RedesSocialesPage />} />
              <Route path="/mensajeria" element={<MensajesDMPage />} />
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
              <Route path="/cerebro" element={<CerebroPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
        <AIChatFloat />
      </main>
    </div>
  );
};
