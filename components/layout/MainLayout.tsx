import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Menu, Sun, Moon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';

// Pages
import DashboardPage from '../../pages/DashboardPage';
import CaptacionPage from '../../pages/CaptacionPage';
import AtencionPage from '../../pages/AtencionPage';
import RetencionPage from '../../pages/RetencionPage';
import TiendaPage from '../../pages/TiendaPage';
import LinksPage from '../../pages/LinksPage';
import ReportsPage from '../../pages/ReportsPage';
import AdminPage from '../../pages/AdminPage';
import MetaAdsPage from '../../pages/MetaAdsPage';

import { useTheme } from '../../contexts/ThemeContext';

export const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();
  const { profile } = useAuth();

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      <Sidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen relative">
        {/* Mobile header */}
        <div className="md:hidden h-14 border-b border-black/[0.06] dark:border-white/[0.05] flex items-center justify-between px-4 bg-white/80 dark:bg-[#161618]/80 backdrop-blur-xl sticky top-0 z-30">
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

        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10 w-full pb-24 md:pb-10">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/captacion" element={<CaptacionPage />} />
            <Route path="/atencion" element={<AtencionPage />} />
            <Route path="/retencion" element={<RetencionPage />} />
            <Route path="/tienda" element={<TiendaPage />} />
            <Route path="/links" element={<LinksPage />} />
            <Route path="/reportes" element={<ReportsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/meta" element={<MetaAdsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};
