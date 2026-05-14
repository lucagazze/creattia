async function test() {
  const url = 'https://car-clientes.vercel.app/api/klaviyo/metrics';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Klaviyo-API-Key pk_fake_key_123',
        'Revision': '2024-10-15',
        'Accept': 'application/vnd.api+json'
      }
    });
    
    console.log('Status:', res.status);
    console.log('Headers:', [...res.headers.entries()]);
    
    const text = await res.text();
    console.log('Body:', text.substring(0, 500));
  } catch (err) {
    console.error(err);
  }
}

test();
