/**
 * WhatsApp source: logs into WhatsApp Web as YOU (scan a QR once), watches the groups
 * you choose, and saves PM job posts. Also sends DMs you approve from the dashboard.
 *
 * Uses whatsapp-web.js, an unofficial library. WhatsApp can restrict accounts that
 * behave like bots, so sending is rate-limited and always needs a click from you.
 */
import QRCode from 'qrcode';
import { config } from '../config.js';
import { analyse } from '../classifier.js';
import { upsertJob, logSend, sendsSince, lastSend } from '../db.js';

export const waState = { status: config.whatsapp.enabled ? 'starting' : 'off', qr: null, error: null, groups: [], found: 0 };
let client = null;

const groupAllowed = name =>
  !config.whatsapp.groups.length || config.whatsapp.groups.some(g => g.toLowerCase() === (name || '').toLowerCase());

async function handleMessage(msg, chat) {
  if (!chat?.isGroup || !groupAllowed(chat.name) || msg.fromMe) return false;
  const text = (msg.body || '').trim();
  if (text.length < 40) return false;

  const r = await analyse(text);
  if (!r.keep) return false;

  const senderId = msg.author || msg.from;                  // e.g. "919812345678@c.us"
  const senderDigits = senderId?.endsWith('@c.us') ? senderId.split('@')[0] : '';
  let senderName = '';
  try { const c = await msg.getContact(); senderName = c.pushname || c.name || ''; } catch {}

  const { inserted } = upsertJob({
    source: 'whatsapp', source_detail: chat.name, raw_text: text,
    title: r.title, company: r.company, location: r.location, experience: r.experience,
    url: r.url, summary: r.summary, score: r.score,
    contact_email: r.contact_email, contact_linkedin: r.contact_linkedin,
    // Prefer a number written in the post (often the recruiter), else whoever posted it.
    contact_phone: r.phonesInText[0]?.length === 10 ? '91' + r.phonesInText[0] : (r.phonesInText[0] || senderDigits),
    contact_name: senderName,
    posted_at: new Date(msg.timestamp * 1000).toISOString(),
  });
  if (inserted) { waState.found++; console.log(`[whatsapp] + ${r.title || 'PM role'} (${chat.name})`); }
  return inserted;
}

export async function startWhatsApp() {
  if (!config.whatsapp.enabled) return;
  let wweb;
  try { wweb = (await import('whatsapp-web.js')).default; }
  catch { waState.status = 'error'; waState.error = 'whatsapp-web.js is not installed. Run: npm install whatsapp-web.js'; return; }

  const { Client, LocalAuth } = wweb;
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: 'data/wa-session' }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  client.on('qr', async qr => {
    waState.status = 'needs_qr';
    waState.qr = await QRCode.toDataURL(qr);
    try { (await import('qrcode-terminal')).default.generate(qr, { small: true }); } catch {}
    console.log('[whatsapp] Scan the QR in the dashboard (or above) with WhatsApp > Linked devices.');
  });
  client.on('authenticated', () => { waState.status = 'connecting'; waState.qr = null; });
  client.on('auth_failure', m => { waState.status = 'error'; waState.error = 'Login failed: ' + m; });
  client.on('disconnected', r => { waState.status = 'disconnected'; waState.error = String(r); });

  client.on('ready', async () => {
    waState.status = 'connected';
    console.log('[whatsapp] connected');
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup);
    waState.groups = groups.map(g => ({ name: g.name, watched: groupAllowed(g.name) }));
    const missing = config.whatsapp.groups.filter(n => !groups.some(g => g.name.toLowerCase() === n.toLowerCase()));
    if (missing.length) console.warn('[whatsapp] groups not found (check exact names):', missing.join(', '));

    // Backfill recent history from watched groups
    for (const g of groups.filter(g => groupAllowed(g.name))) {
      try {
        const msgs = await g.fetchMessages({ limit: config.whatsapp.backfill });
        let n = 0;
        for (const m of msgs) if (await handleMessage(m, g)) n++;
        console.log(`[whatsapp] backfilled ${g.name}: ${n} new`);
      } catch (e) { console.warn('[whatsapp] backfill failed for', g.name, e.message); }
    }
  });

  client.on('message', async msg => {
    try { await handleMessage(msg, await msg.getChat()); }
    catch (e) { console.warn('[whatsapp] message error:', e.message); }
  });

  client.initialize().catch(e => { waState.status = 'error'; waState.error = e.message; });
}

const sqliteNow = d => d.toISOString().replace('T', ' ').slice(0, 19);

/** Sends one DM you've approved. Enforces gap + daily cap. */
export async function sendWhatsApp(job, text) {
  if (waState.status !== 'connected' || !client) throw new Error('WhatsApp isn’t connected. Scan the QR code first.');
  const digits = String(job.contact_phone || '').replace(/\D/g, '');
  if (digits.length < 10) throw new Error('This post has no phone number to message.');

  const today = sendsSince('whatsapp', sqliteNow(new Date(Date.now() - 24 * 3600e3)));
  if (today >= config.whatsapp.dailyLimit)
    throw new Error(`Daily limit reached (${config.whatsapp.dailyLimit} messages in 24h). This protects your number from being flagged.`);
  const last = lastSend('whatsapp');
  if (last) {
    const wait = config.whatsapp.minGapSeconds - (Date.now() - new Date(last + 'Z').getTime()) / 1000;
    if (wait > 0) throw new Error(`Wait ${Math.ceil(wait)}s before the next message.`);
  }

  const numberId = await client.getNumberId(digits);
  if (!numberId) throw new Error(`+${digits} isn’t on WhatsApp.`);
  await client.sendMessage(numberId._serialized, text);
  logSend(job.id, 'whatsapp');
}
