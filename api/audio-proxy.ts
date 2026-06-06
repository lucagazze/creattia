import type { VercelRequest, VercelResponse } from '@vercel/node';

function isAllowedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'https:') return false;
    const h = url.hostname;
    return !/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(h);
  } catch {
    return false;
  }
}

function float32ToWav(channelData: Float32Array[], sampleRate: number): Buffer {
  const ch = channelData.length;
  const n = channelData[0].length;
  const blockAlign = ch * 2;
  const dataSize = n * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channelData[c][i]));
      buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), off);
      off += 2;
    }
  }
  return buf;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();

  const url = Array.isArray(req.query.url) ? req.query.url[0] : (req.query.url as string);
  if (!url || !isAllowedUrl(url)) return res.status(400).json({ error: 'Invalid URL' });

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  } catch {
    return res.status(502).json({ error: 'Failed to fetch audio' });
  }
  if (!upstream.ok) return res.status(upstream.status).json({ error: 'Upstream error' });

  const ct = upstream.headers.get('content-type') || '';
  const needsConvert = ct.includes('ogg') || ct.includes('opus');

  if (!needsConvert) {
    res.setHeader('Content-Type', ct || 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OggOpusDecoder } = require('ogg-opus-decoder');
    const audioData = new Uint8Array(await upstream.arrayBuffer());
    const decoder = new OggOpusDecoder();
    await decoder.ready;
    const { channelData, samplesDecoded, sampleRate } = await decoder.decode(audioData);
    await decoder.free();
    if (!samplesDecoded) return res.status(422).json({ error: 'No audio decoded' });
    const wav = float32ToWav(channelData, sampleRate);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(wav);
  } catch (err: any) {
    return res.status(500).json({ error: 'Conversion failed' });
  }
}
