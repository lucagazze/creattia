import React, { useEffect, useState, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import { useUnread } from '../contexts/UnreadContext';
import {
  RefreshCw, AlertCircle, Loader2, Send, Sparkles,
  Search, CheckCircle, Clock, Inbox, ExternalLink, Bot,
  Globe, Facebook, Instagram, MessageCircle, Mail,
  BookOpen, ShoppingBag, Plus, Trash2, Link, Mic, ChevronLeft, X, Play
} from 'lucide-react';
import { AppleLoader } from '../components/ui/AppleLoader';
import { CustomAudioPlayer } from '../components/ui/CustomAudioPlayer';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';

const fmtTime = (ts: any) => {
  if (!ts) return '';
  let d: Date;
  if (typeof ts === 'number') {
    if (ts < 10000000000) {
      d = new Date(ts * 1000);
    } else {
      d = new Date(ts);
    }
  } else if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      const num = parseInt(ts, 10);
      if (num < 10000000000) {
        d = new Date(num * 1000);
      } else {
        d = new Date(num);
      }
    } else {
      d = new Date(ts);
    }
  } else {
    d = new Date(ts);
  }

  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const fmtSeconds = (s: number) => {
  if (!s || isNaN(s)) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${Math.round(s)}s`;
};

const renderMessageContent = (msg: any, contactName = 'Cliente', onImageClick?: (url: string) => void, onVideoClick?: (url: string) => void) => {
  if (!msg) return null;

  // 1. Check if it's an email content type with HTML content
  const emailHtml = msg.content_attributes?.email?.html_content || msg.content_attributes?.html_content;
  
  // Also check if raw content is HTML
  const rawContent = msg.content || '';
  const isRawHtml = rawContent.trim().toLowerCase().startsWith('<html') || 
                    rawContent.trim().toLowerCase().startsWith('<!doctype') || 
                    (rawContent.includes('<div') && rawContent.includes('</div>')) || 
                    (rawContent.includes('<p') && rawContent.includes('</p>'));

  const hasHtml = !!emailHtml || isRawHtml;
  const htmlToRender = emailHtml || rawContent;

  let contentNode = null;

  if (hasHtml) {
    const cleanHtml = DOMPurify.sanitize(htmlToRender, { USE_PROFILES: { html: true } });

    contentNode = (
      <div 
        className="email-content-wrapper overflow-x-auto text-left max-w-full text-zinc-800 dark:text-zinc-100 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <div 
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
          className="prose dark:prose-invert prose-sm max-w-none break-words email-body"
        />
      </div>
    );
  } else {
    // Regular text content with line breaks
    contentNode = (
      <span className="whitespace-pre-wrap break-words">{msg.content || ''}</span>
    );
  }

  // 2. Render attachments if any
  const attachments = msg.attachments;
  if (Array.isArray(attachments) && attachments.length > 0) {
    return (
      <div className="space-y-2.5">
        {msg.content && contentNode}
        <div className="space-y-2 mt-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50">
          {attachments.map((att: any, idx: number) => {
            const fType = (att.file_type || '').toLowerCase();
            const url = att.data_url || att.data?.url || '';
            if (!url) return null;

            if (fType.includes('image') || url.match(/\.(jpeg|jpg|gif|png|webp)/i)) {
              return (
                <div key={idx} className="relative group max-w-xs">
                  <img 
                    src={url} 
                    alt="Adjunto" 
                    className="max-h-48 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity border border-zinc-200 dark:border-zinc-700"
                    onClick={() => onImageClick ? onImageClick(url) : window.open(url, '_blank')}
                  />
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg text-[10px] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ExternalLink className="w-3 h-3" /> Ver original
                  </a>
                </div>
              );
            }

            if (fType.includes('audio') || url.match(/\.(mp3|wav|ogg|oga|opus|m4a)/i)) {
              return (
                <div key={idx} className="mt-1">
                  <CustomAudioPlayer src={url} mimeType={fType} />
                </div>
              );
            }

            if (fType.includes('video') || url.match(/\.(mp4|webm|mov|avi)/i)) {
              return (
                <div 
                  key={idx} 
                  className="relative group max-w-xs mt-1 cursor-pointer overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-950 flex items-center justify-center"
                  onClick={() => onVideoClick?.(url)}
                >
                  <video src={url} className="max-h-48 pointer-events-none object-cover opacity-85" />
                  {/* Centered Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35 hover:bg-black/45 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-white/95 dark:bg-zinc-900/95 shadow-lg flex items-center justify-center text-zinc-900 dark:text-white transform group-hover:scale-105 transition-transform duration-200">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>
              );
            }

            // Fallback for document/file
            const fileName = url.split('/').pop()?.split('?')[0] || 'Archivo adjunto';
            return (
              <a 
                key={idx}
                href={url} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 p-2.5 bg-zinc-55 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-blue-600 dark:text-blue-400 hover:underline text-[12px] font-bold transition-all w-fit"
              >
                <Link className="w-3.5 h-3.5" />
                <span className="truncate max-w-[200px]">{fileName}</span>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  // If no attachments, return just the contentNode
  if (!msg.content && !hasHtml) {
    return <span className="italic opacity-60">📎 Archivo adjunto</span>;
  }

  return contentNode;
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500',
  resolved: 'bg-emerald-500',
  pending: 'bg-amber-500',
};

export default function MensajeriaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile: authProfile, loading: authLoading, session } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const isAdmin = authProfile?.is_admin;
  const { showToast } = useToast();
  const { markRead, setUnreadCount } = useUnread();
  const isProfileLoading = isViewingAs ? (viewAsProfile === null) : authLoading;

  const cwUrl = (profile as any)?.chatwoot_url;
  const cwToken = (profile as any)?.chatwoot_token;

  const profileId = (profile as any)?.id;
  const convCacheKey = profileId ? `car_convs_${profileId}` : null;
  const [conversations, setConversations] = useState<any[]>(() => {
    try {
      const key = profileId ? `car_convs_${profileId}` : null;
      if (!key) return [];
      const cached = sessionStorage.getItem(key);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [isFirstLoadDone, setIsFirstLoadDone] = useState(false);
  const [bgFetchDone, setBgFetchDone] = useState(true);
  const [loadingInboxes, setLoadingInboxes] = useState(true);
  const [loadingMetas, setLoadingMetas] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isFirstLoadDone) {
      const t = setTimeout(() => setMounted(true), 150);
      return () => clearTimeout(t);
    } else {
      setMounted(false);
    }
  }, [isFirstLoadDone]);



  // Synchronize conversations list to sessionStorage cache automatically on every state change
  useEffect(() => {
    if (convCacheKey && conversations.length > 0) {
      try {
        sessionStorage.setItem(convCacheKey, JSON.stringify(conversations.slice(0, 300)));
      } catch (e) {
        console.warn("Error caching conversations:", e);
      }
    }
  }, [conversations, convCacheKey]);
  const [convMeta, setConvMeta] = useState<{ all_count: number; unassigned_count: number; assigned_count: number } | null>(() => {
    try {
      const saved = sessionStorage.getItem(`car_conv_meta_${profile?.id || 'default'}`);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [channelMetas, setChannelMetas] = useState<Record<string, { all_count: number; unassigned_count: number; assigned_count: number }>>(() => {
    try {
      const saved = sessionStorage.getItem(`car_channel_metas_${profile?.id || 'default'}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [loadingSuggestion, setLoadingSuggestion] = useState<string | null>(null);
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'other'>('all');
  const [showPendingOnly, setShowPendingOnly] = useState<boolean>(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [swipeTouchStartX, setSwipeTouchStartX] = useState<number | null>(null);
  const [activeImagePreview, setActiveImagePreview] = useState<string | null>(null);
  const [activeVideoPreview, setActiveVideoPreview] = useState<string | null>(null);
  const [imagePreviewLoading, setImagePreviewLoading] = useState(false);

  useEffect(() => {
    if (activeImagePreview) {
      setImagePreviewLoading(true);
    } else {
      setImagePreviewLoading(false);
    }
  }, [activeImagePreview]);
  
  // Sidebar State Variables
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'canned' | 'shopify'>('canned');

  const [cannedResponses, setCannedResponses] = useState<any[]>([]);
  const [cannedSearch, setCannedSearch] = useState('');
  const [loadingCanned, setLoadingCanned] = useState(false);
  const [showNewCannedForm, setShowNewCannedForm] = useState(false);
  const [newCannedTitle, setNewCannedTitle] = useState('');
  const [newCannedShortcut, setNewCannedShortcut] = useState('');
  const [newCannedContent, setNewCannedContent] = useState('');
  const [savingCanned, setSavingCanned] = useState(false);

  const [shopifySearch, setShopifySearch] = useState('');
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [customLinks, setCustomLinks] = useState<any[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [totalOpenCount, setTotalOpenCount] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; conv: any } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const isLoadingOlderRef = useRef(false);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [failedMsgIds, setFailedMsgIds] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'priority'>('latest');
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const audioCacheRef = useRef<Record<string, string>>({});
  // Persist manuallyUnread in localStorage so it survives reloads
  const unreadStorageKey = `car_manually_unread_${profile?.id || 'default'}`;
  const [manuallyUnread, setManuallyUnreadRaw] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(`car_manually_unread_${(profile as any)?.id || 'default'}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const setManuallyUnread = (updater: Set<number> | ((prev: Set<number>) => Set<number>)) => {
    setManuallyUnreadRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem(unreadStorageKey, JSON.stringify([...next])); } catch {}
      // Dispatch custom event to notify UnreadContext in the same window
      window.dispatchEvent(new Event('car_manually_unread_update'));
      return next;
    });
  };

  const [prevProfileId, setPrevProfileId] = useState(profileId);
  if (profileId !== prevProfileId) {
    setPrevProfileId(profileId);
    audioCacheRef.current = {};
    
    // Clear/load cached conversations
    const key = profileId ? `car_convs_${profileId}` : null;
    let cachedConvs: any[] = [];
    if (key) {
      try {
        const cached = sessionStorage.getItem(key);
        if (cached) cachedConvs = JSON.parse(cached);
      } catch {}
    }
    setConversations(cachedConvs);
    
    // Clear/load cached convMeta
    let cachedMeta: any = null;
    if (profileId) {
      try {
        const saved = sessionStorage.getItem(`car_conv_meta_${profileId}`);
        if (saved) cachedMeta = JSON.parse(saved);
      } catch {}
    }
    setConvMeta(cachedMeta);

    // Clear/load cached channelMetas
    let cachedChannelMetas: any = {};
    if (profileId) {
      try {
        const saved = sessionStorage.getItem(`car_channel_metas_${profileId}`);
        if (saved) cachedChannelMetas = JSON.parse(saved);
      } catch {}
    }
    setChannelMetas(cachedChannelMetas);

    setIsFirstLoadDone(false);
    setLoadingInboxes(true);
    setLoadingMetas(true);
    setLoading(true);
    setTotalOpenCount(0);
    setSelected(null);
    setMessages([]);
    setInboxes([]);
    setCustomLinks([]);
    setCannedResponses([]);
    setShopifyProducts([]);
    setSummary(null);
    setSelectedIds(new Set());
  }

  const isConvUnread = useCallback((c: any) => {
    if (!c) return false;
    if (c.status === 'resolved') return false;

    // Check if the last non-activity message is outgoing (message_type === 1)
    const sortedMsgs = [...(c.messages || [])].sort((x, y) => {
      const timeX = typeof x.created_at === 'number' ? x.created_at : new Date(x.created_at).getTime() / 1000;
      const timeY = typeof y.created_at === 'number' ? y.created_at : new Date(y.created_at).getTime() / 1000;
      return timeX - timeY;
    });
    const lastRealMsg = [...sortedMsgs].reverse().find((m: any) => m?.message_type !== 2) || 
                        c.last_non_activity_message || 
                        (sortedMsgs.length > 0 ? sortedMsgs[sortedMsgs.length - 1] : null);

    if (lastRealMsg && lastRealMsg.message_type === 1) {
      return false; // Outgoing message means we already replied
    }

    const isManualUnread = manuallyUnread.has(c.id);
    const unread = isManualUnread ? Math.max(1, c.unread_count || 0) : (c.unread_count || 0);
    return unread > 0 || isManualUnread;
  }, [manuallyUnread]);

  // Synchronize the unreadCount state in UnreadContext — wait for background pages to finish
  useEffect(() => {
    if (!loading && isFirstLoadDone && bgFetchDone) {
      const count = conversations.filter(isConvUnread).length;
      setUnreadCount(count);
    }
  }, [conversations, isConvUnread, loading, isFirstLoadDone, bgFetchDone, setUnreadCount]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // true when user has manually scrolled up — prevents auto-scroll-to-bottom on image load
  const userScrolledUpRef = useRef(false);

  const selectedRef = useRef<any>(null);
  selectedRef.current = selected;


  const getInboxIdForChannel = useCallback((chKey: string) => {
    if (chKey === 'all') return undefined;
    const inbox = inboxes.find(i => {
      const type = (i.channel_type || '').toLowerCase();
      if (chKey === 'whatsapp') return type.includes('whatsapp');
      if (chKey === 'instagram') return type.includes('instagram');
      if (chKey === 'facebook') return type.includes('facebook') || type.includes('page');
      if (chKey === 'email') return type.includes('email');
      return false;
    });
    return inbox?.id;
  }, [inboxes]);

  // Load inboxes once when credentials are ready
  useEffect(() => {
    if (isProfileLoading) return;
    if (!cwUrl || !cwToken) {
      setLoadingInboxes(false);
      return;
    }
    const initInboxes = async () => {
      setLoadingInboxes(true);
      try {
        const inboxList = await chatwoot.getInboxes(cwUrl, cwToken).catch(() => []);
        setInboxes(inboxList);
      } catch (err) {
        console.error("Error fetching inboxes on mount:", err);
      } finally {
        setLoadingInboxes(false);
      }
    };
    initInboxes();
  }, [cwUrl, cwToken, isProfileLoading]);

  // Load total counts for each channel key and overall counts immediately in parallel
  useEffect(() => {
    if (isProfileLoading) return;
    if (!cwUrl || !cwToken) {
      setLoadingMetas(false);
      return;
    }
    if (loadingInboxes) {
      return;
    }

    const loadChannelMetas = async () => {
      setLoadingMetas(true);
      try {
        // Fetch overall meta
        const overallMetaRes = await chatwoot.getConversationsMeta(cwUrl, cwToken, statusFilter).catch(() => null);
        const mOverall = overallMetaRes?.meta || overallMetaRes;
        if (mOverall) {
          const newMeta = {
            all_count: mOverall.all_count ?? 0,
            unassigned_count: mOverall.unassigned_count ?? 0,
            assigned_count: mOverall.assigned_count ?? 0
          };
          setConvMeta(newMeta);
          try { sessionStorage.setItem(`car_conv_meta_${profile?.id || 'default'}`, JSON.stringify(newMeta)); } catch {}
        }

        if (inboxes.length === 0) {
          setLoadingMetas(false);
          return;
        }

        const metas: Record<string, { all_count: number; unassigned_count: number; assigned_count: number }> = {};
        await Promise.all(inboxes.map(async (inbox: any) => {
          try {
            const metaRes = await chatwoot.getConversationsMeta(cwUrl, cwToken, statusFilter, inbox.id);
            const m = metaRes?.meta || metaRes;
            if (m) {
              const type = (inbox.channel_type || '').toLowerCase();
              let key = 'other';
              if (type.includes('whatsapp')) key = 'whatsapp';
              else if (type.includes('instagram')) key = 'instagram';
              else if (type.includes('facebook') || type.includes('page')) key = 'facebook';
              else if (type.includes('email')) key = 'email';

              if (!metas[key]) {
                metas[key] = { all_count: 0, unassigned_count: 0, assigned_count: 0 };
              }
              metas[key].all_count += m.all_count ?? 0;
              metas[key].unassigned_count += m.unassigned_count ?? 0;
              metas[key].assigned_count += m.assigned_count ?? 0;
            }
          } catch (err) {
            console.error('Error fetching meta for inbox', inbox.id, err);
          }
        }));
        setChannelMetas(metas);
        try { sessionStorage.setItem(`car_channel_metas_${profile?.id || 'default'}`, JSON.stringify(metas)); } catch {}
      } catch (err) {
        console.error('Error loading channel metas:', err);
      } finally {
        setLoadingMetas(false);
      }
    };

    loadChannelMetas();
  }, [cwUrl, cwToken, inboxes, statusFilter, profile?.id, loadingInboxes, isProfileLoading]);

  const fetchConversationsData = useCallback(async () => {
    if (!cwUrl || !cwToken) return null;
    const inboxId = getInboxIdForChannel(channelFilter);
    const [firstPageRes, openPage1Res] = await Promise.all([
      chatwoot.getConversationsPage(cwUrl, cwToken, statusFilter, 1, inboxId),
      chatwoot.getConversationsPage(cwUrl, cwToken, 'open', 1),
    ]);

    const { payload: firstPayload, hasMore: firstHasMore, meta } = firstPageRes;
    const openCount = openPage1Res.meta?.all_count ?? 0;
    const openPayload = openPage1Res.payload || [];

    // Combine first pages into the initial set
    const initialConversations = [...firstPayload, ...openPayload];

    // If there are more open pages, build a background promise (not awaited here)
    let backgroundFetch: Promise<any[]> | null = null;
    if (openCount > 25) {
      const totalOpenPages = Math.min(15, Math.ceil(openCount / 25));
      const pagesToFetch = Array.from({ length: totalOpenPages - 1 }, (_, i) => i + 2);
      backgroundFetch = Promise.all(
        pagesToFetch.map(p =>
          chatwoot.getConversationsPage(cwUrl, cwToken, 'open', p).catch(() => ({ payload: [] }))
        )
      ).then(results => results.flatMap(r => r.payload || []));
    }

    return {
      initialConversations,
      firstHasMore,
      meta,
      openCount,
      backgroundFetch,
    };
  }, [cwUrl, cwToken, statusFilter, channelFilter, getInboxIdForChannel]);

  const loadConversations = useCallback(async () => {
    if (isProfileLoading) return;
    if (!cwUrl || !cwToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setCurrentPage(1);
    setHasMore(false);

    try {
      const [data, sm] = await Promise.all([
        fetchConversationsData(),
        chatwoot.getSummary(cwUrl, cwToken, Math.floor(new Date().setHours(0,0,0,0)/1000), Math.floor(Date.now()/1000)).catch(() => null),
      ]);

      if (!data) return;
      setSummary(sm);
      setTotalOpenCount(data.openCount || 0);

      if (data.meta && channelFilter === 'all') {
        setConvMeta({
          all_count: data.meta.all_count ?? 0,
          unassigned_count: data.meta.unassigned_count ?? 0,
          assigned_count: data.meta.assigned_count ?? 0
        });
      }

      // Show conversations from first pages immediately
      setConversations(prev => {
        const apiMap = new Map<number, any>();
        prev.forEach((c: any) => { if (c && c.id) apiMap.set(c.id, c); });
        data.initialConversations.forEach((c: any) => { if (c && c.id) apiMap.set(c.id, c); });
        return Array.from(apiMap.values());
      });

      setHasMore(data.firstHasMore);
      setCurrentPage(1);

      // Hide loader NOW — don't wait for background pages
      setLoading(false);

      // Merge remaining open pages in background
      if (data.backgroundFetch) {
        setBgFetchDone(false);
        data.backgroundFetch.then((extraConvs: any[]) => {
          if (extraConvs && extraConvs.length > 0) {
            setConversations(prev => {
              const apiMap = new Map<number, any>();
              prev.forEach((c: any) => { if (c && c.id) apiMap.set(c.id, c); });
              extraConvs.forEach((c: any) => { if (c && c.id) apiMap.set(c.id, c); });
              return Array.from(apiMap.values());
            });
          }
          setBgFetchDone(true);
        }).catch(() => { setBgFetchDone(true); });
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }, [cwUrl, cwToken, channelFilter, fetchConversationsData, isProfileLoading]);

  // Sync first load completion when all fetches are done
  useEffect(() => {
    if (!loading && !loadingMetas && !loadingInboxes) {
      setIsFirstLoadDone(true);
    }
  }, [loading, loadingMetas, loadingInboxes]);

  const loadMoreConversations = useCallback(async () => {
    if (!cwUrl || !cwToken || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      const inboxId = getInboxIdForChannel(channelFilter);
      const { payload, hasMore: more } = await chatwoot.getConversationsPage(cwUrl, cwToken, statusFilter, nextPage, inboxId);
      setConversations(prev => {
        const prevIds = new Set(prev.map((c: any) => c.id));
        const filteredPayload = payload.filter((c: any) => !prevIds.has(c.id));
        return [...prev, ...filteredPayload];
      });
      setCurrentPage(nextPage);
      setHasMore(more);
    } catch {} finally {
      setLoadingMore(false);
    }
  }, [cwUrl, cwToken, currentPage, loadingMore, hasMore, statusFilter, channelFilter, getInboxIdForChannel]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // WebSocket real-time connection to Chatwoot
  useEffect(() => {
    if (!cwUrl || !cwToken) return;
    let ws: WebSocket | null = null;
    let pingInterval: any = null;
    let reconnectTimeout: any = null;

    const connect = async () => {
      try {
        const { pubsub_token } = await chatwoot.getProfile(cwUrl, cwToken);
        if (!pubsub_token) return;

        const wsUrl = cwUrl.replace(/^https?/, (m: string) => m === 'https' ? 'wss' : 'ws') + '/cable';
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws!.send(JSON.stringify({
            command: 'subscribe',
            identifier: JSON.stringify({ channel: 'RoomChannel', pubsub_token })
          }));
          pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            const frame = JSON.parse(event.data);
            if (frame.type === 'ping' || frame.type === 'welcome' || frame.type === 'confirm_subscription') return;
            const msg = frame.message;
            if (!msg?.event) return;

            if (msg.event === 'message.created') {
              const d = msg.data;
              // Update last message preview in conversation list
              setConversations(prev => prev.map(c =>
                c.id === d.conversation_id
                  ? {
                      ...c,
                      last_activity_at: d.created_at,
                      messages: [d, ...(c.messages || [])],
                      unread_count: selectedRef.current?.id === d.conversation_id ? 0 : (c.unread_count || 0) + (d?.message_type === 0 ? 1 : 0),
                      ...(d?.message_type !== 2 ? { last_non_activity_message: d } : {})
                    }
                  : c
              ));
              // Append to open chat
              if (selectedRef.current?.id === d.conversation_id) {
                setMessages(prev => {
                  if (prev.find((m: any) => m.id === d.id)) return prev;
                  return [...prev, d];
                });
              }
            } else if (msg.event === 'conversation.created') {
              const d = msg.data;
              setConversations(prev => prev.find(c => c.id === d.id) ? prev : [d, ...prev]);
            } else if (msg.event === 'conversation.read') {
              const d = msg.data;
              setConversations(prev => prev.map(c => c.id === d.id ? { ...c, unread_count: 0 } : c));
            } else if (msg.event === 'conversation.status_changed') {
              const d = msg.data;
              const shouldRemove = statusFilter !== 'all' && statusFilter !== d.status;
              setConversations(prev => shouldRemove
                ? prev.filter(c => c.id !== d.id)
                : prev.map(c => c.id === d.id ? { ...c, status: d.status } : c)
              );
              if (selectedRef.current?.id === d.id) setSelected((s: any) => s ? { ...s, status: d.status } : s);
            } else if (msg.event === 'conversation.updated') {
              const d = msg.data;
              setConversations(prev => prev.map(c => c.id === d.id ? { ...c, ...d } : c));
            }
          } catch {}
        };

        ws.onclose = () => {
          clearInterval(pingInterval);
          reconnectTimeout = setTimeout(connect, 5000);
        };
        ws.onerror = () => ws?.close();
      } catch {}
    };

    connect();
    return () => {
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [cwUrl, cwToken]);

  // Poll conversations list every 5s with visibility checks
  useEffect(() => {
    if (!cwUrl || !cwToken) return;
    const refreshConvList = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await fetchConversationsData();
        if (!data) return;
        if (data.openCount !== undefined) {
          setTotalOpenCount(data.openCount);
        }
        // Merge first pages immediately
        setConversations(prev => {
          const apiMap = new Map<number, any>();
          prev.forEach((c: any) => { if (c && c.id) apiMap.set(c.id, c); });
          data.initialConversations.forEach((c: any) => { if (c && c.id) apiMap.set(c.id, c); });
          return Array.from(apiMap.values());
        });
        // Merge remaining pages in background
        if (data.backgroundFetch) {
          data.backgroundFetch.then((extraConvs: any[]) => {
            if (!extraConvs || extraConvs.length === 0) return;
            setConversations(prev => {
              const apiMap = new Map<number, any>();
              prev.forEach((c: any) => { if (c && c.id) apiMap.set(c.id, c); });
              extraConvs.forEach((c: any) => { if (c && c.id) apiMap.set(c.id, c); });
              return Array.from(apiMap.values());
            });
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[MensajeriaPage] Error polling conversations:', err);
      }
    };
    const interval = setInterval(refreshConvList, 5000);
    return () => clearInterval(interval);
  }, [cwUrl, cwToken, fetchConversationsData]);

  const bufferToBase64 = (buffer: ArrayBuffer): Promise<string> => {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer]);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const fetchAndTranscribe = async (url: string): Promise<string | null> => {
    try {
      const proxyUrl = `/api/scrape-website?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const base64 = await bufferToBase64(arrayBuffer);
      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType: 'audio/wav' }),
      });
      if (!transcribeRes.ok) return null;
      const data = await transcribeRes.json();
      return data.text || null;
    } catch (err) {
      console.error('Error transcribing audio message:', err);
      return null;
    }
  };

  const generateAiDraft = async () => {
    if (!profile?.id || !selected || messages.length === 0) return;
    setGeneratingDraft(true);
    setSendError(null);
    try {
      const realMessages = messages.filter((m: any) => m?.message_type !== 2);
      const last25 = realMessages.slice(-25);

      // Transcribe any voice note in the last 25 messages
      const history = await Promise.all(last25.map(async (m: any) => {
        const who = m?.message_type === 1 ? 'Agente' : (contact(selected).name || 'Cliente');
        let audioText = '';
        if (Array.isArray(m.attachments) && m.attachments.length > 0) {
          const audioAttachment = m.attachments.find((att: any) => {
            const fType = (att.file_type || '').toLowerCase();
            const url = att.data_url || att.data?.url || '';
            return url && (fType.includes('audio') || url.match(/\.(mp3|wav|ogg|oga|opus|m4a)/i));
          });
          if (audioAttachment) {
            const url = audioAttachment.data_url || audioAttachment.data?.url || '';
            if (audioCacheRef.current[url]) {
              audioText = ` [Audio transcrito: "${audioCacheRef.current[url]}"]`;
            } else {
              const text = await fetchAndTranscribe(url);
              if (text) {
                audioCacheRef.current[url] = text;
                audioText = ` [Audio transcrito: "${text}"]`;
              } else {
                audioText = ' [audio]';
              }
            }
          }
        }
        const content = m?.content || '';
        const bodyContent = content + audioText;
        return `${who}: ${bodyContent.trim() || '[archivo adjunto]'}`;
      }));

      const lastIncoming = [...last25].reverse().find((m: any) => m?.message_type === 0);
      const lastMsg = last25[last25.length - 1];

      let itemText = lastIncoming?.content || lastMsg?.content || '';
      if (lastIncoming && Array.isArray(lastIncoming.attachments)) {
        const audioAttachment = lastIncoming.attachments.find((att: any) => {
          const fType = (att.file_type || '').toLowerCase();
          const url = att.data_url || att.data?.url || '';
          return url && (fType.includes('audio') || url.match(/\.(mp3|wav|ogg|oga|opus|m4a)/i));
        });
        if (audioAttachment) {
          const url = audioAttachment.data_url || audioAttachment.data?.url || '';
          const cachedText = audioCacheRef.current[url];
          if (cachedText) {
            itemText = `Mensaje de voz: "${cachedText}"`;
          }
        }
      }

      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: profile.id,
          itemText,
          username: contact(selected).name || contact(selected).phone_number || 'Cliente',
          conversationHistory: history,
          isDM: true,
        }),
      });
      if (!res.ok) throw new Error('Error al generar borrador');
      const data = await res.json();
      if (data.draft && selectedRef.current?.id === selected.id) {
        setReply(data.draft);
      }
    } catch (e: any) {
      setSendError('No se pudo generar el borrador con IA.');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const loadMessages = useCallback(async (conv: any) => {
    if (!cwUrl || !cwToken) return;
    setExpanded(false);
    setSelected(conv);
    if (window.innerWidth < 768) setMobileShowChat(true);
    // Instantly mark as read — both visual (list item) and badge
    const wasUnread = isConvUnread(conv);
    setManuallyUnread(prev => { const s = new Set(prev); s.delete(conv.id); return s; });
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
    // bg sync removed
    if (wasUnread) markRead();
    // Fire API in background — don't block the UI
    if (conv.unread_count > 0 || wasUnread) {
      chatwoot.markAsRead(cwUrl, cwToken, conv.id).catch(() => {});
    }
    setMessages([]);
    setHasMoreMessages(false);
    isLoadingOlderRef.current = false;
    userScrolledUpRef.current = false;
    pendingScrollRestoreRef.current = null;
    setReply('');
    setSendError(null);
    setLoadingSuggestion(null);
    setLoadingMsgs(true);
    try {
      const msgs = await chatwoot.getMessages(cwUrl, cwToken, conv.id);
      const sorted = msgs.sort((a: any, b: any) => a.created_at - b.created_at);
      setMessages(sorted);
      setHasMoreMessages(msgs.length >= 20);
    } catch (e: any) {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, [cwUrl, cwToken, isConvUnread, markRead]);


  const loadOlderMessages = useCallback(async () => {
    if (!cwUrl || !cwToken || !selected || isLoadingOlderRef.current || !hasMoreMessages) return;
    const firstMsg = messages[0];
    if (!firstMsg?.id) return;

    isLoadingOlderRef.current = true;
    setLoadingOlderMsgs(true);

    // Save scroll anchor BEFORE state update
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    try {
      const older = await chatwoot.getMessages(cwUrl, cwToken, selected.id, firstMsg.id);
      const sorted = older.sort((a: any, b: any) => a.created_at - b.created_at);
      if (sorted.length === 0) {
        setHasMoreMessages(false);
        isLoadingOlderRef.current = false;
        return;
      }
      // Store the scroll restore target before React re-renders
      pendingScrollRestoreRef.current = prevScrollHeight;
      setMessages(prev => {
        const existingIds = new Set(prev.map((m: any) => m.id));
        return [...sorted.filter((m: any) => !existingIds.has(m.id)), ...prev];
      });
      setHasMoreMessages(older.length >= 20);
    } catch {
      isLoadingOlderRef.current = false;
    } finally {
      setLoadingOlderMsgs(false);
    }
  }, [cwUrl, cwToken, selected, hasMoreMessages, messages]);

  // Load conversation from URL search parameter convId if present
  useEffect(() => {
    if (conversations.length > 0 && !selected) {
      const params = new URLSearchParams(location.search);
      const convIdParam = params.get('convId');
      if (convIdParam) {
        const convId = parseInt(convIdParam, 10);
        const found = conversations.find(c => c.id === convId);
        if (found) {
          loadMessages(found);
          // Clear query param so it doesn't re-trigger on subsequent updates
          navigate('/mensajeria', { replace: true });
        }
      }
    }
  }, [conversations, location.search, selected, loadMessages, navigate]);

  // Reset filters when the route is navigated to or the sidebar link is clicked
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hasConvId = params.has('convId');

    setShowPendingOnly(false);
    setSearch('');
    setChannelFilter('all');
    setAssignFilter('all');
    setSortBy('latest');

    if (!hasConvId) {
      setSelected(null);
      setMobileShowChat(false);
    }
  }, [location.key]);

  // Poll messages of selected conversation every 5s — only appends new ones
  useEffect(() => {
    if (!cwUrl || !cwToken || !selected) return;
    const pollMessages = async () => {
      try {
        const msgs = await chatwoot.getMessages(cwUrl, cwToken, selected.id);
        setMessages(prev => {
          const existingIds = new Set(prev.map((m: any) => m.id));
          const newOnes = msgs.filter((m: any) => !existingIds.has(m.id));
          if (newOnes.length === 0) return prev;
          return [...prev, ...newOnes].sort((a: any, b: any) => a.created_at - b.created_at);
        });
      } catch {}
    };
    const interval = setInterval(pollMessages, 5000);
    return () => clearInterval(interval);
  }, [cwUrl, cwToken, selected?.id]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    // Restore scroll anchor after prepending older messages
    if (pendingScrollRestoreRef.current !== null) {
      const prevScrollHeight = pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = null;
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight - prevScrollHeight;
        }
        isLoadingOlderRef.current = false;
      });
      return;
    }

    // Auto-scroll to bottom if user hasn't manually scrolled up
    if (!isLoadingOlderRef.current && !userScrolledUpRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // Lock body scroll when mobile chat is open (prevents iOS from scrolling page behind)
  useEffect(() => {
    if (mobileShowChat) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      window.scrollTo(0, 0);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [mobileShowChat]);

  // Scroll to bottom when chat opens and finishes loading (not on every message update)
  const lastScrolledConvId = useRef<number | null>(null);
  useEffect(() => {
    if (selected?.id && !loadingMsgs && messages.length > 0) {
      if (selected.id !== lastScrolledConvId.current) {
        lastScrolledConvId.current = selected.id;
        
        const performScroll = () => {
          const container = messagesContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        };

        // Scroll immediately (in case DOM elements are already available)
        performScroll();

        // requestAnimationFrame runs before the next repaint
        const rafId = requestAnimationFrame(() => {
          performScroll();
        });

        // Cascading timeouts to handle slow rendering, images, or dynamic layouts
        const t1 = setTimeout(performScroll, 30);
        const t2 = setTimeout(performScroll, 100);
        const t3 = setTimeout(performScroll, 300);

        return () => {
          cancelAnimationFrame(rafId);
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }
    }
  }, [selected?.id, loadingMsgs, messages.length]);

  // Scroll to bottom when images/videos inside messages finish loading
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || loadingMsgs || messages.length === 0) return;

    const scrollToBottomIfNotScrolledUp = () => {
      if (!userScrolledUpRef.current && !isLoadingOlderRef.current && messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    };

    const mediaElements = container.querySelectorAll('img, video, audio');
    mediaElements.forEach(el => {
      el.addEventListener('load', scrollToBottomIfNotScrolledUp);
      el.addEventListener('loadedmetadata', scrollToBottomIfNotScrolledUp);
    });

    return () => {
      mediaElements.forEach(el => {
        el.removeEventListener('load', scrollToBottomIfNotScrolledUp);
        el.removeEventListener('loadedmetadata', scrollToBottomIfNotScrolledUp);
      });
    };
  }, [messages, loadingMsgs]);

  const loadCannedResponses = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingCanned(true);
    try {
      const { data, error } = await supabase
        .from('car_canned_responses')
        .select('*')
        .eq('client_id', profile.id)
        .order('title');

      if (error) throw error;
      setCannedResponses(data || []);
    } catch (err) {
      console.warn('Error loading canned responses from Supabase, falling back to localStorage:', err);
      const localDataStr = localStorage.getItem(`car_canned_responses_${profile.id}`);
      if (localDataStr) {
        try {
          setCannedResponses(JSON.parse(localDataStr));
        } catch {
          setupDefaultCannedResponses();
        }
      } else {
        setupDefaultCannedResponses();
      }
    } finally {
      setLoadingCanned(false);
    }
  }, [profile?.id]);

  const setupDefaultCannedResponses = useCallback(() => {
    const defaults = [
      {
        id: 'default_saludo',
        title: 'Saludo Inicial',
        shortcut: 'saludo',
        content: '¡Hola! ¿Cómo estás? Gracias por contactarte con nosotros. ¿En qué te puedo ayudar hoy? 😊'
      },
      {
        id: 'default_ubicacion',
        title: 'Ubicación y Horarios',
        shortcut: 'ubicacion',
        content: 'Nuestras oficinas y local principal están ubicados en Buenos Aires. Atendemos de Lunes a Viernes de 9:00 a 18:00 hs. ¡Te esperamos! 📍'
      },
      {
        id: 'default_envios',
        title: 'Envíos y Tiempos de Entrega',
        shortcut: 'envios',
        content: 'Hacemos envíos a todo el país. Los despachos se realizan dentro de las 24-48 horas hábiles de confirmada la compra. El tiempo estimado de entrega es de 3 a 5 días hábiles según la localidad. 🚚'
      },
      {
        id: 'default_pagos',
        title: 'Medios de Pago',
        shortcut: 'pagos',
        content: 'Aceptamos Mercado Pago (tarjetas de crédito y débito, transferencia y efectivo en Rapipago/Pago Fácil) y transferencia bancaria directa con un 10% de descuento. 💳'
      },
      {
        id: 'default_cambios',
        title: 'Cambios y Devoluciones',
        shortcut: 'cambios',
        content: 'Podés realizar cambios dentro de los 30 días de haber recibido tu compra. El producto debe estar en perfectas condiciones, con etiqueta y en su empaque original. Escribinos para coordinar el cambio. 📦'
      }
    ];
    setCannedResponses(defaults);
    if (profile?.id) {
      try {
        localStorage.setItem(`car_canned_responses_${profile.id}`, JSON.stringify(defaults));
      } catch (e) {}
    }
  }, [profile?.id]);

  const handleCreateCannedResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id || !newCannedTitle.trim() || !newCannedContent.trim()) return;
    setSavingCanned(true);
    const newResponse = {
      client_id: profile.id,
      shortcut: newCannedShortcut.trim().toLowerCase() || newCannedTitle.trim().toLowerCase().replace(/\s+/g, '-'),
      title: newCannedTitle.trim(),
      content: newCannedContent.trim()
    };

    try {
      const { data, error } = await supabase
        .from('car_canned_responses')
        .insert([newResponse])
        .select();

      if (error) throw error;
      setCannedResponses(prev => [...prev, ...(data || [])].sort((a,b) => a.title.localeCompare(b.title)));
      
      setNewCannedTitle('');
      setNewCannedShortcut('');
      setNewCannedContent('');
      setShowNewCannedForm(false);
    } catch (err) {
      console.warn('Error saving canned response to Supabase, saving to localStorage:', err);
      const updated = [
        ...cannedResponses,
        {
          id: `local_${Date.now()}`,
          ...newResponse
        }
      ].sort((a,b) => a.title.localeCompare(b.title));
      setCannedResponses(updated);
      try {
        localStorage.setItem(`car_canned_responses_${profile.id}`, JSON.stringify(updated));
      } catch (e) {}

      setNewCannedTitle('');
      setNewCannedShortcut('');
      setNewCannedContent('');
      setShowNewCannedForm(false);
    } finally {
      setSavingCanned(false);
    }
  };

  const handleDeleteCannedResponse = async (id: any) => {
    if (!profile?.id) return;
    if (!window.confirm('¿Seguro que querés eliminar esta respuesta rápida?')) return;
    try {
      if (typeof id === 'number' || (typeof id === 'string' && !id.startsWith('default_') && !id.startsWith('local_'))) {
        const { error } = await supabase
          .from('car_canned_responses')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
      const updated = cannedResponses.filter(r => r.id !== id);
      setCannedResponses(updated);
      try {
        localStorage.setItem(`car_canned_responses_${profile.id}`, JSON.stringify(updated));
      } catch (e) {}
    } catch (err) {
      console.error('Error deleting canned response:', err);
      const updated = cannedResponses.filter(r => r.id !== id);
      setCannedResponses(updated);
      try {
        localStorage.setItem(`car_canned_responses_${profile.id}`, JSON.stringify(updated));
      } catch (e) {}
    }
  };

  const loadCustomLinks = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingLinks(true);
    try {
      const { data, error } = await supabase
        .from('car_links')
        .select('*')
        .eq('client_id', profile.id)
        .order('sort_order');
      if (error) throw error;
      setCustomLinks(data || []);
    } catch (err) {
      console.error('Error loading custom links:', err);
    } finally {
      setLoadingLinks(false);
    }
  }, [profile?.id]);

  const searchShopifyProducts = useCallback(async (query: string) => {
    if (!profile?.shopify_domain || !profile?.shopify_access_token) return;
    setLoadingProducts(true);
    try {
      const cleanDomain = profile.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const url = `/api/shopify/products.json?limit=15${query ? `&title=${encodeURIComponent(query)}` : ''}`;
      
      const res = await fetch(url, {
        headers: {
          'x-shopify-domain': cleanDomain,
          'x-shopify-access-token': profile.shopify_access_token
        }
      });
      if (res.ok) {
        const data = await res.json();
        setShopifyProducts(data.products || []);
      } else {
        console.error('Failed to fetch shopify products');
      }
    } catch (err) {
      console.error('Error searching Shopify products:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, [profile?.shopify_domain, profile?.shopify_access_token]);

  useEffect(() => {
    if (profile?.id) {
      loadCannedResponses();
      loadCustomLinks();
      if (profile.shopify_domain && profile.shopify_access_token) {
        searchShopifyProducts('');
      }
    }
  }, [profile?.id, loadCannedResponses, loadCustomLinks, searchShopifyProducts, profile?.shopify_domain, profile?.shopify_access_token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (profile?.shopify_domain && profile?.shopify_access_token) {
        searchShopifyProducts(shopifySearch);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [shopifySearch, searchShopifyProducts, profile?.shopify_domain, profile?.shopify_access_token]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveImagePreview(null);
        setActiveVideoPreview(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !selected || !cwUrl || !cwToken) return;
    setSending(true);
    setSendError(null);
    const tempId = `local_${Date.now()}`;
    const tempMsg = { id: tempId, content: reply.trim(), message_type: 1, created_at: Date.now() / 1000, pending: true };
    
    // Update active chat messages
    setMessages(prev => [...prev, tempMsg]);
    
    // Update conversations list preview immediately with temp message
    setConversations(prev => prev.map(c => 
      c.id === selected.id 
        ? { 
            ...c, 
            last_activity_at: tempMsg.created_at, 
            messages: [tempMsg, ...(c.messages || [])],
            last_non_activity_message: tempMsg
          } 
        : c
    ));

    const sentText = reply.trim();
    setReply('');
    try {
      const sent = await chatwoot.sendMessage(cwUrl, cwToken, selected.id, sentText);
      // Replace temp with real message in active chat
      setMessages(prev => prev.map((m: any) => m.id === tempId ? { ...sent, created_at: sent?.created_at || Date.now()/1000 } : m));
      // Replace temp with real message in conversations list preview
      setConversations(prev => prev.map(c => 
        c.id === selected.id 
          ? { 
              ...c, 
              last_activity_at: sent?.created_at || Date.now()/1000, 
              messages: [sent, ...(c.messages || []).filter((m: any) => m.id !== tempId)],
              last_non_activity_message: sent
            } 
          : c
      ));
    } catch (e: any) {
      // Mark temp message as failed in active chat
      setFailedMsgIds(prev => new Set([...prev, tempId]));
      setSendError(e.message || 'No se pudo enviar el mensaje.');
      // Remove temp message from conversation list on failure
      setConversations(prev => prev.map(c => 
        c.id === selected.id 
          ? { 
              ...c, 
              messages: (c.messages || []).filter((m: any) => m.id !== tempId) 
            } 
          : c
      ));
    } finally {
      setSending(false);
    }
  };

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCtxAction = async (action: string, conv: any) => {
    setCtxMenu(null);
    if (!cwUrl || !cwToken) return;

    // ── Mark as unread ────────────────────────────────────────────────
    if (action === 'unread') {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 1 } : c));
      // bg sync removed
      setManuallyUnread(prev => new Set([...prev, conv.id]));
      showToast('Marcado como no leído', 'success');
      chatwoot.markAsUnread(cwUrl, cwToken, conv.id).catch(() => {});
      return;
    }

    // ── Optimistic UI update FIRST, then API ──────────────────────────
    if (action === 'read') {
      // Update UI immediately
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      // bg sync removed
      setManuallyUnread(prev => { const s = new Set(prev); s.delete(conv.id); return s; });
      showToast('Marcado como leído', 'success');
      // Fire API in background — ignore errors (UI already updated)
      chatwoot.markAsRead(cwUrl, cwToken, conv.id).catch(() => {});
      return;
    }

    if (action === 'resolved' || action === 'open' || action === 'pending') {
      const newStatus = action;
      // Optimistic: remove or update in list
      const shouldRemove = statusFilter !== 'all' && statusFilter !== newStatus;
      setConversations(prev => shouldRemove
        ? prev.filter(c => c.id !== conv.id)
        : prev.map(c => c.id === conv.id ? { ...c, status: newStatus } : c)
      );
      if (shouldRemove && selected?.id === conv.id) { setSelected(null); setMessages([]); }
      else if (selected?.id === conv.id) setSelected((s: any) => s ? { ...s, status: newStatus } : s);
      const labels: Record<string, string> = { resolved: 'Resuelta ✅', open: 'Abierta 📂', pending: 'Pendiente ⏳' };
      showToast(labels[newStatus], 'success');
      // API in background
      chatwoot.updateStatus(cwUrl, cwToken, conv.id, newStatus).catch(e => {
        showToast(`No se pudo sincronizar: ${e.message}`, 'error');
      });
      return;
    }

    if (action === 'snooze') {
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      // bg sync removed
      if (selected?.id === conv.id) { setSelected(null); setMessages([]); }
      showToast('Pospuesto 1 hora ⏰', 'success');
      const snoozed_until = Math.floor(Date.now() / 1000) + 3600;
      chatwoot.updateStatus(cwUrl, cwToken, conv.id, 'snoozed', { snoozed_until }).catch(e => {
        showToast(`No se pudo sincronizar: ${e.message}`, 'error');
      });
      return;
    }

    if (action === 'priority_high') {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, priority: 'high' } : c));
      // bg sync removed
      showToast('Prioridad alta 🔴', 'success');
      chatwoot.updatePriority(cwUrl, cwToken, conv.id, 'high').catch(() => {});
      return;
    }

    if (action === 'priority_none') {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, priority: 'none' } : c));
      // bg sync removed
      showToast('Sin prioridad ⚪', 'success');
      chatwoot.updatePriority(cwUrl, cwToken, conv.id, 'none').catch(() => {});
      return;
    }

    if (action === 'delete') {
      if (!window.confirm('¿Eliminar esta conversación? Esta acción no se puede deshacer.')) return;
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      // bg sync removed
      if (selected?.id === conv.id) { setSelected(null); setMessages([]); }
      showToast('Conversación eliminada', 'success');
      chatwoot.deleteConversation(cwUrl, cwToken, conv.id).catch(e => {
        showToast(`No se pudo eliminar en servidor: ${e.message}`, 'error');
      });
    }
  };



  const contact = (c: any) => {
    if (!c) return {};
    return c.meta?.sender || c.contact_inbox?.contact || {};
  };
  const getChannel = (c: any) => {
    if (!c) return 'other';
    const inbox = c.inbox || inboxes.find((i: any) => i.id === c.inbox_id);
    const ch = (c.channel || inbox?.channel_type || '').toLowerCase();
    if (ch.includes('whatsapp')) return 'whatsapp';
    if (ch.includes('instagram')) return 'instagram';
    if (ch.includes('facebook') || ch.includes('page')) return 'facebook';
    if (ch.includes('email')) return 'email';
    return 'other';
  };

  const getChannelBadgeClass = (c: any, isSelected: boolean) => {
    const ch = getChannel(c);
    if (isSelected) {
      return 'bg-white/20 text-white border-transparent';
    }
    if (ch === 'whatsapp') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30';
    if (ch === 'instagram') return 'bg-pink-50 text-pink-700 dark:bg-pink-950/30 dark:text-pink-400 border border-pink-200/50 dark:border-pink-900/30';
    if (ch === 'facebook') return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/30';
    if (ch === 'email') return 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400 border border-violet-200/50 dark:border-violet-800/30';
    return 'bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700';
  };

  const isChannelActive = (channelKey: string) => {
    if (channelKey === 'all') return true;
    const hasInbox = inboxes.some(inbox => {
      const type = (inbox.channel_type || '').toLowerCase();
      if (channelKey === 'whatsapp') return type.includes('whatsapp');
      if (channelKey === 'instagram') return type.includes('instagram');
      if (channelKey === 'facebook') return type.includes('facebook') || type.includes('page');
      if (channelKey === 'email') return type.includes('email');
      if (channelKey === 'other') {
        return !type.includes('whatsapp') && 
               !type.includes('instagram') && 
               !type.includes('facebook') && 
               !type.includes('page') && 
               !type.includes('email');
      }
      return false;
    });
    if (hasInbox) return true;
    return conversations.some(c => getChannel(c) === channelKey);
  };

  const getChannelCount = (channelKey: string) => {
    if (conversations.length === 0) return 0;
    return channelKey === 'all'
      ? conversations.filter(isConvUnread).length
      : conversations.filter(c => getChannel(c) === channelKey && isConvUnread(c)).length;
  };

  const CHANNEL_ICON: Record<string, string> = { whatsapp: '📱', instagram: '📸', facebook: '📘', email: '📧', other: '💬' };
  const CHANNEL_COLOR: Record<string, string> = { whatsapp: 'bg-emerald-500', instagram: 'bg-pink-500', facebook: 'bg-blue-600', email: 'bg-violet-500', other: 'bg-zinc-500' };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-pink-500 to-rose-500 text-white',
      'from-violet-500 to-purple-500 text-white',
      'from-blue-500 to-indigo-500 text-white',
      'from-emerald-500 to-teal-500 text-white',
      'from-amber-500 to-orange-500 text-white',
      'from-sky-500 to-cyan-500 text-white',
    ];
    if (!name) return gradients[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  const getChannelLabel = (c: any) => {
    if (!c) return 'Canal';
    const ch = getChannel(c);
    if (ch === 'whatsapp') return 'WhatsApp';
    if (ch === 'instagram') return 'Instagram';
    if (ch === 'facebook') return 'Facebook';
    if (ch === 'email') return 'Email';
    if (c.inbox?.name) {
      return c.inbox.name.replace(/\+?\d[\d\s-]{5,}/g, '').trim() || 'Canal';
    }
    return 'Canal';
  };

  const renderAvatar = (conv: any) => {
    const c = contact(conv);
    const name = c.name || '';
    const initials = name
      ? name.split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
      : '';
    
    const ch = getChannel(conv);
    const gradient = getAvatarGradient(name || String(conv.id));

    return (
      <div className="relative flex-shrink-0 select-none">
        {initials ? (
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black bg-gradient-to-br shadow-inner ${gradient}`}>
            {initials}
          </div>
        ) : (
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[15px] bg-gradient-to-br ${gradient}`}>
            {CHANNEL_ICON[ch]}
          </div>
        )}
        <span className="absolute -bottom-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] shadow bg-white dark:bg-zinc-900 border border-zinc-150/80 dark:border-zinc-800 select-none">
          {CHANNEL_ICON[ch]}
        </span>
      </div>
    );
  };

  const getComputedActivityTimestamp = (c: any) => {
    const ts = c?.last_non_activity_message?.created_at || c?.last_activity_at || c?.created_at;
    if (!ts) return 0;
    if (typeof ts === 'number') return ts > 10000000000 ? ts / 1000 : ts;
    const d = new Date(ts).getTime();
    return isNaN(d) ? 0 : d / 1000;
  };

  const sourceList = conversations;

  const sortedConversations = [...sourceList].sort((a, b) => {
    const tsA = getComputedActivityTimestamp(a);
    const tsB = getComputedActivityTimestamp(b);
    if (sortBy === 'oldest') return tsA - tsB;
    if (sortBy === 'priority') {
      const p: any = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      return (p[a.priority] ?? 4) - (p[b.priority] ?? 4);
    }
    return tsB - tsA;
  });

  const channelFilteredConversations = sortedConversations.filter(c => {
    if (channelFilter === 'all') return true;
    return getChannel(c) === channelFilter;
  });

  const unreadFilteredConversations = showPendingOnly
    ? channelFilteredConversations.filter(isConvUnread)
    : channelFilteredConversations;

  const assignFiltered = unreadFilteredConversations.filter(c => {
    if (assignFilter === 'unassigned') return !c.meta?.assignee;
    if (assignFilter === 'mine') return !!c.meta?.assignee;
    return true;
  });

  const filtered = assignFiltered.filter(c => {
    if (!c) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const name = (c.meta?.sender?.name || '').toLowerCase();
    const phone = c.meta?.sender?.phone_number || '';
    const email = (c.meta?.sender?.email || '').toLowerCase();
    const lastReal = c.messages?.find((m: any) => m?.message_type !== 2) || c.last_non_activity_message;
    const lastMsg = (lastReal?.content || '').toLowerCase();
    return name.includes(s) || phone.includes(s) || email.includes(s) || String(c.id).includes(s) || lastMsg.includes(s);
  });

  const allOpenConversationsLoaded = isFirstLoadDone 
    ? conversations.filter(c => c.status === 'open').length >= totalOpenCount 
    : false;

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(c => c.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkAction = async (action: string) => {
    if (!cwUrl || !cwToken || selectedIds.size === 0) return;
    if (action === 'delete') {
      if (!window.confirm(`¿Eliminar ${selectedIds.size} conversación${selectedIds.size > 1 ? 'es' : ''}? Esta acción no se puede deshacer.`)) return;
    }
    const ids = [...selectedIds];
    // Optimistic UI update immediately
    if (action === 'delete') {
      setConversations(prev => prev.filter(c => !selectedIds.has(c.id)));
      // bg sync removed
      if (selected && selectedIds.has(selected.id)) { setSelected(null); setMessages([]); }
    }
    if (action === 'read') {
      setConversations(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, unread_count: 0 } : c));
      // bg sync removed
      setManuallyUnread(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
    }
    if (action === 'unread') {
      setConversations(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, unread_count: 1 } : c));
      // bg sync removed
      setManuallyUnread(prev => new Set([...prev, ...ids]));
    }
    clearSelection();
    setBulkLoading(true);
    try {
      await Promise.all(ids.map(id => {
        if (action === 'delete') return chatwoot.deleteConversation(cwUrl, cwToken, id);
        if (action === 'unread') return chatwoot.markAsUnread(cwUrl, cwToken, id);
        if (action === 'read') return chatwoot.markAsRead(cwUrl, cwToken, id);
        return Promise.resolve();
      }));
      const labels: Record<string, string> = { read: `${ids.length} marcados como leídos`, unread: `${ids.length} marcados como no leídos`, delete: `${ids.length} conversaciones eliminadas` };
      showToast(labels[action] || 'Listo', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const channelFilteredRaw = conversations.filter(c => {
    if (channelFilter === 'all') return true;
    return getChannel(c) === channelFilter;
  });

  const totalCount = channelFilter === 'all'
    ? (convMeta?.all_count !== undefined ? convMeta.all_count : 0)
    : (channelMetas[channelFilter]?.all_count !== undefined ? channelMetas[channelFilter].all_count : 0);

  const unassignedCount = channelFilter === 'all'
    ? (convMeta?.unassigned_count !== undefined ? convMeta.unassigned_count : 0)
    : (channelMetas[channelFilter]?.unassigned_count !== undefined ? channelMetas[channelFilter].unassigned_count : 0);

  const assignedCount = channelFilter === 'all'
    ? (convMeta?.assigned_count !== undefined ? convMeta.assigned_count : 0)
    : (channelMetas[channelFilter]?.assigned_count !== undefined ? channelMetas[channelFilter].assigned_count : 0);

  const adjustMobileTextarea = useCallback(() => {
    requestAnimationFrame(() => {
      const ta = mobileTextareaRef.current;
      if (!ta) return;
      ta.style.height = 'auto';
      const sh = ta.scrollHeight;
      ta.style.height = Math.min(sh, 150) + 'px';
      if (sh > 150) {
        ta.style.overflowY = 'auto';
      } else {
        ta.style.overflowY = 'hidden';
      }
    });
  }, []);

  useEffect(() => {
    adjustMobileTextarea();
  }, [reply, adjustMobileTextarea]);

  const handleMicPress = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const mimeType = mr.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setTranscribing(true);
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1];
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64, mimeType }),
            });
            const data = await res.json();
            if (data.text) {
              setReply(prev => (prev ? prev + ' ' : '') + data.text);
              setTimeout(adjustMobileTextarea, 50);
            }
          };
          reader.readAsDataURL(blob);
        } catch (e) { console.error('Transcription error', e); }
        finally { setTranscribing(false); }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (e) {
      alert('No se pudo acceder al micrófono. Verificá los permisos.');
    }
  };

  if (!cwUrl || !cwToken) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 max-w-md flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-800 dark:text-amber-400 text-[14px]">Canal de atención no configurado</h3>
            <p className="text-[12px] text-amber-600 dark:text-amber-500 mt-1">Completá la URL y el token en Administración → Gestión de Clientes.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CenteredPageLoader isLoading={!isFirstLoadDone}>
      <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a0a]">

      {/* Top Header Bar */}
      <div className="flex items-center gap-2 p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0 w-full animate-in fade-in duration-200">
        {/* Left Section: Status filter + Channel Filter Pills (Desktop only) */}
        <div className="hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar flex-1">
          {/* Pendientes Filter (Desktop only) */}
          {/* Pendientes Filter (Desktop only) */}
          <button
            onClick={() => setShowPendingOnly(prev => !prev)}
            className={`flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl border text-[9px] sm:text-[10px] font-black transition-all active:scale-[0.98] h-[26px] sm:h-[30px] shrink-0 ${
              showPendingOnly
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-650 dark:text-zinc-300 hover:border-zinc-350 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
            title="Mostrar solo mensajes pendientes"
          >
            <Clock className={`w-3.5 h-3.5 ${showPendingOnly ? 'text-amber-500 animate-pulse' : 'text-zinc-450 dark:text-zinc-400'}`} />
            <span>Pendientes</span>
          </button>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-zinc-200 dark:bg-zinc-800 shrink-0 mx-1" />

          {[
            { key: 'all',       label: 'Todos',     icon: Inbox,         activeClass: 'bg-zinc-900 border-zinc-900 dark:bg-zinc-100 dark:border-zinc-100 text-white dark:text-zinc-900', iconColor: '' },
            { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle, activeClass: 'bg-green-500 border-green-500 text-white',                                                         iconColor: 'text-green-500' },
            { key: 'instagram', label: 'Instagram', icon: Instagram,     activeClass: 'bg-pink-500 border-pink-500 text-white',                                                           iconColor: 'text-pink-500' },
            { key: 'facebook',  label: 'Facebook',  icon: Facebook,      activeClass: 'bg-blue-600 border-blue-600 text-white',                                                           iconColor: 'text-blue-500' },
            { key: 'email',     label: 'Email',     icon: Mail,          activeClass: 'bg-sky-500 border-sky-500 text-white',                                                             iconColor: 'text-sky-500' },
            { key: 'other',     label: 'Otros',     icon: Globe,         activeClass: 'bg-zinc-900 border-zinc-900 dark:bg-zinc-100 dark:border-zinc-100 text-white dark:text-zinc-900', iconColor: '' },
          ].filter(ch => isChannelActive(ch.key)).map(ch => {
            const Icon = ch.icon;
            const isActive = channelFilter === ch.key;
            const count = getChannelCount(ch.key);
            return (
              <button
                key={ch.key}
                onClick={() => setChannelFilter(ch.key as any)}
                className={`flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl text-[9px] sm:text-[10px] font-black transition-all duration-200 whitespace-nowrap border ${
                  isActive
                    ? `${ch.activeClass} shadow-sm`
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-650 dark:text-zinc-300 hover:border-zinc-350 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? '' : ch.iconColor}`} />
                <span>{ch.label}</span>
                {isFirstLoadDone && count > 0 && (
                  <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.25 rounded-full font-black ${
                    isActive ? 'bg-white/20 text-white dark:bg-black/10 dark:text-inherit' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Section: Search & Controls (Controls hidden on mobile) */}
        <div className="flex items-center gap-2 flex-1 md:flex-initial md:ml-auto">
          {/* Search Input (Full width on mobile) */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Buscar contacto, teléfono..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-zinc-750 dark:text-zinc-300 transition-all" 
            />
          </div>

          {/* Pendientes Filter (Visible on mobile only, since desktop has it on the left) */}
          <button
            onClick={() => setShowPendingOnly(prev => !prev)}
            className={`md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11.5px] font-black transition-all active:scale-[0.98] h-[32px] ${
              showPendingOnly
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-650 dark:text-zinc-300 hover:border-zinc-350 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
            title="Mostrar solo mensajes pendientes"
          >
            <Clock className={`w-3.5 h-3.5 ${showPendingOnly ? 'text-amber-500 animate-pulse' : 'text-zinc-450 dark:text-zinc-400'}`} />
            <span>Pendientes</span>
          </button>

          {/* Expand button (Desktop only) */}
          <button 
            onClick={() => setExpanded(e => !e)}
            className="hidden md:block p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" 
            title={expanded ? 'Contraer' : 'Expandir lista'}
          >
            <svg className="w-4 h-4 text-zinc-550" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {expanded
                ? <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        <div className={`
          ${listCollapsed ? 'hidden' : expanded ? 'w-full' : mobileShowChat ? 'hidden md:flex md:w-[320px]' : 'w-full md:w-[320px]'}
          flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 ${mounted ? 'transition-all duration-300' : ''}
        `}>

          {/* Assign tabs */}


          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800/40 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black text-blue-700 dark:text-blue-400">{selectedIds.size} seleccionados</span>
              <button onClick={selectAll} className="text-[10px] text-blue-600 dark:text-blue-400 underline">Todos</button>
              <button onClick={clearSelection} className="text-[10px] text-zinc-500 underline">Limpiar</button>
              <div className="flex gap-1 ml-auto">
                {[
                  { action: 'read', label: '✓ Leído' },
                  { action: 'unread', label: '● No leído' },
                  { action: 'delete', label: '🗑 Eliminar' },
                ].map(b => (
                  <button key={b.action} onClick={() => handleBulkAction(b.action)} disabled={bulkLoading}
                    className={`px-2 py-1 text-[10px] font-bold bg-white dark:bg-zinc-800 border rounded-lg transition-colors disabled:opacity-50 ${b.action === 'delete' ? 'border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* List */}
          <div
            className="flex-1 overflow-y-auto overscroll-y-contain py-2 space-y-1 pb-20 md:pb-2"
            style={{ overflowAnchor: 'none' }}
            onScroll={(e) => {
              const target = e.currentTarget;
              if (target.scrollHeight - target.scrollTop - target.clientHeight < 100) {
                if (filtered.length > currentPage * 25) {
                  setCurrentPage(prev => prev + 1);
                } else if (hasMore && (!showPendingOnly || !allOpenConversationsLoaded)) {
                  loadMoreConversations();
                }
              }
            }}
          >
            {loading ? (
              <AppleLoader variant="table" count={5} />
            ) : error ? (
              <div className="p-4 text-[11px] text-red-500">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-400">
                <Inbox className="w-6 h-6" />
                <p className="text-[12px] font-medium">Sin conversaciones</p>
              </div>
            ) : filtered.slice(0, currentPage * 25).map(conv => {
              const c = contact(conv);
              const sortedMsgs = [...(conv?.messages || [])].sort((x, y) => {
                const timeX = typeof x.created_at === 'number' ? x.created_at : new Date(x.created_at).getTime() / 1000;
                const timeY = typeof y.created_at === 'number' ? y.created_at : new Date(y.created_at).getTime() / 1000;
                return timeX - timeY;
              });
              const lastRealMsg = [...sortedMsgs].reverse().find((m: any) => m?.message_type !== 2) || 
                                  conv?.last_non_activity_message || 
                                  (sortedMsgs.length > 0 ? sortedMsgs[sortedMsgs.length - 1] : null);
              const lastMsg = lastRealMsg;
              const isSelected = selected?.id === conv?.id;
              const isUnread = isConvUnread(conv);
              const unread = isUnread ? Math.max(1, conv?.unread_count || 0) : 0;
              const activityTimestamp = lastRealMsg?.created_at || conv?.last_non_activity_message?.created_at || conv?.last_activity_at || conv?.created_at;
              return (
                <div key={conv.id}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, conv }); }}
                  onClick={() => loadMessages(conv)}
                  className={`mx-2 my-0.5 px-3 py-2.5 flex items-start gap-2.5 transition-all duration-200 cursor-pointer rounded-xl group/conv ${
                    isSelected 
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/10' 
                      : isUnread 
                        ? 'bg-zinc-50/80 dark:bg-zinc-900/60' 
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/30'
                  }`}
                >
                  {/* Selection dot — only visible when this conv is selected */}
                  {selectedIds.has(conv.id) && (
                    <div className="flex-shrink-0 mt-2.5 w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                  
                  {/* Card content click target */}
                  <div className="flex-1 flex items-start gap-2.5 min-w-0">
                    {renderAvatar(conv)}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        {/* Contact name as primary */}
                        <span className={`text-[12.5px] truncate ${
                          isSelected ? 'font-bold text-white'
                          : isUnread ? 'font-black text-zinc-900 dark:text-white'
                          : 'font-semibold text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {c.name || `#${conv.id}`}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[10px] ${isSelected ? 'text-blue-200' : 'text-zinc-400'}`}>
                            {fmtTime(activityTimestamp)}
                          </span>
                          {unread > 0 && !isSelected && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-sm">
                              {unread > 9 ? '9+' : unread}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Channel badge — no phone number */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[8.5px] px-1.5 py-0.5 rounded-full uppercase font-black tracking-wider ${getChannelBadgeClass(conv, isSelected)}`}>
                          {getChannelLabel(conv)}
                        </span>
                      </div>
                      
                      {(lastMsg?.content || lastMsg?.attachments?.length > 0) && (
                        <p className={`text-[11px] truncate mt-0.5 ${
                          isSelected 
                            ? 'text-blue-100' 
                            : isUnread 
                              ? 'text-zinc-700 dark:text-zinc-300 font-semibold' 
                              : 'text-zinc-450 italic'
                        }`}>
                          {lastMsg?.message_type === 1 && (
                            <span className={`font-bold mr-1 ${isSelected ? 'text-blue-100' : 'text-zinc-550 dark:text-zinc-400'}`}>Vos:</span>
                          )}
                          {lastMsg?.content || <span className="opacity-60">📎 Archivo adjunto</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load more — only when client-side has more, or server has more pages and filters allow it */}
            {((filtered.length > currentPage * 25) || (hasMore && (!showPendingOnly || !allOpenConversationsLoaded))) && (
              <div className="flex items-center justify-center py-3 text-[10px] text-zinc-400 gap-1.5">
                {loadingMore ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Cargando más...</>
                ) : (
                  <span className="opacity-50">↓ Más conversaciones</span>
                )}
              </div>
            )}

          </div>

          {/* Mobile Floating Bottom Bar */}
          {/* Mobile bottom tab bar — full width, stuck to bottom */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-stretch z-40 select-none safe-area-bottom">
            {[
              { key: 'all', icon: Inbox, label: 'Todos' },
              { key: 'whatsapp', icon: MessageCircle, label: 'WhatsApp' },
              { key: 'instagram', icon: Instagram, label: 'Instagram' },
              { key: 'facebook', icon: Facebook, label: 'Facebook' },
              { key: 'email', icon: Mail, label: 'Email' },
            ].filter(ch => isChannelActive(ch.key)).map(ch => {
              const Icon = ch.icon;
              const isActive = channelFilter === ch.key;
              const count = getChannelCount(ch.key);
              return (
                <button
                  key={ch.key}
                  onClick={() => setChannelFilter(ch.key as any)}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-all ${
                    isActive
                      ? 'text-zinc-900 dark:text-white'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-zinc-900 dark:bg-white rounded-full" />}
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {isFirstLoadDone && count > 0 && !isActive && (
                      <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-white text-[8px] font-black min-w-[16px] h-4 rounded-full flex items-center justify-center px-0.5 border border-white dark:border-zinc-950">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] font-bold leading-none ${isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}>{ch.label}</span>
                </button>
              );
            })}

          </div>
        </div>

        {/* RIGHT: chat panel */}
        {/* Mobile: fixed fullscreen overlay. Desktop: flex-1 split view (unchanged) */}
        <div className={`
          overflow-hidden
          ${mobileShowChat && selected
            ? 'fixed inset-x-0 top-0 h-[100dvh] z-[250] flex flex-col bg-white dark:bg-zinc-950 md:static md:h-auto md:inset-auto md:z-auto md:flex-1 md:bg-zinc-50 md:dark:bg-zinc-900/30 overscroll-none'
            : selected
            ? 'hidden md:flex md:flex-1 bg-zinc-50 dark:bg-zinc-900/30'
            : 'hidden md:flex md:flex-1 bg-zinc-50 dark:bg-zinc-900/30'}
        `}
          id={mobileShowChat && selected ? 'mobile-chat-panel' : undefined}
        >

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">💬</div>
              <p className="text-[14px] font-medium">Seleccioná una conversación</p>
            </div>
          ) : (
            <>
              {/* Main Chat Area */}
              <div
                className="flex-1 flex flex-col overflow-hidden h-full md:border-r border-zinc-200 dark:border-zinc-800 min-h-0"
                onTouchStart={e => { if (e.touches[0].clientX < 35) setSwipeTouchStartX(e.touches[0].clientX); }}
                onTouchEnd={e => { if (swipeTouchStartX !== null && e.changedTouches[0].clientX - swipeTouchStartX > 70) { setSelected(null); setMobileShowChat(false); } setSwipeTouchStartX(null); }}
              >
                {/* MOBILE header */}
                <div className="md:hidden flex items-center gap-2 px-3 py-3 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/60 flex-shrink-0 select-none sticky top-0 z-10">
                  <button
                    onClick={() => { setSelected(null); setMobileShowChat(false); }}
                    className="p-1.5 -ml-1 rounded-lg text-zinc-500 dark:text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors flex-shrink-0"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-black flex-shrink-0 ${CHANNEL_COLOR[getChannel(selected)]}`}>
                    {(contact(selected).name || '?').slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-zinc-900 dark:text-white leading-tight truncate">{contact(selected).name || `Chat #${selected.id}`}</p>
                    {contact(selected).phone_number && <p className="text-[10px] text-zinc-400 truncate">{contact(selected).phone_number}</p>}
                  </div>
                </div>

                {/* DESKTOP header */}
                <div className="hidden md:flex px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 items-center gap-3 flex-shrink-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-black flex-shrink-0 ${CHANNEL_COLOR[getChannel(selected)]}`}>
                    {CHANNEL_ICON[getChannel(selected)]}
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-zinc-900 dark:text-white">{contact(selected).name || `Conversación #${selected.id}`}</p>
                    <div className="flex items-center gap-2">
                      {contact(selected).phone_number && <span className="text-[11px] text-zinc-400 font-mono">{contact(selected).phone_number}</span>}
                      <span className="text-[9px] font-black bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400 px-1.5 py-0.5 rounded-full uppercase">{getChannelLabel(selected)}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full text-white ${STATUS_COLORS[selected.status] || 'bg-zinc-400'}`}>
                        {selected.status === 'open' ? 'Abierto' : selected.status === 'resolved' ? 'Resuelto' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 24-hour warning banner */}
                {(() => {
                  const ch = getChannel(selected);
                  const isMetaConv = ['whatsapp', 'instagram', 'facebook'].includes(ch);
                  const lastIncoming = [...messages].reverse().find((m: any) => m?.message_type === 0);
                  const over24h = isMetaConv && lastIncoming && (Date.now()/1000 - lastIncoming.created_at) > 86400;
                  const noIncoming = isMetaConv && !lastIncoming;
                  const isClosed = selected.can_reply === false || (selected.can_reply === undefined && isMetaConv && !loadingMsgs && (over24h || noIncoming));
                  if (isClosed) {
                    return (
                      <div className="bg-red-50/45 dark:bg-red-950/5 border-b border-red-100/50 dark:border-red-900/10 px-5 py-2 flex items-center gap-2 text-[11px] text-red-750 dark:text-red-400 font-semibold select-none flex-shrink-0 animate-in slide-in-from-top duration-200">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span>Solo se admiten respuestas mediante plantilla debido a la restricción de las 24 horas.</span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Messages list */}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto overscroll-y-contain px-4 md:px-5 py-4 md:space-y-3 space-y-2 bg-zinc-50/50 dark:bg-zinc-950"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                    // Track manual scroll position: > 150px from bottom = user scrolled up
                    userScrolledUpRef.current = distFromBottom > 150;
                    // Load older messages when near top
                    if (el.scrollTop < 80 && hasMoreMessages && !isLoadingOlderRef.current) {
                      loadOlderMessages();
                    }
                  }}
                >
                  {/* Top sentinel: loading older messages */}
                  {hasMoreMessages && (
                    <div className="flex justify-center py-2">
                      {loadingOlderMsgs
                        ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                        : <div className="w-1 h-1" />
                      }
                    </div>
                  )}
                  {loadingMsgs ? (
                    <AppleLoader variant="inline" title="Cargando mensajes..." />
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400 text-[13px]">Sin mensajes</div>
                  ) : messages.map((msg: any) => {
                    const isMe = msg?.message_type === 1;
                    const isActivity = msg?.message_type === 2;
                    if (isActivity) return (
                      <div key={msg.id} className="flex justify-center my-1">
                        <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{msg?.content}</span>
                      </div>
                    );
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[9px] text-zinc-400 font-medium mb-0.5 px-2">
                          {isMe ? 'Agente' : (contact(selected).name || 'Cliente')} · {fmtTime(msg.created_at)}
                        </span>
                        <div className={`max-w-[80%] rounded-[18px] px-4 py-2.5 text-[14px] leading-relaxed ${
                          failedMsgIds.has(msg.id)
                            ? 'bg-red-100 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                            : isMe
                              ? `bg-blue-600 text-white shadow-sm ${msg.pending ? 'opacity-60' : ''}`
                              : 'bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm'
                        }`}>
                          {renderMessageContent(msg, contact(selected).name, setActiveImagePreview, setActiveVideoPreview)}
                          {failedMsgIds.has(msg.id) && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-red-500 font-bold">
                              <AlertCircle className="w-3 h-3" /> Error al enviar
                            </div>
                          )}
                          {msg.pending && !failedMsgIds.has(msg.id) && (
                            <span className="text-[10px] opacity-50 ml-1">enviando...</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* MOBILE reply bar — WhatsApp pill style */}
                {(() => {
                  const ch = getChannel(selected);
                  const isMetaConv = ['whatsapp', 'instagram', 'facebook'].includes(ch);
                  const lastIncoming = [...messages].reverse().find((m: any) => m?.message_type === 0);
                  const over24h = isMetaConv && lastIncoming && (Date.now()/1000 - lastIncoming.created_at) > 86400;
                  const noIncoming = isMetaConv && !lastIncoming;
                  const isClosed = selected.can_reply === false || (selected.can_reply === undefined && isMetaConv && !loadingMsgs && (over24h || noIncoming));
                  if (isClosed) {
                    const cleanPhone = contact(selected).phone_number?.replace(/\D/g, '') || '';
                    const senderIdentifier = selected?.meta?.sender?.identifier || selected?.meta?.sender?.username || '';
                    const contactUrl =
                      ch === 'whatsapp' && cleanPhone ? `https://wa.me/${cleanPhone}` :
                      ch === 'instagram' && senderIdentifier ? `https://ig.me/m/${senderIdentifier}` :
                      ch === 'instagram' ? 'https://www.instagram.com/direct/inbox/' :
                      ch === 'facebook' && senderIdentifier ? `https://m.me/${senderIdentifier}` :
                      ch === 'facebook' ? 'https://www.facebook.com/messages' : null;
                    const contactLabel =
                      ch === 'whatsapp' ? 'Escribir por WhatsApp' :
                      ch === 'instagram' ? 'Escribir por Instagram' :
                      ch === 'facebook' ? 'Escribir por Messenger' : null;
                    const btnColor =
                      ch === 'whatsapp' ? 'bg-emerald-500' :
                      ch === 'instagram' ? 'bg-pink-500' : 'bg-blue-600';
                    if (!contactUrl || !contactLabel) return null;
                    return (
                      <div className="md:hidden px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-900 sticky bottom-0 z-10">
                        <a href={contactUrl} target="_blank" rel="noreferrer"
                          className={`w-full flex items-center justify-center gap-2 py-3 ${btnColor} text-white text-[14px] font-black rounded-2xl active:scale-[0.98] transition-transform shadow-sm`}>
                          <MessageCircle className="w-5 h-5" />
                          {contactLabel}
                        </a>
                      </div>
                    );
                  }
                  return (
                    <div className="md:hidden flex items-end gap-2 px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom,0px))] bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-900 flex-shrink-0 sticky bottom-0 z-10">
                      <div className="flex-1 flex items-end bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-3xl px-4 py-2.5 min-h-[44px]">
                        <textarea
                          ref={mobileTextareaRef}
                          value={reply}
                          onChange={e => setReply(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }}}
                          onFocus={() => { requestAnimationFrame(() => { messagesContainerRef.current && (messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight); }); }}
                          placeholder={transcribing ? 'Transcribiendo...' : isRecording ? '● Grabando...' : 'Mensaje...'}
                          rows={1}
                          disabled={transcribing}
                          className="flex-1 w-full bg-transparent text-zinc-800 dark:text-zinc-100 text-[14px] outline-none resize-none placeholder-zinc-400 leading-snug overflow-hidden"
                          style={{ maxHeight: '150px' }}
                        />
                      </div>
                      <button
                        onClick={generateAiDraft}
                        disabled={generatingDraft || sending || messages.length === 0}
                        className="p-2.5 bg-violet-600 rounded-full flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
                      >
                        {generatingDraft ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Bot className="w-5 h-5 text-white" />}
                      </button>
                      {reply.trim() ? (
                        <button onClick={handleSend as any} disabled={sending}
                          className="p-2.5 bg-[#00a884] rounded-full flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform">
                          {sending ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Send className="w-5 h-5 text-white" />}
                        </button>
                      ) : (
                        <button
                          onClick={handleMicPress}
                          disabled={transcribing}
                          className={`p-2.5 rounded-full flex-shrink-0 active:scale-95 transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#00a884]'} disabled:opacity-40`}
                        >
                          {transcribing ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Mic className="w-5 h-5 text-white" />}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* DESKTOP Reply Box area */}
                <div className="hidden md:block border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
                  {(() => {
                    const ch = getChannel(selected);
                    const isMetaConv = ['whatsapp', 'instagram', 'facebook'].includes(ch);
                    const lastIncoming = [...messages].reverse().find((m: any) => m?.message_type === 0);
                    const over24h = isMetaConv && lastIncoming && (Date.now()/1000 - lastIncoming.created_at) > 86400;
                    const noIncoming = isMetaConv && !lastIncoming;
                    const isClosed = selected.can_reply === false || (selected.can_reply === undefined && isMetaConv && !loadingMsgs && (over24h || noIncoming));

                    if (isClosed) {
                      const ch = getChannel(selected);
                      const cleanPhone = contact(selected).phone_number?.replace(/\D/g, '') || '';
                      const senderIdentifier = selected?.meta?.sender?.identifier || selected?.meta?.sender?.username || '';
                      const contactUrl =
                        ch === 'whatsapp' && cleanPhone ? `https://wa.me/${cleanPhone}` :
                        ch === 'instagram' && senderIdentifier ? `https://ig.me/m/${senderIdentifier}` :
                        ch === 'instagram' ? 'https://www.instagram.com/direct/inbox/' :
                        ch === 'facebook' && senderIdentifier ? `https://m.me/${senderIdentifier}` :
                        ch === 'facebook' ? 'https://www.facebook.com/messages' :
                        null;
                      const contactLabel =
                        ch === 'whatsapp' ? 'Escribir por WhatsApp' :
                        ch === 'instagram' ? 'Escribir por Instagram' :
                        ch === 'facebook' ? 'Escribir por Messenger' : null;
                      const contactColor =
                        ch === 'whatsapp' ? 'bg-emerald-600 hover:bg-emerald-700' :
                        ch === 'instagram' ? 'bg-pink-500 hover:bg-pink-600' :
                        'bg-blue-600 hover:bg-blue-700';

                      return (
                        <div className="px-4 py-3 space-y-2.5 animate-in fade-in duration-200">
                          <div className="flex items-start gap-2 p-3 bg-red-50/50 dark:bg-red-950/10 border border-red-200/50 dark:border-red-900/20 rounded-2xl">
                            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-red-700 dark:text-red-400 leading-snug">
                              Ventana de 24hs cerrada. Solo podés responder con plantilla o contactando directamente.
                            </p>
                          </div>
                          {contactUrl && contactLabel && (
                            <a href={contactUrl} target="_blank" rel="noreferrer"
                              className={`w-full flex items-center justify-center gap-2 py-2.5 ${contactColor} text-white text-[12px] font-black rounded-xl transition-all shadow-sm active:scale-[0.98]`}>
                              <MessageCircle className="w-4 h-4" />
                              {contactLabel}
                            </a>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="px-5 py-4 space-y-3">
                        {sendError && (
                          <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl text-[11px] text-red-650 dark:text-red-400 flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">Error al enviar</p>
                              <p className="mt-0.5">{sendError}</p>
                              {sendError.toLowerCase().includes('template') && (
                                <a href={`${cwUrl}`} target="_blank" rel="noreferrer" className="underline mt-1 block">Abrir panel para usar plantilla →</a>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <textarea
                            value={reply}
                            onChange={e => setReply(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }}}
                            placeholder="Escribí tu respuesta... (Enter para enviar)"
                            rows={3}
                            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-[13px] text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={generateAiDraft} disabled={generatingDraft || sending || messages.length === 0}
                              className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 dark:bg-violet-600 hover:bg-violet-700 dark:hover:bg-violet-700 text-white rounded-xl text-[12px] font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50">
                              {generatingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Bot className="w-3.5 h-3.5 text-white animate-pulse" />}
                              Responder con IA
                            </button>

                            <button onClick={handleSend as any} disabled={!reply.trim() || sending}
                              className="ml-auto flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[13px] font-bold rounded-xl transition-all shadow-sm">
                              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              Enviar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      </div>


      {/* Context Menu */}
      {ctxMenu && (
        <div ref={ctxRef}
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100">
          {/* Seleccionar option */}
          <button
            onClick={() => {
              setSelectedIds(prev => { const next = new Set(prev); next.has(ctxMenu.conv.id) ? next.delete(ctxMenu.conv.id) : next.add(ctxMenu.conv.id); return next; });
              setCtxMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-[12px] font-medium flex items-center gap-2.5 transition-colors text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <span>☑</span> {selectedIds.has(ctxMenu.conv.id) ? 'Deseleccionar' : 'Seleccionar'}
          </button>
          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
          {[
            { action: 'read',   label: 'Marcar como leído',   icon: '✓' },
            { action: 'unread', label: 'Marcar como no leído', icon: '●' },
            null,
            { action: 'delete', label: 'Eliminar conversación', icon: '🗑️', danger: true },
          ].map((item, i) =>
            item === null ? (
              <div key={i} className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
            ) : (
              <button key={item.action} onClick={() => handleCtxAction(item.action, ctxMenu.conv)}
                className={`w-full text-left px-4 py-2 text-[12px] font-medium flex items-center gap-2.5 transition-colors ${
                  item.danger
                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}>
                <span>{item.icon}</span> {item.label}
              </button>
            )
          )}
        </div>
      )}

      {/* Keyboard listener for Escape to close image/video preview removed from inline IIFE */}

      {/* Fullscreen Image Preview Modal */}
      {activeImagePreview && (
        <div 
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setActiveImagePreview(null)}
        >
          <button 
            onClick={() => setActiveImagePreview(null)} 
            className="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white transition-all active:scale-95 border border-white/5 shadow-sm z-50"
          >
            <X className="w-4 h-4" />
          </button>
          
          {imagePreviewLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <Loader2 className="w-8 h-8 animate-spin text-white/70" />
            </div>
          )}

          <img 
            src={activeImagePreview} 
            alt="Preview" 
            className={`max-w-[95vw] max-h-[90vh] object-contain rounded-xl shadow-2xl border border-white/10 z-25 transition-all duration-350 ${
              imagePreviewLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
            onLoad={() => setImagePreviewLoading(false)}
            onError={() => {
              setImagePreviewLoading(false);
              setActiveImagePreview(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setActiveImagePreview(null);
            }}
          />
        </div>
      )}

      {/* Fullscreen Video Preview Modal */}
      {activeVideoPreview && (
        <div 
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setActiveVideoPreview(null)}
        >
          <button 
            onClick={() => setActiveVideoPreview(null)} 
            className="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white transition-all active:scale-95 border border-white/5 shadow-sm z-50"
          >
            <X className="w-4 h-4" />
          </button>
          <video 
            src={activeVideoPreview} 
            controls 
            autoPlay
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl shadow-2xl border border-white/10 bg-black z-25"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      </div>
    </CenteredPageLoader>
  );
}
