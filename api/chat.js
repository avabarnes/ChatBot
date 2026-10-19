// Vercel serverless endpoint: POST /api/chat
// Keeps GROQ_API_KEY on the server and forwards a bounded conversation to Groq.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const MAX_MESSAGES = 12; // recent turns kept as context
const MAX_MESSAGE_CHARS = 2000; // per message
const MAX_TOTAL_CHARS = 12000; // across the whole history
const MAX_OUTPUT_TOKENS = 1024;
const TIMEOUT_MS = 20000;

const SYSTEM_PROMPT =
  'You are Orbit, a friendly, general-purpose AI assistant. Answer questions on any topic, ' +
  'write and edit content, brainstorm ideas and explain concepts clearly. Use the earlier ' +
  'messages in the conversation to handle follow-up questions. Be concise by default and ' +
  'say so honestly when you are unsure.';

function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

// Keep only well-formed user/assistant turns, trim them and bound the history.
function cleanMessages(input) {
  if (!Array.isArray(input)) return null;
  let out = [];
  for (const m of input) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (content) out.push({ role: m.role, content });
  }
  out = out.slice(-MAX_MESSAGES);
  let total = 0;
  const kept = [];
  for (let i = out.length - 1; i >= 0; i--) {
    total += out[i].content.length;
    if (total > MAX_TOTAL_CHARS) break;
    kept.unshift(out[i]);
  }
  while (kept.length && kept[0].role !== 'user') kept.shift();
  if (!kept.length || kept[kept.length - 1].role !== 'user') return null;
  return kept;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return send(res, 500, { error: 'The server is missing its GROQ_API_KEY setting.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const messages = cleanMessages(body && body.messages);
  if (!messages) {
    return send(res, 400, { error: 'Send a message to start the conversation.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.7,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });

    if (!upstream.ok) {
      // Log details server-side only; never echo upstream bodies to the browser.
      console.error('Groq error', upstream.status, (await upstream.text()).slice(0, 300));
      if (upstream.status === 429) {
        return send(res, 429, { error: 'Orbit is busy right now. Please try again in a moment.' });
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return send(res, 502, { error: 'The server could not authenticate with Groq.' });
      }
      return send(res, 502, { error: 'The AI service returned an error. Please try again.' });
    }

    const data = await upstream.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message;
    const text = reply && typeof reply.content === 'string' ? reply.content.trim() : '';
    if (!text) {
      return send(res, 502, { error: 'The AI service returned an empty reply. Please try again.' });
    }
    return send(res, 200, { reply: text });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return send(res, 504, { error: 'The request timed out. Please try again.' });
    }
    console.error('Chat handler failure', err && err.message);
    return send(res, 502, { error: 'Could not reach the AI service. Please try again.' });
  } finally {
    clearTimeout(timer);
  }
};
