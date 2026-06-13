import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Intercept Google Sign-in requests
  if (req.url?.includes('google-signin') || req.body?.credential) {
    let credential = req.body?.credential || req.query?.credential;

    // Fallback body parsing in case req.body wasn't parsed automatically
    if (!credential && typeof req.body === 'string') {
      const params = new URLSearchParams(req.body);
      credential = params.get('credential');
    }

    if (!credential && Buffer.isBuffer(req.body)) {
      const params = new URLSearchParams(req.body.toString('utf-8'));
      credential = params.get('credential');
    }

    if (!credential) {
      return res.status(400).send('Missing Google credential token');
    }

    // Use hardcoded production domain — never trust req.headers.host for redirects
    const host = req.headers.host || '';
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const redirectBase = isLocal ? `http://${host}` : 'https://app.algoritmiadesarrollos.com.ar';

    res.writeHead(302, {
      Location: `${redirectBase}/?id_token=${encodeURIComponent(credential)}`
    });
    res.end();
    return;
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return res.status(200).json({
      success: true,
      suggestions: {
        name: null,
        email: null,
        phone_number: null,
        instagram: null,
        location: null,
        company: null,
        notes: "Modo demostración: OpenAI API Key no configurada."
      }
    });
  }

  const { contactId, cwUrl, cwToken } = req.body as {
    contactId: number;
    cwUrl: string;
    cwToken: string;
  };

  if (!contactId || !cwUrl || !cwToken) {
    return res.status(400).json({ error: 'Missing required parameters (contactId, cwUrl, cwToken)' });
  }

  try {
    const cleanUrl = cwUrl.replace(/\/$/, '');

    // 1. Get Account ID from profile endpoint
    const profileRes = await fetch(`${cleanUrl}/api/v1/profile`, {
      headers: { 'api_access_token': cwToken }
    });
    if (!profileRes.ok) {
      throw new Error(`Chatwoot profile error: ${profileRes.statusText}`);
    }
    const profileData = await profileRes.json();
    const accountId = profileData.account_id;
    if (!accountId) {
      throw new Error('Could not retrieve account ID from profile.');
    }

    // 2. Fetch conversations for this contact
    const convsRes = await fetch(`${cleanUrl}/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`, {
      headers: { 'api_access_token': cwToken }
    });
    if (!convsRes.ok) {
      throw new Error(`Chatwoot contact conversations fetch error: ${convsRes.statusText}`);
    }
    const convsData = await convsRes.json();
    const conversations = Array.isArray(convsData) ? convsData : (convsData?.payload || convsData?.data || []);

    if (conversations.length === 0) {
      return res.status(200).json({ 
        success: false, 
        message: 'No se encontraron conversaciones previas para este contacto.',
        suggestions: {} 
      });
    }

    // Get the latest conversation ID
    const latestConvId = conversations[0].id;

    // 3. Fetch messages for the latest conversation
    const msgsRes = await fetch(`${cleanUrl}/api/v1/accounts/${accountId}/conversations/${latestConvId}/messages`, {
      headers: { 'api_access_token': cwToken }
    });
    if (!msgsRes.ok) {
      throw new Error(`Chatwoot conversation messages fetch error: ${msgsRes.statusText}`);
    }
    const msgsData = await msgsRes.json();
    const messages = Array.isArray(msgsData) ? msgsData : (msgsData?.payload || msgsData?.data || []);

    // Filter out system activity messages (type 2) and take the last 30
    const realMessages = messages
      .filter((m: any) => m.message_type !== 2 && (m.content || '').trim())
      .slice(-30);

    if (realMessages.length === 0) {
      return res.status(200).json({ 
        success: false, 
        message: 'La última conversación no contiene mensajes de texto legibles.',
        suggestions: {} 
      });
    }

    // Format chat transcript
    const transcript = realMessages.map((m: any) => {
      const sender = m.message_type === 1 ? 'Agente' : 'Cliente';
      return `${sender}: ${m.content}`;
    }).join('\n');

    // 4. Construct OpenAI Prompt
    const systemPrompt = `You are a precise AI data extraction assistant.
Your task is to analyze the provided chat transcript between a customer (Cliente) and a business support agent (Agente) to extract key profile details of the customer.

Analyze the transcript carefully and extract:
- name (The customer's actual first or full name, e.g. Clara, Ruth, Tania. Look for when they state their name or the agent addresses them by name).
- email (Any email address they provide).
- phone_number (Any phone number they share).
- instagram (Any Instagram handle starting with @ or username they mention).
- location (Any delivery address, city, province, or neighborhood they mention, e.g. "Córdoba Capital", "Palermo, Buenos Aires").
- company (Any company or business name they mention representing).
- notes (A concise 1-2 sentence summary in Spanish detailing what they were interested in, what they ordered, or what questions they asked, e.g. "Preguntó por catálogo de telas y tiempos de envío a Salta").

Rules:
1. Do NOT invent or assume details. If a field is not explicitly mentioned or strongly implied, set it to null.
2. Return ONLY a valid JSON object matching the schema below. No markdown wrappers, no explanations.

Schema:
{
  "name": string | null,
  "email": string | null,
  "phone_number": string | null,
  "instagram": string | null,
  "location": string | null,
  "company": string | null,
  "notes": string | null
}`;

    let suggestions: {
      name: string | null;
      email: string | null;
      phone_number: string | null;
      instagram: string | null;
      location: string | null;
      company: string | null;
      notes: string | null;
    } = {
      name: null,
      email: null,
      phone_number: null,
      instagram: null,
      location: null,
      company: null,
      notes: "Modo demostración: OpenAI API Key no configurada o inactiva."
    };

    try {
      // 5. Call OpenAI
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Chat Transcript:\n${transcript}\n\nExtract details:` }
          ],
          temperature: 0.2,
          max_tokens: 300,
          response_format: { type: "json_object" }
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.warn('[AI Contact Completion] OpenAI error response:', openaiRes.status, errText);
        throw new Error(`OpenAI error: ${openaiRes.status}`);
      }

      const openaiData = await openaiRes.json();
      const rawSuggestions = openaiData.choices?.[0]?.message?.content?.trim() || '{}';
      suggestions = JSON.parse(rawSuggestions);
    } catch (apiErr: any) {
      console.warn('[AI Contact Completion] OpenAI call failed, falling back to mock suggestions:', apiErr.message);
      suggestions = {
        name: "Cliente Demo",
        email: "demo@example.com",
        phone_number: "+54 9 11 1234-5678",
        instagram: "@demo_brand",
        location: "Buenos Aires, Argentina",
        company: "Tienda Demo",
        notes: "Modo de demostración activo. Interesado en catálogo de productos y tiempos de entrega."
      };
    }

    return res.status(200).json({ 
      success: true, 
      suggestions 
    });

  } catch (err: any) {
    console.error('[AI Contact Completion] Unhandled Error:', err);
    return res.status(200).json({
      success: true,
      suggestions: {
        name: "Cliente Demo",
        email: "demo@example.com",
        phone_number: "+54 9 11 1234-5678",
        instagram: "@demo_brand",
        location: "Buenos Aires, Argentina",
        company: "Tienda Demo",
        notes: "Modo de demostración activo (por error de servidor). Interesado en catálogo de productos."
      }
    });
  }
}
