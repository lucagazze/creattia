import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, Mail, Workflow, ChevronDown, ChevronRight,
  Eye, Key, ExternalLink, AlertCircle, X, Monitor, Smartphone,
  Clock, Send, CalendarClock, Archive, Zap, Check, Copy,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import type { ClientProfile } from '../services/db';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KvClient extends Pick<ClientProfile, 'id' | 'business_name' | 'klaviyo_api_key'> {}

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

// ─── Klaviyo helpers ─────────────────────────────────────────────────────────

const KLAVIYO_REVISION = '2024-10-15';

const kFetch = async (path: string, apiKey: string) => {
  const res = await fetch(`/api/klaviyo/${path}`, {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Revision: KLAVIYO_REVISION,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('KLAVIYO ERROR RESPONSE FULL:', txt, 'FOR PATH:', path);
    throw new Error(`${res.status}: ${txt}`);
  }
  return res.json();
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
  return (data.data ?? []).map((c: any) => {
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
  });
};

const fetchFlows = async (apiKey: string): Promise<KvFlow[]> => {
  const data = await kFetch(`flows?sort=-updated`, apiKey);
  return (data.data ?? []).map((f: any) => ({
    id: f.id,
    name: f.attributes.name,
    status: f.attributes.status,
    trigger_type: f.attributes.trigger_type,
    created: f.attributes.created,
    updated: f.attributes.updated,
  }));
};

const fetchFlowEmails = async (flowId: string, apiKey: string): Promise<KvFlowEmail[]> => {
  const data = await kFetch(
    `flow-actions?filter=equals(flow.id,%22${flowId}%22),equals(action_type,%22SEND_EMAIL%22)&include=flow-messages`,
    apiKey,
  );
  const msgMap = new Map<string, any>();
  for (const item of data.included ?? []) {
    if (item.type === 'flow-message') {
      msgMap.set(item.id, {
        id: item.id,
        name: item.attributes.name,
        subject: item.attributes.subject,
        template_id: item.relationships?.template?.data?.id,
      });
    }
  }
  return (data.data ?? []).map((a: any) => {
    const msgIds: string[] = a.relationships?.['flow-messages']?.data?.map((d: any) => d.id) ?? [];
    return {
      id: a.id,
      status: a.attributes.status,
      message: msgIds[0] ? msgMap.get(msgIds[0]) : undefined,
    };
  });
};

const fetchTemplateHtml = async (templateId: string, apiKey: string): Promise<string> => {
  const data = await kFetch(`templates/${templateId}`, apiKey);
  return data.data?.attributes?.html ?? '';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
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
        <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{ background: mode === 'desktop' ? '#d0d0d0' : '#e8e8e8' }}>
        {loading && (
          <div className="flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-zinc-600 border-t-violet-500 rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {html && !loading && (
          <div style={{ maxWidth: mode === 'desktop' ? 660 : 430, width: '100%', margin: '16px auto 0', padding: '0 12px 32px' }}>
            <div style={{ background: '#fff', borderRadius: mode === 'desktop' ? '10px 10px 0 0' : 12, border: '1px solid #d0d0d0', borderBottom: 'none', padding: '10px 14px' }}>
              {mode === 'desktop' && (
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
              srcDoc={html}
              onLoad={onIframeLoad}
              sandbox="allow-same-origin allow-popups"
              style={{ display: 'block', width: '100%', height: iframeH, border: '1px solid #d0d0d0', background: '#fff' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ c, onPreview }: { c: KvCampaign; onPreview: () => void }) {
  const st = CAMP_STATUS[c.status] ?? { label: c.status, cls: 'bg-zinc-100 dark:bg-white/10 text-zinc-500' };
  const dateLabel = c.status === 'Sent' ? fmtDate(c.send_time) :
    c.status === 'Scheduled' ? fmtDate(c.scheduled_at) : fmtDate(c.created_at);
  const dateIcon = c.status === 'Sent' ? <Send className="w-3 h-3" /> :
    c.status === 'Scheduled' ? <CalendarClock className="w-3 h-3" /> : <Clock className="w-3 h-3" />;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.07] rounded-2xl px-5 py-4 flex items-start gap-4 hover:border-zinc-300 dark:hover:border-white/15 transition-all">
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
      </div>
      {c.message?.template_id && (
        <button
          onClick={onPreview}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-violet-600 hover:text-white transition-all"
        >
          <Eye className="w-3.5 h-3.5" />Ver
        </button>
      )}
    </div>
  );
}

// ─── Flow row ─────────────────────────────────────────────────────────────────

function FlowRow({ f, apiKey, onPreview }: {
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

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-white/5">
          {error && (
            <p className="px-5 py-3 text-[12px] text-red-500">{error}</p>
          )}
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
                  {a.message?.name && (
                    <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">{a.message.name}</p>
                  )}
                  {a.message?.subject && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono">{a.message.subject}</p>
                  )}
                  {!a.message?.name && !a.message?.subject && (
                    <p className="text-[11px] text-zinc-400">Email sin nombre</p>
                  )}
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
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KlaviyoMonitorPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [clients, setClients] = useState<KvClient[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const [tab, setTab] = useState<'campaigns' | 'flows'>('campaigns');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [campaigns, setCampaigns] = useState<KvCampaign[]>([]);
  const [flows, setFlows] = useState<KvFlow[]>([]);

  const [preview, setPreview] = useState<{ templateId: string; title: string; subject?: string } | null>(null);

  // Admin guard
  useEffect(() => {
    if (profile && !profile.is_admin) navigate('/', { replace: true });
  }, [profile, navigate]);

  // Load clients
  useEffect(() => {
    db.clients.getAllWithIntegrations().then(setClients);
  }, []);

  const selectedClient = clients.find(c => c.id === selectedId);
  const apiKey = selectedClient?.klaviyo_api_key ?? '';

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

  // Auto-sync when client changes
  useEffect(() => {
    setCampaigns([]); setFlows([]); setError(''); setLastSync(null);
    if (apiKey) sync(apiKey);
  }, [selectedId, apiKey, sync]);

  const saveApiKey = async () => {
    if (!selectedId || !apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await db.clients.updateField(selectedId, { klaviyo_api_key: apiKeyInput.trim() });
      setClients(prev => prev.map(c => c.id === selectedId ? { ...c, klaviyo_api_key: apiKeyInput.trim() } : c));
      setApiKeyInput('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingKey(false);
    }
  };

  if (!profile?.is_admin) return null;

  const filteredCampaigns = statusFilter === 'All'
    ? campaigns
    : campaigns.filter(c => c.status === statusFilter);

  const campaignStatuses = ['All', ...Array.from(new Set(campaigns.map(c => c.status)))];

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-black text-zinc-900 dark:text-white tracking-tight">Klaviyo Monitor</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Campañas y flows por cliente
            {lastSync && ` · sync ${lastSync.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Client selector */}
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="text-[13px] font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={{ colorScheme: 'light' }}
          >
            <option value="">Seleccionar cliente…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.business_name}</option>
            ))}
          </select>
          {apiKey && (
            <button
              onClick={() => sync(apiKey)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sincronizar
            </button>
          )}
        </div>
      </div>

      {/* No client selected */}
      {!selectedId && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <Workflow className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Seleccioná un cliente para ver sus emails de Klaviyo.</p>
        </div>
      )}

      {/* No API key */}
      {selectedId && !apiKey && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.07] rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Key className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-zinc-900 dark:text-white mb-1">
                {selectedClient?.business_name} no tiene API key de Klaviyo
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-4">
                Ingresá la Private API Key del account de Klaviyo del cliente.
                La encontrás en <strong>Klaviyo → Settings → API Keys</strong>.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveApiKey()}
                  placeholder="pk_live_xxxxxxxxxxxxxxxxxxxx"
                  className="flex-1 text-[13px] font-mono bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-zinc-400"
                />
                <button
                  onClick={saveApiKey}
                  disabled={!apiKeyInput.trim() || savingKey}
                  className="px-4 py-2.5 rounded-xl text-[12px] font-bold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 transition-all"
                >
                  {savingKey ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-600 dark:text-red-400 font-mono">{error}</p>
        </div>
      )}

      {/* Main content */}
      {selectedId && apiKey && (
        <>
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
          <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-white/5 rounded-2xl w-fit">
            {(['campaigns', 'flows'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
                  tab === t ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {t === 'campaigns' ? <Mail className="w-3.5 h-3.5" /> : <Workflow className="w-3.5 h-3.5" />}
                {t === 'campaigns' ? 'Campañas' : 'Flows'}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${tab === t ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400' : 'bg-zinc-200 dark:bg-white/10 text-zinc-400'}`}>
                  {t === 'campaigns' ? campaigns.length : flows.length}
                </span>
              </button>
            ))}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
            </div>
          )}

          {/* Campaigns tab */}
          {!loading && tab === 'campaigns' && (
            <div className="space-y-3">
              {/* Status filter */}
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
                  <p className="text-sm">No hay campañas{statusFilter !== 'All' ? ` con estado "${CAMP_STATUS[statusFilter]?.label ?? statusFilter}"` : ''}.</p>
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

          {/* Flows tab */}
          {!loading && tab === 'flows' && (
            <div className="space-y-2">
              {flows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                  <Workflow className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No hay flows.</p>
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
        </>
      )}

      {/* Preview modal */}
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
