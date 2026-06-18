import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useViewAs } from "../contexts/ViewAsContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabase";
import {
  metaAds,
  INSIGHT_FIELDS,
  DAILY_FIELDS,
  DatePreset,
  presetToRange,
  getPrevPeriod,
  today,
  daysAgo,
} from "../services/metaAds";
import { klaviyo } from "../services/klaviyo";
import { ecommerce } from "../services/ecommerce";
import { chatwoot } from "../services/chatwoot";
import { db } from "../services/db";
import {
  BarChart2,
  Mail,
  ExternalLink,
  TrendingUp,
  DollarSign,
  Users,
  Link2,
  AlertCircle,
  Calendar,
  Layers,
  Circle,
  CreditCard,
  ChevronDown,
  MoveUpRight,
  MoveDownRight,
  Package,
  RefreshCw,
  ChevronRight,
  MessageSquare,
  Zap,
  Target,
  Receipt,
  Tag,
  MailOpen,
  MousePointerClick,
  Info,
  ShoppingBag,
  X,
  MessageCircle,
  Inbox,
  Send,
  Clock,
  Loader2,
  User,
  Coins
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import EmailLoader from "../components/ui/EmailLoader";
import { CenteredPageLoader } from "../components/ui/CenteredPageLoader";


const BLUE = "#3b82f6";
const GREEN = "#10b981";
const RED = "#ef4444";
const PINK = "#ec4899";

const MAIN_COLOR = "#3b82f6"; // Default Blue for Captación
const DASHBOARD_CACHE_VERSION = "v2";
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

type DashboardCachePayload = {
  currentStore?: any;
  prevStore?: any;
  currentMeta?: any;
  prevMeta?: any;
  metaDaily?: any[];
  prevMetaDaily?: any[];
  currentKlaviyo?: any;
  prevKlaviyo?: any;
};

const readDashboardCache = (cacheKey: string): DashboardCachePayload | null => {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Legacy cache objects had no timestamp and could leave Safari with an
    // incomplete dashboard for a full browser session.
    if (!parsed?.timestamp || Date.now() - Number(parsed.timestamp) > DASHBOARD_CACHE_TTL_MS) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }

    return parsed.data || null;
  } catch (e) {
    sessionStorage.removeItem(cacheKey);
    console.error("Error parsing dashboard cache:", e);
    return null;
  }
};

const writeDashboardCacheValue = (cacheKey: string, key: keyof DashboardCachePayload, data: any) => {
  try {
    const existing = readDashboardCache(cacheKey) || {};
    const nextData = { ...existing, [key]: data };
    sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: nextData }));
  } catch {
    // Storage can be unavailable on some Safari modes; data still renders live.
  }
};

const ensureMetaToken = async (): Promise<void> => {
  if (localStorage.getItem("meta_ads_token")) return;
  try {
    const { data } = await supabase
      .from("AgencySettings")
      .select("value")
      .eq("key", "meta_ads_token")
      .maybeSingle();
    if (data?.value) localStorage.setItem("meta_ads_token", data.value);
  } catch (err) {
    console.error("Error cargando token:", err);
  }
};

const isArrayOfObjectsEqual = (a: any[] | undefined | null, b: any[] | undefined | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    const itemB = b[i];
    if (itemA === itemB) continue;
    if (!itemA || !itemB) return false;
    const keysA = Object.keys(itemA);
    for (let j = 0; j < keysA.length; j++) {
      const key = keysA[j];
      if (itemA[key] !== itemB[key]) return false;
    }
  }
  return true;
};

