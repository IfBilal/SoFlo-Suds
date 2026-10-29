# Claude Code continuation handoff — SoFlo Suds

Updated 23 October 2026. This supersedes the status in `docs/CODEX_HANDOFF.md`; that file describes the state before the booking-handoff work. Continue development and full end-to-end QA from this document. Keep this file and `docs/SUPABASE_MIGRATION_STATUS.md` current as evidence changes.

## 1. Authority and objective

Build the handbook's complete SoFlo Suds customer app and web admin, then prove the release flows on an installed app. The [Developer Handbook](SoFlo%20Suds%20-%20Developer%20Handbook.pdf) is the final authority for features and business rules. `docs/soflo.html` is the client's visual reference for overlapping screens; follow its colors, typography, spacing, cards, navigation and interactions where the handbook includes the feature. The [concept-to-product spec](CONCEPT_TO_PRODUCT_SPEC.md) records the translation. Do not add concept-only features.

The approved working architecture on this branch is Expo/React Native + Supabase Auth/Postgres/RLS/Edge Functions/Cron/Storage + Urable for customers, vehicles, services, jobs and payments. Ali accepted the stack change verbally; written confirmation for [ADR 0001](adr/0001-supabase-backend.md) is still pending. `main` preserves the old Fastify version; do not reset or merge it casually. The user wants frequent commits pushed to GitHub and wants a **full real-device, real-backend end-to-end test after development**. Automated and browser-mocked tests alone do not satisfy that request.

## 2. Repository and deployed state

- Repo: `IfBilal/SoFlo-Suds`; branch: `supabase-backend-migration`; HEAD and `origin/supabase-backend-migration`: `be65f25`. `main` and `origin/main`: `1beb548`. Working tree was clean at handoff.
- Five local migrations in `supabase/migrations/` are applied to active Supabase project `tocofoxugjkaytxuxyzb`. Migration 005 adds `booking_handoffs` with default-deny RLS. It was applied through the connected Supabase MCP, whose remote migration version is `20261023092230` (`booking_handoff`), while the local file is named `20261023000005_booking_handoff.sql`. The earlier four remote versions also differ from local filenames. **Inspect migration history before any `supabase db push`; do not blindly reapply them.**
- Original `soflo-api`, `cron-worker` and `health` Edge Functions are live; `soflo-worker` Cron runs every five minutes. The newer `soflo-api` and `cron-worker` source on this branch **has not been deployed**. The CLI command `supabase functions deploy soflo-api --project-ref tocofoxugjkaytxuxyzb` returned HTTP 403 because the available CLI login belongs to an account without this project's Function deploy privilege. The connected Supabase MCP can inspect/apply SQL but exposes no Edge Function deploy tool. Do not mistake the live handoff table for a live handoff API.
- Supabase Auth email confirmation, redirect allow-list and Brevo SMTP were configured by the earlier migration work. The admin site is hosted at `https://soflo-suds.vercel.app`. Owner admin exists and live `/admin/me` returned 200 in earlier testing; hosted browser sign-in remains untested. No preexisting customer data was found before migration; no legacy users were migrated.
- Urable's server key is in Supabase Function secrets, never the mobile bundle. Earlier marked QA tests created/read/cancelled a future in-shop job; **no real card payment was made**. The public Urable API lacks availability and card-checkout endpoints. The handbook permits its virtual shop inside the app as the fallback for slots/payment. The shop currently displays a 25% deposit and 7% convenience fee for a sample service, conflicting with the handbook's working full-payment assumption; get Ali's decision before controlled paid testing.
- EAS project: `@bilal06/soflo-suds`, Android package `com.soflosuds.app`. Preview APK build `ff0e7241-0875-4f4e-854a-525d83d00756` **finished** from commit `ccf4727`; artifact: `https://expo.dev/artifacts/eas/XjMJWB4v0cJWBUBvgQ4m9YEWy0IiB3-vOTJMCQB7Gpg.apk`. It has the initial handoff but lacks later resume/payment-confirmation changes. A second build upload from `f4cb7e2` stalled before EAS returned a build ID; it was stopped. EAS printed a build-credit warning even though the earlier build finished. Build a new preview APK from current HEAD once uploads work. **Do not distribute the older APK for booking QA before the new functions are live.**
- `adb devices` listed no Android device. No Android emulator/SDK is installed here. A real device and second phone on mobile data are still needed for release QA.

