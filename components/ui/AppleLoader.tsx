import React from 'react';

interface Props {
  variant?: 'page' | 'metrics' | 'table' | 'chat' | 'inline';
  count?: number;
  labels?: string[];
  title?: string;
  loading?: boolean;
  children?: React.ReactNode;
}

export const AppleLoader: React.FC<Props> = ({
  variant = 'page',
  count,
  labels,
  title,
  loading = true,
  children
}) => {
  if (!loading && children) {
    return <>{children}</>;
  }

  // Common card styling matching Apple aesthetics
  const cardClass = "bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] p-6";

  if (variant === 'page') {
    return (
      <div className="w-full space-y-6 sm:space-y-8 animate-in fade-in duration-400">
        {/* Header Skeleton */}
        <div className="space-y-3">
          <div className="h-8 w-48 shimmer-bg rounded-xl" />
          <div className="h-4 w-72 shimmer-bg rounded-lg opacity-60" />
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={`${cardClass} h-[116px] flex flex-col justify-between`}>
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl shimmer-bg" />
                <div className="w-12 h-4 rounded-full shimmer-bg opacity-70" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-16 shimmer-bg rounded" />
                <div className="h-6 w-28 shimmer-bg rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Skeleton */}
        <div className={`${cardClass} h-[380px] flex flex-col justify-between`}>
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/50 pb-4">
            <div className="h-5 w-44 shimmer-bg rounded-lg" />
            <div className="flex gap-2">
              <div className="h-8 w-16 shimmer-bg rounded-lg" />
              <div className="h-8 w-20 shimmer-bg rounded-lg" />
            </div>
          </div>
          <div className="flex-grow flex items-end gap-3 pt-6 pb-2">
            {/* Chart Bars Shimmer */}
            {[50, 80, 45, 90, 60, 75, 40, 85, 55, 95, 70, 65].map((h, i) => (
              <div
                key={i}
                className="flex-1 shimmer-bg rounded-t-xl"
                style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'metrics') {
    const list = labels || Array.from({ length: count || 3 }, (_, i) => `Métrica ${i + 1}`);
    return (
      <div className="w-full bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden animate-in fade-in duration-300">
        <div className="grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide divide-x divide-zinc-100 dark:divide-zinc-800/60">
          {list.map((label, i) => (
            <div
              key={i}
              className="flex flex-col flex-1 p-5 min-w-[150px] space-y-4"
            >
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-md shimmer-bg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest truncate">
                  {label}
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-6 w-24 shimmer-bg rounded-lg" style={{ animationDelay: `${i * 100 + 50}ms` }} />
                <div className="h-3 w-12 shimmer-bg rounded-full opacity-60" style={{ animationDelay: `${i * 100 + 100}ms` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'table') {
    const rows = count || 5;
    return (
      <div className="w-full space-y-3 animate-in fade-in duration-300">
        {/* Table Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-150 dark:border-zinc-800/40 rounded-xl">
          <div className="h-3.5 w-24 shimmer-bg rounded" />
          <div className="h-3.5 w-16 shimmer-bg rounded" />
          <div className="h-3.5 w-20 shimmer-bg rounded" />
        </div>
        {/* Rows */}
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between px-4 py-4 bg-white dark:bg-[#111113] border border-black/[0.04] dark:border-white/[0.04] rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg shimmer-bg" style={{ animationDelay: `${idx * 80}ms` }} />
                <div className="space-y-1.5">
                  <div className="h-3 w-28 shimmer-bg rounded" style={{ animationDelay: `${idx * 80 + 30}ms` }} />
                  <div className="h-2 w-16 shimmer-bg rounded opacity-60" style={{ animationDelay: `${idx * 80 + 60}ms` }} />
                </div>
              </div>
              <div className="h-3 w-14 shimmer-bg rounded" style={{ animationDelay: `${idx * 80 + 40}ms` }} />
              <div className="h-3 w-16 shimmer-bg rounded" style={{ animationDelay: `${idx * 80 + 80}ms` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'chat') {
    return (
      <div className="flex h-full w-full min-h-[400px] border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] overflow-hidden bg-white dark:bg-[#111113] animate-in fade-in duration-300">
        {/* Sidebar chats list */}
        <div className="w-80 border-r border-zinc-100 dark:border-zinc-800/50 p-4 space-y-4 hidden md:block">
          <div className="h-8 w-24 shimmer-bg rounded-lg" />
          <div className="h-10 w-full shimmer-bg rounded-xl" />
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n} className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full shimmer-bg" style={{ animationDelay: `${n * 100}ms` }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 shimmer-bg rounded" style={{ animationDelay: `${n * 100 + 30}ms` }} />
                  <div className="h-2.5 w-40 shimmer-bg rounded opacity-60" style={{ animationDelay: `${n * 100 + 60}ms` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Main conversation panel */}
        <div className="flex-grow flex flex-col justify-between p-6 bg-zinc-50/30 dark:bg-black/10">
          <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800/50 pb-4">
            <div className="w-10 h-10 rounded-full shimmer-bg" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-32 shimmer-bg rounded" />
              <div className="h-2.5 w-16 shimmer-bg rounded opacity-60" />
            </div>
          </div>
          {/* Chat bubbles */}
          <div className="flex-grow py-6 space-y-4 overflow-y-auto">
            <div className="flex justify-start">
              <div className="h-10 w-48 shimmer-bg rounded-2xl rounded-tl-none" />
            </div>
            <div className="flex justify-end">
              <div className="h-14 w-64 shimmer-bg rounded-2xl rounded-tr-none" style={{ animationDelay: '150ms' }} />
            </div>
            <div className="flex justify-start">
              <div className="h-10 w-32 shimmer-bg rounded-2xl rounded-tl-none" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
          {/* Input block */}
          <div className="h-12 w-full shimmer-bg rounded-2xl" />
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-3 animate-in fade-in duration-300">
        <div className="relative flex items-center justify-center">
          {/* Circular activity indicator ticks */}
          <svg className="w-7 h-7 text-zinc-400 dark:text-zinc-600 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        {title && (
          <p className="text-[12px] font-semibold text-zinc-400 dark:text-zinc-500 animate-pulse">
            {title}
          </p>
        )}
      </div>
    );
  }

  return null;
};
