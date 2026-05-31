const proxy = async (chatwoot_url: string, chatwoot_token: string, path: string, body?: any, method?: string) => {
  const res = await fetch('/api/scrape-website', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatwoot_url, chatwoot_token, path, ...(body !== undefined ? { body } : {}), ...(method ? { method } : {}) }),
  });
  if (!res.ok && res.status !== 200) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Chatwoot ${res.status}: ${txt}`);
  }
  return res.json().catch(() => ({}));
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
    return { payload, hasMore: payload.length === 25, meta: { all_count: meta.all_count, unassigned_count: meta.unassigned_count, assigned_count: meta.assigned_count, my_count: meta.my_count } };
  },

  async getConversations(url: string, token: string, status = 'open') {
    const { payload } = await chatwoot.getConversationsPage(url, token, status, 1);
    return payload;
  },

  async getOverview(url: string, token: string) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/reports/overview`);
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
      private: false,
    });
  },

  async updateConversation(url: string, token: string, conversationId: number, data: object) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}`, data, 'PATCH');
  },

  async markAsRead(url: string, token: string, conversationId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/read`, {}, 'PUT');
  },

  async assignLabel(url: string, token: string, conversationId: number, labels: string[]) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`, { labels }, 'POST');
  },

  async deleteConversation(url: string, token: string, conversationId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    return proxy(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}`, { _method: 'DELETE' });
  },
};
