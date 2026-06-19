import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useViewAs } from './ViewAsContext';
import { useLocation } from 'react-router-dom';
import { chatwoot } from '../services/chatwoot';
import { metaAds } from '../services/metaAds';
import { ecommerce } from '../services/ecommerce';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnreadContextType {
  unreadCount: number;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  pendingCommentsCount: number;
  setPendingCommentsCount: React.Dispatch<React.SetStateAction<number>>;
  commentsLoading: boolean;
  unreadLoading: boolean;
  chatwootAvailable: boolean | null;
  /** Unfulfilled orders count (badge on Pedidos in sidebar) */
  pendingOrdersCount: number;
  ordersLoading: boolean;
  refresh: () => void;
  markRead: () => void;
}

const UnreadContext = createContext<UnreadContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
  pendingCommentsCount: 0,
  setPendingCommentsCount: () => {},
  commentsLoading: false,
  unreadLoading: false,
  chatwootAvailable: null,
  pendingOrdersCount: 0,
  ordersLoading: false,
  refresh: () => {},
  markRead: () => {},
});

export const useUnread = () => useContext(UnreadContext);

// Helper to read manual unread from localStorage
const getManuallyUnreadSet = (profileId?: string): Set<number> => {
  try {
    const saved = localStorage.getItem(`car_manually_unread_${profileId || 'default'}`);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
};

// ─── Provider ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000; // poll every 5 seconds

const isChatwootConfigured = (profile: any) => {
  const status = profile?.connection_statuses?.chatwoot;
  return !!(profile?.chatwoot_url && profile?.chatwoot_token && (status === 'ok' || status === 'connected'));
};

export const UnreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const location = useLocation();

  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingCommentsCount, setPendingCommentsCount] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [unreadLoading, setUnreadLoading] = useState(true);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [chatwootAvailable, setChatwootAvailable] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isFirstCommentsFetch = useRef(true);
  const isFirstUnreadFetch = useRef(true);

  // Load cached count or reset when switching profiles to prevent flash of wrong client
  useEffect(() => {
    if (profile?.id) {
      const cachedUnread = localStorage.getItem(`car_unread_count_${profile.id}`);
      const cachedComments = localStorage.getItem(`car_pending_comments_count_${profile.id}`);
      setUnreadCount(cachedUnread ? parseInt(cachedUnread, 10) : 0);
      setPendingCommentsCount(cachedComments ? parseInt(cachedComments, 10) : 0);
      
      // Reset first fetch flags to show spinners on profile change
      isFirstCommentsFetch.current = true;
      isFirstUnreadFetch.current = true;
      setCommentsLoading(true);
      setUnreadLoading(true);
      setChatwootAvailable(isChatwootConfigured(profile) ? null : false);
    } else {
      setUnreadCount(0);
      setPendingCommentsCount(0);
      setCommentsLoading(false);
      setUnreadLoading(false);
      setChatwootAvailable(false);
    }
    document.title = 'Portal C.A.R | Algoritmia';
  }, [profile?.id]);

  const fetchCount = useCallback(async () => {
    // Skip requests when the tab is in the background
    if (document.visibilityState !== 'visible') {
      return;
    }
    const isMensajeria = window.location.hash.toLowerCase().startsWith('#/mensajeria');
    if (isMensajeria) {
      setUnreadLoading(false);
      return;
    }
    const url = profile?.chatwoot_url;
    const token = profile?.chatwoot_token;
    if (!isChatwootConfigured(profile)) {
      setUnreadLoading(false);
      setUnreadCount(0);
      setChatwootAvailable(false);
      return;
    }

    const isFirst = isFirstUnreadFetch.current;
    if (isFirst) {
      setUnreadLoading(true);
    }

    try {
      // 1. Fetch page 1 of open conversations to get total count
      const firstPage = await chatwoot.getConversationsPage(url, token, 'open', 1);
      setChatwootAvailable(true);
      const allCount = firstPage.meta?.all_count ?? 0;
      const firstPayload = firstPage.payload || [];

      const allConversations = [...firstPayload];

      // 2. Fetch remaining pages in parallel up to a limit of 15 pages (375 conversations)
      if (allCount > 25) {
        const totalPages = Math.min(15, Math.ceil(allCount / 25));
        const pagesToFetch = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

        const results = await Promise.all(
          pagesToFetch.map(p =>
            chatwoot.getConversationsPage(url, token, 'open', p).catch(() => ({ payload: [] }))
          )
        );

        results.forEach(r => {
          if (r.payload) {
            allConversations.push(...r.payload);
          }
        });
      }

      const manuallyUnread = getManuallyUnreadSet(profile?.id);

      const isConvUnread = (c: any) => {
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
      };

      // Filter and count unique conversation IDs to avoid any double-counting
      const uniqueConvs = new Map<number, any>();
      allConversations.forEach(c => {
        if (c && c.id) uniqueConvs.set(c.id, c);
      });

      const count = Array.from(uniqueConvs.values()).filter(isConvUnread).length;

      setUnreadCount(count);
      if (profile?.id) {
        localStorage.setItem(`car_unread_count_${profile.id}`, String(count));
      }
    } catch (err) {
      console.error('[UnreadContext] Error fetching count:', err);
      setUnreadCount(0);
      setChatwootAvailable(false);
    } finally {
      if (isFirst) {
        setUnreadLoading(false);
        isFirstUnreadFetch.current = false;
      }
    }
  }, [profile]);

  // Keep a ref to the latest fetchCount function to prevent connection churn in WebSocket
  const fetchCountRef = useRef(fetchCount);
  useEffect(() => {
    fetchCountRef.current = fetchCount;
  }, [fetchCount]);

  // Update browser tab title dynamically when unread count or pending comments count changes
  useEffect(() => {
    const defaultTitle = 'Portal C.A.R | Algoritmia';
    const total = unreadCount + pendingCommentsCount;
    if (total > 0) {
      document.title = `(${total}) ${defaultTitle}`;
    } else {
      document.title = defaultTitle;
    }
  }, [unreadCount, pendingCommentsCount]);

  // Sync manual unread status from same tab or other tabs via StorageEvent/CustomEvent
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `car_manually_unread_${profile?.id || 'default'}`) {
        fetchCountRef.current();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleLocalUpdate = () => fetchCountRef.current();
    window.addEventListener('car_manually_unread_update', handleLocalUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('car_manually_unread_update', handleLocalUpdate);
    };
  }, [profile?.id]);

  // WebSocket real-time connection to Chatwoot for live badge updates
  useEffect(() => {
    const url = profile?.chatwoot_url;
    const token = profile?.chatwoot_token;
    if (!isChatwootConfigured(profile)) return;

    let ws: WebSocket | null = null;
    let pingInterval: any = null;
    let reconnectTimeout: any = null;

    const connect = async () => {
      try {
        const { pubsub_token } = await chatwoot.getProfile(url, token);
        if (!pubsub_token) return;

        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        const wsUrl = cleanUrl.replace(/^https?/, (m: string) => m === 'https' ? 'wss' : 'ws') + '/cable';
        
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


            // Trigger fetchCount on any relevant conversation/message event
            if ([
              'message.created',
              'conversation.created',
              'conversation.read',
              'conversation.status_changed',
              'conversation.updated'
            ].includes(msg.event)) {
              setTimeout(() => fetchCountRef.current(), 200);
            }
          } catch (err) {
            console.error('[UnreadContext WS] Message error:', err);
          }
        };

        ws.onclose = () => {
            clearInterval(pingInterval);
          reconnectTimeout = setTimeout(connect, 5000);
        };
        ws.onerror = (err) => {
          console.error('[UnreadContext WS] Socket error:', err);
          ws?.close();
        };
      } catch (err) {
        console.error('[UnreadContext WS] Connection error:', err);
      }
    };

    connect();
    return () => {
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [profile]);

  // Fallback Polling (polls at regular interval in case WebSocket misses an event)
  useEffect(() => {
    const url = profile?.chatwoot_url;
    const token = profile?.chatwoot_token;
    if (!isChatwootConfigured(profile)) {
      if (timerRef.current) clearInterval(timerRef.current);
      // No Chatwoot = no badge, clean title
      setUnreadCount(0);
      setChatwootAvailable(false);
      return;
    }

    // Initial fetch immediately
    fetchCountRef.current();

    // Then poll at regular interval
    timerRef.current = setInterval(() => fetchCountRef.current(), POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [profile]);

  // Trigger fetchCount immediately when navigating away from /mensajeria
  // to sync the count on other pages without waiting for the next poll.
  useEffect(() => {
    const isMensajeria = window.location.hash.toLowerCase().startsWith('#/mensajeria');
    if (!isMensajeria) {
      fetchCount();
    }
  }, [location.pathname, fetchCount]);

  // Trigger fetchCount immediately when the tab is focused/returned to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCountRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const fetchCommentsCount = useCallback(async () => {
    // Skip requests when the tab is in the background
    if (document.visibilityState !== 'visible') return;
    // Skip when the user is already on /comentarios — the page updates the count directly
    const isComentarios = window.location.hash.toLowerCase().startsWith('#/comentarios');
    if (isComentarios) {
      console.log('[UnreadContext] fetchCommentsCount bypassed: active path is /comentarios');
      setCommentsLoading(false);
      return;
    }
    if (!profile) {
      setCommentsLoading(false);
      return;
    }
    const fbPageId = (profile as any)?.fb_page_id;
    const igId = (profile as any)?.ig_business_id;
    const igUsername = (profile as any)?.ig_username;
    const metaAccountId = (profile as any)?.meta_account_id;

    if (!fbPageId && !igId) {
      setPendingCommentsCount(0);
      setCommentsLoading(false);
      return;
    }

    const isFirst = isFirstCommentsFetch.current;
    if (isFirst) {
      setCommentsLoading(true);
    }
    try {
      let total = 0;
      let ignoredComments: Record<string, boolean> = {};
      if (profile?.id) {
        try {
          ignoredComments = JSON.parse(localStorage.getItem(`car_ignored_comments_${profile.id}`) || '{}');
        } catch {
          ignoredComments = {};
        }
      }

      // 1. Fetch Instagram media posts with comments and replies inline
      let igPosts: any[] = [];
      if (igId) {
        try {
          const res = await metaAds.getInstagramMedia(igId, 50, undefined, fbPageId);
          igPosts = res?.data || res || [];
        } catch {
          igPosts = [];
        }
      }

      // 2. Fetch Facebook feed with comments and replies inline
      let fbPosts: any[] = [];
      if (fbPageId) {
        try {
          const res = await metaAds.getFacebookPageFeed(fbPageId, 50);
          fbPosts = res?.data || res || [];
        } catch {
          fbPosts = [];
        }
      }

      // Helper to check if a comment is pending
      const isCommentPendingLocal = (comment: any, isIg: boolean) => {
        if (ignoredComments[comment?.id]) return false;
        const isFromPage = isIg 
          ? (comment.username && igUsername && comment.username.toLowerCase() === igUsername.toLowerCase()) 
          : comment.from?.id === fbPageId;
        if (isFromPage) return false;

        const replies = comment.replies?.data || [];
        if (replies.length === 0) return true;

        const sorted = [...replies].sort((a, b) =>
          new Date(a.timestamp || a.created_time).getTime() - new Date(b.timestamp || b.created_time).getTime()
        );
        const latest = sorted[sorted.length - 1];
        const latestIsMe = isIg
          ? (latest.username && igUsername && latest.username.toLowerCase() === igUsername.toLowerCase())
          : latest.from?.id === fbPageId;
        return !latestIsMe;
      };

      // Count pending comments in Instagram posts
      igPosts.forEach((post: any) => {
        const rawComments = post.comments?.data || [];
        const userComments = rawComments.filter((c: any) => 
          c.username && igUsername ? c.username.toLowerCase() !== igUsername.toLowerCase() : true
        );
        const pending = userComments.filter((c: any) => isCommentPendingLocal(c, true));
        total += pending.length;
      });

      // Count pending comments in Facebook posts
      fbPosts.forEach((post: any) => {
        const rawComments = post.comments?.data || [];
        const userComments = rawComments.filter((c: any) => c.from?.id !== fbPageId);
        const pending = userComments.filter((c: any) => isCommentPendingLocal(c, false));
        total += pending.length;
      });

      // 3. Fetch Ads comments if metaAccountId is present
      if (metaAccountId) {
        try {
          const adsRes = await metaAds.getAccountAds(metaAccountId);
          const ads = adsRes?.data || [];
          const relevantAds = ads.filter((ad: any) => 
            ad.creative && (ad.creative.effective_object_story_id || ad.creative.effective_instagram_story_id)
          );

          const targets: { storyId: string; platform: 'instagram' | 'facebook' }[] = [];
          relevantAds.forEach((ad: any) => {
            if (ad.creative.effective_object_story_id) {
              targets.push({ storyId: ad.creative.effective_object_story_id, platform: 'facebook' });
            }
            if (ad.creative.effective_instagram_story_id) {
              targets.push({ storyId: ad.creative.effective_instagram_story_id, platform: 'instagram' });
            }
          });

          const uniqueTargetsMap: Record<string, { storyId: string; platform: 'instagram' | 'facebook' }> = {};
          targets.forEach(t => {
            uniqueTargetsMap[`${t.storyId}_${t.platform}`] = t;
          });
          const uniqueTargets = Object.values(uniqueTargetsMap);

          if (uniqueTargets.length > 0) {
            // Fetch comments for top 40 unique targets
            const targetsToFetch = uniqueTargets.slice(0, 40);
            const commentsPromises = targetsToFetch.map(async (target) => {
              try {
                const res = await metaAds.getAdCreativeComments(target.storyId, target.platform, fbPageId);
                return { target, comments: res.data || [] };
              } catch {
                return { target, comments: [] };
              }
            });
            const results = await Promise.all(commentsPromises);
            results.forEach(({ target, comments: rawComments }) => {
              const isIgAd = target.platform === 'instagram';
              const userComments = rawComments.filter((c: any) => {
                return isIgAd 
                  ? (c.username && igUsername ? c.username.toLowerCase() !== igUsername.toLowerCase() : true) 
                  : c.from?.id !== fbPageId;
              });
              const pending = userComments.filter((c: any) => isCommentPendingLocal(c, isIgAd));
              total += pending.length;
            });
          }
        } catch {
          // Keep the global badge quiet when Meta is unavailable.
        }
      }

      setPendingCommentsCount(total);
      if (profile?.id) {
        localStorage.setItem(`car_pending_comments_count_${profile.id}`, String(total));
      }
    } catch (e) {
      console.error('Error in fetchCommentsCount:', e);
    } finally {
      if (isFirst) {
        setCommentsLoading(false);
        isFirstCommentsFetch.current = false;
      }
    }
  }, [profile?.id, profile?.fb_page_id, (profile as any)?.ig_business_id, (profile as any)?.ig_username, profile?.meta_account_id]);

  // Sync comments update event
  useEffect(() => {
    const handleCommentsUpdate = () => {
      fetchCommentsCount();
    };
    window.addEventListener('car_comments_update', handleCommentsUpdate);

    return () => {
      window.removeEventListener('car_comments_update', handleCommentsUpdate);
    };
  }, [fetchCommentsCount]);

  // Poll comments every 5 seconds
  useEffect(() => {
    if (!profile?.id) return;
    fetchCommentsCount();
    const interval = setInterval(fetchCommentsCount, 5_000);
    return () => clearInterval(interval);
  }, [profile?.id, fetchCommentsCount]);

  // ─── Pedidos sin enviar ───────────────────────────────────────────────────

  const fetchOrdersCount = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    const shopifyDomain = (profile as any)?.shopify_domain;
    const shopifyToken  = (profile as any)?.shopify_access_token;
    const wordpressUrl  = (profile as any)?.wordpress_url;
    const wooKey        = (profile as any)?.woo_consumer_key;
    const wooSecret     = (profile as any)?.woo_consumer_secret;
    const tnStoreId     = (profile as any)?.tiendanube_store_id;
    const tnToken       = (profile as any)?.tiendanube_access_token;

    const isShopify = !!(shopifyDomain && shopifyToken);
    const isWoo     = !!(wordpressUrl && wooKey && wooSecret);
    const isTN      = !!(tnStoreId && tnToken);

    if (!isShopify && !isWoo && !isTN) {
      setPendingOrdersCount(0);
      setOrdersLoading(false);
      return;
    }
    try {
      let count = 0;
      if (isShopify) {
        count = await ecommerce.getUnfulfilledCount(
          shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, ''),
          shopifyToken
        );
      } else if (isWoo) {
        count = await ecommerce.getWooUnfulfilledCount(wordpressUrl, wooKey, wooSecret);
      } else if (isTN) {
        count = await ecommerce.getTiendaNubeUnfulfilledCount(tnStoreId, tnToken);
      }
      setPendingOrdersCount(count);
    } catch {
      // silent
    } finally {
      setOrdersLoading(false);
    }
  }, [
    profile?.id,
    (profile as any)?.shopify_domain, (profile as any)?.shopify_access_token,
    (profile as any)?.wordpress_url, (profile as any)?.woo_consumer_key, (profile as any)?.woo_consumer_secret,
    (profile as any)?.tiendanube_store_id, (profile as any)?.tiendanube_access_token,
  ]);

  useEffect(() => {
    const shopifyDomain = (profile as any)?.shopify_domain;
    const shopifyToken  = (profile as any)?.shopify_access_token;
    const wordpressUrl  = (profile as any)?.wordpress_url;
    const wooKey        = (profile as any)?.woo_consumer_key;
    const wooSecret     = (profile as any)?.woo_consumer_secret;
    const tnStoreId     = (profile as any)?.tiendanube_store_id;
    const tnToken       = (profile as any)?.tiendanube_access_token;
    const hasEcommerce  = (shopifyDomain && shopifyToken) || (wordpressUrl && wooKey && wooSecret) || (tnStoreId && tnToken);
    if (!hasEcommerce) { setPendingOrdersCount(0); return; }
    setOrdersLoading(true);
    fetchOrdersCount();
    const interval = setInterval(fetchOrdersCount, 5_000);
    return () => clearInterval(interval);
  }, [profile?.id, fetchOrdersCount]);

  // ─────────────────────────────────────────────────────────────────────────

  const markRead = useCallback(() => {
    setUnreadCount(prev => {
      const nextVal = Math.max(0, prev - 1);
      if (profile?.id) {
        try {
          localStorage.setItem(`car_unread_count_${profile.id}`, String(nextVal));
        } catch (e) {}
      }
      return nextVal;
    });
  }, [profile?.id]);

  return (
    <UnreadContext.Provider value={{ unreadCount, setUnreadCount, pendingCommentsCount, setPendingCommentsCount, commentsLoading, unreadLoading, chatwootAvailable, pendingOrdersCount, ordersLoading, refresh: fetchCount, markRead }}>
      {children}
    </UnreadContext.Provider>
  );
};
