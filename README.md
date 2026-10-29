# SoFlo Suds customer app

Expo/React Native customer app, Supabase backend, and React/Vite web admin. The [Developer Handbook](docs/SoFlo%20Suds%20-%20Developer%20Handbook.pdf) decides scope. The [concept-to-product specification](docs/CONCEPT_TO_PRODUCT_SPEC.md) documents the client HTML's design and interaction language. The [implementation plan](docs/IMPLEMENTATION_PLAN.md) has the delivery sequence and exit gates.

## Current state: 24 October 2026

Everything in handbook Section 1.3 that does not depend on the client or Ali is built and tested, on `main`. Customer app (Android, tested on a real phone), owner admin (https://soflo-suds.vercel.app, tested in a real browser), and the Supabase backend (Auth, RLS, Edge Functions `soflo-api` and `cron-worker`, pg_cron, Storage) with the server-only Urable adapter are live. `npm run test:backend` runs the SQL/RLS tests (PGlite), the Edge Function tests (Deno, with a fake Urable) and the app tests; `scripts/qa/live-e2e.mjs` runs the same flows against the real project and real Urable (test records only, cancelled afterwards).

How the handbook's Urable fallbacks are used:
- **Booking and payment (Fallback A and B):** date/time, address and payment happen in Urable's own booking page, opened in a branded in-app WebView. The new job is then read back and linked to the customer. "Paid" is shown only when Urable reports it.
- **Promo codes and rewards (Fallback C):** applied as a real discount on the Urable invoice, and written to the job notes for the shop.
- **Shop:** Urable has no products besides gift cards, so products live in `shop_products` (admin-managed). A product linked to a Urable product (`urable_product_id`) becomes an invoice line; others go in the job notes.

Differences from the handbook text: the backend is Supabase (Postgres, Edge Functions, Auth) instead of a Node + Prisma server, because Ali approved that stack. `apps/api` is the old Fastify version, kept only until cutover.

Still open and dependent on others: Apple/Play accounts and store submission (Milestone B), the iOS build, the client's real shop details, products and warranty data, the client's own Firebase project, and one real paid and refunded test job to confirm Urable's refund wording (any status containing "refund" already reverses points). See [migration status](docs/SUPABASE_MIGRATION_STATUS.md), [setup](docs/SUPABASE_SETUP.md), the [cutover runbook](docs/SUPABASE_CUTOVER_RUNBOOK.md), [ADR 0001](docs/adr/0001-supabase-backend.md) and the [QA sequence](docs/END_TO_END_QA.md).

## Repository

- `apps/mobile` — Expo Router customer app with supplied logo, Oxanium/Goldman fonts, concept palette and handbook navigation.
- `supabase` — migrations, Edge Functions, server-only Urable adapter and Cron worker.
- `apps/api` — legacy Fastify implementation retained for rollback/reference only; remove at cutover.
- `scripts/qa` — live end-to-end check, QA seed/cleanup and a settings helper (they need the service key in `apps/api/.env`; never commit it).
- `apps/admin` — owner web app for handbook admin screens. The customer app has no owner mode.
- `docs/concept` — rendered phone references and concept image assets.
- `docs/urable` — redacted Urable test evidence; no API key.

## Local setup

1. `npm install`
2. Follow [Supabase setup](docs/SUPABASE_SETUP.md) for project configuration and server-only secrets.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and `apps/admin/.env.example` to `apps/admin/.env`; fill in the public Supabase URL/key and virtual-shop URL. Put the Urable key only in Supabase Function secrets.
4. Start mobile and admin separately:

```bash
npm run dev:mobile
npm run dev:admin
```

The mobile app calls Supabase directly over HTTPS; it does not need a laptop-hosted API. The Urable key must never go in `EXPO_PUBLIC_*` or the repository.

The mobile app uses Expo SDK 57 for Expo Go 57.x on Android. After changing SDK versions, stop any running Expo server and restart it with `cd apps/mobile && npx expo start --clear` before scanning the QR code again.

## Build and release

- Android APK: `cd apps/mobile && npx eas-cli build --platform android --profile preview` (package `com.soflosuds.app`, EAS project `@bilal06/soflo-suds`). Store builds use `--profile production` once the client's Play/Apple accounts exist.
- Edge Functions: `soflo-api` (needs a user JWT), `soflo-auth` (public, rate-limited login; deploy with `--no-verify-jwt`) and `cron-worker`.
- Admin: `npm run build -w apps/admin`, then deploy the output to Vercel (Git builds are disabled by `vercel.json`).
- Database: migrations in `supabase/migrations` are applied in order (each has a rollback in `supabase/rollback`; `supabase/tests/rollback.test.ts` drills them). Functions: `supabase functions deploy soflo-api` and `cron-worker` with `--use-api`.
- Settings the owner can change without a new build (admin > Settings): shop address/phone/email, mobile area text, reminder hour, cancellation window, minimum app version, maintenance message, Home promo banner, points per dollar, referral reward and monthly cap, protection categories.

## Checks

```bash
npm run typecheck
npm run build
npm run test:backend   # Supabase SQL/RLS + Edge Function tests
npm run check:functions
```

Typecheck/build success confirms compilation only. End-to-end booking/payment, push and store release require the live checks in the handbook and [setup guide](docs/SUPABASE_SETUP.md).

## Source rules

- Handbook Section 1.3 is the exact feature list. Memberships, chat, live van tracking, partner ads, shipping, independent product checkout and concept-only owner CRM are excluded.
- The client's `docs/soflo.html` decides overlapping visual treatment: black canvas, cyan/magenta accents, supplied logo, Oxanium body and Goldman display type, rounded bordered cards, chip/tabs, service imagery and interaction feedback.
- Urable owns customers, vehicles, services, jobs and payments. Supabase owns app auth, rewards, referrals, promos, reviews, gallery, warranty metadata, settings and notification state.
- Never present demo data as a real booking, payment, reward or protection record. Confirmation follows a verified Urable job and payment state.
