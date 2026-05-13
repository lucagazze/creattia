import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ClientProfile {
  id: string;
  user_id: string;
  business_name: string;
  business_logo_url?: string;
  industry?: string;
  plan?: string;
  chatwoot_token?: string;
  chatwoot_url?: string;
  meta_account_id?: string;
  meta_pixel_id?: string;
  klaviyo_api_key?: string;
  klaviyo_list_id?: string;
  ecommerce_platform?: string;
  shopify_domain?: string;
  shopify_access_token?: string;
  tiendanube_store_id?: string;
  tiendanube_access_token?: string;
  active?: boolean;
  is_admin?: boolean;
  created_at: string;
}

export interface MetaMetric {
  id: number;
  client_id: string;
  period_start: string;
  period_end: string;
  // Alcance y rendimiento
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  // Conversiones
  conversions: number;
  cost_per_result: number;
  // Gasto
  spend: number;
  currency: string;
  // ROAS
  roas?: number;
  // Extra
  frequency?: number;
  cpm?: number;
  notes?: string;
  created_at: string;
}

export interface EmailMetric {
  id: number;
  client_id: string;
  period_start: string;
  period_end: string;
  campaign_name: string;
  // Envíos
  emails_sent: number;
  delivered: number;
  // Engagement
  open_rate: number;
  click_rate: number;
  unsubscribe_rate: number;
  // Absolutos
  unique_opens: number;
  unique_clicks: number;
  bounces: number;
  notes?: string;
  created_at: string;
}

export interface ClientLink {
  id: number;
  client_id: string;
  label: string;
  url: string;
  icon?: string;
  category?: string;
  sort_order: number;
}

export interface MonthlyReport {
  id: number;
  client_id: string;
  title: string;
  period: string;
  file_url?: string;
  summary?: string;
  created_at: string;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export const db = {
  profile: {
    async getByUserId(userId: string): Promise<ClientProfile | null> {
      const { data, error } = await supabase
        .from('car_clients')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (error) { console.error(error); return null; }
      return data;
    },
  },

  meta: {
    async getByClientId(clientId: string): Promise<MetaMetric[]> {
      const { data, error } = await supabase
        .from('car_meta_metrics')
        .select('*')
        .eq('client_id', clientId)
        .order('period_start', { ascending: false });
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async upsert(metric: Partial<MetaMetric>) {
      const { error } = await supabase.from('car_meta_metrics').upsert(metric);
      if (error) throw error;
    },
  },

  email: {
    async getByClientId(clientId: string): Promise<EmailMetric[]> {
      const { data, error } = await supabase
        .from('car_email_metrics')
        .select('*')
        .eq('client_id', clientId)
        .order('period_start', { ascending: false });
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async upsert(metric: Partial<EmailMetric>) {
      const { error } = await supabase.from('car_email_metrics').upsert(metric);
      if (error) throw error;
    },
  },

  links: {
    async getByClientId(clientId: string): Promise<ClientLink[]> {
      const { data, error } = await supabase
        .from('car_links')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true });
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async upsert(link: Omit<ClientLink, 'id'> & { id?: number }) {
      const { data, error } = await supabase.from('car_links').upsert(link).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id: number) {
      const { error } = await supabase.from('car_links').delete().eq('id', id);
      if (error) throw error;
    }
  },

  reports: {
    async getByClientId(clientId: string): Promise<MonthlyReport[]> {
      const { data, error } = await supabase
        .from('car_reports')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
  },
};
