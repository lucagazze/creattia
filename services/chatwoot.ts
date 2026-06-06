import { supabase } from './supabase';

const proxy = async (chatwoot_url: string, chatwoot_token: string, path: string, body?: any, method?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  const authHeader = session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {};
  const res = await fetch('/api/scrape-website', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ chatwoot_url, chatwoot_token, path, ...(body !== undefined ? { body } : {}), ...(method ? { method } : {}) }),
  });
  const text = await res.text().catch(() => '{}');
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data?.message || data?.error || `Chatwoot ${res.status}`);
  return data;
};

let cachedProfile: Record<string, { account_id: number; pubsub_token: string }> = {};

export const chatwoot = {
  async getProfile(url: string, token: string) {
    const key = `${url}:${token}`;
    if (cachedProfile[key]) return cachedProfile[key];
    const data = await proxy(url, token, '/api/v1/profile');
    if (!data?.account_id) throw new Error('No se pudo obtener el perfil de Chatwoot');
    cachedProfile[key] = { account_id: data.account_id, pubsub_token: data.pubsub_token };
    return cachedProfile[key];
  },

  async getAccountId(url: string, token: string): Promise<number> {
    return (await chatwoot.getProfile(url, token)).account_id;
  },

  async getConversationsPage(url: string, token: string, status = 'open', page = 1, inboxId?: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    let path = `/api/v1/accounts/${accountId}/conversations?status=${status}&page=${page}&assignee_type=all`;
    if (inboxId !== undefined) {
      path += `&inbox_id=${inboxId}`;
    }
    const data = await proxy(url, token, path);
    const payload = data?.data?.payload || data?.payload || [];
    const meta = data?.data?.meta || data?.meta || {};
    return { payload, hasMore: payload.length === 25, meta };
  },

  async getConversations(url: string, token: string, status = 'open') {
    const { payload } = await chatwoot.getConversationsPage(url, token, status, 1);
    return payload;
  },

  async getSummary(url: string, token: string, since: number, until: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/reports/summary?since=${since}&until=${until}`);
  },

  async getConversationsMeta(url: string, token: string, status = 'open', inboxId?: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    let path = `/api/v1/accounts/${accountId}/conversations/meta?status=${status}`;
    if (inboxId !== undefined) {
      path += `&inbox_id=${inboxId}`;
    }
    return proxy(url, token, path);
  },

  async getAgents(url: string, token: string) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/agents`);
    return Array.isArray(data) ? data : (data?.payload || data?.data || []);
  },

  async getReportsSummary(url: string, token: string, since: number, until: number, type = 'account', id?: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    let path = `/api/v2/accounts/${accountId}/reports/summary?since=${since}&until=${until}&type=${type}`;
    if (id !== undefined) {
      path += `&id=${id}`;
    }
    return proxy(url, token, path);
  },

  async getReportsTimeSeries(url: string, token: string, metric: string, since: number, until: number, type = 'account', id?: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    let path = `/api/v2/accounts/${accountId}/reports?metric=${metric}&since=${since}&until=${until}&type=${type}`;
    if (id !== undefined) {
      path += `&id=${id}`;
    }
    return proxy(url, token, path);
  },

  async getHeatmapData(url: string, token: string, since: number, until: number, inboxId?: string) {
    const accountId = await chatwoot.getAccountId(url, token);
    const inboxParam = inboxId && inboxId !== 'all' ? `&type=inbox&id=${inboxId}` : '&type=account';
    const path = `/api/v2/accounts/${accountId}/reports?metric=conversations_count&since=${since}&until=${until}${inboxParam}&group_by=hour`;
    return proxy(url, token, path);
  },

  async getMessages(url: string, token: string, conversationId: number, before?: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    const qs = before ? `?before=${before}` : '';
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages${qs}`);
    return data?.payload || [];
  },

  async sendMessage(url: string, token: string, conversationId: number, content: string) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      content,
      message_type: 'outgoing',
      content_type: 'text',
    }, 'POST');
  },

  // PATCH status: open | resolved | pending | snoozed
  async updateStatus(url: string, token: string, conversationId: number, status: string, extra?: object) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}`, { status, ...extra }, 'PATCH');
  },

  // PATCH priority: urgent | high | medium | low | none
  async updatePriority(url: string, token: string, conversationId: number, priority: string) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}`, { priority }, 'PATCH');
  },

  async markAsUnread(url: string, token: string, conversationId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/unread`, {}, 'POST').catch(() => null);
  },

  // Mark conversation as read — tries update_last_seen (v3+), falls back to /read (v2)
  async markAsRead(url: string, token: string, conversationId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    const agentLastSeenAt = Math.floor(Date.now() / 1000);
    try {
      return await proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/update_last_seen`, { agent_last_seen_at: agentLastSeenAt }, 'POST');
    } catch {
      // Fallback to legacy /read endpoint
      return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/read`, {}, 'POST').catch(() => null);
    }
  },

  // POST labels
  async assignLabel(url: string, token: string, conversationId: number, labels: string[]) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`, { labels });
  },

  // DELETE conversation
  async deleteConversation(url: string, token: string, conversationId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}`, undefined, 'DELETE');
  },

  // GET inboxes
  async getInboxes(url: string, token: string) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/inboxes`);
    return Array.isArray(data) ? data : (data?.payload || data?.data || []);
  },

  // POST inbox
  async createInbox(url: string, token: string, payload: any) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/inboxes`, payload, 'POST');
    return data?.payload || data;
  },

  // DELETE inbox
  async deleteInbox(url: string, token: string, inboxId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/inboxes/${inboxId}`, undefined, 'DELETE');
  },

  // GET contacts
  async getContacts(url: string, token: string, page = 1) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/contacts?page=${page}`);
    return data || {};
  },

  // GET search contacts
  async searchContacts(url: string, token: string, query: string, page = 1) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(query)}&page=${page}`);
    return data || {};
  },

  // GET contact conversations
  async getContactConversations(url: string, token: string, contactId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`);
    return data?.payload || data || [];
  },

  // PUT contact update
  async updateContact(url: string, token: string, contactId: number, payload: any) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/contacts/${contactId}`, payload, 'PUT');
  },
};

