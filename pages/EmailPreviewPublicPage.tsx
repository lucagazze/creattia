import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

export default function EmailPreviewPublicPage() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const file = params.get('email') ?? '';
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const injectBase = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.head && !doc.head.querySelector('base')) {
        const base = doc.createElement('base');
        base.target = '_blank';
        doc.head.insertBefore(base, doc.head.firstChild);
      }
    } catch {}
  };

  if (!file) return (
    <div className="h-screen flex items-center justify-center bg-zinc-100 text-zinc-500 text-sm">
      Email no especificado.
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#e8e8e8' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-zinc-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-black">A</span>
          </div>
          <span className="text-[13px] font-bold text-zinc-800 tracking-tight">
            Email Preview
          </span>
          <span className="text-[11px] text-zinc-400 hidden sm:block">·</span>
          <span className="text-[11px] text-zinc-400 hidden sm:block truncate max-w-[260px]">
            {file.replace('.html', '').replace(/_/g, ' ')}
          </span>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
          <button
            onClick={() => setMode('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
              mode === 'desktop'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Desktop</span>
          </button>
          <button
            onClick={() => setMode('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
              mode === 'mobile'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobile</span>
          </button>
        </div>
      </div>

      {/* Email container */}
      <div className="flex-1 flex items-start justify-center py-8 px-4">
        <div
          className="bg-white shadow-xl transition-all duration-300"
          style={mode === 'desktop'
            ? { width: '100%', maxWidth: 680 }
            : { width: 375, borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }
          }
        >
          {/* Mobile notch simulation */}
          {mode === 'mobile' && (
            <div className="h-8 bg-zinc-900 flex items-center justify-center">
              <div className="w-16 h-1.5 bg-zinc-600 rounded-full" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={`/email-library/${file}`}
            onLoad={injectBase}
            style={{
              width: '100%',
              height: mode === 'desktop' ? 900 : 700,
              border: 'none',
              display: 'block',
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 py-3 text-center">
        <p className="text-[11px] text-zinc-400">Powered by <span className="font-bold text-zinc-500">Algoritmia</span></p>
      </div>
    </div>
  );
}
