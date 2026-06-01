import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { db, ClientProfile } from '../services/db';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: ClientProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedUserIdRef = React.useRef<string | null>(null);

  const loadProfile = async (userId: string, email?: string) => {
    if (loadedUserIdRef.current === userId) return;
    loadedUserIdRef.current = userId;

    const retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        const p = await db.profile.getByUserId(userId);
        setProfile(p);
        if (p) {
          db.activity.log(userId, p.id, 'session_start', {
            user_email: email,
            ua: navigator.userAgent,
            screen: `${window.innerWidth}x${window.innerHeight}`,
          });
        }
        return; // success — exit retry loop
      } catch (err) {
        console.error(`Error loading profile (attempt ${i + 1}/${retries}):`, err);
        if (i === retries - 1) {
          setProfile(null);
          loadedUserIdRef.current = null;
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id, session.user.email).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setLoading(true);
        loadProfile(session.user.id, session.user.email).finally(() => setLoading(false));
      } else {
        setProfile(null);
        loadedUserIdRef.current = null;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
