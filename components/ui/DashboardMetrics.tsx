import React, { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, ChevronDown, Info } from "lucide-react";

const BLUE = "#3b82f6";
const GREEN = "#10b981";
const RED = "#ef4444";

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

const DashboardMetricComponent = ({
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
}: any) => {
  // Use inline style for active bg — works for any color without Tailwind static class constraints
  const activeBgStyle = active ? { backgroundColor: `${color}12` } : {};
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
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

  return (
    <button
      onClick={onClick}
      style={activeBgStyle}
      className={`flex flex-col flex-1 min-w-0 px-4 py-4 sm:px-6 sm:py-5
        border-b border-zinc-100 dark:border-zinc-800 border-r-0
        sm:border-r sm:[&:nth-child(odd)]:border-r-zinc-100 sm:[&:nth-child(odd)]:border-r sm:dark:[&:nth-child(odd)]:border-r-zinc-800 sm:[&:nth-child(even)]:border-r-0
        lg:border-b-0 lg:border-r lg:border-r-zinc-100 lg:dark:border-r-zinc-800 lg:last:border-r-0
        transition-all text-left group relative overflow-visible
        ${!active ? "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50" : ""}`}
    >
      <div className="flex items-center justify-between mb-2 w-full">
        <div className="flex items-center gap-2 relative">
          {Icon && <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />}
          <span className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest truncate">
            {label}
          </span>
          {info && (
            <div
              ref={infoRef}
              className="flex-shrink-0"
              onClick={handleInfoClick}
              onMouseEnter={showTip}
              onMouseLeave={hideTip}
            >
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

        <ChevronDown
          className={`w-3 h-3 text-zinc-300 dark:text-zinc-600 transition-transform duration-200 ${active ? 'rotate-180 opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        />
      </div>
      <div className="flex items-end justify-between gap-2 w-full">
        {loading ? (
          <div className="flex flex-col flex-1">
            <div className="h-6 w-24 rounded-lg shimmer-bg mb-2 animate-pulse" />
            <div className="h-4 w-12 rounded-md shimmer-bg animate-pulse" />
          </div>
        ) : (
          <div className="flex flex-col shrink-0">
            <span className="text-[17px] sm:text-[20px] font-bold text-zinc-900 dark:text-white leading-none mb-2">
              {value}
            </span>
            {change !== undefined && !isNaN(change) && (
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
        
        {loading ? (
          <div className="h-8 sm:h-10 flex-1 min-w-0 max-w-[250px] ml-2 sm:ml-6 rounded-lg shimmer-bg opacity-40 animate-pulse" />
        ) : (
          <div className="h-8 sm:h-10 flex-1 min-w-0 max-w-[250px] ml-2 sm:ml-6 opacity-70">
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

export const DashboardMetric = React.memo(DashboardMetricComponent, (prev: any, next: any) => {
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

const MetricDetailChartComponent = ({ label, data = [], prevData = [], color, emptyMessage }: any) => {
  const [hoveredLine, setHoveredLine] = useState<"curr" | "prev" | null>(null);

  const hasData = (data || []).some((d: any) => d.val > 0);

  if (!hasData) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] p-4 sm:p-8 shadow-sm mt-4 flex flex-col items-center justify-center gap-3 h-[160px]">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        </div>
        <p className="text-[13px] font-bold text-zinc-400 text-center">
          {emptyMessage || 'Sin datos suficientes para mostrar la evolución'}
        </p>
        <p className="text-[11px] text-zinc-300 dark:text-zinc-600 text-center max-w-xs">
          Los datos se acumulan con el tiempo. Volvé más tarde para ver la evolución.
        </p>
      </div>
    );
  }

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

  const maxVal = data.length > 0 ? Math.max(...data.map((d: any) => d.val), 0) : 0;
  const minVal = nonZero.length > 0 ? Math.min(...nonZero) : 0;
  const yMin = minVal > 0 ? Math.max(0, minVal * 0.75) : 0;

  const trend = prevAvg > 0 ? ((avg - prevAvg) / prevAvg) * 100 : 0;
  const chartColor = color;
  const gradientId = `grad-${label.replace(/\s+/g, "-")}`;

  const isPercentLabel = label.toLowerCase().includes("tasa") || label.toLowerCase().includes("conversión") || label.toLowerCase().includes("engagement");
  const isMoneyLabel =
    label.toLowerCase().includes("ingreso") ||
    label.toLowerCase().includes("inversión") ||
    label.toLowerCase().includes("retorno") ||
    label.toLowerCase().includes("ticket") ||
    label.toLowerCase().includes("descuentos");
  const isRoasLabel = label.toLowerCase().includes("roas");

  const fmtVal = (v: number) => {
    if (v === null || v === undefined || isNaN(v)) return "0";
    if (isPercentLabel) return `${v.toFixed(2)}%`;
    if (isMoneyLabel)
      return `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`;
    if (isRoasLabel) return `${v.toFixed(2)}x`;
    if (v >= 1000) return (v / 1000).toFixed(1) + "k";
    return v.toFixed(v < 10 ? 2 : 0);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] p-4 sm:p-8 shadow-sm mt-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 sm:mb-8">
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
              className="text-zinc-100/40 dark:text-zinc-800/30"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => d?.split("-").slice(1).reverse().join("/") || ''}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[yMin, maxVal > 0 ? maxVal * 1.1 : "auto"]}
              ticks={
                maxVal > 0
                  ? [...new Set([avg > 0 ? avg : null, maxVal].filter(v => v !== null) as number[])]
                      .sort((a, b) => a - b)
                  : undefined
              }
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v === 0 ? "" : fmtVal(v))}
              width={40}
            />
            <Tooltip
              content={({ active, payload }: any) => {
                if (active && payload && payload.length) {
                  const curr = payload.find((p: any) => p.dataKey === "val");
                  const prev = payload.find((p: any) => p.dataKey === "prevVal");
                  return (
                    <div className="glass-premium dark:bg-zinc-950/80 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-black/[0.06] dark:border-white/[0.06] min-w-[150px] animate-in fade-in duration-200">
                      <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2.5">
                        {curr?.payload?.date?.split("-").reverse().join("/")}
                      </p>
                      {curr && (
                        <div className="flex items-center justify-between gap-4 mb-1.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: chartColor }}
                            />
                            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                              Actual
                            </span>
                          </div>
                          <span className="text-[12px] font-black text-zinc-900 dark:text-white">
                            {fmtVal(curr.value)}
                          </span>
                        </div>
                      )}
                      {prev && prev.value !== null && (
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                              Anterior
                            </span>
                          </div>
                          <span className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400">
                            {fmtVal(prev.value)}
                          </span>
                        </div>
                      )}
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
                strokeOpacity={hoveredLine === "curr" ? 1 : hoveredLine === "prev" ? 0.1 : 0.8}
                strokeWidth={hoveredLine === "curr" ? 4 : 2}
                className="transition-all duration-300"
              />
            )}
            {prevAvg > 0 && (
              <ReferenceLine
                y={prevAvg}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeOpacity={hoveredLine === "prev" ? 1 : hoveredLine === "curr" ? 0.1 : 0.6}
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
              />
            )}
            <Area
              type="monotone"
              dataKey="val"
              stroke={chartColor}
              strokeWidth={3}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              opacity={hoveredLine === "prev" ? 0.2 : 1}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const MetricDetailChart = React.memo(MetricDetailChartComponent, (prev: any, next: any) => {
  return (
    prev.label === next.label &&
    prev.color === next.color &&
    prev.emptyMessage === next.emptyMessage &&
    isArrayOfObjectsEqual(prev.data, next.data) &&
    isArrayOfObjectsEqual(prev.prevData, next.prevData)
  );
});
