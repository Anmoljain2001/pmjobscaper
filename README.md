# PM Job Radar

Finds product management job posts in your WhatsApp groups and LinkedIn, puts them in one
dashboard, and lets you apply or message the poster in a couple of clicks.

```
WhatsApp groups ──(live, as messages arrive)──┐
LinkedIn job-alert emails ──(every 30 min)────┼──► filter: is this a PM job? ──► SQLite ──► Dashboard
LinkedIn public search (opt-in, every 6h) ────┤      rules + optional Claude                 │
"Save to Job Radar" bookmarklet ──────────────┘                                              ├─ Open posting / Mark applied
                                                                                             ├─ Draft a message (Claude or template)
                                                                                             └─ Send on WhatsApp / Copy to LinkedIn / Email
```

Everything runs on your own computer. Nothing is uploaded anywhere except, if you turn it on,
the post text sent to Claude for parsing and drafting.

## 1. Install

You need Node.js 22.13 or newer (`node -v`).

```bash
npm install
cp .env.example .env      # then open .env and fill it in
npm run seed              # optional: sample jobs to try the dashboard
npm start
```

Open http://localhost:3000.

## 2. Connect WhatsApp

1. In `.env`, set `WHATSAPP_GROUPS` to the exact names of your job groups, separated by `|`.
   Leave it empty to watch every group.
2. Run `npm start`. Click "Connect WhatsApp" in the dashboard (a QR also prints in the terminal).
3. On your phone: WhatsApp › Settings › Linked devices › Link a device › scan.

The session is saved in `data/wa-session`, so you scan once. On connect it scans the last 150
messages of each group, then picks up new posts live.

## 3. Connect LinkedIn (recommended way: job alerts)

1. On LinkedIn, search "Product Manager" with your location and filters, then turn on
   "Set alert" (daily). Add a few: APM, Senior PM, your target cities.
2. For Gmail: turn on 2-Step Verification, then create an App Password at
   https://myaccount.google.com/apppasswords.
3. In `.env`: `IMAP_ENABLED=true`, `IMAP_USER`, `IMAP_PASS` (the app password).

Alert emails are read every 30 minutes, or when you click "Check for new jobs".

**LinkedIn feed posts** ("We're hiring a PM, DM me") don't come through alerts. For those, drag
the "Save to Job Radar" link (in "Add a job") to your bookmarks bar, select the post text on
LinkedIn, and click it.

**LinkedIn public search (optional).** `LINKEDIN_PUBLIC_ENABLED=true` reads LinkedIn's logged-out
job search every few hours. It's off by default because automated collection goes against
LinkedIn's terms of use. Your account isn't involved, but LinkedIn may block the requests.

## 4. Turn on AI (optional, recommended)

Add `ANTHROPIC_API_KEY` to `.env` (from https://console.anthropic.com). With it:
- posts are checked by Claude, so fewer false positives (webinars, "please refer me" posts);
- title, company, location and apply link are pulled out more accurately;
- "Write a draft" writes a message specific to each post.

Without a key, keyword rules and templates are used. Only posts that pass the keyword rules are
sent to Claude, so cost stays low. `CLAUDE_MODEL` defaults to `claude-haiku-5-5`.

Fill in `MY_NAME`, `MY_HEADLINE`, `MY_PITCH` and `RESUME_URL`; drafts use them.

## Using the dashboard

| Key | Action |
| --- | --- |
| `j` / `k` | Next / previous job |
| `s` | Save |
| `a` | Mark applied |
| `x` | Archive |
| `o` | Open the posting |
| `r` | Jump to the message box |

Reaching out:
- **WhatsApp**: sends from your number to the poster (or a number in the post), after you confirm.
- **LinkedIn note**: copies the message and opens the poster's profile or the job page. Paste and send.
  LinkedIn DMs are not automated; that's what gets accounts restricted.
- **Email**: opens your email app with the message filled in.

## Keeping your accounts safe

- WhatsApp sending is capped: at least 90 seconds between messages and 15 per day by default
  (`WHATSAPP_MIN_GAP_SECONDS`, `WHATSAPP_DAILY_LIMIT`). Every send needs your click.
  WhatsApp can restrict numbers that message many strangers; keep messages personal.
- `whatsapp-web.js` is an unofficial library. It reads messages as you, the way WhatsApp Web does.
- The server only listens on `localhost`, so nobody else on your network can send messages.

## Run it all the time

```bash
npm install -g pm2
pm2 start "npm start" --name job-radar
pm2 save && pm2 startup
```

Your computer needs to be on for WhatsApp posts to be caught live. Missed posts are picked up by
the backfill on the next start. For 24/7, run it on a small cloud VM and reach the dashboard with an
SSH tunnel: `ssh -L 3000:localhost:3000 you@server`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "groups not found" in the terminal | Group names must match exactly, emoji included. The dashboard chip lists the groups it sees. |
| WhatsApp keeps asking for the QR | Delete `data/wa-session` and scan again. |
| Puppeteer / Chrome error on Linux | `sudo apt install -y chromium` or `npx puppeteer browsers install chrome` |
| Email login failed | Use a Gmail App Password, not your normal password. IMAP must be on in Gmail settings. |
| Too many non-PM posts | Raise `MIN_SCORE` to 50–60, or add an API key. |
| Missing real PM posts | Lower `MIN_SCORE` to 30, or add phrases to `ROLE_KEYWORDS`. |

## Project layout

```
src/index.js                 starts the server and the sources
src/server.js                dashboard API
src/db.js                    SQLite storage (data/jobs.db), de-duplication
src/classifier.js            "is this a PM job?" scoring and field extraction
src/claude.js                Claude API call
src/messaging.js             message drafts per channel
src/sources/whatsapp.js      WhatsApp listener, backfill, rate-limited sending
src/sources/linkedinEmail.js LinkedIn job-alert email parser
src/sources/linkedinPublic.js  opt-in LinkedIn public search
public/index.html            the dashboard
public/add.html              landing page for the bookmarklet
scripts/                     sample data and parser tests
```
