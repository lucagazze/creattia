import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, BarChart2, Mail, Link2, FileText, Sun, Moon, X, LogOut, MessageCircle, Shield, ShoppingBag, Zap
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, darkMode, toggleDarkMode }) => {
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const navItems = [
    { path: '/',          icon: Home,      label: 'Inicio', condition: true },
    { path: '/captacion', icon: BarChart2, label: 'C — Captación', condition: !!profile?.meta_account_id },
    { path: '/atencion',  icon: MessageCircle, label: 'A — Atención', condition: !!profile?.chatwoot_token },
    { path: '/retencion', icon: Mail,      label: 'R — Retención', condition: !!profile?.klaviyo_api_key },
    { path: '/tienda',    icon: ShoppingBag, label: 'Tienda Online', condition: !!(profile as any)?.ecommerce_platform },
    { path: '/links',     icon: Link2,     label: 'Mis Accesos', condition: true },
    { path: '/reportes',  icon: FileText,  label: 'Reportes', condition: true },
  ].filter(item => item.condition);

  const initials = profile?.business_name
    ? profile.business_name.slice(0, 2).toUpperCase()
    : '??';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-md z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-[240px]
        bg-white dark:bg-[#09090b]
        border-r border-zinc-200 dark:border-white/[0.05]
        flex flex-col
        transform transition-all duration-300 ease-in-out
        md:translate-x-0 md:static md:h-screen
        ${isOpen ? 'translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.2)]' : '-translate-x-full'}
      `}>

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
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
              title="Cambiar apariencia"
            >
              {darkMode ? <Sun className="w-4.5 h-4.5 text-amber-400" /> : <Moon className="w-4.5 h-4.5" />}
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
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-black/10 dark:shadow-white/5'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-200'
                  }`} />
                  <span className="tracking-tight">{label}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />}
                </Link>
              );
            })}
          </div>

          {/* Admin Section */}
          {profile?.is_admin && (
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
                to="/admin/meta"
                onClick={() => window.innerWidth < 768 && setIsOpen(false)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 ${
                  location.pathname === '/admin/meta'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/5'
                }`}
              >
                <BarChart2 className="w-[18px] h-[18px]" />
                <span>Meta Ads Global</span>
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
                {profile?.business_name || 'Mi Empresa'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Online</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={signOut}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
