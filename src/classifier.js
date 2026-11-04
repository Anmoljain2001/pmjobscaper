import { config } from './config.js';
import { askClaude, parseJson } from './claude.js';

const HIRING = /\b(hiring|we'?re hiring|opening|openings|vacanc(y|ies)|opportunit(y|ies)|position|role|jd|job description|apply|referral|refer|looking for (an? )?(senior |associate |junior )?(pm|product)|join (our|us)|immediate joiner|notice period|ctc|lpa)\b/i;
const NOT_A_POSTING = /\b(#?open ?to ?work|i am looking for|i'm looking for (a )?(job|role|opportunit)|seeking (a )?(new )?(role|opportunit)|please refer me|need a referral|anyone hiring)\b/i;
const WRONG_ROLE = /\b(project manager|program manager|sales manager|production manager|product designer|product marketing manager)\b/i;
const NOISE = /\b(webinar|workshop|masterclass|bootcamp|cohort|course|certification|ama session|register now|free session|meetup)\b/i;
const PM_SHORT = /\b(a?pm|sr\.? ?pm|gpm|tpm)\b/i;

export const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{0,4}/g;

/** Quick rule-based score, 0-100. No network. */
export function scoreText(text) {
  const t = (text || '').toLowerCase();
  let score = 0;
  const kw = config.roleKeywords.filter(k => k.length > 3 && t.includes(k));
  if (kw.length) score += 45 + Math.min(15, (kw.length - 1) * 5);
  else if (PM_SHORT.test(text) && /product/i.test(text)) score += 35;
  else if (PM_SHORT.test(text)) score += 20;
  if (HIRING.test(text)) score += 25;
  if (URL_RE.test(text)) score += 10; URL_RE.lastIndex = 0;
  if (EMAIL_RE.test(text)) score += 5; EMAIL_RE.lastIndex = 0;
  if (/\b\d+\s*[-–to]+\s*\d+\s*(yrs?|years)\b|\b\d+\+?\s*(yrs?|years)\b/i.test(text)) score += 5;
  if (NOT_A_POSTING.test(text)) score -= 50;
  if (NOISE.test(text) && !HIRING.test(text)) score -= 40;
  if (WRONG_ROLE.test(text) && !kw.length) score -= 40;
  if (t.length < 40) score -= 20;
  return Math.max(0, Math.min(100, score));
}

/** Pulls links, emails and phone numbers out of free text. */
export function extractContacts(text) {
  const urls = [...new Set((text.match(URL_RE) || []).map(u => u.replace(/[.,;:!]+$/, '')))];
  const emails = [...new Set(text.match(EMAIL_RE) || [])].filter(e => !/\.(png|jpg|jpeg|gif)$/i.test(e));
  const phones = [...new Set((text.match(PHONE_RE) || []).map(p => p.replace(/\D/g, '')).filter(p => p.length >= 10))];
  const applyUrl = urls.find(u => /linkedin\.com\/jobs|lever\.co|greenhouse\.io|ashbyhq|workable|naukri|instahyre|wellfound|forms\.gle|docs\.google\.com\/forms|careers|jobs\./i.test(u)) || urls[0];
  const linkedinProfile = urls.find(u => /linkedin\.com\/in\//i.test(u));
  return { urls, emails, phones, applyUrl, linkedinProfile };
}

const CITY_TAIL = /\s+(Bengaluru|Bangalore|Mumbai|Pune|Hyderabad|Gurugram|Gurgaon|Noida|Delhi|Chennai|Kolkata|Ahmedabad|Indore|Bhopal|Remote|Hybrid|India)\b.*$/i;

/** Rule-based guesses for title / company / location when Claude isn't configured. */
export function guessFields(text) {
  const lines = text.split(/\n+/).map(l => l.replace(/[*_~]/g, '').trim()).filter(Boolean);
  const titleLine = lines.find(l => config.roleKeywords.some(k => l.toLowerCase().includes(k))) || lines[0] || '';
  const titleMatch = titleLine.match(/((?:senior|sr\.?|associate|junior|lead|principal|group|staff|technical)?\s*product\s+(?:manager|owner|lead)(?:\s*[-–(]\s*[\w ]{2,30}\)?)?|\bA?PM\b)/i);
  const field = re => { for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); } return ''; };
  const company = field(/^(?:company|organisation|organization|client)\s*[:\-–]\s*(.+)$/i) ||
    ((titleLine.match(/(?:\bat|@)\s+([A-Z][\w&.\-]*(?:\s+[A-Z][\w&.\-]*){0,3})/) || [])[1] || '')
      .replace(CITY_TAIL, '').trim();
  const location = field(/^(?:location|loc|city|based in)\s*[:\-–]\s*(.+)$/i) ||
    (text.match(/\b(Bengaluru|Bangalore|Mumbai|Pune|Hyderabad|Gurugram|Gurgaon|Noida|Delhi|Chennai|Kolkata|Ahmedabad|Indore|Bhopal|Remote|Hybrid)\b/i) || [])[1] || '';
  const experience = field(/^(?:experience|exp|yoe)\s*[:\-–]\s*(.+)$/i) ||
    (text.match(/\b(\d+\s*[-–to]+\s*\d+\s*(?:yrs?|years)|\d+\+?\s*(?:yrs?|years))\b/i) || [])[1] || '';
  return {
    title: (titleMatch ? titleMatch[1] : titleLine).slice(0, 120).trim(),
    company: company.slice(0, 80), location: location.slice(0, 80), experience: experience.slice(0, 40),
  };
}

const EXTRACT_SYSTEM = `You read messages from job-sharing groups and decide whether each is a real job posting for a product management role (PM, APM, Senior PM, GPM, Product Owner, Head of Product). Project, program, product marketing and product design roles do NOT count. A person asking for a job is NOT a posting.
Reply with JSON only, no prose, no code fences:
{"is_pm_job": boolean, "confidence": 0-100, "title": string, "company": string, "location": string, "experience": string, "apply_url": string, "contact_email": string, "summary": "one sentence, max 25 words"}
Use "" for anything not stated. Never invent details.`;

/**
 * Full analysis of one piece of text. Uses rules first; asks Claude only when rules say it's plausible,
 * so you don't pay to classify every "good morning" in a group.
 */
export async function analyse(text) {
  const ruleScore = scoreText(text);
  const contacts = extractContacts(text);
  const base = { ...guessFields(text), score: ruleScore, url: contacts.applyUrl || '',
    contact_email: contacts.emails[0] || '', contact_linkedin: contacts.linkedinProfile || '',
    phonesInText: contacts.phones };

  if (ruleScore < 20) return { ...base, keep: false };
  const ai = parseJson(await askClaude(EXTRACT_SYSTEM, text.slice(0, 4000), 400));
  if (!ai) return { ...base, keep: ruleScore >= config.minScore };

  const score = ai.is_pm_job ? Math.round((ai.confidence + ruleScore) / 2) : Math.min(ruleScore, 15);
  return {
    ...base,
    title: ai.title || base.title, company: ai.company || base.company,
    location: ai.location || base.location, experience: ai.experience || base.experience,
    url: ai.apply_url || base.url, contact_email: ai.contact_email || base.contact_email,
    summary: ai.summary || '', score, keep: !!ai.is_pm_job && score >= config.minScore,
  };
}

/** For structured sources (LinkedIn listings) where we already know the title. */
export function titleLooksLikePM(title) {
  const t = (title || '').toLowerCase();
  if (WRONG_ROLE.test(t) && !/product manager|product owner/.test(t)) return false;
  return config.roleKeywords.some(k => t.includes(k)) || /\bpm\b|\bapm\b/.test(t);
}
