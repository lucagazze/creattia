import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  RefreshCw, Mail, Workflow, ChevronDown, ChevronRight, ChevronLeft,
  Eye, Key, ExternalLink, AlertCircle, X, Monitor, Smartphone,
  Clock, Send, CalendarClock, Zap, Check, Copy, ArrowUpDown, Trash2, Undo2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { db, EmailAssignment } from '../services/db';
import { AppleLoader } from '../components/ui/AppleLoader';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailEntry {
  file: string;
  client: string;
  angle: string;
  desc: string;
  subject: string;
  klaviyo_subject: string;
}

interface KvCampaign {
  id: string;
  name: string;
  status: string;
  send_time?: string;
  scheduled_at?: string;
  created_at: string;
  message?: { id: string; subject?: string; preview_text?: string; template_id?: string };
}

interface KvFlow {
  id: string;
  name: string;
  status: string;
  trigger_type: string;
  created: string;
  updated: string;
  actions?: KvFlowEmail[];
  loadingActions?: boolean;
  expanded?: boolean;
}

interface KvFlowEmail {
  id: string;
  status: string;
  message?: { id: string; name?: string; subject?: string; template_id?: string };
}

// ─── Klaviyo API Helpers ──────────────────────────────────────────────────────

const KLAVIYO_REVISION = '2024-10-15';

const kRequest = async (path: string, apiKey: string, method: string = 'GET', body?: any) => {
  const headers: Record<string, string> = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    Revision: KLAVIYO_REVISION,
    Accept: 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`/api/klaviyo/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt}`);
  }

  if (res.status === 204) {
    return null;
  }
  return res.json();
};

const kFetch = async (path: string, apiKey: string) => {
  return kRequest(path, apiKey, 'GET');
};

const fetchCampaigns = async (apiKey: string): Promise<KvCampaign[]> => {
  const data = await kFetch(
    `campaigns?filter=equals(messages.channel,%22email%22)&include=campaign-messages&sort=-created_at`,
    apiKey,
  );
  const msgMap = new Map<string, any>();
  for (const item of data.included ?? []) {
    if (item.type === 'campaign-message') {
      msgMap.set(item.id, {
        id: item.id,
        subject: item.attributes.subject,
        preview_text: item.attributes.preview_text,
        template_id: item.relationships?.template?.data?.id,
      });
    }
  }
  return (data.data ?? [])
    .map((c: any) => {
      const msgIds: string[] = c.relationships?.['campaign-messages']?.data?.map((d: any) => d.id) ?? [];
      return {
        id: c.id,
        name: c.attributes.name,
        status: c.attributes.status,
        send_time: c.attributes.send_time,
        scheduled_at: c.attributes.scheduled_at,
        created_at: c.attributes.created_at,
        message: msgIds[0] ? msgMap.get(msgIds[0]) : undefined,
      };
    })
    .filter((c: any) => {
      const s = c.status.toLowerCase();
      return s !== 'cancelled' && s !== 'draft';
    });
};

const fetchFlows = async (apiKey: string): Promise<KvFlow[]> => {
  const data = await kFetch(`flows?sort=-updated`, apiKey);
  return (data.data ?? [])
    .map((f: any) => ({
      id: f.id,
      name: f.attributes.name,
      status: f.attributes.status,
      trigger_type: f.attributes.trigger_type,
      created: f.attributes.created,
      updated: f.attributes.updated,
    }))
    .filter((f: any) => f.status.toLowerCase() === 'live');
};

const fetchFlowEmails = async (flowId: string, apiKey: string): Promise<KvFlowEmail[]> => {
  const actionsData = await kFetch(
    `flows/${flowId}/flow-actions?filter=equals(action_type,%22SEND_EMAIL%22)`,
    apiKey,
  );
  
  const emailActions = actionsData.data ?? [];
  
  const results = await Promise.all(
    emailActions.map(async (action: any) => {
      try {
        const messagesData = await kFetch(`flow-actions/${action.id}/flow-messages`, apiKey);
        const msg = messagesData.data?.[0];
        if (!msg) {
          return {
            id: action.id,
            status: action.attributes.status,
          };
        }
        return {
          id: action.id,
          status: action.attributes.status,
          message: {
            id: msg.id,
            name: msg.attributes.name,
            subject: msg.attributes.subject,
            template_id: msg.relationships?.template?.data?.id,
          },
        };
      } catch (err) {
        return {
          id: action.id,
          status: action.attributes.status,
        };
      }
    })
  );
  
  return results.filter((a: KvFlowEmail) => 
    a.status.toLowerCase() === 'live' && 
    a.message !== undefined && 
    a.message.template_id !== undefined
  );
};

