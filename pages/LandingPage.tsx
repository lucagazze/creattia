import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  AreaChart,
  Area,
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
  Heart,
  Brain,
  Instagram,
  Facebook,
  MessageCircle
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
  darkMode
}: any) => {
  const isPink = sparklineColor === '#ec4899';
  const isViolet = sparklineColor === '#8b5cf6';
  const isGreen = sparklineColor === '#10b981';
  
  let activeBgClass = "bg-blue-50/60 dark:bg-blue-500/5 border-blue-500/30";
  let pulseClass = "bg-blue-500";
  if (isPink) { activeBgClass = "bg-pink-50/60 dark:bg-pink-500/5 border-pink-500/30"; pulseClass = "bg-pink-500"; }
  if (isViolet) { activeBgClass = "bg-violet-50/60 dark:bg-violet-500/5 border-violet-500/30"; pulseClass = "bg-violet-500"; }
  if (isGreen) { activeBgClass = "bg-emerald-50/60 dark:bg-emerald-500/5 border-emerald-500/30"; pulseClass = "bg-emerald-500"; }

  const data = chartMockData[metricId] || [];

  return (
    <button
      onClick={onClick}
      className={`flex flex-col p-3.5 bg-white dark:bg-[#0f0f13] border rounded-[16px] transition-all text-left relative overflow-visible group w-full ${
        active
          ? activeBgClass
          : (darkMode ? 'border-white/[0.04] hover:bg-white/[0.02]' : 'border-zinc-200/60 hover:bg-zinc-50')
      }`}
    >
      <div className="flex items-center justify-between mb-2.5 w-full">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: sparklineColor }} />}
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

