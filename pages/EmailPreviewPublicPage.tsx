import React, { useEffect, useRef, useState } from 'react';

function formatTitle(file: string) {
  return file.replace('.html', '').replace(/_/g, ' ').replace(/\b(\w)/g, c => c.toUpperCase());
}

// SVG icons (no lucide dependency on public page)
const IconMonitor = () => (
  <svg width="13" height="12" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="1" y="1" width="22" height="14" rx="2"/><line x1="8" y1="19" x2="16" y2="19"/><line x1="12" y1="15" x2="12" y2="19"/>
  </svg>
);
const IconPhone = () => (
  <svg width="10" height="13" viewBox="0 0 16 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="1" y="1" width="14" height="22" rx="3"/><circle cx="8" cy="18" r="1" fill="currentColor"/>
  </svg>
);

export default function EmailPreviewPublicPage() {
  const params    = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const file      = params.get('email') ?? '';
  const subject   = params.get('subject') ?? '';
  const [mode, setMode]                 = useState<'desktop' | 'mobile'>('desktop');
  const [preheader, setPreheader]       = useState('');
  const [iframeHeight, setIframeHeight] = useState(3000);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const label       = file ? formatTitle(file) : 'Email Preview';
  const subjectLine = subject || label;

  useEffect(() => {
    document.title = file ? `${subjectLine} — Algoritmia` : 'Email Preview — Algoritmia';
  }, [file, subjectLine]);

  useEffect(() => { setIframeHeight(3000); setPreheader(''); }, [mode]);

  const injectAndExtract = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      if (doc.head && !doc.head.querySelector('base')) {
        const base = doc.createElement('base');
        base.target = '_blank';
        doc.head.insertBefore(base, doc.head.firstChild);
      }
      const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 0;
      if (h > 200) setIframeHeight(h + 40);
      const hidden = doc.querySelector<HTMLElement>(
        '[style*="display:none"],[style*="display: none"],[class*="preheader"],[class*="preview"]'
      );
      if (hidden?.textContent?.trim()) { setPreheader(hidden.textContent.trim().slice(0, 100)); return; }
      const first = doc.querySelector('p, td');
      if (first?.textContent?.trim()) setPreheader(first.textContent.trim().slice(0, 100));
    } catch {}
  };

  if (!file) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#71717a', fontFamily: 'Arial', fontSize: 14 }}>
      Email no especificado.
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: mode === 'desktop' ? '#d0d0d0' : '#e8e8e8' }}>

      {/* ── DARK TOOLBAR — mismo estilo que el admin preview ── */}
      <div style={{
        flexShrink: 0, background: '#09090b', borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* Logo + subject */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: 8, fontWeight: 900, fontFamily: 'Arial' }}>A</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'Arial', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subjectLine}
            </span>
          </div>
        </div>

        {/* PC / Celular toggle — mismo estilo dark que el admin */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3, flexShrink: 0 }}>
          {(['desktop', 'mobile'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: 'Arial', transition: 'all 0.15s',
                background: mode === m ? '#7c3aed' : 'transparent',
                color: mode === m ? '#fff' : '#71717a',
                boxShadow: mode === m ? '0 1px 4px rgba(124,58,237,0.4)' : 'none',
              }}
            >
              {m === 'desktop' ? <IconMonitor /> : <IconPhone />}
              {m === 'desktop' ? 'PC' : 'Celular'}
            </button>
          ))}
        </div>
      </div>

      {/* ── CHROME + EMAIL — mismo contenedor, mismo ancho ── */}
      <div style={{ flex: 1, maxWidth: mode === 'desktop' ? 660 : 430, width: '100%', margin: '20px auto 0', padding: '0 12px 40px' }}>

        {/* Chrome card */}
        <div style={{
          background: '#fff',
          borderRadius: mode === 'desktop' ? '10px 10px 0 0' : 12,
          border: '1px solid #d0d0d0',
          borderBottom: mode === 'desktop' ? 'none' : '1px solid #d0d0d0',
          padding: '12px 16px',
          marginBottom: mode === 'desktop' ? 0 : 12,
        }}>
          {mode === 'desktop' && (
            <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
            </div>
          )}
          {mode === 'mobile' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#c9a96e', fontSize: 10, fontWeight: 700, fontFamily: 'Arial' }}>TSF</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', fontFamily: 'Arial' }}>The Skirting Factory</div>
                <div style={{ fontSize: 10, color: '#888', fontFamily: 'Arial' }}>valentina@theskirtingfactoryllc.com</div>
              </div>
            </div>
          )}
          <div style={{ fontSize: mode === 'desktop' ? 11 : 12, fontFamily: 'Arial, sans-serif', lineHeight: 1.8 }}>
            {mode === 'desktop' && (
              <div>
                <span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 82 }}>De:</span>
                <span style={{ color: '#1a73e8' }}>valentina@theskirtingfactoryllc.com</span>
              </div>
            )}
            <div>
              <span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 82 }}>Asunto:</span>
              <span style={{ color: '#111', fontWeight: mode === 'mobile' ? 600 : 400 }}>{subjectLine}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 82 }}>Vista Previa:</span>
              <span style={{ color: '#888', fontStyle: preheader ? 'normal' : 'italic' }}>
                {preheader || 'Cargando…'}
              </span>
            </div>
          </div>
        </div>

        {/* Email body */}
        <div style={mode === 'desktop'
          ? { background: '#fff', border: '1px solid #d0d0d0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }
          : { background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #d0d0d0', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }
        }>
          <iframe
            key={mode}
            ref={iframeRef}
            src={`/email-library/${file}`}
            onLoad={injectAndExtract}
            scrolling="no"
            style={{ width: '100%', height: iframeHeight, border: 'none', display: 'block' }}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, paddingBottom: 16, textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#71717a', fontFamily: 'Arial' }}>
          Powered by <strong style={{ color: '#a1a1aa' }}>Algoritmia</strong>
        </p>
      </div>
    </div>
  );
}
