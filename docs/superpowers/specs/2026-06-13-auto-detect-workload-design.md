# Auto-Detect Workload — Design

Date: 2026-06-13
Status: Approved for planning

## Problem

Today a student's "workload" (the `workload_items` table) is populated only by
manual entry or by a manual extension flow: open a classroom page, click **Scan**,
review the detected items, click **Import**. Imported items always land with
`grade_impact = 'unknown'` until the student sets impact by hand. The Integrations
panel is a hardcoded list, and there is no workload-specific strain signal.

The goal: the workload should be **auto-detected** from the integrations the student
uses and from what the extension already observes, with no manual steps.

## Decisions (from brainstorming)

- **Detection targets (all four):** auto-scan & import assignments; auto-infer
  grade impact; auto-detect connected integrations; auto-infer workload strain.
- **Privacy posture: fully automatic, no review.** The student does not confirm
  imports. This intentionally supersedes the product's prior "you review before
  import" and "no domains sent" guarantees. Those claims must be rewritten to stay
  truthful (see "Truthfulness cleanup").
- **Gate:** auto-scan and service reporting go live as soon as a connection
  (`appUrl` + pairing token) is saved in the extension. Not tied to the monitoring
  toggle.
- **Architecture: extension-driven push.** The extension does the observing
  (scan pages, recognize services) and pushes results over the existing pairing
  token; the server does the two inference steps (grade impact, strain) because they
  need the full assignment/activity history.

## Architecture overview

```
Extension (background.js)                Server (Next.js API)            DB
─────────────────────────                ────────────────────            ──
tick(): active tab is education? ──scan──▶ POST /api/browser/import ──▶ workload_items
   (once per hostname+date)                  + inferGradeImpact()
sync(): observed service slugs ──────────▶ POST /api/browser/services ─▶ detected_integrations

Frontend (page.tsx)
  GET /api/integrations/status ──▶ detected_integrations + static built-ins
  GET /api/workload ─────────────▶ items + computeWorkloadStrain()
```

## Units

Each unit has one purpose, a defined interface, and is independently testable.

### Unit 1 — Auto-scan & import (extension, `background.js` + `popup.js`)

