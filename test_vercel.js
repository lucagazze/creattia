async function test() {
  const url = 'https://car-clientes.vercel.app/api/shopify/orders.json?status=any&limit=2';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-shop-domain': 'fake-domain.myshopify.com',
        'x-shopify-access-token': 'shpat_1234567890'
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
