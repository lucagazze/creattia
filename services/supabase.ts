import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";

// Client estándar (anon key)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Custom helper to call the secure backend API
async function callAdminUsersApi(action: string, payload?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session found. Please log in.');

  const res = await fetch('/api/admin-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ action, payload })
  });

  const responseData = await res.json();
  if (!res.ok) {
    throw new Error(responseData.error || 'API request failed');
  }
  return { data: responseData, error: null };
}

// Mock supabaseAdmin to preserve existing code references but execute securely on the server
export const supabaseAdmin = {
  auth: {
    admin: {
      listUsers: async (params?: any) => {
        try {
          const res = await callAdminUsersApi('listUsers', params);
          return res;
        } catch (err: any) {
          return { data: null, error: err };
        }
      },
      getUserById: async (userId: string) => {
        try {
          const res = await callAdminUsersApi('getUserById', { userId });
          return res;
        } catch (err: any) {
          return { data: null, error: err };
        }
      },
      createUser: async (params: any) => {
        try {
          const res = await callAdminUsersApi('createUser', params);
          // Return format expected: { data: { user: ... }, error: null }
          return { data: { user: res.data.user }, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      },
      updateUserById: async (userId: string, data: any) => {
        try {
          const res = await callAdminUsersApi('updateUserById', { userId, data });
          return res;
        } catch (err: any) {
          return { data: null, error: err };
        }
      },
      deleteUser: async (userId: string) => {
        try {
          const res = await callAdminUsersApi('deleteUser', { userId });
          return res;
        } catch (err: any) {
          return { data: null, error: err };
        }
      }
    }
  }
} as any;