const fetchTemplateHtml = async (templateId: string, apiKey: string): Promise<string> => {
  const data = await kFetch(`templates/${templateId}`, apiKey);
  return data.data?.attributes?.html ?? '';
};

// ─── Display Helpers ──────────────────────────────────────────────────────────

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const CAMP_STATUS: Record<string, { label: string; cls: string }> = {
  Draft:      { label: 'Borrador',   cls: 'bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400' },
  Scheduled:  { label: 'Programado', cls: 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  Sending:    { label: 'Enviando',   cls: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  Sent:       { label: 'Enviado',    cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  Cancelled:  { label: 'Cancelado',  cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400' },
};

const FLOW_STATUS: Record<string, { label: string; cls: string }> = {
  live:     { label: 'Activo',    cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  draft:    { label: 'Borrador',  cls: 'bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400' },
  paused:   { label: 'Pausado',   cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  archived: { label: 'Archivado', cls: 'bg-zinc-100 dark:bg-white/10 text-zinc-400' },
  manual:   { label: 'Manual',    cls: 'bg-zinc-100 dark:bg-white/10 text-zinc-400' },
};

const ACTION_STATUS: Record<string, { cls: string }> = {
  live:     { cls: 'bg-emerald-500' },
  draft:    { cls: 'bg-zinc-400' },
  paused:   { cls: 'bg-amber-400' },
  archived: { cls: 'bg-zinc-300 dark:bg-zinc-600' },
};

const sanitizeHtmlTemplates = (rawHtml: string): string => {
  if (!rawHtml) return '';
  let sanitized = rawHtml;
  
  // 1. Replace src/background/poster/srcset/href attributes containing {% or {{ to prevent invalid GET requests
  sanitized = sanitized.replace(/(src|href|background|poster|srcset)=["']([^"']*(?:\{%|\{\{)[^"']*)["']/gi, (match, attr, value) => {
    const lowerAttr = attr.toLowerCase();
    if (lowerAttr === 'src' || lowerAttr === 'srcset') {
      return `${attr}="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100%' height='100%' fill='%23f4f4f5'/><g fill='%23d4d4d8'><path d='M15 80 L40 45 L65 70 L80 55 L95 80 Z'/><circle cx='30' cy='30' r='6'/></g></svg>"`;
    }
    return `${attr}=""`;
  });

  // 2. Replace CSS url(...) containing {% or {{
  sanitized = sanitized.replace(/url\([^)]*(?:\{%|\{\{)[^)]*\)/gi, "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100%\" height=\"100%\" fill=\"%23f4f4f5\"/><g fill=\"%23d4d4d8\"><path d=\"M15 80 L40 45 L65 70 L80 55 L95 80 Z\"/><circle cx=\"30\" cy=\"30\" r=\"6\"/></g></svg>')");

  return sanitized;
};

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({
  templateId, apiKey, title, subject, onClose,
}: {
  templateId: string; apiKey: string; title: string; subject?: string; onClose: () => void;
}) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeH, setIframeH] = useState(3000);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mob = window.innerWidth < 768;
      setIsMobile(mob);
      if (mob) {
        setMode('mobile');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchTemplateHtml(templateId, apiKey)
      .then(h => { setHtml(h); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [templateId, apiKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onIframeLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      if (doc.head && !doc.head.querySelector('base')) {
        const base = doc.createElement('base'); base.target = '_blank';
        doc.head.insertBefore(base, doc.head.firstChild);
      }
      const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 0;
      if (h > 100) setIframeH(h + 32);
    } catch {}
  };

  const blobUrl = html ? URL.createObjectURL(new Blob([html], { type: 'text/html' })) : '';

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${isMobile ? 'p-0 z-[400] items-stretch justify-stretch' : ''}`}>
      <div className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className={`relative z-10 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${isMobile ? 'h-full w-full max-w-none rounded-none border-none' : ''}`}>
        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-zinc-950 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white truncate">{title}</p>
            {subject && <p className="text-[10px] text-zinc-500 truncate font-mono">{subject}</p>}
          </div>
          {html && (
            <button
              onClick={() => { navigator.clipboard.writeText(html); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${copied ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'}`}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copiado!' : 'HTML'}
            </button>
          )}
          {blobUrl && (
            <a href={blobUrl} download={`${templateId}.html`}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
              <ExternalLink className="w-3 h-3" />HTML
            </a>
          )}
          {!isMobile ? (
            <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
              <button onClick={() => setMode('desktop')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${mode === 'desktop' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
                <Monitor className="w-3 h-3" />PC
              </button>
              <button onClick={() => setMode('mobile')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${mode === 'mobile' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
                <Smartphone className="w-3 h-3" />Móvil
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-violet-600 text-white shadow">
              <Smartphone className="w-3 h-3" />Móvil
            </div>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto" style={{ background: mode === 'desktop' ? '#d0d0d0' : '#e8e8e8' }}>
          {loading && (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <div className="w-5 h-5 border-2 border-zinc-600 border-t-violet-500 rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          {html && !loading && (
            <div style={{ maxWidth: mode === 'desktop' ? 660 : 430, width: '100%', margin: isMobile ? '0 auto' : '16px auto 0', padding: isMobile ? '0' : '0 12px 32px' }}>
              <div style={{ background: '#fff', borderRadius: isMobile ? '0' : (mode === 'desktop' ? '10px 10px 0 0' : 12), border: isMobile ? 'none' : '1px solid #d0d0d0', borderBottom: isMobile ? '1px solid #f0f0f0' : 'none', padding: '10px 14px' }}>
                {!isMobile && mode === 'desktop' && (
                  <div style={{ display: 'flex', gap: 5, marginBottom: 4 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
                  </div>
                )}
                {subject && <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#111', fontFamily: 'system-ui' }}>{subject}</p>}
              </div>
              <iframe
                ref={iframeRef}
                srcDoc={sanitizeHtmlTemplates(html)}
                onLoad={onIframeLoad}
                sandbox="allow-same-origin allow-popups"
                style={{ display: 'block', width: '100%', height: iframeH, border: isMobile ? 'none' : '1px solid #d0d0d0', background: '#fff' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Card ────────────────────────────────────────────────────────────

const CampaignCard = memo(function CampaignCard({
  c,
  onPreview,
  onDelete,
  onCancel,
  onRevert,
  onSchedule,
}: {
  c: KvCampaign;
  onPreview: () => void;
  onDelete?: (id: string) => Promise<void>;
  onCancel?: (id: string) => Promise<void>;
  onRevert?: (id: string) => Promise<void>;
  onSchedule?: (id: string, msgId: string) => void;
}) {
  const st = CAMP_STATUS[c.status] ?? { label: c.status, cls: 'bg-zinc-100 dark:bg-white/10 text-zinc-500' };
  const dateLabel = c.status === 'Sent' ? `Enviado el: ${fmtDate(c.send_time)}` :
    c.status === 'Sending' ? `Enviando (iniciado el ${fmtDate(c.send_time)})` :
    c.status === 'Scheduled' ? `Programado para: ${fmtDate(c.send_time ?? c.scheduled_at)}` :
    `Creado el: ${fmtDate(c.created_at)}`;
  const dateIcon = (c.status === 'Sent' || c.status === 'Sending') ? <Send className="w-3 h-3" /> :
    c.status === 'Scheduled' ? <CalendarClock className="w-3 h-3" /> : <Clock className="w-3 h-3" />;

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (actionName: string, actionFn?: (id: string) => Promise<void>) => {
    if (!actionFn) return;
    setLoadingAction(actionName);
    setError(null);
    try {
      await actionFn(c.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al procesar la acción');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCardClick = () => {
    if (c.message?.template_id) {
      onPreview();
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.07] rounded-2xl px-5 py-4 flex items-start gap-4 hover:border-zinc-300 dark:hover:border-white/15 transition-all ${
        c.message?.template_id ? 'cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-white/[0.01]' : ''
      }`}
    >
      <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Mail className="w-4 h-4 text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-[13px] font-bold text-zinc-900 dark:text-white leading-tight">{c.name}</p>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        </div>
        {c.message?.subject && (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate font-mono">
            {c.message.subject}
          </p>
        )}
        {c.message?.preview_text && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate italic">
            {c.message.preview_text}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          {dateIcon}
          <span>{dateLabel}</span>
        </div>
        {error && (
          <div className="mt-2 text-[11px] text-red-500 font-medium flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {c.message?.template_id && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-violet-600 hover:text-white transition-all border border-zinc-200 dark:border-white/5"
          >
            <Eye className="w-3.5 h-3.5" />Ver
          </button>
        )}

        {c.status === 'Draft' && c.message?.id && onSchedule && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSchedule(c.id, c.message!.id);
            }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-violet-600 hover:bg-violet-700 text-white transition-all border border-violet-600"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Programar
          </button>
        )}

        {c.status === 'Draft' && onDelete && (
          <button
            disabled={loadingAction !== null}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`¿Estás seguro de que querés eliminar la campaña "${c.name}" permanentemente de Email Marketing?`)) {
                handleAction('delete', onDelete);
              }
            }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white disabled:opacity-40 transition-all border border-red-500/10"
          >
            {loadingAction === 'delete' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Eliminar
          </button>
        )}

        {c.status === 'Scheduled' && onRevert && (
          <button
            disabled={loadingAction !== null}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`¿Estás seguro de que querés volver la campaña "${c.name}" a borrador?`)) {
                handleAction('revert', onRevert);
              }
            }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-40 transition-all border border-zinc-200 dark:border-white/5"
          >
            {loadingAction === 'revert' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Undo2 className="w-3.5 h-3.5" />
            )}
            Borrador
          </button>
        )}

        {(c.status === 'Scheduled' || c.status === 'Sending') && onCancel && (
          <button
            disabled={loadingAction !== null}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`¿Estás seguro de que querés cancelar el envío de la campaña "${c.name}"?`)) {
                handleAction('cancel', onCancel);
              }
            }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white disabled:opacity-40 transition-all border border-red-500/10"
          >
            {loadingAction === 'cancel' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
});

// ─── Flow Row ─────────────────────────────────────────────────────────────────

const FlowRow = memo(function FlowRow({ f, apiKey, onPreview }: {
  f: KvFlow;
  apiKey: string;
  onPreview: (templateId: string, name: string, subject?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actions, setActions] = useState<KvFlowEmail[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (!expanded && actions === null) {
      setLoading(true);
      try {
        const result = await fetchFlowEmails(f.id, apiKey);
        setActions(result);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(p => !p);
  };

  const st = FLOW_STATUS[f.status] ?? { label: f.status, cls: 'bg-zinc-100 dark:bg-white/10 text-zinc-400' };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.07] rounded-2xl overflow-hidden transition-all">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
          <Workflow className="w-4 h-4 text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-bold text-zinc-900 dark:text-white">{f.name}</p>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {f.trigger_type ?? '—'} · actualizado {fmtDate(f.updated).split(',')[0]}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {loading && <div className="w-4 h-4 border-2 border-zinc-300 border-t-violet-500 rounded-full animate-spin" />}
          {!loading && (expanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />)}
        </div>
      </button>

      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{ maxHeight: expanded ? 1200 : 0 }}
      >
        <div className="border-t border-zinc-100 dark:border-white/5">
          {error && <p className="px-5 py-3 text-[12px] text-red-500">{error}</p>}
          {actions !== null && actions.length === 0 && (
            <p className="px-5 py-3 text-[12px] text-zinc-400">Sin emails en este flow.</p>
          )}
          {(actions ?? []).map((a, i) => {
            const aSt = ACTION_STATUS[a.status] ?? { cls: 'bg-zinc-300 dark:bg-zinc-600' };
            return (
              <div key={a.id}
                className={`flex items-center gap-3 px-5 py-3 ${i < (actions ?? []).length - 1 ? 'border-b border-zinc-100 dark:border-white/5' : ''}`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${aSt.cls}`} />
                <div className="flex-1 min-w-0">
                  {a.message?.name && <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">{a.message.name}</p>}
                  {a.message?.subject && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono">{a.message.subject}</p>}
                  {!a.message?.name && !a.message?.subject && <p className="text-[11px] text-zinc-400">Email sin nombre</p>}
                </div>
                {a.message?.template_id && (
                  <button
                    onClick={() => onPreview(a.message!.template_id!, a.message!.name ?? f.name, a.message!.subject)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-violet-600 hover:text-white transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />Ver
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ─── Calendar View ────────────────────────────────────────────────────────────

const CalendarView = memo(function CalendarView({
  campaigns,
  onPreview,
  onCancel,
  onRevert,
}: {
  campaigns: KvCampaign[];
  onPreview: (templateId: string, title: string, subject?: string) => void;
  onCancel?: (id: string) => Promise<void>;
  onRevert?: (id: string) => Promise<void>;
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const { days, monthYearLabel, todayStr } = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstDayIndex = new Date(y, m, 1).getDay();
    const d: (Date | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) d.push(null);
    for (let n = 1; n <= daysInMonth; n++) d.push(new Date(y, m, n));
    return {
      days: d,
      monthYearLabel: currentDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
      todayStr: new Date().toLocaleDateString('sv-SE'),
    };
  }, [currentDate]);

  // Index campaigns by date string for O(1) lookup per day
  const campaignsByDate = useMemo(() => {
    const map = new Map<string, KvCampaign[]>();
    for (const c of campaigns) {
      const dateVal = c.send_time ?? c.scheduled_at;
      if (!dateVal) continue;
      const key = new Date(dateVal).toLocaleDateString('sv-SE');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [campaigns]);

  const selectedDateCampaigns = useMemo(() =>
    selectedDateStr ? (campaignsByDate.get(selectedDateStr) ?? []) : [],
    [campaignsByDate, selectedDateStr]
  );

  const scheduledCampaigns = useMemo(() =>
    campaigns
      .filter(c => c.status === 'Scheduled')
      .sort((a, b) =>
        new Date(a.send_time ?? a.scheduled_at ?? '').getTime() -
        new Date(b.send_time ?? b.scheduled_at ?? '').getTime()
      ),
    [campaigns]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Calendar Grid (left 2 cols) */}
      <div className="xl:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.07] rounded-3xl p-5 md:p-6 space-y-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white capitalize">
            {monthYearLabel}
          </h3>
          <div className="flex gap-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-white/5 pb-2">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="min-h-[60px] sm:min-h-[90px] md:min-h-[110px] xl:min-h-[120px] border border-dashed border-zinc-100 dark:border-white/[0.03] rounded-xl sm:rounded-2xl opacity-20" />;
            const dayCamp = campaignsByDate.get(day.toLocaleDateString('sv-SE')) ?? [];
            const isToday = day.toLocaleDateString('sv-SE') === todayStr;
            const isSelected = day.toLocaleDateString('sv-SE') === selectedDateStr;

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDateStr(day.toLocaleDateString('sv-SE'))}
                className={`relative rounded-xl sm:rounded-2xl flex flex-col items-stretch justify-start min-h-[60px] sm:min-h-[90px] md:min-h-[110px] xl:min-h-[120px] p-1.5 sm:p-2 transition-all hover:bg-zinc-50 dark:hover:bg-white/5 border ${
                  isSelected
                    ? 'bg-violet-600/10 border-violet-500/30 dark:border-violet-500/20'
                    : 'border-zinc-100 dark:border-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] font-bold ${
                    isToday 
                      ? 'w-5 h-5 flex items-center justify-center bg-violet-600 text-white rounded-full text-[10px]' 
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}>
                    {day.getDate()}
                  </span>
                </div>
                
                {/* Campaign labels inside calendar day cell */}
                <div className="mt-1.5 space-y-1 w-full overflow-hidden text-left">
                  {dayCamp.map(c => {
                    const isSch = c.status === 'Scheduled';
                    const colorCls = isSch
                      ? 'bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 dark:hover:bg-violet-500/25'
                      : 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/25';
                    
                    const handleBadgeClick = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (c.message?.template_id) {
                        onPreview(c.message.template_id, c.name, c.message.subject);
                      }
                    };

                    return (
                      <div
                        key={c.id}
                        onClick={handleBadgeClick}
                        onDoubleClick={handleBadgeClick}
                        className={`text-[10px] font-bold truncate rounded px-1.5 py-0.5 cursor-pointer transition-all active:scale-95 ${colorCls}`}
                        title={`${c.name} (Clic para ver)`}
                      >
                        {c.name}
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>

        {selectedDateStr && (
          <div className="border-t border-zinc-100 dark:border-white/5 pt-4 mt-2 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Eventos para el {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
              </h4>
              <button
                onClick={() => setSelectedDateStr(null)}
                className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                Cerrar
              </button>
            </div>
            {selectedDateCampaigns.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No hay campañas programadas o enviadas para esta fecha.</p>
            ) : (
              <div className="space-y-2">
                {selectedDateCampaigns.map(c => (
                  <CampaignCard
                    key={c.id}
                    c={c}
                    onPreview={() => c.message?.template_id && onPreview(c.message.template_id, c.name, c.message.subject)}
                    onCancel={onCancel}
                    onRevert={onRevert}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agenda/Upcoming List (right 1 col) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.07] rounded-3xl p-5 md:p-6 flex flex-col gap-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div>
          <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white tracking-tight">
            Próximos Envíos
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Cronograma de campañas programadas
          </p>
        </div>

        {scheduledCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-zinc-400 flex-1">
            <CalendarClock className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-xs italic text-center">No hay envíos programados actualmente.</p>
          </div>
        ) : (
          <div className="space-y-2.5 overflow-y-auto flex-1 pr-0.5">
            {scheduledCampaigns.map(c => {
              const sendDate = new Date(c.send_time ?? c.scheduled_at ?? '');
              const today = new Date();
              const sendDateZero = new Date(sendDate.getFullYear(), sendDate.getMonth(), sendDate.getDate());
              const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const diffDays = Math.round((sendDateZero.getTime() - todayZero.getTime()) / (1000 * 60 * 60 * 24));
              const isUrgent = diffDays <= 2;
              const isToday = diffDays === 0;
              const isTomorrow = diffDays === 1;

              return (
                <div
                  key={c.id}
                  onClick={() => c.message?.template_id && onPreview(c.message.template_id, c.name, c.message.subject)}
                  className={`group relative flex items-center gap-3.5 p-3.5 rounded-2xl cursor-pointer transition-all border ${
                    isUrgent
                      ? 'bg-red-50/60 dark:bg-red-500/5 border-red-200/60 dark:border-red-500/15 hover:border-red-400/40 dark:hover:border-red-500/30'
                      : 'bg-zinc-50 dark:bg-white/[0.02] border-zinc-100 dark:border-white/5 hover:border-violet-400/30 dark:hover:border-violet-500/20 hover:bg-violet-50/30 dark:hover:bg-violet-500/5'
                  }`}
                >
                  {/* Countdown block */}
                  <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center ${
                    isToday ? 'bg-red-500 text-white' :
                    isTomorrow ? 'bg-orange-500 text-white' :
                    isUrgent ? 'bg-red-500/15 text-red-600 dark:text-red-400' :
                    'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  }`}>
                    {isToday ? (
                      <span className="text-[11px] font-black uppercase tracking-tight">Hoy</span>
                    ) : isTomorrow ? (
                      <span className="text-[10px] font-black uppercase tracking-tight leading-tight text-center">Maña<br/>na</span>
                    ) : diffDays < 0 ? (
                      <span className="text-[10px] font-black uppercase tracking-tight">Past.</span>
                    ) : (
                      <>
                        <span className="text-[18px] font-black leading-none">{diffDays}</span>
                        <span className="text-[8px] font-bold uppercase tracking-widest opacity-70">días</span>
                      </>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-bold truncate transition-colors leading-snug ${
                      isUrgent
                        ? 'text-red-700 dark:text-red-300 group-hover:text-red-800 dark:group-hover:text-red-200'
                        : 'text-zinc-800 dark:text-zinc-200 group-hover:text-violet-600 dark:group-hover:text-violet-400'
                    }`}>
                      {c.name}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        {fmtDate(c.send_time ?? c.scheduled_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Preview overlay (original database page compatibility) ───────────────────

function PreviewOverlay({ entry, onClose }: { entry: EmailEntry; onClose: () => void }) {
  const [mode, setMode]       = useState<'desktop' | 'mobile'>('desktop');
  const [height, setHeight]   = useState(3000);
  const [preheader, setPreheader] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => { setHeight(3000); setPreheader(''); }, [mode]);

  useEffect(() => {
    const checkMobile = () => {
      const mob = window.innerWidth < 768;
      setIsMobile(mob);
      if (mob) {
        setMode('mobile');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    <div className={`fixed inset-0 md:left-[240px] z-50 flex flex-col ${isMobile ? 'z-[400] bg-[#09090b] md:left-0' : ''}`}>
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
        {!isMobile ? (
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
        ) : (
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-violet-600 text-white shadow">
            <Smartphone className="w-3 h-3" />Celular
          </div>
        )}
        <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Email viewer */}
      <div className="flex-1 overflow-auto" style={{ background: mode === 'desktop' ? '#d0d0d0' : '#e8e8e8' }}>
        <div style={{ maxWidth: mode === 'desktop' ? 660 : 430, width: '100%', margin: isMobile ? '0 auto' : '16px auto 0', padding: isMobile ? '0' : '0 12px 32px' }} onClick={e => e.stopPropagation()}>
          {/* Email chrome */}
          <div style={{ background: '#fff', borderRadius: isMobile ? '0' : (mode === 'desktop' ? '10px 10px 0 0' : 12), border: isMobile ? 'none' : '1px solid #d0d0d0', borderBottom: (isMobile || mode === 'mobile') ? '1px solid #f0f0f0' : 'none', padding: '10px 14px', marginBottom: (isMobile || mode === 'mobile') ? 10 : 0 }}>
            {!isMobile && mode === 'desktop' && (
              <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
              </div>
            )}
            {(isMobile || mode === 'mobile') && (
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
              {(!isMobile && mode === 'desktop') && (
                <div><span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>De:</span><span style={{ color: '#1a73e8' }}>valentina@theskirtingfactoryllc.com</span></div>
              )}
              <div>
                <span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>Asunto:</span>
                <span style={{ color: '#111', fontWeight: (isMobile || mode === 'mobile') ? 600 : 400 }}>{entry.klaviyo_subject || entry.subject}</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#444', display: 'inline-block', width: 72 }}>Vista Previa:</span>
                <span style={{ color: '#888', fontStyle: preheader ? 'normal' : 'italic' }}>{preheader || 'Cargando…'}</span>
              </div>
            </div>
          </div>

          {/* Email iframe */}
          <div style={isMobile
            ? { background: '#fff', overflow: 'hidden' }
            : (mode === 'desktop'
              ? { background: '#fff', border: '1px solid #d0d0d0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }
              : { background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #d0d0d0', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }
            )
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

// ─── Status Labels for original page view ─────────────────────────────────────

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

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function EmailMarketingPage() {
  const { profile }                   = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const activeProfile = isViewingAs ? viewAsProfile : profile;

  const apiKey = activeProfile?.klaviyo_api_key ?? '';

  // Original state (local library fallback)
  const [assignments, setAssignments] = useState<EmailAssignment[]>([]);
  const [emailMap, setEmailMap]       = useState<Record<string, EmailEntry>>({});
  const [imgErrors, setImgErrors]     = useState<Set<string>>(new Set());
  const [sortDir, setSortDir]         = useState<'desc' | 'asc'>('desc');
  const [localPreview, setLocalPreview] = useState<EmailEntry | null>(null);

  // Klaviyo Monitor state
  const [tab, setTab] = useState<'campaigns' | 'flows' | 'calendar'>('calendar'); // Defaults to Calendar
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [lastSync, setLastSync]       = useState<Date | null>(null);
  const [campaigns, setCampaigns]     = useState<KvCampaign[]>([]);
  const [flows, setFlows]             = useState<KvFlow[]>([]);
  const [preview, setPreview]         = useState<{ templateId: string; title: string; subject?: string } | null>(null);


  const sync = useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
    setError('');
    try {
      const [camps, fls] = await Promise.all([
        fetchCampaigns(key),
        fetchFlows(key),
      ]);
      setCampaigns(camps);
      setFlows(fls);
      setLastSync(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync / Load Assignments on mount or profile change
  useEffect(() => {
    if (!activeProfile?.id) return;

    if (apiKey) {
      sync(apiKey);
    } else {
      setLoading(true);
      Promise.all([
        db.emailAssignments.getByClientId(activeProfile.id),
        fetch('/email-library/emails.json').then(r => r.json()).catch(() => [] as EmailEntry[]),
      ]).then(([asgns, emails]) => {
        setAssignments(asgns);
        const map: Record<string, EmailEntry> = {};
        for (const e of emails as EmailEntry[]) map[e.file] = e;
        setEmailMap(map);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [activeProfile?.id, apiKey, sync]);

  if (loading) {
    return <CenteredPageLoader isLoading={true}>{null}</CenteredPageLoader>;
  }

  // 1. Klaviyo Monitor Render (if API key is present)
  if (apiKey) {
    const filteredCampaigns = statusFilter === 'All'
      ? campaigns
      : campaigns.filter(c => c.status === statusFilter);

    const campaignStatuses = ['All', ...Array.from(new Set(campaigns.map(c => c.status)))];

    return (
      <div className="w-full space-y-6 flex-1 min-w-0 flex flex-col relative animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight">Email Marketing</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Monitoreo de envíos en tiempo real
              {lastSync && ` · sync ${lastSync.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
          <div className="flex items-center gap-2" />
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-red-600 dark:text-red-400 font-mono">{error}</p>
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Campañas',       val: campaigns.length, icon: <Mail className="w-4 h-4 text-violet-500" /> },
            { label: 'Enviadas',        val: campaigns.filter(c => c.status === 'Sent').length, icon: <Send className="w-4 h-4 text-emerald-500" /> },
            { label: 'Flows activos',   val: flows.filter(f => f.status === 'live').length, icon: <Zap className="w-4 h-4 text-amber-500" /> },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.07] rounded-2xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-zinc-50 dark:bg-white/5 flex items-center justify-center">{s.icon}</div>
              <div>
                <p className="text-[20px] font-black text-zinc-900 dark:text-white leading-none">{loading ? '—' : s.val}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-white/5 rounded-2xl w-max min-w-full sm:w-fit">
            {[
              { id: 'calendar', label: 'Calendario', count: campaigns.filter(c => c.status === 'Scheduled').length, icon: <CalendarClock className="w-3.5 h-3.5" /> },
              { id: 'campaigns', label: 'Campañas', count: campaigns.length, icon: <Mail className="w-3.5 h-3.5" /> },
              { id: 'flows', label: 'Flows', count: flows.length, icon: <Workflow className="w-3.5 h-3.5" /> },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all whitespace-nowrap ${
                  tab === t.id ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {t.icon}
                {t.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${tab === t.id ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400' : 'bg-zinc-200 dark:bg-white/10 text-zinc-400'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content — keyed to animate on tab change */}
        <div key={tab} className="animate-in fade-in duration-150">
          {tab === 'calendar' && (
            <CalendarView
              campaigns={campaigns}
              onPreview={(tId, title, subject) => setPreview({ templateId: tId, title, subject })}
            />
          )}

          {tab === 'campaigns' && (
            <div className="space-y-3">
              {campaigns.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {campaignStatuses.map(s => {
                    const st = s === 'All' ? null : CAMP_STATUS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                          statusFilter === s
                            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow'
                            : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10'
                        }`}
                      >
                        {s === 'All' ? 'Todas' : (st?.label ?? s)}
                      </button>
                    );
                  })}
                </div>
              )}
              {filteredCampaigns.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                  <Mail className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No hay campañas.</p>
                </div>
              )}
              {filteredCampaigns.map(c => (
                <CampaignCard
                  key={c.id}
                  c={c}
                  onPreview={() => c.message?.template_id && setPreview({
                    templateId: c.message.template_id,
                    title: c.name,
                    subject: c.message.subject,
                  })}
                />
              ))}
            </div>
          )}

          {tab === 'flows' && (
            <div className="space-y-2">
              {flows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                  <Workflow className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No hay flows activos.</p>
                </div>
              )}
              {flows.map(f => (
                <FlowRow
                  key={f.id}
                  f={f}
                  apiKey={apiKey}
                  onPreview={(tId, title, subject) => setPreview({ templateId: tId, title, subject })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Preview Modal for Klaviyo Emails */}
        {preview && (
          <PreviewModal
            templateId={preview.templateId}
            apiKey={apiKey}
            title={preview.title}
            subject={preview.subject}
            onClose={() => setPreview(null)}
          />
        )}
      </div>
    );
  }

  // 2. Fallback: Original Database assignments library (if no API Key is present)
  const visible = assignments
    .map(a => ({ assignment: a, email: emailMap[a.email_file] }))
    .filter(({ email }) => !!email)
    .sort((a, b) => {
      const ta = new Date(a.assignment.created_at).getTime();
      const tb = new Date(b.assignment.created_at).getTime();
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });

  return (
    <CenteredPageLoader isLoading={loading}>
    <div className="w-full flex-1 min-w-0 flex flex-col relative animate-in fade-in duration-500">
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
                onClick={() => setLocalPreview(email)}
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

      {/* Preview overlay for local templates */}
      {localPreview && <PreviewOverlay entry={localPreview} onClose={() => setLocalPreview(null)} />}
    </div>
    </CenteredPageLoader>
  );
}
