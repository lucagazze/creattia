import fetch from 'node-fetch';

const apiKey = 'pk_W52yXs_ba83e5a4ddbc73732d10a6352b02df4b37';

async function test() {
  const headers = {
    accept: 'application/vnd.api+json',
    revision: '2024-10-15',
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    'content-type': 'application/vnd.api+json'
  };

  const since = '2026-05-01';
  const until = '2026-05-14';
  
  const mRes = await fetch('https://a.klaviyo.com/api/metrics', { headers });
  const metrics = await mRes.json();
  const findId = (names) => {
    let found = metrics.data.find(m => names.some(n => m.attributes.name.toLowerCase() === n.toLowerCase()));
    if (!found) found = metrics.data.find(m => names.some(n => m.attributes.name.toLowerCase().includes(n.toLowerCase())));
    return found?.id;
  };
  const sentId = findId(['Received Email','Email Recibido','Email Delivered','Delivered Email','Sent Email']);
  const opensId = findId(['Opened Email','Email Abierto','Email Open']);
  const clicksId = findId(['Clicked Email','Email Clicado','Email Click','Clicked Link in Email']);

  // Try by $message dimension (the correct filter name)
  const body = {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: sentId,
        measurements: ['count'],
        by: ['$message'],
        filter: [
          `greater-or-equal(datetime,${since}T00:00:00Z)`,
          `less-than(datetime,${until}T23:59:59Z)`,
        ],
        interval: 'month',
        timezone: 'UTC',
      }
    }
  };
  
  const res = await fetch('https://a.klaviyo.com/api/metric-aggregates', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  // Show what dimensions come back
  const items = data?.data?.attributes?.data || [];
  console.log('Sent by $message (first 5):');
  items.slice(0,5).forEach(item => {
    const total = item.measurements.count.reduce((a,b) => a+b, 0);
    console.log('  dimension:', item.dimensions, 'total:', total);
  });

  // Now try for opens
  const body2 = {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: opensId,
        measurements: ['count'],
        by: ['$message'],
        filter: [
          `greater-or-equal(datetime,${since}T00:00:00Z)`,
          `less-than(datetime,${until}T23:59:59Z)`,
        ],
        interval: 'month',
        timezone: 'UTC',
      }
    }
  };
  const res2 = await fetch('https://a.klaviyo.com/api/metric-aggregates', {
    method: 'POST',
    headers,
    body: JSON.stringify(body2)
  });
  const data2 = await res2.json();
  const items2 = data2?.data?.attributes?.data || [];
  console.log('Opens by $message (first 5):');
  items2.slice(0,5).forEach(item => {
    const total = item.measurements.count.reduce((a,b) => a+b, 0);
    console.log('  dimension:', item.dimensions, 'total:', total);
  });

  // Also try Campaign Name dimension
  const body3 = {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: sentId,
        measurements: ['count'],
        by: ['Campaign Name'],
        filter: [
          `greater-or-equal(datetime,${since}T00:00:00Z)`,
          `less-than(datetime,${until}T23:59:59Z)`,
        ],
        interval: 'month',
        timezone: 'UTC',
      }
    }
  };
  const res3 = await fetch('https://a.klaviyo.com/api/metric-aggregates', {
    method: 'POST',
    headers,
    body: JSON.stringify(body3)
  });
  const data3 = await res3.json();
  const items3 = data3?.data?.attributes?.data || [];
  console.log('Sent by Campaign Name (first 5):');
  items3.slice(0,5).forEach(item => {
    const total = item.measurements.count.reduce((a,b) => a+b, 0);
    console.log('  dimension:', item.dimensions, 'total:', total);
  });
}

test().catch(console.error);
