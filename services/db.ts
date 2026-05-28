import { supabase, supabaseAdmin } from './supabase';

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
      // Cuenta directa en car_clients
      const { data } = await supabase
        .from('car_clients')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (data) return data;

      // Cuenta asociada: buscar el business_id y leer el negocio con supabaseAdmin
      // (necesario para bypasear RLS — el user_id del negocio no coincide con auth.uid())
      const adminClient = supabaseAdmin ?? supabase;
      const { data: link } = await adminClient
        .from('car_business_accounts')
        .select('business_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!link) return null;

      const { data: business } = await adminClient
        .from('car_clients')
        .select('*')
        .eq('id', link.business_id)
        .maybeSingle();
      return business ?? null;
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
      const client = supabaseAdmin ?? supabase;
      const { data, error } = await client
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

  emailSent: {
    async getAll(): Promise<Array<{ id: number; file: string; client: string; sent_at: string }>> {
      const { data, error } = await supabase
        .from('car_email_sent')
        .select('id, file, client, sent_at')
        .order('sent_at', { ascending: true });
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async mark(file: string, client: string): Promise<void> {
      const { error } = await supabase.from('car_email_sent').insert({ file, client });
      if (error) throw error;
    },
    async unmark(file: string): Promise<void> {
      const { error } = await supabase.from('car_email_sent').delete().eq('file', file);
      if (error) throw error;
    },
  },

  activity: {
    async log(userId: string, clientId: string, action: string, metadata: any = {}) {
      try {
        // Use provided email or fallback
        const userEmail = metadata.user_email || 'Desconocido';

        let ip = 'unknown';
        let location = {};

        // Try multiple IP services to bypass CORS/failures
        const services = [
          'https://api.ipify.org?format=json',
          'https://freeipapi.com/api/json',
          'https://ipapi.co/json/'
        ];

        for (const service of services) {
          try {
            const res = await fetch(service, { timeout: 2000 } as any).catch(() => null);
            if (res && res.ok) {
              const data = await res.json();
              ip = data.ip || data.ipAddress || data.ip_address || data.query || 'unknown';
              location = {
                city: data.city || data.cityName || data.city_name || '',
                region: data.region || data.regionName || data.region_name || '',
                country: data.country_name || data.countryName || data.country || '',
                org: data.org || data.asName || data.isp || ''
              };
              if (ip !== 'unknown') break;
            }
          } catch (e) {
            continue;
          }
        }

        // Group by IP AND Device (User Agent) to distinguish between different computers
        const ua = metadata.ua || 'unknown';
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        
        let query = supabase
          .from('car_user_activity')
          .select('id, metadata')
          .eq('user_id', userId)
          .eq('action', action)
          .gt('created_at', oneHourAgo);

        if (ip !== 'unknown') {
          query = query.eq('ip', ip);
        } else {
          query = query.is('ip', null);
        }

        // Add filter for User Agent in metadata to separate different devices
        const { data: allExisting } = await query.order('created_at', { ascending: false });
        const existing = allExisting?.find(e => e.metadata?.ua === ua);

        const { error: checkError } = { error: null }; // Mock checkError as we are doing manual find

        if (existing) {
          await supabase
            .from('car_user_activity')
            .update({
              created_at: new Date().toISOString(),
              metadata: { ...existing.metadata, ...metadata, user_email: userEmail, refreshes: (existing.metadata?.refreshes || 0) + 1 }
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('car_user_activity').insert({
            user_id: userId,
            client_id: clientId,
            action,
            metadata: { ...metadata, user_email: userEmail, refreshes: 1 },
            ip: ip === 'unknown' ? null : ip,
            location
          });
        }
      } catch (error) {
        console.error('Error logging activity:', error);
      }
    },
    async getStats(daysAgo: number = 7) {
      const { data, error } = await supabase.rpc('get_daily_activity_stats', { days_ago: daysAgo });
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async getRecent(limit: number = 50) {
      const { data, error } = await supabase
        .from('car_user_activity')
        .select('*, client:car_clients(business_name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) { console.error(error); return []; }
      return data ?? [];
    }
  },
};
