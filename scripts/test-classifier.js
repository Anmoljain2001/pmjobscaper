import { scoreText, guessFields, extractContacts, titleLooksLikePM } from '../src/classifier.js';

const cases = [
  [true, `*We're hiring!* Senior Product Manager at Razorpay\nLocation: Bengaluru\nExp: 5-8 yrs\nApply: https://jobs.lever.co/razorpay/abc123\nDM or mail priya@razorpay.com`],
  [true, `Opening for Associate Product Manager (APM) @ CRED, Bangalore. 1-3 years. Share CV at talent@cred.club`],
  [true, `Hiring PM for a Series B fintech in Mumbai, 4+ years, B2B payments. Referral link: https://www.linkedin.com/jobs/view/3912345678/`],
  [false, `Hi all, I'm looking for a product manager role, 3 yrs exp, please refer me 🙏 #OpenToWork`],
  [false, `Hiring Project Manager for construction site in Pune. 10 years exp.`],
  [false, `Good morning everyone!`],
  [false, `Webinar tonight: how to crack product management interviews. Register here https://bit.ly/x`],
];
let pass = 0;
for (const [expected, text] of cases) {
  const s = scoreText(text), got = s >= 40;
  if (got === expected) pass++;
  console.log(got === expected ? 'PASS' : 'FAIL', String(s).padStart(3), '|', text.split('\n')[0].slice(0, 70));
  if (expected) console.log('      ', JSON.stringify(guessFields(text)), extractContacts(text).applyUrl || '');
}
console.log(`\n${pass}/${cases.length} passed`);
console.log('titles:', ['Senior Product Manager', 'Product Marketing Manager', 'APM - Growth', 'Program Manager'].map(t => `${t}=${titleLooksLikePM(t)}`).join(', '));