## 3. What was implemented since the previous handoff

Commits `ccf4727` through `be65f25` were pushed, including small follow-up fixes:

1. `supabase/migrations/20261023000005_booking_handoff.sql` stores a server-owned snapshot of preexisting Urable job IDs for each virtual-shop attempt, expiry and matched job. Client roles cannot access the table directly.
2. `supabase/functions/soflo-api/customer.ts` exposes `POST /bookings/handoff`, `GET /bookings/handoff/latest` and `GET /bookings/handoff/:id`. It requires a verified Auth email, scopes attempts to the signed-in user, asks Urable for same-email customers (including duplicates), rejects ambiguous matches unless a confirmation number is given, records the match in `job_sync`, and makes linked jobs visible only to that user. It includes linked payment history and vehicle names.
3. `supabase/functions/_shared/booking-handoff.ts` rejects jobs whose `customerRef` does not match the Urable customer being examined. `supabase/functions/_shared/sync.ts` polls linked duplicate-customer jobs for status/payment/points. It sends “Booking confirmed” only after Urable reports `paymentStatus = paid`, so a scheduled unpaid job is not announced as paid. The Urable public OpenAPI enumerates `pending`, `unpaid`, `paid`; actual checkout/deposit behavior still needs a live test.
4. `apps/mobile/app/booking.tsx` starts a handoff before opening the virtual shop, checks for the new job when the WebView closes, shows pending/ambiguous/matched states without claiming unpaid payment is complete, accepts a confirmation number for an ambiguous result, and offers “Check recent booking” after the app is reopened. `apps/mobile/lib/api.ts` provides the new typed calls.
5. Tests cover ownership, duplicate Urable customers, ambiguous matches, payment history, linked-job Cron sync, unpaid confirmation suppression and retry/idempotence. Browser QA at 390px covers start → checkout → pending → matched and resume after reload with mocked network responses. The screenshot is `docs/visual-validation/390/booking-handoff-matched.png`.
6. README, setup, status, cutover runbook and [end-to-end QA checklist](END_TO_END_QA.md) were updated. The untracked `apps/admin/.gitignore` left by the earlier work was committed. Current branch is clean and pushed.

## 4. Verification performed

- `npm run test:db`: 52 passing PGlite migration/RLS checks.
- `npm run test:functions`: 14 passing suites/tests, 43 nested steps, with fake Urable/Auth/Expo and real handler/SQL code.
- `npm run typecheck`, `npm run check:functions`, `npm run build`: passed during this continuation. Android JS export passed before the final small mobile copy change; rerun on the final build if needed.
- `CI=1 npx expo start --web --port 8082` (from `apps/mobile`) plus `node scripts/qa-booking-web.mjs` (from repo root): passed, including reload/resume. This uses mocked Supabase/Urable responses and cannot establish real payment, native WebView redirects or push delivery.
- Supabase MCP `list_migrations` and `list_tables` confirmed migration 005 and RLS on `booking_handoffs`. Security advisors showed the expected default-deny/no-policy notices, `pg_net` in `public`, and the intentionally public `shop_config()` function; no new critical issue was reported.
- `git status --short` was empty; all changes pushed through `be65f25`.

## 5. What to do next, in order

### A. Unblock deployment and finish the current vertical slice

