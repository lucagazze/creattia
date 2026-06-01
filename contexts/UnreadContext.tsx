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

  // Sync manual unread status from same tab or other tabs via StorageEvent/CustomEvent
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `car_manually_unread_${profile?.id || 'default'}`) {
        fetchCount();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleLocalUpdate = () => fetchCount();
    window.addEventListener('car_manually_unread_update', handleLocalUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('car_manually_unread_update', handleLocalUpdate);
    };
  }, [profile?.id, fetchCount]);

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

        const wsUrl = url.replace(/^https?/, (m: string) => m === 'https' ? 'wss' : 'ws') + '/cable';
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
              setTimeout(fetchCount, 200);
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
  }, [profile?.chatwoot_url, profile?.chatwoot_token, fetchCount]);

  // Fallback Polling (polls at regular interval in case WebSocket misses an event)
  useEffect(() => {
    const url = profile?.chatwoot_url;
    const token = profile?.chatwoot_token;
    if (!url || !token) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Initial fetch immediately
    fetchCount();

    // Then poll at regular interval
    timerRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchCount, profile?.chatwoot_url, profile?.chatwoot_token]);

  return (
    <UnreadContext.Provider value={{ unreadCount, refresh: fetchCount }}>
      {children}
    </UnreadContext.Provider>
  );
};
