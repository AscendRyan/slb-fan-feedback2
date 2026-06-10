# SLB Fan Feedback

SLB Fan Feedback is a Super League Basketball post-event survey app. It gives each audience a focused, shareable route and now includes a Vercel serverless submission endpoint so responses can be saved to Google Sheets, a webhook, or Vercel Postgres.

The app is built with TanStack Start, React, Vite, Tailwind CSS, and shadcn-style UI primitives.

## Audience Routes

| Route | Audience | Best use |
| --- | --- | --- |
| `/` | Admin gateway | Sign in and choose the right survey link. |
| `/fan` | Fans and spectators | Send after matchday attendance or viewing. |
| `/player` | Players and team staff | Capture operational and competition feedback. |
| `/media` | Press and broadcast | Learn what helped or blocked event coverage. |
| `/partner` | Partners and sponsors | Review activation, hospitality, and commercial experience. |
| `/discount` | Discount-ticket respondents | Understand offer-led attendance and value perception. |

## What Changed For Vercel

- The browser now posts submissions to `/api/submit` by default.
- `/api/submit` is a Vercel Node.js serverless function.
- The function can save each submission to one or more destinations:
  - `GOOGLE_SHEETS_WEBHOOK_URL` for Google Sheets via Apps Script.
  - `SUBMISSION_WEBHOOK_URL` for Make, Zapier, n8n, Airtable, or any JSON webhook.
  - `POSTGRES_URL` / Vercel Postgres environment variables for a database table.
- `vite.config.ts` includes the Nitro plugin required for TanStack Start routing on Vercel.
- `vercel.json` pins the install, build, and dev commands while `package.json` pins Node.js 24 for Vercel.

## Quick Start On Windows

Use Node.js 24 LTS. Node 25 can produce unsupported-engine warnings with some dependencies.

```powershell
cd C:\Users\User\Downloads\slb-fan-feedback-main
npm install
npm run dev:localhost
```

Open:

```text
http://localhost:8080
```

Admin gateway credentials:

```text
Username: slb
Password: onlyus
```

## Deploy To Vercel

1. Push this project to GitHub.
2. Go to Vercel and import the repository.
3. Vercel should detect TanStack Start.
4. Keep these project settings:
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Development Command: `npm run dev:localhost`
5. Add at least one storage environment variable from the sections below.
6. Deploy.
7. Visit `/api/health` on your deployed site to confirm which destinations are configured.
8. Submit a test response from `/fan`, then check your Sheet/database.

## Option A: Save To Google Sheets

This is the easiest spreadsheet setup.

1. Create a new Google Sheet.
2. In the Sheet, open **Extensions → Apps Script**.
3. Paste the contents of `docs/google-sheets-apps-script.js` into `Code.gs`.
4. Click **Deploy → New deployment**.
5. Choose **Web app**.
6. Set **Execute as** to **Me**.
7. Set **Who has access** to **Anyone**.
8. Copy the Web app URL.
9. In Vercel, add this Environment Variable:

```text
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

10. Redeploy the Vercel project.

When the survey posts to `/api/submit`, Vercel receives the form data and forwards it server-to-server to your Google Apps Script URL. The Apps Script appends one row per submission to the `Submissions` tab.

## Option B: Save To A Generic Webhook

Use this if you already have Make, Zapier, n8n, Airtable automation, or another data receiver.

Add this Vercel Environment Variable:

```text
SUBMISSION_WEBHOOK_URL=https://your-webhook-url.example
```

The Vercel function will POST the full survey payload to that URL.

## Option C: Save To Vercel Postgres / Neon

Use this if you want a database.

1. Add a Postgres integration to the Vercel project.
2. Ensure Vercel has added `POSTGRES_URL` or compatible Postgres variables.
3. Redeploy.

The first submission creates this table automatically:

```sql
CREATE TABLE IF NOT EXISTS survey_submissions (
  id bigserial PRIMARY KEY,
  request_id text UNIQUE NOT NULL,
  audience text NOT NULL,
  submitted_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  consent boolean NOT NULL DEFAULT false,
  overall integer,
  recommend integer,
  ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  choices jsonb NOT NULL DEFAULT '{}'::jsonb,
  highlight text,
  improve text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL
);
```

## Environment Variables

Copy `.env.example` to `.env.local` for local testing, or add these in Vercel Project Settings.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `GOOGLE_SHEETS_WEBHOOK_URL` | One destination required | Google Apps Script web app URL for spreadsheet storage. |
| `SUBMISSION_WEBHOOK_URL` | One destination required | Generic JSON webhook destination. |
| `POSTGRES_URL` | One destination required | Postgres connection variable, usually added by Vercel/integration. |
| `VITE_SURVEY_ENDPOINT` | Optional | Client-side override. Leave unset on Vercel so forms post to `/api/submit`. |

If no destination is configured, submissions will fail with a clear error instead of pretending data was saved.

## Submission Payload

The browser sends this to `/api/submit`:

```json
{
  "audience": "fan",
  "submittedAt": "2026-06-08T09:00:00.000Z",
  "answers": {
    "overall": 5,
    "recommend": 5,
    "ratings": {
      "atmosphere": 5
    },
    "choices": {},
    "highlight": "The atmosphere in the fourth quarter.",
    "improve": "More food options near the lower bowl.",
    "email": "fan@example.com",
    "consent": true
  },
  "meta": {
    "userAgent": "Browser user agent",
    "page": "/fan"
  }
}
```

The Vercel function adds:

```json
{
  "requestId": "unique-id",
  "receivedAt": "server timestamp",
  "meta": {
    "country": "Vercel country header when available",
    "region": "Vercel region header when available",
    "city": "Vercel city header when available"
  }
}
```

## Useful Commands

```bash
npm install
npm run dev:localhost
npm run build
npm run preview
npm run lint
```

## Editing Survey Content

Each audience route imports `SurveyPage` and passes a `SurveyConfig`. To change copy or questions:

1. Open the relevant route in `src/routes/`.
2. Update the `title`, `intro`, `ratings`, `choices`, or prompt fields.
3. Keep each question `id` stable if downstream reporting already depends on it.
4. Run the app and submit a test response before sharing the link.

## Notes

- Do not put Google credentials or database URLs in `VITE_` variables. `VITE_` variables are exposed to the browser.
- Use `/api/health` after deployment to check configuration without submitting a form.
- The gateway credentials in `src/routes/index.tsx` are a lightweight event gate, not a full secure admin identity system.
