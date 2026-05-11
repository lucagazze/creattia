import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home, BarChart2, Mail, Link2, FileText, Sun, Moon, X, LogOut, MessageCircle, Shield,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const navItems = [
  { path: '/',          icon: Home,      label: 'Inicio' },
  { path: '/captacion', icon: BarChart2, label: 'C - Captación (Ads)' },
  { path: '/atencion',  icon: MessageCircle, label: 'A - Atención (IA)' },
  { path: '/retencion', icon: Mail,      label: 'R - Retención (Email)' },
  { path: '/links',     icon: Link2,     label: 'Mis Links' },
  { path: '/reportes',  icon: FileText,  label: 'Reportes' },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, darkMode, toggleDarkMode }) => {
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const initials = profile?.business_name
    ? profile.business_name.slice(0, 2).toUpperCase()
    : '??';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-[220px]
        bg-white/90 dark:bg-[#161618]/95
        backdrop-blur-2xl
        border-r border-black/[0.06] dark:border-white/[0.05]
        flex flex-col
        transform transition-transform duration-300 ease-in-out
        md:translate-x-0 md:static md:h-screen
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>

        {/* Logo / Brand */}
        <div className="h-[60px] flex items-center px-5 border-b border-black/[0.05] dark:border-white/[0.04] flex-shrink-0">
          <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-[0_2px_8px_rgba(109,40,217,0.4)]">
            <span className="text-white text-[11px] font-bold tracking-tight">C</span>
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-white tracking-[-0.02em] leading-none">Portal C.A.R</p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600 font-medium mt-0.5 tracking-wider">Algoritmia · 2026</p>
          </div>
          <button
            className="md:hidden p-1.5 rounded-[6px] text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.08em] px-3 mb-2">
            Mi Panel
          </p>
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path ||
              (path !== '/' && location.pathname.startsWith(path));
            return (
              <Link
                key={path}
                to={path}
                onClick={() => window.innerWidth < 768 && setIsOpen(false)}
                className={`group flex items-center gap-2.5 px-3 py-[7px] rounded-[8px] text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className={`w-[15px] h-[15px] flex-shrink-0 ${
                  isActive ? 'text-white dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
                }`} />
                <span className="tracking-[-0.01em]">{label}</span>
              </Link>
            );
          })}

          {/* Admin link */}
          {profile?.is_admin && (
            <div className="mt-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.04]">
              <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.08em] px-3 mb-2">
                Administración
              </p>
              <Link
                to="/admin"
                onClick={() => window.innerWidth < 768 && setIsOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-[7px] rounded-[8px] text-[13px] font-medium transition-all duration-150 ${
                  location.pathname === '/admin'
                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                }`}
              >
                <Shield className="w-[15px] h-[15px]" />
                <span>Gestión de Clientes</span>
              </Link>
              <Link
                to="/admin/meta"
                onClick={() => window.innerWidth < 768 && setIsOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-[7px] rounded-[8px] text-[13px] font-medium transition-all duration-150 ${
                  location.pathname === '/admin/meta'
                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10'
                }`}
              >
                <BarChart2 className="w-[15px] h-[15px]" />
                <span>Meta Ads Global</span>
              </Link>
            </div>
          )}

          {/* Messaging button */}
          {profile?.chatwoot_url && profile?.chatwoot_token && (
            <div className="mt-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.04]">
              <a
                href={`${profile.chatwoot_url}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 px-3 py-[7px] rounded-[8px] text-[13px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all"
              >
                <MessageCircle className="w-[15px] h-[15px]" />
                <span className="tracking-[-0.01em]">Contactar soporte</span>
                <span className="ml-auto w-2 h-2 bg-emerald-500 rounded-full live-dot" />
              </a>
            </div>
          )}
        </nav>

        {/* Footer: user + dark mode */}
        <div className="flex-shrink-0 px-3 py-3 border-t border-black/[0.05] dark:border-white/[0.04]">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 shadow-[0_1px_4px_rgba(0,0,0,0.15)]">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white tracking-[-0.01em] leading-none truncate">
                {profile?.business_name || 'Mi Empresa'}
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">Cliente</p>
            </div>
            <button
              onClick={toggleDarkMode}
              className="p-1.5 rounded-[7px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-all flex-shrink-0"
              title="Cambiar tema"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={signOut}
              className="p-1.5 rounded-[7px] text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex-shrink-0"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
