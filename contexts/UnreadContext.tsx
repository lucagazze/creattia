import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useViewAs } from './ViewAsContext';
import { chatwoot } from '../services/chatwoot';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnreadContextType {
  /** Number of open conversations (badge count shown in sidebar) */
  unreadCount: number;
  /** Manually refresh the count (called e.g. after sending a message) */
  refresh: () => void;
}

const UnreadContext = createContext<UnreadContextType>({
  unreadCount: 0,
  refresh: () => {},
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

const POLL_INTERVAL_MS = 60_000; // poll every 60 seconds

export const UnreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();

  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    const url = profile?.chatwoot_url;
    const token = profile?.chatwoot_token;
    if (!url || !token) return;

    try {
      const conversations = await chatwoot.getConversations(url, token, 'open');
      if (!Array.isArray(conversations)) return;

      const manuallyUnread = getManuallyUnreadSet(profile?.id);

      const count = conversations.filter((c: any) => {
        if (!c) return false;
        if (c.status === 'resolved') return false;

        // Sort messages to find the last real message (message_type !== 2)
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
      }).length;

      setUnreadCount(count);
    } catch {
      // silently ignore — badge just won't update
    }
  }, [profile?.id, profile?.chatwoot_url, profile?.chatwoot_token]);

  // Keep a ref to the latest fetchCount function to prevent connection churn in WebSocket
  const fetchCountRef = useRef(fetchCount);
  useEffect(() => {
    fetchCountRef.current = fetchCount;
  }, [fetchCount]);

  // Update browser tab title dynamically when unread count changes
  useEffect(() => {
    const defaultTitle = 'Portal C.A.R | Algoritmia';
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${defaultTitle}`;
    } else {
      document.title = defaultTitle;
    }
  }, [unreadCount]);

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
        console.log('[UnreadContext WS] Fetching profile for pubsub token...');
        const { pubsub_token } = await chatwoot.getProfile(url, token);
        if (!pubsub_token) return;

        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        const wsUrl = cleanUrl.replace(/^https?/, (m: string) => m === 'https' ? 'wss' : 'ws') + '/cable';
        
        console.log('[UnreadContext WS] Connecting to:', wsUrl);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[UnreadContext WS] Connected. Subscribing to RoomChannel...');
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

            console.log('[UnreadContext WS] Real-time event received:', msg.event);

            // Trigger fetchCount on any relevant conversation/message event
            if ([
              'message.created',
              'conversation.created',
              'conversation.read',
              'conversation.status_changed',
              'conversation.updated'
            ].includes(msg.event)) {
              setTimeout(() => {
                console.log('[UnreadContext WS] Triggering badge refresh...');
                fetchCountRef.current();
              }, 200);
            }
          } catch (err) {
            console.error('[UnreadContext WS] Message error:', err);
          }
        };

        ws.onclose = () => {
          console.log('[UnreadContext WS] Disconnected. Reconnecting in 5s...');
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
      console.log('[UnreadContext WS] Cleaning up websocket connection...');
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

  return (
    <UnreadContext.Provider value={{ unreadCount, refresh: fetchCount }}>
      {children}
    </UnreadContext.Provider>
  );
};
