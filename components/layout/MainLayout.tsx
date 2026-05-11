import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';

// Pages
import DashboardPage from '../../pages/DashboardPage';
import CaptacionPage from '../../pages/CaptacionPage';
import AtencionPage from '../../pages/AtencionPage';
import RetencionPage from '../../pages/RetencionPage';
import LinksPage from '../../pages/LinksPage';
import ReportsPage from '../../pages/ReportsPage';
import AdminPage from '../../pages/AdminPage';
import MetaAdsPage from '../../pages/MetaAdsPage';

export const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark';
    setDarkMode(isDark);
    if (isDark) document.documentElement.classList.add('dark');
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

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
        <div className="md:hidden h-14 border-b border-black/[0.06] dark:border-white/[0.05] flex items-center px-4 bg-white/80 dark:bg-[#161618]/80 backdrop-blur-xl sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1.5 rounded-[8px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>
          <span className="ml-2 text-[15px] font-semibold text-zinc-900 dark:text-white tracking-[-0.02em]">
            Portal C.A.R
          </span>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10 max-w-[1400px] mx-auto w-full pb-24 md:pb-10">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/captacion" element={<CaptacionPage />} />
            <Route path="/atencion" element={<AtencionPage />} />
            <Route path="/retencion" element={<RetencionPage />} />
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
