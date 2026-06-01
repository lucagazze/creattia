import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
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

// ─── Provider ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // poll every 60 seconds

export const UnreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const location = useLocation();

  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMensajeria = location.pathname === '/mensajeria';

  const fetchCount = useCallback(async () => {
    const url = profile?.chatwoot_url;
    const token = profile?.chatwoot_token;
    if (!url || !token) return;

    try {
      // /conversations/meta returns total counts per status without loading all payloads
      const meta = await chatwoot.getConversationsMeta(url, token, 'open');
      // Chatwoot returns: { all_count, assigned_count, unassigned_count, ... }
      const count: number =
        meta?.all_count ??
        meta?.data?.all_count ??
        meta?.unassigned_count ??
        0;
      setUnreadCount(count);
    } catch {
      // silently ignore — badge just won't update
    }
  }, [profile?.chatwoot_url, profile?.chatwoot_token]);

  // Clear badge when user is inside Mensajería
  useEffect(() => {
    if (isMensajeria) {
      setUnreadCount(0);
    }
  }, [isMensajeria]);

  // Poll for count when not inside Mensajería
  useEffect(() => {
    if (isMensajeria || !profile?.chatwoot_url || !profile?.chatwoot_token) {
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
  }, [isMensajeria, fetchCount, profile?.chatwoot_url, profile?.chatwoot_token]);

  return (
    <UnreadContext.Provider value={{ unreadCount, refresh: fetchCount }}>
      {children}
    </UnreadContext.Provider>
  );
};
