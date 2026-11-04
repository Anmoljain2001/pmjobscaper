import express from 'express';
import { config } from './config.js';
import { listJobs, getJob, updateJob, counts, upsertJob } from './db.js';
import { analyse } from './classifier.js';
import { draftMessage } from './messaging.js';
import { waState, sendWhatsApp } from './sources/whatsapp.js';
import { emailState, syncLinkedInEmail } from './sources/linkedinEmail.js';
import { publicState, syncLinkedInPublic } from './sources/linkedinPublic.js';

export function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(express.static('public'));

  const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ error: e.message }));

  app.get('/api/jobs', (req, res) => res.json({ jobs: listJobs(req.query), counts: counts() }));
  app.get('/api/jobs/:id', (req, res) => { const j = getJob(req.params.id); j ? res.json(j) : res.status(404).json({ error: 'Not found' }); });
  app.patch('/api/jobs/:id', (req, res) => res.json(updateJob(req.params.id, req.body)));

  app.post('/api/jobs/:id/draft', wrap(async (req, res) => {
    const job = getJob(req.params.id); if (!job) throw new Error('Job not found');
    const text = await draftMessage(job, req.body.channel || 'whatsapp');
    updateJob(job.id, { draft: text });
    res.json({ text, ai: !!config.claude.apiKey });
  }));

  app.post('/api/jobs/:id/send-whatsapp', wrap(async (req, res) => {
    const job = getJob(req.params.id); if (!job) throw new Error('Job not found');
    if (!req.body.text?.trim()) throw new Error('Write a message first.');
    await sendWhatsApp(job, req.body.text.trim());
    res.json(updateJob(job.id, { status: 'messaged', draft: req.body.text }));
  }));

  // Manual add (from the dashboard or the browser bookmarklet)
  app.post('/api/jobs', wrap(async (req, res) => {
    const { text = '', url = '', title = '', company = '' } = req.body;
    if (!text.trim() && !url.trim()) throw new Error('Paste the post text or a link.');
    const r = await analyse(`${title}\n${company}\n${text}\n${url}`);
    const { id, inserted } = upsertJob({
      source: 'manual', source_detail: /linkedin\.com/.test(url) ? 'from LinkedIn' : '',
      raw_text: text || url, url: url || r.url, title: title || r.title, company: company || r.company,
      location: r.location, experience: r.experience, summary: r.summary,
      contact_email: r.contact_email, contact_linkedin: r.contact_linkedin,
      contact_phone: r.phonesInText[0]?.length === 10 ? '91' + r.phonesInText[0] : r.phonesInText[0],
      score: Math.max(r.score, 60), posted_at: new Date().toISOString(),
    });
    if (req.headers.accept?.includes('text/html')) return res.redirect(`/?job=${id}`);
    res.json({ id, inserted });
  }));

  app.get('/api/status', (req, res) => res.json({
    whatsapp: waState, linkedinEmail: emailState, linkedinPublic: publicState,
    ai: !!config.claude.apiKey, me: { name: config.me.name },
  }));

  app.post('/api/sync', wrap(async (req, res) => {
    const [email, pub] = await Promise.all([syncLinkedInEmail(), syncLinkedInPublic()]);
    res.json({ email, public: pub });
  }));

  return app;
}

export function listen(app) {
  // Bound to localhost only: this server can send WhatsApp messages from your number.
  app.listen(config.port, '127.0.0.1', () => console.log(`\n  Dashboard: http://localhost:${config.port}\n`));
}
