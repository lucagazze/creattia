const proxy = async (chatwoot_url: string, chatwoot_token: string, path: string, body?: any, method?: string) => {
  const res = await fetch('/api/scrape-website', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  async getConversationsPage(url: string, token: string, status = 'open', page = 1) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/conversations?status=${status}&page=${page}`);
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

  async getMessages(url: string, token: string, conversationId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`);
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

  // POST read — marks all messages as read
  async markAsRead(url: string, token: string, conversationId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/read`, {}, 'POST');
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
};

