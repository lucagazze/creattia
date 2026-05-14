async function test() {
  const url = 'https://car-clientes.vercel.app/api/shopify/orders.json?status=any&limit=2';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-shop-domain': 'fake-domain.myshopify.com',
        'x-shopify-access-token': 'shpat_1234567890',
        'x-debug-target': 'true'
      }
    });
    
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    console.error(err);
  }
}

test();
