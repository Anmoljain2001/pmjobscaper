/**
 * LinkedIn via job-alert emails. You create job alerts on LinkedIn ("Product Manager", your city),
 * LinkedIn emails you matches, and this reads those emails over IMAP. No scraping of LinkedIn itself.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { titleLooksLikePM } from '../classifier.js';
import { upsertJob, kvGet, kvSet } from '../db.js';

export const emailState = { status: config.imap.enabled ? 'idle' : 'off', lastRun: null, error: null, found: 0 };

/** Extracts job cards from a LinkedIn alert email's HTML. Exported for testing. */
export function parseAlertHtml(html) {
  const $ = cheerio.load(html);
  const jobs = new Map();
  $('a[href*="/jobs/view/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const id = (href.match(/\/jobs\/view\/(?:[^/?]*-)?(\d{6,})/) || [])[1];
    if (!id) return;
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const entry = jobs.get(id) || { id, lines: [] };
    if (text && !entry.lines.includes(text)) entry.lines.push(text);
    // The card's company / location usually sit in the same table cell as the link
    const cell = $(a).closest('td, table');
    cell.find('p, span, td').each((_, el) => {
      const t = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim();
      if (t && t.length < 120 && !entry.lines.includes(t)) entry.lines.push(t);
    });
    jobs.set(id, entry);
  });

  return [...jobs.values()].map(({ id, lines }) => {
    const clean = lines.filter(l => !/^(view job|apply|easy apply|see all jobs|actively recruiting|promoted|\d+ (connections?|applicants?|alum).*)$/i.test(l));
    const title = clean.find(l => titleLooksLikePM(l)) || clean[0] || '';
    const rest = clean.filter(l => l !== title);
    // "Company · City, State (Hybrid)" is LinkedIn's usual format
    const dotLine = rest.find(l => l.includes('·'));
    let company = '', location = '';
    if (dotLine) [company, location] = dotLine.split('·').map(s => s.trim());
    else [company = '', location = ''] = rest;
    return { id, title, company, location, url: `https://www.linkedin.com/jobs/view/${id}/` };
  });
}

export async function syncLinkedInEmail() {
  if (!config.imap.enabled) return { skipped: true };
  emailState.status = 'running'; emailState.error = null;
  const client = new ImapFlow({
    host: config.imap.host, port: config.imap.port, secure: true,
    auth: { user: config.imap.user, pass: config.imap.pass }, logger: false,
  });
  let added = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - config.imap.lookbackDays * 86400e3);
      const seen = new Set(JSON.parse(kvGet('imap_seen_uids') || '[]'));
      const uids = await client.search({ since, from: 'linkedin.com' }, { uid: true });
      for (const uid of uids || []) {
        if (seen.has(uid)) continue;
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        const mail = await simpleParser(msg.source);
        const subject = mail.subject || '';
        if (!/job|hiring|role|position/i.test(subject) && !/jobalerts|jobs-noreply/i.test(mail.from?.text || '')) { seen.add(uid); continue; }
        for (const j of parseAlertHtml(mail.html || '')) {
          if (!titleLooksLikePM(j.title)) continue;
          const { inserted } = upsertJob({
            source: 'linkedin_email', source_detail: subject.slice(0, 120),
            title: j.title, company: j.company, location: j.location, url: j.url,
            score: 80, posted_at: (mail.date || new Date()).toISOString(),
            raw_text: `${j.title}\n${j.company}\n${j.location}\n${j.url}`,
          });
          if (inserted) added++;
        }
        seen.add(uid);
      }
      kvSet('imap_seen_uids', JSON.stringify([...seen].slice(-2000)));
    } finally { lock.release(); }
    await client.logout();
    emailState.status = 'ok';
  } catch (e) {
    emailState.status = 'error';
    emailState.error = /auth/i.test(e.message) ? 'Email login failed. For Gmail, use an App Password, not your normal password.' : e.message;
    try { await client.logout(); } catch {}
  }
  emailState.lastRun = new Date().toISOString(); emailState.found += added;
  if (added) console.log(`[linkedin email] + ${added} new`);
  return { added };
}
