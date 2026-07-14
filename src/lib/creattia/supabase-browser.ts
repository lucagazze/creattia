import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const forcedLocalDemo = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

export const isSupabaseConfigured = Boolean(url && publishableKey && !forcedLocalDemo);

export const supabase: SupabaseClient | null = isSupabaseConfigured
	? createClient(url, publishableKey, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true,
			},
			})
	: null;
