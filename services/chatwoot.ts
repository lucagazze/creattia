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

let cachedAccountId: Record<string, number> = {};

export const chatwoot = {
  async getAccountId(url: string, token: string): Promise<number> {
    const key = `${url}:${token}`;
    if (cachedAccountId[key]) return cachedAccountId[key];
    const data = await proxy(url, token, '/api/v1/profile');
    const accountId = data?.account_id;
    if (!accountId) throw new Error('No se pudo obtener el account ID de Chatwoot');
    cachedAccountId[key] = accountId;
    return accountId;
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
      content, message_type: 'outgoing', private: false,
    });
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
};
