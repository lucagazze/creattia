const api = (url: string, token: string, path: string, opts?: RequestInit) =>
  fetch(`${url.replace(/\/$/, '')}${path}`, {
    ...opts,
    headers: { 'api_access_token': token, 'Content-Type': 'application/json', ...(opts?.headers || {}) },
  }).then(r => { if (!r.ok) throw new Error(`Chatwoot ${r.status}`); return r.json(); });

let cachedAccountId: Record<string, number> = {};

export const chatwoot = {
  async getAccountId(url: string, token: string): Promise<number> {
    const key = `${url}:${token}`;
    if (cachedAccountId[key]) return cachedAccountId[key];
    const data = await api(url, token, '/auth/sign_in', {
      method: 'POST',
      body: JSON.stringify({ api_access_token: token }),
    }).catch(() => api(url, token, '/api/v1/profile'));
    const accountId = data?.data?.account_id || data?.account_id;
    if (!accountId) throw new Error('No se pudo obtener el account ID de Chatwoot');
    cachedAccountId[key] = accountId;
    return accountId;
  },

  async getConversations(url: string, token: string, status = 'open') {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await api(url, token, `/api/v1/accounts/${accountId}/conversations?status=${status}&page=1`);
    return data?.data?.payload || data?.payload || [];
  },

  async getOverview(url: string, token: string) {
    const accountId = await chatwoot.getAccountId(url, token);
    return api(url, token, `/api/v1/accounts/${accountId}/reports/overview`);
  },

  async getSummary(url: string, token: string, since: number, until: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    return api(url, token, `/api/v1/accounts/${accountId}/reports/summary?since=${since}&until=${until}`);
  },

  async getMessages(url: string, token: string, conversationId: number) {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await api(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`);
    return data?.payload || [];
  },

  async sendMessage(url: string, token: string, conversationId: number, content: string) {
    const accountId = await chatwoot.getAccountId(url, token);
    return api(url, token, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, message_type: 'outgoing', private: false }),
    });
  },
};
