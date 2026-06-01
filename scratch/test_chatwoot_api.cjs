const url = 'https://app.chatwoot.com';
const token = 'C5KaRftpYhfSrh1xBfhU1ZyE';

async function main() {
  const profileRes = await fetch(`${url}/api/v1/profile`, {
    headers: { 'api_access_token': token }
  }).then(r => r.json());
  
  const accountId = profileRes.account_id || profileRes.data?.account_id;
  if (!accountId) return;

  let allList = [];
  for (let page = 1; page <= 12; page++) {
    const res = await fetch(`${url}/api/v1/accounts/${accountId}/conversations?status=all&page=${page}`, {
      headers: { 'api_access_token': token }
    }).then(r => r.json());
    const payload = res.data?.payload || res.payload || res || [];
    allList = [...allList, ...payload];
    if (payload.length < 25) break;
  }

  console.log('Total conversations fetched:', allList.length);

  const dates = {};
  allList.forEach(c => {
    const ts = c.last_activity_at || c.created_at;
    if (ts) {
      const date = new Date(typeof ts === 'number' ? ts * 1000 : ts);
      const str = date.toLocaleDateString('es-AR');
      dates[str] = (dates[str] || 0) + 1;
    }
  });

  console.log('Conversations count per day:');
  console.log(JSON.stringify(dates, null, 2));
}

main().catch(console.error);
