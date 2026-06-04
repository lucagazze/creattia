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
export default function EmailLoader({ loading, color = '#10b981', labels = ['Entregas', 'Tasa de Apertura', 'Tasa de Clics', 'Ingresos Email'], children }: Props) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(loading);
  const animationRef = useRef<number | null>(null);
  const finishIntervalRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (finishIntervalRef.current) clearInterval(finishIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      setProgress(0);

      if (finishIntervalRef.current) {
        clearInterval(finishIntervalRef.current);
        finishIntervalRef.current = null;
      }

      const startTime = Date.now();
      const tick = () => {
        if (!mountedRef.current) return;
        const elapsed = Date.now() - startTime;
        if (elapsed <= 700) {
          setProgress((elapsed / 700) * 75);
        } else {
          const slowElapsed = elapsed - 700;
          const slowProgress = 75 + (1 - Math.exp(-slowElapsed / 8000)) * (98 - 75);
          setProgress(slowProgress);
        }
        animationRef.current = requestAnimationFrame(tick);
      };
      animationRef.current = requestAnimationFrame(tick);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      };
    }
  }, [loading]);

  useEffect(() => {
    if (!loading && visible) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      let current = progress;
      finishIntervalRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        current += 5;
        if (current >= 100) {
          setProgress(100);
          clearInterval(finishIntervalRef.current);
          finishIntervalRef.current = null;
          setTimeout(() => {
            if (mountedRef.current) setVisible(false);
          }, 250);
        } else {
          setProgress(current);
        }
      }, 16);

      return () => {
        if (finishIntervalRef.current) {
          clearInterval(finishIntervalRef.current);
        }
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visible]);

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
          className="absolute inset-y-0 left-0 transition-all"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${color}66, ${color})`,
            boxShadow: `0 0 6px ${color}`,
            transition: progress === 0 ? 'none' : loading ? 'width 0.15s ease-out' : 'width 0.06s linear',
          }}
        />
      </div>
    </div>
  );
}
