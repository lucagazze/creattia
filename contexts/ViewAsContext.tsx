import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { ClientProfile } from '../services/db';
import { useAuth } from './AuthContext';

interface ViewAsContextType {
  viewAsProfile: ClientProfile | null;
  setViewAsProfile: (p: ClientProfile | null | ((prev: ClientProfile | null) => ClientProfile | null)) => void;
  isViewingAs: boolean;
}

const ViewAsContext = createContext<ViewAsContextType | undefined>(undefined);

export const ViewAsProvider = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading: authLoading } = useAuth();
  const [viewAsProfile, setViewAsProfile] = useState<ClientProfile | null>(null);

  useEffect(() => {
    // If authentication details are still loading, do nothing yet
    if (authLoading) return;

    // Security check: if not logged in or NOT an admin, immediately clear impersonation state
    if (!profile || !profile.is_admin) {
      setViewAsProfile(null);
      localStorage.removeItem('view_as_client_id');
      return;
    }

    const storedId = localStorage.getItem('view_as_client_id');
    if (!storedId) {
      setViewAsProfile(null);
      return;
    }

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('car_clients')
          .select('*')
          .eq('id', storedId)
          .maybeSingle();

        if (data && !error) {
          setViewAsProfile(data);
        } else {
          localStorage.removeItem('view_as_client_id');
          setViewAsProfile(null);
        }
      } catch (err) {
        console.error('Error restoring View As profile:', err);
      }
    };

    fetchProfile();
  }, [profile, authLoading]);

  const handleSetProfile = (p: ClientProfile | null | ((prev: ClientProfile | null) => ClientProfile | null)) => {
    // Security check: if the active user is not an admin, block setting any view-as profile
    if (!profile || !profile.is_admin) {
      setViewAsProfile(null);
      localStorage.removeItem('view_as_client_id');
      return;
    }

    // Functional form always resolves against the LATEST state, never a stale closure value.
    // This matters when multiple updates are queued in the same tick (e.g. disconnecting an
    // integration triggers two sequential setViewAsProfile calls) — using a stale snapshot in
    // the second call would silently undo the first one.
    setViewAsProfile(prev => {
      const next = typeof p === 'function' ? (p as (prev: ClientProfile | null) => ClientProfile | null)(prev) : p;
      try {
        if (next) localStorage.setItem('view_as_client_id', next.id);
        else localStorage.removeItem('view_as_client_id');
      } catch (e) {}
      return next;
    });
  };

  const isViewingAs = viewAsProfile !== null && (profile?.is_admin === true);

  return (
    <ViewAsContext.Provider value={{
      viewAsProfile: isViewingAs ? viewAsProfile : null,
      setViewAsProfile: handleSetProfile,
      isViewingAs,
    }}>
      {children}
    </ViewAsContext.Provider>
  );
};

export const useViewAs = () => {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    console.warn('useViewAs was used outside ViewAsProvider. Returning fallback.');
    return {
      viewAsProfile: null,
      setViewAsProfile: () => {},
      isViewingAs: false
    };
  }
  return ctx;
};

