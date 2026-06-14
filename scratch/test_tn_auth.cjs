async function testNoUserAgent() {
  try {
    const res = await fetch('https://www.tiendanube.com/apps/authorize/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: '123', client_secret: 'abc', grant_type: 'authorization_code', code: 'xyz' }).toString()
    });
    console.log("Without User-Agent: status =", res.status, "text =", await res.text());
  } catch (err) {
    console.error("Without User-Agent failed:", err);
  }
}

async function testWithUserAgent() {
  try {
    const res = await fetch('https://www.tiendanube.com/apps/authorize/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Algoritmia/1.0 (lucagazze1@gmail.com)'
      },
      body: new URLSearchParams({ client_id: '123', client_secret: 'abc', grant_type: 'authorization_code', code: 'xyz' }).toString()
    });
    console.log("With User-Agent: status =", res.status, "text =", await res.text());
  } catch (err) {
    console.error("With User-Agent failed:", err);
  }
}

async function run() {
  await testNoUserAgent();
  await testWithUserAgent();
}

run();