1. Check whether the owner has now authenticated this machine's Supabase CLI as a project member. The current login showed other projects but not `tocofoxugjkaytxuxyzb`; `SUPABASE_ACCESS_TOKEN` was not set when last checked. The user was asked to log in or grant Function deploy access. Do not put a personal token in chat, the repo, screenshots or shell output.
2. Once access exists, verify the project ID and migration history, then deploy **both** functions from this branch:
   ```bash
   supabase functions deploy soflo-api --project-ref tocofoxugjkaytxuxyzb
   supabase functions deploy cron-worker --project-ref tocofoxugjkaytxuxyzb
   ```
   Keep `health` as deployed unless changed. Do not rerun migrations 001-005. Verify the deployed versions and an authorized call to each new handoff route; gateway-level 401 alone does not prove the route exists. Watch Cron and logs for two cycles. Keep the old Fastify scheduler off.
3. Retry `eas build --platform android --profile preview --non-interactive` from `apps/mobile` at current HEAD. Verify the returned build's `gitCommitHash` includes all current code, and record the build ID/artifact. If EAS credits or upload fail again, record the exact status without calling the artifact ready.
4. With an attached Android phone (`adb devices`) or owner-assisted install, test signup/confirmation/reset and the booking handoff on the installed APK over mobile data. Test one clearly marked far-future Urable booking under Ali's agreed conditions, then cancel it the same day. A successful local matcher test is not evidence that real Urable checkout links correctly. Check for duplicate Urable customers, actual `created` timestamp shape, customer/vehicle/job IDs, payment status and card redirect behavior. Treat unknown or ambiguous matches as pending, never confirmed.

### B. Complete the handbook and release QA

Follow every item in [END_TO_END_QA.md](END_TO_END_QA.md), including in-shop/mobile paths, payment history, cancellation, rebook, points/referrals/rewards, admin operations, gallery/protection, notifications, offline/errors, screen comparisons, store assets and rollback. Maintain an evidence row per real test. Request Ali's written architecture confirmation, referral amount, and decision on full payment versus deposit/fee. Obtain FCM/APNs credentials for push testing; Expo Go cannot test remote push on Android. Get client Google/Apple developer access before submission.

Resolve the handbook's promo/reward/product application at Urable checkout through a **supported** mechanism or report it as a release blocker. Do not fake discounts or charges. The handbook's Fallback C calls for a job note and manual shop application if Urable lacks a discount route; verify whether the virtual shop or API gives a supported way to attach such a note to the actual matched job. The product API currently returns gift cards rather than a usable physical product catalog.

**Scope correction:** the old `CODEX_HANDOFF.md` lists a private warranty-document bucket as unfinished. Handbook Section 4.8 requires completed protection jobs plus admin-entered product, coverage and dates. It does **not** require warranty document upload; do not build that extra feature. `docs/SUPABASE_MIGRATION_STATUS.md` and `docs/SUPABASE_SETUP.md` now reflect this.

## 6. Guardrails

- Handbook feature/scope requirements outrank concept-only screens and all earlier plans. Concept HTML determines the look of in-scope screens. Do not call the project complete until installed-app and real Urable/payment/push gates pass or are explicitly reported as release blockers.
- Do not expose the Supabase personal access token, service-role key, Urable key, Cron secret, SMTP key or admin password. Use existing ignored local environment and hosted secrets. Do not place secrets in `EXPO_PUBLIC_*` or Git.
- Live database migration 005 is already applied, while the new functions are not. Keep deployment steps sequential and verify before claiming the live booking flow works. If a permission system denies a production command, surface that reason to the owner rather than bypassing it.
- Preserve `main` and the Fastify implementation for rollback. Never run `git reset --hard`, `supabase db reset --linked`, or a legacy sync worker against the same live data. Keep branch commits small, signed if configured, and push them regularly.
- If no device or controlled checkout is available, continue independent app/admin QA and implementation, then state precisely which real-world evidence remains missing. Do not turn a mocked passing test into a “perfectly fine” claim.
