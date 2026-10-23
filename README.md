# SoFlo Suds customer app

Expo/React Native customer app, Supabase backend, and React/Vite web admin. The [Developer Handbook](docs/SoFlo%20Suds%20-%20Developer%20Handbook.pdf) decides scope. The [concept-to-product specification](docs/CONCEPT_TO_PRODUCT_SPEC.md) documents the client HTML's design and interaction language. The [implementation plan](docs/IMPLEMENTATION_PLAN.md) has the delivery sequence and exit gates.

## Current state — 23 October 2026

On `supabase-backend-migration`, the mobile and admin apps call Supabase Auth and the `soflo-api` Edge Function. The first four database migrations, Edge Functions and Cron are deployed to the active project. The owner admin site is hosted. Ali accepted the architecture verbally; written confirmation remains open. `main` retains the Fastify version, and `apps/api` stays in this branch as a reference.

See [migration status](docs/SUPABASE_MIGRATION_STATUS.md), [setup](docs/SUPABASE_SETUP.md), [cutover runbook](docs/SUPABASE_CUTOVER_RUNBOOK.md), and [ADR 0001](docs/adr/0001-supabase-backend.md) for the exact deployment and release gates.

The repository contains branded customer screens, a five-tab shell, Supabase Auth and Edge Functions, a server-only Urable adapter, a virtual-shop booking handoff, a status/points/reminder worker, and a separate admin app. The [visual validation report](docs/visual-validation/README.md) records browser route checks; native device review remains.

**This is not yet a finished customer app.** The new booking handoff route, app check screen and linked-job sync pass local tests; migration 005 is live, but the function update awaits a Supabase account that can deploy to this project (the current CLI account gets HTTP 403). An earlier preview APK build finished, but no Android device is connected here. Real Urable checkout/payment, signup email round trip, push delivery, native UI checks and store submissions remain unverified. Promo codes and shop products cannot yet be carried into Urable virtual-shop payment.

## Repository

- `apps/mobile` — Expo Router customer app with supplied logo, Oxanium/Goldman fonts, concept palette and handbook navigation.
- `supabase` — migrations, Edge Functions, server-only Urable adapter and Cron worker.
- `apps/api` — legacy Fastify implementation retained for rollback/reference on this branch.
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
