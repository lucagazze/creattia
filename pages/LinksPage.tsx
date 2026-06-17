import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { db, ClientLink } from '../services/db';
import { Link2, MessageSquare, Mail, Globe, ArrowUpRight } from 'lucide-react';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';

const getIcon = (icon?: string) => {
  if (icon === 'chat') return MessageSquare;
  if (icon === 'mail') return Mail;
  if (icon === 'web') return Globe;
  return Link2;
};

const GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-cyan-500 to-sky-600',
  'from-violet-600 to-indigo-700',
  'from-teal-500 to-emerald-600',
];

export default function LinksPage() {
  const { profile: authProfile, loading: authLoading } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLinks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    db.links.getByClientId(profile.id)
      .then(data => {
        setLinks(data || []);
      })
      .catch(err => {
        console.error("Error loading client links:", err);
        setLinks([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [profile, authLoading]);

  return (
    <CenteredPageLoader isLoading={loading || authLoading}>
      <div className="w-full space-y-8 pt-3 md:pt-6 animate-in fade-in slide-in-from-bottom-3 duration-400">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-zinc-900 dark:text-white">
            Mis Accesos
          </h1>
          <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1 font-medium">
            Accesos directos a todas tus herramientas y plataformas.
          </p>
        </div>

        {links.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {links.map((link, idx) => {
              const Icon = getIcon(link.icon);
              const gradient = GRADIENTS[idx % GRADIENTS.length];
              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-4 hover:shadow-xl hover:shadow-zinc-200/60 dark:hover:shadow-black/30 hover:-translate-y-1 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 overflow-hidden active:scale-[0.98]"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-[0.04] dark:group-hover:opacity-[0.06] transition-opacity duration-200 pointer-events-none`} />
                  <div className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform duration-200`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 relative">
                    <p className="text-[13.5px] font-bold text-zinc-900 dark:text-white truncate">
                      {link.label}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                      {link.url?.replace(/^https?:\/\//,'').split('/')[0]}
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200 flex-shrink-0" />
                </a>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Link2 className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
            </div>
            <h3 className="text-[15px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">Sin accesos configurados</h3>
            <p className="text-[13px] text-zinc-400 max-w-xs">
              Tu gestor de cuenta agregará los accesos directos a tus herramientas aquí.
            </p>
          </div>
        )}
      </div>
    </CenteredPageLoader>
  );
}