const ShopifyMetricComponent = ({
  label,
  value,
  change,
  trend,
  data,
  color,
  loading,
  active,
  onClick,
  icon: Icon,
  info,
}: any) => {  const [tipPos, setTipPos] = React.useState<{ x: number; y: number } | null>(null);
  const infoRef = React.useRef<HTMLDivElement>(null);
  
  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tipPos) {
      setTipPos(null);
    } else {
      const r = infoRef.current?.getBoundingClientRect();
      if (r) setTipPos({ x: r.left + r.width / 2, y: r.top });
    }
  };

  const showTip = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = infoRef.current?.getBoundingClientRect();
    if (r) setTipPos({ x: r.left + r.width / 2, y: r.top });
  };
  const hideTip = () => setTipPos(null);

  React.useEffect(() => {
    if (!tipPos) return;
    const handleDocumentClick = (e: MouseEvent) => {
      if (infoRef.current?.contains(e.target as Node)) return;
      setTipPos(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [tipPos]);

  const tooltipPos = React.useMemo(() => {
    if (!tipPos) return null;
    const tooltipWidth = typeof window !== 'undefined' && window.innerWidth < 640 ? 224 : 256;
    const halfWidth = tooltipWidth / 2;
    let adjustedLeft = tipPos.x;
    let arrowOffset = 50; // percentage
    
    if (typeof window !== 'undefined') {
      const minLeft = halfWidth + 8;
      const maxLeft = window.innerWidth - halfWidth - 8;
      
      if (tipPos.x < minLeft) {
        adjustedLeft = minLeft;
        const diff = minLeft - tipPos.x;
        arrowOffset = 50 - (diff / tooltipWidth) * 100;
      } else if (tipPos.x > maxLeft) {
        adjustedLeft = maxLeft;
        const diff = tipPos.x - maxLeft;
        arrowOffset = 50 + (diff / tooltipWidth) * 100;
      }
    }
    return {
      left: adjustedLeft,
      arrowOffset,
    };
  }, [tipPos]);

  const isGreen = color === GREEN || color === '#10b981';
  const isPink = color === PINK || color === '#ec4899';
  const isViolet = color === '#8b5cf6';
  const isRed = color === RED || color === '#ef4444' || color === '#rose-500' || color === '#f43f5e';
  
  let activeBgClass = "bg-blue-50/60 dark:bg-blue-500/5";
  let pulseClass = "bg-blue-500";
  if (isGreen) { activeBgClass = "bg-emerald-50/60 dark:bg-emerald-500/5"; pulseClass = "bg-emerald-500"; }
  if (isPink) { activeBgClass = "bg-pink-50/60 dark:bg-pink-500/5"; pulseClass = "bg-pink-500"; }
  if (isViolet) { activeBgClass = "bg-violet-50/60 dark:bg-violet-500/5"; pulseClass = "bg-violet-500"; }
  if (isRed) { activeBgClass = "bg-rose-50/60 dark:bg-rose-500/5"; pulseClass = "bg-rose-500"; }

  const showShimmer = loading;

  return (
    <button
      onClick={onClick}
      className={`flex flex-col flex-1 min-w-0 px-4 py-4 sm:px-6 sm:py-5
        border-b border-zinc-100 dark:border-zinc-800 border-r-0
        sm:border-r sm:[&:nth-child(odd)]:border-r-zinc-100 sm:[&:nth-child(odd)]:border-r sm:dark:[&:nth-child(odd)]:border-r-zinc-800 sm:[&:nth-child(even)]:border-r-0
        lg:border-b-0 lg:border-r lg:border-r-zinc-100 lg:dark:border-r-zinc-800 lg:last:border-r-0
        transition-all text-left group relative overflow-visible
        ${active ? activeBgClass : "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 hover:shadow-[inset_0_0_20px_rgba(0,0,0,0.02)] dark:hover:shadow-none"}`}
    >
      <div className="flex items-center justify-between mb-2 w-full">
        <div className="flex items-center gap-2 min-w-0 relative">
          {Icon && <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />}
          <span className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest truncate">
            {label}
          </span>
          {info && (
            <div ref={infoRef} className="flex-shrink-0" onClick={handleInfoClick} onMouseEnter={showTip} onMouseLeave={hideTip}>
              <Info className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 hover:text-violet-500 dark:hover:text-violet-400 transition-colors cursor-help" />
              {tipPos && tooltipPos && (
                <div
                  className="fixed z-[9999] w-56 sm:w-64 p-3 bg-zinc-900/98 backdrop-blur-xl border border-zinc-700 text-white text-[11px] rounded-2xl shadow-2xl pointer-events-none"
                  style={{ left: tooltipPos.left, top: tipPos.y - 8, transform: 'translateX(-50%) translateY(-100%)' }}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {Icon && <Icon className="w-3 h-3 text-violet-400" />}
                    <span className="font-bold text-violet-400 uppercase tracking-widest text-[9px]">{label}</span>
                  </div>
                  <p className="leading-relaxed font-medium text-zinc-200 normal-case tracking-normal">{info}</p>
                  <div 
                    className="absolute top-full border-4 border-transparent border-t-zinc-900/98" 
                    style={{ left: `${tooltipPos.arrowOffset}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {active && (
          <div className={`w-1.5 h-1.5 rounded-full ${pulseClass} animate-pulse flex-shrink-0`} />
        )}
      </div>
      <div className="flex items-end justify-between gap-2 w-full">
        {showShimmer ? (
          <div className="flex flex-col flex-1">
            <div className="h-6 w-24 rounded-lg shimmer-bg mb-2" />
            <div className="h-4 w-12 rounded-md shimmer-bg" />
          </div>
        ) : (
          <div className="flex flex-col shrink-0">
            <span className="text-[17px] sm:text-[20px] font-bold text-zinc-900 dark:text-white leading-none mb-2">
              {value}
            </span>
            {change !== undefined && (
              <div
                className={`flex items-center gap-1 text-[11px] sm:text-[12px] font-bold ${trend === "up" ? "text-emerald-500" : "text-rose-500"}`}
              >
                {trend === "up" ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingUp className="w-3 h-3 rotate-180" />
                )}
                {Math.abs(change).toFixed(1)}%
              </div>
            )}
          </div>
        )}
        
        {showShimmer ? (
          <div className="h-8 sm:h-10 flex-1 min-w-0 max-w-[250px] ml-2 sm:ml-6 rounded-lg shimmer-bg opacity-40" />
        ) : (
          <div className="h-8 sm:h-10 flex-1 min-w-0 max-w-[250px] ml-2 sm:ml-6 opacity-60 group-hover:opacity-100 transition-opacity">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <Area
                  type="monotone"
                  dataKey="val"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.1}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </button>
  );
};

const ShopifyMetric = React.memo(ShopifyMetricComponent, (prev: any, next: any) => {
  return (
    prev.label === next.label &&
    prev.value === next.value &&
    prev.change === next.change &&
    prev.trend === next.trend &&
    prev.color === next.color &&
    prev.loading === next.loading &&
    prev.active === next.active &&
    prev.info === next.info &&
    isArrayOfObjectsEqual(prev.data, next.data)
  );
});

const formatDuration = (secs: number) => {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

const toUnixDash = (dateStr: string, end = false) =>
  Math.floor(new Date(`${dateStr}T${end ? '23:59:59' : '00:00:00'}Z`).getTime() / 1000);

const MetricDetailChartComponent = ({ label, data = [], prevData = [], color }: any) => {
  const [hoveredLine, setHoveredLine] = useState<"curr" | "prev" | null>(null);

  const merged = (data || []).map((d: any, i: number) => ({
    ...d,
    prevVal: (prevData || [])[i]?.val ?? null,
  }));

  const vals = (data || []).map((d: any) => d.val);
  const nonZero = vals.filter((v: number) => v > 0);
  const avg =
    nonZero.length > 0
      ? nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length
      : 0;

  const prevVals = (prevData || []).map((d: any) => d.val);
  const prevNonZero = prevVals.filter((v: number) => v > 0);
  const prevAvg =
    prevNonZero.length > 0
      ? prevNonZero.reduce((a: number, b: number) => a + b, 0) /
        prevNonZero.length
      : 0;

  const maxVal = Math.max(...data.map((d: any) => d.val), 0);
  const minVal = nonZero.length > 0 ? Math.min(...nonZero) : 0;
  const yMin = minVal > 0 ? Math.max(0, minVal * 0.75) : 0;

  const trend = prevAvg > 0 ? ((avg - prevAvg) / prevAvg) * 100 : 0;
  const chartColor = color || (trend > 5 ? GREEN : trend < -5 ? RED : BLUE);
  const gradientId = `grad-${label.replace(/\s+/g, "-")}`;

  const isPercentLabel = label.toLowerCase().includes("tasa");
  const isMoneyLabel =
    label.toLowerCase().includes("ingreso") ||
    label.toLowerCase().includes("inversión") ||
    label.toLowerCase().includes("retorno");
  const isCostLabel =
    label.toLowerCase().includes("costo") ||
    label.toLowerCase().includes("cpl") ||
    label.toLowerCase().includes("cpc") ||
    label.toLowerCase().includes("cpa");
  const isRoasLabel = label.toLowerCase().includes("roas");
  const isTimeLabel =
    label.toLowerCase().includes("resp") ||
    label.toLowerCase().includes("tiempo") ||
    label.toLowerCase().includes("resolución") ||
    label.toLowerCase().includes("resolucion") ||
    label.toLowerCase().includes("promedio");

  const fmtTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0m";
    if (secs < 60) return `${Math.round(secs)}s`;
    const mins = secs / 60;
    if (mins < 60) return `${Math.round(mins)}m`;
    const hrs = mins / 60;
    if (hrs < 24) {
      const h = Math.floor(hrs);
      const m = Math.round((hrs - h) * 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    const days = Math.floor(hrs / 24);
    const remHrs = Math.round(hrs % 24);
    return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
  };

  const fmtVal = (v: number) => {
    if (v === null || v === undefined || isNaN(v)) return "0";
    if (isTimeLabel) return fmtTime(v);
    if (isPercentLabel) return `${v.toFixed(2)}%`;
    if (isMoneyLabel)
      return `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`;
    if (isCostLabel)
      return `$${v.toFixed(2)}`;
    if (isRoasLabel) return `${v.toFixed(1)}`;
    if (v >= 1000) return (v / 1000).toFixed(1) + "k";
    return v.toFixed(v < 10 ? 2 : 0);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] p-4 sm:p-8 shadow-sm mt-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">
          Evolución de {label}
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: chartColor }}
            />
            <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
              Actual
            </span>
          </div>

          {avg > 0 && (
            <div
              className={`flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${hoveredLine === "curr" ? "scale-110" : hoveredLine === "prev" ? "opacity-30" : ""}`}
              onMouseEnter={() => setHoveredLine("curr")}
              onMouseLeave={() => setHoveredLine(null)}
            >
              <div className="w-3 h-0.5 bg-amber-500 flex-shrink-0" />
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-500">
                Med. Act: {fmtVal(avg)}
              </span>
            </div>
          )}
          {prevAvg > 0 && (
            <div
              className={`flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${hoveredLine === "prev" ? "scale-110" : hoveredLine === "curr" ? "opacity-30" : ""}`}
              onMouseEnter={() => setHoveredLine("prev")}
              onMouseLeave={() => setHoveredLine(null)}
            >
              <div className="w-3 h-0.5 bg-slate-400 flex-shrink-0" />
              <span className="text-[11px] font-bold text-slate-500">
                Med. Ant: {fmtVal(prevAvg)}
              </span>
            </div>
          )}
          {maxVal > 0 && (
            <div className="flex items-center gap-1.5 whitespace-nowrap pl-2 border-l border-zinc-100 dark:border-zinc-800">
              <span className="text-[11px] font-semibold text-zinc-400">Máx:</span>
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                {fmtVal(maxVal)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={merged}
            margin={{ left: -30, right: 8, top: 12, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.15} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="currentColor"
              className="text-zinc-100 dark:text-zinc-800"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => d.split("-").slice(1).reverse().join("/")}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[yMin, maxVal > 0 ? maxVal * 1.1 : "auto"]}
              ticks={
                maxVal > 0
                  ? Array.from(
                      new Set([
                        Math.round(avg),
                        Math.round(prevAvg),
                        Math.round(maxVal),
                      ]),
                    )
                      .filter((v) => v > 0)
                      .sort((a, b) => a - b)
                  : undefined
              }
              tickFormatter={(v) => fmtVal(v)}
              tick={{ fontSize: 9, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={35}
            />
            <Tooltip
              content={({ active, payload }: any) => {
                if (active && payload && payload.length) {
                  const curr = payload.find((p: any) => p.dataKey === "val");
                  const isMoney =
                    label.toLowerCase().includes("ingreso") ||
                    label.toLowerCase().includes("inversión") ||
                    label.toLowerCase().includes("retorno");
                  const isCost =
                    label.toLowerCase().includes("costo") ||
                    label.toLowerCase().includes("cpl") ||
                    label.toLowerCase().includes("cpc") ||
                    label.toLowerCase().includes("cpa");
                  const isPercentage = label.toLowerCase().includes("tasa");
                  const isRoas = label.toLowerCase().includes("roas");
                  const isTime =
                    label.toLowerCase().includes("resp") ||
                    label.toLowerCase().includes("tiempo") ||
                    label.toLowerCase().includes("resolución") ||
                    label.toLowerCase().includes("resolucion") ||
                    label.toLowerCase().includes("promedio");
                  const fmtTooltip = (v: number) => {
                    if (typeof v !== "number") return String(v ?? "—");
                    if (isTime) return fmtTime(v);
                    if (isMoney)
                      return `$ ${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
                    if (isCost)
                      return `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    if (isPercentage) return `${v.toFixed(2)}%`;
                    if (isRoas) return `${v.toFixed(1)}`;
                    return v.toLocaleString("es-AR", {
                      maximumFractionDigits: 2,
                    });
                  };
                  return (
                    <div className="glass-premium dark:bg-zinc-950/80 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-black/[0.06] dark:border-white/[0.06] min-w-[150px] animate-in fade-in duration-200">
                      <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2.5">
                        {curr?.payload?.date}
                      </p>
                      {curr && (
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: chartColor }}
                            />
                            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                              Valor
                            </span>
                          </div>
                          <span className="text-[12px] font-black text-zinc-900 dark:text-white">
                            {fmtTooltip(curr.value)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Average current - AMBER */}
            {avg > 0 && (
              <ReferenceLine
                y={avg}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeOpacity={
                  hoveredLine === "curr"
                    ? 1
                    : hoveredLine === "prev"
                      ? 0.1
                      : 0.8
                }
                strokeWidth={hoveredLine === "curr" ? 4 : 2}
                className="transition-all duration-300"
              />
            )}

            {/* Average previous - SLATE */}
            {prevAvg > 0 && (
              <ReferenceLine
                y={prevAvg}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeOpacity={
                  hoveredLine === "prev"
                    ? 1
                    : hoveredLine === "curr"
                      ? 0.1
                      : 0.6
                }
                strokeWidth={hoveredLine === "prev" ? 4 : 2}
                className="transition-all duration-300"
              />
            )}

            {maxVal > 0 && (
              <ReferenceLine
                y={maxVal}
                stroke="#6366f1"
                strokeOpacity={hoveredLine ? 0.2 : 0.5}
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: `MÁX: ${fmtVal(maxVal)}`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fontWeight: "900",
                  fill: "#6366f1",
                  opacity: hoveredLine ? 0.2 : 1,
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="val"
              stroke={chartColor}
              strokeWidth={hoveredLine ? 1 : 3}
              strokeOpacity={hoveredLine ? 0.1 : 1}
              fillOpacity={0}
              fill="none"
              dot={(p: any) =>
                p.value > 0 ? (
                  <circle
                    key={`dot-${p.index}-${p.cx}`}
                    cx={p.cx}
                    cy={p.cy}
                    r={4}
                    fill={chartColor}
                    stroke="#fff"
                    strokeWidth={2}
                    fillOpacity={hoveredLine ? 0.1 : 1}
                    strokeOpacity={hoveredLine ? 0.1 : 1}
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

const MetricDetailChart = React.memo(MetricDetailChartComponent, (prev: any, next: any) => {
  return (
    prev.label === next.label &&
    prev.color === next.color &&
    isArrayOfObjectsEqual(prev.data, next.data) &&
    isArrayOfObjectsEqual(prev.prevData, next.prevData)
  );
});

const HistoricalRevenueChartComponent = ({ data, color }: any) => {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -30, right: 0, top: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRev90" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.1} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#71717a" }}
            minTickGap={30}
            tickFormatter={(val) => {
              const d = new Date(val);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#71717a" }}
            tickFormatter={(val) => `$${val >= 1000 ? (val / 1000).toFixed(0) + "k" : val}`}
            width={35}
          />
          <Tooltip
            content={({ active, payload }: any) => {
              if (active && payload && payload.length) {
                const item = payload[0];
                return (
                  <div className="glass-premium dark:bg-zinc-950/80 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-black/[0.06] dark:border-white/[0.06] min-w-[150px] animate-in fade-in duration-200">
                    <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2.5">
                      {item.payload.date ? new Date(item.payload.date).toLocaleDateString("es-AR") : ""}
                    </p>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                          Ingresos
                        </span>
                      </div>
                      <span className="text-[12px] font-black text-zinc-900 dark:text-white">
                        $ {Number(item.value).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area type="monotone" dataKey="revenue" stroke={color} strokeWidth={2} fillOpacity={1} fill="url(#colorRev90)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const HistoricalRevenueChart = React.memo(HistoricalRevenueChartComponent, (prev: any, next: any) => {
  return prev.color === next.color && isArrayOfObjectsEqual(prev.data, next.data);
});

const MiniCal = ({
  year,
  month,
  since,
  until,
  hovering,
  onDay,
  onHover,
  onPrev,
  onNext,
}: any) => {
  const touchStart = React.useRef<number>(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (diff > 40 && onNext) onNext();
    if (diff < -40 && onPrev) onPrev();
  };

  const days: any[] = [];
  const first = new Date(year, month, 1).getDay();
  const startOffset = first === 0 ? 6 : first - 1;
  for (let i = 0; i < startOffset; i++) days.push(null);
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= lastDay; i++) {
    const d = new Date(year, month, i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const MONTHS_ES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const todayStr = today();

  const prevDate = React.useRef(new Date(year, month, 1).getTime());
  const current = new Date(year, month, 1).getTime();
  let animClass = 'animate-in fade-in zoom-in-95 duration-200';
  if (current > prevDate.current) {
     animClass = 'animate-in fade-in slide-in-from-right-16 duration-300';
  } else if (current < prevDate.current) {
     animClass = 'animate-in fade-in slide-in-from-left-16 duration-300';
  }
  
  React.useEffect(() => {
    prevDate.current = current;
  }, [current]);

  return (
    <div className="w-[240px] overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center mb-4 px-1">
        <div className="w-8 flex justify-start">
          {onPrev && (
            <button
              onClick={onPrev}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group"
            >
              <ChevronDown className="w-4 h-4 rotate-90 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" />
            </button>
          )}
        </div>
        <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">
          {MONTHS_ES[month]} {year}
        </span>
        <div className="w-8 flex justify-end">
          {onNext && (
            <button
              onClick={onNext}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group"
            >
              <ChevronDown className="w-4 h-4 -rotate-90 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" />
            </button>
          )}
        </div>
      </div>
      <div key={`${year}-${month}`} className={`grid grid-cols-7 gap-y-1 ${animClass}`}>
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <div
            key={i}
            className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase tracking-tighter"
          >
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />;
          const isToday = d === todayStr;
          const isFuture = d > todayStr;
          const isSelected = d === since || d === until;
          const isInRange = since && until && d > since && d < until;
          const isHovering =
            since &&
            !until &&
            hovering &&
            ((d > since && d <= hovering) || (d < since && d >= hovering));

          return (
            <button
              key={d}
              onMouseEnter={() => !isFuture && onHover(d)}
              onClick={() => !isFuture && onDay(d)}
              disabled={isFuture}
              className={`h-8 w-8 text-[11px] font-bold transition-all relative flex items-center justify-center
                ${
                  isSelected
                    ? "bg-blue-600 text-white rounded-full z-10 shadow-md shadow-blue-200 dark:shadow-none"
                    : isInRange || isHovering
                      ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600"
                      : isFuture
                        ? "text-zinc-200 dark:text-zinc-800 cursor-default"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                }
                ${isToday && !isSelected ? "text-blue-600 dark:text-blue-500 ring-1 ring-blue-100 dark:ring-blue-900/30" : ""}
              `}
            >
              {d.split("-")[2]}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const MetaLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M16.92 7.76c-1.34 0-2.6.58-3.48 1.62-.88-1.04-2.14-1.62-3.48-1.62-2.58 0-4.66 2.08-4.66 4.66s2.08 4.66 4.66 4.66c1.34 0 2.6-.58 3.48-1.62.88 1.04 2.14 1.62 3.48 1.62 2.58 0 4.66-2.08 4.66-4.66s-2.08-4.66-4.66-4.66zm0 7.32c-1.46 0-2.65-1.19-2.65-2.65s1.19-2.65 2.65-2.65 2.65 1.19 2.65 2.65-1.19 2.65-2.65 2.65zm-7.04 0C8.42 15.08 7.23 13.89 7.23 12.43s1.19-2.65 2.65-2.65 2.65 1.19 2.65 2.65-1.19 2.65-2.65 2.65z" />
  </svg>
);

const KlaviyoLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M5.04 3h3.6v18h-3.6zM10.8 11.28h3.6V21h-3.6zM16.56 3h3.6v8.28h-3.6zM10.8 3h3.6v6.12h-3.6z" />
  </svg>
);

const ShopifyLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M18.7 6.1L12.3.4C12.1.2 11.9.2 11.7.4L5.3 6.1c-.2.2-.3.4-.2.7l2.1 14.8c0 .2.2.4.4.4h8.8c.2 0 .4-.2.4-.4l2.1-14.8c0-.3-.1-.5-.2-.7zM12 2.6l4.2 3.8H7.8L12 2.6z" />
  </svg>
);

const TiendanubeLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M19.36 10.04a6 6 0 0 0-11.32-1.58 4.5 4.5 0 0 0-2.54 8.24h14.16a4.5 4.5 0 0 0-.3-6.66z" />
  </svg>
);

const WordpressLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.11 17.65c-2.48 0-4.63-1.28-5.86-3.21l3.35-9.15.02.01c.78 2.36 1.34 4.09 1.68 5.16.51 1.61.98 2.65 1.41 3.59l-.6 3.6zm1.19-.07l.86-3.29c.35-1.12.65-2.28 1-3.6.46-1.57.85-2.61 1.18-3.6l.08.31c.4 1.49.7 2.63 1 3.79l-4.12 6.39zm-9.08-3.79C3.12 14.54 2.5 13.34 2.5 12c0-2.4 1-4.57 2.6-6.14l4.24 11.66-5.12-1.73zm8.38-11.89c.35 0 .66.21.66.56 0 .3-.17.52-.39.78-.34.39-.73.86-.73 1.61 0 .6.3 1.07.6 1.63.34.6.73 1.25.73 2.15 0 .82-.3 1.46-.6 2.06l-3.24-9.35a7.35 7.35 0 0 1 5.98.56zm4.84.44a7.43 7.43 0 0 1 1.78 4.7c0 1.94-.75 3.7-1.98 5.02l-4.22-12.16c2.02.51 3.52 1.43 4.42 2.44z" />
  </svg>
);

export default function DashboardPage() {
  const { profile: authProfile } = useAuth();
  const { darkMode } = useTheme();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const detectedPlatform = useMemo(() => {
    let platform = (profile as any)?.ecommerce_platform;
    if (profile && !platform) {
      if ((profile as any).shopify_domain && (profile as any).shopify_access_token) {
        platform = 'shopify';
      } else if ((profile as any).wordpress_url && (profile as any).woo_consumer_key && (profile as any).woo_consumer_secret) {
        platform = 'wordpress';
      } else if ((profile as any).tiendanube_store_id && (profile as any).tiendanube_access_token) {
        platform = 'tiendanube';
      }
    }
    return platform || null;
  }, [profile]);

  const savePlatformErrorToDB = async (platformKey: string, errorMessage: string) => {
    if (!profile?.id) return;
    try {
      const { data: clientRow } = await supabase
        .from('car_clients')
        .select('connection_statuses')
        .eq('id', profile.id)
        .single();
      
      const currentStatuses = clientRow?.connection_statuses || {};
      const updatedStatuses = { 
        ...currentStatuses, 
        [platformKey]: `error: ${errorMessage}` 
      };
      
      await supabase
        .from('car_clients')
        .update({ connection_statuses: updatedStatuses })
        .eq('id', profile.id);
    } catch (err) {
      console.error(`Error saving platform error for ${platformKey} to DB:`, err);
    }
  };

  const [links, setLinks] = useState<any[]>([]);
  const [metaDaily, setMetaDaily] = useState<any[]>([]);
  const [prevMetaDaily, setPrevMetaDaily] = useState<any[]>([]);
  const [activePreset, setActivePreset] = useState<DatePreset | "custom">(
    "last_14d",
  );
  const [activeSince, setActiveSince] = useState(
    presetToRange("last_14d").since,
  );
  const [activeUntil, setActiveUntil] = useState(
    presetToRange("last_14d").until,
  );
  const [pendingPreset, setPendingPreset] = useState<DatePreset | "custom">(
    "last_14d",
  );
  const [pendingSince, setPendingSince] = useState(
    presetToRange("last_14d").since,
  );
  const [pendingUntil, setPendingUntil] = useState(
    presetToRange("last_14d").until,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hovering, setHovering] = useState("");
  const nowD = new Date();
  const [calYear, setCalYear] = useState(nowD.getFullYear());
  const [calMonth, setCalMonth] = useState(nowD.getMonth());
  const [currentMeta, setCurrentMeta] = useState<any>(null);
  const [prevMeta, setPrevMeta] = useState<any>(null);
  const [fetchingMeta, setFetchingMeta] = useState(true);
  const [currentKlaviyo, setCurrentKlaviyo] = useState<any>(null);
  const [prevKlaviyo, setPrevKlaviyo] = useState<any>(null);
  const [fetchingKlaviyo, setFetchingKlaviyo] = useState(true);
  const [chatwootSummary, setChatwootSummary] = useState<any>(null);
  const [prevChatwootSummary, setPrevChatwootSummary] = useState<any>(null);
  const [fetchingChatwoot, setFetchingChatwoot] = useState(false);
  const [activeAtencMetric, setActiveAtencMetric] = useState<string | null>(null);
  const [atencChartData, setAtencChartData] = useState<any[]>([]);
  const [atencPrevChartData, setAtencPrevChartData] = useState<any[]>([]);
  const [loadingAtencChart, setLoadingAtencChart] = useState(false);
  const [atencSeriesAll, setAtencSeriesAll] = useState<Record<string, any[]>>({});
  const [atencPrevSeriesAll, setAtencPrevSeriesAll] = useState<Record<string, any[]>>({});
  const [currentStore, setCurrentStore] = useState<any>(null);
  const [prevStore, setPrevStore] = useState<any>(null);
  const [costSummary, setCostSummary] = useState({ current: 0, previous: 0 });
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [fetchingStore, setFetchingStore] = useState(true);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [klaviyoError, setKlaviyoError] = useState<string | null>(null);
  const [historical90d, setHistorical90d] = useState<any[]>([]);
  const [fetching90d, setFetching90d] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const isDateReloading = !loadingInitial && (fetchingStore || fetchingMeta || fetchingKlaviyo || fetchingChatwoot);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const clientPickerRef = useRef<HTMLDivElement>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [allClients, setAllClients] = useState<any[]>([]);
  const { setViewAsProfile } = useViewAs();
  const [selectedMetaGoal, setSelectedMetaGoal] = useState<'purchases' | 'leads' | 'messages'>('purchases');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [fulfillingOrder, setFulfillingOrder] = useState(false);
  const chatwootStatus = (profile as any)?.connection_statuses?.chatwoot;
  const hasChatwoot = !!(
    (profile as any)?.chatwoot_url &&
    (profile as any)?.chatwoot_token &&
    (chatwootStatus === 'ok' || chatwootStatus === 'connected')
  );

  const toggleFulfillment = async () => {
    if (!selectedOrder || fulfillingOrder) return;
    const prof: any = profile;
    if (!prof?.shopify_domain || !prof?.shopify_access_token) return;
    const domain = prof.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const token = prof.shopify_access_token;
    const isFulfilled = selectedOrder.fulfillment_status === 'fulfilled';
    setFulfillingOrder(true);
    try {
      if (!isFulfilled) {
        // Get fulfillment order ID first (proxied through /api/shopify)
        const shopifyHeaders = { 'X-Shopify-Access-Token': token, 'X-Shop-Domain': domain, 'Content-Type': 'application/json' };
        const foRes = await fetch(`/api/shopify/orders/${selectedOrder.id}/fulfillment_orders.json`, { headers: shopifyHeaders });
        const foData = await foRes.json();
        const fulfillmentOrderId = foData.fulfillment_orders?.[0]?.id;
        if (!fulfillmentOrderId) throw new Error('No fulfillment order found');
        await fetch(`/api/shopify/fulfillments.json`, {
          method: 'POST',
          headers: shopifyHeaders,
          body: JSON.stringify({ fulfillment: { line_items_by_fulfillment_order: [{ fulfillment_order_id: fulfillmentOrderId }], notify_customer: false } }),
        });
        setSelectedOrder((prev: any) => ({ ...prev, fulfillment_status: 'fulfilled' }));
      } else {
        // Cancel all fulfillments
        const shopifyHeaders = { 'X-Shopify-Access-Token': token, 'X-Shop-Domain': domain, 'Content-Type': 'application/json' };
        const fRes = await fetch(`/api/shopify/orders/${selectedOrder.id}/fulfillments.json`, { headers: shopifyHeaders });
        const fData = await fRes.json();
        for (const f of fData.fulfillments || []) {
          await fetch(`/api/shopify/fulfillments/${f.id}/cancel.json`, {
            method: 'POST',
            headers: shopifyHeaders,
          });
        }
        setSelectedOrder((prev: any) => ({ ...prev, fulfillment_status: null }));
      }
    } catch (e) {
      console.error('Fulfillment error:', e);
      alert('Error al cambiar estado de envío');
    } finally {
      setFulfillingOrder(false);
    }
  };

  const hasTag = (tag: string) => {
    const tags = (profile as any)?.client_tags;
    if (!tags || tags.length === 0) return tag === 'tienda_online';
    return tags.includes(tag);
  };
  const isEcommerce = !!detectedPlatform || hasTag('tienda_online');

  useEffect(() => {
    const primaryTag = profile?.client_tags?.[0];
    if (primaryTag === 'whatsapp') setSelectedMetaGoal('messages');
    else if (primaryTag === 'lead_gen') setSelectedMetaGoal('leads');
    else setSelectedMetaGoal('purchases'); // default to purchases for e-com or if empty
  }, [profile?.client_tags]);

  // Load all clients if admin
  useEffect(() => {
    if (authProfile?.is_admin) {
      supabase
        .from("car_clients")
        .select("*")
        .order("business_name")
        .then(({ data }) => {
          if (data) setAllClients(data.filter((c) => !c.is_admin));
        });
    }
  }, [authProfile?.is_admin]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node))
        setShowDatePicker(false);
      if (clientPickerRef.current && !clientPickerRef.current.contains(event.target as Node))
        setShowClientPicker(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Stale-While-Revalidate Caching for Dashboard metrics
  useEffect(() => {
    if (!profile?.id) return;
    const cacheKey = `dashboard_cache_${DASHBOARD_CACHE_VERSION}_${profile.id}_${activePreset}_${activeSince}_${activeUntil}`;
    const cachedData = readDashboardCache(cacheKey);
    if (!cachedData) return;
    if (cachedData.currentStore) setCurrentStore(cachedData.currentStore);
    if (cachedData.prevStore) setPrevStore(cachedData.prevStore);
    if (cachedData.currentMeta) setCurrentMeta(cachedData.currentMeta);
    if (cachedData.prevMeta) setPrevMeta(cachedData.prevMeta);
    if (cachedData.metaDaily) setMetaDaily(cachedData.metaDaily);
    if (cachedData.prevMetaDaily) setPrevMetaDaily(cachedData.prevMetaDaily);
    if (cachedData.currentKlaviyo) setCurrentKlaviyo(cachedData.currentKlaviyo);
    if (cachedData.prevKlaviyo) setPrevKlaviyo(cachedData.prevKlaviyo);
  }, [profile?.id, activePreset, activeSince, activeUntil]);

  // Reset all data states when client profile changes to prevent stale data leakage
  useEffect(() => {
    setCurrentStore(null);
    setPrevStore(null);
    setCostSummary({ current: 0, previous: 0 });
    setProductImages({});
    setCurrentMeta(null);
    setPrevMeta(null);
    setMetaDaily([]);
    setPrevMetaDaily([]);
    setCurrentKlaviyo(null);
    setPrevKlaviyo(null);
    setChatwootSummary(null);
    setPrevChatwootSummary(null);
    setAtencSeriesAll({});
    setAtencPrevSeriesAll({});
    setAtencChartData([]);
    setAtencPrevChartData([]);
    setLinks([]);
    setHistorical90d([]);
  }, [profile?.id]);

  // Pre-load error states from profile connection_statuses when they change
  useEffect(() => {
    const statuses = profile?.connection_statuses || {};
    const prof: any = profile;
    const hasStoreConfig = detectedPlatform && (
      (detectedPlatform === 'shopify' && prof?.shopify_domain && prof?.shopify_access_token) ||
      (detectedPlatform === 'wordpress' && prof?.wordpress_url && prof?.woo_consumer_key && prof?.woo_consumer_secret) ||
      (detectedPlatform === 'tiendanube' && prof?.tiendanube_store_id && prof?.tiendanube_access_token)
    );
    
    // Shopify Error
    const shopifyVal = statuses.shopify;
    if (!hasStoreConfig && typeof shopifyVal === 'string' && shopifyVal.startsWith('error')) {
      setShopifyError(shopifyVal.replace(/^error:\s*/, '') || 'Error de conexión');
    } else {
      setShopifyError(null);
    }

    // Meta Error
    const metaVal = statuses.meta;
    if (typeof metaVal === 'string' && metaVal.startsWith('error')) {
      setMetaError(metaVal.replace(/^error:\s*/, '') || 'Error de conexión');
    } else {
      setMetaError(null);
    }

    // Klaviyo Error
    const klaviyoVal = statuses.klaviyo;
    if (typeof klaviyoVal === 'string' && klaviyoVal.startsWith('error')) {
      setKlaviyoError(klaviyoVal.replace(/^error:\s*/, '') || 'Error de conexión');
    } else {
      setKlaviyoError(null);
    }
  }, [profile?.connection_statuses, detectedPlatform, profile]);

  useEffect(() => {
    if (detectedPlatform === 'shopify' && (profile as any)?.shopify_domain && (profile as any)?.shopify_access_token) {
      ecommerce.getProducts((profile as any).shopify_domain, (profile as any).shopify_access_token)
        .then(prods => {
          const map: Record<string, string> = {};
          for (const p of prods) {
            const src = typeof p.image === 'string' ? p.image : p.image?.src;
            if (src) map[String(p.id)] = src;
          }
          setProductImages(map);
        })
        .catch(e => console.error("Error loading products for images:", e));
    } else if (detectedPlatform === 'wordpress') {
      setProductImages({});
    } else if (detectedPlatform === 'tiendanube' && (profile as any)?.tiendanube_store_id && (profile as any)?.tiendanube_access_token) {
      ecommerce.getTiendaNubeProducts((profile as any).tiendanube_store_id, (profile as any).tiendanube_access_token)
        .then(prods => {
          const map: Record<string, string> = {};
          for (const p of prods) {
            const src = typeof p.image === 'string' ? p.image : p.image?.src;
            if (src) map[String(p.id)] = src;
          }
          setProductImages(map);
        })
        .catch(e => console.error("Error loading Tiendanube products for images:", e));
    }
  }, [profile?.id, detectedPlatform]);

  // Global keydown listeners for Escape
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDatePicker(false);
        setShowClientPicker(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const fetchData = async (p: DatePreset | "custom", s: string, u: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const myFetchId = ++fetchIdRef.current;

    const updateCache = (key: string, data: any) => {
      if (!profile?.id) return;
      const cacheKey = `dashboard_cache_${DASHBOARD_CACHE_VERSION}_${profile.id}_${p}_${s}_${u}`;
      writeDashboardCacheValue(cacheKey, key as keyof DashboardCachePayload, data);
    };

    const statuses = profile?.connection_statuses || {};
    const dbMetaError = typeof statuses.meta === 'string' && statuses.meta.startsWith('error');
    const dbKlaviyoError = typeof statuses.klaviyo === 'string' && statuses.klaviyo.startsWith('error');

    setShopifyError(null);
    if (!dbMetaError) setMetaError(null);
    if (!dbKlaviyoError) setKlaviyoError(null);

    try {
      const range = p === "custom" ? { since: s, until: u } : presetToRange(p);
      const prevRange = getPrevPeriod(range.since, range.until);

      const prof: any = profile;
      const fetchShopify = async () => {
        const hasStoreConfig = detectedPlatform && (
          (detectedPlatform === 'shopify' && prof.shopify_domain && prof.shopify_access_token) ||
          (detectedPlatform === 'wordpress' && prof.wordpress_url && prof.woo_consumer_key && prof.woo_consumer_secret) ||
          (detectedPlatform === 'tiendanube' && prof.tiendanube_store_id && prof.tiendanube_access_token)
        );
        if (!hasStoreConfig) {
          setFetchingStore(false);
          return;
        }
        setFetchingStore(true);
        setShopifyError(null);
        try {
          const [currStore, prevStoreData] = await Promise.all([
            ecommerce.getDashboardData(
              detectedPlatform!,
              prof.shopify_domain,
              prof.shopify_access_token,
              range.since,
              range.until,
              prof.id,
            ),
            ecommerce.getDashboardData(
              detectedPlatform!,
              prof.shopify_domain,
              prof.shopify_access_token,
              prevRange.since,
              prevRange.until,
              prof.id,
            ),
          ]);
          if (!currStore || !prevStoreData) {
            throw new Error("No se obtuvieron datos de Shopify. Verifique el dominio y token.");
          }
          if (myFetchId !== fetchIdRef.current) return;
          setCurrentStore(currStore);
          setPrevStore(prevStoreData);
          updateCache('currentStore', currStore);
          updateCache('prevStore', prevStoreData);
        } catch (err: any) {
          console.error("Store Fetch Error:", err);
          if (myFetchId === fetchIdRef.current) {
            const errMsg = err?.message || "Error al conectar con Shopify";
            setShopifyError(errMsg);
            savePlatformErrorToDB("shopify", errMsg);
          }
        } finally {
          if (myFetchId === fetchIdRef.current) setFetchingStore(false);
        }
      };

      const fetchMeta = async () => {
        const isMetaInError = typeof statuses.meta === 'string' && statuses.meta.startsWith('error');
        if (!profile?.meta_account_id || isMetaInError) {
          setFetchingMeta(false);
          return;
        }
        setFetchingMeta(true);
        setMetaError(null);
        try {
          await ensureMetaToken();
          const [rawDaily, rawPrevDaily] = await Promise.all([
            metaAds.getInsightsDaily(
              profile.meta_account_id,
              DAILY_FIELDS,
              p === "custom" ? undefined : p,
              p === "custom" ? range : undefined,
              controller.signal,
            ),
            metaAds.getInsightsDaily(
              profile.meta_account_id,
              DAILY_FIELDS,
              undefined,
              prevRange,
              controller.signal,
            ),
          ]);

          if (!rawDaily || !rawPrevDaily) {
            throw new Error("No se obtuvieron insights de Meta Ads. Verifique el ID de cuenta.");
          }

          const extractActions = (actions: any[], type: 'purchases' | 'leads' | 'messages') => {
            if (!actions || !Array.isArray(actions)) return 0;
            if (type === 'messages') {
              const msg = actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d' || a.action_type === 'onsite_conversion.messaging_first_reply');
              if (msg) return parseFloat(msg.value || 0);
            }
            if (type === 'leads') {
              const lead = actions.find((a: any) => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead' || a.action_type === 'onsite_conversion.lead_grouped');
              if (lead) return parseFloat(lead.value || 0);
            }
            if (type === 'purchases') {
              const purchase = actions.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'omni_purchase');
              if (purchase) return parseFloat(purchase.value || 0);
            }
            return 0;
          };

          const sumInsights = (data: any[]) => {
            return data.reduce(
              (acc, d) => ({
                spend: acc.spend + (d.spend || 0),
                reach: acc.reach + (d.reach || 0),
                purchases: acc.purchases + extractActions(d.actions, 'purchases'),
                leads: acc.leads + extractActions(d.actions, 'leads'),
                messages: acc.messages + extractActions(d.actions, 'messages'),
                purchase_value: acc.purchase_value + (d.purchase_value || 0),
                roas: acc.roas + (d.roas || 0),
              }),
              { spend: 0, reach: 0, purchases: 0, leads: 0, messages: 0, purchase_value: 0, roas: 0 },
            );
          };

          const currSummary = sumInsights(rawDaily);
          if (rawDaily.length > 0) {
            currSummary.roas = currSummary.spend ? currSummary.purchase_value / currSummary.spend : 0;
          }
          const prevSummary = sumInsights(rawPrevDaily);
          if (rawPrevDaily.length > 0) {
            prevSummary.roas = prevSummary.spend ? prevSummary.purchase_value / prevSummary.spend : 0;
          }

          const padded = [];
          let d = new Date(range.since + "T12:00:00");
          const end = new Date(range.until + "T12:00:00");
          let safetyLimit = 0;
          while (d <= end && safetyLimit++ < 400) {
            const iso = d.toISOString().split("T")[0];
            const match = rawDaily.find((rd: any) => rd.date === iso);
            padded.push(
              match ? {
                ...match,
                purchases: extractActions(match.actions, 'purchases'),
                leads: extractActions(match.actions, 'leads'),
                messages: extractActions(match.actions, 'messages')
              } : {
                date: iso, spend: 0, purchases: 0, leads: 0, messages: 0, purchase_value: 0, roas: 0, reach: 0,
              },
            );
            d.setDate(d.getDate() + 1);
          }
          const paddedPrev = [];
          let dp = new Date(prevRange.since + "T12:00:00");
          const endP = new Date(prevRange.until + "T12:00:00");
          let safetyLimitP = 0;
          while (dp <= endP && safetyLimitP++ < 400) {
            const iso = dp.toISOString().split("T")[0];
            const match = rawPrevDaily.find((rd: any) => rd.date === iso);
            paddedPrev.push(
              match ? {
                ...match,
                purchases: extractActions(match.actions, 'purchases'),
                leads: extractActions(match.actions, 'leads'),
                messages: extractActions(match.actions, 'messages')
              } : {
                date: iso, spend: 0, purchases: 0, leads: 0, messages: 0, purchase_value: 0, roas: 0, reach: 0,
              },
            );
            dp.setDate(dp.getDate() + 1);
          }

          if (myFetchId !== fetchIdRef.current) return;
          setCurrentMeta(currSummary);
          setPrevMeta(prevSummary);
          setMetaDaily(padded);
          setPrevMetaDaily(paddedPrev);
          updateCache('currentMeta', currSummary);
          updateCache('prevMeta', prevSummary);
          updateCache('metaDaily', padded);
          updateCache('prevMetaDaily', paddedPrev);
        } catch (err: any) {
          if (err.name !== "AbortError") {
            console.error("Meta Fetch Error:", err);
            if (myFetchId === fetchIdRef.current) {
              const errMsg = err?.message || "Error al conectar con Meta Ads";
              setMetaError(errMsg);
              savePlatformErrorToDB("meta", errMsg);
            }
          }
        } finally {
          if (myFetchId === fetchIdRef.current) setFetchingMeta(false);
        }
      };

      const fetchKlaviyo = async () => {
        const isKlaviyoInError = typeof statuses.klaviyo === 'string' && statuses.klaviyo.startsWith('error');
        if (!profile?.klaviyo_api_key || isKlaviyoInError) {
          setFetchingKlaviyo(false);
          return;
        }
        setFetchingKlaviyo(true);
        setKlaviyoError(null);
        try {
          const [curr, prev] = await Promise.all([
            klaviyo.getDashboardData(
              profile.klaviyo_api_key,
              range.since,
              range.until,
            ),
            klaviyo.getDashboardData(
              profile.klaviyo_api_key,
              prevRange.since,
              prevRange.until,
            ),
          ]);
          if (!curr || !prev) {
            throw new Error("No se obtuvieron datos de Klaviyo. Verifique la API Key.");
          }
          if (myFetchId !== fetchIdRef.current) return;
          setCurrentKlaviyo(curr);
          setPrevKlaviyo(prev);
          updateCache('currentKlaviyo', curr);
          updateCache('prevKlaviyo', prev);
        } catch (err: any) {
          console.error("Klaviyo Fetch Error:", err);
          if (myFetchId === fetchIdRef.current) {
            const errMsg = err?.message || "Error al conectar con Klaviyo";
            setKlaviyoError(errMsg);
            savePlatformErrorToDB("klaviyo", errMsg);
          }
        } finally {
          if (myFetchId === fetchIdRef.current) setFetchingKlaviyo(false);
        }
      };

      // Ejecutar todas las peticiones en paralelo para máxima velocidad.
      await Promise.all([fetchShopify(), fetchMeta(), fetchKlaviyo()]);
    } catch (globalErr: any) {
      if (globalErr.name !== "AbortError")
        console.error("Global Fetch Error:", globalErr);
    }
  };

  useEffect(() => {
    if (!profile) return;
    const timer = setTimeout(() => {
      fetchData(activePreset, activeSince, activeUntil);
      const loadLinks = async () => {
        const data = await db.links.getByClientId(profile.id);
        if (data) setLinks(data as any);
      };
      loadLinks();
      setLoadingInitial(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [profile?.id, activePreset, activeSince, activeUntil, refreshKey]);

  useEffect(() => {
    let mounted = true;
    const calcCostForRange = (items: any[], since: string, until: string) => {
      const start = new Date(`${since}T00:00:00-03:00`);
      const end = new Date(`${until}T23:59:59-03:00`);
      return items.reduce((sum, item) => {
        const itemStart = new Date(`${item.start_date}T00:00:00-03:00`);
        const itemEnd = new Date(`${item.end_date}T23:59:59-03:00`);
        const overlapStart = new Date(Math.max(start.getTime(), itemStart.getTime()));
        const overlapEnd = new Date(Math.min(end.getTime(), itemEnd.getTime()));
        if (overlapEnd < overlapStart) return sum;
        const overlapDays = Math.max(1, Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1);
        const totalDays = Math.max(1, Math.floor((itemEnd.getTime() - itemStart.getTime()) / 86400000) + 1);
        const daily = Number(item.daily_cost || 0) || (Number(item.cost || 0) / totalDays);
        return sum + daily * overlapDays;
      }, 0);
    };

    const loadCostSummary = async () => {
      if (!profile?.id) {
        setCostSummary({ current: 0, previous: 0 });
        return;
      }
      const range = activePreset === "custom" ? { since: activeSince, until: activeUntil } : presetToRange(activePreset);
      const prevRange = getPrevPeriod(range.since, range.until);
      const { data, error } = await supabase
        .from('car_additional_costs')
        .select('start_date,end_date,cost,daily_cost')
        .eq('client_id', profile.id);
      if (error) {
        console.error('Dashboard cost summary error:', error);
        if (mounted) setCostSummary({ current: 0, previous: 0 });
        return;
      }
      if (mounted) {
        const items = data || [];
        setCostSummary({
          current: calcCostForRange(items, range.since, range.until),
          previous: calcCostForRange(items, prevRange.since, prevRange.until)
        });
      }
    };

    loadCostSummary();
    return () => { mounted = false; };
  }, [profile?.id, activePreset, activeSince, activeUntil, refreshKey]);

  useEffect(() => {
    let mounted = true;
    const fetch90d = async () => {
      const prof: any = profile;
      if (detectedPlatform === 'wordpress') {
        if (mounted) setFetching90d(false);
        return;
      }
      const hasStoreConfig = detectedPlatform && (
        (detectedPlatform === 'shopify' && prof.shopify_domain && prof.shopify_access_token) ||
        (detectedPlatform === 'wordpress' && prof.wordpress_url && prof.woo_consumer_key && prof.woo_consumer_secret) ||
        (detectedPlatform === 'tiendanube' && prof.tiendanube_store_id && prof.tiendanube_access_token)
      );
      if (!hasStoreConfig) return;
      setFetching90d(true);
      try {
        const range90 = presetToRange("last_90d");
        const store90 = await ecommerce.getDashboardData(
          detectedPlatform!,
          prof.shopify_domain,
          prof.shopify_access_token,
          range90.since,
          range90.until,
          prof.id,
        );
        if (mounted && store90) {
          setHistorical90d(store90.daily || []);
        }
      } catch (err) {
        console.error("90d Store Fetch Error:", err);
      } finally {
        if (mounted) setFetching90d(false);
      }
    };
    if (profile?.id) fetch90d();
    return () => {
      mounted = false;
    };
  }, [profile?.id]);

  // Fetch Chatwoot summary for dashboard Atención section
  useEffect(() => {
    let mounted = true;
    const fetchChatwoot = async () => {
      const prof: any = profile;
      if (!hasChatwoot) {
        setFetchingChatwoot(false);
        setChatwootSummary(null);
        setPrevChatwootSummary(null);
        setActiveAtencMetric(null);
        setAtencChartData([]);
        setAtencPrevChartData([]);
        setAtencSeriesAll({});
        setAtencPrevSeriesAll({});
        return;
      }
      setFetchingChatwoot(true);
      try {
        const untilSecs = Math.floor(new Date(`${activeUntil}T23:59:59Z`).getTime() / 1000);
        const sinceSecs = Math.floor(new Date(`${activeSince}T00:00:00Z`).getTime() / 1000);
        const prevRange = getPrevPeriod(activeSince, activeUntil);
        const prevSinceSecs = Math.floor(new Date(`${prevRange.since}T00:00:00Z`).getTime() / 1000);
        const prevUntilSecs = Math.floor(new Date(`${prevRange.until}T23:59:59Z`).getTime() / 1000);
        const [curr, prev] = await Promise.all([
          chatwoot.getReportsSummary(prof.chatwoot_url, prof.chatwoot_token, sinceSecs, untilSecs, 'account'),
          chatwoot.getReportsSummary(prof.chatwoot_url, prof.chatwoot_token, prevSinceSecs, prevUntilSecs, 'account'),
        ]);
        if (mounted) { setChatwootSummary(curr); setPrevChatwootSummary(prev); }
      } catch (e) {
        console.error('Dashboard chatwoot fetch:', e);
      } finally {
        if (mounted) setFetchingChatwoot(false);
      }
    };
    if (profile?.id) fetchChatwoot();
    return () => { mounted = false; };
  }, [profile?.id, hasChatwoot, activeSince, activeUntil, refreshKey]);

  // Pre-fetch ALL Atención sparklines when summary loads
  useEffect(() => {
    if (!chatwootSummary) return;
    let mounted = true;
    const ATENC_KEYS = ['conversations_count', 'incoming_messages_count', 'outgoing_messages_count', 'avg_first_response_time'];
    const fetchAll = async () => {
      const prof: any = profile;
      if (!hasChatwoot) return;
      const untilSecs = Math.floor(new Date(`${activeUntil}T23:59:59Z`).getTime() / 1000);
      const sinceSecs = Math.floor(new Date(`${activeSince}T00:00:00Z`).getTime() / 1000);
      const prevRange = getPrevPeriod(activeSince, activeUntil);
      const prevSinceSecs = Math.floor(new Date(`${prevRange.since}T00:00:00Z`).getTime() / 1000);
      const prevUntilSecs = Math.floor(new Date(`${prevRange.until}T23:59:59Z`).getTime() / 1000);
      const parse = (d: any) => {
        const list = Array.isArray(d) ? d : (d?.data || d?.payload || []);
        return list.map((item: any) => {
          let dateStr = today();
          try {
            const ts = Number(item?.timestamp || 0);
            if (!isNaN(ts) && ts > 0) {
              const dateObj = new Date(ts > 10000000000 ? ts : ts * 1000);
              if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toISOString().split('T')[0];
              }
            }
          } catch (e) {}
          return {
            val: Number(item?.value || 0),
            date: dateStr,
          };
        });
      };
      const results = await Promise.allSettled(
        ATENC_KEYS.map(k => Promise.all([
          chatwoot.getReportsTimeSeries(prof.chatwoot_url, prof.chatwoot_token, k, sinceSecs, untilSecs, 'account'),
          chatwoot.getReportsTimeSeries(prof.chatwoot_url, prof.chatwoot_token, k, prevSinceSecs, prevUntilSecs, 'account'),
        ]).then(([curr, prev]) => ({ key: k, curr: parse(curr), prev: parse(prev) })))
      );
      if (!mounted) return;
      const currMap: Record<string, any[]> = {};
      const prevMap: Record<string, any[]> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          currMap[ATENC_KEYS[i]] = r.value.curr;
          prevMap[ATENC_KEYS[i]] = r.value.prev;
        }
      });
      setAtencSeriesAll(currMap);
      setAtencPrevSeriesAll(prevMap);
    };
    fetchAll();
    return () => { mounted = false; };
  }, [chatwootSummary, profile?.id, hasChatwoot, activeSince, activeUntil]);

  // Fetch Atención chart when a metric is clicked
  useEffect(() => {
    if (!activeAtencMetric) return;
    let mounted = true;
    const fetchAtencChart = async () => {
      const prof: any = profile;
      if (!hasChatwoot) return;
      setLoadingAtencChart(true);
      try {
        const untilSecs = Math.floor(new Date(`${activeUntil}T23:59:59Z`).getTime() / 1000);
        const sinceSecs = Math.floor(new Date(`${activeSince}T00:00:00Z`).getTime() / 1000);
        const prevRange = getPrevPeriod(activeSince, activeUntil);
        const prevSinceSecs = Math.floor(new Date(`${prevRange.since}T00:00:00Z`).getTime() / 1000);
        const prevUntilSecs = Math.floor(new Date(`${prevRange.until}T23:59:59Z`).getTime() / 1000);
        const [curr, prev] = await Promise.all([
          chatwoot.getReportsTimeSeries(prof.chatwoot_url, prof.chatwoot_token, activeAtencMetric, sinceSecs, untilSecs, 'account'),
          chatwoot.getReportsTimeSeries(prof.chatwoot_url, prof.chatwoot_token, activeAtencMetric, prevSinceSecs, prevUntilSecs, 'account'),
        ]);
        const parse = (d: any) => {
          const list = Array.isArray(d) ? d : (d?.data || d?.payload || []);
          return list.map((item: any) => {
            let dateStr = today();
            try {
              const ts = Number(item?.timestamp || 0);
              if (!isNaN(ts) && ts > 0) {
                const dateObj = new Date(ts > 10000000000 ? ts : ts * 1000);
                if (!isNaN(dateObj.getTime())) {
                  dateStr = dateObj.toISOString().split('T')[0];
                }
              }
            } catch (e) {}
            return {
              val: Number(item?.value || 0),
              date: dateStr,
            };
          });
        };
        if (mounted) { setAtencChartData(parse(curr)); setAtencPrevChartData(parse(prev)); }
      } catch (e) {
        console.error('Atenc chart error:', e);
      } finally {
        if (mounted) setLoadingAtencChart(false);
      }
    };
    fetchAtencChart();
    return () => { mounted = false; };
  }, [activeAtencMetric, profile?.id, hasChatwoot, activeSince, activeUntil]);

  const handleApply = () => {
    setActivePreset(pendingPreset);
    setActiveSince(pendingSince);
    setActiveUntil(pendingUntil || pendingSince);
    setRefreshKey((prev) => prev + 1);
    setShowDatePicker(false);
  };

  const getMetaChange = (curr: number | undefined, prev: number | undefined): number | undefined =>
    curr == null || prev == null || prev === 0 || isNaN(prev) ? undefined : ((curr - prev) / Math.abs(prev)) * 100;
  const getKlaviyoChange = (curr: number | undefined, prev: number | undefined): number | undefined =>
    curr == null || prev == null || prev === 0 || isNaN(prev) || !isFinite(prev)
      ? undefined
      : ((curr - prev) / Math.abs(prev)) * 100;

  const activeRange =
    activePreset === "custom"
      ? { since: activeSince, until: activeUntil }
      : presetToRange(activePreset);
  const activePrevRange = getPrevPeriod(activeRange.since, activeRange.until);

  const showMER = false;
  const currentMER = (currentStore && currentMeta && currentMeta.spend > 0)
    ? currentStore.revenue / currentMeta.spend
    : 0;
  const prevMER = (prevStore && prevMeta && prevMeta.spend > 0)
    ? prevStore.revenue / prevMeta.spend
    : 0;
  const merChange = (currentMER > 0 && prevMER > 0)
    ? ((currentMER - prevMER) / prevMER) * 100
    : undefined;

  const merDaily = (currentStore && currentStore.daily) ? currentStore.daily.map((d: any) => {
    const metaDay = metaDaily?.find((md: any) => md.date === d.date);
    const spend = metaDay ? metaDay.spend : 0;
    return {
      date: d.date,
      val: spend > 0 ? d.revenue / spend : 0
    };
  }) : [];

  const currentSpend = currentMeta?.spend || 0;
  const prevSpend = prevMeta?.spend || 0;
  const currentNetRevenue = Math.max(0, (currentStore?.revenue || 0) - costSummary.current - currentSpend);
  const prevNetRevenue = Math.max(0, (prevStore?.revenue || 0) - costSummary.previous - prevSpend);
  const realRoas = currentSpend > 0 ? currentNetRevenue / currentSpend : 0;
  const prevRealRoas = prevSpend > 0 ? prevNetRevenue / prevSpend : 0;
  const showProfitMetrics = !!currentStore && (costSummary.current > 0 || currentSpend > 0);

  const prevMerDaily = (prevStore && prevStore.daily) ? prevStore.daily.map((d: any, idx: number) => {
    const metaDay = prevMetaDaily?.[idx];
    const spend = metaDay ? metaDay.spend : 0;
    return {
      date: d.date,
      val: spend > 0 ? d.revenue / spend : 0
    };
  }) : [];

  const fmtDateRange = (d: string, showYearForce?: boolean) => {
    if (!d) return '';
    const parts = d.split("-");
    const year = parts[0];
    const month = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ][parseInt(parts[1]) - 1];
    const day = parts[2];
    const currentYear = new Date().getFullYear().toString();

    if (year === currentYear && !showYearForce) {
      return `${day} ${month}`;
    }
    return `${day} ${month} ${year}`;
  };

  if (!profile) {
    return (
      <CenteredPageLoader isLoading={true}>
        <div />
      </CenteredPageLoader>
    );
  }

  return (
    <CenteredPageLoader isLoading={false}>

    <div className="w-full space-y-6 sm:space-y-10 pt-4 md:pt-6">
      {/* Admin Client Picker */}
      {authProfile?.is_admin && allClients.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-[16px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-3">
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              Seleccionar cliente
            </span>
            {isViewingAs && (
              <button
                onClick={() => setViewAsProfile(null)}
                className="ml-auto text-[10px] font-bold text-zinc-400 hover:text-red-500 transition-colors"
              >
                Volver a mi vista
              </button>
            )}
          </div>
          <div className="relative mt-2" ref={clientPickerRef}>
            <button
              onClick={() => setShowClientPicker(!showClientPicker)}
              className="w-full h-11 pl-4 pr-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-left text-[14px] cursor-pointer hover:border-violet-300 dark:hover:border-violet-500/50 transition-all shadow-sm flex items-center"
            >
              {viewAsProfile ? (
                <span className="font-bold text-zinc-900 dark:text-white">{viewAsProfile.business_name}</span>
              ) : (
                <span className="font-normal text-zinc-400">Seleccionar cliente... (Mi Vista)</span>
              )}
              <ChevronDown className={`w-4 h-4 text-zinc-400 absolute right-4 transition-transform duration-200 ${showClientPicker ? 'rotate-180' : ''}`} />
            </button>
            {showClientPicker && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-150">
                <button
                  onClick={() => { setViewAsProfile(null); setShowClientPicker(false); }}
                  className="w-full px-4 py-2.5 text-left text-[13px] font-normal text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Seleccionar cliente... (Mi Vista)
                </button>
                <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
                {allClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setViewAsProfile({
                        ...c,
                        is_admin: false,
                      } as any);
                      setShowClientPicker(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-[13px] font-bold transition-colors ${
                      viewAsProfile?.id === c.id
                        ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400'
                        : 'text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {c.business_name}
                  </button>
                ))}
              </div>
            )}
          </div>
      </div>
      )}
      <div className="page-header relative">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <img
              src={
                darkMode
                  ? "/assets/logoSinFondo.png"
                  : "/assets/logoAlgoritmia1.webp"
              }
              alt="Algoritmia"
              className="w-12 h-12 object-contain drop-shadow-sm"
            />
            <span className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em]">
              Algoritmia • Gestión
            </span>
          </div>
          <h1 className="page-title">
            Resumen General
            <span className="text-zinc-400 dark:text-zinc-500 font-medium text-[16px] sm:text-[18px]">
              •
            </span>
            <span className="text-zinc-550 dark:text-zinc-400 font-medium text-[16px] sm:text-[18px] truncate">
              {(profile as any)?.business_name ||
                (profile as any)?.full_name ||
                "The Skirting Factory"}
            </span>
          </h1>
        </div>
        <div
          className="flex items-center justify-between md:justify-start w-full md:w-auto bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1 py-0.5 md:py-1 shadow-sm h-9 md:h-10 relative z-20"
          ref={datePickerRef}
        >
          <div className="relative flex-1 md:flex-none">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="w-full flex items-center justify-center md:justify-start gap-1.5 px-3 h-7 md:h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group text-[11px] md:text-[12.5px]"
            >
              {(fetchingStore || fetchingMeta || fetchingKlaviyo) && (currentStore || currentMeta || currentKlaviyo) ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
              )}
              <span className="text-[11px] md:text-[13px] font-bold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                {activePreset === "custom"
                  ? (activeSince === activeUntil ? fmtDateRange(activeSince) : `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}`)
                  : (
                      {
                        today: "Hoy",
                        yesterday: "Ayer",
                        last_7d: "Últimos 7 días",
                        last_14d: "Últimos 14 días",
                        last_28d: "Últimos 28 días",
                        last_30d: "Últimos 30 días",
                        last_90d: "Últimos 90 días",
                        this_month: "Este mes",
                        last_month: "Mes pasado",
                        this_year: "Este año",
                        last_year: "Año pasado",
                      } as any
                    )[activePreset] || activePreset}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? "rotate-180" : ""}`}
              />
            </button>

            {showDatePicker && (
              <div className="absolute left-0 md:left-auto md:right-0 top-full mt-3 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-30 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[290px] sm:w-[320px] md:w-auto origin-top-left md:origin-top-right">
                <div className="w-full md:w-[180px] border-b md:border-b-0 md:border-r border-zinc-50 dark:border-zinc-800 p-2 md:p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-hide">
                  {[
                    { id: "today", label: "Hoy" },
                    { id: "yesterday", label: "Ayer" },
                    { id: "last_7d", label: "Últimos 7 días" },
                    { id: "last_14d", label: "Últimos 14 días" },
                    { id: "last_28d", label: "Últimos 28 días" },
                    { id: "last_90d", label: "Últimos 90 días" },
                    { id: "this_month", label: "Este mes" },
                    { id: "last_month", label: "Mes pasado" },
                    { id: "this_year", label: "Este año" },
                    { id: "last_year", label: "Año pasado" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        const r = presetToRange(p.id as any);
                        setPendingPreset(p.id as any);
                        setPendingSince(r.since);
                        setPendingUntil(r.until);
                      }}
                      className={`flex-shrink-0 text-center md:text-left px-2.5 py-1 md:px-3 md:py-1.5 rounded-[10px] text-[12px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? "bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none" : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="px-1.5 py-3 md:p-5 flex flex-col items-center md:items-stretch">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    <MiniCal
                      year={calYear}
                      month={calMonth}
                      since={pendingSince}
                      until={pendingUntil}
                      hovering={hovering}
                      onDay={(iso: string) => {
                        setPendingPreset("custom");
                        if (!pendingSince || (pendingSince && pendingUntil)) {
                          setPendingSince(iso);
                          setPendingUntil("");
                        } else {
                          if (iso < pendingSince) {
                            setPendingUntil(pendingSince);
                            setPendingSince(iso);
                          } else {
                            setPendingUntil(iso);
                          }
                        }
                      }}
                      onHover={setHovering}
                      onPrev={() => {
                        if (calMonth === 0) {
                          setCalYear(calYear - 1);
                          setCalMonth(11);
                        } else {
                          setCalMonth(calMonth - 1);
                        }
                      }}
                      onNext={() => {
                        if (calMonth === 11) {
                          setCalYear(calYear + 1);
                          setCalMonth(0);
                        } else {
                          setCalMonth(calMonth + 1);
                        }
                      }}
                    />
                    <div className="hidden md:block">
                      <MiniCal
                        year={calMonth === 11 ? calYear + 1 : calYear}
                        month={calMonth === 11 ? 0 : calMonth + 1}
                        since={pendingSince}
                        until={pendingUntil}
                        hovering={hovering}
                        onDay={(iso: string) => {
                          setPendingPreset("custom");
                          if (!pendingSince || (pendingSince && pendingUntil)) {
                            setPendingSince(iso);
                            setPendingUntil("");
                          } else {
                            if (iso < pendingSince) {
                              setPendingUntil(pendingSince);
                              setPendingSince(iso);
                            } else {
                              setPendingUntil(iso);
                            }
                          }
                        }}
                        onHover={setHovering}
                        onNext={() => {
                          if (calMonth === 11) {
                            setCalYear(calYear + 1);
                            setCalMonth(0);
                          } else {
                            setCalMonth(calMonth + 1);
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-full flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="px-4 h-9 rounded-xl text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleApply}
                      className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90 flex items-center justify-center gap-1.5"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="hidden xs:block w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-blue-50/80 dark:bg-blue-500/10 rounded-full transition-all flex-1 md:flex-none">
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
              vs {fmtDateRange(activePrevRange.since)} -{" "}
              {fmtDateRange(activePrevRange.until)}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Shopify Section */}
        {detectedPlatform && !shopifyError && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                {detectedPlatform === 'shopify' ? (
                  <img src="/assets/shopify-bag.webp" alt="Shopify" className="w-5 h-5 object-contain shrink-0" />
                ) : detectedPlatform === 'tiendanube' ? (
                  <img src={darkMode ? "/assets/tiendanube.webp" : "/assets/tiendanubeoscuro.png"} alt="Tiendanube" className="w-5 h-5 object-contain shrink-0" />
                ) : detectedPlatform === 'wordpress' ? (
                  <img src="/assets/logowordpress.webp" alt="WooCommerce" className="w-5 h-5 object-contain shrink-0" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
                )}
                <h2 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                  Tienda Online
                </h2>
              </div>
              {shopifyError && (
                <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400 text-[10px] font-semibold bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-full border border-red-200/50 dark:border-red-900/50">
                  <AlertCircle className="w-3 h-3" />
                  <span>{shopifyError}</span>
                </div>
              )}
            </div>
            <EmailLoader
              key={`store-${activeSince}-${activeUntil}`}
              loading={fetchingStore}
              color={PINK}
              labels={showProfitMetrics ? ['Ticket Promedio', 'Pedidos', 'Ingresos', 'Facturación neta', 'ROAS real'] : (showMER ? ['Ticket Promedio', 'Pedidos', 'Ingresos', 'M.E.R. (Eficiencia)'] : ['Ticket Promedio', 'Pedidos', 'Ingresos'])}
              duration={500}
            >
              {currentStore ? (
                <>
                  <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                  <ShopifyMetric
                    icon={Receipt}
                    label="Ticket Promedio"
                    value={`$ ${currentStore.aov?.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                    change={getKlaviyoChange(currentStore?.aov, prevStore?.aov)}
                    trend={
                      (currentStore?.aov || 0) >= (prevStore?.aov || 0)
                        ? "up"
                        : "down"
                    }
                    data={currentStore?.daily?.map((d: any) => ({
                      val: d.aov,
                      date: d.date,
                    }))}
                    color={PINK}
                    loading={fetchingStore}
                    active={expandedMetric === "s-aov"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "s-aov" ? null : "s-aov",
                      )
                    }
                    info="El Ticket Promedio es el valor medio de cada compra realizada en la tienda. Refleja cuánto gasta un cliente en promedio por transacción."
                  />
                  <ShopifyMetric
                    icon={Package}
                    label="Pedidos"
                    value={currentStore.orders?.toLocaleString("es-AR")}
                    change={getKlaviyoChange(
                      currentStore?.orders,
                      prevStore?.orders,
                    )}
                    trend={
                      (currentStore?.orders || 0) >= (prevStore?.orders || 0)
                        ? "up"
                        : "down"
                    }
                    data={currentStore?.daily?.map((d: any) => ({
                      val: d.orders,
                      date: d.date,
                    }))}
                    color={PINK}
                    loading={fetchingStore}
                    active={expandedMetric === "s-orders"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "s-orders" ? null : "s-orders",
                      )
                    }
                    info="Pedidos es la cantidad total de transacciones o compras completadas con éxito en la plataforma de ecommerce durante el período."
                  />
                  <ShopifyMetric
                    icon={DollarSign}
                    label="Ingresos"
                    value={`$ ${currentStore.revenue?.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                    change={getKlaviyoChange(
                      currentStore?.revenue,
                      prevStore?.revenue,
                    )}
                    trend={
                      (currentStore?.revenue || 0) >= (prevStore?.revenue || 0)
                        ? "up"
                        : "down"
                    }
                    data={currentStore?.daily?.map((d: any) => ({
                      val: d.revenue,
                      date: d.date,
                    }))}
                    color={PINK}
                    loading={fetchingStore}
                    active={expandedMetric === "s-revenue"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "s-revenue" ? null : "s-revenue",
                      )
                    }
                    info="Ingresos representa la facturación bruta total de la tienda online (ventas totales) antes de descontar costos de pauta, envíos o devoluciones."
                  />
                  {showProfitMetrics && (
                    <>
                      <ShopifyMetric
                        icon={Coins}
                        label="Facturación neta"
                        value={`$ ${currentNetRevenue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                        change={getKlaviyoChange(currentNetRevenue, prevNetRevenue)}
                        trend={currentNetRevenue >= prevNetRevenue ? "up" : "down"}
                        data={currentStore?.daily?.map((d: any) => ({ val: d.revenue, date: d.date }))}
                        color={PINK}
                        loading={fetchingStore || fetchingMeta}
                        active={expandedMetric === "s-net-revenue"}
                        onClick={() => setExpandedMetric(expandedMetric === "s-net-revenue" ? null : "s-net-revenue")}
                        info="Facturación neta descuenta de la facturación bruta los costos adicionales cargados en Costos y la inversión publicitaria del período. Los costos unitarios por producto quedan guardados para análisis de margen."
                      />
                      <ShopifyMetric
                        icon={Zap}
                        label="ROAS real"
                        value={currentSpend > 0 ? `${realRoas.toFixed(2)}x` : "—"}
                        change={prevRealRoas > 0 ? getKlaviyoChange(realRoas, prevRealRoas) : undefined}
                        trend={realRoas >= prevRealRoas ? "up" : "down"}
                        data={currentStore?.daily?.map((d: any) => ({ val: currentSpend > 0 ? d.revenue / currentSpend : 0, date: d.date }))}
                        color={PINK}
                        loading={fetchingStore || fetchingMeta}
                        active={expandedMetric === "s-real-roas"}
                        onClick={() => setExpandedMetric(expandedMetric === "s-real-roas" ? null : "s-real-roas")}
                        info="ROAS real usa la facturación neta estimada dividida por la inversión publicitaria. Incluye costos adicionales cargados y pauta del período."
                      />
                    </>
                  )}
                  {showMER && (
                    <ShopifyMetric
                      icon={Zap}
                      label="M.E.R. (Eficiencia)"
                      value={`${currentMER.toFixed(2)}x`}
                      change={merChange}
                      trend={currentMER >= prevMER ? "up" : "down"}
                      data={merDaily}
                      color={PINK}
                      loading={fetchingStore || fetchingMeta}
                      active={expandedMetric === "mer-efficiency"}
                      onClick={() =>
                        setExpandedMetric(
                          expandedMetric === "mer-efficiency" ? null : "mer-efficiency"
                        )
                      }
                      info="Marketing Efficiency Ratio (M.E.R.) mide la eficiencia global de marketing. Es el ingreso total de la tienda dividido por la inversión publicitaria total."
                    />
                  )}
                </div>
                {(expandedMetric?.startsWith("s-") || expandedMetric === "mer-efficiency") && !(expandedMetric === "mer-efficiency" ? (fetchingStore || fetchingMeta) : fetchingStore) && (
                  <MetricDetailChart
                    label={
                      expandedMetric === "mer-efficiency"
                        ? "M.E.R. (Eficiencia)"
                        : expandedMetric === "s-net-revenue"
                          ? "Facturación neta"
                          : expandedMetric === "s-real-roas"
                            ? "ROAS real"
                        : expandedMetric === "s-revenue"
                          ? "Ingresos"
                          : expandedMetric === "s-orders"
                            ? "Pedidos"
                            : expandedMetric === "s-aov"
                              ? "Ticket Promedio"
                              : expandedMetric === "s-sessions"
                                ? "Sesiones"
                                : "Tasa de Conversión"
                    }
                    color={PINK}
                    data={
                      expandedMetric === "mer-efficiency"
                        ? merDaily
                        : expandedMetric === "s-net-revenue"
                          ? currentStore?.daily?.map((d: any) => ({ val: d.revenue, date: d.date }))
                        : expandedMetric === "s-real-roas"
                          ? currentStore?.daily?.map((d: any) => ({ val: currentSpend > 0 ? d.revenue / currentSpend : 0, date: d.date }))
                        : expandedMetric === "s-revenue"
                          ? currentStore?.daily?.map((d: any) => ({
                              val: d.revenue,
                              date: d.date,
                            }))
                          : expandedMetric === "s-orders"
                            ? currentStore?.daily?.map((d: any) => ({
                                val: d.orders,
                                date: d.date,
                              }))
                            : expandedMetric === "s-aov"
                              ? currentStore?.daily?.map((d: any) => ({
                                  val: d.aov,
                                  date: d.date,
                                }))
                              : expandedMetric === "s-sessions"
                                ? currentStore?.daily?.map((d: any) => ({
                                    val: d.sessions,
                                    date: d.date,
                                  }))
                                : currentStore?.daily?.map((d: any) => ({
                                    val: d.conversionRate,
                                    date: d.date,
                                  })) || []
                    }
                    prevData={
                      expandedMetric === "mer-efficiency"
                        ? prevMerDaily
                        : expandedMetric === "s-net-revenue"
                          ? prevStore?.daily?.map((d: any) => ({ val: d.revenue, date: d.date }))
                        : expandedMetric === "s-real-roas"
                          ? prevStore?.daily?.map((d: any) => ({ val: prevSpend > 0 ? d.revenue / prevSpend : 0, date: d.date }))
                        : expandedMetric === "s-revenue"
                          ? prevStore?.daily?.map((d: any) => ({
                              val: d.revenue,
                              date: d.date,
                            }))
                          : expandedMetric === "s-orders"
                            ? prevStore?.daily?.map((d: any) => ({
                                val: d.orders,
                                date: d.date,
                              }))
                            : expandedMetric === "s-aov"
                              ? prevStore?.daily?.map((d: any) => ({
                                  val: d.aov,
                                  date: d.date,
                                }))
                              : expandedMetric === "s-sessions"
                                ? prevStore?.daily?.map((d: any) => ({
                                    val: d.sessions,
                                    date: d.date,
                                  }))
                                : prevStore?.daily?.map((d: any) => ({
                                    val: d.conversionRate,
                                    date: d.date,
                                  })) || []
                    }
                  />
                )}
              </>
            ) : null}
          </EmailLoader>
          </div>
        )}

        {/* Meta Ads Section */}
        {profile?.meta_account_id && !metaError && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <img src="/assets/meta (1).webp" alt="Meta" className="w-5 h-5 object-contain shrink-0" />
                <h2 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                  Meta Ads
                </h2>
              </div>
              {metaError && (
                <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400 text-[10px] font-semibold bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-full border border-red-200/50 dark:border-red-900/50">
                  <AlertCircle className="w-3 h-3" />
                  <span>{metaError}</span>
                </div>
              )}
            </div>
            <EmailLoader
              key={`meta-${activeSince}-${activeUntil}`}
              loading={fetchingMeta}
              color={"#3b82f6"}
              duration={700}
              labels={
                selectedMetaGoal === 'purchases'
                  ? ['Inversión', 'Alcance', 'Compras', 'ROAS', 'Retorno']
                  : selectedMetaGoal === 'leads'
                  ? ['Inversión', 'Alcance', 'Leads', 'CPL']
                  : selectedMetaGoal === 'messages'
                  ? ['Inversión', 'Alcance', 'Mensajes', 'Costo x Msj']
                  : ['Inversión', 'Alcance']
              }
            >
              {currentMeta ? (
                <>
                  <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:overflow-x-auto scrollbar-hide">
                  <ShopifyMetric
                    icon={DollarSign}
                    label="Inversión"
                    value={`$ ${currentMeta.spend?.toLocaleString("es-AR", { maximumFractionDigits: 0 }) || 0}`}
                    change={getMetaChange(currentMeta?.spend, prevMeta?.spend)}
                    trend={
                      (currentMeta?.spend || 0) >= (prevMeta?.spend || 0)
                        ? "up"
                        : "down"
                    }
                    data={metaDaily?.map((d: any) => ({
                      val: d.spend,
                      date: d.date,
                    }))}
                    color={MAIN_COLOR}
                    loading={fetchingMeta}
                    active={expandedMetric === "meta-inversion"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "meta-inversion"
                          ? null
                          : "meta-inversion",
                      )
                    }
                    info="La Inversión publicitaria es la suma total del presupuesto gastado en pauta dentro de Meta Ads durante el período seleccionado."
                  />
                  <ShopifyMetric
                    icon={Users}
                    label="Alcance"
                    value={currentMeta.reach?.toLocaleString("es-AR") || 0}
                    change={getMetaChange(currentMeta?.reach, prevMeta?.reach)}
                    trend={
                      (currentMeta?.reach || 0) >= (prevMeta?.reach || 0)
                        ? "up"
                        : "down"
                    }
                    data={metaDaily?.map((d: any) => ({
                      val: d.reach,
                      date: d.date,
                    }))}
                    color={MAIN_COLOR}
                    loading={fetchingMeta}
                    active={expandedMetric === "meta-alcance"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "meta-alcance"
                          ? null
                          : "meta-alcance",
                      )
                    }
                    info="El Alcance representa el número total de personas (usuarios únicos) que vieron tus anuncios al menos una vez en las plataformas de Meta."
                  />
                  
                  {selectedMetaGoal === 'purchases' && (
                    <>
                      <ShopifyMetric
                        icon={Target}
                        label="Compras"
                        value={currentMeta.purchases || 0}
                        change={getMetaChange(currentMeta?.purchases, prevMeta?.purchases)}
                        trend={(currentMeta?.purchases || 0) >= (prevMeta?.purchases || 0) ? "up" : "down"}
                        data={metaDaily?.map((d: any) => ({ val: d.purchases, date: d.date }))}
                        color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === "meta-purchases"}
                        onClick={() => setExpandedMetric(expandedMetric === "meta-purchases" ? null : "meta-purchases")}
                        info="Compras totales es el número acumulado de ventas en la tienda atribuidas a la interacción directa con tus anuncios de Meta Ads."
                      />
                      <ShopifyMetric
                        icon={BarChart2}
                        label="ROAS"
                        value={`${currentMeta.roas?.toFixed(1) || 0}`}
                        change={getMetaChange(currentMeta?.roas, prevMeta?.roas)}
                        trend={(currentMeta?.roas || 0) >= (prevMeta?.roas || 0) ? "up" : "down"}
                        data={metaDaily?.map((d: any) => ({ val: d.roas, date: d.date }))}
                        color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === "meta-roas"}
                        onClick={() => setExpandedMetric(expandedMetric === "meta-roas" ? null : "meta-roas")}
                        info="Return on Ad Spend (ROAS) es el retorno de inversión publicitaria. Se calcula como los ingresos atribuidos a Meta divididos por la inversión en pauta."
                      />
                      <ShopifyMetric
                        icon={DollarSign}
                        label="Retorno"
                        value={`$ ${currentMeta.purchase_value?.toLocaleString("es-AR", { maximumFractionDigits: 0 }) || 0}`}
                        change={getMetaChange(currentMeta?.purchase_value, prevMeta?.purchase_value)}
                        trend={(currentMeta?.purchase_value || 0) >= (prevMeta?.purchase_value || 0) ? "up" : "down"}
                        data={metaDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))}
                        color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === "meta-roas-v"}
                        onClick={() => setExpandedMetric(expandedMetric === "meta-roas-v" ? null : "meta-roas-v")}
                        info="Retorno es el valor monetario (ingresos) generado por las compras que son atribuidas directamente a tus campañas de anuncios en Meta."
                      />
                    </>
                  )}

                  {selectedMetaGoal === 'leads' && (
                    <>
                      <ShopifyMetric
                        icon={Target}
                        label="Leads"
                        value={currentMeta.leads || 0}
                        change={getMetaChange(currentMeta?.leads, prevMeta?.leads)}
                        trend={(currentMeta?.leads || 0) >= (prevMeta?.leads || 0) ? "up" : "down"}
                        data={metaDaily?.map((d: any) => ({ val: d.leads, date: d.date }))}
                        color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === "meta-leads"}
                        onClick={() => setExpandedMetric(expandedMetric === "meta-leads" ? null : "meta-leads")}
                        info="Leads representa la cantidad de clientes potenciales capturados a través de formularios o eventos registrados desde tus anuncios en Meta."
                      />
                      <ShopifyMetric
                        icon={DollarSign}
                        label="CPL"
                        value={`$ ${((currentMeta.leads ? currentMeta.spend / currentMeta.leads : 0)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 0}`}
                        change={getMetaChange(
                          currentMeta?.leads ? currentMeta.spend / currentMeta.leads : 0, 
                          prevMeta?.leads ? prevMeta.spend / prevMeta.leads : 0
                        )}
                        trend={(currentMeta?.leads ? currentMeta.spend / currentMeta.leads : 0) <= (prevMeta?.leads ? prevMeta.spend / prevMeta.leads : 0) ? "up" : "down"}
                        data={metaDaily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))}
                        color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === "meta-cpl"}
                        onClick={() => setExpandedMetric(expandedMetric === "meta-cpl" ? null : "meta-cpl")}
                        info="Costo por Lead (CPL) representa el valor promedio invertido para capturar a cada cliente potencial (Inversión total dividida por número de Leads)."
                      />
                    </>
                  )}

                  {selectedMetaGoal === 'messages' && (
                    <>
                      <ShopifyMetric
                        icon={MessageSquare}
                        label="Mensajes"
                        value={currentMeta.messages || 0}
                        change={getMetaChange(currentMeta?.messages, prevMeta?.messages)}
                        trend={(currentMeta?.messages || 0) >= (prevMeta?.messages || 0) ? "up" : "down"}
                        data={metaDaily?.map((d: any) => ({ val: d.messages, date: d.date }))}
                        color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === "meta-messages"}
                        onClick={() => setExpandedMetric(expandedMetric === "meta-messages" ? null : "meta-messages")}
                        info="Mensajes es la cantidad de conversaciones por chat (Messenger, Instagram Direct o WhatsApp) iniciadas directamente por usuarios desde tus anuncios."
                      />
                      <ShopifyMetric
                        icon={DollarSign}
                        label="Costo x Msj"
                        value={`$ ${((currentMeta.messages ? currentMeta.spend / currentMeta.messages : 0)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 0}`}
                        change={getMetaChange(
                          currentMeta?.messages ? currentMeta.spend / currentMeta.messages : 0, 
                          prevMeta?.messages ? prevMeta.spend / prevMeta.messages : 0
                        )}
                        trend={(currentMeta?.messages ? currentMeta.spend / currentMeta.messages : 0) <= (prevMeta?.messages ? prevMeta.spend / prevMeta.messages : 0) ? "up" : "down"}
                        data={metaDaily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))}
                        color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === "meta-cpm"}
                        onClick={() => setExpandedMetric(expandedMetric === "meta-cpm" ? null : "meta-cpm")}
                        info="Costo por Mensaje es el valor promedio invertido para que un usuario inicie una nueva conversación desde tus anuncios (Inversión / Mensajes)."
                      />
                    </>
                  )}
                </div>
                {expandedMetric?.startsWith("meta-") && !fetchingMeta && (
                  <MetricDetailChart
                    label={
                      expandedMetric === "meta-inversion" ? "Inversión"
                        : expandedMetric === "meta-alcance" ? "Alcance"
                        : expandedMetric === "meta-purchases" ? "Compras"
                        : expandedMetric === "meta-roas" ? "ROAS"
                        : expandedMetric === "meta-roas-v" ? "Retorno"
                        : expandedMetric === "meta-leads" ? "Leads"
                        : expandedMetric === "meta-cpl" ? "CPL"
                        : expandedMetric === "meta-messages" ? "Mensajes"
                        : "Costo x Msj"
                    }
                    color={MAIN_COLOR}
                    data={
                      expandedMetric === "meta-inversion" ? metaDaily?.map((d: any) => ({ val: d.spend, date: d.date }))
                        : expandedMetric === "meta-alcance" ? metaDaily?.map((d: any) => ({ val: d.reach, date: d.date }))
                        : expandedMetric === "meta-purchases" ? metaDaily?.map((d: any) => ({ val: d.purchases, date: d.date }))
                        : expandedMetric === "meta-roas" ? metaDaily?.map((d: any) => ({ val: d.roas, date: d.date }))
                        : expandedMetric === "meta-roas-v" ? metaDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))
                        : expandedMetric === "meta-leads" ? metaDaily?.map((d: any) => ({ val: d.leads, date: d.date }))
                        : expandedMetric === "meta-cpl" ? metaDaily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))
                        : expandedMetric === "meta-messages" ? metaDaily?.map((d: any) => ({ val: d.messages, date: d.date }))
                        : expandedMetric === "meta-cpm" ? metaDaily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))
                        : []
                    }
                    prevData={
                      expandedMetric === "meta-inversion" ? prevMetaDaily?.map((d: any) => ({ val: d.spend, date: d.date }))
                        : expandedMetric === "meta-alcance" ? prevMetaDaily?.map((d: any) => ({ val: d.reach, date: d.date }))
                        : expandedMetric === "meta-purchases" ? prevMetaDaily?.map((d: any) => ({ val: d.purchases, date: d.date }))
                        : expandedMetric === "meta-roas" ? prevMetaDaily?.map((d: any) => ({ val: d.roas, date: d.date }))
                        : expandedMetric === "meta-roas-v" ? prevMetaDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))
                        : expandedMetric === "meta-leads" ? prevMetaDaily?.map((d: any) => ({ val: d.leads, date: d.date }))
                        : expandedMetric === "meta-cpl" ? prevMetaDaily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))
                        : expandedMetric === "meta-messages" ? prevMetaDaily?.map((d: any) => ({ val: d.messages, date: d.date }))
                        : expandedMetric === "meta-cpm" ? prevMetaDaily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))
                        : []
                    }
                  />
                )}
              </>
            ) : null}
          </EmailLoader>
          </div>
        )}

        {/* Email Marketing Section */}
        {profile?.klaviyo_api_key && !klaviyoError && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <img src="/assets/Klaviyo-Logo-Photoroom.webp" alt="Klaviyo" className="w-5 h-5 object-contain shrink-0" />
                <h2 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                  Email Marketing
                </h2>
              </div>
              {klaviyoError && (
                <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400 text-[10px] font-semibold bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-full border border-red-200/50 dark:border-red-900/50">
                  <AlertCircle className="w-3 h-3" />
                  <span>{klaviyoError}</span>
                </div>
              )}
            </div>
            <EmailLoader
              key={`klaviyo-${activeSince}-${activeUntil}`}
              loading={fetchingKlaviyo}
              color={GREEN}
              labels={isEcommerce ? ['Entregas', 'Tasa de Apertura', 'Tasa de Clics', 'Ingresos Email'] : ['Entregas', 'Tasa de Apertura', 'Tasa de Clics']}
              duration={1100}
            >
              {currentKlaviyo ? (
                <>
                  <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                  <ShopifyMetric
                    icon={Package}
                    label="Entregas"
                    value={currentKlaviyo.sent?.toLocaleString("es-AR") || "0"}
                    change={getKlaviyoChange(
                      currentKlaviyo?.sent ?? 0,
                      prevKlaviyo?.sent ?? 0,
                    )}
                    trend={
                      (currentKlaviyo?.sent || 0) >= (prevKlaviyo?.sent || 0)
                        ? "up"
                        : "down"
                    }
                    data={currentKlaviyo?.dailySent || []}
                    color={GREEN}
                    loading={fetchingKlaviyo}
                    active={expandedMetric === "k-sent"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "k-sent" ? null : "k-sent",
                      )
                    }
                    info="Total de correos electrónicos de campañas y flujos automatizados de Klaviyo que fueron entregados con éxito a los destinatarios."
                  />
                  <ShopifyMetric
                    icon={MailOpen}
                    label="Tasa de Apertura"
                    value={`${(((currentKlaviyo.opens ?? 0) / (currentKlaviyo.sent || 1)) * 100).toFixed(1)}%`}
                    change={getKlaviyoChange(
                      (currentKlaviyo?.opens ?? 0) /
                        (currentKlaviyo?.sent || 1),
                      (prevKlaviyo?.opens ?? 0) / (prevKlaviyo?.sent || 1),
                    )}
                    trend={
                      (currentKlaviyo?.opens ?? 0) /
                        (currentKlaviyo?.sent || 1) >=
                      (prevKlaviyo?.opens ?? 0) / (prevKlaviyo?.sent || 1)
                        ? "up"
                        : "down"
                    }
                    data={
                      currentKlaviyo?.dailyOpens?.map((d: any, i: number) => ({
                        val:
                          (d.val / ((currentKlaviyo?.dailySent || [])[i]?.val || 1)) *
                          100,
                        date: d.date,
                      })) || []
                    }
                    color={GREEN}
                    loading={fetchingKlaviyo}
                    active={expandedMetric === "k-open-rate"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "k-open-rate" ? null : "k-open-rate",
                      )
                    }
                    info="Porcentaje de correos entregados que fueron abiertos por los usuarios. Mide el interés y efectividad de tus líneas de asunto."
                  />
                  <ShopifyMetric
                    icon={MousePointerClick}
                    label="Tasa de Clics"
                    value={`${(((currentKlaviyo.clicks ?? 0) / (currentKlaviyo.sent || 1)) * 100).toFixed(1)}%`}
                    change={getKlaviyoChange(
                      (currentKlaviyo?.clicks ?? 0) /
                        (currentKlaviyo?.sent || 1),
                      (prevKlaviyo?.clicks ?? 0) / (prevKlaviyo?.sent || 1),
                    )}
                    trend={
                      (currentKlaviyo?.clicks ?? 0) /
                        (currentKlaviyo?.sent || 1) >=
                      (prevKlaviyo?.clicks ?? 0) / (prevKlaviyo?.sent || 1)
                        ? "up"
                        : "down"
                    }
                    data={
                      currentKlaviyo?.dailyClicks?.map((d: any, i: number) => ({
                        val:
                          (d.val / ((currentKlaviyo?.dailySent || [])[i]?.val || 1)) *
                          100,
                        date: d.date,
                      })) || []
                    }
                    color={GREEN}
                    loading={fetchingKlaviyo}
                    active={expandedMetric === "k-click-rate"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "k-click-rate"
                          ? null
                          : "k-click-rate",
                      )
                    }
                    info="Porcentaje de destinatarios que hicieron clic en uno o más enlaces del correo. Mide la relevancia de tu contenido y llamados a la acción."
                  />
                  {isEcommerce && <ShopifyMetric
                    icon={DollarSign}
                    label="Ingresos Email"
                    value={`$ ${currentKlaviyo.attributed?.toLocaleString("es-AR", { maximumFractionDigits: 0 }) || 0}`}
                    change={getKlaviyoChange(
                      currentKlaviyo?.attributed ?? 0,
                      prevKlaviyo?.attributed ?? 0,
                    )}
                    trend={
                      (currentKlaviyo?.attributed || 0) >=
                      (prevKlaviyo?.attributed || 0)
                        ? "up"
                        : "down"
                    }
                    data={currentKlaviyo?.dailyAttributed || []}
                    color={GREEN}
                    loading={fetchingKlaviyo}
                    active={expandedMetric === "k-attr"}
                    onClick={() =>
                      setExpandedMetric(
                        expandedMetric === "k-attr" ? null : "k-attr",
                      )
                    }
                    info="Ingresos Email es la facturación total generada en tu tienda online atribuible directamente a tus campañas y flujos de Klaviyo."
                  />}
                </div>
                {expandedMetric?.startsWith("k-") && !fetchingKlaviyo && (
                  <MetricDetailChart
                    label={
                      expandedMetric === "k-revenue"
                        ? "Ingresos Tienda Online"
                        : expandedMetric === "k-attr"
                          ? "Ingresos Email"
                          : expandedMetric === "k-sent"
                            ? "Entregas"
                            : expandedMetric === "k-click-rate"
                              ? "Tasa de Clics"
                              : "Tasa de Apertura"
                    }
                    color={GREEN}
                    data={
                      expandedMetric === "k-revenue"
                        ? currentKlaviyo?.dailyRevenue || []
                        : expandedMetric === "k-attr"
                          ? currentKlaviyo?.dailyAttributed || []
                          : expandedMetric === "k-sent"
                            ? currentKlaviyo?.dailySent || []
                            : expandedMetric === "k-click-rate"
                              ? currentKlaviyo?.dailyClicks?.map(
                                  (d: any, i: number) => ({
                                    val:
                                      (d.val /
                                        ((currentKlaviyo?.dailySent || [])[i]?.val ||
                                          1)) *
                                      100,
                                    date: d.date,
                                  }),
                                ) || []
                              : currentKlaviyo?.dailyOpens?.map(
                                  (d: any, i: number) => ({
                                    val:
                                      (d.val /
                                        ((currentKlaviyo?.dailySent || [])[i]?.val ||
                                          1)) *
                                      100,
                                    date: d.date,
                                  }),
                                ) || []
                    }
                    prevData={
                      expandedMetric === "k-revenue"
                        ? prevKlaviyo?.dailyRevenue || []
                        : expandedMetric === "k-attr"
                          ? prevKlaviyo?.dailyAttributed || []
                          : expandedMetric === "k-sent"
                            ? prevKlaviyo?.dailySent || []
                            : expandedMetric === "k-click-rate"
                              ? prevKlaviyo?.dailyClicks?.map(
                                  (d: any, i: number) => ({
                                    val:
                                      (d.val /
                                        ((prevKlaviyo?.dailySent || [])[i]?.val || 1)) *
                                      100,
                                    date: d.date,
                                  }),
                                ) || []
                              : prevKlaviyo?.dailyOpens?.map(
                                  (d: any, i: number) => ({
                                    val:
                                      (d.val /
                                        ((prevKlaviyo?.dailySent || [])[i]?.val || 1)) *
                                      100,
                                    date: d.date,
                                  }),
                                ) || []
                    }
                  />
                )}
              </>
            ) : null}
          </EmailLoader>
          </div>
        )}

        {/* ATENCIÓN (Chatwoot) */}
        {hasChatwoot && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-violet-500 shrink-0" />
              <h2 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Mensajería</h2>
            </div>
            <EmailLoader
              key={`chatwoot-${activeSince}-${activeUntil}`}
              loading={fetchingChatwoot}
              color="#8b5cf6"
              labels={['Conversaciones', 'Msj. Entrantes', 'Msj. Salientes', 'Resp. Promedio']}
              duration={900}
            >
            {chatwootSummary ? (
              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                {[
                  { key: 'conversations_count',      label: 'Conversaciones', icon: MessageCircle, isTime: false, info: 'Total de conversaciones iniciadas en el período. Incluye todos los canales conectados (WhatsApp, Instagram, Facebook, Web).' },
                  { key: 'incoming_messages_count',  label: 'Msj. Entrantes', icon: Inbox,         isTime: false, info: 'Mensajes recibidos de clientes. Refleja el volumen de consultas y la demanda de atención en el período.' },
                  { key: 'outgoing_messages_count',  label: 'Msj. Salientes', icon: Send,          isTime: false, info: 'Mensajes enviados por el equipo o la IA. Indica la cantidad de respuestas dadas a los clientes.' },
                  { key: 'avg_first_response_time',  label: 'Resp. Promedio', icon: Clock,         isTime: true,  info: 'Tiempo promedio entre que un cliente escribe y recibe la primera respuesta. Menos tiempo = mejor experiencia.' },
                ].map(m => {
                  const val = Number(chatwootSummary[m.key] || 0);
                  const prev = Number(prevChatwootSummary?.[m.key] || 0);
                  const change = prev > 0 ? ((val - prev) / prev) * 100 : undefined;
                  const displayVal = m.isTime
                    ? (() => { const s = val; if (!s) return '0m'; const h = Math.floor(s/3600); const min = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${min}m` : `${min}m`; })()
                    : val.toLocaleString('es-AR');
                  const trend = change === undefined ? 'up' : m.isTime ? (change <= 0 ? 'up' : 'down') : (change >= 0 ? 'up' : 'down');
                  return (
                    <ShopifyMetric
                      key={m.key}
                      icon={m.icon}
                      label={m.label}
                      value={displayVal}
                      change={change}
                      trend={trend}
                      data={activeAtencMetric === m.key ? atencChartData : (atencSeriesAll[m.key] || [])}
                      color={'#8b5cf6'}
                      loading={fetchingChatwoot}
                      active={activeAtencMetric === m.key}
                      onClick={() => setActiveAtencMetric(activeAtencMetric === m.key ? null : m.key)}
                      info={m.info}
                    />
                  );
                })}
              </div>
            ) : null}
            </EmailLoader>
            {/* Atención expanded chart */}
            {chatwootSummary && activeAtencMetric && !fetchingChatwoot && (
              <div className="relative mt-2">
                {(() => {
                  const ATENC_METRICS = [
                    { key: 'conversations_count', label: 'Conversaciones', color: '#8b5cf6' },
                    { key: 'incoming_messages_count', label: 'Msj. Entrantes', color: '#10b981' },
                    { key: 'outgoing_messages_count', label: 'Msj. Salientes', color: '#3b82f6' },
                    { key: 'avg_first_response_time', label: 'Resp. Promedio', color: '#f59e0b' },
                  ];
                  const cfg = ATENC_METRICS.find(m => m.key === activeAtencMetric);
                  if (!cfg) return null;
                  return <MetricDetailChart label={cfg.label} color={'#8b5cf6'} data={atencChartData.length ? atencChartData : (atencSeriesAll[activeAtencMetric] || [])} prevData={atencPrevChartData.length ? atencPrevChartData : (atencPrevSeriesAll[activeAtencMetric] || [])} />;
                })()}
              </div>
            )}
          </div>
        )}

        {!profile?.meta_account_id &&
          !profile?.klaviyo_api_key &&
          !detectedPlatform && (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <h3 className="text-zinc-500 font-medium mb-2">
                Aún no tienes módulos conectados
              </h3>
              <p className="text-[13px] text-zinc-400 max-w-md">
                Contacta con el administrador para que configure tus
                integraciones de Meta Ads, Email Marketing o tu Tienda y comiences a ver
                tus datos en tiempo real.
              </p>
            </div>
          )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 mt-8 sm:mt-12">
        {isEcommerce && (
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.06] dark:border-white/[0.06] p-4 sm:p-8 shadow-sm">
            <h2 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50 mb-8 tracking-tight">
              Evolución de Ingresos (Últimos 90 días)
            </h2>
            {fetching90d ? (
              <div className="h-[300px] flex items-center justify-center animate-pulse bg-zinc-50 dark:bg-zinc-800/50 rounded-xl" />
            ) : (historical90d.length > 0 || currentStore?.daily?.length > 0) ? (
              <HistoricalRevenueChart data={historical90d.length > 0 ? historical90d : currentStore.daily} color={PINK} />
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-zinc-400 gap-4">
                <BarChart2 className="w-10 h-10 opacity-20" />
                <p className="text-[13px] font-medium opacity-60">Sin datos históricos</p>
              </div>
            )}
          </div>
        )}
        <div className={`${isEcommerce ? '' : 'lg:col-span-3'} bg-white dark:bg-[#111113] rounded-[20px] border border-black/[0.06] dark:border-white/[0.06] p-4 sm:p-6 shadow-sm flex flex-col`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4 text-pink-500" />
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
                  Últimos Pedidos
                </h2>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">Las últimas transacciones de tu tienda</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[340px] pr-1 space-y-2.5 scrollbar-hide">
            {fetchingStore ? (
              <div className="space-y-2.5">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-100/80 dark:border-zinc-800/40 bg-zinc-50/30 dark:bg-zinc-900/10"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg shimmer-bg shrink-0" />
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="h-3 w-12 shimmer-bg rounded" />
                          <div className="h-3.5 w-10 shimmer-bg rounded" />
                        </div>
                        <div className="h-2.5 w-24 shimmer-bg rounded" />
                      </div>
                    </div>
                    <div className="h-3 w-12 shimmer-bg rounded" />
                  </div>
                ))}
              </div>
            ) : !currentStore?.recentOrders || currentStore.recentOrders.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-[12px] text-zinc-450 dark:text-zinc-550 font-medium">
                  No se encontraron pedidos
                </p>
              </div>
            ) : (
              currentStore.recentOrders.map((order: any) => {
                const date = new Date(order.created_at);
                const fmtDateStr = date.toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/Argentina/Buenos_Aires',
                });
                const getArgDate = (d: Date) => new Intl.DateTimeFormat('sv-SE', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit'
                }).format(d);

                const orderDateStr = getArgDate(date);
                const todayDateStr = getArgDate(new Date());
                const yesterdayDate = new Date();
                yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                const yesterdayDateStr = getArgDate(yesterdayDate);

                const isOrderToday = orderDateStr === todayDateStr;
                const isOrderYesterday = orderDateStr === yesterdayDateStr;

                // Payment Status
                let paymentText = 'Pendiente';
                let paymentColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10';
                if (order.financial_status === 'paid') {
                  paymentText = 'Pagado';
                  paymentColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10';
                } else if (order.financial_status === 'authorized') {
                  paymentText = 'Autorizado';
                  paymentColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10';
                } else if (order.financial_status === 'refunded') {
                  paymentText = 'Reembolsado';
                  paymentColor = 'bg-zinc-500/10 text-zinc-550 dark:text-zinc-400 border border-zinc-500/10';
                }

                // Fulfillment Status
                let fulfillmentText = 'No enviado';
                let fulfillmentColor = 'bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/10';
                
                const isLocalPickup = (order.shipping_lines || []).some((sl: any) => {
                  const title = (sl.title || '').toLowerCase();
                  return title.includes('retiro') || title.includes('local') || title.includes('pick') || title.includes('sucursal') || title.includes('showroom') || title.includes('tienda');
                });

                if (order.fulfillment_status === 'fulfilled') {
                  fulfillmentText = 'Enviado';
                  fulfillmentColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10';
                } else if (order.fulfillment_status === 'partial') {
                  fulfillmentText = 'Parcial';
                  fulfillmentColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10';
                } else if (isLocalPickup) {
                  fulfillmentText = 'Listo para retiro';
                  fulfillmentColor = 'bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 border border-indigo-500/10';
                }

                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30 hover:border-pink-500/20 dark:hover:border-pink-500/20 hover:bg-white dark:hover:bg-zinc-900 transition-all duration-200 group hover:shadow-[0_2px_8px_rgba(0,0,0,0.02)] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-pink-500/5 dark:bg-pink-500/10 flex items-center justify-center text-pink-500/70 group-hover:bg-pink-500/10 group-hover:text-pink-500 transition-colors shrink-0">
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">
                            {order.email || order.customer?.email ? (
                              <a
                                href={`#/cliente/${order.email || order.customer.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:underline hover:text-pink-500 transition-colors"
                              >
                                {order.customer_name}
                              </a>
                            ) : (
                              order.customer_name
                            )}
                          </span>
                          <div className="flex items-center gap-1 shrink-0 flex-wrap">
                            {(order.customer?.orders_count ?? 0) === 1 && (
                              <span className="text-[7px] font-black px-1 py-0.5 rounded uppercase tracking-wider border bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20">
                                Nuevo
                              </span>
                            )}
                            <span className={`text-[7px] font-bold px-1 py-0.5 rounded uppercase tracking-wider ${paymentColor}`}>
                              {paymentText}
                            </span>
                            <span className={`text-[7px] font-bold px-1 py-0.5 rounded uppercase tracking-wider ${fulfillmentColor}`}>
                              {fulfillmentText}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium truncate mt-0.5 flex items-center gap-1.5">
                          {isOrderToday && (
                            <span className="text-[7.5px] font-black text-pink-500 dark:text-pink-400 uppercase tracking-wider bg-pink-500/10 dark:bg-pink-500/20 px-1.5 py-[1px] rounded shrink-0">
                              Hoy
                            </span>
                          )}
                          {isOrderYesterday && (
                            <span className="text-[7.5px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-wider bg-violet-500/10 dark:bg-violet-500/20 px-1.5 py-[1px] rounded shrink-0">
                              Ayer
                            </span>
                          )}
                          <span>{fmtDateStr} hs</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="text-[12px] font-bold text-pink-600 dark:text-pink-400">
                        $ {order.total_price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      
      {/* Order Detail Modal */}
      {selectedOrder && createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          {/* Modal: full-screen on mobile, centered card on desktop */}
          <div className="fixed inset-0 z-[501] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-[650px] sm:w-full sm:mx-4 bg-white dark:bg-zinc-900 sm:border sm:border-zinc-200 sm:dark:border-zinc-800 shadow-2xl sm:rounded-3xl flex flex-col sm:max-h-[90vh] overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="px-4 py-3 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-5 h-5 text-pink-500" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-zinc-900 dark:text-white leading-tight">
                    Pedido {selectedOrder.order_number}
                  </h3>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                    {new Date(selectedOrder.created_at).toLocaleString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })} hs
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-750 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-all shadow-sm"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-6 space-y-4 sm:space-y-6 scrollbar-hide">
              
              {/* Customer & Billing section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Customer profile */}
                <div className="bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-150/40 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-black text-pink-650 dark:text-pink-400 uppercase tracking-wider block">
                    Datos del Cliente
                  </span>
                  <div>
                    {selectedOrder.email || selectedOrder.customer?.email ? (
                      <a
                        href={`#/cliente/${selectedOrder.email || selectedOrder.customer.email}`}
                        className="text-[14px] font-bold text-zinc-900 dark:text-white hover:underline hover:text-pink-500 transition-colors"
                      >
                        {selectedOrder.customer_name}
                      </a>
                    ) : (
                      <p className="text-[14px] font-bold text-zinc-900 dark:text-white">
                        {selectedOrder.customer_name}
                      </p>
                    )}
                    {selectedOrder.email && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 font-medium truncate mt-0.5">
                        {selectedOrder.email}
                      </p>
                    )}
                    {selectedOrder.phone && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                        {selectedOrder.phone}
                      </p>
                    )}
                  </div>
                  {selectedOrder.customer && (selectedOrder.customer.orders_count != null || selectedOrder.customer.total_spent != null) && (
                    <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] font-medium text-zinc-450 dark:text-zinc-550">
                      <span>Historial: <strong className="text-zinc-750 dark:text-zinc-300">{selectedOrder.customer.orders_count ?? '—'} pedidos</strong></span>
                      <span>Total: <strong className="text-zinc-750 dark:text-zinc-300">
                        {selectedOrder.customer.total_spent != null
                          ? `$${Number(selectedOrder.customer.total_spent).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                          : '—'}
                      </strong></span>
                    </div>
                  )}
                  {(selectedOrder.email || selectedOrder.customer?.email) && (
                    <a
                      href={`#/cliente/${selectedOrder.email || selectedOrder.customer.email}`}
                      className="flex items-center justify-center gap-2 mt-3 w-full py-2.5 bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white rounded-xl text-[12px] font-black shadow-lg shadow-pink-500/20 transition-all hover:scale-[1.02]"
                    >
                      <User className="w-4 h-4" />
                      Ver Perfil y Pedidos
                    </a>
                  )}
                </div>

                {/* Address */}
                <div className="bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-150/40 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-black text-pink-650 dark:text-pink-400 uppercase tracking-wider block">
                    Dirección de Envío
                  </span>
                  {selectedOrder.shipping_address ? (
                    <div className="text-[12px] text-zinc-650 dark:text-zinc-400 leading-relaxed font-medium">
                      <p className="font-bold text-zinc-800 dark:text-zinc-200">
                        {selectedOrder.shipping_address.name || `${selectedOrder.shipping_address.first_name || ''} ${selectedOrder.shipping_address.last_name || ''}`}
                      </p>
                      <p>{selectedOrder.shipping_address.address1}</p>
                      {selectedOrder.shipping_address.address2 && <p>{selectedOrder.shipping_address.address2}</p>}
                      <p>
                        {selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.province_code || selectedOrder.shipping_address.province || ''}
                      </p>
                      <p>
                        {selectedOrder.shipping_address.zip} • {selectedOrder.shipping_address.country}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-zinc-400 font-medium italic">Envío no físico o retiro en tienda.</p>
                  )}
                </div>

              </div>

              {/* Status block */}
              <div className="flex gap-4">
                <div className="flex-1 p-3 rounded-xl border border-zinc-150/60 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-900/10 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-450 dark:text-zinc-550">Estado de Pago</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    selectedOrder.financial_status === 'paid'
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/15"
                      : selectedOrder.financial_status === 'authorized'
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-500/15"
                        : selectedOrder.financial_status === 'refunded'
                          ? "bg-zinc-150 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-550 border border-zinc-600/15"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/15"
                  }`}>
                    {selectedOrder.financial_status === 'paid' 
                      ? 'Pagado' 
                      : selectedOrder.financial_status === 'authorized'
                        ? 'Autorizado'
                        : selectedOrder.financial_status === 'refunded'
                          ? 'Reembolsado'
                          : 'Pendiente'}
                  </span>
                </div>
                <div className="flex-1 p-3 rounded-xl border border-zinc-150/60 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-900/10 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-zinc-450 dark:text-zinc-550">Estado de Envío</span>
                  {(() => {
                    const isLocalPickup = (selectedOrder.shipping_lines || []).some((sl: any) => {
                      const title = (sl.title || '').toLowerCase();
                      return title.includes('retiro') || title.includes('local') || title.includes('pick') || title.includes('sucursal') || title.includes('showroom') || title.includes('tienda');
                    });
                    const isFulfilled = selectedOrder.fulfillment_status === 'fulfilled';
                    const isPartial = selectedOrder.fulfillment_status === 'partial';
                    const badgeCls = isFulfilled
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/15"
                      : isPartial
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-500/15"
                        : isLocalPickup
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-500/15"
                          : "bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-450 border border-zinc-200/10";
                    const label = isFulfilled
                      ? 'Enviado'
                      : isPartial
                        ? 'Parcial'
                        : isLocalPickup
                          ? 'Listo para retiro'
                          : 'No enviado';
                    return (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeCls}`}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Line items list */}
              <div className="space-y-3">
                <span className="text-[10px] font-black text-pink-650 dark:text-pink-400 uppercase tracking-wider block">
                  Productos Solicitados
                </span>
                <div className="border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                  {selectedOrder.line_items?.map((item: any, idx: number) => {
                    const img = item._wc_image || productImages[String(item.product_id)];
                    return (
                      <div key={idx} className="p-3.5 flex items-center gap-3 text-[13px] font-medium text-zinc-700 dark:text-zinc-350">
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center border border-zinc-250/30 dark:border-white/[0.06]">
                          {img ? (
                            <img src={img} alt={item.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            <Package className="w-3.5 h-3.5 text-zinc-450 dark:text-zinc-550" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="font-bold text-zinc-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          {item.variant_title && item.variant_title !== 'Default Title' && (
                            <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              Variante: {item.variant_title}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-zinc-900 dark:text-white">
                            ${(item.price * item.quantity).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {item.quantity} x ${item.price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                  <span>Subtotal</span>
                  <span>${selectedOrder.subtotal_price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                </div>
                {selectedOrder.total_discounts > 0 && (
                  <div className="flex items-center justify-between text-[12px] font-medium text-emerald-500">
                    <span className="flex items-center gap-1.5">
                      <span>Descuentos</span>
                      {selectedOrder.discount_codes && selectedOrder.discount_codes.length > 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                          Cupón: {selectedOrder.discount_codes.map((d: any) => d.code).join(', ')}
                        </span>
                      )}
                    </span>
                    <span>-${selectedOrder.total_discounts?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
                {selectedOrder.shipping_lines?.map((sl: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    <span>Envío ({sl.title})</span>
                    <span>${sl.price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
                {selectedOrder.total_tax > 0 && (
                  <div className="flex items-center justify-between text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    <span>Impuestos</span>
                    <span>${selectedOrder.total_tax?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[15px] font-bold text-zinc-900 dark:text-white pt-2 border-t border-dashed border-zinc-100 dark:border-zinc-800">
                  <span>Total Facturado</span>
                  <span className="text-[18px] text-pink-600 dark:text-pink-400 font-black">
                    ${selectedOrder.total_price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

            </div>

          </div>
        </>,
        document.body
      )}
    </div>
    </CenteredPageLoader>
  );
}
