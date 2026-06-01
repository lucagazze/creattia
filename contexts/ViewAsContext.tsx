import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { ClientProfile } from '../services/db';

interface ViewAsContextType {
  viewAsProfile: ClientProfile | null;
  setViewAsProfile: (p: ClientProfile | null) => void;
  isViewingAs: boolean;
}

const ViewAsContext = createContext<ViewAsContextType | undefined>(undefined);

export const ViewAsProvider = ({ children }: { children: React.ReactNode }) => {
  const [viewAsProfile, setViewAsProfile] = useState<ClientProfile | null>(null);

  useEffect(() => {
    const storedId = localStorage.getItem('view_as_client_id');
    if (!storedId) return;

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
        }
      } catch (err) {
        console.error('Error restoring View As profile:', err);
      }
    };

    fetchProfile();
  }, []);

  const handleSetProfile = (p: ClientProfile | null) => {
    setViewAsProfile(p);
    if (p) {
      localStorage.setItem('view_as_client_id', p.id);
    } else {
      localStorage.removeItem('view_as_client_id');
    }
  };

  return (
    <ViewAsContext.Provider value={{
      viewAsProfile,
      setViewAsProfile: handleSetProfile,
      isViewingAs: viewAsProfile !== null,
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

