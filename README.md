# CAR SaaS - app.algoritmiadesarrollos.com.ar

## Creative analysis with TRIBE v2

Run the local TRIBE v2 analyzer:

```bash
npm run tribev2
```

The service listens on:

```bash
http://127.0.0.1:8787/analyze
```

Set `TRIBE_V2_API_URL` to route all creative analysis requests through that
service:

```bash
TRIBE_V2_API_URL=http://127.0.0.1:8787/analyze
```

Optional: set `TRIBE_V2_API_KEY` to send `Authorization: Bearer <key>` to that
service.

Expected service response fields are normalized by the app, but these names are
preferred:

```json
{
  "attentionPct": 72,
  "attentionReason": "Reason",
  "emotionPct": 65,
  "emotionReason": "Reason",
  "cogLoad": 28,
  "cogLoadReason": "Reason",
  "highestRegion": "V1",
  "textInsight": "Short diagnosis",
  "actionItems": ["Action 1", "Action 2"]
}
```
