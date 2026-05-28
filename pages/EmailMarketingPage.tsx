import React, { useState, useEffect, useRef } from 'react';
import { Monitor, Smartphone, X, Mail, Check, ArrowUpDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { db, EmailAssignment } from '../services/db';

interface EmailEntry {
  file: string;
  client: string;
  angle: string;
  desc: string;
  subject: string;
  klaviyo_subject: string;
}

const STATUS_LABEL: Record<string, string> = {
  active:    'Activo',
  inactive:  'Inactivo',
  scheduled: 'Programado',
};
const STATUS_COLOR: Record<string, string> = {
  active:    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  inactive:  'bg-zinc-200/60 text-zinc-500 dark:bg-white/5 dark:text-zinc-500',
  scheduled: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

// ── Preview overlay ──────────────────────────────────────────────────────────
function PreviewOverlay({ entry, onClose }: { entry: EmailEntry; onClose: () => void }) {
  const [mode, setMode]       = useState<'desktop' | 'mobile'>('desktop');
  const [height, setHeight]   = useState(3000);
  const [preheader, setPreheader] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => { setHeight(3000); setPreheader(''); }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      if (doc.head && !doc.head.querySelector('base')) {
        const base = doc.createElement('base'); base.target = '_blank';
        doc.head.insertBefore(base, doc.head.firstChild);
      }
      const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 0;
      if (h > 200) setHeight(h + 40);
      const hidden = doc.querySelector<HTMLElement>('[style*="display:none"],[style*="display: none"],[class*="preheader"],[class*="preview"]');
      if (hidden?.textContent?.trim()) { setPreheader(hidden.textContent.trim().slice(0, 100)); return; }
      const first = doc.querySelector('p, td');
      if (first?.textContent?.trim()) setPreheader(first.textContent.trim().slice(0, 100));
    } catch {}
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col">

      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-zinc-950 border-b border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-white truncate">
            {entry.subject || `${entry.angle} ${entry.desc}`}
          </p>
          {entry.klaviyo_subject && (
            <p className="text-[9px] text-zinc-500 truncate font-mono">{entry.klaviyo_subject}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
          <button onClick={() => setMode('desktop')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${mode === 'desktop' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
            <Monitor className="w-3 h-3" />PC
          </button>
          <button onClick={() => setMode('mobile')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${mode === 'mobile' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
            <Smartphone className="w-3 h-3" />Celular
          </button>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Email viewer */}
      <div className="flex-1 overflow-auto" style={{ background: mode === 'desktop' ? '#d0d0d0' : '#e8e8e8' }}>
        <div style={{ maxWidth: mode === 'desktop' ? 660 : 430, width: '100%', margin: '16px auto 0', padding: '0 12px 32px' }} onClick={e => e.stopPropagation()}>

          {/* Email chrome */}
          <div style={{ background: '#fff', borderRadius: mode === 'desktop' ? '10px 10px 0 0' : 12, border: '1px solid #d0d0d0', borderBottom: mode === 'desktop' ? 'none' : '1px solid #d0d0d0', padding: '10px 14px', marginBottom: mode === 'desktop' ? 0 : 10 }}>
            {mode === 'desktop' && (
              <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
              </div>
            )}
            {mode === 'mobile' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#c9a96e', fontSize: 9, fontWeight: 700, fontFamily: 'Arial' }}>TSF</span>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111', fontFamily: 'Arial' }}>The Skirting Factory</div>
                  <div style={{ fontSize: 9, color: '#888', fontFamily: 'Arial' }}>valentina@theskirtingfactoryllc.com</div>
                </div>
              </div>
            )}
            <div style={{ fontSize: 10, fontFamily: 'Arial, sans-serif', lineHeight: 1.8 }}>
              {mode === 'desktop' && (
                <div><span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>De:</span><span style={{ color: '#1a73e8' }}>valentina@theskirtingfactoryllc.com</span></div>
              )}
              <div>
                <span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>Asunto:</span>
                <span style={{ color: '#111', fontWeight: mode === 'mobile' ? 600 : 400 }}>{entry.klaviyo_subject || entry.subject}</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>Vista Previa:</span>
                <span style={{ color: '#888', fontStyle: preheader ? 'normal' : 'italic' }}>{preheader || 'Cargando…'}</span>
              </div>
            </div>
          </div>

          {/* Email iframe */}
          <div style={mode === 'desktop'
            ? { background: '#fff', border: '1px solid #d0d0d0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }
            : { background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #d0d0d0', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }
          }>
            <iframe
              key={mode}
              ref={iframeRef}
              src={`/email-library/${entry.file}`}
              onLoad={onLoad}
              scrolling="no"
              style={{ width: '100%', height, border: 'none', display: 'block' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EmailMarketingPage() {
  const { profile }                   = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const activeProfile = isViewingAs ? viewAsProfile : profile;

  const [assignments, setAssignments] = useState<EmailAssignment[]>([]);
  const [emailMap, setEmailMap]       = useState<Record<string, EmailEntry>>({});
  const [preview, setPreview]         = useState<EmailEntry | null>(null);
  const [imgErrors, setImgErrors]     = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [sortDir, setSortDir]         = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    if (!activeProfile?.id) return;
    Promise.all([
      db.emailAssignments.getByClientId(activeProfile.id),
      fetch('/email-library/emails.json').then(r => r.json()).catch(() => [] as EmailEntry[]),
    ]).then(([asgns, emails]) => {
      setAssignments(asgns);
      const map: Record<string, EmailEntry> = {};
      for (const e of emails as EmailEntry[]) map[e.file] = e;
      setEmailMap(map);
      setLoading(false);
    });
  }, [activeProfile?.id]);

  const visible = assignments
    .map(a => ({ assignment: a, email: emailMap[a.email_file] }))
    .filter(({ email }) => !!email)
    .sort((a, b) => {
      const ta = new Date(a.assignment.created_at).getTime();
      const tb = new Date(b.assignment.created_at).getTime();
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-violet-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col relative">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight">Email Marketing</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {visible.length} email{visible.length !== 1 ? 's' : ''} preparado{visible.length !== 1 ? 's' : ''} para tu cuenta
          </p>
        </div>
        {visible.length > 0 && (
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {sortDir === 'desc' ? 'Más recientes' : 'Más antiguos'}
          </button>
        )}
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center mb-4">
            <Mail className="w-7 h-7 text-zinc-400" />
          </div>
          <p className="text-[15px] font-bold text-zinc-900 dark:text-white mb-1">Todavía no hay emails</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Cuando tengamos emails listos para tu cuenta, los vas a ver acá.
          </p>
        </div>
      )}

      {/* Grid */}
      {visible.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {visible.map(({ assignment, email }) => {
            const useIframe = imgErrors.has(email.file);
            return (
              <div
                key={`${assignment.id}`}
                onClick={() => setPreview(email)}
                className="group bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/[0.07] overflow-hidden shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-white/10 transition-all cursor-pointer w-full"
              >
                {/* Thumbnail */}
                <div className="relative overflow-hidden w-full" style={{ aspectRatio: '3/4' }}>
                  {useIframe ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                      <Mail className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />
                    </div>
                  ) : (
                    <img
                      src={`/email-library/screenshots/${email.file.replace('.html', '.webp')}`}
                      alt={email.subject}
                      onError={() => setImgErrors(prev => new Set([...prev, email.file]))}
                      draggable={false}
                      className="absolute inset-0 w-full h-full object-cover object-top block"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-lg">
                      Ver email
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-100 truncate leading-tight" title={email.subject}>
                    {email.subject || `${email.angle} ${email.desc}`}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_COLOR[assignment.status]}`}>
                      {STATUS_LABEL[assignment.status]}
                    </span>
                    {assignment.scheduled_at && assignment.status === 'scheduled' && (
                      <span className="text-[9px] text-zinc-400">
                        {new Date(assignment.scheduled_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview overlay */}
      {preview && <PreviewOverlay entry={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
