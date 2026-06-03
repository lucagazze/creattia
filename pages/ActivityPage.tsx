import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { db } from '../services/db';
import { 
  Users, 
  Calendar, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock,
  Shield,
  Layout,
  MousePointer2,
  ChevronDown,
  ChevronUp,
  Globe,
  Building2,
  RefreshCw,
  MonitorPlay
} from 'lucide-react';
import { usePresence } from '../contexts/PresenceContext';
import { AppleLoader } from '../components/ui/AppleLoader';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

export default function ActivityPage() {
  const { onlineUsers } = usePresence();
  const [stats, setStats] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const [search, setSearch] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [expandedBusiness, setExpandedBusiness] = useState<string | null>(null);

  const load = async (days: number) => {
    try {
      const [s, r, c, a] = await Promise.all([
        db.activity.getStats(days),
        db.activity.getRecent(200),
        supabase.from('car_clients').select('*').order('business_name'),
        supabase.from('car_business_accounts').select('*')
      ]);
      
      if (c.error) console.error('Error loading clients:', c.error);
      if (a.error) console.error('Error loading accounts:', a.error);

      // Map accounts to clients
      const clientsWithAccounts = (c.data || []).map(client => ({
        ...client,
        accounts: a.data?.filter(acc => acc.client_id === client.id) || []
      }));

      setStats([...s].reverse()); 
      setRecent(r);
      setClients(clientsWithAccounts);
    } catch (err) {
      console.error('Fatal error loading activity:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(range);

    const channel = supabase
      .channel('live-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'car_user_activity' }, () => {
        load(range);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [range]);

  // Group activity by client_id
  const activityByClient = recent.reduce((acc: any, curr: any) => {
    if (!acc[curr.client_id]) acc[curr.client_id] = [];
    acc[curr.client_id].push(curr);
    return acc;
  }, {});

  const sortedClients = [...clients].sort((a, b) => {
    const activityA = activityByClient[a.id]?.[0]?.created_at || '0';
    const activityB = activityByClient[b.id]?.[0]?.created_at || '0';
    return activityB.localeCompare(activityA);
  });

  const filteredClients = sortedClients.filter(c => 
    c.business_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.accounts?.some((a: any) => a.email.toLowerCase().includes(search.toLowerCase()))
  );

  const todayStats = stats.find(s => s.day === new Date().toISOString().split('T')[0]);
  const yesterdayStats = stats.find(s => s.day === new Date(Date.now() - 86400000).toISOString().split('T')[0]);

  const getDiff = (curr: number, prev: number) => {
    if (!prev) return 0;
    return ((curr - prev) / prev) * 100;
  };

  if (loading) return <CenteredPageLoader isLoading={loading}>{null}</CenteredPageLoader>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-[6px] bg-emerald-500 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-[22px] font-semibold text-zinc-900 dark:text-white tracking-[-0.03em]">
              Monitoreo de Actividad
            </h1>
          </div>
          <p className="text-[13px] text-zinc-500">
            Seguimiento de accesos y uso del portal en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit">
          {[
            { label: '7d', val: 7 },
            { label: '14d', val: 14 },
            { label: '30d', val: 30 },
            { label: '90d', val: 90 },
          ].map((r) => (
            <button
              key={r.val}
              onClick={() => setRange(r.val)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                range === r.val
                  ? 'bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6 border-emerald-100 dark:border-emerald-500/10">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl text-emerald-600">
              <Users className="w-5 h-5" />
            </div>
            {yesterdayStats && (
              <div className={`flex items-center gap-1 text-[11px] font-bold ${getDiff(todayStats?.unique_users || 0, yesterdayStats.unique_users) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {getDiff(todayStats?.unique_users || 0, yesterdayStats.unique_users) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(getDiff(todayStats?.unique_users || 0, yesterdayStats.unique_users)).toFixed(0)}%
              </div>
            )}
          </div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Empresas hoy</p>
          <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{todayStats?.unique_users || 0}</h3>
        </div>

        <div className="card p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-violet-50 dark:bg-violet-500/10 rounded-xl text-violet-600">
              <MousePointer2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Accesos totales hoy</p>
          <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{todayStats?.total_actions || 0}</h3>
        </div>

        <div className="card p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-zinc-600">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Ayer</p>
          <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{yesterdayStats?.unique_users || 0} empresas</h3>
        </div>
      </div>

      {/* Main Chart */}
      <div className="card p-8">
        <h3 className="text-[13px] font-bold text-zinc-900 dark:text-white mb-8">Evolución de Accesos (Últimos {range} días)</h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats} margin={{ left: -30, right: 0, top: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" />
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px' }}
                itemStyle={{ color: '#fff', fontSize: '12px' }}
                labelStyle={{ color: '#a1a1aa', fontSize: '10px' }}
              />
              <Area 
                type="monotone" 
                dataKey="unique_users" 
                stroke="#10b981" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorUsers)" 
                name="Empresas únicas"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity Grouped by Business */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-zinc-900 dark:text-white uppercase tracking-widest">Actividad por Empresa</h3>
          <div className="relative w-full max-w-[300px]">
            <input 
              type="text"
              placeholder="Buscar empresa o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl text-[13px] focus:ring-2 focus:ring-emerald-500/20"
            />
            <Activity className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {filteredClients.map((c) => {
          const clientActivity = activityByClient[c.id] || [];
          const usersInActivity = [...new Set(clientActivity.map((a: any) => a.metadata?.user_email))].filter(Boolean);
          const isBizExpanded = expandedBusiness === c.id;
          
          return (
            <div key={c.id} className="card overflow-hidden border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all">
              {/* Business Header - Clickable to expand */}
              <div 
                onClick={() => setExpandedBusiness(isBizExpanded ? null : c.id)}
                className="p-5 flex items-center justify-between bg-zinc-50/50 dark:bg-white/[0.01] cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-white/[0.02] transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-emerald-500/20">
                    {c.business_name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-[15px] font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        {c.business_name}
                        {isBizExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                      </h4>
                      {onlineUsers[c.id] && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-[9px] font-bold text-emerald-600 animate-pulse">
                          <div className="w-1 h-1 rounded-full bg-emerald-500" />
                          EN LÍNEA
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500">{c.niche || 'Sector no especificado'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cuentas</p>
                    <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                      {[...new Set([...(c.accounts?.map((a: any) => a.email) || []), ...usersInActivity])].length} vinculadas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Última Actividad</p>
                    <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                      {clientActivity[0] ? new Date(clientActivity[0].created_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin registros'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Accounts Table - Only visible if expanded */}
              {isBizExpanded && (
                <div className="p-0 border-t border-zinc-100 dark:border-zinc-800 animate-in slide-in-from-top-2 duration-300">
                  <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-100/30 dark:bg-zinc-800/20">
                      <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cuenta / Email</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Inicios de Sesión</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ubicación / IP</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Última Conexión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {[...new Set([...(c.accounts?.map((a: any) => a.email) || []), ...usersInActivity])].map((email) => {
                      const userLogs = clientActivity.filter((a: any) => a.metadata?.user_email === email);
                      const userLastLog = userLogs[0];
                      const totalActions = userLogs.reduce((sum: number, log: any) => sum + (log.metadata?.refreshes || 1), 0);
                      const totalLogins = userLogs.filter((log: any) => log.action === 'session_start').length;
                      
                      // Check if this specific email is currently online
                      const presences = onlineUsers[c.id] || [];
                      const isEmailOnline = presences.some((p: any) => (p.user_email || p.email) === email);
                      
                      const isExpanded = expandedEmail === `${c.id}-${email}`;

                      return (
                        <React.Fragment key={email}>
                          <tr 
                            onClick={() => setExpandedEmail(isExpanded ? null : `${c.id}-${email}`)}
                            className="hover:bg-zinc-50 dark:hover:bg-white/[0.01] transition-colors group cursor-pointer"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`p-1.5 rounded-lg transition-colors ${isEmailOnline ? 'bg-emerald-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 group-hover:text-emerald-500'}`}>
                                  <Shield className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
                                    {email}
                                    {isExpanded ? <ChevronUp className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
                                  </span>
                                  {isEmailOnline && (
                                    <span className="text-[10px] font-bold text-emerald-500 animate-pulse uppercase tracking-wider">
                                      En línea ahora
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {userLastLog ? (
                                <div className="flex flex-col items-center">
                                  <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-[11px] font-bold text-blue-600">
                                    {totalLogins} {totalLogins === 1 ? 'entrada' : 'entradas'}
                                  </span>
                                </div>
                              ) : (
                                <span className="px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-400 italic">
                                  Sin actividad
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {userLastLog ? (
                                <div className="flex flex-col">
                                  <span className="text-[12px] text-zinc-600 dark:text-zinc-400 font-medium">
                                    {userLastLog.location?.city ? `${userLastLog.location.city}, ${userLastLog.location.country}` : ''}
                                  </span>
                                  <span className="text-[12px] text-zinc-400 font-mono">{userLastLog.ip || 'Sin IP'}</span>
                                </div>
                              ) : '-'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {userLastLog ? (
                                <div className="flex items-center justify-end gap-2 text-zinc-500">
                                  <Clock className="w-3 h-3" />
                                  <span className="text-[12px]">
                                    {new Date(userLastLog.created_at).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ) : '-'}
                            </td>
                          </tr>

                          {isExpanded && userLogs.length > 0 && (
                            <tr>
                              <td colSpan={4} className="px-6 py-6 bg-zinc-50/50 dark:bg-white/[0.01] border-l-4 border-emerald-500">
                                <div className="space-y-4 w-full">
                                  <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5" />
                                    Últimas 20 Conexiones
                                  </h5>
                                  <div className="space-y-2 w-full">
                                    {userLogs.slice(0, 20).map((log: any, idx: number) => (
                                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm gap-3 group/item hover:border-emerald-500/30 transition-colors w-full">
                                        <div className="flex items-center gap-4">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${log.action === 'session_start' ? 'bg-blue-50 text-blue-500 dark:bg-blue-500/10' : 'bg-zinc-50 text-zinc-400 dark:bg-zinc-800'}`}>
                                            <Globe className="w-4 h-4" />
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                                              {log.ip || 'IP Privada/Desconocida'}
                                            </span>
                                            {log.location?.city && (
                                              <span className="text-[10px] text-zinc-500">
                                                {log.location.city}, {log.location.country}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-6">
                                          {log.metadata?.refreshes > 1 && (
                                            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                              {log.metadata.refreshes} acciones
                                            </span>
                                          )}
                                          <div className="flex flex-col items-end">
                                            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                                              {new Date(log.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="text-[9px] text-zinc-400 uppercase tracking-tighter">
                                              {log.action === 'session_start' ? 'Inicio de Sesión' : 'Actividad'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
