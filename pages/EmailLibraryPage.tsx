import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Monitor, Smartphone, X, Mail, GripVertical, Copy, Check, Share2, Trash2, CheckSquare, Square } from 'lucide-react';

interface EmailEntry {
  file: string;
  client: string;
  angle: string;
  desc: string;
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

// ── Confirm dialog ──────────────────────────────────────────────────────────
function ConfirmDialog({
  count, step, onStep1, onStep2, onCancel,
}: {
  count: number;
  step: 1 | 2;
  onStep1: () => void;
  onStep2: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
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
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={onStep1}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-red-500 text-white hover:bg-red-600 transition-all"
              >
                Sí, eliminar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center mb-4 mx-auto animate-pulse">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-[16px] font-black text-zinc-900 dark:text-white text-center mb-1">
              Confirmá nuevamente
            </h3>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center mb-5">
              Esta acción eliminará <span className="font-bold text-red-500">{count} template{count !== 1 ? 's' : ''}</span> de la biblioteca. ¿Estás seguro?
            </p>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
              >
                No, cancelar
              </button>
              <button
                onClick={onStep2}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-red-600 text-white hover:bg-red-700 transition-all"
              >
                Eliminar definitivo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function EmailLibraryPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [emails, setEmails]             = useState<EmailEntry[]>([]);
  const [activeClient, setActiveClient] = useState('ALL');
  const [clients, setClients]           = useState<string[]>([]);
  const [preview, setPreview]           = useState<EmailEntry | null>(null);
  const [previewMode, setPreviewMode]   = useState<'desktop' | 'mobile'>('desktop');
  const [copied, setCopied]             = useState(false);
  const [copiedLink, setCopiedLink]     = useState(false);
  const [dragOver, setDragOver]         = useState<number | null>(null);
  const dragIdx = useRef<number | null>(null);

  // Select + delete
  const [selectMode, setSelectMode]     = useState(false);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [confirmStep, setConfirmStep]   = useState<0 | 1 | 2>(0);

  // Admin guard
  useEffect(() => {
    if (profile && !profile.is_admin) navigate('/', { replace: true });
  }, [profile, navigate]);

  // Load emails (filter out deleted)
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

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleSelect = (file: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(file) ? next.delete(file) : next.add(file);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(e => e.file)));
  const clearSelect = () => { setSelected(new Set()); setSelectMode(false); };

  const doDelete = () => {
    const deleted: string[] = JSON.parse(localStorage.getItem(STORAGE_DELETED_KEY) ?? '[]');
    const next = [...new Set([...deleted, ...selected])];
    localStorage.setItem(STORAGE_DELETED_KEY, JSON.stringify(next));

    // Also clean order
    const order: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order.filter(f => !selected.has(f))));

