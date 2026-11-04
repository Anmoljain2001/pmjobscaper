import cron from 'node-cron';
import { config } from './config.js';
import { createServer, listen } from './server.js';
import { startWhatsApp } from './sources/whatsapp.js';
import { syncLinkedInEmail } from './sources/linkedinEmail.js';
import { syncLinkedInPublic } from './sources/linkedinPublic.js';

listen(createServer());

startWhatsApp();                                   // real-time, event driven

if (config.imap.enabled) {
  syncLinkedInEmail();
  cron.schedule('*/30 * * * *', syncLinkedInEmail); // every 30 minutes
}
if (config.linkedinPublic.enabled) {
  syncLinkedInPublic();
  const h = Math.max(2, Math.round(config.linkedinPublic.everyHours));
  cron.schedule(`17 */${h} * * *`, syncLinkedInPublic);
}
