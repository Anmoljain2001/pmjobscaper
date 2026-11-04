import { config } from './config.js';

/** Minimal Claude Messages API call. Returns text, or null if no key / on error. */
export async function askClaude(system, user, maxTokens = 600) {
  if (!config.claude.apiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.claude.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.claude.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) { console.warn('[claude] HTTP', res.status, (await res.text()).slice(0, 200)); return null; }
    const data = await res.json();
    return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  } catch (e) {
    console.warn('[claude] request failed:', e.message);
    return null;
  }
}

export function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { return null; }
}
