import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { TrendingUp, Loader2, Instagram, ArrowUpRight } from 'lucide-react';
import { metaAds } from '../services/metaAds';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../services/supabase';
import { AppleLoader } from '../components/ui/AppleLoader';

export default function InformesPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [igProfile, setIgProfile] = useState<any>(null);
  const [fbProfile, setFbProfile] = useState<any>(null);
  const [socialSnapshots, setSocialSnapshots] = useState<any[]>([]);
  const [loadingSocial, setLoadingSocial] = useState(false);

  useEffect(() => {
    const igId = (profile as any)?.ig_business_id;
    const fbPageId = (profile as any)?.fb_page_id;
    const clientId = profile?.id;
    if (!clientId || (!igId && !fbPageId)) return;

    const run = async () => {
      setLoadingSocial(true);
      try {
        const since90 = new Date();
        since90.setDate(since90.getDate() - 90);
        const { data: snaps } = await supabase
          .from('car_social_snapshots')
          .select('snapshot_date, ig_followers, fb_fans, tiktok_followers')
          .eq('client_id', clientId)
          .gte('snapshot_date', since90.toISOString().split('T')[0])
          .order('snapshot_date', { ascending: true });
        setSocialSnapshots(snaps || []);

        const [igRes, fbRes] = await Promise.all([
          igId ? metaAds.getInstagramProfile(igId).catch(() => null) : null,
          fbPageId ? metaAds.getFacebookPageInfo(fbPageId).catch(() => null) : null,
        ]);
        if (igRes) setIgProfile(igRes);
        if (fbRes) setFbProfile(fbRes);

        const todayStr = new Date().toISOString().split('T')[0];
        const snap: any = { client_id: clientId, snapshot_date: todayStr };
        if (igRes?.followers_count) snap.ig_followers = igRes.followers_count;
        if (igRes?.follows_count) snap.ig_following = igRes.follows_count;
        if (igRes?.media_count) snap.ig_posts = igRes.media_count;
        if (fbRes?.fan_count) snap.fb_fans = fbRes.fan_count;
        if (fbRes?.followers_count) snap.fb_followers = fbRes.followers_count;

        if (snap.ig_followers || snap.fb_fans) {
          await supabase.from('car_social_snapshots').upsert(snap, { onConflict: 'client_id,snapshot_date' });
          setSocialSnapshots(prev => {
            const filtered = prev.filter(s => s.snapshot_date !== todayStr);
            return [...filtered, snap].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
          });
        }
      } catch (err) {
        console.error('Error fetching social data:', err);
      } finally {
        setLoadingSocial(false);
      }
    };
    run();
  }, [profile?.id]);

  const fmtN = (n: any) => {
    const v = parseInt(n);
    if (isNaN(v)) return '—';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toLocaleString('es-AR');
  };

  const igSnaps = socialSnapshots.filter(s => s.ig_followers != null);
  const fbSnaps = socialSnapshots.filter(s => s.fb_fans != null);

  const calcGrowth = (snaps: any[], field: string) => {
    if (snaps.length < 2) return null;
    const first = snaps[0][field];
    const last = snaps[snaps.length - 1][field];
    if (!first || !last) return null;
    return ((last - first) / first) * 100;
  };

  const igGrowth = calcGrowth(igSnaps, 'ig_followers');
  const fbGrowth = calcGrowth(fbSnaps, 'fb_fans');

  return (
    <div className="w-full animate-fade-in pb-20 pt-6 px-4 md:px-6 lg:px-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-violet-500/20 flex items-center justify-center">
          <Instagram className="w-5 h-5 text-pink-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Redes Sociales Orgánico</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Crecimiento orgánico de seguidores en tus cuentas.</p>
        </div>
      </div>

      {loadingSocial && !igProfile && !fbProfile ? (
        <AppleLoader variant="page" />
      ) : (
        <>
          {/* Current stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">

            {/* Instagram */}
            {igProfile && (
              <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center flex-shrink-0">
                    <Instagram className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Instagram</p>
                    {igProfile.username && <p className="text-[11px] text-zinc-400 truncate">@{igProfile.username}</p>}
                  </div>
                  {igGrowth !== null && (
                    <div className={`ml-auto flex items-center gap-1 text-[11px] font-bold ${igGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      <ArrowUpRight className={`w-3 h-3 ${igGrowth < 0 ? 'rotate-180' : ''}`} />
                      {Math.abs(igGrowth).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Seguidores</p>
                    <p className="text-[22px] font-black text-zinc-900 dark:text-white leading-none mt-1">{fmtN(igProfile.followers_count)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Siguiendo</p>
                    <p className="text-[22px] font-black text-zinc-900 dark:text-white leading-none mt-1">{fmtN(igProfile.follows_count)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Publicaciones</p>
                    <p className="text-[22px] font-black text-zinc-900 dark:text-white leading-none mt-1">{fmtN(igProfile.media_count)}</p>
                  </div>
                </div>
                {igSnaps.length > 1 && (
                  <div className="mt-4 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={igSnaps} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                        <Line type="monotone" dataKey="ig_followers" stroke="#ec4899" strokeWidth={2} dot={false} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', background: '#18181b', color: '#fff' }} formatter={(v: any) => [fmtN(v), 'Seguidores']} labelFormatter={(l) => l} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Facebook */}
            {fbProfile && (
              <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-[#1877F2] flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Facebook</p>
                    {fbProfile.name && <p className="text-[11px] text-zinc-400 truncate">{fbProfile.name}</p>}
                  </div>
                  {fbGrowth !== null && (
                    <div className={`ml-auto flex items-center gap-1 text-[11px] font-bold ${fbGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      <ArrowUpRight className={`w-3 h-3 ${fbGrowth < 0 ? 'rotate-180' : ''}`} />
                      {Math.abs(fbGrowth).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Seguidores</p>
                    <p className="text-[22px] font-black text-zinc-900 dark:text-white leading-none mt-1">{fmtN(fbProfile.followers_count || fbProfile.fan_count)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Me gusta</p>
                    <p className="text-[22px] font-black text-zinc-900 dark:text-white leading-none mt-1">{fmtN(fbProfile.fan_count)}</p>
                  </div>
                </div>
                {fbSnaps.length > 1 && (
                  <div className="mt-4 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={fbSnaps} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                        <Line type="monotone" dataKey="fb_fans" stroke="#1877F2" strokeWidth={2} dot={false} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', background: '#18181b', color: '#fff' }} formatter={(v: any) => [fmtN(v), 'Me gusta']} labelFormatter={(l) => l} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* TikTok placeholder */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm opacity-50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.28 8.28 0 004.84 1.55V6.79a4.85 4.85 0 01-1.07-.1z" /></svg>
                </div>
                <div>
                  <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">TikTok</p>
                  <p className="text-[11px] text-zinc-400">Próximamente</p>
                </div>
              </div>
              <p className="text-[12px] text-zinc-400 text-center py-4">Sin cuenta TikTok configurada</p>
            </div>
          </div>

          {/* Combined growth chart — last 90 days */}
          {socialSnapshots.length > 2 && (
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-violet-500" />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">Crecimiento — Últimos 90 días</h3>
                  <p className="text-[11px] text-zinc-400">Evolución de seguidores orgánicos</p>
                </div>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={socialSnapshots} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="snapshot_date" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(d) => { const p = d.split('-'); return `${p[2]}/${p[1]}`; }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={fmtN} width={45} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', background: '#18181b', color: '#fff' }}
                      formatter={(v: any, name: string) => [fmtN(v), name === 'ig_followers' ? 'Instagram' : 'Facebook']}
                      labelFormatter={(l) => { const p = l.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }}
                    />
                    {igSnaps.length > 1 && <Line type="monotone" dataKey="ig_followers" stroke="#ec4899" strokeWidth={2} dot={false} name="ig_followers" />}
                    {fbSnaps.length > 1 && <Line type="monotone" dataKey="fb_fans" stroke="#1877F2" strokeWidth={2} dot={false} name="fb_fans" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {(igSnaps.length > 1 || fbSnaps.length > 1) && (
                <div className="flex gap-4 mt-3 justify-center">
                  {igSnaps.length > 1 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-pink-500" /><span className="text-[11px] text-zinc-400 font-semibold">Instagram</span></div>}
                  {fbSnaps.length > 1 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#1877F2]" /><span className="text-[11px] text-zinc-400 font-semibold">Facebook</span></div>}
                </div>
              )}
            </div>
          )}

          {!igProfile && !fbProfile && !loadingSocial && (
            <div className="bg-zinc-50 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.03] rounded-2xl p-12 text-center">
              <Instagram className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400 text-[13px]">No hay cuentas de Instagram o Facebook configuradas para este cliente.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
