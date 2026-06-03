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
  const loadProfilePromiseRef = React.useRef<Promise<any> | null>(null);

  const loadProfile = (userId: string, email?: string) => {
    if (loadProfilePromiseRef.current) return loadProfilePromiseRef.current;

    const promise = (async () => {
      const retries = 3;
      for (let i = 0; i < retries; i++) {
        try {
          const p = await db.profile.getByUserId(userId, email);
          setProfile(p);
          if (p) {
            db.activity.log(userId, p.id, 'session_start', {
              user_email: email,
              ua: navigator.userAgent,
              screen: `${window.innerWidth}x${window.innerHeight}`,
            });
          }
          return p;
        } catch (err) {
          console.error(`Error loading profile (attempt ${i + 1}/${retries}):`, err);
          if (i === retries - 1) {
            setProfile(null);
            loadProfilePromiseRef.current = null;
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    })();

    loadProfilePromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    const LAST_ACTIVE_KEY = 'car_last_active';
    const MAX_IDLE_DAYS = 15;

    const checkIdleTimeout = async (hasSession: boolean) => {
      if (!hasSession) {
        localStorage.removeItem(LAST_ACTIVE_KEY);
        return false;
      }
      const lastActive = localStorage.getItem(LAST_ACTIVE_KEY);
      const now = Date.now();
      if (lastActive) {
        const idleDays = (now - parseInt(lastActive, 10)) / (1000 * 60 * 60 * 24);
        if (idleDays > MAX_IDLE_DAYS) {
          await supabase.auth.signOut();
          localStorage.removeItem(LAST_ACTIVE_KEY);
          return true; // was signed out
        }
      }
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
      return false;
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const signedOut = await checkIdleTimeout(!!session);
      if (signedOut) { setLoading(false); return; }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id, session.user.email).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
        setLoading(true);
        loadProfile(session.user.id, session.user.email).finally(() => setLoading(false));
      } else {
        setProfile(null);
        loadProfilePromiseRef.current = null;
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
