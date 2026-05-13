import fetch from 'node-fetch';

const apiKey = 'pk_W52yXs_ba83e5a4ddbc73732d10a6352b02df4b37';

async function test() {
  const headers = {
    accept: 'application/json',
    revision: '2024-02-15',
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    'content-type': 'application/json'
  };

  // Get metrics
  const mRes = await fetch('https://a.klaviyo.com/api/metrics', { headers });
  const metrics = await mRes.json();
  const poMetric = metrics.data.find((m) => m.attributes.name === 'Placed Order');
  
  if (!poMetric) return console.log('Placed order metric not found');
  console.log('PO Metric ID:', poMetric.id);

  // Get properties for this metric
  const pRes = await fetch(`https://a.klaviyo.com/api/metrics/${poMetric.id}/properties/`, { headers });
  const props = await pRes.json();
  console.log('Properties:', props.data?.map((p) => p.attributes.name).join(', '));
}

test();
