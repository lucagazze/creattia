import React, { useState } from 'react';

interface Props {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  fallbackIcon?: React.ReactNode;
}

export default function SmoothImage({ src, alt = '', className = '', containerClassName = '', fallbackIcon }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {/* Shimmer Placeholder */}
      {!loaded && !error && (
        <div className="absolute inset-0 shimmer-bg" />
      )}

      {/* Fallback Icon on Error */}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
          {fallbackIcon || (
            <svg className="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          referrerPolicy="no-referrer"
          className={`w-full h-full ${className.includes('object-') ? '' : 'object-cover'} transition-opacity duration-300 ease-out ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
        />
      )}
    </div>
  );
}
