const proxy = async (chatwoot_url: string, chatwoot_token: string, path: string, body?: any) => {
  const res = await fetch('/api/chatwoot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatwoot_url, chatwoot_token, path, ...(body ? { body } : {}) }),
  });
  if (!res.ok) throw new Error(`Chatwoot proxy ${res.status}`);
  return res.json();
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

  async getConversations(url: string, token: string, status = 'open') {
    const accountId = await chatwoot.getAccountId(url, token);
    const data = await proxy(url, token, `/api/v1/accounts/${accountId}/conversations?status=${status}&page=1`);
    return data?.data?.payload || data?.payload || [];
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
};