    setEmails(prev => prev.filter(e => !selected.has(e.file)));
    setClients(prev => {
      const remaining = emails.filter(e => !selected.has(e.file)).map(e => e.client);
      return [...new Set(remaining)].sort();
    });
    clearSelect();
    setConfirmStep(0);
  };

  // ── Share / copy ──────────────────────────────────────────────────────────
  const copyShareLink = async (email: EmailEntry) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const subject = encodeURIComponent(`${email.client} — ${email.angle} ${email.desc}`.trim());
    const url = `${base}#/preview?email=${encodeURIComponent(email.file)}&subject=${subject}`;
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyHtml = async (file: string) => {
    try {
      const res = await fetch(`/email-library/${file}`);
      const html = await res.text();
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onDragStart = (idx: number) => { if (!selectMode) dragIdx.current = idx; };
  const onDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); if (!selectMode) setDragOver(idx); };
  const onDrop = (targetIdx: number) => {
    if (selectMode || dragIdx.current === null || dragIdx.current === targetIdx) { setDragOver(null); return; }
    const filteredFiles = filtered.map(e => e.file);
    const srcFile = filteredFiles[dragIdx.current];
    const dstFile = filteredFiles[targetIdx];
    const srcReal = emails.findIndex(e => e.file === srcFile);
    const dstReal = emails.findIndex(e => e.file === dstFile);
    const next = [...emails];
    const [moved] = next.splice(srcReal, 1);
    next.splice(dstReal, 0, moved);
    setEmails(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map(e => e.file)));
    dragIdx.current = null;
    setDragOver(null);
  };

  if (!profile?.is_admin) return null;

  const anySelected = selected.size > 0;

  return (
    <div className="flex gap-6 h-full min-h-0">

      {/* Sidebar */}
      <div className="w-44 flex-shrink-0">
        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] mb-3">
          Clientes
        </p>
        <div className="space-y-1">
          {['ALL', ...clients].map(c => (
            <button
              key={c}
              onClick={() => setActiveClient(c)}
              className={`w-full text-left px-3 py-2 rounded-xl text-[13px] font-bold transition-all ${
                activeClient === c
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {c === 'ALL' ? 'Todos' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight">
              Email Library
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {filtered.length} template{filtered.length !== 1 ? 's' : ''}
              {selectMode ? ` · ${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}` : ' · Arrastrá para reordenar'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={selectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Seleccionar todo
                </button>
                <button
                  onClick={clearSelect}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
                {anySelected && (
                  <button
                    onClick={() => setConfirmStep(1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-red-500 text-white hover:bg-red-600 transition-all shadow"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar ({selected.size})
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
              >
                <Square className="w-3.5 h-3.5" />
                Seleccionar
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
                    if (selectMode) { toggleSelect(email.file); return; }
                    setPreview(email); setPreviewMode('desktop');
                  }}
                  className={`group relative bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden shadow-sm transition-all ${
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
                  {/* Select checkbox */}
                  {selectMode && (
                    <div className="absolute top-2 left-2 z-10">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-violet-500 border-violet-500'
                          : 'bg-white/80 dark:bg-black/50 border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  )}

                  {/* Drag handle (hidden in select mode) */}
                  {!selectMode && (
                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-lg">
                      <GripVertical className="w-3.5 h-3.5 text-zinc-400" />
                    </div>
                  )}

                  {/* Thumbnail */}
                  <div
                    className="relative overflow-hidden"
                    style={{ width: CARD_W, height: CARD_H }}
                  >
                    <iframe
                      src={`/email-library/${email.file}`}
                      scrolling="no"
                      style={{
                        width: IFRAME_W,
                        height: IFRAME_H,
                        border: 'none',
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        pointerEvents: 'none',
                        display: 'block',
                      }}
                    />
                    {/* Hover overlay (only when not in select mode) */}
                    {!selectMode && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-lg">
                          Ver email
                        </span>
                      </div>
                    )}
                    {/* Selected overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-violet-500/10" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100 truncate leading-tight">
                      {email.angle} {email.desc}
                    </p>
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
      </div>

      {/* Confirm dialog */}
      {confirmStep > 0 && (
        <ConfirmDialog
          count={selected.size}
          step={confirmStep as 1 | 2}
          onStep1={() => setConfirmStep(2)}
          onStep2={doDelete}
          onCancel={() => setConfirmStep(0)}
        />
      )}

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col"
          onClick={() => setPreview(null)}
        >
          {/* Toolbar */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-5 py-3 bg-zinc-950 border-b border-white/10"
            onClick={e => e.stopPropagation()}
          >
            <p className="flex-1 text-[13px] font-bold text-zinc-300 truncate">
              {preview.client} — {preview.angle} {preview.desc}
            </p>
            <button
              onClick={() => preview && copyShareLink(preview)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                copiedLink
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              {copiedLink ? 'Link copiado!' : 'Compartir'}
            </button>
            <button
              onClick={() => preview && copyHtml(preview.file)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                copied
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado!' : 'Copiar HTML'}
            </button>
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setPreviewMode('desktop')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  previewMode === 'desktop' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  previewMode === 'mobile' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Mobile
              </button>
            </div>
            <button
              onClick={() => setPreview(null)}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview area */}
          <div
            className="flex-1 overflow-auto flex items-start justify-center"
            style={{ background: previewMode === 'desktop' ? '#d0d0d0' : '#1a1a1a' }}
          >
            <div
              className="transition-all duration-300 overflow-hidden"
              onClick={e => e.stopPropagation()}
              style={previewMode === 'desktop'
                ? { width: '100%', minHeight: '100%' }
                : { width: 375, margin: '32px auto', boxShadow: '0 8px 40px rgba(0,0,0,0.5)', borderRadius: 8 }
              }
            >
              <iframe
                src={`/email-library/${preview.file}`}
                onLoad={e => {
                  try {
                    const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
                    if (doc?.head && !doc.head.querySelector('base')) {
                      const base = doc.createElement('base');
                      base.target = '_blank';
                      doc.head.insertBefore(base, doc.head.firstChild);
                    }
                  } catch {}
                }}
                style={{ width: '100%', height: 900, border: 'none', display: 'block' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