// Simulated daily historical data for dashboard metrics
const chartMockData: Record<string, { date: string; val: number }[]> = {
  's-revenue': [
    { date: '2026-06-08', val: 28000 },
    { date: '2026-06-09', val: 31000 },
    { date: '2026-06-10', val: 29500 },
    { date: '2026-06-11', val: 34000 },
    { date: '2026-06-12', val: 30500 },
    { date: '2026-06-13', val: 32400 },
    { date: '2026-06-14', val: 35000 }
  ],
  's-orders': [
    { date: '2026-06-08', val: 3 },
    { date: '2026-06-09', val: 4 },
    { date: '2026-06-10', val: 4 },
    { date: '2026-06-11', val: 5 },
    { date: '2026-06-12', val: 4 },
    { date: '2026-06-13', val: 6 },
    { date: '2026-06-14', val: 5 }
  ],
  's-aov': [
    { date: '2026-06-08', val: 7600 },
    { date: '2026-06-09', val: 7750 },
    { date: '2026-06-10', val: 7375 },
    { date: '2026-06-11', val: 6800 },
    { date: '2026-06-12', val: 7625 },
    { date: '2026-06-13', val: 5400 },
    { date: '2026-06-14', val: 7000 }
  ],
  's-mer': [
    { date: '2026-06-08', val: 8.8 },
    { date: '2026-06-09', val: 9.2 },
    { date: '2026-06-10', val: 9.5 },
    { date: '2026-06-11', val: 9.1 },
    { date: '2026-06-12', val: 9.3 },
    { date: '2026-06-13', val: 9.7 },
    { date: '2026-06-14', val: 9.4 }
  ],
  'meta-inversion': [
    { date: '2026-06-08', val: 3100 },
    { date: '2026-06-09', val: 3350 },
    { date: '2026-06-10', val: 3200 },
    { date: '2026-06-11', val: 3500 },
    { date: '2026-06-12', val: 3250 },
    { date: '2026-06-13', val: 3400 },
    { date: '2026-06-14', val: 3330 }
  ],
  'meta-alcance': [
    { date: '2026-06-08', val: 1200 },
    { date: '2026-06-09', val: 1550 },
    { date: '2026-06-10', val: 1380 },
    { date: '2026-06-11', val: 1720 },
    { date: '2026-06-12', val: 1450 },
    { date: '2026-06-13', val: 1680 },
    { date: '2026-06-14', val: 2100 }
  ],
  'meta-compras': [
    { date: '2026-06-08', val: 2 },
    { date: '2026-06-09', val: 3 },
    { date: '2026-06-10', val: 3 },
    { date: '2026-06-11', val: 4 },
    { date: '2026-06-12', val: 3 },
    { date: '2026-06-13', val: 5 },
    { date: '2026-06-14', val: 4 }
  ],
  'meta-roas': [
    { date: '2026-06-08', val: 9.8 },
    { date: '2026-06-09', val: 10.2 },
    { date: '2026-06-10', val: 10.5 },
    { date: '2026-06-11', val: 10.1 },
    { date: '2026-06-12', val: 10.3 },
    { date: '2026-06-13', val: 11.2 },
    { date: '2026-06-14', val: 10.8 }
  ],
  'meta-retorno': [
    { date: '2026-06-08', val: 28400 },
    { date: '2026-06-09', val: 31200 },
    { date: '2026-06-10', val: 29800 },
    { date: '2026-06-11', val: 33500 },
    { date: '2026-06-12', val: 30100 },
    { date: '2026-06-13', val: 32000 },
    { date: '2026-06-14', val: 31800 }
  ],
  'email-sent': [
    { date: '2026-06-08', val: 1200 },
    { date: '2026-06-09', val: 1350 },
    { date: '2026-06-10', val: 1280 },
    { date: '2026-06-11', val: 1420 },
    { date: '2026-06-12', val: 1350 },
    { date: '2026-06-13', val: 1390 },
    { date: '2026-06-14', val: 1450 }
  ],
  'email-open': [
    { date: '2026-06-08', val: 62.4 },
    { date: '2026-06-09', val: 64.2 },
    { date: '2026-06-10', val: 65.5 },
    { date: '2026-06-11', val: 63.8 },
    { date: '2026-06-12', val: 64.9 },
    { date: '2026-06-13', val: 66.2 },
    { date: '2026-06-14', val: 65.7 }
  ],
  'email-click': [
    { date: '2026-06-08', val: 9.8 },
    { date: '2026-06-09', val: 10.2 },
    { date: '2026-06-10', val: 10.5 },
    { date: '2026-06-11', val: 10.1 },
    { date: '2026-06-12', val: 10.3 },
    { date: '2026-06-13', val: 11.2 },
    { date: '2026-06-14', val: 10.8 }
  ],
  'email-revenue': [
    { date: '2026-06-08', val: 2100 },
    { date: '2026-06-09', val: 2400 },
    { date: '2026-06-10', val: 2600 },
    { date: '2026-06-11', val: 2800 },
    { date: '2026-06-12', val: 3250 },
    { date: '2026-06-13', val: 3100 },
    { date: '2026-06-14', val: 3400 }
  ]
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

  // Redirige al panel si ya está autenticado
  useEffect(() => {
    if (session) {
      navigate('/dashboard');
    }
  }, [session, navigate]);

  // --- Estados de las Simulaciones Interactivas ---
  
  // 1. Simulación de Inbox Omnicanal
  const [chatStatus, setChatStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: 'user', text: 'Hola! Vi el tapado de cuero en Instagram. ¿Tienen en talle S?', time: '12:04' },
    { id: 2, sender: 'user', text: '¿Y hacen envíos a Córdoba?', time: '12:04' }
  ]);

  const handleSendAiResponse = () => {
    if (chatStatus !== 'idle') return;
    setChatStatus('sending');
    
    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        {
          id: 3,
          sender: 'ai',
          text: '¡Hola Sofía! Sí, nos queda la última unidad en talle S de ese tapado. Hacemos envíos rápidos a Córdoba a través de Correo Argentino. ¿Te reservo la unidad?',
          time: '12:05'
        }
      ]);
      setChatStatus('sent');
    }, 1200);
  };

  const handleResetChat = () => {
    setChatMessages([
      { id: 1, sender: 'user', text: 'Hola! Vi el tapado de cuero en Instagram. ¿Tienen en talle S?', time: '12:04' },
      { id: 2, sender: 'user', text: '¿Y hacen envíos a Córdoba?', time: '12:04' }
    ]);
    setChatStatus('idle');
  };

  // Tabbed high-fidelity screenshots switcher
  const [activeTabShowcase, setActiveTabShowcase] = useState<'inicio' | 'mensajeria' | 'comentarios' | 'pedidos' | 'inventario' | 'analisis' | 'creativos' | 'meta_ads' | 'perfil_dark'>('inicio');
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const showcaseTabs = [
    { id: 'inicio', label: 'Dashboard', img: '/assets/landing_inicio.jpg', desc: 'Tu negocio al descubierto en una sola pantalla. Monitoreá ingresos acumulados, pedidos de tus canales de venta, productos estrella y métricas ejecutivas en tiempo real.' },
    { id: 'mensajeria', label: 'Mensajería Directa', img: '/assets/landing_mensajeria.jpg', desc: 'Bandeja omnicanal integrada para Instagram Direct, Facebook Messenger y WhatsApp. Automatizá la gestión diaria y redactá respuestas perfectas con el Cerebro de IA.' },
    { id: 'creativos', label: 'Creativos Ads', img: '/assets/landing_analisis.jpg', desc: 'Control absoluto de tus campañas en Meta Ads. Compará rendimiento, CTR, ROAS y gasto real por pieza creativa en un solo panel para optimizar tu presupuesto.' },
    { id: 'comentarios', label: 'Moderación Comentarios', img: '/assets/landing_comentarios.jpg', desc: 'Moderación automatizada para posteos orgánicos y anuncios de pago. Respondé consultas, filtrá spam y canalizá interacciones hacia la compra al instante.' },
    { id: 'pedidos', label: 'Control Pedidos', img: '/assets/landing_pedidos.jpg', desc: 'Visualización detallada del flujo de compras. Seguimiento de estado de envío, facturación integrada, pasarelas de pago y comportamiento del cliente.' },
    { id: 'inventario', label: 'Stock & Variaciones', img: '/assets/landing_inventario.jpg', desc: 'Sincronización total de tu catálogo. Modificá inventarios, variantes y precios y mirá cómo se propagan automáticamente en todas tus tiendas conectadas.' },
    { id: 'analisis', label: 'Análisis de Productos', img: '/assets/landing_creativos.jpg', desc: 'Embudo de comportamiento inteligente por producto. Tasas de primer pedido (Entry Point), retención de clientes, valor de vida (LTV) y velocidad de recompra.' },
    { id: 'meta_ads', label: 'Meta Ads Analytics', img: '/assets/landing_meta_ads.jpg', desc: 'Estadísticas publicitarias unificadas. Medí alcance, conversiones, CTR, costo por adquisición (CPA) y ROAS exacto contrastado con ventas reales.' },
    { id: 'perfil_dark', label: 'Gestión de Email Marketing', img: '/assets/landing_perfil_dark.jpg', desc: 'Sincronización directa con Klaviyo. Automatizá secuencias de correos para carritos abandonados, bienvenida y retención, atribuyendo cada venta a su respectiva campaña.' }
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
    { name: 'Chatwoot', logo: '/assets/chatwoot.png' }
  ];

  // --- Estados de las Simulaciones Interactivas del Dashboard ---
  const [expandedMetric, setExpandedMetric] = useState<string | null>('s-revenue');
  
  const [selectedSimCreativeId, setSelectedSimCreativeId] = useState<number | null>(null);
  const [simModalTab, setSimModalTab] = useState<'metrics' | 'comments'>('metrics');
  const [simDraftingCommentId, setSimDraftingCommentId] = useState<string | null>(null);
  const [simReplyTexts, setSimReplyTexts] = useState<Record<string, string>>({});
  const [simExpandedCommentId, setSimExpandedCommentId] = useState<string | null>(null);

  const [simCreatives, setSimCreatives] = useState([
    { 
      id: 1, 
      name: 'Anuncio Invierno: Tapado Cuero', 
      spent: 650, 
      ctr: 3.4, 
      roas: 12.4, 
      img: '/assets/landing_creativos.jpg',
      copy: 'Últimas unidades en stock con envío gratis a todo el país.',
      status: 'active',
      platform: 'instagram' as const,
      tribeMetrics: {
        score: 92,
        label: 'Listo para escalar',
        colorClass: 'bg-emerald-500 text-white shadow-emerald-500/20',
        textColor: 'text-emerald-500',
        textInsight: 'La pieza tiene una respuesta emocional excepcional y retención visual del producto por encima del promedio.',
        attentionPct: 94,
        attentionReason: 'Contraste alto y encuadre del producto claro en los primeros 3 segundos.',
        emotionPct: 88,
        emotionReason: 'Dispara impulsos de exclusividad y resguardo térmico.',
        cogLoad: 24,
        cogLoadReason: 'Composición limpia, tipografía legible sin sobrecarga informativa.',
        highestRegion: 'Amígdala (Estímulo Emocional)',
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
      img: '/assets/landing_analisis.jpg',
      copy: 'Botas premium con 30% OFF en nuestra tienda online.',
      status: 'active',
      platform: 'facebook' as const,
      tribeMetrics: {
        score: 79,
        label: 'Requiere ajustes',
        colorClass: 'bg-amber-500 text-white shadow-amber-500/20',
        textColor: 'text-amber-500',
        textInsight: 'La respuesta atencional es buena, pero decae rápidamente a los 5 segundos de reproducción.',
        attentionPct: 81,
        attentionReason: 'Buen gancho inicial, pero el ritmo de edición en la segunda mitad ralentiza la atención.',
        emotionPct: 76,
        emotionReason: 'Mediana respuesta de deseo; la promoción resalta más que la propuesta de valor.',
        cogLoad: 39,
        cogLoadReason: 'Moderada; el texto del 30% OFF compite levemente con el calzado en pantalla.',
        highestRegion: 'FFA (Reconocimiento de Formas)',
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
    },
    { 
      id: 3, 
      name: 'Anuncio Accesorios: Cartera Premium', 
      spent: 199, 
      ctr: 1.1, 
      roas: 3.5, 
      img: '/assets/landing_pedidos.jpg',
      copy: 'Cuero argentino legítimo. El accesorio ideal para tu look.',
      status: 'paused',
      platform: 'instagram' as const,
      tribeMetrics: {
        score: 45,
        label: 'Revisar antes de pautar',
        colorClass: 'bg-red-500 text-white shadow-red-500/20',
        textColor: 'text-red-500',
        textInsight: 'La pieza presenta un rendimiento muy bajo en atención y alta sobrecarga cognitiva.',
        attentionPct: 48,
        attentionReason: 'Bajo contraste cromático. El producto no se distingue adecuadamente de los elementos secundarios.',
        emotionPct: 42,
        emotionReason: 'La paleta de colores fríos inhibe el deseo de compra impulsivo.',
        cogLoad: 68,
        cogLoadReason: 'Carga alta. Demasiados elementos de texto flotantes que saturan la lectura.',
        highestRegion: 'V1 (Corteza Visual Primaria)',
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
          text: 'Hermosa cartera! Me pasan el precio y si hacen envíos?',
          time: 'Hace 1 día',
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



  const faqs = [
    {
      q: '¿Qué integraciones puedo conectar y cuánto tiempo toma?',
      a: 'Podés conectar Shopify, Tiendanube, WooCommerce, Mercado Libre, Google Ads, Meta Ads, TikTok Ads y Klaviyo en menos de 5 minutos. La integración se realiza mediante protocolos OAuth oficiales y seguros con un par de clics, sin requerir conocimientos técnicos ni programación.'
    },
    {
      q: '¿Puedo cancelar mi suscripción en cualquier momento?',
      a: 'Sí, absolutamente. No hay contratos de permanencia ni cláusulas ocultas. Podés dar de baja o pausar tu plan corporativo con un solo clic desde tu panel de facturación en el momento que quieras, sin ningún tipo de cargo adicional por cancelación.'
    },
    {
      q: '¿Cómo ayuda el Cerebro de IA a automatizar mi soporte?',
      a: 'La inteligencia artificial analiza el contenido de tu web, tus políticas y las preguntas frecuentes cargadas. A partir de allí, asiste a tus agentes de atención sugiriendo borradores de respuestas perfectas con stock y precios en tiempo real para despachar con un solo clic.'
    },
    {
      q: '¿Tienen soporte técnico durante la configuración inicial?',
      a: 'Sí. Nuestro equipo técnico de soporte te guiará de forma personalizada y sin costo a través de videollamada para conectar todas tus tiendas y cuentas publicitarias paso a paso, asegurando que tu stock y campañas queden perfectamente integrados.'
    },
    {
      q: '¿Cuántos agentes de atención o tiendas puedo configurar?',
      a: 'Todos los que necesites. Nuestro plan de tarifa plana corporativo incluye agentes, sucursales y tiendas conectadas ilimitadas. No cobramos cargos sorpresa ni costos adicionales por usuario colaborador registrado.'
    }
  ];

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 selection:bg-violet-500 selection:text-white overflow-x-hidden ${darkMode ? 'bg-[#030303] text-zinc-200' : 'bg-[#fafafc] text-zinc-800'}`}>
      
      {/* Estilos CSS Embebidos para Animaciones Marquee e Interactivas */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: flex;
          width: max-content;
          animation: marquee 32s linear infinite;
        }
        .glow-hover:hover {
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.15);
        }
        .pulse-sync {
          animation: pulseGlow 0.8s ease-out;
        }
        @keyframes pulseGlow {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.3); }
          70% { transform: scale(1.015); box-shadow: 0 0 0 6px rgba(139, 92, 246, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
        }
      `}} />
      <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b transition-all duration-300 ${darkMode ? 'bg-[#030303]/85 border-white/[0.04]' : 'bg-[#fafafc]/85 border-zinc-200/40'}`}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-[26px] h-[26px] object-contain"
            />
            <div>
              <span className="text-[11.5px] font-bold tracking-tight uppercase leading-none block font-display">
                ALGORITMIA
              </span>
              <span className="text-[7.5px] font-bold text-violet-500 tracking-[0.25em] uppercase block mt-0.5">Gestión</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
                darkMode ? 'bg-white/5 border-white/8 text-zinc-400 hover:bg-white/10 hover:text-white' : 'bg-white border-zinc-200/60 text-zinc-500 hover:bg-zinc-50 shadow-sm'
              }`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-zinc-500" />}
            </button>
            <Link
              to="/login"
              className={`h-8 px-3.5 rounded-lg text-[11px] font-bold flex items-center transition-all duration-200 ${
                darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shadow-zinc-900/10'
              }`}
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 sm:pt-36 pb-20 overflow-hidden">
        {/* Halos de luz de fondo estilo Linear */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/10 dark:bg-violet-600/8 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-fuchsia-500/5 dark:bg-fuchsia-500/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-6xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[10.5px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/15 mb-8 animate-in fade-in slide-in-from-top-4 duration-500 font-sans tracking-wide">
            <Sparkles className="w-3.5 h-3.5" /> Ecosistema Multitienda y Omnicanal
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-black tracking-tight max-w-4xl mx-auto leading-[1.08] mb-6 font-display text-zinc-900 dark:text-zinc-50 animate-in fade-in slide-in-from-bottom-5 duration-700">
            La plataforma para gestionar tu negocio online y escalar ventas
          </h1>
          
          <p className={`text-[15.5px] sm:text-[17.5px] max-w-2xl mx-auto leading-relaxed mb-10 font-medium animate-in fade-in slide-in-from-bottom-6 duration-700 ${darkMode ? 'text-zinc-400 font-medium' : 'text-zinc-550 font-semibold'}`}>
            Centralizá tus canales de venta, automatizá la atención al cliente con IA y controlá tu rentabilidad real en tiempo real. Todo desde un panel unificado, ultrarrápido y sin planillas manuales.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-in fade-in slide-in-from-bottom-7 duration-1000">
            <Link
              to="/login"
              className={`w-full sm:w-auto h-11 px-7 font-bold rounded-xl text-[12.5px] flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all duration-200 ${
                darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              Comenzar prueba gratis <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <a
              href="#interactive-demo"
              className={`w-full sm:w-auto h-11 px-7 border font-extrabold rounded-xl text-[12.5px] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] hover:scale-[1.02] duration-300 ${
                darkMode ? 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm'
              }`}
            >
              Ver maquetas interactivas
            </a>
          </div>
 
          {/* High-Fidelity Showcase Gallery */}
          <div id="platform-showcase" className={`relative max-w-5xl mx-auto mt-10 rounded-2xl border overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-1000 ${darkMode ? 'bg-[#060608] border-white/[0.06]' : 'bg-white border-zinc-200/50'}`}>

            {/* Tab Selector */}
            <div className={`flex border-b overflow-x-auto scrollbar-none p-2 gap-1 ${darkMode ? 'border-white/[0.05] bg-zinc-950/50' : 'border-zinc-200/50 bg-zinc-50/40'}`}>
              {showcaseTabs.map((tab) => {
                const isActive = activeTabShowcase === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTabShowcase(tab.id as any)}
                    className={`h-7 px-3.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center shrink-0 ${
                      isActive
                        ? (darkMode ? 'bg-white/10 text-white border border-white/10' : 'bg-zinc-900 text-white shadow-sm')
                        : (darkMode ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/80')
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Screenshot */}
            <div
              className="relative cursor-zoom-in group"
              onClick={() => setZoomImage(showcaseTabs.find(t => t.id === activeTabShowcase)?.img || null)}
            >
              <img
                src={showcaseTabs.find(t => t.id === activeTabShowcase)?.img}
                alt={showcaseTabs.find(t => t.id === activeTabShowcase)?.label}
                className="w-full h-auto max-h-[580px] object-contain block mx-auto transition-all duration-300 animate-in fade-in"
              />
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Sparkles className="w-2.5 h-2.5 text-violet-400" /> Ampliar
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Infinite Logo Marquee (Slider / Carousel) */}
      <section className={`py-8 border-t border-b overflow-hidden ${darkMode ? 'bg-zinc-950/30 border-white/[0.03]' : 'bg-zinc-50/30 border-zinc-200/40'}`}>
        <div className="max-w-6xl mx-auto px-6 mb-4">
          <p className="text-center text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-sans">
            CONEXIÓN DIRECTA CON TUS PLATAFORMAS PUBLICITARIAS Y DE E-COMMERCE
          </p>
        </div>
        
        {/* Infinite Scrolling Row */}
        <div className="relative w-full flex overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#fafafc] dark:from-[#030303] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#fafafc] dark:from-[#030303] to-transparent z-10 pointer-events-none" />
          
          <div className="animate-marquee py-2 gap-8 md:gap-12">
            {integrations.concat(integrations).map((item, idx) => (
              <div 
                key={`${item.name}-${idx}`} 
                className="flex items-center gap-3.5 opacity-80 hover:opacity-100 transition-all duration-300 cursor-pointer h-12 px-5 rounded-2xl bg-zinc-200/10 dark:bg-white/[0.01] border border-transparent hover:border-violet-500/10"
              >
                <img
                  src={darkMode && item.darkLogo ? item.darkLogo : item.logo}
                  alt={item.name}
                  className="h-7 object-contain max-w-[120px]"
                />
                <span className="text-[12px] font-bold tracking-tight">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Secciones Interactivas de Demostración del Producto */}
      <section id="interactive-demo" className="py-20 max-w-5xl mx-auto px-6 space-y-28">
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">DEMO EN VIVO</span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display leading-tight text-zinc-900 dark:text-white">Interactúa con nuestras soluciones</h2>
          <p className={`text-[12.5px] mt-2 font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Probá el comportamiento de la plataforma en tiempo real con estas maquetas interactivas.</p>
        </div>

        {/* 1. MAQUETA INTERACTIVA DE INBOX OMNICANAL */}
        <div className="flex flex-col lg:flex-row items-center gap-10">
          <div className="flex-1 space-y-5 text-left">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Bandeja de entrada omnicanal y respuestas inteligentes con IA</h3>
            <p className={`text-[13.5px] leading-relaxed font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Centralizá todas tus conversaciones de WhatsApp, Instagram y Facebook en un solo lugar. El Cerebro de IA lee cada mensaje entrante y te sugiere respuestas exactas con stock y precios actualizados en tiempo real para cerrar ventas en segundos.
            </p>
            
            <div className="pt-1">
              <button 
                onClick={handleSendAiResponse}
                disabled={chatStatus !== 'idle'}
                className={`h-8 px-4 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-lg text-[11px] flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-sm shadow-violet-600/10`}
              >
                {chatStatus === 'idle' && (
                  <>Probar simulación de respuesta con IA <ArrowRight className="w-3.5 h-3.5" /></>
                )}
                {chatStatus === 'sending' && (
                  <>IA redactando borrador... <RefreshCw className="w-3 h-3 animate-spin" /></>
                )}
                {chatStatus === 'sent' && (
                  <>¡Respuesta enviada! 🎉</>
                )}
              </button>
              {chatStatus === 'sent' && (
                <button 
                  onClick={handleResetChat}
                  className="mt-2.5 text-[10px] font-semibold text-violet-500 hover:underline block"
                >
                  Reiniciar simulación
                </button>
              )}
            </div>
          </div>

          {/* Caja Interactiva de Chat */}
          <div className="flex-1 w-full rounded-2xl border p-1 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/50 dark:border-white/[0.04] shadow-lg">
            <div className={`rounded-xl border ${darkMode ? 'bg-[#060608]/90 border-white/[0.04]' : 'bg-white border-zinc-200/50'} overflow-hidden h-[330px] flex flex-col justify-between`}>
              
              {/* Encabezado del Chat */}
              <div className="flex items-center justify-between p-3 border-b border-zinc-200/40 dark:border-white/[0.04] bg-zinc-50/30 dark:bg-zinc-950/30">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-pink-500 flex items-center justify-center text-white text-[11px] font-bold font-mono">SR</div>
                  <div>
                    <p className="text-[11px] font-bold">Sofía Rodríguez</p>
                    <p className="text-[8.5px] text-zinc-500 flex items-center gap-1 font-semibold">
                      <span className="w-1 h-1 rounded-full bg-pink-500" /> Instagram DM
                    </p>
                  </div>
                </div>
                <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${chatStatus === 'sent' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                  {chatStatus === 'sent' ? 'Respondido' : 'Pendiente'}
                </span>
              </div>

              {/* Mensajes */}
              <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
                {chatMessages.map(msg => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col max-w-[80%] ${msg.sender === 'ai' ? 'ml-auto items-end animate-in slide-in-from-bottom-2 duration-300' : 'items-start'}`}
                  >
                    <div className={`p-2.5 rounded-xl text-[11px] font-medium leading-relaxed ${
                      msg.sender === 'ai' 
                        ? 'bg-violet-600 text-white rounded-tr-none' 
                        : (darkMode ? 'bg-zinc-900 text-zinc-300 rounded-tl-none' : 'bg-zinc-100 text-zinc-800 rounded-tl-none')
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[8px] text-zinc-500 font-semibold mt-0.5 px-1">{msg.time}</span>
                  </div>
                ))}

                {chatStatus === 'sending' && (
                  <div className="flex items-center gap-1 p-2.5 rounded-xl bg-zinc-900/40 max-w-[70px]">
                    <span className="w-1 h-1 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>

              {/* Caja de Entrada + Sugerencia de IA */}
              <div className="p-3 border-t border-zinc-200/40 dark:border-white/[0.04] bg-zinc-50/30 dark:bg-zinc-950/30">
                {chatStatus === 'idle' && (
                  <div className={`p-2.5 rounded-lg border mb-2.5 flex flex-col gap-1 text-left transition-all ${
                    darkMode ? 'bg-violet-950/10 border-violet-500/15' : 'bg-violet-50 border-violet-200/50'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-violet-500" />
                      <span className="text-[9px] font-bold uppercase text-violet-600 dark:text-violet-400 tracking-wider">Cerebro de IA — Respuesta Sugerida</span>
                    </div>
                    <p className={`text-[10.5px] leading-relaxed font-semibold ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      "¡Hola Sofía! Sí, nos queda la última unidad en talle S de ese tapado..."
                    </p>
                    <button 
                      onClick={handleSendAiResponse}
                      className="mt-1 self-start text-[9px] font-bold text-violet-600 dark:text-violet-400 hover:underline uppercase flex items-center gap-0.5"
                    >
                      Aprobar y enviar <ArrowUpRight className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Escribí una respuesta..." 
                    readOnly
                    className={`flex-1 h-8 px-2.5 rounded-lg text-[11px] outline-none border ${
                      darkMode ? 'bg-zinc-900 border-white/[0.04] text-zinc-400' : 'bg-zinc-50 border-zinc-200/55 text-zinc-500'
                    }`}
                  />
                  <button className="h-8 w-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* 2. MÉTRICAS Y RENTABILIDAD DEL NEGOCIO */}
        <div className="flex flex-col gap-10 border-t border-zinc-200/40 dark:border-white/[0.03] pt-20">
          <div className="max-w-2xl space-y-5 text-left">
            <h3 className="text-2xl sm:text-3xl md:text-[34px] font-bold tracking-tight font-display text-zinc-900 dark:text-white leading-tight">
              Toma el <strong>control absoluto</strong> de tu rentabilidad <strong>sin planillas manuales</strong>
            </h3>
            <p className={`text-[15px] sm:text-[16px] leading-relaxed font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Conectamos directamente tus <strong>pasarelas de pago</strong> y <strong>cuentas publicitarias</strong> para darte el <strong>ROAS real</strong>, <strong>ticket promedio</strong>, <strong>facturación neta</strong> y <strong>costos integrados</strong> en tiempo real. Tomá decisiones basadas en <strong>datos duros</strong>, no en suposiciones.
            </p>
            
            <ul className="space-y-3.5 text-[14px] sm:text-[15px] font-semibold text-zinc-650 dark:text-zinc-350">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Sincronización automatizada multitienda (<strong>Shopify y Tiendanube</strong>).</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Atribución exacta de pauta en <strong>Meta Ads y TikTok Ads</strong>.</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Medición directa de la retención y conversión de <strong>Email Marketing</strong>.</span>
              </li>
            </ul>
          </div>

          {/* Simulador Interactivo de Métricas (Dashboard Real de la App) */}
          <div className="w-full rounded-3xl border p-1.5 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/50 dark:border-white/[0.04] shadow-xl">
            <div className={`rounded-2xl border ${darkMode ? 'bg-[#060608] border-white/[0.04]' : 'bg-white border-zinc-200/60'} overflow-hidden p-4 flex flex-col`}>
              
              {/* Dashboard Header */}
              <div className="flex items-center justify-between border-b border-zinc-200/40 dark:border-white/[0.04] pb-3.5">
                <div className="flex items-center gap-2">
                  <img src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'} alt="" className="w-4 h-4 object-contain opacity-60" />
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Dashboard</span>
                </div>
                <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg border ${darkMode ? 'bg-white/[0.03] border-white/[0.06] text-zinc-400' : 'bg-zinc-100 border-zinc-200 text-zinc-500'}`}>
                  Últimos 30 días
                </span>
              </div>

              {/* Dashboard body */}
              <div className="mt-3.5 space-y-5 text-left">
                
                {/* 1. SECCIÓN: TIENDA ONLINE */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <ShoppingBag className="w-4 h-4 text-pink-500 shrink-0" />
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-display">Tienda Online</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[8.5px] text-zinc-400 dark:text-zinc-500 font-semibold">Shopify & Tiendanube</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <MockMetricCard
                      metricId="s-aov"
                      label="Ticket Promedio"
                      value="$ 7.880"
                      change="4.2"
                      trend="up"
                      sparklineColor="#ec4899"
                      icon={Receipt}
                      active={expandedMetric === 's-aov'}
                      onClick={() => setExpandedMetric(expandedMetric === 's-aov' ? null : 's-aov')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="s-orders"
                      label="Pedidos"
                      value="119"
                      change="8.5"
                      trend="up"
                      sparklineColor="#ec4899"
                      icon={Package}
                      active={expandedMetric === 's-orders'}
                      onClick={() => setExpandedMetric(expandedMetric === 's-orders' ? null : 's-orders')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="s-revenue"
                      label="Ingresos"
                      value="$ 937.790"
                      change="12.4"
                      trend="up"
                      sparklineColor="#ec4899"
                      icon={DollarSign}
                      active={expandedMetric === 's-revenue'}
                      onClick={() => setExpandedMetric(expandedMetric === 's-revenue' ? null : 's-revenue')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="s-mer"
                      label="M.E.R. (Eficiencia)"
                      value="9.4x"
                      change="3.2"
                      trend="up"
                      sparklineColor="#ec4899"
                      icon={TrendingUp}
                      active={expandedMetric === 's-mer'}
                      onClick={() => setExpandedMetric(expandedMetric === 's-mer' ? null : 's-mer')}
                      darkMode={darkMode}
                    />
                  </div>
                  
                  {/* Chart for Tienda group */}
                  {expandedMetric && expandedMetric.startsWith('s-') && (
                    (() => {
                      const details = {
                        's-aov': { label: 'Ticket Promedio', color: '#ec4899' },
                        's-orders': { label: 'Pedidos Concretados', color: '#ec4899' },
                        's-revenue': { label: 'Ingresos de Tienda', color: '#ec4899' },
                        's-mer': { label: 'M.E.R. (Eficiencia)', color: '#ec4899' }
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
                    <TrendingUp className="w-4 h-4 text-violet-500 shrink-0" />
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-display">Meta Ads</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[8.5px] text-zinc-400 dark:text-zinc-500 font-semibold">Facebook & Instagram Ads</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <MockMetricCard
                      metricId="meta-inversion"
                      label="Inversión"
                      value="$ 99.900"
                      change="5.1"
                      trend="up"
                      sparklineColor="#8b5cf6"
                      icon={DollarSign}
                      active={expandedMetric === 'meta-inversion'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-inversion' ? null : 'meta-inversion')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="meta-alcance"
                      label="Alcance"
                      value="45.200"
                      change="12.8"
                      trend="up"
                      sparklineColor="#8b5cf6"
                      icon={Users}
                      active={expandedMetric === 'meta-alcance'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-alcance' ? null : 'meta-alcance')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="meta-compras"
                      label="Compras"
                      value="82"
                      change="9.3"
                      trend="up"
                      sparklineColor="#8b5cf6"
                      icon={Package}
                      active={expandedMetric === 'meta-compras'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-compras' ? null : 'meta-compras')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="meta-roas"
                      label="ROAS"
                      value="10.8x"
                      change="6.2"
                      trend="up"
                      sparklineColor="#8b5cf6"
                      icon={TrendingUp}
                      active={expandedMetric === 'meta-roas'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-roas' ? null : 'meta-roas')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="meta-retorno"
                      label="Retorno"
                      value="$ 937.000"
                      change="11.5"
                      trend="up"
                      sparklineColor="#8b5cf6"
                      icon={DollarSign}
                      active={expandedMetric === 'meta-retorno'}
                      onClick={() => setExpandedMetric(expandedMetric === 'meta-retorno' ? null : 'meta-retorno')}
                      darkMode={darkMode}
                    />
                  </div>
                  
                  {/* Chart for Meta group */}
                  {expandedMetric && expandedMetric.startsWith('meta-') && (
                    (() => {
                      const details = {
                        'meta-inversion': { label: 'Inversión Publicitaria', color: '#8b5cf6' },
                        'meta-alcance': { label: 'Alcance (Impresiones Únicas)', color: '#8b5cf6' },
                        'meta-compras': { label: 'Compras Atribuidas', color: '#8b5cf6' },
                        'meta-roas': { label: 'ROAS Atribuido (Retorno)', color: '#8b5cf6' },
                        'meta-retorno': { label: 'Retorno Atribuido (Ventas)', color: '#8b5cf6' }
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
                    <Mail className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-display">Email Marketing</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[8.5px] text-zinc-400 dark:text-zinc-500 font-semibold">Sincronizado con Klaviyo</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <MockMetricCard
                      metricId="email-sent"
                      label="Entregas"
                      value="1.450"
                      change="15.2"
                      trend="up"
                      sparklineColor="#10b981"
                      icon={Mail}
                      active={expandedMetric === 'email-sent'}
                      onClick={() => setExpandedMetric(expandedMetric === 'email-sent' ? null : 'email-sent')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="email-open"
                      label="Tasa de Apertura"
                      value="65.7%"
                      change="2.8"
                      trend="up"
                      sparklineColor="#10b981"
                      icon={MailOpen}
                      active={expandedMetric === 'email-open'}
                      onClick={() => setExpandedMetric(expandedMetric === 'email-open' ? null : 'email-open')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="email-click"
                      label="Tasa de Clics"
                      value="10.8%"
                      change="1.4"
                      trend="up"
                      sparklineColor="#10b981"
                      icon={MousePointerClick}
                      active={expandedMetric === 'email-click'}
                      onClick={() => setExpandedMetric(expandedMetric === 'email-click' ? null : 'email-click')}
                      darkMode={darkMode}
                    />
                    <MockMetricCard
                      metricId="email-revenue"
                      label="Ingresos Email"
                      value="$ 91.200"
                      change="18.2"
                      trend="up"
                      sparklineColor="#10b981"
                      icon={DollarSign}
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
                        'email-revenue': { label: 'Ingresos Email (Klaviyo)', color: '#10b981' }
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

                {/* 4. PERFORMANCE BREAKDOWN DETAIL (DESGLOSE) */}
                <div className="space-y-2 border-t border-zinc-200/40 dark:border-white/[0.03] pt-4">
                  <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block mb-2">Desglose de rendimiento</span>
                  
                  {(!expandedMetric || expandedMetric.startsWith('s-')) && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] animate-in fade-in duration-200">
                      <div className="p-3 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-zinc-200/30 dark:border-white/[0.02] text-left">
                        <div className="flex items-center gap-1.5 mb-1">
                          <img src="/assets/shopify-bag.webp" alt="Shopify" className="w-4 h-4 object-contain" />
                          <span className="text-zinc-400 font-semibold block text-[8px] uppercase tracking-wider">Shopify</span>
                        </div>
                        <span className="font-extrabold text-[12.5px] text-zinc-800 dark:text-zinc-200 block mb-0.5">$ 625.300</span>
                        <span className="text-[8.5px] text-zinc-450 dark:text-zinc-500 block font-semibold">82 pedidos concretados</span>
                      </div>
                      
                      <div className="p-3 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-zinc-200/30 dark:border-white/[0.02] text-left">
                        <div className="flex items-center gap-1.5 mb-1">
                          <img src={darkMode ? "/assets/tiendanube.webp" : "/assets/tiendanubeoscuro.png"} alt="Tiendanube" className="w-4 h-4 object-contain" />
                          <span className="text-zinc-400 font-semibold block text-[8px] uppercase tracking-wider">Tiendanube</span>
                        </div>
                        <span className="font-extrabold text-[12.5px] text-zinc-800 dark:text-zinc-200 block mb-0.5">$ 312.490</span>
                        <span className="text-[8.5px] text-zinc-450 dark:text-zinc-500 block font-semibold">37 pedidos concretados</span>
                      </div>
                    </div>
                  )}

                  {expandedMetric && expandedMetric.startsWith('meta-') && (
                    <div className="grid grid-cols-3 gap-2 text-[10px] animate-in fade-in duration-200">
                      <div className="p-2.5 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-zinc-200/30 dark:border-white/[0.02] text-left">
                        <span className="text-zinc-400 font-semibold block text-[8px] uppercase tracking-wider mb-1">Clicks</span>
                        <span className="font-extrabold text-[12.5px] text-zinc-800 dark:text-zinc-200 block mb-0.5">72.277</span>
                        <span className="text-[8px] text-zinc-400 block font-semibold">CTR Promedio 2.8%</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-zinc-200/30 dark:border-white/[0.02] text-left">
                        <span className="text-zinc-400 font-semibold block text-[8px] uppercase tracking-wider mb-1">Ventas</span>
                        <span className="font-extrabold text-[12.5px] text-zinc-800 dark:text-zinc-200 block mb-0.5">39 compras</span>
                        <span className="text-[8px] text-zinc-400 block font-semibold">Atribución directa</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-zinc-200/30 dark:border-white/[0.02] text-left">
                        <span className="text-zinc-400 font-semibold block text-[8px] uppercase tracking-wider mb-1">Retorno</span>
                        <span className="font-extrabold text-[12.5px] text-zinc-800 dark:text-zinc-200 block mb-0.5">$ 10.362</span>
                        <span className="text-[8px] text-zinc-400 block font-semibold">ROAS Atribuido 10.8×</span>
                      </div>
                    </div>
                  )}

                  {expandedMetric && expandedMetric.startsWith('email-') && (
                    <div className="grid grid-cols-3 gap-2 text-[10px] animate-in fade-in duration-200">
                      <div className="p-2.5 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-zinc-200/30 dark:border-white/[0.02] text-left">
                        <span className="text-zinc-400 font-semibold block text-[8px] uppercase tracking-wider mb-1">Enviados</span>
                        <span className="font-extrabold text-[12.5px] text-zinc-800 dark:text-zinc-200 block mb-0.5">1.450 correos</span>
                        <span className="text-[8px] text-zinc-400 block font-semibold">Campañas + Secuencias</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-zinc-200/30 dark:border-white/[0.02] text-left">
                        <span className="text-zinc-400 font-semibold block text-[8px] uppercase tracking-wider mb-1">Apertura</span>
                        <span className="font-extrabold text-[12.5px] text-zinc-800 dark:text-zinc-200 block mb-0.5">65.7%</span>
                        <span className="text-[8px] text-zinc-400 block font-semibold">Tasa promedio</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-zinc-200/30 dark:border-white/[0.02] text-left">
                        <span className="text-zinc-400 font-semibold block text-[8px] uppercase tracking-wider mb-1">Clicks</span>
                        <span className="font-extrabold text-[12.5px] text-zinc-800 dark:text-zinc-200 block mb-0.5">10.8%</span>
                        <span className="text-[8px] text-zinc-400 block font-semibold">CTR del Email</span>
                      </div>
                    </div>
                  )}

                </div>

              </div>

            </div>
          </div>
        </div>

        {/* 3. CREATIVOS ACTIVOS */}
        <div className="flex flex-col gap-8 border-t border-zinc-200/40 dark:border-white/[0.03] pt-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Anuncios activos con métricas en tiempo real</h3>
              <p className={`text-[13px] font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Tocá cualquier anuncio para ver el análisis de IA y moderar comentarios de compradores</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {[
                { label: 'ROAS prom.', value: '10.8×', color: 'text-emerald-500' },
                { label: 'Activos', value: `${simCreatives.filter(c => c.status === 'active').length}/${simCreatives.length}`, color: 'text-violet-500' },
                {
                  label: 'Consultas',
                  value: `${simCreatives.reduce((acc, c) => acc + c.comments.filter(comm => comm.pending).length, 0)}`,
                  color: simCreatives.reduce((acc, c) => acc + c.comments.filter(comm => comm.pending).length, 0) > 0 ? 'text-violet-500' : 'text-emerald-500'
                },
              ].map((kpi) => (
                <div key={kpi.label} className={`px-3 py-1.5 rounded-lg border text-center min-w-[60px] ${darkMode ? 'bg-zinc-900/40 border-white/[0.04]' : 'bg-white border-zinc-200/60'}`}>
                  <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-wider">{kpi.label}</p>
                  <p className={`text-[12px] font-black ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 3-card creative grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {simCreatives.map((creative) => {
              const pendingCount = creative.comments.filter(c => c.pending).length;
              const tribeScore = creative.tribeMetrics.score;
              return (
                <button
                  key={creative.id}
                  onClick={() => { setSelectedSimCreativeId(creative.id); setSimModalTab('metrics'); }}
                  className={`relative flex flex-col rounded-2xl border overflow-hidden group transition-all duration-250 text-left cursor-pointer ${
                    darkMode
                      ? 'bg-zinc-950/50 border-white/[0.06] hover:border-violet-500/25 hover:shadow-lg hover:shadow-violet-500/5'
                      : 'bg-white border-zinc-200/60 hover:border-violet-200 shadow-sm hover:shadow-lg hover:shadow-violet-50'
                  }`}
                >
                  {/* Creative image */}
                  <div className="relative aspect-[4/5] overflow-hidden bg-zinc-950">
                    <img
                      src={creative.img}
                      alt={creative.name}
                      className="w-full h-full object-cover transition-transform duration-400 group-hover:scale-[1.04]"
                    />
                    {/* Platform badge */}
                    <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-lg">
                      {creative.platform === 'instagram'
                        ? <Instagram className="w-3.5 h-3.5 text-pink-400" />
                        : <Facebook className="w-3.5 h-3.5 text-blue-400" />
                      }
                    </div>
                    {/* Status */}
                    <div className="absolute top-2 left-2">
                      <span className={`text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full backdrop-blur-sm ${
                        creative.status === 'active' ? 'bg-emerald-500/80 text-white' : 'bg-zinc-600/80 text-white'
                      }`}>
                        {creative.status === 'active' ? 'Activo' : 'Pausado'}
                      </span>
                    </div>
                    {/* Tribe score */}
                    <div className={`absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[10px] shadow-lg ${
                      tribeScore >= 80 ? 'bg-emerald-500' : tribeScore >= 60 ? 'bg-amber-500' : 'bg-red-500'
                    }`}>
                      {tribeScore}
                    </div>
                    {/* Pending comments */}
                    {pendingCount > 0 && (
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-violet-600/90 backdrop-blur-sm text-white text-[8px] font-black px-2 py-0.5 rounded-full animate-pulse">
                        <MessageCircle className="w-2.5 h-2.5" />
                        {pendingCount}
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <span className="translate-y-1 group-hover:translate-y-0 transition-transform duration-200 bg-white/90 dark:bg-zinc-900/90 text-zinc-900 dark:text-white text-[10px] font-black px-3 py-1.5 rounded-full flex items-center gap-1 shadow-lg border border-zinc-200/50 dark:border-white/10">
                        <Sparkles className="w-3 h-3 text-violet-500" /> Ver análisis
                      </span>
                    </div>
                  </div>

                  {/* Metrics below */}
                  <div className={`p-3.5 border-t ${darkMode ? 'border-white/[0.04]' : 'border-zinc-100'}`}>
                    <p className="text-[11.5px] font-bold text-zinc-800 dark:text-zinc-100 mb-3 leading-tight line-clamp-1">{creative.name}</p>
                    <div className="grid grid-cols-3 gap-1">
                      <div className="text-center">
                        <p className="text-[8px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">Gasto</p>
                        <p className="text-[13px] font-black text-zinc-700 dark:text-zinc-200">${creative.spent}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">CTR</p>
                        <p className="text-[13px] font-black text-zinc-700 dark:text-zinc-200">{creative.ctr}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">ROAS</p>
                        <p className={`text-[13px] font-black ${creative.roas >= 10 ? 'text-emerald-500' : creative.roas >= 6 ? 'text-amber-500' : 'text-red-500'}`}>{creative.roas}×</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </section>

      {/* Problem vs Solution Section (Ultra-Minimalist) */}
      <section className="py-20 max-w-4xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">EL DESAFÍO</span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display leading-tight text-zinc-900 dark:text-white">Eliminá el caos operativo de tu e-commerce</h2>
          <p className="text-[12.5px] font-medium text-zinc-500 dark:text-zinc-400 mt-1.5">Dejá atrás las planillas manuales y las ventas perdidas por falta de sincronización.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Problem Card */}
          <div className={`p-6 rounded-2xl border transition-all duration-300 ${darkMode ? 'bg-zinc-950/30 border-red-500/10' : 'bg-white border-zinc-200/50 shadow-sm'}`}>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center mb-5">
              <span className="text-red-500 font-bold text-[13px]">✕</span>
            </div>
            <h3 className="text-[14.5px] font-bold font-display mb-3 text-zinc-850 dark:text-zinc-100">El caos operativo tradicional</h3>
            <ul className="space-y-3.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> Métricas dispersas en múltiples planillas e informes lentos.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> Chats perdidos entre Instagram, Facebook y WhatsApp.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> Falta de control del stock real y quiebres de inventario.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> Incertidumbre sobre qué anuncios y creativos traen retorno real.
              </li>
            </ul>
          </div>

          {/* Solution Card */}
          <div className={`p-6 rounded-2xl border transition-all duration-300 ${darkMode ? 'bg-violet-950/5 border-violet-500/15' : 'bg-violet-500/[0.005] border-violet-200/40 shadow-sm'}`}>
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center mb-5">
              <Check className="w-4 h-4 text-violet-500" />
            </div>
            <h3 className="text-[14.5px] font-bold font-display mb-3 text-zinc-850 dark:text-zinc-100">La solución unificada de Algoritmia</h3>
            <ul className="space-y-3.5 text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Ver todas las metricas Unificadas
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Mensajeria Unificada
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Visualizacion de pedidos y stock
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Gestion de los Anuncios
              </li>
            </ul>
          </div>
        </div>
      </section>



      {/* Corporate Pricing Card (Minimalist Apple style) */}
      <section className="py-20 max-w-xl mx-auto px-6 text-center border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="mb-10">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">PRECIO SIMPLE</span>
          <h2 className="text-2xl font-bold tracking-tight font-display mb-2 text-zinc-900 dark:text-white">Un único plan con todo el poder de automatización</h2>
          <p className={`text-[12.5px] font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Accedé a todas las integraciones, soporte prioritario e infraestructura sin cargos ocultos ni límites de usuarios.</p>
        </div>

        <div className={`rounded-2xl border p-6 relative overflow-hidden text-left transition-all duration-300 ${
          darkMode ? 'bg-zinc-950/50 border-white/[0.06] shadow-[0_15px_40px_rgba(0,0,0,0.4)]' : 'bg-white border-zinc-200 shadow-lg shadow-zinc-200/5'
        }`}>
          <div className="absolute top-0 right-0 bg-violet-600 text-white font-bold text-[8.5px] uppercase tracking-wider px-3 py-0.5 rounded-bl-lg font-display">POPULAR</div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/50 dark:border-white/[0.04] pb-5 mb-5">
            <div>
              <h3 className="text-[15px] font-bold font-display text-zinc-900 dark:text-white">Plan Corporativo</h3>
              <p className="text-[11.5px] text-zinc-400 font-semibold mt-0.5">Sincronización total multitienda e IA.</p>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-3xl font-bold font-display text-zinc-900 dark:text-white">$ 49</span>
              <span className="text-zinc-500 font-semibold text-[12px]">/ mes</span>
            </div>
          </div>

          <div className="space-y-3.5 mb-6">
            {[
              'Sincronización en tiempo real de Shopify, Tiendanube, WooCommerce y ML',
              'Bandeja omnicanal de mensajes (WhatsApp, Instagram y Facebook)',
              'Sugerencias inteligentes basadas en Cerebro de IA ilimitadas',
              'Monitoreo integral de pauta publicitaria (Meta, TikTok y Google Ads)',
              'Agentes y colaboradores de soporte sin costos adicionales',
              'Soporte corporativo y prioritario 24/7'
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-2.5 text-[12px] font-medium">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <Link
            to="/login"
            className="w-full h-9 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-[11.5px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shadow-sm shadow-violet-600/10 glow-hover"
          >
            Comenzar mi prueba gratuita
          </Link>
        </div>
      </section>

      {/* FAQ Section (Accordion) */}
      <section className="py-20 max-w-3xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="text-center mb-10">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">RESPUESTAS RÁPIDAS</span>
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
                    ? (darkMode ? 'bg-zinc-900/20 border-violet-500/20 shadow' : 'bg-violet-500/[0.005] border-violet-500/15 shadow-sm')
                    : (darkMode ? 'bg-[#060608]/40 border-white/[0.03] hover:bg-zinc-900/10 hover:border-white/[0.06]' : 'bg-white border-zinc-200/50 hover:bg-zinc-50/50')
                }`}
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left"
                >
                  <span className={`text-[12.5px] sm:text-[13px] font-semibold tracking-tight transition-colors duration-250 ${isOpen ? 'text-violet-500 dark:text-violet-400 font-display' : 'text-zinc-800 dark:text-zinc-200'}`}>{faq.q}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-violet-500' : ''}`} />
                </button>
                {isOpen && (
                  <div className={`px-5 pb-4 text-[11.5px] sm:text-[12px] leading-relaxed font-medium border-t pt-3 animate-in fade-in duration-300 ${
                    darkMode ? 'text-zinc-400 border-white/[0.03]' : 'text-zinc-500 border-zinc-100'
                  }`}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Call to Action Final */}
      <section className={`py-16 text-center relative overflow-hidden ${darkMode ? 'bg-zinc-950/10 border-t border-white/[0.03]' : 'bg-zinc-50 border-t border-zinc-200/40'}`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="max-w-3xl mx-auto px-6 relative z-10 space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Impulsá la eficiencia y escala tu facturación hoy</h2>
          <p className={`text-[12.5px] font-medium max-w-sm mx-auto ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Comenzá en menos de 5 minutos. Conectá tus tiendas y empezá a vender de forma inteligente.
          </p>
          <div className="flex justify-center pt-1">
            <Link
              to="/login"
              className="h-9 px-6 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-[11.5px] flex items-center justify-center gap-1.5 shadow-sm shadow-violet-600/10 active:scale-[0.98] transition-all glow-hover"
            >
              Crear mi cuenta <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-10 border-t text-center ${darkMode ? 'bg-black border-white/[0.04] text-zinc-600' : 'bg-white border-zinc-200/40 text-zinc-400'}`}>
        <div className="max-w-6xl mx-auto px-6 space-y-5">
          <div className="flex items-center justify-center gap-2">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-4 h-4 object-contain"
            />
            <span className="text-[10px] font-bold font-display tracking-wider text-zinc-800 dark:text-zinc-300">ALGORITMIA</span>
          </div>
          <p className="text-[10.5px] font-medium max-w-xs mx-auto leading-relaxed">
            Ecosistema de control y automatización omnicanal para e-commerce. Diseñado por Algoritmia Desarrollos.
          </p>
          <div className="flex justify-center gap-5 text-[9.5px] font-semibold">
            <Link to="/privacidad" className="hover:underline">Políticas de Privacidad</Link>
            <Link to="/soporte" className="hover:underline">Soporte Técnico</Link>
          </div>
          <p className="text-[8.5px] font-medium text-zinc-500 pt-1.5">
            &copy; {new Date().getFullYear()} Algoritmia Desarrollos. Todos los derechos reservados.
          </p>
        </div>
      </footer>

      {zoomImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md transition-all duration-300 p-4 cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <div className="absolute top-4 right-4 z-[101]">
            <button 
              onClick={() => setZoomImage(null)}
              className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all border border-white/10"
              aria-label="Cerrar vista"
            >
              <span className="text-lg font-bold">✕</span>
            </button>
          </div>
          <div className="max-w-4xl max-h-[85vh] w-full flex items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
            <img 
              src={zoomImage} 
              alt="Visualización ampliada" 
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-250 border border-white/10" 
            />
          </div>
        </div>
      )}

      {selectedSimCreative && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 cursor-default" 
            onClick={() => setSelectedSimCreativeId(null)} 
          />
          <div className={`relative w-full max-w-5xl rounded-[24px] border shadow-2xl flex flex-col md:flex-row overflow-hidden max-h-[90vh] md:max-h-[85vh] animate-in fade-in zoom-in-95 duration-200 ${
            darkMode ? 'bg-[#09090b] border-white/[0.06] text-white' : 'bg-white border-zinc-200/80 text-zinc-800'
          }`}>
            {/* LADO IZQUIERDO — Vista Previa del Anuncio (Mockup de Red Social) */}
            <div className={`w-full md:w-[42%] border-r p-5 flex flex-col justify-between ${
              darkMode ? 'bg-[#0c0c10] border-white/[0.04]' : 'bg-zinc-50 border-zinc-200/60'
            }`}>
              <div className="space-y-4">
                {/* Cabecera del Anuncio */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-violet-600 text-white font-black text-[12px] flex items-center justify-center shadow-md shadow-violet-600/10">
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

                {/* Imagen del Anuncio */}
                <div className="aspect-[4/5] rounded-xl overflow-hidden border border-zinc-250/20 dark:border-white/[0.03] bg-zinc-950 shadow-inner relative flex items-center justify-center">
                  <img 
                    src={selectedSimCreative.img} 
                    alt={selectedSimCreative.name} 
                    className="w-full h-full object-cover" 
                  />
                  
                  {/* Action Bar (Heart, Comment, etc) */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 flex items-center justify-between text-white">
                    <div className="flex items-center gap-3">
                      <Heart className="w-4 h-4 text-white hover:text-red-500 cursor-pointer transition-colors" />
                      <MessageSquare className="w-4 h-4 text-white cursor-pointer" />
                      <Send className="w-4 h-4 text-white cursor-pointer" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-wider bg-white/10 px-2 py-0.5 rounded border border-white/10">
                      Ver Tienda
                    </span>
                  </div>
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
                <span className="font-semibold text-zinc-500">ROAS: <span className="font-black text-violet-500">{selectedSimCreative.roas}×</span></span>
              </div>
            </div>

            {/* LADO DERECHO — Panel de Control Simulador (Métricas y Moderación) */}
            <div className="w-full md:w-[58%] flex flex-col h-[500px] md:h-[600px] overflow-hidden">
              {/* Cabecera y Selector de Pestañas */}
              <div className={`p-4 border-b flex items-center justify-between ${
                darkMode ? 'border-white/[0.04] bg-[#0c0c10]' : 'border-zinc-200/60 bg-zinc-50/50'
              }`}>
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[11.5px] font-black text-violet-500 bg-violet-500/10 px-2.5 py-1 rounded-full border border-violet-500/10">
                    <Brain className="w-3.5 h-3.5" /> TRIBE v2
                  </span>
                  <span className="text-[12px] font-bold text-zinc-400 dark:text-zinc-500 font-display">|</span>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setSimModalTab('metrics')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-black transition-all ${
                        simModalTab === 'metrics'
                          ? (darkMode ? 'bg-white/5 text-white border border-white/10' : 'bg-white text-zinc-800 border border-zinc-200 shadow-sm')
                          : 'text-zinc-400 hover:text-zinc-650'
                      }`}
                    >
                      Neurométricas
                    </button>
                    <button 
                      onClick={() => setSimModalTab('comments')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 relative ${
                        simModalTab === 'comments'
                          ? (darkMode ? 'bg-white/5 text-white border border-white/10' : 'bg-white text-zinc-800 border border-zinc-200 shadow-sm')
                          : 'text-zinc-400 hover:text-zinc-650'
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
                  className={`p-1.5 rounded-full border transition-all ${
                    darkMode ? 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] text-zinc-400' : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-600'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Panel de Contenido Desplazable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {simModalTab === 'metrics' ? (
                  <div className="space-y-5 text-left animate-in fade-in duration-200">
                    {/* Score global */}
                    <div className={`p-4 border rounded-2xl flex items-center gap-4 ${
                      darkMode ? 'bg-[#0f0f13] border-white/[0.04]' : 'bg-zinc-50 border-zinc-200/50'
                    }`}>
                      <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center shadow-lg font-black text-white shrink-0 ${
                        selectedSimCreative.tribeMetrics.score >= 80 ? 'bg-emerald-500 shadow-emerald-500/10' :
                        selectedSimCreative.tribeMetrics.score >= 60 ? 'bg-amber-500 shadow-amber-500/10' :
                        'bg-red-500 shadow-red-500/10'
                      }`}>
                        <span className="text-[20px] leading-none">{selectedSimCreative.tribeMetrics.score}</span>
                        <span className="text-[8px] opacity-75">/100</span>
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-black">{selectedSimCreative.tribeMetrics.label}</h4>
                        <p className="text-[9.5px] text-zinc-400 mt-1">
                          Región dominante: <span className="font-bold text-violet-500">{selectedSimCreative.tribeMetrics.highestRegion}</span>
                        </p>
                      </div>
                    </div>

                    {/* Barras de Métricas */}
                    <div className={`p-4 border rounded-2xl space-y-4 ${
                      darkMode ? 'bg-[#0f0f13] border-white/[0.04]' : 'bg-zinc-50 border-zinc-200/50'
                    }`}>
                      {/* Atención */}
                      <div>
                        <div className="flex items-center justify-between mb-1 text-[10px] font-bold">
                          <span className="text-zinc-400 uppercase tracking-wider">Atención del Consumidor</span>
                          <span className="text-emerald-500 font-extrabold">{selectedSimCreative.tribeMetrics.attentionPct}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${selectedSimCreative.tribeMetrics.attentionPct}%` }} />
                        </div>
                        <p className="text-[9px] text-zinc-400 mt-1 leading-snug">{selectedSimCreative.tribeMetrics.attentionReason}</p>
                      </div>

                      {/* Emoción */}
                      <div>
                        <div className="flex items-center justify-between mb-1 text-[10px] font-bold">
                          <span className="text-zinc-400 uppercase tracking-wider">Resonancia Emocional</span>
                          <span className="text-violet-500 font-extrabold">{selectedSimCreative.tribeMetrics.emotionPct}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${selectedSimCreative.tribeMetrics.emotionPct}%` }} />
                        </div>
                        <p className="text-[9px] text-zinc-400 mt-1 leading-snug">{selectedSimCreative.tribeMetrics.emotionReason}</p>
                      </div>

                      {/* Carga Cognitiva */}
                      <div>
                        <div className="flex items-center justify-between mb-1 text-[10px] font-bold">
                          <span className="text-zinc-400 uppercase tracking-wider">Carga Cognitiva (Saturación)</span>
                          <span className={`font-extrabold ${
                            selectedSimCreative.tribeMetrics.cogLoad <= 30 ? 'text-emerald-500' :
                            selectedSimCreative.tribeMetrics.cogLoad <= 50 ? 'text-amber-500' :
                            'text-red-500'
                          }`}>{selectedSimCreative.tribeMetrics.cogLoad}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            selectedSimCreative.tribeMetrics.cogLoad <= 30 ? 'bg-emerald-500' :
                            selectedSimCreative.tribeMetrics.cogLoad <= 50 ? 'bg-amber-500' :
                            'bg-red-500'
                          }`} style={{ width: `${selectedSimCreative.tribeMetrics.cogLoad}%` }} />
                        </div>
                        <p className="text-[9px] text-zinc-400 mt-1 leading-snug">{selectedSimCreative.tribeMetrics.cogLoadReason}</p>
                      </div>
                    </div>


                  </div>
                ) : (
                  <div className="space-y-4 text-left animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[10.5px] font-bold text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.03] pb-2">
                      <span>Bandeja de Consultas de Anuncio</span>
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
                              <span className="shrink-0 text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
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
                                    onClick={() => handleSimGenerateDraft(comment.id, comment.user, comment.text)}
                                    disabled={simDraftingCommentId !== null}
                                    className="px-3 py-1 rounded-lg text-[9.5px] font-black border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/[0.02] flex items-center gap-1 transition-colors"
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
