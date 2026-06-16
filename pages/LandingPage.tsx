import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import {
  MessageSquare,
  TrendingUp,
  Mail,
  Check,
  ChevronDown,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
  RefreshCw,
  ArrowUpRight,
  Zap,
  ShoppingBag,
  Receipt,
  Package,
  DollarSign,
  Users,
  Target,
  MailOpen,
  MousePointerClick,
  Info,
  AlertCircle,
  X,
  Send,
  ThumbsUp,
  Brain,
  Instagram,
  Facebook,
  MessageCircle,
  ChevronLeft,
  Play,
  Menu
} from 'lucide-react';

// Helper components for Dashboard metrics simulation
const MockMetricCard = ({
  metricId,
  label,
  value,
  change,
  trend,
  sparklineColor,
  active,
  onClick,
  icon: Icon,
  logoSrc,
  logoAlt,
  darkMode
}: any) => {
  const isPink = sparklineColor === '#ec4899';
  const isEmerald = sparklineColor === '#10b981';
  const isGreen = sparklineColor === '#10b981';
  
  let activeBgClass = "bg-blue-50/60 dark:bg-blue-500/5 border-blue-500/30";
  let pulseClass = "bg-blue-500";
  if (isPink) { activeBgClass = "bg-pink-50/60 dark:bg-pink-500/5 border-pink-500/30"; pulseClass = "bg-pink-500"; }
  if (isEmerald) { activeBgClass = "bg-emerald-50/60 dark:bg-emerald-500/5 border-emerald-500/30"; pulseClass = "bg-emerald-500"; }
  if (isGreen) { activeBgClass = "bg-emerald-50/60 dark:bg-emerald-500/5 border-emerald-500/30"; pulseClass = "bg-emerald-500"; }

  const data = chartMockData[metricId] || [];

  return (
    <button
      onClick={onClick}
      className={`flex flex-col p-3.5 bg-white dark:bg-[#0f0f13] border rounded-[14px] transition-all text-left relative overflow-visible group w-full ${
        active
          ? activeBgClass
          : (darkMode ? 'border-white/[0.035] hover:bg-white/[0.02]' : 'border-zinc-200/45 hover:bg-zinc-50')
      }`}
    >
      <div className="flex items-center justify-between mb-2.5 w-full">
        <div className="flex items-center gap-1.5 min-w-0">
          {logoSrc ? (
            <img src={logoSrc} alt={logoAlt || ''} className="w-4 h-4 object-contain flex-shrink-0" />
          ) : (
            Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: sparklineColor }} />
          )}
          <span className="text-[9.5px] font-bold text-zinc-550 dark:text-zinc-450 uppercase tracking-widest truncate">
            {label}
          </span>
        </div>
        {active && (
          <div className={`w-1.5 h-1.5 rounded-full ${pulseClass} animate-pulse flex-shrink-0`} />
        )}
      </div>
      <div className="flex items-end justify-between gap-2 w-full mt-auto">
        <div className="flex flex-col shrink-0">
          <span className="text-[15px] sm:text-[17px] font-bold text-zinc-900 dark:text-white leading-none mb-1.5 font-display">
            {value}
          </span>
          <div className={`flex items-center gap-0.5 text-[10.5px] font-bold ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend === 'up' ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingUp className="w-3 h-3 rotate-180" />
            )}
            {change}%
          </div>
        </div>
        {/* Real AreaChart Sparkline */}
        <div className="h-8 flex-1 min-w-0 max-w-[95px] ml-2.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Area
                type="monotone"
                dataKey="val"
                stroke={sparklineColor}
                fill={sparklineColor}
                fillOpacity={0.08}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </button>
  );
};

// Simulated daily data for dashboard metrics — values match real app (Últimos 28 días)
const chartMockData: Record<string, { date: string; val: number }[]> = {
  // Tienda Online: $68.883 ingresos, 207 pedidos, $333 ticket promedio
  's-revenue': [
    { date: '2026-05-18', val: 2200 },
    { date: '2026-05-22', val: 2380 },
    { date: '2026-05-26', val: 2290 },
    { date: '2026-05-30', val: 2520 },
    { date: '2026-06-03', val: 2450 },
    { date: '2026-06-07', val: 2610 },
    { date: '2026-06-14', val: 2560 }
  ],
  's-orders': [
    { date: '2026-05-18', val: 6 },
    { date: '2026-05-22', val: 7 },
    { date: '2026-05-26', val: 7 },
    { date: '2026-05-30', val: 8 },
    { date: '2026-06-03', val: 7 },
    { date: '2026-06-07', val: 9 },
    { date: '2026-06-14', val: 8 }
  ],
  's-aov': [
    { date: '2026-05-18', val: 315 },
    { date: '2026-05-22', val: 325 },
    { date: '2026-05-26', val: 320 },
    { date: '2026-05-30', val: 312 },
    { date: '2026-06-03', val: 340 },
    { date: '2026-06-07', val: 328 },
    { date: '2026-06-14', val: 333 }
  ],
  // Meta Ads: $1.882 inversión, 147.284 alcance, 121 compras, ROAS 17.3, $32.529 retorno
  'meta-inversion': [
    { date: '2026-05-18', val: 52 },
    { date: '2026-05-22', val: 61 },
    { date: '2026-05-26', val: 65 },
    { date: '2026-05-30', val: 70 },
    { date: '2026-06-03', val: 68 },
    { date: '2026-06-07', val: 74 },
    { date: '2026-06-14', val: 73 }
  ],
  'meta-alcance': [
    { date: '2026-05-18', val: 5620 },
    { date: '2026-05-22', val: 5480 },
    { date: '2026-05-26', val: 5350 },
    { date: '2026-05-30', val: 5280 },
    { date: '2026-06-03', val: 5260 },
    { date: '2026-06-07', val: 5240 },
    { date: '2026-06-14', val: 5210 }
  ],
  'meta-compras': [
    { date: '2026-05-18', val: 6 },
    { date: '2026-05-22', val: 5 },
    { date: '2026-05-26', val: 5 },
    { date: '2026-05-30', val: 4 },
    { date: '2026-06-03', val: 4 },
    { date: '2026-06-07', val: 4 },
    { date: '2026-06-14', val: 4 }
  ],
  'meta-roas': [
    { date: '2026-05-18', val: 24.8 },
    { date: '2026-05-22', val: 22.5 },
    { date: '2026-05-26', val: 21.0 },
    { date: '2026-05-30', val: 19.8 },
    { date: '2026-06-03', val: 18.5 },
    { date: '2026-06-07', val: 17.9 },
    { date: '2026-06-14', val: 17.3 }
  ],
  'meta-retorno': [
    { date: '2026-05-18', val: 980 },
    { date: '2026-05-22', val: 1050 },
    { date: '2026-05-26', val: 1100 },
    { date: '2026-05-30', val: 1160 },
    { date: '2026-06-03', val: 1200 },
    { date: '2026-06-07', val: 1230 },
    { date: '2026-06-14', val: 1250 }
  ],
  // Email: 2.770 entregas, 60.9% apertura, 10.8% clics, $14.822 ingresos
  'email-sent': [
    { date: '2026-05-18', val: 42 },
    { date: '2026-05-22', val: 68 },
    { date: '2026-05-26', val: 95 },
    { date: '2026-05-30', val: 128 },
    { date: '2026-06-03', val: 148 },
    { date: '2026-06-07', val: 162 },
    { date: '2026-06-14', val: 168 }
  ],
  'email-open': [
    { date: '2026-05-18', val: 57.8 },
    { date: '2026-05-22', val: 58.5 },
    { date: '2026-05-26', val: 59.3 },
    { date: '2026-05-30', val: 59.8 },
    { date: '2026-06-03', val: 60.3 },
    { date: '2026-06-07', val: 60.7 },
    { date: '2026-06-14', val: 60.9 }
  ],
  'email-click': [
    { date: '2026-05-18', val: 5.8 },
    { date: '2026-05-22', val: 6.5 },
    { date: '2026-05-26', val: 7.4 },
    { date: '2026-05-30', val: 8.3 },
    { date: '2026-06-03', val: 9.2 },
    { date: '2026-06-07', val: 10.1 },
    { date: '2026-06-14', val: 10.8 }
  ],
  'email-revenue': [
    { date: '2026-05-18', val: 210 },
    { date: '2026-05-22', val: 380 },
    { date: '2026-05-26', val: 560 },
    { date: '2026-05-30', val: 720 },
    { date: '2026-06-03', val: 840 },
    { date: '2026-06-07', val: 920 },
    { date: '2026-06-14', val: 950 }
  ]
};

// Generates a realistic attention/emotion curve for a 30-second video creative
const genTimeline = (attn: number, emot: number, seed: number): { t: number; attn: number; emot: number }[] => {
  // Attention: high hook → dip → partial recovery  |  Emotion: slow build, peaks late
  const attnOff = [0.22, 0.28, 0.10, -0.04, -0.10, 0.00, 0.06, -0.02, 0.04, -0.04];
  const emotOff = [-0.28, -0.18, -0.05, 0.05, 0.10, 0.05, 0.03, 0.12, 0.02, -0.03];
  return attnOff.map((ao, i) => ({
    t: Math.round(i * 30 / (attnOff.length - 1)),
    attn: Math.max(8, Math.min(99, Math.round(attn * (1 + ao) + ((seed * 3 + i * 7) % 8) - 4))),
    emot: Math.max(8, Math.min(99, Math.round(emot * (1 + emotOff[i]) + ((seed * 5 + i * 11) % 8) - 4))),
  }));
};

const MockDetailChart = ({
  metricId,
  label,
  color
}: any) => {
  const { darkMode } = useTheme();
  const data = chartMockData[metricId] || [];
  const vals = data.map(d => d.val);
  const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const maxVal = Math.max(...vals, 0);

  const isPercentLabel = label.toLowerCase().includes("tasa") || label.toLowerCase().includes("porcentaje") || label.toLowerCase().includes("apertura") || label.toLowerCase().includes("clics");
  const isMoneyLabel =
    label.toLowerCase().includes("ingreso") ||
    label.toLowerCase().includes("inversión") ||
    label.toLowerCase().includes("retorno");
  const isCostLabel = label.toLowerCase().includes("costo");
  const isRoasLabel = label.toLowerCase().includes("roas") || label.toLowerCase().includes("m.e.r");

  const fmtVal = (v: number) => {
    if (v === null || v === undefined || isNaN(v)) return "0";
    if (isPercentLabel) return `${v.toFixed(1)}%`;
    if (isMoneyLabel)
      return `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v.toFixed(0)}`;
    if (isCostLabel) return `$${v.toFixed(2)}`;
    if (isRoasLabel) return `${v.toFixed(1)}x`;
    if (v >= 1000) return (v / 1000).toFixed(0) + "k";
    return v.toFixed(0);
  };

  const gradientId = `detail-grad-${metricId}`;

  return (
    <div className={`border rounded-[20px] p-4 sm:p-8 text-left mt-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-350 ${
      darkMode ? 'bg-zinc-900 border-white/[0.06] shadow-none' : 'bg-white border-zinc-200 shadow-sm'
    }`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h3 className="text-[12px] font-bold text-zinc-550 dark:text-zinc-450 uppercase tracking-widest">
          Evolución de {label}
        </h3>
        
        <div className="flex items-center gap-3 flex-wrap text-[11px] font-bold">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-zinc-650 dark:text-zinc-450">Actual</span>
          </div>
          {avg > 0 && (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <div className="w-3 h-0.5 bg-amber-500 flex-shrink-0" />
              <span className="text-amber-600 dark:text-amber-500 font-bold">
                Med. Act: {fmtVal(avg)}
              </span>
            </div>
          )}
          {maxVal > 0 && (
            <div className="flex items-center gap-1.5 whitespace-nowrap pl-2 border-l border-zinc-150 dark:border-zinc-800">
              <span className="text-zinc-450 dark:text-zinc-500">Máx:</span>
              <span className="text-zinc-700 dark:text-zinc-200">{fmtVal(maxVal)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -30, right: 8, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickFormatter={(d) => {
                const parts = d.split('-');
                return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : d;
              }}
            />
            <YAxis
              domain={[0, maxVal > 0 ? maxVal * 1.2 : "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "#9ca3af" }}
              tickFormatter={(v) => v === 0 ? "" : fmtVal(v)}
              width={35}
            />
            <Tooltip
              content={({ active, payload }: any) => {
                if (active && payload && payload.length) {
                  const curr = payload[0];
                  const fmtTooltip = (v: number) => {
                    if (typeof v !== "number") return String(v ?? "—");
                    if (isMoneyLabel)
                      return `$ ${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
                    if (isPercentLabel) return `${v.toFixed(2)}%`;
                    if (isRoasLabel) return `${v.toFixed(1)}`;
                    return v.toLocaleString("es-AR", {
                      maximumFractionDigits: 2,
                    });
                  };
                  return (
                    <div className="glass-premium dark:bg-zinc-950/80 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-black/[0.06] dark:border-white/[0.06] min-w-[150px] text-left animate-in fade-in duration-200">
                      <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2.5">
                        {curr.payload.date ? new Date(curr.payload.date).toLocaleDateString("es-AR") : ""}
                      </p>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Valor</span>
                        </div>
                        <span className="text-[12px] font-black text-zinc-900 dark:text-white">{fmtTooltip(curr.value)}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            
            {avg > 0 && (
              <ReferenceLine
                y={avg}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={2}
              />
            )}

            {maxVal > 0 && (
              <ReferenceLine
                y={maxVal}
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: `MÁX: ${fmtVal(maxVal)}`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fontWeight: "900",
                  fill: "#6366f1",
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="val"
              stroke={color}
              strokeWidth={3}
              fillOpacity={0}
              fill="none"
              dot={(p: any) =>
                p.value > 0 ? (
                  <circle
                    key={`dot-${p.index}-${p.cx}`}
                    cx={p.cx}
                    cy={p.cy}
                    r={4}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ) : (
                  <path key={`empty-${p.index}-${p.cx}`} d="" />
                )
              }
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default function LandingPage() {
  const { darkMode, toggleDarkMode } = useTheme();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    const scrollTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.scrollingElement?.scrollTo(0, 0);
    };
    scrollTop();
    requestAnimationFrame(scrollTop);
    const t = window.setTimeout(scrollTop, 120);
    return () => window.clearTimeout(t);
  }, []);

  // Redirige al panel si ya está autenticado
  useEffect(() => {
    if (session) {
      navigate('/dashboard');
    }
  }, [session, navigate]);

  // --- Estados de las Simulaciones Interactivas ---
  
  // 1. Simulación de Inbox Omnicanal
  const inboxConversations = [
    {
      id: 'conv1', name: 'Sofía Rodríguez', channel: 'instagram' as const,
      avatarBg: 'bg-pink-500', initials: 'SR', time: '12:04', status: 'pending' as const,
      preview: 'Vi el tapado de cuero en Instagram...',
      messages: [
        { id: 1, sender: 'user', text: 'Hola! Vi el tapado de cuero en Instagram. ¿Tienen en talle S?', time: '12:04' },
        { id: 2, sender: 'user', text: '¿Y hacen envíos a Córdoba?', time: '12:04' },
      ],
      aiDraft: '¡Hola Sofía! Sí, nos queda la última unidad en talle S de ese tapado. Hacemos envíos rápidos a Córdoba a través de Correo Argentino. ¿Te reservo la unidad?',
      aiReply: { id: 3, sender: 'ai', text: '¡Hola Sofía! Sí, nos queda la última unidad en talle S de ese tapado. Hacemos envíos rápidos a Córdoba a través de Correo Argentino. ¿Te reservo la unidad?', time: '12:05' },
    },
    {
      id: 'conv2', name: 'Martín López', channel: 'facebook' as const,
      avatarBg: 'bg-blue-500', initials: 'ML', time: '11:30', status: 'pending' as const,
      preview: '¿Hacen envíos a Mendoza? ¿Cuotas?',
      messages: [
        { id: 1, sender: 'user', text: 'Buenas! Me interesa el tapado de cuero marrón.', time: '11:28' },
        { id: 2, sender: 'user', text: '¿Hacen envíos a Mendoza? ¿Tienen cuotas sin interés?', time: '11:30' },
      ],
      aiDraft: '¡Hola Martín! Sí, enviamos a todo el país con Correo Argentino y OCA. El tapado marrón está disponible con hasta 3 cuotas sin interés con todas las tarjetas. ¿Te gustaría que te reserve uno?',
      aiReply: { id: 3, sender: 'ai', text: '¡Hola Martín! Sí, enviamos a todo el país con Correo Argentino y OCA. El tapado marrón está disponible con hasta 3 cuotas sin interés con todas las tarjetas. ¿Te gustaría que te reserve uno?', time: '11:31' },
    },
    {
      id: 'conv3', name: 'Valentina García', channel: 'whatsapp' as const,
      avatarBg: 'bg-emerald-500', initials: 'VG', time: '10:15', status: 'pending' as const,
      preview: '¿Tienen stock del tapado negro M?',
      messages: [
        { id: 1, sender: 'user', text: 'Hola! Buenas tardes. Quería saber si tienen stock del tapado negro talle M', time: '10:15' },
      ],
      aiDraft: '¡Hola Valentina! Sí, tenemos stock del tapado negro en talle M. El precio es $89.990 con envío gratis hoy. ¿Te lo reservo?',
      aiReply: { id: 2, sender: 'ai', text: '¡Hola Valentina! Sí, tenemos stock del tapado negro en talle M. El precio es $89.990 con envío gratis hoy. ¿Te lo reservo?', time: '10:16' },
    },
    {
      id: 'conv4', name: 'Lucas Fernández', channel: 'instagram' as const,
      avatarBg: 'bg-emerald-500', initials: 'LF', time: 'Ayer', status: 'answered' as const,
      preview: 'Gracias! Muy buena atención 🙌',
      messages: [
        { id: 1, sender: 'user', text: '¿Me pueden indicar el precio del cinturón de cuero?', time: 'Ayer' },
        { id: 2, sender: 'ai', text: '¡Hola Lucas! El cinturón de cuero está a $24.990. Hacemos envío gratis en compras mayores a $50.000 ¿Te interesa?', time: 'Ayer' },
        { id: 3, sender: 'user', text: 'Gracias! Muy buena atención 🙌', time: 'Ayer' },
      ],
      aiDraft: '',
      aiReply: null,
    },
  ];
  const [selectedInboxConvId, setSelectedInboxConvId] = useState('conv1');
  const [inboxChannelFilter, setInboxChannelFilter] = useState<'all' | 'instagram' | 'facebook' | 'whatsapp'>('all');
  const [inboxConvStatuses, setInboxConvStatuses] = useState<Record<string, 'idle' | 'sending'>>({});
  const [inboxOpenedIds, setInboxOpenedIds] = useState<Set<string>>(() => new Set(['conv1']));
  const [inboxMobileView, setInboxMobileView] = useState<'list' | 'chat'>('list');
  const [inboxExtraMessages, setInboxExtraMessages] = useState<Record<string, Array<{id: number, sender: string, text: string, time: string}>>>({});
  const [inboxInputText, setInboxInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const getConvStatus = (id: string) => inboxConvStatuses[id] || 'idle';
  const isInboxPending = (conv: typeof inboxConversations[number]) =>
    conv.status === 'pending' && !inboxOpenedIds.has(conv.id) && getConvStatus(conv.id) === 'idle';
  const getInboxDisplayStatus = (conv: typeof inboxConversations[number]) => {
    if (conv.status === 'answered' || (inboxExtraMessages[conv.id] || []).some(m => m.sender === 'ai')) return 'Respondido';
    if (isInboxPending(conv)) return 'Pendiente';
    return 'Visto';
  };
  const selectedInboxConv = inboxConversations.find(c => c.id === selectedInboxConvId)!;
  const filteredInboxConvs = inboxChannelFilter === 'all'
    ? inboxConversations
    : inboxConversations.filter(c => c.channel === inboxChannelFilter);

  const getAllMessages = (convId: string) => {
    const conv = inboxConversations.find(c => c.id === convId)!;
    return [...conv.messages, ...(inboxExtraMessages[convId] || [])];
  };

  const customerReplies = [
    '¡Genial! Muchas gracias, lo tengo en cuenta 🙌',
    'Perfecto, te escribo más tarde entonces.',
    '¡Gracias! Muy buena atención.',
    'Dale, me interesa. ¿Cómo hago para comprar?',
    '¡Buenísimo! Ya lo pago ahora.',
    'Súper, ahora lo ordeno. Gracias!',
  ];

  const handleSendMessage = (forcedText?: string) => {
    const conv = selectedInboxConv;
    const msgText = (forcedText !== undefined ? forcedText : inboxInputText).trim();
    if (!msgText || getConvStatus(conv.id) === 'sending') return;
    const now = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    setInboxInputText('');
    setInboxExtraMessages(prev => ({
      ...prev,
      [conv.id]: [...(prev[conv.id] || []), { id: Date.now(), sender: 'ai', text: msgText, time: now }],
    }));
    setInboxConvStatuses(prev => ({ ...prev, [conv.id]: 'sending' }));
    const reply = customerReplies[Math.floor(Math.random() * customerReplies.length)];
    setTimeout(() => {
      const t = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      setInboxConvStatuses(prev => ({ ...prev, [conv.id]: 'idle' }));
      setInboxExtraMessages(prev => ({
        ...prev,
        [conv.id]: [...(prev[conv.id] || []), { id: Date.now() + 1, sender: 'user', text: reply, time: t }],
      }));
    }, 1500);
  };

  const handleSendAiResponse = () => handleSendMessage(selectedInboxConv.aiDraft || undefined);

  const handleResetChat = () => {
    setInboxConvStatuses({});
    setInboxOpenedIds(new Set(['conv1']));
    setInboxExtraMessages({});
    setInboxInputText('');
  };

  // Tabbed high-fidelity screenshots switcher
  const [activeTabShowcase, setActiveTabShowcase] = useState<'inicio' | 'mensajeria' | 'comentarios' | 'pedidos' | 'inventario' | 'analisis' | 'creativos' | 'meta_ads' | 'perfil_dark'>('inicio');
  const [autoTabCycle, setAutoTabCycle] = useState(true);
  const [heroCycleKey, setHeroCycleKey] = useState(0);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [transformVisible, setTransformVisible] = useState(false);
  const transformRef = useRef<HTMLElement>(null);

  const showcaseTabs = [
    { id: 'inicio', label: 'Dashboard', img: '/assets/landing_inicio.jpg', desc: <>Vista ejecutiva con <strong>ingresos</strong>, <strong>pedidos</strong>, productos clave y métricas en tiempo real.</> },
    { id: 'mensajeria', label: 'Mensajería', img: '/assets/landing_mensajeria.jpg', desc: <>Bandeja <strong>omnicanal</strong> para Instagram, Facebook y WhatsApp con respuestas del <strong>Cerebro de IA</strong>.</> },
    { id: 'creativos', label: 'Creativos', img: '/assets/landing_analisis.jpg', desc: <>Campañas de <strong>Meta Ads</strong> con lectura rápida de <strong>CTR, ROAS y gasto real</strong> por creativo.</> },
    { id: 'comentarios', label: 'Comentarios', img: '/assets/landing_comentarios.jpg', desc: <>Moderá posteos y anuncios, filtrá <strong>spam</strong> y convertí consultas en oportunidades de <strong>compra</strong>.</> },
    { id: 'pedidos', label: 'Pedidos', img: '/assets/landing_pedidos.jpg', desc: <>Seguimiento del <strong>flujo de compras</strong>: envíos, facturación, pagos y comportamiento del cliente.</> },
    { id: 'inventario', label: 'Inventario', img: '/assets/landing_inventario.jpg', desc: <>Controlá <strong>catálogo</strong>, inventarios, variantes y precios en todas tus tiendas conectadas.</> },
    { id: 'analisis', label: 'Análisis', img: '/assets/landing_creativos.jpg', desc: <>Embudo por producto con <strong>Entry Point</strong>, retención, <strong>LTV</strong> y velocidad de recompra.</> },
    { id: 'perfil_dark', label: 'Email Marketing', img: '/assets/landing_perfil_dark.jpg', desc: <>Automatizaciones en <strong>Klaviyo</strong> para bienvenida, carritos y retención con <strong>ventas atribuidas</strong>.</> },
    { id: 'meta_ads', label: 'Meta Ads', img: '/assets/landing_meta_ads.jpg', desc: <>Métricas de pauta con <strong>alcance, conversiones, CPA</strong> y <strong>ROAS exacto</strong> contra ventas reales.</> }
  ];

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  // Logos de Integraciones con el nuevo Google Ads y Chatwoot
  const integrations = [
    { name: 'Shopify', logo: '/assets/shopify-bag.webp' },
    { name: 'Tiendanube', logo: '/assets/tiendanubeoscuro.png', darkLogo: '/assets/tiendanube.webp' },
    { name: 'WooCommerce', logo: '/assets/logowordpress.webp' },
    { name: 'Mercado Libre', logo: '/assets/logomercadolibre.png' },
    { name: 'Google Ads', logo: '/assets/GADS.webp' },
    { name: 'Meta Ads', logo: '/assets/meta (1).webp' },
    { name: 'TikTok Ads', logo: '/assets/logotiktok.png' },
    { name: 'Klaviyo', logo: '/assets/Klaviyo-Logo-Photoroom.webp' },
    { name: 'Chatwoot', logo: '/assets/chatwoot.svg' }
  ];

  // --- Estados de las Simulaciones Interactivas del Dashboard ---
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  
  const [selectedSimCreativeId, setSelectedSimCreativeId] = useState<number | null>(null);
  const [simModalTab, setSimModalTab] = useState<'metrics' | 'comments'>('metrics');
  const [simDraftingCommentId, setSimDraftingCommentId] = useState<string | null>(null);
  const [simReplyTexts, setSimReplyTexts] = useState<Record<string, string>>({});
  const [simExpandedCommentId, setSimExpandedCommentId] = useState<string | null>(null);
  const [simAnalyzedIds, setSimAnalyzedIds] = useState<Set<number>>(new Set());
  const [simAnalyzingId, setSimAnalyzingId] = useState<number | null>(null);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [inboxExtraMessages, inboxConvStatuses, selectedInboxConvId]);

  // Lock body scroll when creative modal is open
  useEffect(() => {
    if (selectedSimCreativeId !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedSimCreativeId]);

  // Preload hero screenshots so tab transitions never flash blank.
  useEffect(() => {
    showcaseTabs.forEach(tab => {
      const img = new Image();
      img.src = tab.img;
    });
  }, []);

  // Auto-cycle hero tabs without per-frame React updates; this keeps scrolling smooth.
  useEffect(() => {
    if (!autoTabCycle) return;

    const tabIds = showcaseTabs.map(t => t.id);
    setHeroCycleKey(k => k + 1);
    const interval = window.setInterval(() => {
      setActiveTabShowcase(prev => {
        const idx = tabIds.indexOf(prev);
        return tabIds[(idx + 1) % tabIds.length] as any;
      });
      setHeroCycleKey(k => k + 1);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [autoTabCycle, activeTabShowcase]);

  // Lock body scroll when zoom modal is open
  useEffect(() => {
    if (zoomImage) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [zoomImage]);

  // Scroll-triggered reveal for transformation section
  useEffect(() => {
    const el = transformRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setTransformVisible(true); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const [simCreatives, setSimCreatives] = useState([
    {
      id: 3,
      name: 'Anuncio Accesorios: Cartera Premium',
      spent: 199,
      ctr: 1.1,
      roas: 3.5,
      purchases: 0,
      leads: 1,
      messages: 2,
      cpa: 99,
      reach: 7200,
      img: '/assets/demo_creative_3.mp4',
      isVideo: true,
      copy: 'Cuero argentino legítimo. El accesorio ideal para tu look.',
      status: 'paused',
      platform: 'instagram' as const,
      tribeMetrics: {
        score: 72,
        label: 'Requiere ajustes',
        colorClass: 'bg-amber-500 text-white shadow-amber-500/20',
        textColor: 'text-amber-500',
        textInsight: 'El formato video ayuda a sostener atención, pero la propuesta comercial necesita una lectura más inmediata.',
        attentionPct: 78,
        attentionReason: 'El movimiento inicial retiene mirada, aunque el producto y el beneficio no aparecen con suficiente jerarquía.',
        emotionPct: 67,
        emotionReason: 'Genera interés moderado por estética y categoría, pero le falta una señal emocional más concreta de uso o urgencia.',
        cogLoad: 44,
        cogLoadReason: 'Carga media. El usuario entiende la pieza, pero debe procesar demasiada información antes de llegar al beneficio.',
        highestRegion: 'Atención visual sostenida',
        actionItems: [
          'Simplificar el fondo eliminando el texto descriptivo excesivo.',
          'Reemplazar la foto de producto sola por una de modelo luciendo la cartera.',
          'Ajustar el balance de blancos a tonos más cálidos para inducir mayor confort.'
        ]
      },
      comments: [
        {
          id: 'sc3_1',
          user: 'Camila_Fernandez',
          text: '¿Hacen envíos al interior? ¿Cuánto tarda?',
          time: 'Hace 5 min',
          pending: true,
          replies: [] as string[]
        }
      ]
    },
    {
      id: 1,
      name: 'Anuncio Invierno: Tapado Cuero',
      spent: 650,
      ctr: 3.4,
      roas: 12.4,
      purchases: 5,
      leads: 2,
      messages: 8,
      cpa: 65,
      reach: 18500,
      img: '/assets/demo_creative_1.jpg',
      isVideo: false,
      copy: 'Últimas unidades en stock con envío gratis a todo el país.',
      status: 'active',
      platform: 'instagram' as const,
      tribeMetrics: {
        score: 84,
        label: 'Listo para escalar',
        colorClass: 'bg-emerald-500 text-white shadow-emerald-500/20',
        textColor: 'text-emerald-500',
        textInsight: 'La pieza comunica producto y oferta con buena claridad visual. Tiene potencial para escalar si mantiene la conversión.',
        attentionPct: 86,
        attentionReason: 'El producto se detecta rápido y la composición dirige la mirada hacia la oferta principal.',
        emotionPct: 82,
        emotionReason: 'La estética de temporada y el beneficio de envío activan intención de compra concreta.',
        cogLoad: 30,
        cogLoadReason: 'Carga baja. La información se procesa rápido y el mensaje comercial queda claro.',
        highestRegion: 'Producto y oferta principal',
        actionItems: [
          'Duplicar el presupuesto de esta pieza publicitaria.',
          'Crear una variante optimizada con llamada de acción por stock limitado.',
          'Usar esta pieza en campañas de Retargeting para audiencias tibias.'
        ]
      },
      comments: [
        {
          id: 'sc1_1',
          user: 'Sofia_Rodriguez',
          text: 'Hola! Hacen envíos a Córdoba y tienen cuotas sin interés?',
          time: 'Hace 10 min',
          pending: true,
          replies: [] as string[]
        },
        {
          id: 'sc1_2',
          user: 'Martin_Gomez',
          text: 'Excelente tapado! Me llegó en 3 días a Mendoza. La calidad del cuero es premium total.',
          time: 'Hace 2 h',
          pending: false,
          replies: ['¡Hola Martín! Qué alegría que te haya encantado el tapado. ¡Que lo disfrutes muchísimo!']
        }
      ]
    },
    {
      id: 2,
      name: 'Anuncio Tendencia: Botas de Cuero',
      spent: 349,
      ctr: 2.2,
      roas: 9.2,
      purchases: 2,
      leads: 3,
      messages: 5,
      cpa: 58,
      reach: 12800,
      img: '/assets/demo_creative_2.jpg',
      isVideo: false,
      copy: 'Botas premium con 30% OFF en nuestra tienda online.',
      status: 'active',
      platform: 'facebook' as const,
      tribeMetrics: {
        score: 63,
        label: 'Requiere ajustes',
        colorClass: 'bg-amber-500 text-white shadow-amber-500/20',
        textColor: 'text-amber-500',
        textInsight: 'La pieza tiene una oferta visible, pero el texto compite demasiado con el producto y reduce claridad.',
        attentionPct: 69,
        attentionReason: 'El descuento capta mirada, aunque desplaza parte de la atención que debería ir al producto.',
        emotionPct: 58,
        emotionReason: 'La promoción genera interés racional, pero no construye suficiente deseo visual.',
        cogLoad: 52,
        cogLoadReason: 'Carga media-alta. Hay que leer demasiado para entender valor, precio y llamada a la acción.',
        highestRegion: 'Texto promocional',
        actionItems: [
          'Mover el texto del descuento del final al primer segundo de reproducción.',
          'Aumentar el contraste del fondo para resaltar la textura del cuero de las botas.',
          'Acortar el video a 15 segundos para mantener la retención.'
        ]
      },
      comments: [
        {
          id: 'sc2_1',
          user: 'Valeria_Rossi',
          text: 'Hola! Tienen stock en talle 38? Y qué colores hay?',
          time: 'Hace 15 min',
          pending: true,
          replies: [] as string[]
        }
      ]
    }
  ]);

  const selectedSimCreative = simCreatives.find(c => c.id === selectedSimCreativeId) || null;

  const handleSimGenerateDraft = (commentId: string, author: string, text: string) => {
    setSimDraftingCommentId(commentId);
    
    // Simulate AI loading/typing delay
    setTimeout(() => {
      let draftText = '';
      const lowerText = text.toLowerCase();
      if (lowerText.includes('cuotas') || lowerText.includes('precio') || lowerText.includes('envío') || lowerText.includes('envio')) {
        draftText = `¡Hola @${author}! El tapado está disponible con envío gratis hoy mismo y hasta 3 cuotas sin interés con todas las tarjetas de crédito. ¿Te gustaría que te reserve una unidad?`;
      } else if (lowerText.includes('talle') || lowerText.includes('stock') || lowerText.includes('colores')) {
        draftText = `¡Hola @${author}! Sí, tenemos stock disponible del talle 38 en color Negro y Chocolate. Hacemos envíos rápidos a todo el país. ¿Te reservo un par en chocolate?`;
      } else {
        draftText = `¡Hola @${author}! La cartera está confeccionada en cuero argentino legítimo y cuenta con envío gratis hoy. ¿Te gustaría elegir el color para avanzar con tu compra?`;
      }
      
      setSimReplyTexts(prev => ({
        ...prev,
        [commentId]: draftText
      }));
      setSimDraftingCommentId(null);
    }, 1000);
  };

  const handleSimSendReply = (creativeId: number, commentId: string) => {
    const text = simReplyTexts[commentId];
    if (!text || !text.trim()) return;

    setSimCreatives(prev => prev.map(creative => {
      if (creative.id === creativeId) {
        const updatedComments = creative.comments.map(c => {
          if (c.id === commentId) {
            return {
              ...c,
              pending: false,
              replies: [...c.replies, text.trim()]
            };
          }
          return c;
        });
        return {
          ...creative,
          comments: updatedComments
        };
      }
      return creative;
    }));

    // Limpiar texto y expandido
    setSimReplyTexts(prev => {
      const copy = { ...prev };
      delete copy[commentId];
      return copy;
    });
    setSimExpandedCommentId(null);
  };

  const handleSimAnalyze = async (id: number) => {
    if (simAnalyzedIds.has(id) || simAnalyzingId === id) return;
    setSimAnalyzingId(id);
    const creative = simCreatives.find(c => c.id === id);
    if (!creative) { setSimAnalyzingId(null); return; }

    let analysisResult: any = null;
    try {
      // Extract frame from the creative image
      let frames: string[] = [];
      try {
        const resp = await fetch(creative.img);
        const blob = await resp.blob();
        const b64 = await new Promise<string>(res => {
          const reader = new FileReader();
          reader.onload = e => res(e.target?.result as string);
          reader.readAsDataURL(blob);
        });
        const imgEl = document.createElement('img');
        await new Promise(res => { imgEl.onload = res; imgEl.src = b64; });
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 256 / Math.max(imgEl.width, 1));
        canvas.width = Math.floor(imgEl.width * scale);
        canvas.height = Math.floor(imgEl.height * scale);
        canvas.getContext('2d')?.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        frames = [canvas.toDataURL('image/jpeg', 0.6)];
      } catch { /* ignore */ }

      // Call AI analysis endpoint (same as CreativeTesterPage)
      if (frames.length > 0) {
        try {
          const r = await fetch('/api/scrape-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'analyze-creative', frames, isVideo: false }),
          });
          if (r.ok) analysisResult = await r.json();
        } catch { /* fall through to seeded fallback */ }
      }
    } catch { /* ignore */ }

    // Seeded fallback: slight variation of pre-configured values (consistent per creative)
    if (!analysisResult) {
      const { tribeMetrics } = creative;
      let s = id * 31337;
      const rng = () => { s = ((s * 1664525) + 1013904223) & 0xffffffff; return (s >>> 0) / 4294967296; };
      analysisResult = {
        attentionPct: Math.max(10, Math.min(98, tribeMetrics.attentionPct + Math.round((rng() - 0.5) * 8))),
        emotionPct: Math.max(10, Math.min(98, tribeMetrics.emotionPct + Math.round((rng() - 0.5) * 8))),
        cogLoad: Math.max(10, Math.min(85, tribeMetrics.cogLoad + Math.round((rng() - 0.5) * 8))),
        highestRegion: tribeMetrics.highestRegion,
        textInsight: tribeMetrics.textInsight,
        attentionReason: tribeMetrics.attentionReason,
        emotionReason: tribeMetrics.emotionReason,
        cogLoadReason: tribeMetrics.cogLoadReason,
        actionItems: tribeMetrics.actionItems,
      };
    }

    const finalScore = Math.floor(
      analysisResult.attentionPct * 0.4 +
      analysisResult.emotionPct * 0.4 +
      (100 - analysisResult.cogLoad) * 0.2
    );

    setSimCreatives(prev => prev.map(c => {
      if (c.id !== id) return c;
      return {
        ...c,
        tribeMetrics: {
          ...c.tribeMetrics,
          ...analysisResult,
          score: finalScore,
          label: finalScore >= 80 ? 'Listo para escalar' : finalScore >= 60 ? 'Requiere ajustes' : 'Revisar antes de pautar',
          colorClass: finalScore >= 80 ? 'bg-emerald-500 text-white shadow-emerald-500/20' : finalScore >= 60 ? 'bg-amber-500 text-white shadow-amber-500/20' : 'bg-red-500 text-white shadow-red-500/20',
          textColor: finalScore >= 80 ? 'text-emerald-500' : finalScore >= 60 ? 'text-amber-500' : 'text-red-500',
        }
      };
    }));
    setSimAnalyzedIds(prev => new Set(prev).add(id));
    setSimAnalyzingId(null);
  };

  const faqs = [
    {
      q: '¿Qué integraciones puedo conectar y cuánto tiempo toma?',
      a: <>Podés conectar <strong>Shopify, Tiendanube, WooCommerce, Mercado Libre, Google Ads, Meta Ads, TikTok Ads y Klaviyo</strong> en menos de <strong>5 minutos</strong>. La conexión se hace con protocolos oficiales y seguros, sin programación.</>
    },
    {
      q: '¿Puedo cancelar mi suscripción en cualquier momento?',
      a: <>Sí. <strong>No hay permanencia ni cláusulas ocultas.</strong> Podés dar de baja o pausar tu plan desde el panel de facturación cuando quieras, sin cargos extra por cancelación.</>
    },
    {
      q: '¿Cómo ayuda el Cerebro de IA a automatizar mi soporte?',
      a: <>El Cerebro de IA usa <strong>tu web, políticas, preguntas frecuentes, stock y precios</strong> para sugerir respuestas listas para enviar. La idea es que tu equipo responda más rápido sin perder contexto comercial.</>
    },
    {
      q: '¿Tienen soporte técnico durante la configuración inicial?',
      a: <>Sí. Te guiamos paso a paso para conectar <strong>tiendas, cuentas publicitarias y mensajería</strong>. El objetivo es que la cuenta quede operativa desde el inicio, sin que tengas que adivinar qué hacer.</>
    },
    {
      q: '¿Cuántos agentes de atención o tiendas puedo configurar?',
      a: <>Podés configurar los que necesites. El plan incluye <strong>colaboradores, sucursales y tiendas conectadas</strong>, sin costos sorpresa por sumar usuarios al equipo.</>
    }
  ];

  const activeShowcaseIndex = Math.max(0, showcaseTabs.findIndex(t => t.id === activeTabShowcase));
  const activeShowcaseTab = showcaseTabs[activeShowcaseIndex] || showcaseTabs[0];
  return (
    <div className={`min-h-screen font-sans selection:bg-violet-500 selection:text-white overflow-x-hidden ${darkMode ? 'bg-[#030303] text-zinc-200' : 'bg-[#fafafc] text-zinc-800'}`}>
      
      {/* Estilos CSS Embebidos para Animaciones Marquee e Interactivas */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes logoMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .logo-marquee-track {
          display: flex;
          flex-wrap: nowrap;
          justify-content: flex-start;
          width: max-content;
          min-width: max-content;
          animation: logoMarquee 24s linear infinite;
          will-change: transform;
        }
        .glow-hover:hover {
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
        }
        .pulse-sync {
          animation: pulseGlow 0.8s ease-out;
        }
        @keyframes pulseGlow {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3); }
          70% { transform: scale(1.015); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes ringPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5), 0 0 0 0 rgba(16, 185, 129, 0.25); }
          50% { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.15), 0 0 0 10px rgba(16, 185, 129, 0); }
        }
        .ring-pulse { animation: ringPulse 2s ease-in-out infinite; }
        @keyframes tabGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes tabProgress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .tab-progress-bar {
          transform-origin: left center;
          animation: tabProgress 4s linear forwards;
          will-change: transform;
        }
        .hero-image-layer { will-change: opacity; transform: translateZ(0); backface-visibility: hidden; }
      `}} />
      <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b transition-all duration-300 ${darkMode ? 'bg-[#030303]/85 border-white/[0.04]' : 'bg-[#fafafc]/85 border-zinc-200/40'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-[68px] flex items-center justify-between">
          <div className="flex items-center gap-2.5 md:gap-3.5">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-8 h-8 md:w-9 md:h-9 object-contain"
            />
            <div>
              <span className="text-[13px] md:text-[14px] font-bold tracking-tight uppercase leading-none block font-display">
                Algoritmia
              </span>
              <span className="text-[8px] md:text-[9px] font-bold text-violet-500 tracking-[0.24em] uppercase block mt-0.5 md:mt-1">Gestión</span>
            </div>
          </div>

          {/* Nav links — hidden on small screens */}
          <nav className="hidden md:flex items-center gap-1.5">
            {[
              { label: 'Demo', id: 'interactive-demo' },
              { label: 'Testimonios', id: 'testimonios' },
              { label: 'Precio', id: 'pricing' },
              { label: 'FAQ', id: 'faq' },
            ].map(({ label, id }) => (
              <button
                key={label}
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`px-4 py-2.5 text-[14px] font-semibold rounded-lg transition-colors ${darkMode ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            {/* Dark mode toggle — desktop */}
            <button
              onClick={toggleDarkMode}
              className={`hidden md:flex w-10 h-10 rounded-lg border items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
                darkMode ? 'bg-zinc-900/80 border-zinc-500/35 text-zinc-400 hover:bg-zinc-800/90 hover:border-zinc-400/45 hover:text-zinc-100' : 'bg-white border-zinc-200/60 text-zinc-500 hover:bg-zinc-50 shadow-sm'
              }`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px] text-zinc-500" />}
            </button>
            {/* Login button — always visible */}
            <Link
              to="/login"
              className={`h-9 md:h-10 px-4 md:px-5 rounded-lg text-[12px] md:text-[14px] font-bold flex items-center transition-all duration-200 ${
                darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shadow-zinc-900/10'
              }`}
            >
              Comenzar
            </Link>
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className={`md:hidden w-9 h-9 rounded-lg border flex items-center justify-center transition-all active:scale-95 ${
                darkMode ? 'bg-zinc-900/80 border-zinc-500/35 text-zinc-300 hover:bg-zinc-800/90 hover:border-zinc-400/45' : 'bg-white border-zinc-200/60 text-zinc-600 hover:bg-zinc-50 shadow-sm'
              }`}
              aria-label="Abrir menú"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

      </header>
      {/* Mobile side menu */}
      <div
        className={`fixed inset-0 z-[280] md:hidden bg-black/40 backdrop-blur-md transition-opacity duration-300 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-[300] md:hidden w-[220px] flex flex-col border-r transition-all duration-300 ease-in-out ${
          darkMode ? 'bg-[#09090b] border-white/[0.05]' : 'bg-white border-zinc-200'
        } ${menuOpen ? 'translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.2)]' : '-translate-x-full'}`}
      >
        <div className={`h-[76px] flex items-center px-5 border-b flex-shrink-0 ${darkMode ? 'border-white/[0.03]' : 'border-zinc-100'}`}>
          <div className="flex items-center gap-3.5">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-10 h-10 object-contain"
            />
            <div className="flex flex-col">
              <span className={`text-[15px] font-black tracking-tighter leading-none uppercase font-display ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                Algoritmia
              </span>
              <span className="text-[9.5px] font-bold text-violet-500 tracking-[0.2em] mt-1 uppercase">Gestión</span>
            </div>
          </div>
          <button
            className={`ml-auto p-1.5 rounded-xl transition-all ${darkMode ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'}`}
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-7 scrollbar-hide">
          <div className="space-y-1">
            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] px-3.5 mb-2.5 select-none ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Navegación
            </p>
            {[
              { label: 'Demo interactiva', id: 'interactive-demo' },
              { label: 'Testimonios', id: 'testimonios' },
              { label: 'Precio', id: 'pricing' },
              { label: 'Preguntas frecuentes', id: 'faq' },
            ].map(({ label, id }) => (
              <button
                key={label}
                onClick={() => {
                  setMenuOpen(false);
                  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 280);
                }}
                className={`w-full flex items-center h-10 px-3.5 rounded-xl text-[13px] font-bold transition-all ${
                  darkMode ? 'text-zinc-400 hover:text-white hover:bg-white/[0.04]' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] px-3.5 mb-2.5 select-none ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Apariencia
            </p>
            <button
              onClick={toggleDarkMode}
              className={`w-full flex items-center justify-between h-10 px-3.5 rounded-xl text-[13px] font-bold transition-all ${
                darkMode ? 'text-zinc-400 hover:text-white hover:bg-white/[0.04]' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
            >
              <span>{darkMode ? 'Modo claro' : 'Modo oscuro'}</span>
              {darkMode ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </nav>
      </aside>

      {/* Hero Section */}
      <section className="relative pt-32 sm:pt-44 pb-20 lg:pb-28 overflow-hidden">
        {/* Subtle background halo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-zinc-400/5 dark:bg-zinc-400/4 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
          <h1 className={`font-display tracking-tight max-w-4xl mx-auto mb-6 animate-in fade-in slide-in-from-bottom-5 duration-700 text-4xl sm:text-5xl md:text-[62px] lg:text-[72px] font-black leading-[1.1] ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
            Gestioná tu negocio online.{' '}
            <span className="underline decoration-violet-500 decoration-[3px] underline-offset-4">
              Escalá tus ventas.
            </span>
          </h1>

              <p className={`text-[15.5px] sm:text-[17px] max-w-xl mx-auto leading-relaxed mb-10 animate-in fade-in slide-in-from-bottom-6 duration-700 ${darkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>
            Un panel unificado para tus tiendas, campañas y mensajes. Con IA que responde, analiza y optimiza por vos.
          </p>

          <div className="flex flex-col items-center gap-3 mb-16 animate-in fade-in slide-in-from-bottom-7 duration-1000">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/login"
                className={`w-full sm:w-auto h-12 px-8 font-black rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all duration-200 ${
                  darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100 shadow-white/10' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-zinc-900/20'
                }`}
              >
                Comenzar Prueba Gratis de 3 días <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => document.getElementById('interactive-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className={`w-full sm:w-auto h-12 px-8 border font-bold rounded-xl text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] duration-200 ${
                  darkMode ? 'bg-white/5 border-white/[0.12] text-zinc-200 hover:bg-white/10 hover:text-white hover:border-white/20' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm'
                }`}
              >
                Ver demo de la plataforma →
              </button>
            </div>
          </div>
 
          {/* High-Fidelity Showcase Gallery */}
          <div id="platform-showcase" className="relative max-w-5xl lg:max-w-6xl mx-auto mt-10 lg:mt-14 -mx-6 sm:mx-auto animate-in fade-in zoom-in-95 duration-1000">
            <div className="w-full rounded-none sm:rounded-[22px] border p-0 sm:p-1 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/35 dark:border-white/[0.035] shadow-xl">
              <div className={`rounded-none sm:rounded-[18px] border ${darkMode ? 'bg-[#060608] border-white/[0.035]' : 'bg-white border-zinc-200/45'} overflow-hidden`}>

            {/* Tab Selector — responsive wrap */}
            <div className={`flex flex-wrap border-b p-1.5 gap-1 ${darkMode ? 'border-white/[0.05] bg-zinc-950/50' : 'border-zinc-200/50 bg-zinc-50/40'}`}>
              {showcaseTabs.map((tab) => {
                const isActive = activeTabShowcase === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setAutoTabCycle(false); setActiveTabShowcase(tab.id as any); setHeroCycleKey(k => k + 1); }}
                    className={`h-6 md:h-[25px] px-2.5 rounded-md text-[10px] md:text-[11px] font-bold transition-all flex items-center justify-center relative ${
                      isActive
                        ? (darkMode ? 'bg-white/10 text-white border border-white/10' : 'bg-zinc-900 text-white shadow-sm')
                        : (darkMode ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/80')
                    }`}
                  >
                    {tab.label}
                    {isActive && autoTabCycle && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Progress bar — fills over 4s before each auto-cycle switch */}
            {autoTabCycle && (
              <div key={`${activeTabShowcase}-${heroCycleKey}`} className={`h-[4px] sm:h-[3px] overflow-hidden ${darkMode ? 'bg-white/[0.04]' : 'bg-zinc-100'}`}>
                <div
                  className="tab-progress-bar h-full bg-violet-500"
                />
              </div>
            )}

            {/* Screenshot — crossfade between tabs, no height jump */}
            <div
              className={`relative cursor-zoom-in group overflow-hidden ${darkMode ? 'bg-zinc-950' : 'bg-white'}`}
              style={{ aspectRatio: '1600/754' }}
              onClick={() => setZoomImage(activeShowcaseTab.img)}
            >
              {showcaseTabs.map(tab => (
                <img
                  key={tab.id}
                  src={tab.img}
                  alt={tab.label}
                  loading="eager"
                  decoding="async"
                  className="hero-image-layer absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500 ease-out"
                  style={{
                    opacity: activeTabShowcase === tab.id ? 1 : 0,
                    zIndex: activeTabShowcase === tab.id ? 2 : 1,
                  }}
                />
              ))}
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Sparkles className="w-2.5 h-2.5 text-violet-400" /> Ampliar
              </div>
            </div>

            {/* Tab description */}
            <div className={`h-[118px] sm:h-[98px] md:h-[86px] px-4 sm:px-5 py-2.5 border-t flex items-start gap-3 text-left ${darkMode ? 'border-white/[0.05] bg-zinc-950/30' : 'border-zinc-100 bg-zinc-50/60'}`}>
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-violet-500" />
              <div className="min-w-0 flex-1 md:max-w-2xl lg:max-w-3xl">
                <p className={`text-[11px] font-black uppercase tracking-wider mb-1 ${darkMode ? 'text-zinc-200' : 'text-zinc-700'}`}>{activeShowcaseTab.label}</p>
                <p className={`text-[11.5px] sm:text-[12px] leading-relaxed font-medium [&_strong]:font-black ${darkMode ? 'text-zinc-300 [&_strong]:text-zinc-100' : 'text-zinc-500 [&_strong]:text-zinc-800'}`}>{activeShowcaseTab.desc}</p>
              </div>
                  </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Infinite Logo Marquee (Slider / Carousel) */}
      <section className={`py-8 lg:py-10 border-t border-b ${darkMode ? 'bg-zinc-950/30 border-white/[0.03]' : 'bg-zinc-50/30 border-zinc-200/40'}`}>
        <p className="text-center text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-sans mb-4 px-6">
          CONEXIÓN DIRECTA CON TUS PLATAFORMAS PUBLICITARIAS Y DE E-COMMERCE
        </p>

        <div className="relative w-full flex overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#fafafc] dark:from-[#030303] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#fafafc] dark:from-[#030303] to-transparent z-10 pointer-events-none" />
          <div className="logo-marquee-track py-2 gap-4 sm:gap-8 md:gap-12">
            {integrations.concat(integrations).map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                className="flex items-center gap-2.5 sm:gap-3.5 opacity-80 hover:opacity-100 transition-all duration-300 cursor-pointer h-10 sm:h-12 px-3.5 sm:px-5 rounded-xl sm:rounded-2xl bg-zinc-200/10 dark:bg-white/[0.01] border border-transparent hover:border-emerald-500/10"
              >
                <img
                  src={darkMode && item.darkLogo ? item.darkLogo : item.logo}
                  alt={item.name}
                  className={`${item.name === 'TikTok Ads' ? 'h-7 sm:h-9' : 'h-5 sm:h-7'} object-contain max-w-[84px] sm:max-w-[120px]`}
                />
                <span className="text-[11px] sm:text-[12px] font-bold tracking-tight whitespace-nowrap">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Secciones Interactivas de Demostración del Producto */}
      <section id="interactive-demo" className="pt-10 lg:pt-16 pb-20 lg:pb-28 max-w-5xl lg:max-w-6xl mx-auto px-6 flex flex-col gap-8 sm:gap-10 lg:gap-14">
        
        <div className="text-center max-w-2xl mx-auto order-1">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display leading-tight text-zinc-900 dark:text-white">Demo interactiva</h2>
          <p className={`text-[13px] mt-3 mb-8 ${darkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>Probá la plataforma en tiempo real. Todo funciona de verdad.</p>
          <div className="flex items-center justify-center gap-2">
            <div className={`h-px flex-1 max-w-[80px] ${darkMode ? 'bg-white/[0.06]' : 'bg-zinc-200'}`} />
            <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Métricas del negocio</span>
            <div className={`h-px flex-1 max-w-[80px] ${darkMode ? 'bg-white/[0.06]' : 'bg-zinc-200'}`} />
          </div>
        </div>

        {/* 2. BANDEJA OMNICANAL */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)] gap-6 lg:gap-8 items-start pt-12 order-3">
          <div className="col-span-full flex items-center justify-center gap-2">
            <div className={`h-px flex-1 max-w-[80px] ${darkMode ? 'bg-white/[0.06]' : 'bg-zinc-200'}`} />
            <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Mensajería Omnicanal con IA</span>
            <div className={`h-px flex-1 max-w-[80px] ${darkMode ? 'bg-white/[0.06]' : 'bg-zinc-200'}`} />
          </div>
          <div className="space-y-4 lg:sticky lg:top-20">
            <div className="space-y-2">
              <h3 className="text-[20px] sm:text-2xl md:text-3xl font-bold tracking-tight font-display leading-tight text-zinc-900 dark:text-white">Bandeja omnicanal con respuestas de IA</h3>
              <p className={`text-[12px] sm:text-[13.5px] leading-relaxed max-w-sm ${darkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>
                Instagram, WhatsApp y Facebook en un solo lugar. Filtrá por canal y respondé con IA en segundos.
              </p>
            </div>
            {Object.keys(inboxExtraMessages).length > 0 && (
              <button onClick={handleResetChat} className="text-[10px] font-semibold text-violet-500 hover:underline shrink-0">
                Reiniciar simulación
              </button>
            )}
            <div className={`hidden sm:block rounded-2xl border p-4 ${darkMode ? 'bg-zinc-900/50 border-white/[0.06] text-zinc-300' : 'bg-white border-zinc-200/70 text-zinc-600 shadow-sm'}`}>
              <p className="text-[10px] font-black uppercase tracking-wider text-violet-500 mb-2">Demo en vivo</p>
              <p className="text-[12px] leading-relaxed font-medium">Filtrá canales, abrí conversaciones y generá una respuesta con IA como dentro de la app.</p>
            </div>
          </div>

          {/* Full inbox widget */}
          <div className={`min-w-0 rounded-[18px] border overflow-hidden shadow-lg ${darkMode ? 'bg-zinc-900/60 border-white/[0.04]' : 'bg-white border-zinc-200/40'}`}>
            {/* Top bar — channel filter */}
            <div className={`flex items-center gap-1.5 px-3 py-2 border-b ${darkMode ? 'border-white/[0.04] bg-zinc-950/40' : 'border-zinc-100 bg-zinc-50/60'}`}>
              {(['all', 'instagram', 'facebook', 'whatsapp'] as const).map(ch => {
                const labels = { all: 'Todos', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp' };
                const active = inboxChannelFilter === ch;
                const pendingCount = inboxConversations.filter(c =>
                  (ch === 'all' || c.channel === ch) && isInboxPending(c)
                ).length;
                const ChannelIcon = () => {
                  if (ch === 'instagram') return <Instagram className="w-3 h-3 text-pink-500" />;
                  if (ch === 'facebook') return <Facebook className="w-3 h-3 text-blue-500" />;
                  if (ch === 'whatsapp') return (
                    <svg viewBox="0 0 24 24" className="w-3 h-3 fill-emerald-500"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.133.558 4.133 1.535 5.867L0 24l6.335-1.507A11.924 11.924 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.647-.498-5.167-1.366l-.371-.22-3.759.894.952-3.655-.242-.38A9.944 9.944 0 012 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/></svg>
                  );
                  return <MessageSquare className="w-3 h-3 text-zinc-400" />;
                };
                return (
                  <button
                    key={ch}
                    onClick={() => setInboxChannelFilter(ch)}
                    className={`flex items-center gap-1.5 h-6 px-2 sm:px-2.5 rounded-full text-[10px] font-bold transition-all ${
                      active
                        ? (darkMode ? 'bg-white/10 text-white border border-white/15' : 'bg-zinc-900 text-white')
                        : (darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700')
                    }`}
                  >
                    <ChannelIcon />
                    <span className="hidden sm:inline">{labels[ch]}</span>
                    <span className="sm:hidden">{ch === 'all' ? 'Todos' : ch === 'instagram' ? 'IG' : ch === 'facebook' ? 'FB' : 'WA'}</span>
                    {pendingCount > 0 && (
                      <span className={`min-w-[14px] h-[14px] px-[3px] rounded-full text-[8px] font-black flex items-center justify-center ${
                        active ? 'bg-white/25 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-1.5">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${darkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600 border border-amber-200/60'}`}>
                  {inboxConversations.filter(c => (inboxChannelFilter === 'all' || c.channel === inboxChannelFilter) && isInboxPending(c)).length} pendientes
                </span>
              </div>
            </div>

            <div className="flex" style={{ height: 380 }}>
              {/* Left panel — conversation list (hidden on xs when chat is open) */}
              <div className={`${inboxMobileView === 'chat' ? 'hidden sm:flex' : 'flex'} flex-col w-full sm:w-[220px] sm:max-w-[220px] border-r flex-shrink-0 overflow-y-auto ${darkMode ? 'border-white/[0.04]' : 'border-zinc-100'}`}>
                {filteredInboxConvs.map(conv => {
                  const isSelected = conv.id === selectedInboxConvId;
                  const displayStatus = getInboxDisplayStatus(conv);
                  const chDot = conv.channel === 'instagram' ? 'bg-pink-500' : conv.channel === 'facebook' ? 'bg-blue-500' : 'bg-emerald-500';
                  const chLabel = conv.channel === 'instagram' ? 'IG' : conv.channel === 'facebook' ? 'FB' : 'WA';
                  return (
                    <button
                      key={conv.id}
                      onClick={() => {
                        setSelectedInboxConvId(conv.id);
                        setInboxMobileView('chat');
                        if (conv.status === 'pending') {
                          setInboxOpenedIds(prev => {
                            const next = new Set(prev);
                            next.add(conv.id);
                            return next;
                          });
                        }
                      }}
                      className={`flex items-start gap-2.5 p-3 text-left border-b transition-all ${
                        isSelected
                          ? (darkMode ? 'bg-white/[0.04] border-white/[0.04]' : 'bg-violet-50/60 border-zinc-100')
                          : (darkMode ? 'hover:bg-white/[0.02] border-white/[0.03]' : 'hover:bg-zinc-50 border-zinc-50')
                      }`}
                    >
                      <div className={`relative w-8 h-8 rounded-full ${conv.avatarBg} flex items-center justify-center text-white text-[10px] font-black shrink-0`}>
                        {conv.initials}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${chDot} border-2 ${darkMode ? 'border-zinc-900' : 'border-white'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-[11px] font-bold truncate ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>{conv.name}</p>
                          <span className="hidden sm:inline text-[8.5px] text-zinc-500 shrink-0">{conv.time}</span>
                        </div>
                        <p className={`text-[10px] truncate mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{conv.preview}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${chDot} bg-opacity-15 ${conv.channel === 'instagram' ? 'text-pink-500' : conv.channel === 'facebook' ? 'text-blue-500' : 'text-emerald-500'}`}>{chLabel}</span>
                          {displayStatus === 'Pendiente' && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">Pendiente</span>
                          )}
                          {displayStatus === 'Visto' && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-500">Visto</span>
                          )}
                          {displayStatus === 'Respondido' && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-500">Respondido</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right panel — chat view */}
              <div className={`${inboxMobileView === 'list' ? 'hidden sm:flex' : 'flex'} flex-1 flex-col min-w-0`}>
                {/* Chat header */}
                <div className={`flex items-center justify-between px-3 py-2 border-b shrink-0 ${darkMode ? 'border-white/[0.04] bg-zinc-950/30' : 'border-zinc-100 bg-zinc-50/40'}`}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setInboxMobileView('list')}
                      className={`sm:hidden p-1 rounded-lg mr-1 ${darkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-400 hover:text-zinc-700'}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className={`w-7 h-7 rounded-full ${selectedInboxConv.avatarBg} flex items-center justify-center text-white text-[10px] font-black`}>
                      {selectedInboxConv.initials}
                    </div>
                    <div>
                      <p className={`text-[11px] font-bold ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>{selectedInboxConv.name}</p>
                      <p className="text-[8.5px] text-zinc-500 flex items-center gap-1 font-semibold">
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedInboxConv.channel === 'instagram' ? 'bg-pink-500' : selectedInboxConv.channel === 'facebook' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                        {selectedInboxConv.channel === 'instagram' ? 'Instagram DM' : selectedInboxConv.channel === 'facebook' ? 'Facebook Messenger' : 'WhatsApp'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border ${
                    getInboxDisplayStatus(selectedInboxConv) === 'Respondido'
                      ? 'bg-violet-500/10 text-violet-500 border-violet-500/20'
                      : getInboxDisplayStatus(selectedInboxConv) === 'Visto'
                        ? 'bg-violet-500/10 text-violet-500 border-violet-500/20'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }`}>
                    {getInboxDisplayStatus(selectedInboxConv)}
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
                  {getAllMessages(selectedInboxConvId).map((msg, i) => (
                    <div
                      key={`${msg.id}-${i}`}
                      className={`flex flex-col max-w-[82%] animate-in slide-in-from-bottom-1 duration-200 ${msg.sender === 'ai' ? 'ml-auto items-end' : 'items-start'}`}
                    >
                      <div className={`p-2.5 rounded-xl text-[11px] font-medium leading-relaxed ${
                        msg.sender === 'ai'
                          ? 'bg-violet-600 text-white rounded-tr-none'
                          : (darkMode ? 'bg-zinc-800 text-zinc-300 rounded-tl-none' : 'bg-zinc-100 text-zinc-800 rounded-tl-none')
                      }`}>
                        {msg.text}
                      </div>
                      <span className="text-[8px] text-zinc-500 font-semibold mt-0.5 px-1">{msg.time}</span>
                    </div>
                  ))}
                  {getConvStatus(selectedInboxConvId) === 'sending' && (
                    <div className="flex items-center gap-1 p-2.5 rounded-xl max-w-[60px] items-start">
                      <div className={`flex items-center gap-1 p-2 rounded-xl ${darkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input + AI suggestion */}
                <div className={`p-3 border-t shrink-0 ${darkMode ? 'border-white/[0.04] bg-zinc-950/20' : 'border-zinc-100 bg-zinc-50/30'}`}>
                  {selectedInboxConv.aiDraft && getConvStatus(selectedInboxConvId) === 'idle' && !inboxInputText && !(inboxExtraMessages[selectedInboxConvId] || []).some(m => m.sender === 'ai') && (
                    <div className={`p-2.5 rounded-lg border mb-2.5 flex flex-col gap-1 text-left ${
                      darkMode ? 'bg-violet-950/10 border-violet-500/15' : 'bg-violet-50 border-violet-200/50'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-violet-500" />
                        <span className="text-[9px] font-bold uppercase text-violet-600 dark:text-violet-400 tracking-wider">Cerebro de IA — Respuesta Sugerida</span>
                      </div>
                      <p className={`text-[10.5px] leading-relaxed font-semibold ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        "{selectedInboxConv.aiDraft.slice(0, 60)}..."
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <button
                          onClick={handleSendAiResponse}
                          className="text-[9px] font-bold text-violet-600 dark:text-violet-400 hover:underline uppercase flex items-center gap-0.5"
                        >
                          Aprobar y enviar <ArrowUpRight className="w-2.5 h-2.5" />
                        </button>
                        <button
                          onClick={() => setInboxInputText(selectedInboxConv.aiDraft)}
                          className="text-[9px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 uppercase"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inboxInputText}
                      onChange={e => setInboxInputText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendMessage(); }}
                      placeholder="Escribí una respuesta..."
                      className={`flex-1 h-8 px-2.5 rounded-lg text-[11px] outline-none border transition-colors ${
                        darkMode ? 'bg-zinc-900 border-white/[0.08] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/40' : 'bg-white border-zinc-200 text-zinc-800 placeholder:text-zinc-400 focus:border-violet-400/50'
                      }`}
                    />
                    {inboxInputText.trim() ? (
                      <button
                        onClick={() => handleSendMessage()}
                        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-violet-600 hover:bg-violet-500 text-white transition-all"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSendAiResponse}
                        disabled={getConvStatus(selectedInboxConvId) === 'sending' || !selectedInboxConv.aiDraft}
                        className="h-8 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 shrink-0 transition-all disabled:opacity-40 bg-violet-600 hover:bg-violet-500 text-white"
                      >
                        {getConvStatus(selectedInboxConvId) === 'sending'
                          ? <><RefreshCw className="w-3 h-3 animate-spin" /><span className="hidden sm:inline">Enviando...</span></>
                          : <><Sparkles className="w-3 h-3" /><span className="hidden sm:inline">Usar IA</span></>
                        }
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 1. MÉTRICAS Y RENTABILIDAD DEL NEGOCIO */}
        <div className="flex flex-col gap-10 order-2">
          <div className="max-w-2xl space-y-4 text-left">
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-zinc-900 dark:text-white leading-tight">
              Control total de tu rentabilidad, sin planillas
            </h3>
            <p className={`text-[14.5px] leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>
              ROAS real, ticket promedio, facturación neta y costos publicitarios integrados — todo sincronizado automáticamente desde tus cuentas.
            </p>
          </div>

          {/* Simulador Interactivo de Métricas (Dashboard Real de la App) */}
          <div className="w-full rounded-[22px] border p-1 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/35 dark:border-white/[0.035] shadow-xl">
            <div className={`rounded-[18px] border ${darkMode ? 'bg-[#060608] border-white/[0.035]' : 'bg-white border-zinc-200/45'} overflow-hidden p-4 flex flex-col`}>
              
              {/* Dashboard Header */}
              <div className="flex items-center justify-between border-b border-zinc-200/40 dark:border-white/[0.04] pb-3.5">
                <div className="flex items-center gap-2">
                  <img src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'} alt="" className="w-4 h-4 object-contain opacity-60" />
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Dashboard</span>
                </div>
                <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg border ${darkMode ? 'bg-white/[0.03] border-white/[0.06] text-zinc-400' : 'bg-zinc-100 border-zinc-200 text-zinc-500'}`}>
                  Últimos 28 días
                </span>
              </div>

              {/* Dashboard body */}
              <div className="mt-3.5 space-y-5 text-left">

                {/* Hint interactivo — siempre visible */}
                <div className="flex justify-center">
                    <button
                      onClick={() => setExpandedMetric('s-revenue')}
                      className={`${!expandedMetric ? 'ring-pulse' : ''} flex items-center gap-2 text-[10px] font-bold px-4 py-2 rounded-full border transition-all duration-200 ${
                        darkMode
                          ? 'bg-violet-950/20 border-violet-500/30 text-violet-300 hover:bg-violet-900/30 hover:text-white hover:border-violet-400/50'
                          : 'bg-violet-50 border-violet-200 text-violet-600 hover:bg-violet-100 hover:text-violet-800 hover:border-violet-300'
                      }`}
                    >
                      <MousePointerClick className="w-3.5 h-3.5" />
                      Tocá cualquier métrica para ver su evolución
                    </button>
                  </div>

                {/* 1. SECCIÓN: TIENDA ONLINE */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <img src="/assets/shopify-bag.webp" alt="" className="w-4 h-4 object-contain shrink-0" />
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-display">Tienda Online</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[8.5px] text-zinc-400 dark:text-zinc-500 font-semibold">Shopify & Tiendanube</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <MockMetricCard
                      metricId="s-aov"
                      label="Ticket Promedio"
                      value="$ 333"
                      change="13.9"
                      trend="up"
                      sparklineColor="#ec4899"
                      logoSrc="/assets/shopify-bag.webp"
                      logoAlt="Shopify"
                      active={expandedMetric === 's-aov'}
                      onClick={() => setExpandedMetric(expandedMetric === 's-aov' ? null : 's-aov')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="s-orders"
                      label="Pedidos"
                      value="207"
                      change="16.9"
                      trend="up"
                      sparklineColor="#ec4899"
                      logoSrc={darkMode ? '/assets/tiendanube.webp' : '/assets/tiendanubeoscuro.png'}
                      logoAlt="Tiendanube"
                      active={expandedMetric === 's-orders'}
                      onClick={() => setExpandedMetric(expandedMetric === 's-orders' ? null : 's-orders')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="s-revenue"
                      label="Ingresos"
                      value="$ 68.883"
                      change="5.3"
                      trend="up"
                      sparklineColor="#ec4899"
                      logoSrc="/assets/shopify-bag.webp"
                      logoAlt="Shopify"
                      active={expandedMetric === 's-revenue'}
                      onClick={() => setExpandedMetric(expandedMetric === 's-revenue' ? null : 's-revenue')}
                      darkMode={darkMode}
                    />
                  </div>

                  {/* Chart for Tienda group */}
                  {expandedMetric && expandedMetric.startsWith('s-') && (
                    (() => {
                      const details = {
                        's-aov': { label: 'Ticket Promedio', color: '#ec4899' },
                        's-orders': { label: 'Pedidos', color: '#ec4899' },
                        's-revenue': { label: 'Ingresos de Tienda', color: '#ec4899' },
                      }[expandedMetric];
                      return details ? (
                        <MockDetailChart
                          metricId={expandedMetric}
                          label={details.label}
                          color={details.color}
                        />
                      ) : null;
                    })()
                  )}
                </div>

                {/* 2. SECCIÓN: PUBLICIDAD DE META ADS */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1 pt-1.5">
                    <img src="/assets/meta (1).webp" alt="" className="w-4 h-4 object-contain shrink-0" />
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-display">Meta Ads</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[8.5px] text-zinc-400 dark:text-zinc-500 font-semibold">Facebook & Instagram Ads</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    <MockMetricCard
                      metricId="meta-inversion"
                      label="Inversión"
                      value="$ 1.882"
                      change="27.5"
                      trend="up"
                      sparklineColor="#10b981"
                      logoSrc="/assets/meta (1).webp"
                      logoAlt="Meta Ads"
                      active={expandedMetric === 'meta-inversion'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-inversion' ? null : 'meta-inversion')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="meta-alcance"
                      label="Alcance"
                      value="147.284"
                      change="0.3"
                      trend="down"
                      sparklineColor="#10b981"
                      logoSrc="/assets/meta (1).webp"
                      logoAlt="Meta Ads"
                      active={expandedMetric === 'meta-alcance'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-alcance' ? null : 'meta-alcance')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="meta-compras"
                      label="Compras"
                      value="121"
                      change="22.9"
                      trend="down"
                      sparklineColor="#10b981"
                      logoSrc="/assets/meta (1).webp"
                      logoAlt="Meta Ads"
                      active={expandedMetric === 'meta-compras'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-compras' ? null : 'meta-compras')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="meta-roas"
                      label="ROAS"
                      value="17.3"
                      change="32.3"
                      trend="down"
                      sparklineColor="#10b981"
                      logoSrc="/assets/meta (1).webp"
                      logoAlt="Meta Ads"
                      active={expandedMetric === 'meta-roas'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-roas' ? null : 'meta-roas')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="meta-retorno"
                      label="Retorno"
                      value="$ 32.529"
                      change="13.7"
                      trend="up"
                      sparklineColor="#10b981"
                      logoSrc="/assets/meta (1).webp"
                      logoAlt="Meta Ads"
                      active={expandedMetric === 'meta-retorno'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-retorno' ? null : 'meta-retorno')}
                      darkMode={darkMode}
                    />
                  </div>

                  {/* Chart for Meta group */}
                  {expandedMetric && expandedMetric.startsWith('meta-') && (
                    (() => {
                      const details = {
                        'meta-inversion': { label: 'Inversión Publicitaria', color: '#10b981' },
                        'meta-alcance': { label: 'Alcance (Personas Únicas)', color: '#10b981' },
                        'meta-compras': { label: 'Compras Atribuidas', color: '#10b981' },
                        'meta-roas': { label: 'ROAS', color: '#10b981' },
                        'meta-retorno': { label: 'Retorno Atribuido', color: '#10b981' }
                      }[expandedMetric];
                      return details ? (
                        <MockDetailChart
                          metricId={expandedMetric}
                          label={details.label}
                          color={details.color}
                        />
                      ) : null;
                    })()
                  )}
                </div>

                {/* 3. SECCIÓN: EMAIL MARKETING (KLAVIYO) */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1 pt-1.5">
                    <img src="/assets/Klaviyo-Logo-Photoroom.webp" alt="" className="w-4 h-4 object-contain shrink-0" />
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-display">Email Marketing</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[8.5px] text-zinc-400 dark:text-zinc-500 font-semibold">Sincronizado con Klaviyo</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <MockMetricCard
                      metricId="email-sent"
                      label="Entregas"
                      value="2.770"
                      change="406.4"
                      trend="up"
                      sparklineColor="#10b981"
                      logoSrc="/assets/Klaviyo-Logo-Photoroom.webp"
                      logoAlt="Klaviyo"
                      active={expandedMetric === 'email-sent'}
                      onClick={() => setExpandedMetric(expandedMetric === 'email-sent' ? null : 'email-sent')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="email-open"
                      label="Tasa de Apertura"
                      value="60.9%"
                      change="4.0"
                      trend="up"
                      sparklineColor="#10b981"
                      logoSrc="/assets/Klaviyo-Logo-Photoroom.webp"
                      logoAlt="Klaviyo"
                      active={expandedMetric === 'email-open'}
                      onClick={() => setExpandedMetric(expandedMetric === 'email-open' ? null : 'email-open')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="email-click"
                      label="Tasa de Clics"
                      value="10.8%"
                      change="63.5"
                      trend="up"
                      sparklineColor="#10b981"
                      logoSrc="/assets/Klaviyo-Logo-Photoroom.webp"
                      logoAlt="Klaviyo"
                      active={expandedMetric === 'email-click'}
                      onClick={() => setExpandedMetric(expandedMetric === 'email-click' ? null : 'email-click')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="email-revenue"
                      label="Ingresos Email"
                      value="$ 14.822"
                      change="393.1"
                      trend="up"
                      sparklineColor="#10b981"
                      logoSrc="/assets/Klaviyo-Logo-Photoroom.webp"
                      logoAlt="Klaviyo"
                      active={expandedMetric === 'email-revenue'}
                      onClick={() => setExpandedMetric(expandedMetric === 'email-revenue' ? null : 'email-revenue')}
                      darkMode={darkMode}
                    />
                  </div>

                  {/* Chart for Email group */}
                  {expandedMetric && expandedMetric.startsWith('email-') && (
                    (() => {
                      const details = {
                        'email-sent': { label: 'Correos Entregados', color: '#10b981' },
                        'email-open': { label: 'Tasa de Apertura', color: '#10b981' },
                        'email-click': { label: 'Tasa de Clics', color: '#10b981' },
                        'email-revenue': { label: 'Ingresos por Email (Klaviyo)', color: '#10b981' }
                      }[expandedMetric];
                      return details ? (
                        <MockDetailChart
                          metricId={expandedMetric}
                          label={details.label}
                          color={details.color}
                        />
                      ) : null;
                    })()
                  )}
                </div>


              </div>

            </div>
          </div>
        </div>

        {/* 3. CREATIVOS ACTIVOS */}
        <div className="flex flex-col gap-8 pt-12 order-4">
          <div className="flex items-center justify-center gap-2">
            <div className={`h-px flex-1 max-w-[80px] ${darkMode ? 'bg-white/[0.06]' : 'bg-zinc-200'}`} />
            <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Publicidad Activa</span>
            <div className={`h-px flex-1 max-w-[80px] ${darkMode ? 'bg-white/[0.06]' : 'bg-zinc-200'}`} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Anuncios activos con métricas en tiempo real</h3>
            <button className={`${!simAnalyzedIds.size ? 'ring-pulse' : ''} flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all duration-200 w-fit ${darkMode ? 'bg-zinc-900/50 border-white/[0.06] text-zinc-400 hover:text-zinc-200' : 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-800 shadow-sm'}`}>
              <Brain className="w-3 h-3 text-emerald-500" />
              Tocá cualquier creativo para analizarlo con IA
            </button>
          </div>

          {/* 3-card creative grid — mismo diseño que Creativos Activos en la app */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {simCreatives.map((creative) => {
              const pendingCount = creative.comments.filter(c => c.pending).length;
              const tribeScore = creative.tribeMetrics.score;
              const fmtN = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
              return (
                <div
                  key={creative.id}
                  onClick={() => { setSelectedSimCreativeId(creative.id); setSimModalTab('comments'); }}
                  className={`rounded-[18px] border overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col cursor-pointer ${
                    darkMode
                      ? 'bg-zinc-900/50 border-white/[0.04] hover:border-white/[0.08]'
                      : 'bg-white border-zinc-200/40 hover:border-zinc-300/70'
                  }`}
                >
                  {/* Image/Video — exacto al diseño de la app */}
                  <div className="relative w-full h-52 bg-zinc-100 dark:bg-zinc-800 group overflow-hidden flex-shrink-0">
                    {creative.isVideo ? (
                      <>
                        <video src={creative.img} className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" aria-hidden muted playsInline autoPlay loop />
                        <video src={creative.img} className="relative z-10 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" muted playsInline autoPlay loop />
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-black/60 text-white px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-sm">
                          <Play className="w-2.5 h-2.5 fill-white" /> Video
                        </div>
                      </>
                    ) : (
                      <>
                        <img src={creative.img} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" aria-hidden />
                        <img src={creative.img} alt={creative.name} className="relative z-10 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                      </>
                    )}
                      <div className="absolute inset-0 z-20 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-black/50 shadow-2xl opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-200">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    {/* Platform badge */}
                    <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-black/60 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase backdrop-blur-sm">
                      {creative.platform === 'instagram'
                        ? <><Instagram className="w-3 h-3 text-pink-300" /> IG</>
                        : <><Facebook className="w-3 h-3 text-blue-300" /> FB</>
                      }
                    </div>
                    {/* Status badge */}
                    <div className="absolute top-2 left-2 z-30">
                      <span className={`text-[9px] font-black px-2 py-1 rounded-lg backdrop-blur-sm text-white uppercase tracking-wider ${creative.status === 'active' ? 'bg-emerald-500/90' : 'bg-zinc-500/90'}`}>
                        {creative.status === 'active' ? 'Activo' : 'Pausado'}
                      </span>
                    </div>
                    {/* Pending comments badge */}
                    {pendingCount > 0 && (
                      <div className="absolute bottom-2 left-2 z-30 flex items-center gap-1 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                        <MessageCircle className="w-2.5 h-2.5" />
                        {pendingCount} sin responder
                      </div>
                    )}
                    {/* Creative score badge */}
                    <div className={`absolute bottom-2 right-2 z-30 w-9 h-9 rounded-full flex flex-col items-center justify-center text-white font-black text-[11px] shadow-lg ${
                      tribeScore >= 80 ? 'bg-emerald-500 shadow-emerald-200 dark:shadow-none' : tribeScore >= 60 ? 'bg-amber-500 shadow-amber-200 dark:shadow-none' : 'bg-red-500 shadow-red-200 dark:shadow-none'
                    }`}>
                      {tribeScore}
                    </div>
                  </div>

                  {/* Info + metrics — exacto al diseño de la app */}
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">{creative.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Gasto', val: `$${creative.spent}`, highlight: false },
                        { label: 'Compras', val: creative.purchases > 0 ? String(creative.purchases) : '—', highlight: creative.purchases > 0 },
                        { label: 'Leads', val: creative.leads > 0 ? String(creative.leads) : '—', highlight: creative.leads > 0 },
                        { label: 'Mensajes', val: creative.messages > 0 ? String(creative.messages) : '—', highlight: creative.messages > 0 },
                        { label: 'CPA', val: `$${creative.cpa}`, highlight: false },
                        { label: 'ROAS', val: creative.roas > 0 ? `${creative.roas.toFixed(1)}` : '—', highlight: creative.roas > 1 },
                        { label: 'CTR', val: `${creative.ctr.toFixed(1)}%`, highlight: false },
                        { label: 'Alcance', val: fmtN(creative.reach), highlight: false },
                      ].map(({ label, val, highlight }) => (
                        <div key={label} className={`rounded-xl p-1.5 px-2 border flex items-center justify-between gap-1 min-w-0 ${darkMode ? 'bg-zinc-800/50 border-white/[0.04]' : 'bg-zinc-50 border-zinc-100'}`}>
                          <p className="text-[9px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-tight text-left min-w-0 flex-1 truncate">{label}</p>
                          <p className={`text-[11px] font-black text-right shrink-0 leading-none ${highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-800 dark:text-zinc-100'}`}>{val}</p>
                        </div>
                      ))}
                    </div>
                    {/* Analyze button footer */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-auto" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setSelectedSimCreativeId(creative.id); setSimModalTab('metrics'); setTimeout(() => handleSimAnalyze(creative.id), 100); }}
                        className={`flex-1 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                          simAnalyzedIds.has(creative.id)
                            ? (darkMode ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' : 'bg-violet-50 text-violet-600 border border-violet-200/60')
                            : (darkMode ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20' : 'bg-violet-50 text-violet-600 border border-violet-200/60 hover:bg-violet-100')
                        }`}
                      >
                        <Brain className="w-3 h-3" />
                        {simAnalyzedIds.has(creative.id) ? 'Ver análisis IA' : 'Analizar con IA'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </section>

      {/* Feature Highlights Section */}
      <section
        ref={transformRef}
        className={`py-24 lg:py-32 px-6 border-t ${darkMode ? 'border-white/[0.03]' : 'border-zinc-200/40'}`}
      >
        <div className="max-w-5xl lg:max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className={`text-3xl sm:text-4xl font-bold tracking-tight font-display leading-tight mb-4 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
              Todo lo que necesitás, <span className="underline decoration-violet-500 decoration-[3px] underline-offset-4">en un solo lugar</span>
            </h2>
            <p className={`text-[14.5px] max-w-lg mx-auto leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>
              Cada módulo está diseñado para conectarse con el siguiente. Un ecosistema completo, no una colección de herramientas.
            </p>
          </div>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 transition-all duration-700 ease-out ${transformVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          >
            {[
              {
                tag: 'Meta Ads',
                logos: [{ src: '/assets/meta (1).webp', alt: 'Meta Ads' }],
                title: 'Campañas y creativos',
                desc: 'Medí gasto, ROAS, CTR, compras y rendimiento por pieza para saber qué escalar y qué pausar.',
                items: ['Anuncios activos o con gasto', 'Métricas por creativo', 'Análisis creativo con IA'],
              },
              {
                tag: 'Instagram / Facebook',
                logos: [{ icon: 'instagram', alt: 'Instagram' }, { icon: 'facebook', alt: 'Facebook' }],
                title: 'Comentarios y publicaciones',
                desc: 'Centralizá comentarios orgánicos y de anuncios para responder consultas antes de perder ventas.',
                items: ['Comentarios pendientes', 'Respuestas con IA', 'Vista de posteos'],
              },
              {
                tag: 'Chatwoot',
                logos: [{ src: '/assets/chatwoot.svg', alt: 'Chatwoot' }],
                title: 'Mensajería omnicanal',
                desc: 'Unificá WhatsApp, Instagram, Facebook y chat web en una bandeja conectada al Cerebro de IA.',
                items: ['Filtros por canal', 'Historial del cliente', 'Borradores automáticos'],
              },
              {
                tag: 'Shopify / Tiendanube / WooCommerce',
                logos: [
                  { src: '/assets/shopify-bag.webp', alt: 'Shopify' },
                  { src: darkMode ? '/assets/tiendanube.webp' : '/assets/tiendanubeoscuro.png', alt: 'Tiendanube' },
                  { src: '/assets/logowordpress.webp', alt: 'WooCommerce' },
                ],
                title: 'Ventas e inventario',
                desc: 'Sincronizá pedidos, stock, productos y facturación para entender la rentabilidad real.',
                items: ['Pedidos en tiempo real', 'Stock sincronizado', 'Ticket e ingresos'],
              },
              {
                tag: 'Klaviyo',
                logos: [{ src: '/assets/Klaviyo-Logo-Photoroom.webp', alt: 'Klaviyo' }],
                title: 'Email marketing',
                desc: 'Medí entregas, aperturas, clics e ingresos atribuidos a campañas y automatizaciones.',
                items: ['Revenue por email', 'Aperturas y clics', 'Flujos de retención'],
              },
              {
                tag: 'Google Ads',
                logos: [{ src: '/assets/GADS.webp', alt: 'Google Ads' }],
                title: 'Publicidad completa',
                desc: 'Sumá inversión y retorno de Google Ads al mismo panel para comparar canales sin planillas.',
                items: ['Inversión consolidada', 'Comparación de canales', 'Lectura de rentabilidad'],
              },
            ].map((feat, i) => (
              <div
                key={i}
                style={{ transitionDelay: `${i * 60}ms` }}
                className={`p-5 rounded-[18px] border transition-all duration-700 ease-out ${transformVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${
                  darkMode
                    ? 'bg-zinc-900/40 border-white/[0.04] hover:border-white/[0.08] hover:bg-zinc-900/60'
                    : 'bg-white border-zinc-200/40 hover:border-zinc-300/70 shadow-sm hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-2 mb-4">
                  {feat.logos.map((logo: any) => (
                    <div
                      key={logo.alt}
                      title={logo.alt}
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                        darkMode ? 'bg-white/[0.03] border-white/[0.04]' : 'bg-zinc-50 border-zinc-200/45'
                      }`}
                    >
                      {logo.icon === 'instagram' ? (
                        <Instagram className="w-5 h-5 text-pink-500" />
                      ) : logo.icon === 'facebook' ? (
                        <Facebook className="w-5 h-5 text-blue-600" />
                      ) : (
                        <img src={logo.src} alt={logo.alt} className="w-5 h-5 object-contain" />
                      )}
                    </div>
                  ))}
                  <span className={`text-[9px] font-black uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {feat.tag}
                  </span>
                </div>
                <h3 className={`text-[14px] font-bold mb-1.5 ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{feat.title}</h3>
                <p className={`text-[12.5px] leading-relaxed mb-3 ${darkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>{feat.desc}</p>
                <div className="space-y-1.5">
                  {feat.items.map(item => (
                    <div key={item} className={`flex items-center gap-2 text-[11px] font-semibold ${darkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      <Check className="w-3 h-3 text-violet-500 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to="/login"
              className={`inline-flex items-center gap-2 h-11 px-7 font-bold rounded-xl text-[13px] shadow-sm transition-all hover:opacity-90 active:scale-[0.98] ${darkMode ? 'bg-white text-zinc-900 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-zinc-900/10'}`}
            >
              Comenzar gratis <ArrowRight className="w-4 h-4" />
            </Link>
            <p className={`text-[11px] mt-3 ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
              Sin tarjeta de crédito · Configuración en 5 minutos
            </p>
          </div>
        </div>
      </section>



      {/* Testimonials */}
      {(() => {
        const testimonials = [
          { name: 'Lucas Romero', role: 'Dueño de tienda Shopify', quote: 'Tenía 3 tiendas y me volvía loco con las planillas. Ahora entro al panel y en 2 minutos veo todo. Un cambio total.', initials: 'LR', color: '#7c3aed' },
          { name: 'Valentina Suárez', role: 'E-commerce Manager', quote: 'Las métricas de Meta Ads integradas con la tienda me salvaron. Antes tardaba horas en cruzar los datos, ahora lo tengo al instante.', initials: 'VS', color: '#0ea5e9' },
          { name: 'Martín Córdoba', role: 'Emprendedor digital', quote: 'El módulo de comentarios con IA es increíble. Redujimos el tiempo de respuesta un 70% y los clientes lo notaron.', initials: 'MC', color: '#10b981' },
          { name: 'Sofía Méndez', role: 'Directora de Marketing', quote: 'Finalmente puedo ver mi ROAS real contra mi facturación. Tomé decisiones que me ahorraron mucho en pauta.', initials: 'SM', color: '#f59e0b' },
          { name: 'Nicolás García', role: 'Tienda Tiendanube', quote: 'Conecté Shopify y Tiendanube a la vez y todo sincroniza solo. No lo podía creer. Antes lo hacía a mano cada semana.', initials: 'NG', color: '#ec4899' },
          { name: 'Agustina Torres', role: 'Consultora de e-commerce', quote: 'El Cerebro de IA sugiere respuestas para los mensajes y son buenísimas. Mis clientes se sorprenden con la rapidez.', initials: 'AT', color: '#6366f1' },
          { name: 'Fernando Díaz', role: 'Vendedor multicanal', quote: 'El inventario centralizado me evita el horror de quedarme sin stock sin darme cuenta. Ya me pasó una vez antes de usar esto.', initials: 'FD', color: '#14b8a6' },
          { name: 'Carolina Villalba', role: 'Emprendedora textil', quote: 'Me ayudó a descubrir que mi mejor día para vender es el jueves. Nunca lo hubiera visto con las planillas antiguas.', initials: 'CV', color: '#f97316' },
          { name: 'Diego Herrera', role: 'Agencia digital', quote: 'Para agencias como la mía es fundamental. Manejo 8 clientes desde un solo panel, cada uno con sus métricas separadas.', initials: 'DH', color: '#8b5cf6' },
          { name: 'Julieta Paredes', role: 'Co-fundadora startup', quote: 'El informe semanal automático se lo mando a mis socios y ya no me preguntan más cómo vamos. Un ahorro de tiempo enorme.', initials: 'JP', color: '#06b6d4' },
          { name: 'Sebastián Molina', role: 'Dueño de marca propia', quote: 'Migré de tener todo en Excel a esto. La diferencia es abismal. No entiendo cómo vivía sin un dashboard así.', initials: 'SB', color: '#84cc16' },
          { name: 'Florencia Acosta', role: 'Growth Manager', quote: 'La integración con TikTok Ads llegó justo cuando la necesitaba. Todo en un solo lugar, sin exportar nada.', initials: 'FA', color: '#d946ef' },
          { name: 'Rodrigo Vega', role: 'Performance marketer', quote: 'Ver el ticket promedio en tiempo real me cambió la forma de hacer campañas. Ahora escalo con datos, no con intuición.', initials: 'RV', color: '#f43f5e' },
          { name: 'Camila Reyes', role: 'Moda online', quote: 'Empecé con el plan Starter y ya estoy en Corporativo. Vale cada peso. El retorno que me generó es enorme.', initials: 'CR', color: '#a855f7' },
          { name: 'Tomás Fernández', role: 'Director de operaciones', quote: 'El soporte es rápido y el producto mejora constantemente. Se nota que hay gente detrás que entiende de e-commerce.', initials: 'TF', color: '#22c55e' },
          { name: 'Lucía Benítez', role: 'Agencia de marketing', quote: 'En nuestra agencia usamos Algoritmia para todos los clientes. Imposible volver a la forma anterior.', initials: 'LB', color: '#3b82f6' },
        ];
        const row1 = [...testimonials.slice(0, 8), ...testimonials.slice(0, 8)];
        const row2 = [...testimonials.slice(8), ...testimonials.slice(8)];
        const stars = Array(5).fill(null);
        const Card = ({ t }: { t: typeof testimonials[0] }) => (
          <div className={`flex-shrink-0 w-[280px] rounded-2xl p-5 border ${darkMode ? 'bg-zinc-900/80 border-white/[0.06]' : 'bg-white border-zinc-200/60'} shadow-sm`}>
            <div className="flex gap-0.5 mb-3">
              {stars.map((_, i) => (
                <svg key={i} className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              ))}
            </div>
            <p className={`text-[12.5px] leading-relaxed mb-4 ${darkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>"{t.quote}"</p>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0" style={{ backgroundColor: t.color }}>{t.initials}</div>
              <div>
                <div className={`text-[11.5px] font-bold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{t.name}</div>
                <div className="text-[10px] text-zinc-400">{t.role}</div>
              </div>
              <div className="ml-auto flex-shrink-0">
                <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                  Verificado
                </div>
              </div>
            </div>
          </div>
        );
        return (
          <section id="testimonios" className={`py-20 lg:py-28 border-t ${darkMode ? 'border-white/[0.03]' : 'border-zinc-200/40'} overflow-hidden`}>
            <style>{`
              @keyframes marquee-left { from { transform: translateX(0); } to { transform: translateX(-50%); } }
              @keyframes marquee-right { from { transform: translateX(-50%); } to { transform: translateX(0); } }
              .marquee-left { animation: marquee-left 40s linear infinite; }
              .marquee-right { animation: marquee-right 44s linear infinite; }
            `}</style>
            <div className="max-w-5xl lg:max-w-6xl mx-auto px-6 text-center mb-12 lg:mb-16">
              <p className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Lo que dicen nuestros usuarios</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Miles de negocios ya gestionan mejor</h2>
            </div>
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden">
                <div className="marquee-left flex gap-4" style={{ width: 'max-content' }}>
                  {row1.map((t, i) => <Card key={i} t={t} />)}
                </div>
              </div>
              <div className="overflow-hidden">
                <div className="marquee-right flex gap-4" style={{ width: 'max-content' }}>
                  {row2.map((t, i) => <Card key={i} t={t} />)}
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Pricing — 3 plans */}
      <section id="pricing" className="py-20 lg:py-28 max-w-5xl lg:max-w-6xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display mb-2 text-zinc-900 dark:text-white">Planes para cada etapa</h2>
          <p className={`text-[13px] ${darkMode ? 'text-zinc-300' : 'text-zinc-400'}`}>Empezá gratis y escalá según tu negocio crece.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Plan Starter */}
          {(() => {
            const plans = [
              {
                name: 'Starter',
                tagline: 'Para empezar a vender online.',
                price: '$ 9',
                period: '/ mes',
                badge: null,
                highlight: false,
                features: [
                  '1 tienda conectada (Shopify o Tiendanube)',
                  'Dashboard unificado con métricas esenciales',
                  'Monitoreo de Meta Ads (básico)',
                  '50 sugerencias de IA por mes',
                  '1 colaborador incluido',
                  'Soporte por email',
                ],
                cta: 'Comenzar gratis',
                ctaStyle: 'border',
              },
              {
                name: 'Corporativo',
                tagline: 'Multitienda, IA ilimitada y mensajería.',
                price: '$ 20',
                period: '/ mes',
                badge: 'Más popular',
                highlight: true,
                features: [
                  'Hasta 3 tiendas (Shopify, Tiendanube, WooCommerce, ML)',
                  'Bandeja omnicanal (WhatsApp, Instagram, Facebook)',
                  'Cerebro de IA ilimitado',
                  'Pauta completa (Meta, TikTok y Google Ads)',
                  'Colaboradores ilimitados',
                  'Soporte prioritario 24/7',
                ],
                cta: 'Comenzar mi prueba gratuita',
                ctaStyle: 'solid',
              },
              {
                name: 'Agencia',
                tagline: 'Para gestionar múltiples cuentas.',
                price: '$ 50',
                period: '/ mes',
                badge: null,
                highlight: false,
                features: [
                  'Cuentas de clientes ilimitadas',
                  'Todo lo incluido en Corporativo',
                  'Panel multi-cliente centralizado',
                  'Onboarding personalizado',
                  'Manager de cuenta dedicado',
                  'SLA y soporte garantizado',
                ],
                cta: 'Comenzar ahora',
                ctaStyle: 'border',
              },
            ];
            return plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-6 relative overflow-hidden text-left transition-all duration-300 flex flex-col ${
                  plan.highlight
                    ? (darkMode
                        ? 'bg-violet-950/30 border-violet-500/40 shadow-[0_15px_40px_rgba(139,92,246,0.15)]'
                        : 'bg-white border-violet-300/70 shadow-lg shadow-violet-100/60 ring-1 ring-violet-200/50')
                    : (darkMode
                        ? 'bg-zinc-950/50 border-white/[0.06]'
                        : 'bg-white border-zinc-200 shadow-sm')
                }`}
              >
                {plan.badge && (
                  <div className="absolute top-0 right-0 font-bold text-[8.5px] uppercase tracking-wider px-3 py-1 rounded-bl-xl bg-violet-600 text-white">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-5 pb-5 border-b border-zinc-200/50 dark:border-white/[0.05]">
                  <h3 className={`text-[13px] font-black uppercase tracking-wider mb-1 ${plan.highlight ? 'text-violet-500' : (darkMode ? 'text-zinc-400' : 'text-zinc-500')}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-[11.5px] font-medium mb-4 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>{plan.tagline}</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[28px] font-black leading-none ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{plan.price}</span>
                    {plan.period && <span className={`text-[12px] font-semibold ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{plan.period}</span>}
                  </div>
                </div>

                <div className="space-y-3 mb-7 flex-1">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-start gap-2.5">
                      <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${plan.highlight ? 'text-violet-500' : (darkMode ? 'text-zinc-500' : 'text-zinc-400')}`} />
                      <span className={`text-[12px] font-medium leading-snug ${darkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>{f}</span>
                    </div>
                  ))}
                </div>

                <Link
                  to="/login"
                  className={`w-full h-9 font-bold rounded-lg text-[11.5px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all ${
                    plan.ctaStyle === 'solid'
                      ? (darkMode ? 'bg-white text-zinc-900 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shadow-zinc-900/10')
                      : (darkMode ? 'border border-white/10 text-zinc-300 hover:bg-white/5' : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50')
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ));
          })()}
        </div>

        <p className={`text-center text-[11px] mt-6 ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
          Sin tarjeta de crédito · Cancelá cuando quieras
        </p>
      </section>

      {/* FAQ Section (Accordion) */}
      <section id="faq" className="py-20 lg:py-28 max-w-3xl lg:max-w-4xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="text-center mb-10">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight font-display text-center text-zinc-900 dark:text-white">Preguntas frecuentes</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={faq.q}
                className={`rounded-xl border transition-all duration-300 ${
                  isOpen
                    ? (darkMode ? 'bg-zinc-900/40 border-white/[0.08] shadow' : 'bg-zinc-50 border-zinc-300/60 shadow-sm')
                    : (darkMode ? 'bg-[#060608]/40 border-white/[0.03] hover:bg-zinc-900/10 hover:border-white/[0.06]' : 'bg-white border-zinc-200/50 hover:bg-zinc-50/50')
                }`}
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left"
                >
                  <span className={`text-[12.5px] sm:text-[13px] font-semibold tracking-tight transition-colors duration-250 ${isOpen ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-200'}`}>{faq.q}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-zinc-600 dark:text-zinc-300' : 'text-zinc-400'}`} />
                </button>
                {isOpen && (
                  <div className={`faq-answer px-5 pb-5 text-[13px] sm:text-[14px] leading-7 font-medium border-t pt-4 animate-in fade-in duration-300 [&>strong]:font-black [&>strong]:text-zinc-900 dark:[&>strong]:text-white ${
                    darkMode ? 'text-zinc-300 border-white/[0.03]' : 'text-zinc-500 border-zinc-100'
                  }`}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Partners */}
      <section className={`py-10 border-t ${darkMode ? 'bg-zinc-950/10 border-white/[0.03]' : 'bg-white border-zinc-200/40'}`}>
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-center gap-2.5">
          {[
            { label: 'Shopify Partners', logo: '/assets/shopify-bag.webp' },
            { label: 'Tiendanube Partners', logo: darkMode ? '/assets/tiendanube.webp' : '/assets/tiendanubeoscuro.png' },
            { label: 'Meta Ads Partners', logo: '/assets/meta (1).webp' },
          ].map(partner => (
            <div
              key={partner.label}
              className={`h-9 px-3.5 rounded-full border flex items-center gap-2 text-[10.5px] font-black tracking-tight ${
                darkMode ? 'bg-white/[0.03] border-white/[0.07] text-zinc-300' : 'bg-white border-zinc-200/70 text-zinc-700 shadow-sm'
              }`}
            >
              <img src={partner.logo} alt="" className="w-4 h-4 object-contain" />
              {partner.label}
            </div>
          ))}
        </div>
      </section>

      {/* Call to Action Final */}
      <section className={`py-16 lg:py-24 text-center relative overflow-hidden ${darkMode ? 'bg-zinc-950/10 border-t border-white/[0.03]' : 'bg-zinc-50 border-t border-zinc-200/40'}`}>
        <div className="max-w-3xl mx-auto px-6 space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Empezá a vender <span className="underline decoration-violet-500 decoration-[3px] underline-offset-4">más inteligente</span> hoy</h2>
          <p className={`text-[13px] max-w-sm mx-auto ${darkMode ? 'text-zinc-300' : 'text-zinc-400'}`}>
            Configuración en 5 minutos. Sin tarjeta de crédito.
          </p>
          <div className="flex justify-center pt-1">
            <Link
              to="/login"
              className={`h-10 px-7 font-bold rounded-lg text-[12px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all ${darkMode ? 'bg-white text-zinc-900 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shadow-zinc-900/10'}`}
            >
              Crear mi cuenta gratis <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-12 border-t ${darkMode ? 'bg-black border-white/[0.04] text-zinc-500' : 'bg-zinc-50 border-zinc-200/40 text-zinc-400'}`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="col-span-2 sm:col-span-1 space-y-3">
              <div className="flex items-center gap-2">
                <img src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'} alt="Algoritmia" className="w-5 h-5 object-contain" />
                <span className="text-[11px] font-bold font-display tracking-wider text-zinc-800 dark:text-zinc-300">Algoritmia</span>
              </div>
              <p className="text-[10.5px] leading-relaxed">
                Ecosistema de control y automatización omnicanal para e-commerce.
              </p>
              <a href="https://wa.me/5493476245523" target="_blank" rel="noopener noreferrer" className={`text-[10px] font-semibold flex items-center gap-1.5 hover:underline ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                +54 9 3476 24-5523
              </a>
            </div>
            {/* Plataforma */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Plataforma</p>
              <div className="space-y-2">
                {[{ label: 'Inicio', href: '#' }, { label: 'Demo interactiva', href: '#interactive-demo' }, { label: 'Precio', href: '#pricing' }, { label: 'Preguntas frecuentes', href: '#faq' }].map(l => (
                  <a key={l.label} href={l.href} className="block text-[10.5px] hover:underline">{l.label}</a>
                ))}
              </div>
            </div>
            {/* Legal */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Legal</p>
              <div className="space-y-2">
                {[{ label: 'Políticas de Privacidad', to: '/privacidad' }, { label: 'Términos de Uso', to: '/terminos' }, { label: 'Seguridad de Datos', to: '/privacidad' }].map(l => (
                  <Link key={l.label} to={l.to} className="block text-[10.5px] hover:underline">{l.label}</Link>
                ))}
              </div>
            </div>
            {/* Soporte */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Soporte</p>
              <div className="space-y-2">
                {[{ label: 'Centro de soporte', href: '/soporte' }, { label: 'WhatsApp +54 9 3476 24-5523', href: 'https://wa.me/5493476245523' }, { label: 'algoritmia@soporte.com', href: 'mailto:algoritmia@soporte.com' }].map(l => (
                  l.href.startsWith('/') ? (
                    <Link key={l.label} to={l.href} className="block text-[10.5px] hover:underline">{l.label}</Link>
                  ) : (
                  <a key={l.label} href={l.href} target={l.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="block text-[10.5px] hover:underline">{l.label}</a>
                  )
                ))}
              </div>
            </div>
          </div>
          <div className={`pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-[9.5px] font-medium ${darkMode ? 'border-white/[0.04]' : 'border-zinc-200/50'}`}>
            <p>&copy; {new Date().getFullYear()} Algoritmia Desarrollos. Todos los derechos reservados.</p>
            <div className="flex items-center gap-4">
              <Link to="/privacidad" className="hover:underline">Privacidad</Link>
              <span className={darkMode ? 'text-zinc-700' : 'text-zinc-300'}>•</span>
              <Link to="/terminos" className="hover:underline">Términos</Link>
              <span className={darkMode ? 'text-zinc-700' : 'text-zinc-300'}>•</span>
              <Link to="/soporte" className="hover:underline">Soporte</Link>
            </div>
          </div>
        </div>
      </footer>

      {zoomImage && (() => {
        const zTab = showcaseTabs.find(t => t.img === zoomImage);
        return (
          <div
            className="fixed inset-0 z-[900] bg-black backdrop-blur-xl animate-in fade-in duration-200 overflow-hidden flex flex-col items-center justify-center px-4"
            onClick={() => setZoomImage(null)}
          >
            <button
              onClick={() => setZoomImage(null)}
              className="fixed top-4 right-4 z-[10] w-11 h-11 rounded-full bg-white text-zinc-950 hover:bg-zinc-100 border border-white/70 shadow-2xl flex items-center justify-center transition-all"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-full max-w-6xl flex flex-col" onClick={e => e.stopPropagation()}>
              {zTab && (
                <p className="text-[11px] font-black uppercase tracking-widest text-white mb-4 text-center px-6 drop-shadow-[0_1px_4px_rgba(0,0,0,1)]">{zTab.label}</p>
              )}
              <img
                src={zoomImage}
                alt={zTab?.label || 'Vista ampliada'}
                className="w-full object-contain animate-in zoom-in-95 duration-200 rounded-2xl border border-white/15 shadow-2xl bg-zinc-950"
                style={{ maxHeight: '72vh' }}
              />
              {zTab && (
                <div className="mt-5 px-6">
                  <p className="text-[13.5px] text-white leading-relaxed max-w-3xl mx-auto text-center drop-shadow-[0_1px_4px_rgba(0,0,0,1)]">{zTab.desc}</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* WhatsApp floating button */}
      <a
        href="https://wa.me/5493476245523"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar por WhatsApp"
        className="fixed bottom-6 right-6 z-[400] w-13 h-13 flex items-center justify-center rounded-full bg-[#25D366] shadow-lg shadow-[#25D366]/30 hover:bg-[#20BA5A] transition-all duration-200 hover:scale-110 active:scale-95"
        style={{ width: '52px', height: '52px' }}
      >
        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>

      {selectedSimCreative && (
        <div className="fixed inset-0 z-[900] flex min-h-[100dvh] w-screen items-start md:items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div 
            className="absolute inset-0 cursor-default" 
            onClick={() => setSelectedSimCreativeId(null)} 
          />
          <div className={`relative w-full max-w-5xl my-2 md:my-0 rounded-[20px] md:rounded-[24px] border shadow-2xl flex flex-col md:flex-row overflow-hidden max-h-none md:max-h-[85vh] animate-in fade-in zoom-in-95 duration-200 ${
            darkMode ? 'bg-[#09090b] border-white/[0.06] text-white' : 'bg-white border-zinc-200/80 text-zinc-800'
          }`}>
            {/* LADO IZQUIERDO — Vista Previa del Anuncio (Mockup de Red Social) */}
            <div className={`w-full md:w-[42%] md:border-r border-b md:border-b-0 p-4 md:p-5 flex flex-col gap-4 md:justify-between ${
              darkMode ? 'bg-[#0c0c10] border-white/[0.04]' : 'bg-zinc-50 border-zinc-200/60'
            }`}>
              <div className="space-y-4">
                {/* Cabecera del Anuncio */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-[12px] flex items-center justify-center shadow-md shadow-emerald-600/10">
                      A
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] font-black leading-none">Algoritmia Store</p>
                      <p className="text-[8.5px] text-zinc-400 font-semibold mt-0.5 flex items-center gap-0.5">
                        Patrocinado • <span className="text-[7.5px] font-bold">Publicidad</span>
                      </p>
                    </div>
                  </div>
                  {selectedSimCreative.platform === 'instagram' ? (
                    <Instagram className="w-4 h-4 text-pink-500" />
                  ) : (
                    <Facebook className="w-4 h-4 text-blue-500" />
                  )}
                </div>

                {/* Imagen/Video del Anuncio */}
                <div className="aspect-[3/4] rounded-xl overflow-hidden border border-zinc-250/20 dark:border-white/[0.03] bg-zinc-950 shadow-inner relative flex items-center justify-center">
                  {selectedSimCreative.isVideo ? (
                    <video
                      src={selectedSimCreative.img}
                      className="w-full h-full object-contain"
                      autoPlay
                      loop
                      muted
                      playsInline
                      controls
                    />
                  ) : (
                    <img
                      src={selectedSimCreative.img}
                      alt={selectedSimCreative.name}
                      className="w-full h-full object-contain"
                    />
                  )}
                  
                </div>

                {/* Caption / Copy */}
                <div className="text-left space-y-1">
                  <p className="text-[11px] leading-relaxed">
                    <span className="font-black mr-1.5">Algoritmia Store</span>
                    {selectedSimCreative.copy}
                  </p>
                  <p className="text-[9.5px] text-zinc-400 font-bold uppercase tracking-wider pt-0.5">
                    Hace 2 días
                  </p>
                </div>
              </div>

              {/* Pie con KPI Rápido */}
              <div className="pt-4 border-t border-zinc-200/40 dark:border-white/[0.03] flex items-center justify-between text-[10px]">
                <span className="font-semibold text-zinc-500">Inversión Real: <span className="font-black text-zinc-800 dark:text-white">${selectedSimCreative.spent}</span></span>
                <span className="font-semibold text-zinc-500">CTR: <span className="font-black text-zinc-800 dark:text-white">{selectedSimCreative.ctr}%</span></span>
                <span className="font-semibold text-zinc-500">ROAS: <span className="font-black text-emerald-500">{selectedSimCreative.roas}×</span></span>
              </div>
            </div>

            {/* LADO DERECHO — Panel de Control Simulador (Métricas y Moderación) */}
            <div className="w-full md:w-[58%] flex flex-col min-h-[420px] md:min-h-0 md:h-auto md:max-h-[85vh] overflow-hidden">
              {/* Cabecera y Selector de Pestañas */}
              <div className={`p-4 border-b flex items-center justify-between ${
                darkMode ? 'border-white/[0.04] bg-[#0c0c10]' : 'border-zinc-200/60 bg-zinc-50/50'
              }`}>
                <div className="flex items-center gap-1">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSimModalTab('metrics')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-black transition-all ${
                        simModalTab === 'metrics'
                          ? (darkMode ? 'bg-white/8 text-white border border-white/10' : 'bg-white text-zinc-800 border border-zinc-200 shadow-sm')
                          : (darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700')
                      }`}
                    >
                      Análisis Creativo
                    </button>
                    <button
                      onClick={() => setSimModalTab('comments')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 relative ${
                        simModalTab === 'comments'
                          ? (darkMode ? 'bg-white/8 text-white border border-white/10' : 'bg-white text-zinc-800 border border-zinc-200 shadow-sm')
                          : (darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700')
                      }`}
                    >
                      Comentarios
                      {selectedSimCreative.comments.filter(c => c.pending).length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSimCreativeId(null)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${darkMode ? 'bg-white/10 border border-white/25 text-white hover:bg-white/20' : 'bg-zinc-100 border border-zinc-300 text-zinc-700 hover:bg-zinc-200'}`}
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Panel de Contenido Desplazable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {simModalTab === 'metrics' ? (
                  <div className="space-y-5 text-left animate-in fade-in duration-200">
                    {!simAnalyzedIds.has(selectedSimCreative.id) ? (
                      <div className="flex flex-col items-center justify-center gap-5 py-8 text-center">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                          <Brain className="w-6 h-6 text-emerald-500" />
                        </div>
                        {simAnalyzingId === selectedSimCreative.id ? (
                          <>
                            <div className="relative w-16 h-16">
                              <div className="absolute inset-0 rounded-full border-4 border-violet-200 dark:border-violet-900" />
                              <div className="absolute inset-0 rounded-full border-4 border-t-violet-600 animate-spin" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Brain className="w-6 h-6 text-violet-500" />
                              </div>
                            </div>
                            <p className="text-[12px] font-bold text-zinc-700 dark:text-zinc-300">Analizando respuesta visual...</p>
                            <p className="text-[10px] text-zinc-400">Procesando atención, emoción y carga cognitiva</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">Análisis Creativo</p>
                            <p className="text-[11px] text-zinc-400 max-w-[220px]">Analizará la atención, emoción y carga cognitiva de este anuncio.</p>
                            <button
                              onClick={() => handleSimAnalyze(selectedSimCreative.id)}
                              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-violet-200 dark:shadow-none transition-all"
                            >
                              <Zap className="w-4 h-4" /> Analizar creativo
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                    <>
                    {/* Score — igual al CreativeTesterPage */}
                    <div className={`flex items-center gap-4 border rounded-2xl p-5 ${
                      darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'
                    }`}>
                      <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-lg font-black text-white shrink-0 ${
                        selectedSimCreative.tribeMetrics.score >= 80 ? 'bg-emerald-500 shadow-emerald-200 dark:shadow-none' :
                        selectedSimCreative.tribeMetrics.score >= 60 ? 'bg-amber-500 shadow-amber-200 dark:shadow-none' :
                        'bg-red-500 shadow-red-200 dark:shadow-none'
                      }`}>
                        <span className="text-[24px] leading-none">{selectedSimCreative.tribeMetrics.score}</span>
                        <span className="text-[9px] opacity-80 font-bold">/100</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-black text-zinc-900 dark:text-white">{selectedSimCreative.tribeMetrics.label}</p>
                        <p className="text-[10px] text-zinc-400 mt-1">Región dominante: <span className="font-bold text-violet-600 dark:text-violet-400">{selectedSimCreative.tribeMetrics.highestRegion}</span></p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-300 mt-1 leading-snug">{selectedSimCreative.tribeMetrics.textInsight}</p>
                      </div>
                    </div>

                    {/* Barras de Métricas — igual al CreativeTesterPage */}
                    <div className={`border rounded-2xl p-5 space-y-4 ${
                      darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'
                    }`}>
                      {[
                        { label: 'Atención', value: selectedSimCreative.tribeMetrics.attentionPct, color: 'bg-violet-500', reason: selectedSimCreative.tribeMetrics.attentionReason },
                        { label: 'Emoción', value: selectedSimCreative.tribeMetrics.emotionPct, color: 'bg-sky-500', reason: selectedSimCreative.tribeMetrics.emotionReason },
                        { label: 'Carga Cognitiva', value: selectedSimCreative.tribeMetrics.cogLoad,
                          color: selectedSimCreative.tribeMetrics.cogLoad <= 30 ? 'bg-violet-500' : selectedSimCreative.tribeMetrics.cogLoad <= 50 ? 'bg-amber-500' : 'bg-red-500',
                          reason: selectedSimCreative.tribeMetrics.cogLoadReason },
                      ].map(m => (
                        <div key={m.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">{m.label}</span>
                            <span className="text-[13px] font-black text-zinc-900 dark:text-white">{m.value}%</span>
                          </div>
                          <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${m.color}`} style={{ width: `${m.value}%` }} />
                          </div>
                          {m.reason && <p className="text-[10px] text-zinc-400 mt-1 leading-snug">{m.reason}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Curva Atención/Emoción — igual al CreativeTesterPage */}
                    <div className={`border rounded-2xl p-5 space-y-3 ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Curva de Respuesta (30s)</p>
                        <div className="flex items-center gap-3 text-[9px] font-bold text-zinc-400">
                          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-violet-500 inline-block rounded-full" />Atención</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-sky-500 inline-block rounded-full" />Emoción</span>
                        </div>
                      </div>
                      <div className="h-[130px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={genTimeline(selectedSimCreative.tribeMetrics.attentionPct, selectedSimCreative.tribeMetrics.emotionPct, selectedSimCreative.id)} margin={{ left: -15, right: 4, top: 4, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'} />
                            <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}s`} />
                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} width={22} />
                            <Line type="monotone" dataKey="attn" stroke="#10b981" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="emot" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

</>

                    )}

                  </div>
                ) : (
                  <div className="space-y-4 text-left animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[10.5px] font-bold text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.03] pb-2">
                      <span>Comentarios del Anuncio</span>
                      <span className="text-violet-500">
                        {selectedSimCreative.comments.filter(c => c.pending).length} Pendiente{selectedSimCreative.comments.filter(c => c.pending).length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="space-y-3.5">
                      {selectedSimCreative.comments.map((comment) => (
                        <div 
                          key={comment.id}
                          className={`p-3.5 rounded-xl border space-y-3 transition-all ${
                            comment.pending
                              ? (darkMode ? 'bg-[#0f0f13] border-violet-500/20 shadow-sm shadow-violet-500/5' : 'bg-violet-50/20 border-violet-100')
                              : (darkMode ? 'bg-[#07070a]/30 border-white/[0.03] opacity-80' : 'bg-zinc-50/50 border-zinc-200/50')
                          }`}
                        >
                          {/* Info del Comentario */}
                          <div className="flex items-start justify-between">
                            <div className="flex gap-2.5">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase ${
                                comment.pending ? 'bg-violet-500 shadow-md shadow-violet-500/10' : 'bg-zinc-400 dark:bg-zinc-700'
                              }`}>
                                {comment.user.slice(0, 2)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-100">@{comment.user}</span>
                                  <span className="text-[8.5px] text-zinc-400 font-semibold">{comment.time}</span>
                                </div>
                                <p className="text-[11.5px] font-semibold text-zinc-650 dark:text-zinc-300 mt-0.5">{comment.text}</p>
                              </div>
                            </div>

                            {comment.pending ? (
                              <span className="shrink-0 text-[8px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                                Pendiente
                              </span>
                            ) : (
                              <span className="shrink-0 text-[8px] font-black uppercase bg-violet-500/10 text-violet-500 border border-violet-500/20 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                <Check className="w-2 h-2" /> Respondido
                              </span>
                            )}
                          </div>

                          {/* Respuestas Existentes */}
                          {comment.replies.length > 0 && (
                            <div className="pl-6 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-2 mt-2">
                              {comment.replies.map((reply, rIdx) => (
                                <div key={rIdx} className="flex gap-2 items-start text-[10.5px]">
                                  <div className="w-5 h-5 rounded-full bg-violet-600/20 border border-violet-500/25 text-violet-500 text-[8px] font-black flex items-center justify-center shrink-0">
                                    A
                                  </div>
                                  <div className="bg-zinc-100 dark:bg-white/[0.02] p-2 rounded-xl border border-zinc-200/50 dark:border-white/[0.04] flex-1">
                                    <p className="font-semibold text-[11px] leading-relaxed text-zinc-750 dark:text-zinc-200">
                                      <span className="font-extrabold text-violet-600 dark:text-violet-400 mr-1.5">Algoritmia Store</span>
                                      {reply}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Interacciones de Moderación */}
                          {comment.pending && (
                            <div className="pt-1 flex items-center gap-2">
                              {simExpandedCommentId !== comment.id ? (
                                <>
                                  <button 
                                    onClick={() => setSimExpandedCommentId(comment.id)}
                                    className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-[9.5px] transition-colors"
                                  >
                                    Responder
                                  </button>
                                  <button
                                    onClick={() => { setSimExpandedCommentId(comment.id); handleSimGenerateDraft(comment.id, comment.user, comment.text); }}
                                    disabled={simDraftingCommentId !== null}
                                    className="px-3 py-1 rounded-lg text-[9.5px] font-black border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 flex items-center gap-1 transition-colors"
                                  >
                                    <Sparkles className="w-3 h-3 text-violet-500" /> Asistencia IA
                                  </button>
                                </>
                              ) : (
                                <div className="w-full space-y-2.5 animate-in slide-in-from-top-1 duration-200 text-left">
                                  {simDraftingCommentId === comment.id ? (
                                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-violet-500 py-2">
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cerebro de IA sugiriendo borrador...
                                    </div>
                                  ) : (
                                    <>
                                      <textarea
                                        value={simReplyTexts[comment.id] || ''}
                                        onChange={(e) => setSimReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                        placeholder="Escribí tu respuesta..."
                                        className={`w-full p-2.5 rounded-lg border text-[11px] outline-none font-medium h-16 resize-none ${
                                          darkMode ? 'bg-black border-white/10 text-white focus:border-violet-500/50' : 'bg-white border-zinc-350 focus:border-violet-400'
                                        }`}
                                      />
                                      <div className="flex justify-between items-center">
                                        <button 
                                          onClick={() => handleSimGenerateDraft(comment.id, comment.user, comment.text)}
                                          className="text-[9.5px] font-black text-violet-500 hover:underline flex items-center gap-0.5"
                                        >
                                          <Sparkles className="w-3 h-3" /> Generar borrador con IA
                                        </button>
                                        <div className="flex gap-1.5">
                                          <button 
                                            onClick={() => setSimExpandedCommentId(null)}
                                            className="px-2.5 py-1 text-zinc-400 hover:text-zinc-650 font-bold text-[9.5px]"
                                          >
                                            Cancelar
                                          </button>
                                          <button 
                                            onClick={() => handleSimSendReply(selectedSimCreative.id, comment.id)}
                                            disabled={!(simReplyTexts[comment.id] || '').trim()}
                                            className="px-3 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black rounded-lg text-[9.5px] flex items-center gap-1"
                                          >
                                            <Send className="w-2.5 h-2.5" /> Enviar
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
