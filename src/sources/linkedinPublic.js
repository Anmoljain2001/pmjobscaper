/**
 * OPT-IN: reads LinkedIn's logged-out job search results. LinkedIn's terms prohibit automated
 * collection, so this is off by default. It never logs in, makes one request per search,
 * pauses between requests, and runs every few hours at most.
 */
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { titleLooksLikePM } from '../classifier.js';
import { upsertJob } from '../db.js';

export const publicState = { status: config.linkedinPublic.enabled ? 'idle' : 'off', lastRun: null, error: null, found: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function parseSearchHtml(html) {
  const $ = cheerio.load(html);
  return $('li').map((_, li) => {
    const card = $(li);
    const link = card.find('a.base-card__full-link, a[href*="/jobs/view/"]').first().attr('href') || '';
    const id = (link.match(/\/jobs\/view\/(?:[^/?]*-)?(\d{6,})/) || [])[1];
    if (!id) return null;
    const txt = sel => card.find(sel).first().text().replace(/\s+/g, ' ').trim();
    return {
      id, url: `https://www.linkedin.com/jobs/view/${id}/`,
      title: txt('.base-search-card__title'), company: txt('.base-search-card__subtitle'),
      location: txt('.job-search-card__location'), posted_at: card.find('time').attr('datetime') || null,
    };
  }).get().filter(Boolean);
}

export async function syncLinkedInPublic() {
  if (!config.linkedinPublic.enabled) return { skipped: true };
  publicState.status = 'running'; publicState.error = null;
  let added = 0;
  try {
    for (const { keywords, location } of config.linkedinPublic.searches) {
      const qs = new URLSearchParams({ keywords, location, f_TPR: 'r86400', start: '0' });
      const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${qs}`, {
        headers: { 'user-agent': 'Mozilla/5.0 (personal job tracker; low frequency)', 'accept-language': 'en' },
      });
      if (res.status === 429) { publicState.error = 'LinkedIn is rate-limiting. Try again later or raise LINKEDIN_PUBLIC_EVERY_HOURS.'; break; }
      if (!res.ok) { publicState.error = `LinkedIn returned ${res.status}`; continue; }
      for (const j of parseSearchHtml(await res.text())) {
        if (!titleLooksLikePM(j.title)) continue;
        const { inserted } = upsertJob({ ...j, source: 'linkedin_public', source_detail: `${keywords} · ${location}`,
          score: 75, raw_text: `${j.title}\n${j.company}\n${j.location}\n${j.url}` });
        if (inserted) added++;
      }
      await sleep(8000 + Math.random() * 7000);
    }
    publicState.status = publicState.error ? 'error' : 'ok';
  } catch (e) { publicState.status = 'error'; publicState.error = e.message; }
  publicState.lastRun = new Date().toISOString(); publicState.found += added;
  if (added) console.log(`[linkedin public] + ${added} new`);
  return { added };
}
