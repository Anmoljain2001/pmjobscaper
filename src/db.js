import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';

mkdirSync('data', { recursive: true });
const db = new DatabaseSync('data/jobs.db');

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,            -- whatsapp | linkedin_email | linkedin_public | manual
  source_detail TEXT,              -- group name, search query, etc.
  title TEXT,
  company TEXT,
  location TEXT,
  experience TEXT,
  url TEXT,
  contact_name TEXT,
  contact_phone TEXT,              -- WhatsApp id digits, e.g. 919812345678
  contact_email TEXT,
  contact_linkedin TEXT,
  raw_text TEXT,
  summary TEXT,
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new',       -- new | saved | applied | messaged | archived
  notes TEXT DEFAULT '',
  draft TEXT DEFAULT '',
  posted_at TEXT,
  found_at TEXT DEFAULT (datetime('now')),
  applied_at TEXT,
  messaged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS sends (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, channel TEXT, sent_at TEXT DEFAULT (datetime('now')));
`);

const FIELDS = ['source','source_detail','title','company','location','experience','url','contact_name',
  'contact_phone','contact_email','contact_linkedin','raw_text','summary','score','posted_at'];

/** Stable id: same LinkedIn job / same WhatsApp text forwarded to 3 groups -> one row. */
export function makeId({ url, raw_text, title, company }) {
  let basis;
  const li = url && url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?]*-)?(\d+)/);
  if (li) basis = 'li:' + li[1];
  else if (url) basis = 'url:' + url.split('?')[0].replace(/\/$/, '').toLowerCase();
  else basis = 'txt:' + (raw_text || `${title}|${company}`).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 500);
  return createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

/** Inserts a job if new. Returns { inserted: boolean, id }. Fills empty fields on an existing row. */
export function upsertJob(job) {
  const id = job.id || makeId(job);
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!existing) {
    const cols = FIELDS.filter(f => job[f] !== undefined && job[f] !== null);
    db.prepare(`INSERT INTO jobs (id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`)
      .run(id, ...cols.map(c => job[c]));
    return { inserted: true, id };
  }
  const fill = FIELDS.filter(f => !existing[f] && job[f]);
  if (fill.length) {
    db.prepare(`UPDATE jobs SET ${fill.map(f => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...fill.map(f => job[f]), id);
  }
  return { inserted: false, id };
}

export function listJobs({ status, source, q } = {}) {
  const where = [], args = [];
  if (status && status !== 'all') { where.push('status = ?'); args.push(status); }
  if (source && source !== 'all') { where.push('source LIKE ?'); args.push(source + '%'); }
  if (q) {
    where.push('(title LIKE ? OR company LIKE ? OR location LIKE ? OR raw_text LIKE ?)');
    args.push(...Array(4).fill(`%${q}%`));
  }
  const sql = `SELECT id, source, source_detail, title, company, location, experience, url, score, status,
      contact_phone, contact_email, contact_linkedin, posted_at, found_at
    FROM jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY COALESCE(posted_at, found_at) DESC LIMIT 500`;
  return db.prepare(sql).all(...args);
}

export const getJob = id => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);

const EDITABLE = ['status', 'notes', 'draft', 'title', 'company', 'location', 'url',
  'contact_phone', 'contact_email', 'contact_linkedin', 'applied_at', 'messaged_at'];
export function updateJob(id, patch) {
  const keys = Object.keys(patch).filter(k => EDITABLE.includes(k));
  if (!keys.length) return getJob(id);
  if (patch.status === 'applied' && !patch.applied_at) { keys.push('applied_at'); patch.applied_at = new Date().toISOString(); }
  if (patch.status === 'messaged' && !patch.messaged_at) { keys.push('messaged_at'); patch.messaged_at = new Date().toISOString(); }
  db.prepare(`UPDATE jobs SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => patch[k]), id);
  return getJob(id);
}

export function counts() {
  const rows = db.prepare('SELECT status, COUNT(*) n FROM jobs GROUP BY status').all();
  const out = { new: 0, saved: 0, applied: 0, messaged: 0, archived: 0 };
  for (const r of rows) out[r.status] = r.n;
  out.all = Object.values(out).reduce((a, b) => a + b, 0);
  return out;
}

export const kvGet = k => db.prepare('SELECT v FROM kv WHERE k = ?').get(k)?.v;
export const kvSet = (k, v) => db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v));

export function logSend(jobId, channel) { db.prepare('INSERT INTO sends (job_id, channel) VALUES (?, ?)').run(jobId, channel); }
export function sendsSince(channel, isoSince) {
  return db.prepare("SELECT COUNT(*) n FROM sends WHERE channel = ? AND sent_at >= ?").get(channel, isoSince).n;
}
export function lastSend(channel) {
  return db.prepare("SELECT sent_at FROM sends WHERE channel = ? ORDER BY id DESC LIMIT 1").get(channel)?.sent_at;
}
