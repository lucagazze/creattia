import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Monitor, Smartphone, X, Mail, GripVertical,
  Copy, Check, Share2, Trash2, CheckSquare, Square,
  Code2, ExternalLink, FileDown,
} from 'lucide-react';

interface EmailEntry {
  file: string;
  client: string;
  angle: string;
  desc: string;
  subject: string;
  klaviyo_subject: string;
}

interface CtxMenu {
  x: number;
  y: number;
  email: EmailEntry;
}

const ANGLE_COLORS: Record<string, string> = {
  Oferta:      'bg-orange-500',
  Producto:    'bg-blue-500',
  SocialProof: 'bg-emerald-500',
  Educacional: 'bg-purple-500',
  Comunidad:   'bg-amber-500',
};

const STORAGE_KEY         = 'email-library-order';
const STORAGE_DELETED_KEY = 'email-library-deleted';

// ── Double-confirm delete dialog ────────────────────────────────────────────
function ConfirmDialog({ count, step, onStep1, onStep2, onCancel }: {
  count: number; step: 1 | 2;
  onStep1: () => void; onStep2: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        {step === 1 ? (
          <>
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center mb-4 mx-auto">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-[16px] font-black text-zinc-900 dark:text-white text-center mb-1">
              ¿Eliminar {count} template{count !== 1 ? 's' : ''}?
            </h3>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center mb-5">
              Se ocultarán de la biblioteca. Podés restaurarlos corriendo el sync script.
            </p>
            <div className="flex gap-2">
              <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all">
                Cancelar
              </button>
              <button onClick={onStep1} className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-red-500 text-white hover:bg-red-600 transition-all">
                Sí, eliminar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center mb-4 mx-auto animate-pulse">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-[16px] font-black text-zinc-900 dark:text-white text-center mb-1">Confirmá nuevamente</h3>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center mb-5">
              Esto eliminará <span className="font-bold text-red-500">{count} template{count !== 1 ? 's' : ''}</span> de la biblioteca. ¿Seguro?
            </p>
            <div className="flex gap-2">
              <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all">
                No, cancelar
              </button>
              <button onClick={onStep2} className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-red-600 text-white hover:bg-red-700 transition-all">
                Eliminar definitivo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Context menu ─────────────────────────────────────────────────────────────
function ContextMenu({ ctx, onCopyHtml, onShare, onPreview, onDelete, onClose }: {
  ctx: CtxMenu;
  onCopyHtml: (e: EmailEntry) => void;
  onShare: (e: EmailEntry) => void;
  onPreview: (e: EmailEntry) => void;
  onDelete: (e: EmailEntry) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener('mousedown', handler);
    window.addEventListener('scroll', handler);
    return () => { window.removeEventListener('mousedown', handler); window.removeEventListener('scroll', handler); };
  }, [onClose]);

  // Clamp to viewport
  const W = 192;
  const x = Math.min(ctx.x, window.innerWidth - W - 8);
  const y = ctx.y;

  const item = (icon: React.ReactNode, label: string, action: () => void, danger = false) => (
    <button
      key={label}
      onMouseDown={e => { e.stopPropagation(); action(); onClose(); }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-semibold text-left rounded-lg transition-all ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="fixed z-[80] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.08] rounded-xl shadow-2xl p-1.5 w-48"
      style={{ top: y, left: x }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 mb-1 border-b border-zinc-100 dark:border-white/5">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider truncate">{ctx.email.subject || ctx.email.angle + ' ' + ctx.email.desc}</p>
      </div>
      {item(<ExternalLink className="w-3.5 h-3.5" />, 'Ver preview', () => onPreview(ctx.email))}
      {item(<Code2 className="w-3.5 h-3.5" />, 'Copiar HTML', () => onCopyHtml(ctx.email))}
      {item(<Share2 className="w-3.5 h-3.5" />, 'Copiar link', () => onShare(ctx.email))}
      {item(<FileDown className="w-3.5 h-3.5" />, 'Descargar PDF', () => window.open(`/print.html?email=${encodeURIComponent(ctx.email.file)}`, '_blank'))}
      <div className="my-1 border-t border-zinc-100 dark:border-white/5" />
      {item(<Trash2 className="w-3.5 h-3.5" />, 'Eliminar', () => onDelete(ctx.email), true)}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EmailLibraryPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [emails, setEmails]             = useState<EmailEntry[]>([]);
  const [activeClient, setActiveClient] = useState('ALL');
  const [clients, setClients]           = useState<string[]>([]);
  const [preview, setPreview]           = useState<EmailEntry | null>(null);
  const [previewMode, setPreviewMode]   = useState<'desktop' | 'mobile'>('desktop');
  const [copied, setCopied]             = useState<string | null>(null);  // file name of copied item
  const [copiedLink, setCopiedLink]     = useState<string | null>(null);
  const [dragOver, setDragOver]         = useState<number | null>(null);
  const [selectMode, setSelectMode]     = useState(false);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [confirmStep, setConfirmStep]   = useState<0 | 1 | 2>(0);
  const [ctxMenu, setCtxMenu]           = useState<CtxMenu | null>(null);
  const [confirmSingle, setConfirmSingle] = useState<EmailEntry | null>(null);
  const [previewPreheader, setPreviewPreheader] = useState('');
  const [previewIframeHeight, setPreviewIframeHeight] = useState(3000);
  const dragIdx = useRef<number | null>(null);

  // Admin guard
  useEffect(() => {
    if (profile && !profile.is_admin) navigate('/', { replace: true });
  }, [profile, navigate]);

  // Reset preview state when email or mode changes
  useEffect(() => {
    setPreviewPreheader('');
    setPreviewIframeHeight(3000);
  }, [preview?.file, previewMode]);

  // Load
  useEffect(() => {
    fetch('/email-library/emails.json')
      .then(r => r.json())
      .then((data: EmailEntry[]) => {
        const deleted: string[] = JSON.parse(localStorage.getItem(STORAGE_DELETED_KEY) ?? '[]');
        data = data.filter(e => !deleted.includes(e.file));
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const order: string[] = JSON.parse(saved);
            const map = new Map(data.map(e => [e.file, e]));
            const sorted = order.map(f => map.get(f)).filter(Boolean) as EmailEntry[];
            const rest = data.filter(e => !order.includes(e.file));
            data = [...sorted, ...rest];
          } catch {}
        }
        setEmails(data);
        setClients([...new Set(data.map(e => e.client))].sort());
      })
      .catch(() => setEmails([]));
  }, []);

  const filtered = activeClient === 'ALL' ? emails : emails.filter(e => e.client === activeClient);

  // ── Actions ────────────────────────────────────────────────────────────────
  const getShareUrl = (email: EmailEntry) => {
    // /api/preview serves proper OG meta tags so WhatsApp/Telegram show the email title
    // then redirects to /#/preview for the actual viewer
    const base = window.location.origin;
    const subject = encodeURIComponent(email.subject || `${email.client} — ${email.angle} ${email.desc}`.trim());
    const client  = encodeURIComponent(email.client);
    const angle   = encodeURIComponent(email.angle);
    return `${base}/api/preview?email=${encodeURIComponent(email.file)}&subject=${subject}&client=${client}&angle=${angle}`;
  };

  const copyShareLink = useCallback(async (email: EmailEntry) => {
    await navigator.clipboard.writeText(getShareUrl(email));
    setCopiedLink(email.file);
    setTimeout(() => setCopiedLink(null), 2000);
  }, []);

  const copyHtml = useCallback(async (email: EmailEntry) => {
    try {
      const res = await fetch(`/email-library/${email.file}`);
      const html = await res.text();
      await navigator.clipboard.writeText(html);
      setCopied(email.file);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }, []);

  const deleteEmails = (files: Set<string> | string[]) => {
    const set = files instanceof Set ? files : new Set(files);
    const deleted: string[] = JSON.parse(localStorage.getItem(STORAGE_DELETED_KEY) ?? '[]');
    localStorage.setItem(STORAGE_DELETED_KEY, JSON.stringify([...new Set([...deleted, ...set])]));
    const order: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order.filter(f => !set.has(f))));
    setEmails(prev => prev.filter(e => !set.has(e.file)));
    setSelected(new Set());
    setSelectMode(false);
    setConfirmStep(0);
    setConfirmSingle(null);
  };

  // ── Select ─────────────────────────────────────────────────────────────────
  const toggleSelect = (file: string) => setSelected(prev => {
    const n = new Set(prev); n.has(file) ? n.delete(file) : n.add(file); return n;
  });
  const selectAll  = () => setSelected(new Set(filtered.map(e => e.file)));
  const clearSelect = () => { setSelected(new Set()); setSelectMode(false); };

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onDragStart = (idx: number) => { if (!selectMode) dragIdx.current = idx; };
  const onDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); if (!selectMode) setDragOver(idx); };
  const onDrop = (targetIdx: number) => {
    if (selectMode || dragIdx.current === null || dragIdx.current === targetIdx) { setDragOver(null); return; }
    const ff = filtered.map(e => e.file);
    const srcReal = emails.findIndex(e => e.file === ff[dragIdx.current!]);
    const dstReal = emails.findIndex(e => e.file === ff[targetIdx]);
    const next = [...emails];
    const [moved] = next.splice(srcReal, 1);
    next.splice(dstReal, 0, moved);
    setEmails(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(e => e.file)));
    dragIdx.current = null; setDragOver(null);
  };

  if (!profile?.is_admin) return null;

  const anySelected = selected.size > 0;

  return (
    <div className="flex gap-6 h-full min-h-0">

      {/* Sidebar */}
      <div className="w-44 flex-shrink-0">
        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] mb-3">Clientes</p>
        <div className="space-y-1">
          {['ALL', ...clients].map(c => (
            <button key={c} onClick={() => setActiveClient(c)}
              className={`w-full text-left px-3 py-2 rounded-xl text-[13px] font-bold transition-all ${
                activeClient === c
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'
              }`}>
              {c === 'ALL' ? 'Todos' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col relative">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight">Email Library</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {filtered.length} template{filtered.length !== 1 ? 's' : ''}
              {selectMode
                ? ` · ${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`
                : ' · Click derecho para opciones rápidas'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button onClick={selectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all">
                  <CheckSquare className="w-3.5 h-3.5" />Seleccionar todo
                </button>
                <button onClick={clearSelect}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all">
                  <X className="w-3.5 h-3.5" />Cancelar
                </button>
                {anySelected && (
                  <button onClick={() => setConfirmStep(1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-red-500 text-white hover:bg-red-600 transition-all shadow">
                    <Trash2 className="w-3.5 h-3.5" />Eliminar ({selected.size})
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => setSelectMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all">
                <Square className="w-3.5 h-3.5" />Seleccionar
              </button>
            )}
            <div className="flex items-center gap-2 p-1.5 bg-zinc-100 dark:bg-white/5 rounded-xl">
              <Mail className="w-4 h-4 text-violet-500" />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <Mail className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No hay templates para este cliente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((email, idx) => {
              const CARD_W  = 220;
              const CARD_H  = Math.round(CARD_W * 4 / 3);
              const IFRAME_W = 600;
              const scale   = CARD_W / IFRAME_W;
              const IFRAME_H = Math.round(CARD_H / scale);
              const isSelected = selected.has(email.file);
              const justCopied = copied === email.file;
              const justShared = copiedLink === email.file;

              return (
                <div
                  key={email.file}
                  draggable={!selectMode}
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={e => onDragOver(e, idx)}
                  onDrop={() => onDrop(idx)}
                  onDragLeave={() => setDragOver(null)}
                  onDragEnd={() => setDragOver(null)}
                  onClick={() => {
                    if (ctxMenu) { setCtxMenu(null); return; }
                    if (selectMode) { toggleSelect(email.file); return; }
                    setPreview(email); setPreviewMode('desktop');
                  }}
                  onContextMenu={e => {
                    e.preventDefault();
                    setCtxMenu({ x: e.clientX, y: e.clientY, email });
                  }}
                  className={`group relative bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden shadow-sm transition-all select-none ${
                    selectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                  } ${
                    isSelected
                      ? 'border-violet-500 ring-2 ring-violet-500/30 scale-[1.02]'
                      : dragOver === idx
                        ? 'border-violet-500 scale-105 shadow-lg shadow-violet-500/20'
                        : 'border-zinc-200 dark:border-white/[0.07] hover:border-zinc-300 dark:hover:border-white/10 hover:shadow-md'
                  }`}
                  style={{ width: CARD_W }}
                >
                  {/* Checkbox (select mode) */}
                  {selectMode && (
                    <div className="absolute top-2 left-2 z-10">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'bg-violet-500 border-violet-500' : 'bg-white/80 dark:bg-black/50 border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  )}

                  {/* Drag handle */}
                  {!selectMode && (
                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-lg">
                      <GripVertical className="w-3.5 h-3.5 text-zinc-400" />
                    </div>
                  )}

                  {/* Quick-copy badge (bottom-left on hover) */}
                  {!selectMode && (
                    <button
                      className="absolute bottom-[72px] left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => { e.stopPropagation(); copyHtml(email); }}
                      title="Copiar HTML"
                    >
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shadow transition-all ${
                        justCopied
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/90 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                      }`}>
                        {justCopied ? <Check className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
                        {justCopied ? '¡Copiado!' : 'HTML'}
                      </span>
                    </button>
                  )}

                  {/* Thumbnail */}
                  <div className="relative overflow-hidden" style={{ width: CARD_W, height: CARD_H }}>
                    <iframe
                      src={`/email-library/${email.file}`}
                      scrolling="no"
                      style={{
                        width: IFRAME_W, height: IFRAME_H, border: 'none',
                        transform: `scale(${scale})`, transformOrigin: 'top left',
                        pointerEvents: 'none', display: 'block',
                      }}
                    />
                    {!selectMode && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-lg">
                          Ver email
                        </span>
                      </div>
                    )}
                    {isSelected && <div className="absolute inset-0 bg-violet-500/10" />}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-100 truncate leading-tight" title={email.subject}>
                      {email.subject || `${email.angle} ${email.desc}`}
                    </p>
                    {/* Klaviyo subject — click to copy */}
                    {email.klaviyo_subject && !selectMode && (
                      <button
                        className="group/ks w-full text-left flex items-center gap-1 mt-0.5"
                        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(email.klaviyo_subject); setCopied(email.file + '_subj'); setTimeout(() => setCopied(null), 1500); }}
                        title="Copiar asunto Klaviyo"
                      >
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 truncate font-mono group-hover/ks:text-violet-500 transition-colors">
                          {copied === email.file + '_subj' ? '¡Copiado!' : email.klaviyo_subject}
                        </span>
                        <Copy className="w-2 h-2 text-zinc-400 flex-shrink-0 opacity-0 group-hover/ks:opacity-100 transition-opacity" />
                      </button>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white ${ANGLE_COLORS[email.angle] ?? 'bg-zinc-500'}`}>
                        {email.angle}
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400">{email.client}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Preview Panel — absolute so sidebar stays visible */}
        {preview && (
          <div className="absolute inset-0 z-50 flex flex-col" onClick={() => setPreview(null)}>
            {/* Dark action toolbar */}
            <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-zinc-950 border-b border-white/10" onClick={e => e.stopPropagation()}>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white truncate">{preview.subject || `${preview.angle} ${preview.desc}`}</p>
                {preview.klaviyo_subject && (
                  <button onClick={() => navigator.clipboard.writeText(preview.klaviyo_subject)} className="flex items-center gap-1 text-left group/subj" title="Copiar asunto Klaviyo">
                    <span className="text-[9px] text-zinc-500 truncate group-hover/subj:text-zinc-300 transition-colors font-mono">{preview.klaviyo_subject}</span>
                    <Copy className="w-2 h-2 text-zinc-600 group-hover/subj:text-zinc-400 flex-shrink-0 transition-colors" />
                  </button>
                )}
              </div>
              <a href={`/print.html?email=${encodeURIComponent(preview.file)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                <FileDown className="w-3 h-3" />PDF
              </a>
              <button onClick={() => copyShareLink(preview)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${copiedLink === preview.file ? 'bg-violet-500/20 border-violet-500/40 text-violet-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'}`}>
                {copiedLink === preview.file ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                {copiedLink === preview.file ? 'Copiado!' : 'Link'}
              </button>
              <button onClick={() => copyHtml(preview)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${copied === preview.file ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'}`}>
                {copied === preview.file ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                HTML
              </button>
              <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
                <button onClick={() => setPreviewMode('desktop')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${previewMode === 'desktop' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
                  <Monitor className="w-3 h-3" />PC
                </button>
                <button onClick={() => setPreviewMode('mobile')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${previewMode === 'mobile' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
                  <Smartphone className="w-3 h-3" />Celular
                </button>
              </div>
              <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Email viewer — same look as public share page */}
            <div className="flex-1 overflow-auto" style={{ background: previewMode === 'desktop' ? '#d0d0d0' : '#e8e8e8' }} onClick={() => setPreview(null)}>

              {/* Chrome + email body — same container, same width */}
              <div style={{ maxWidth: previewMode === 'desktop' ? 660 : 430, width: '100%', margin: '16px auto 0', padding: '0 12px 32px' }} onClick={e => e.stopPropagation()}>

                {/* Email chrome card */}
                <div style={{ background: '#fff', borderRadius: previewMode === 'desktop' ? '10px 10px 0 0' : 12, border: '1px solid #d0d0d0', borderBottom: previewMode === 'desktop' ? 'none' : '1px solid #d0d0d0', padding: '10px 14px', marginBottom: previewMode === 'desktop' ? 0 : 10 }}>
                  {previewMode === 'desktop' && (
                    <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
                    </div>
                  )}
                  {previewMode === 'mobile' && (
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
                    {previewMode === 'desktop' && (
                      <div><span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>De:</span><span style={{ color: '#1a73e8' }}>valentina@theskirtingfactoryllc.com</span></div>
                    )}
                    <div><span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>Asunto:</span><span style={{ color: '#111', fontWeight: previewMode === 'mobile' ? 600 : 400 }}>{preview.subject || `${preview.client} — ${preview.angle}`}</span></div>
                    <div><span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>Vista Previa:</span><span style={{ color: '#888', fontStyle: previewPreheader ? 'normal' : 'italic' }}>{previewPreheader || 'Cargando…'}</span></div>
                  </div>
                </div>

                {/* Email iframe */}
                <div style={previewMode === 'desktop'
                  ? { background: '#fff', border: '1px solid #d0d0d0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }
                  : { background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #d0d0d0', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }
                }>
                  <iframe
                    key={`${preview.file}-${previewMode}`}
                    src={`/email-library/${preview.file}`}
                    scrolling="no"
                    onLoad={e => {
                      try {
                        const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
                        if (!doc) return;
                        if (doc.head && !doc.head.querySelector('base')) {
                          const base = doc.createElement('base'); base.target = '_blank';
                          doc.head.insertBefore(base, doc.head.firstChild);
                        }
                        const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 0;
                        if (h > 200) setPreviewIframeHeight(h + 40);
                        const hidden = doc.querySelector<HTMLElement>('[style*="display:none"],[style*="display: none"],[class*="preheader"],[class*="preview"]');
                        if (hidden?.textContent?.trim()) { setPreviewPreheader(hidden.textContent.trim().slice(0, 100)); return; }
                        const first = doc.querySelector('p, td');
                        if (first?.textContent?.trim()) setPreviewPreheader(first.textContent.trim().slice(0, 100));
                      } catch {}
                    }}
                    style={{ width: '100%', height: previewIframeHeight, border: 'none', display: 'block' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          ctx={ctxMenu}
          onCopyHtml={copyHtml}
          onShare={copyShareLink}
          onPreview={e => { setPreview(e); setPreviewMode('desktop'); }}
          onDelete={e => { setConfirmSingle(e); setConfirmStep(1); }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Confirm: bulk */}
      {confirmStep > 0 && !confirmSingle && (
        <ConfirmDialog
          count={selected.size}
          step={confirmStep as 1 | 2}
          onStep1={() => setConfirmStep(2)}
          onStep2={() => deleteEmails(selected)}
          onCancel={() => setConfirmStep(0)}
        />
      )}

      {/* Confirm: single (from context menu) */}
      {confirmStep > 0 && confirmSingle && (
        <ConfirmDialog
          count={1}
          step={confirmStep as 1 | 2}
          onStep1={() => setConfirmStep(2)}
          onStep2={() => deleteEmails([confirmSingle.file])}
          onCancel={() => { setConfirmStep(0); setConfirmSingle(null); }}
        />
      )}

    </div>
  );
}
