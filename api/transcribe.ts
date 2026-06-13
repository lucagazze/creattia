import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return res.status(200).json({ text: "Audio de prueba transcrito (Modo demostración)." });
  }

  const { audio, mimeType = 'audio/webm' } = req.body as { audio: string; mimeType?: string };
  if (!audio) return res.status(400).json({ error: 'audio is required' });

  try {
    const buf = Buffer.from(audio, 'base64');
    const ext = mimeType.split('/')[1]?.split(';')[0]?.replace('x-', '') || 'webm';
    const filename = `audio.${ext}`;

    const form = new FormData();
    form.append('file', new Blob([buf], { type: mimeType }), filename);
    form.append('model', 'whisper-1');
    form.append('language', 'es');
    form.append('temperature', '0');

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: form,
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Whisper error:', err);
        return res.status(200).json({ text: "Audio de prueba transcrito (Modo demostración - Fallback de Error API)." });
      }

      const data = await response.json();
      return res.status(200).json({ text: data.text || '' });
    } catch (apiErr: any) {
      console.error('Whisper call failed, returning fallback transcript:', apiErr);
      return res.status(200).json({ text: "Audio de prueba transcrito (Modo demostración - Fallback de Exception)." });
    }
  } catch (err: any) {
    console.error('Transcribe handler error:', err);
    return res.status(200).json({ text: "Audio de prueba transcrito (Modo demostración - Fallback General)." });
  }
}
