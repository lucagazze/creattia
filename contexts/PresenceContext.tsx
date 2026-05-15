import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

interface PresenceState {
  user_id: string;
  business_name: string;
  online_at: string;
}

interface PresenceContextType {
  onlineUsers: Record<string, PresenceState[]>;
  onlineCount: number;
}

const PresenceContext = createContext<PresenceContextType>({
  onlineUsers: {},
  onlineCount: 0,
});

export const usePresence = () => useContext(PresenceContext);

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceState[]>>({});
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: profile.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        setOnlineUsers(state);
        
        // Count unique keys (users)
        setOnlineCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: profile.id,
            user_email: user?.email || 'Desconocido',
            business_name: profile.business_name || 'Admin',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [profile]);

  return (
    <PresenceContext.Provider value={{ onlineUsers, onlineCount }}>
      {children}
    </PresenceContext.Provider>
  );
};
