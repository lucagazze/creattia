import { supabase, supabaseAdmin } from './supabase';

const dbClient = () => (typeof (supabaseAdmin as any)?.from === 'function' ? (supabaseAdmin as any) : supabase);

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
  facebook_access_token?: string;
  klaviyo_api_key?: string;
  klaviyo_list_id?: string;
  ecommerce_platform?: string;
  shopify_domain?: string;
  shopify_access_token?: string;
  tiendanube_store_id?: string;
  tiendanube_access_token?: string;
  active?: boolean;
  is_admin?: boolean;
  client_tags?: string[];
  fb_page_id?: string;
  fb_page_name?: string;
  fb_page_access_token?: string;
  ig_business_id?: string;
  ig_username?: string;
  business_description?: string;
  custom_instructions?: string;
  website_url?: string;
  scraped_content?: string;
  instagram_context?: string;
  brain_updated_at?: string;
  tiktok_content_access_token?: string;
  tiktok_content_refresh_token?: string;
  tiktok_content_open_id?: string;
  tiktok_content_display_name?: string;
  tiktok_content_avatar_url?: string;
  tiktok_content_expiration?: string;
  tiktok_advertiser_id?: string;
  youtube_access_token?: string;
  youtube_refresh_token?: string;
  youtube_channel_id?: string;
  youtube_channel_title?: string;
  youtube_expiration?: string;
  connection_statuses?: Record<string, any>;
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

export interface EmailAssignment {
  id: number;
  email_file: string;
  client_id: string;
  status: 'active' | 'inactive' | 'scheduled';
  scheduled_at?: string;
  approved: boolean;
  created_at: string;
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
  clients: {
    async getAll(): Promise<Pick<ClientProfile, 'id' | 'business_name'>[]> {
      const client = dbClient();
      const { data, error } = await client
        .from('car_clients')
        .select('id, business_name')
        .order('business_name');
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async getAllWithIntegrations(): Promise<Pick<ClientProfile, 'id' | 'business_name' | 'klaviyo_api_key'>[]> {
      const client = dbClient();
      const { data, error } = await client
        .from('car_clients')
        .select('id, business_name, klaviyo_api_key')
        .order('business_name');
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async updateField(clientId: string, fields: Partial<ClientProfile>) {
      const client = dbClient();
      const { error } = await client.from('car_clients').update(fields).eq('id', clientId);
      if (error) throw error;
    },
  },

  profile: {
    async getByUserId(userId: string, email?: string): Promise<ClientProfile | null> {
      // 1. Cuenta directa en car_clients (dueño)
      const { data, error: errClient } = await supabase
        .from('car_clients')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (errClient) {
        console.error("db.profile.getByUserId - Error checking direct owner:", errClient);
      }
      if (data) return data;

      // 2. Cuenta asociada: buscar el business_id en car_business_accounts (usando el cliente standard con RLS)
      const { data: link, error: errLink } = await supabase
        .from('car_business_accounts')
        .select('id, business_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (errLink) {
        console.error("db.profile.getByUserId - Error fetching business link by user_id:", errLink);
      }

      let activeLink = link;

      // Fallback: si no se encuentra por user_id pero se proporciona el email, se busca por email para vincularlo dinámicamente
      if (!activeLink && email) {
        const cleanEmail = email.trim().toLowerCase();
        const { data: matchedLink, error: errMatch } = await supabase
          .from('car_business_accounts')
          .select('id, business_id, user_id')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (errMatch) {
          console.error("db.profile.getByUserId - Error looking up pre-invite by email:", errMatch);
        }

        if (matchedLink) {
          // Vincular el user_id en car_business_accounts automáticamente usando el cliente standard (RLS)
          const { error: errUpdate } = await supabase
            .from('car_business_accounts')
            .update({ user_id: userId })
            .eq('id', matchedLink.id);

          if (errUpdate) {
            console.error("db.profile.getByUserId - Error updating user_id in business link:", errUpdate);
            // Fallback al service role si el cliente anon no pudo
            if (typeof (supabaseAdmin as any)?.from === 'function') {
              const { error: errUpdateAdmin } = await supabaseAdmin
                .from('car_business_accounts')
                .update({ user_id: userId })
                .eq('id', matchedLink.id);
              if (errUpdateAdmin) {
                console.error("db.profile.getByUserId - Fallback admin update also failed:", errUpdateAdmin);
              }
            }
          }
          
          activeLink = matchedLink;
        }
      }

      if (!activeLink) return null;

      // 3. Leer el negocio con el cliente standard (RLS ahora permite leer negocios asociados)
      const { data: business, error: errBiz } = await supabase
        .from('car_clients')
        .select('*')
        .eq('id', activeLink.business_id)
        .maybeSingle();

      if (errBiz) {
        console.error("db.profile.getByUserId - Error fetching associated business:", errBiz);
        // Fallback al service role si RLS falló
        if (typeof (supabaseAdmin as any)?.from === 'function') {
          const { data: adminBiz, error: errAdminBiz } = await supabaseAdmin
            .from('car_clients')
            .select('*')
            .eq('id', activeLink.business_id)
            .maybeSingle();
          if (errAdminBiz) console.error("db.profile.getByUserId - Fallback admin fetch business failed:", errAdminBiz);
          return adminBiz ?? null;
        }
      }

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
      const client = dbClient();
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

  emailAssignments: {
    async getAll(): Promise<EmailAssignment[]> {
      const client = dbClient();
      const { data, error } = await client.from('car_email_assignments').select('*').order('created_at', { ascending: false });
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async getByClientId(clientId: string): Promise<EmailAssignment[]> {
      const { data, error } = await supabase
        .from('car_email_assignments').select('*')
        .eq('client_id', clientId).eq('approved', true);
      if (error) { console.error(error); return []; }
      return data ?? [];
    },
    async upsert(a: Omit<EmailAssignment, 'id' | 'created_at'> & { id?: number }) {
      const { error } = await supabase.from('car_email_assignments').upsert(a, { onConflict: 'email_file,client_id' });
      if (error) throw error;
    },
    async delete(id: number) {
      const { error } = await supabase.from('car_email_assignments').delete().eq('id', id);
      if (error) throw error;
    },
  },

  activity: {
    async log(userId: string, clientId: string, action: string, metadata: any = {}) {
      // Fire-and-forget: call the serverless API in the background.
      // We retrieve the session asynchronously and trigger fetch without awaiting the response.
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          
          fetch('/api/admin-users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              action: 'logActivity',
              payload: {
                clientId,
                activityAction: action,
                metadata: {
                  ...metadata,
                  ua: navigator.userAgent,
                  screen: `${window.innerWidth}x${window.innerHeight}`
                }
              }
            })
          }).catch(err => console.error('Error logging activity request:', err));
        } catch (error) {
          console.error('Error logging activity:', error);
        }
      })();
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