- Extract the page-scan function (currently inline in `popup.js`'s Scan handler)
  into a shared function usable by both the popup and the background worker.
- In `tick()`, after categorizing the active tab: if category is `education`,
  a connection is saved (`appUrl` + `token`), and this `hostname` has not been
  scanned today, inject the scan script via `chrome.scripting.executeScript` and
  POST the detected items to `/api/browser/import` with the pairing token.
- Record scanned pages in `chrome.storage` as a set keyed by `hostname|localDate`,
  retained for the same 14-day window as activity days, so each LMS page is scanned
  at most once per day.
- The popup keeps its manual **Scan**/**Import** buttons as a fallback; they call
  the same shared scan function.
- No new permissions required (`scripting`, `tabs`, `activeTab` already present).

Interface: `scanActiveTabForAssignments()` → `Promise<DetectedItem[]>`;
`autoImportIfEducation(tab, saved)` invoked from `tick()`.

Dependencies: existing `categorize()`, `readStorage()`, `/api/browser/import`.

### Unit 2 — Grade-impact inference (server, new `src/lib/workload-inference.ts`)

Pure function:

```ts
inferGradeImpact(title: string, pointsPossible?: number):
  "low" | "medium" | "high"
```

- Keyword-first on the lowercased title:
  - high: `final`, `exam`, `midterm`, `project`, `paper`, `essay`, `presentation`,
    `thesis`, `capstone`
  - low: `discussion`, `reading`, `optional`, `practice`, `survey`, `check-in`,
    `warm-up`, `extra credit`
  - medium: `quiz`, `lab`, `homework`, `assignment`, `problem set`, `worksheet`
- Tiebreaker when no keyword matches: `pointsPossible` thresholds
  (`>= 100` → high, `<= 10` → low, else medium). Default `medium` when nothing
  is known.
- Used by `POST /api/browser/import` in place of the literal `"unknown"`. Because
  the import upsert leaves `grade_impact` untouched `on conflict`, a student's later
  manual change via `PATCH /api/workload` is preserved across re-imports.
- Manual `POST /api/workload` continues to use the student-supplied impact.

Tested in `tests/workload-inference.test.ts`.

### Unit 3 — Integration auto-detection (extension + server + frontend)

- **Extension:** while syncing, collect the set of matched **service slugs** from
  the `categories` map for `education` and `productivity` tabs seen today (e.g.
  `"canvas"`, `"notion"`). Send only these allowlisted slugs — never raw domains,
  URLs, or page text. New `POST /api/browser/services` body: `{ services: string[] }`
  validated against the known slug allowlist (zod enum), authorized by pairing token.
- **DB:** new table
  `detected_integrations(user_id, service, category, first_seen, last_seen,
  primary key(user_id, service))`; upsert refreshes `last_seen`.
- **Server:** `GET /api/integrations/status` additionally returns
  `detectedIntegrations` mapped from the table (slug → display name + category).
- **Frontend:** `page.tsx` renders the integrations list by merging the two static
  built-ins ("Browser companion", "Manual entry") with detected integrations from
  the API, replacing the hardcoded-only array. Detected ones show
  `status: "connected"`.

Slug→name map lives in `src/lib/workload-inference.ts` (or a small
`src/lib/integrations.ts`) and is shared/validated on both server and is the source
of the zod enum. Tested for mapping correctness.

### Unit 4 — Workload strain (server, new `src/lib/workload-strain.ts`)

Pure function:

```ts
computeWorkloadStrain(items: WorkloadItem[], today?: BrowserActivityDay):
  { score: number; level: "light" | "moderate" | "heavy"; drivers: string[] }
```

- Deadline-density component: count upcoming items bucketed by hours-until-due
  (`<=24h`, `<=72h`, `<=7d`) weighted by `gradeImpact` (high > medium > low),
  overdue items weighted highest.
- Activity component (when a `today` summary exists): late-night minutes, longest
  session length, and low break count add to strain.
- Normalize to 0–100; `level` thresholds (`<34 light`, `<67 moderate`, else heavy);
  `drivers` lists the top contributing reasons for display.
- `GET /api/workload` returns `{ items, strain }`. The workload view shows the
  strain level + drivers, and passes `strain.score` to `workloadSupport()` in place
  of `patternAssessment.score`.

Tested in `tests/workload-strain.test.ts`.

### Unit 5 — Truthfulness cleanup (docs + copy)

Because imports are now automatic and service slugs are reported, update:
- `README.md`: the "Browser Companion" section and the "What Works" bullets that say
  "import assignments you review" / "does not send … domains" — describe automatic
  scanning and allowlisted service-slug reporting instead.
- `browser-extension/manifest.json` `description`.
- `src/app/page.tsx:1083` integrations copy and the "Browser companion" /
  "Manual entry" `detail` strings.

## Data flow & error handling

- Auto-import failures (network down, revoked token, rate limit) are logged via the
  existing `enqueue()` catch in `background.js` and silently retried next tick; the
  per-day scan guard is only set after a successful POST so a failed scan retries.
- `/api/browser/services` and `/api/browser/import` keep the existing pairing-token
  auth, CORS headers, and per-pairing rate limiting.
- Strain computation tolerates an empty activity history (deadline-only score) and
  an empty item list (score 0, level light).
- Invalid service slugs are rejected by the zod enum (400), so a tampered extension
  can't write arbitrary strings into `detected_integrations`.

## Testing

- `tests/workload-inference.test.ts`: keyword and points-threshold cases, default.
- `tests/workload-strain.test.ts`: deadline buckets, impact weighting, overdue,
  activity contribution, empty inputs.
- Extend existing safety/logic tests only where these modules intersect them.
- `npm run check` (lint + test + build) must pass.

## Out of scope

- Per-feature opt-in toggles (explicitly chose fully-automatic).
- Real LMS API/OAuth integrations — detection remains observation-based.
- Editing/deleting auto-detected integrations from the UI.
- Historical backfill of grade impact for already-imported `unknown` items
  (only newly imported items are inferred).
