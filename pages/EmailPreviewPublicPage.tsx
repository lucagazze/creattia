import React, { useEffect, useRef, useState } from 'react';

function formatTitle(file: string) {
  return file.replace('.html', '').replace(/_/g, ' ').replace(/\b(\w)/g, c => c.toUpperCase());
}

export default function EmailPreviewPublicPage() {
  const params      = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const file        = params.get('email') ?? '';
  const subject     = params.get('subject') ?? '';
  const [mode, setMode]               = useState<'desktop' | 'mobile'>('desktop');
  const [preheader, setPreheader]     = useState('');
  const [iframeHeight, setIframeHeight] = useState(3000);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const label       = file ? formatTitle(file) : 'Email Preview';
  const subjectLine = subject || label;

  useEffect(() => {
    document.title = file ? `${subjectLine} — Algoritmia` : 'Email Preview — Algoritmia';
  }, [file, subjectLine]);

  // Reset height when switching modes so iframe re-measures
  useEffect(() => { setIframeHeight(3000); }, [mode]);

  const injectAndExtract = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      if (doc.head && !doc.head.querySelector('base')) {
        const base = doc.createElement('base');
        base.target = '_blank';
        doc.head.insertBefore(base, doc.head.firstChild);
      }
      // Auto-resize to full email height
      const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 0;
      if (h > 200) setIframeHeight(h + 40);

      // Extract preheader
      const hidden = doc.querySelector<HTMLElement>(
        '[style*="display:none"],[style*="display: none"],[class*="preheader"],[class*="preview"]'
      );
      if (hidden?.textContent?.trim()) { setPreheader(hidden.textContent.trim().slice(0, 100)); return; }
      const first = doc.querySelector('p, td');
      if (first?.textContent?.trim()) setPreheader(first.textContent.trim().slice(0, 100));
    } catch {}
  };

  if (!file) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', color: '#888', fontFamily: 'Arial', fontSize: 14 }}>
      Email no especificado.
    </div>
  );

  const BG = mode === 'desktop' ? '#d0d0d0' : '#e8e8e8';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: BG }}>

      {/* ── TOP BAR ── */}
      <div style={{
        flexShrink: 0, background: '#fff', borderBottom: '1px solid #e0e0e0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', gap: 10, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#fff', fontSize: 9, fontWeight: 900, fontFamily: 'Arial' }}>A</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#222', fontFamily: 'Arial', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subjectLine}
          </span>
        </div>

        <div style={{ display: 'flex', background: '#f0f0f0', borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
          {(['desktop', 'mobile'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              minWidth: 80, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'Arial', transition: 'all 0.15s',
              background: mode === m ? '#fff' : 'transparent',
              color: mode === m ? '#111' : '#999',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.14)' : 'none',
            }}>
              {m === 'desktop'
                ? <svg width="14" height="12" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="1" width="22" height="14" rx="2"/><line x1="8" y1="19" x2="16" y2="19"/><line x1="12" y1="15" x2="12" y2="19"/></svg>
                : <svg width="10" height="13" viewBox="0 0 16 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="1" width="14" height="22" rx="3"/><circle cx="8" cy="18" r="1" fill="currentColor"/></svg>
              }
              {m === 'desktop' ? 'PC' : 'Celular'}
            </button>
          ))}
        </div>
      </div>

      {/* ── EMAIL CHROME ── */}
      <div style={{ flexShrink: 0, maxWidth: mode === 'desktop' ? 660 : 430, width: '100%', margin: '20px auto 0', padding: '0 12px' }}>
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
      </div>

      {/* ── EMAIL BODY ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 12px 40px' }}>
        {mode === 'desktop' ? (
          <div style={{ width: '100%', maxWidth: 660, background: '#fff', border: '1px solid #d0d0d0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <iframe
              key="desktop"
              ref={iframeRef}
              src={`/email-library/${file}`}
              onLoad={injectAndExtract}
              scrolling="no"
              style={{ width: '100%', height: iframeHeight, border: 'none', display: 'block' }}
            />
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: 430, background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #d0d0d0', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <iframe
              key="mobile"
              ref={iframeRef}
              src={`/email-library/${file}`}
              onLoad={injectAndExtract}
              scrolling="no"
              style={{ width: '100%', height: iframeHeight, border: 'none', display: 'block' }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, paddingBottom: 16, textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#999', fontFamily: 'Arial' }}>
          Powered by <strong>Algoritmia</strong>
        </p>
      </div>
    </div>
  );
}
