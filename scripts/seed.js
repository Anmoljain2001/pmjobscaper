// Adds sample jobs so you can try the dashboard before connecting anything.
import { upsertJob } from '../src/db.js';
import { analyse } from '../src/classifier.js';

const h = n => new Date(Date.now() - n * 3600e3).toISOString();
const wa = [
  ['PM Jobs India', '919811122233', 'Rahul Mehta', 2, `*We're hiring!* Senior Product Manager at Razorpay\nLocation: Bengaluru\nExp: 5-8 yrs\nPayments platform, B2B. Apply: https://jobs.lever.co/razorpay/sample-spm\nOr DM me directly`],
  ['Product Folks Hiring', '919900011122', 'Ananya', 5, `Opening for Associate Product Manager (APM) @ CRED, Bangalore. 1-3 years, strong analytics. Share CV at talent@cred.example`],
  ['PM Jobs India', '918877766655', 'Vikram S', 20, `Hiring PM for a Series B healthtech in Pune, 4+ years, mobile apps. Referral link: https://www.linkedin.com/jobs/view/3912345678/`],
  ['Product Folks Hiring', '917766554433', 'Neha Kapoor', 30, `Group Product Manager – Lending\nCompany: Groww\nLocation: Bengaluru (Hybrid)\nExperience: 8-12 years\nReach me on WhatsApp for referral 🙂`],
];
for (const [group, phone, name, hrs, text] of wa) {
  const r = await analyse(text);
  upsertJob({ source: 'whatsapp', source_detail: group, raw_text: text, title: r.title, company: r.company,
    location: r.location, experience: r.experience, url: r.url, score: r.score, contact_email: r.contact_email,
    contact_phone: phone, contact_name: name, posted_at: h(hrs) });
}
const li = [
  ['Product Manager, Growth', 'Swiggy', 'Bengaluru, Karnataka (Hybrid)', '4012345001', 3],
  ['Senior Product Manager - Platform', 'Freshworks', 'Chennai, Tamil Nadu', '4012345002', 9],
  ['Associate Product Manager', 'Zomato', 'Gurugram, Haryana (On-site)', '4012345003', 26],
  ['Product Owner – Digital Banking', 'HDFC Bank', 'Mumbai, Maharashtra', '4012345004', 50],
];
for (const [title, company, location, id, hrs] of li) {
  const url = `https://www.linkedin.com/jobs/view/${id}/`;
  upsertJob({ source: 'linkedin_email', source_detail: 'LinkedIn job alert: Product Manager in India', title, company, location, url,
    score: 80, raw_text: `${title}\n${company}\n${location}\n${url}`, posted_at: h(hrs) });
}
console.log('Added sample jobs. Start the app with: npm start');
