import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

function formatTitle(file: string) {
  return file
    .replace('.html', '')
    .replace(/_/g, ' ')
    .replace(/\b(\w)/g, c => c.toUpperCase());
}

export default function EmailPreviewPublicPage() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const file = params.get('email') ?? '';
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const label = file ? formatTitle(file) : 'Email Preview';

  useEffect(() => {
    document.title = file ? `${label} — Algoritmia` : 'Email Preview — Algoritmia';
  }, [file, label]);

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
    <div className="min-h-screen flex flex-col" style={{ background: mode === 'desktop' ? '#d5d5d5' : '#1a1a1a' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-zinc-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-black">A</span>
          </div>
          <span className="text-[13px] font-bold text-zinc-800 tracking-tight truncate max-w-[280px]">
            {label}
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

        {mode === 'desktop' ? (
          /* ── DESKTOP: email client simulation ── */
          <div style={{ width: '100%', maxWidth: 660 }}>
            {/* Fake email client chrome */}
            <div style={{
              background: '#f3f3f3',
              borderRadius: '8px 8px 0 0',
              border: '1px solid #d0d0d0',
              borderBottom: 'none',
              padding: '10px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
              </div>
              <div style={{ fontSize: 11, color: '#666', fontFamily: 'Arial, sans-serif' }}>
                <span style={{ fontWeight: 700, color: '#333' }}>De:</span> valentina@theskirtingfactoryllc.com
              </div>
              <div style={{ fontSize: 11, color: '#666', fontFamily: 'Arial, sans-serif', marginTop: 2 }}>
                <span style={{ fontWeight: 700, color: '#333' }}>Asunto:</span> {label}
              </div>
            </div>
            {/* Email iframe */}
            <div style={{ background: '#fff', border: '1px solid #d0d0d0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              <iframe
                ref={iframeRef}
                src={`/email-library/${file}`}
                onLoad={injectBase}
                scrolling="no"
                style={{ width: '100%', height: 2000, border: 'none', display: 'block' }}
              />
            </div>
          </div>
        ) : (
          /* ── MOBILE: phone frame ── */
          <div style={{ width: 375, borderRadius: 40, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', border: '6px solid #2a2a2a' }}>
            {/* Notch */}
            <div style={{ height: 32, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 64, height: 6, background: '#333', borderRadius: 4 }} />
            </div>
            {/* Screen */}
            <div style={{ background: '#fff', overflow: 'hidden' }}>
              <iframe
                ref={iframeRef}
                src={`/email-library/${file}`}
                onLoad={injectBase}
                style={{ width: 375, height: 750, border: 'none', display: 'block' }}
              />
            </div>
            {/* Home bar */}
            <div style={{ height: 24, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 80, height: 4, background: '#444', borderRadius: 4 }} />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 py-3 text-center">
        <p style={{ fontSize: 11, color: mode === 'desktop' ? '#999' : '#555', fontFamily: 'Arial, sans-serif' }}>
          Powered by <span style={{ fontWeight: 700 }}>Algoritmia</span>
        </p>
      </div>
    </div>
  );
}
