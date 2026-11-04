import 'dotenv/config';

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const list = (v, sep = ',') => (v || '').split(sep).map(s => s.trim()).filter(Boolean);

export const config = {
  port: num(process.env.PORT, 3000),
  roleKeywords: list(process.env.ROLE_KEYWORDS).map(s => s.toLowerCase()),
  minScore: num(process.env.MIN_SCORE, 40),

  me: {
    name: process.env.MY_NAME || '',
    headline: process.env.MY_HEADLINE || '',
    pitch: process.env.MY_PITCH || '',
    resumeUrl: process.env.RESUME_URL || '',
    linkedinUrl: process.env.LINKEDIN_PROFILE_URL || '',
  },

  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
  },

  whatsapp: {
    enabled: bool(process.env.WHATSAPP_ENABLED, true),
    groups: list(process.env.WHATSAPP_GROUPS, '|'),
    backfill: num(process.env.WHATSAPP_BACKFILL, 150),
    minGapSeconds: num(process.env.WHATSAPP_MIN_GAP_SECONDS, 90),
    dailyLimit: num(process.env.WHATSAPP_DAILY_LIMIT, 15),
  },

  imap: {
    enabled: bool(process.env.IMAP_ENABLED, false),
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: num(process.env.IMAP_PORT, 993),
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || '',
    lookbackDays: num(process.env.IMAP_LOOKBACK_DAYS, 7),
  },

  linkedinPublic: {
    enabled: bool(process.env.LINKEDIN_PUBLIC_ENABLED, false),
    searches: list(process.env.LINKEDIN_SEARCHES, '|').map(s => {
      const [keywords, location = ''] = s.split('@').map(x => x.trim());
      return { keywords, location };
    }),
    everyHours: num(process.env.LINKEDIN_PUBLIC_EVERY_HOURS, 6),
  },
};
