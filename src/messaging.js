import { config } from './config.js';
import { askClaude } from './claude.js';

const LIMITS = { whatsapp: 600, linkedin: 300, email: 1200 };

function template(job, channel) {
  const me = config.me;
  const role = job.title || 'Product Manager';
  const at = job.company ? ` at ${job.company}` : '';
  const hi = job.contact_name ? `Hi ${job.contact_name.split(' ')[0]}` : 'Hi';
  if (channel === 'linkedin') {
    return `${hi}, I saw the ${role} opening${at}. I'm ${me.name}, ${me.headline}. ${me.pitch.split('.')[0]}. Would love to be considered. Happy to share my resume.`.slice(0, LIMITS.linkedin);
  }
  if (channel === 'email') {
    return `Subject: ${role}${at} – ${me.name}\n\n${hi},\n\nI came across the ${role} role${at} and would like to apply. I'm ${me.headline}.\n\n${me.pitch}\n\nResume: ${me.resumeUrl}\nLinkedIn: ${me.linkedinUrl}\n\nWould you be open to a quick chat?\n\nThanks,\n${me.name}`;
  }
  return `${hi}! Saw your post about the ${role} role${at}${job.source_detail ? ` in ${job.source_detail}` : ''}. I'm ${me.name}, ${me.headline}. ${me.pitch}\n\nResume: ${me.resumeUrl}\n\nCould you refer me or share who to reach out to? Thank you!`;
}

export async function draftMessage(job, channel = 'whatsapp') {
  const fallback = template(job, channel);
  const ai = await askClaude(
    `You write short, specific outreach messages from a job seeker to a recruiter or hiring manager about a product management role. Sound like a real person: warm, direct, no buzzwords, no flattery, no emojis unless the channel is WhatsApp (at most one). Mention one concrete thing from the post when possible. Channel: ${channel}. Hard limit ${LIMITS[channel]} characters.${channel === 'email' ? ' Start with "Subject: ..." on the first line.' : ''} Output the message only.`,
    `About me:\nName: ${config.me.name}\nHeadline: ${config.me.headline}\nPitch: ${config.me.pitch}\nResume: ${config.me.resumeUrl}\nLinkedIn: ${config.me.linkedinUrl}\n\nJob post (${job.source}${job.source_detail ? ', ' + job.source_detail : ''}):\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nPoster name: ${job.contact_name || 'unknown'}\n---\n${(job.raw_text || '').slice(0, 3000)}`,
    500,
  );
  return (ai || fallback).slice(0, LIMITS[channel] + 200);
}
