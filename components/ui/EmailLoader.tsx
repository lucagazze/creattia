import React, { useEffect, useState, useRef } from 'react';

interface Props {
  loading: boolean;
  color?: string;
  labels?: string[];
  duration?: number;
  children?: React.ReactNode;
}

/**
 * Inline progress bar that matches the exact footprint of the metric cards row.
 * No layout shift: same height and border-radius as the cards.
 */
export default function EmailLoader({ loading, color = '#10b981', labels = ['Entregas', 'Tasa de Apertura', 'Tasa de Clics', 'Ingresos Email'], duration = 500, children }: Props) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(loading);
  const animationRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const loadingRef = useRef(loading);

  useEffect(() => {
    loadingRef.current = loading;
    if (loading) {
      setVisible(true);
    }
  }, [loading]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loading) {
      setProgress(0);

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      const startTime = Date.now();
      let phase = 'loading'; // 'loading' | 'finishing'
      let finishStartTime = 0;
      let startProgress = 0;
      let currentProgress = 0;

      const tick = () => {
        if (!mountedRef.current) return;

        if (phase === 'loading') {
          const elapsed = Date.now() - startTime;
          if (elapsed <= duration) {
            currentProgress = (elapsed / duration) * 75;
            setProgress(currentProgress);
          } else {
            if (!loadingRef.current) {
              phase = 'finishing';
              finishStartTime = Date.now();
              startProgress = currentProgress;
            } else {
              const slowElapsed = elapsed - duration;
              currentProgress = 75 + (1 - Math.exp(-slowElapsed / 8000)) * (98 - 75);
              setProgress(currentProgress);
            }
          }
          animationRef.current = requestAnimationFrame(tick);
        } else if (phase === 'finishing') {
          const elapsed = Date.now() - finishStartTime;
          if (elapsed <= 200) {
            setProgress(startProgress + (elapsed / 200) * (100 - startProgress));
            animationRef.current = requestAnimationFrame(tick);
          } else {
            setProgress(100);
            setTimeout(() => {
              if (mountedRef.current) setVisible(false);
            }, 250);
          }
        }
      };

      animationRef.current = requestAnimationFrame(tick);
    }
  }, [loading, duration]);

  if (!visible) return <>{children}</>;

  return (
    <div className="bg-white dark:bg-[#111113] rounded-[16px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden">
      {/* Same height as the metric cards */}
      <div className="grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto overflow-hidden scrollbar-hide">
        {labels.map((label, i) => (
          <div
            key={label}
            className="flex flex-col flex-1 px-4 py-4 sm:px-6 sm:py-5 border-b border-r border-zinc-100 dark:border-zinc-800/60 [&:nth-child(odd)]:border-r [&:nth-child(even)]:border-r-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(even)]:border-r sm:[&:nth-child(3n)]:border-r-0 xl:border-b-0 xl:border-r xl:last:border-r-0"
          >
            {/* Icon + label row */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-4 h-4 rounded-md shimmer-bg relative overflow-hidden"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div 
                  className="absolute inset-0 opacity-20" 
                  style={{ backgroundColor: color }} 
                />
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest truncate">
                {label}
              </span>
            </div>
            {/* Value placeholder */}
            <div
              className="h-6 rounded-md mb-2 shimmer-bg relative overflow-hidden"
              style={{
                width: `${60 + i * 8}%`,
                animationDelay: `${i * 120 + 40}ms`,
              }}
            >
              <div 
                className="absolute inset-0 opacity-15" 
                style={{ backgroundColor: color }} 
              />
            </div>
            {/* Change placeholder */}
            <div
              className="h-2.5 w-12 rounded-full shimmer-bg"
              style={{ animationDelay: `${i * 120 + 80}ms` }}
            />
          </div>
        ))}
      </div>

      {/* Progress bar — thin strip at the bottom, no extra height */}
      <div className="h-0.5 bg-zinc-100 dark:bg-zinc-800/60 relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${color}66, ${color})`,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </div>
    </div>
  );
}
