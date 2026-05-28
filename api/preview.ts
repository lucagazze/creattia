import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE = 'https://car.algoritmiadesarrollos.com.ar';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const file    = (req.query.email as string)   || '';
  const subject = (req.query.subject as string) || '';
  const client  = (req.query.client as string)  || '';
  const angle   = (req.query.angle as string)   || '';

  const title       = subject || file.replace('.html', '').replace(/_/g, ' ');
  const description = [client, angle].filter(Boolean).join(' · ') || 'Vista previa del email';
  const previewUrl  = `${BASE}/#/preview?email=${encodeURIComponent(file)}&subject=${encodeURIComponent(subject)}`;
  const screenshotName = file ? file.replace('.html', '.png') : '';
  const imageUrl = screenshotName
    ? `${BASE}/email-library/screenshots/${encodeURIComponent(screenshotName)}`
    : `${BASE}/email-images/tsf_bite_logo.png`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${escHtml(title)}</title>

<!-- Open Graph (WhatsApp, Telegram, Slack, LinkedIn) -->
<meta property="og:type"        content="website"/>
<meta property="og:title"       content="${escHtml(title)}"/>
<meta property="og:description" content="${escHtml(description)}"/>
<meta property="og:url"         content="${escHtml(previewUrl)}"/>
<meta property="og:image"       content="${escHtml(imageUrl)}"/>
<meta property="og:site_name"   content="Algoritmia — Email Preview"/>

<!-- Twitter card -->
<meta name="twitter:card"        content="summary"/>
<meta name="twitter:title"       content="${escHtml(title)}"/>
<meta name="twitter:description" content="${escHtml(description)}"/>
<meta name="twitter:image"       content="${escHtml(imageUrl)}"/>

<!-- Redirect immediately for real users -->
<meta http-equiv="refresh" content="0; url=${escHtml(previewUrl)}"/>
<script>window.location.replace(${JSON.stringify(previewUrl)});</script>
</head>
<body style="margin:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;">
  <p style="font-family:Arial,sans-serif;color:#888;font-size:13px;">Redirigiendo…</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
