# Ceregium

Ceregium is a private student wellbeing dashboard that combines daily reflections,
school workload, schedules, and connected activity to make sustained changes visible
before they become a crisis.

The current implementation is a functional MVP:

- responsive dashboard and daily digest
- daily reflection storage in the browser
- server-side pattern analysis API with validated input
- pattern evidence and confidence
- integration consent controls
- trusted-contact safety-plan setup
- privacy and retention controls
- provider-neutral connector contracts
- Supabase schema with row-level security policies
- Supabase email/password authentication and age/profile completion
- Google Classroom and Calendar OAuth plus workload sync
- OpenAI Responses API structured reflection analysis with deterministic fallback
- trusted-contact email/SMS verification adapters
- working settings, JSON export, account deletion, and workload views

Run locally:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` when adding service credentials.
Apply the migrations in order:

```bash
supabase/migrations/001_initial.sql
supabase/migrations/002_product_features.sql
```

Without credentials, Ceregium intentionally runs in demo mode. Reflections, connection
choices, and settings remain in browser local storage. Verification codes are displayed
in the UI and AI analysis uses the deterministic fallback.

Configured mode requires:

- Supabase project URL, anon key, service-role key, and a strong encryption key
- Google OAuth web client with the callback URL from `.env.example`
- OpenAI API key for structured reflection analysis
- Resend and/or Twilio credentials for trusted-contact delivery

Google Cloud must have the Google Classroom API and Google Calendar API enabled. The
OAuth consent screen must include the scopes requested in `src/lib/google.ts`.

The integration catalog demonstrates consent and connection state. Production OAuth
requires provider credentials and app review. Ceregium is not a diagnostic or emergency
service.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
