# SoFlo Suds customer app

Expo/React Native customer app, Fastify TypeScript API, and React/Vite web admin. The [Developer Handbook](docs/SoFlo%20Suds%20-%20Developer%20Handbook.pdf) decides scope. The [concept-to-product specification](docs/CONCEPT_TO_PRODUCT_SPEC.md) documents the client HTML's design and interaction language, the feature translation, and every required screen state. The [implementation plan](docs/IMPLEMENTATION_PLAN.md) has the full delivery sequence and exit gates.

## Current state — 22 October 2026

The proposed move from the Fastify API to Supabase Auth, Edge Functions, RLS and Cron is documented in the [Claude Code migration handoff](docs/SUPABASE_BACKEND_MIGRATION_HANDOFF.md) on the `supabase-backend-migration` branch. It remains provisional until Ali confirms the handbook's stack requirement; the current Fastify implementation remains on `main`.

The repository contains branded customer screens, a five-tab shell, custom auth/API routes, a Supabase-compatible PostgreSQL migration, a server-only Urable adapter, a booking handoff screen, a status/points/reminder job, and a separate admin app. Typechecks, API/admin builds and Android JS export pass. The saved HTML was rendered route by route; core concept images are in `docs/assets` and eight source captures are in `docs/concept`. The [visual validation report](docs/visual-validation/README.md) records 47 browser route checks, the corrected home hero/header/dock and remaining native review.

**This is not yet a finished customer app.** The approved SoFlo-Suds Supabase project is connected: the schema, server role, and gallery bucket are in place. The Urable runtime key is configured locally; live signup/login/session deletion, services, bookings, and vehicle CRUD API checks passed with marked QA records removed afterward. Brevo SMTP is configured locally: authentication passed and a test message was delivered to Gmail. The app's own forgot/reset flow has not yet been exercised with a real account. EAS push credentials and a physical device are not connected in this workspace. The virtual-shop checkout has not been completed with a payment, and post-checkout job linkage is not verified. Promo codes and shop products cannot yet be carried into Urable virtual-shop payment. Store submissions and an installable verified APK remain outstanding. See [build status](docs/BUILD_STATUS.md) for the exact feature-by-feature state.

## Repository

- `apps/mobile` — Expo Router customer app with supplied logo, Oxanium/Goldman fonts, concept palette and handbook navigation.
- `apps/api` — Fastify API, PostgreSQL schema, auth, Urable adapter, customer/admin routes and sync job. All Urable calls stay here.
- `apps/admin` — owner web app for handbook admin screens. The customer app has no owner mode.
- `docs/concept` and `docs/assets` — rendered phone references and concept image assets.
- `docs/urable` — redacted Urable test evidence; no API key.

## Local setup

1. `npm install`
2. Follow [Supabase setup](docs/SUPABASE_SETUP.md) for the approved database, storage bucket and server-only secrets.
3. Copy `apps/api/.env.example` to `apps/api/.env`, `apps/mobile/.env.example` to `apps/mobile/.env`, and `apps/admin/.env.example` to `apps/admin/.env`; fill in environment-specific URLs/values.
4. For a new database, apply the SQL migration with a privileged migration connection or Supabase SQL editor. The app's `soflo_api` runtime role deliberately cannot change the schema. Run `npm run bootstrap:admin --workspace @soflo/api` after setting the owner's admin email and password.
5. Start API, mobile and admin separately:

```bash
npm run dev:api
npm run dev:mobile
npm run dev:admin
```

The API loads its `.env` automatically. The mobile app must use an API URL reachable from the phone or emulator. The Urable key belongs only in `apps/api/.env` or hosting secrets, never in `EXPO_PUBLIC_*` or the repository.

For a physical Android phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to `http://<computer Wi-Fi IPv4 address>:3000` and keep the phone on the same network. Open `http://<computer Wi-Fi IPv4 address>:3000/health` in the phone browser to verify access. Restart Expo after changing the URL; `localhost` on the phone points to the phone itself.

The mobile app uses Expo SDK 57 for Expo Go 57.x on Android. After changing SDK versions, stop any running Expo server and restart it with `cd apps/mobile && npx expo start --clear` before scanning the QR code again.

## Checks

```bash
npm run typecheck
npm run build
npm test --workspace @soflo/api
npm run sync:once --workspace @soflo/api
```

The sync command needs a configured database and Urable key; run it from one scheduled worker in production. Typecheck/build success confirms compilation only. End-to-end booking/payment, push and store release require the live checks in the handbook and [setup guide](docs/SUPABASE_SETUP.md).

## Source rules

- Handbook Section 1.3 is the exact feature list. Memberships, chat, live van tracking, partner ads, shipping, independent product checkout and concept-only owner CRM are excluded.
- The client's `docs/soflo.html` decides overlapping visual treatment: black canvas, cyan/magenta accents, supplied logo, Oxanium body and Goldman display type, rounded bordered cards, chip/tabs, service imagery and interaction feedback.
- Urable owns customers, vehicles, services, jobs and payments. Our API/database own app auth, rewards, referrals, promos, reviews, gallery, warranty metadata, settings and notification state.
- Never present demo data as a real booking, payment, reward or protection record. Confirmation follows a verified Urable job and payment state.
