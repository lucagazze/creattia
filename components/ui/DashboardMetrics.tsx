import React, { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, ChevronDown } from "lucide-react";

const BLUE = "#3b82f6";
const GREEN = "#10b981";
const RED = "#ef4444";

export const DashboardMetric = ({
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
}: any) => {
  // Convert hex color to bg- classes by mapping. Since Tailwind classes need to be static, 
  // we'll apply inline styles for the dynamic bg color with opacity if active.
  const isBlue = color === BLUE || color === '#3b82f6';
  const isGreen = color === GREEN || color === '#10b981';
  const isPink = color === '#ec4899';
  
  let activeBgClass = "bg-blue-50/60 dark:bg-blue-500/5";
  let pulseClass = "bg-blue-500";
  if (isGreen) { activeBgClass = "bg-emerald-50/60 dark:bg-emerald-500/5"; pulseClass = "bg-emerald-500"; }
  if (isPink) { activeBgClass = "bg-pink-50/60 dark:bg-pink-500/5"; pulseClass = "bg-pink-500"; }

  return (
    <button
      onClick={onClick}
      className={`flex flex-col flex-1 min-w-0 px-4 py-4 sm:px-6 sm:py-5
        border-b border-r border-zinc-100 dark:border-zinc-800
        [&:nth-child(odd)]:border-r [&:nth-child(even)]:border-r-0
        sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(even)]:border-r
        sm:[&:nth-child(3n)]:border-r-0
        xl:border-b-0 xl:border-r xl:last:border-r-0
        transition-all text-left group relative
        ${active ? activeBgClass : "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 hover:shadow-[inset_0_0_20px_rgba(0,0,0,0.02)] dark:hover:shadow-none"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" style={{ color }} />}
          <span className="text-[10px] sm:text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
            {label}
          </span>
        </div>
        <ChevronDown
          className={`w-3 h-3 text-zinc-300 dark:text-zinc-600 transition-transform duration-200 ${active ? 'rotate-180 opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col shrink-0">
          <span className="text-[17px] sm:text-[20px] font-bold text-zinc-900 dark:text-white leading-none mb-2">
            {loading ? "..." : value}
          </span>
          {!loading && change !== undefined && !isNaN(change) && (
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
      </div>
    </button>
  );
};

export const MetricDetailChart = ({ label, data = [], prevData = [], color }: any) => {
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

  const trend = prevAvg > 0 ? ((avg - prevAvg) / prevAvg) * 100 : 0;
  const chartColor = color;
  const gradientId = `grad-${label.replace(/\s+/g, "-")}`;

  const isPercentLabel = label.toLowerCase().includes("tasa") || label.toLowerCase().includes("conversión");
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
    <div className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] p-8 shadow-sm mt-4">
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
              tickFormatter={(d) => d?.split("-").slice(1).reverse().join("/") || ''}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, maxVal > 0 ? maxVal * 1.2 : "auto"]}
              ticks={
                maxVal > 0
                  ? [
                      0,
                      Math.round(avg),
                      Math.round(prevAvg),
                      Math.round(maxVal),
                    ]
                      .filter((v) => v >= 0)
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
                    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 rounded-xl shadow-xl min-w-[140px]">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">
                        {curr?.payload?.date?.split("-").reverse().join("/")}
                      </p>
                      {curr && (
                        <div className="flex items-center justify-between gap-4 mb-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: chartColor }}
                            />
                            <span className="text-[11px] font-medium text-zinc-500">
                              Actual
                            </span>
                          </div>
                          <span className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100">
                            {fmtVal(curr.value)}
                          </span>
                        </div>
                      )}
                      {prev && prev.value !== null && (
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                            <span className="text-[11px] font-medium text-zinc-500">
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
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
