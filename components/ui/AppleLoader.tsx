import React from 'react';
import { TopLoadingBar } from './TopLoadingBar';

interface Props {
  variant?: 'page' | 'metrics' | 'table' | 'chat' | 'inline';
  count?: number;
  labels?: string[];
  title?: string;
  loading?: boolean;
  children?: React.ReactNode;
}

// Static placeholder — no shimmer, no animation
const Box = ({ className = '' }: { className?: string }) => (
  <div className={`bg-zinc-100 dark:bg-zinc-800/70 rounded-xl ${className}`} />
);

export const AppleLoader: React.FC<Props> = ({
  variant = 'page',
  count,
  labels,
  title,
  loading = true,
  children
}) => {
  if (!loading && children) return <>{children}</>;

  const cardClass = "bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] p-6";

  if (variant === 'page') {
    return (
      <div className="w-full space-y-6 sm:space-y-8 relative">
        <TopLoadingBar loading={true} />

        {/* Header */}
        <div className="space-y-2.5 pt-1">
          <Box className="h-8 w-52" />
          <Box className="h-4 w-72 opacity-60" />
        </div>

        {/* 4 metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={`${cardClass} h-[110px] flex flex-col justify-between`}>
              <Box className="h-4 w-20" />
              <Box className="h-7 w-28" />
            </div>
          ))}
        </div>

        {/* Main chart area */}
        <div className={`${cardClass} h-[340px]`} />
      </div>
    );
  }

  if (variant === 'metrics') {
    const list = labels || Array.from({ length: count || 3 }, (_, i) => `Métrica ${i + 1}`);
    return (
      <div className="w-full bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] overflow-hidden">
        <div className="grid grid-cols-2 lg:flex lg:flex-nowrap divide-x divide-zinc-100 dark:divide-zinc-800/60">
          {list.map((label, i) => (
            <div key={i} className="flex flex-col flex-1 p-5 min-w-[150px] space-y-3">
              <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest truncate">
                {label}
              </span>
              <Box className="h-6 w-24" />
              <Box className="h-3 w-12 opacity-60" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'table') {
    const rows = count || 5;
    return (
      <div className="w-full space-y-2">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between px-4 py-4 bg-white dark:bg-[#111113] border border-black/[0.04] dark:border-white/[0.04] rounded-xl"
          >
            <div className="flex items-center gap-3">
              <Box className="w-8 h-8 rounded-full" />
              <div className="space-y-1.5">
                <Box className="h-3 w-28" />
                <Box className="h-2 w-16 opacity-60" />
              </div>
            </div>
            <Box className="h-3 w-14" />
            <Box className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chat') {
    return (
      <div className="flex h-full w-full min-h-[400px] border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] overflow-hidden bg-white dark:bg-[#111113]">
        <div className="w-80 border-r border-zinc-100 dark:border-zinc-800/50 p-4 space-y-4 hidden md:block">
          <Box className="h-8 w-24" />
          <Box className="h-10 w-full rounded-xl" />
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n} className="flex gap-3 items-center">
                <Box className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Box className="h-3 w-24" />
                  <Box className="h-2.5 w-36 opacity-60" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-grow flex flex-col p-6 gap-4">
          <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800/50 pb-4">
            <Box className="w-10 h-10 rounded-full" />
            <div className="space-y-1.5">
              <Box className="h-3.5 w-32" />
              <Box className="h-2.5 w-16 opacity-60" />
            </div>
          </div>
          <div className="flex-1" />
          <Box className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-2">
        <svg className="w-6 h-6 text-zinc-300 dark:text-zinc-600 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        {title && (
          <p className="text-[12px] font-semibold text-zinc-400 dark:text-zinc-500">{title}</p>
        )}
      </div>
    );
  }

  return null;
};
