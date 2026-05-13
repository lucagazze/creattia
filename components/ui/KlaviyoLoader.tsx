import React, { useEffect, useState, useRef } from 'react';

interface Props {
  loading: boolean;
  color?: string;
  labels?: string[];
  children?: React.ReactNode;
}

/**
 * Inline progress bar that matches the exact footprint of the metric cards row.
 * No layout shift: same height and border-radius as the cards.
 */
export default function KlaviyoLoader({ loading, color = '#10b981', labels = ['Entregas', 'Tasa de Apertura', 'Tasa de Clics', 'Ingresos Klaviyo'], children }: Props) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);
  const intervalRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      setProgress(0);
    }
  }, [loading]);

  // Fill to ~88% while loading
  useEffect(() => {
    if (!visible || !loading) return;
    intervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      setProgress(prev => {
        const remaining = 88 - prev;
        const step = Math.max(0.4, remaining * 0.07);
        return prev >= 88 ? 88 : prev + step;
      });
    }, 80);
    return () => clearInterval(intervalRef.current);
  }, [visible, loading]);

  // When loading finishes, rush to 100% then hide
  useEffect(() => {
    if (!loading && visible) {
      clearInterval(intervalRef.current);
      let p = progress;
      const rush = setInterval(() => {
        if (!mountedRef.current) { clearInterval(rush); return; }
        p += 5;
        setProgress(Math.min(p, 100));
        if (p >= 100) {
          clearInterval(rush);
          setTimeout(() => { if (mountedRef.current) setVisible(false); }, 250);
        }
      }, 16);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visible]);

  if (!visible) return <>{children}</>;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Same height as the metric cards */}
      <div className="grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
        {labels.map((label, i) => (
          <div
            key={label}
            className="flex flex-col flex-1 px-4 py-4 sm:px-6 sm:py-5 border-b border-r border-zinc-100 dark:border-zinc-800 [&:nth-child(odd)]:border-r [&:nth-child(even)]:border-r-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(even)]:border-r sm:[&:nth-child(3n)]:border-r-0 xl:border-b-0 xl:border-r xl:last:border-r-0"
          >
            {/* Icon + label row */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-4 h-4 rounded-md animate-pulse"
                style={{ background: `${color}30` }}
              />
              <span className="text-[10px] sm:text-[11px] font-bold text-zinc-300 dark:text-zinc-600 uppercase tracking-widest">
                {label}
              </span>
            </div>
            {/* Value placeholder */}
            <div
              className="h-6 rounded-md mb-2 animate-pulse"
              style={{
                width: `${60 + i * 8}%`,
                background: `${color}20`,
                animationDelay: `${i * 120}ms`,
              }}
            />
            {/* Change placeholder */}
            <div
              className="h-2.5 w-12 rounded-full animate-pulse bg-zinc-100 dark:bg-zinc-800"
              style={{ animationDelay: `${i * 120 + 60}ms` }}
            />
          </div>
        ))}
      </div>

      {/* Progress bar — thin strip at the bottom, no extra height */}
      <div className="h-0.5 bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-all"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${color}66, ${color})`,
            boxShadow: `0 0 6px ${color}`,
            transition: loading ? 'width 0.15s ease-out' : 'width 0.06s linear',
          }}
        />
      </div>
    </div>
  );
}
