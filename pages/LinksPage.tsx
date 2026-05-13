import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { db, ClientLink } from '../services/db';
import { ExternalLink, Link2 } from 'lucide-react';

export default function LinksPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    db.links.getByClientId(profile.id).then(data => {
      setLinks(data);
      setLoading(false);
    });
  }, [profile]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-zinc-900 dark:text-white">
            Mis Links
          </h1>
          <p className="text-[14px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            Accesos directos importantes para tu negocio.
          </p>
        </div>
      </div>
      
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.length > 0 ? links.map(link => (
            <a 
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="card p-5 hover:border-violet-300 dark:hover:border-violet-500/50 hover:bg-violet-50/50 dark:hover:bg-violet-500/10 transition-all group flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-violet-100 dark:group-hover:bg-violet-900/50 transition-colors">
                  <Link2 className="w-5 h-5 text-zinc-500 dark:text-zinc-400 group-hover:text-violet-600 dark:group-hover:text-violet-400" />
                </div>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{link.label}</span>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-violet-500" />
            </a>
          )) : (
            <div className="col-span-full card p-8 text-center text-zinc-500">
              No tienes links configurados todavía.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
