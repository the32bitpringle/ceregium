# Ceregium

Ceregium is a functional, self-contained student wellbeing product. It stores local
accounts, encrypted reflections, settings, assignments, browser pairings, and safety-plan
data in SQLite. It does not require Supabase, Google OAuth, Redis, Resend, or Twilio.

Ceregium is an early-warning and planning tool, not a medical diagnostic service.

## What Works

- local email/password accounts with hashed passwords and expiring HTTP-only sessions
- encrypted reflection text and a SQLite database in `.data/ceregium.sqlite`
- OpenRouter reflection analysis with deterministic fallback
- longitudinal burnout-pattern assessment with evidence and matchstick visualization
- personalized workload tradeoffs based on deadlines and student-provided grade impact
- manual assignments with add, edit-impact, and delete operations
- opt-in browser activity monitoring using aggregate category minutes, late-night use,
  long-session length, breaks, and tab-switch counts
- browser companion assignment import with review, scoped pairing keys, and revocation
- personalized exercises for breathing, grounding, recovery, workload, sleep, and connection
- AI-generated 48-hour schedule-easing plans with deterministic fallback and academic guardrails
- export, permanent account deletion, automatic session cleanup, rate limiting, and security headers
- responsive desktop/mobile interface and automated safety-sensitive logic tests

## Run

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`, create an account, and begin using the product. The database
and encryption key are created automatically on first run.

OpenRouter is optional:

```text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Without a key, the deterministic analyzer remains fully functional.

## Browser Companion

1. Open Chrome or Chromium extensions.
2. Enable Developer mode.
3. Choose **Load unpacked** and select `browser-extension/`.
4. In Ceregium, open **Integrations** and create a pairing key.
5. Paste the local app URL and pairing key into the extension.
6. Explicitly enable activity monitoring if desired. It is off by default.
7. Open a classroom or assignment page, scan it, review detected assignments, and import.

The extension receives no Ceregium cookie, school password, or OAuth token. A pairing key
can only import assignment metadata and send coarse daily activity summaries. The extension
does not send page text, exact URLs, domains, searches, or messages. Monitoring can be paused
and its local summaries can be deleted from the popup.

The included manifest allows `localhost:3000` and `127.0.0.1:3000`. Add the eventual
deployment origin to `host_permissions` before deploying the extension.

## Verification

```bash
npm run check
npm audit
```

For a later hosted deployment, mount `.data/` on persistent encrypted storage, run only one
writable application instance per SQLite database, serve over HTTPS, back up the data
directory, and add the deployment origin to the browser extension manifest.
