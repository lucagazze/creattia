import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useViewAs } from './ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import { metaAds } from '../services/metaAds';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnreadContextType {
  /** Number of open conversations (badge count shown in sidebar) */
  unreadCount: number;
  /** Number of pending comments on IG, FB, and Ads */
  pendingCommentsCount: number;
  /** Manually refresh the count (called e.g. after sending a message) */
  refresh: () => void;
  /** Instantly decrement badge by 1 when a conversation is opened — no network round-trip */
  markRead: () => void;
}

const UnreadContext = createContext<UnreadContextType>({
  unreadCount: 0,
  pendingCommentsCount: 0,
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

const POLL_INTERVAL_MS = 20_000; // poll every 20 seconds

export const UnreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();

  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingCommentsCount, setPendingCommentsCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load cached count or reset when switching profiles to prevent flash of wrong client
  useEffect(() => {
    if (profile?.id) {
      const cachedUnread = localStorage.getItem(`car_unread_count_${profile.id}`);
      const cachedComments = localStorage.getItem(`car_pending_comments_count_${profile.id}`);
      setUnreadCount(cachedUnread ? parseInt(cachedUnread, 10) : 0);
      setPendingCommentsCount(cachedComments ? parseInt(cachedComments, 10) : 0);
    } else {
      setUnreadCount(0);
      setPendingCommentsCount(0);
    }
    document.title = 'Portal C.A.R | Algoritmia';
  }, [profile?.id]);

  const fetchCount = useCallback(async () => {
    const url = profile?.chatwoot_url;
    const token = profile?.chatwoot_token;
    if (!url || !token) return;

    try {
      const conversations = await chatwoot.getConversations(url, token, 'open');
      if (!Array.isArray(conversations)) return;

      // Count ALL open conversations — matches the "Todos" tab in Mensajería
      const count = conversations.filter((c: any) => c && c.status !== 'resolved').length;

      setUnreadCount(count);
      if (profile?.id) {
        localStorage.setItem(`car_unread_count_${profile.id}`, String(count));
      }
    } catch {
      // silently ignore — badge just won't update
    }
  }, [profile?.id, profile?.chatwoot_url, profile?.chatwoot_token]);

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
    if (!url || !token) return;

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
  }, [profile?.chatwoot_url, profile?.chatwoot_token]);

  // Fallback Polling (polls at regular interval in case WebSocket misses an event)
  useEffect(() => {
    const url = profile?.chatwoot_url;
    const token = profile?.chatwoot_token;
    if (!url || !token) {
      if (timerRef.current) clearInterval(timerRef.current);
      // No Chatwoot = no badge, clean title
      setUnreadCount(0);
      return;
    }

    // Initial fetch immediately
    fetchCountRef.current();

    // Then poll at regular interval
    timerRef.current = setInterval(() => fetchCountRef.current(), POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [profile?.chatwoot_url, profile?.chatwoot_token]);

  const fetchCommentsCount = useCallback(async () => {
    if (!profile) return;
    const fbPageId = (profile as any)?.fb_page_id;
    const igId = (profile as any)?.ig_business_id;
    const igUsername = (profile as any)?.ig_username;
    const metaAccountId = (profile as any)?.meta_account_id;

    if (!fbPageId && !igId) {
      setPendingCommentsCount(0);
      return;
    }

    try {
      let total = 0;

      // 1. Fetch Instagram media posts with comments and replies inline
      let igPosts: any[] = [];
      if (igId) {
        try {
          const res = await metaAds.getInstagramMedia(igId, 12);
          igPosts = res?.data || res || [];
        } catch (e) {
          console.error('Error fetching IG media for unread count:', e);
        }
      }

      // 2. Fetch Facebook feed with comments and replies inline
      let fbPosts: any[] = [];
      if (fbPageId) {
        try {
          const res = await metaAds.getFacebookPageFeed(fbPageId, 12);
          fbPosts = res?.data || res || [];
        } catch (e) {
          console.error('Error fetching FB feed for unread count:', e);
        }
      }

      // Helper to check if a comment is pending
      const isCommentPendingLocal = (comment: any, isIg: boolean) => {
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
            // Fetch comments for top 12 unique targets
            const targetsToFetch = uniqueTargets.slice(0, 12);
            const commentsPromises = targetsToFetch.map(async (target) => {
              try {
                const res = await metaAds.getAdCreativeComments(target.storyId);
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
        } catch (e) {
          console.error('Error fetching Ads for unread count:', e);
        }
      }

      setPendingCommentsCount(total);
      if (profile?.id) {
        localStorage.setItem(`car_pending_comments_count_${profile.id}`, String(total));
      }
    } catch (e) {
      console.error('Error in fetchCommentsCount:', e);
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

  // Poll comments every 90 seconds
  useEffect(() => {
    if (!profile?.id) return;
    fetchCommentsCount();
    const interval = setInterval(fetchCommentsCount, 90_000);
    return () => clearInterval(interval);
  }, [profile?.id, fetchCommentsCount]);

  const markRead = useCallback(() => {
    setUnreadCount(prev => {
      const nextVal = Math.max(0, prev - 1);
      if (profile?.id) {
        localStorage.setItem(`car_unread_count_${profile.id}`, String(nextVal));
      }
      return nextVal;
    });
  }, [profile?.id]);

  return (
    <UnreadContext.Provider value={{ unreadCount, pendingCommentsCount, refresh: fetchCount, markRead }}>
      {children}
    </UnreadContext.Provider>
  );
};
