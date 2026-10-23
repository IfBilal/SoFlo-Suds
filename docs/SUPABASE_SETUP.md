# Supabase setup for SoFlo Suds (Supabase-hosted backend)

> This describes the deployed architecture on the `supabase-backend-migration` branch. Ali accepted it verbally; written confirmation is pending ([ADR 0001](adr/0001-supabase-backend.md)). `main` retains the Fastify implementation. Migrations 001-005 are applied to the active project; the booking handoff function update still awaits deployment access (HTTP 403 from the current CLI account). See [migration status](SUPABASE_MIGRATION_STATUS.md).

Backend runtime = Supabase: Auth (customers and admins), Postgres + RLS, Edge Functions (`soflo-api`, `cron-worker`, `health`), Storage (`gallery`), Cron. Urable stays the authority for customers, vehicles, services, jobs and payments. Brevo stays the sender for Auth mail through Supabase's custom SMTP.

## 1. What is public and what is secret

| Value | Where | Public? |
| --- | --- | --- |
| Project URL + publishable key | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes. Only useful through RLS and signed-in function calls |
| `URABLE_API_KEY` (+ optional `URABLE_BASE_URL`) | `supabase secrets set` | **Secret** |
| `CRON_SECRET` (32+ random chars) | `supabase secrets set` and Vault (`soflo_cron_secret`) | **Secret** |
| `ADMIN_ORIGINS` (comma list, e.g. `https://admin.example.com`) | `supabase secrets set` | Config |
| `EXPO_ACCESS_TOKEN` (optional, Expo push) | `supabase secrets set` | **Secret** |
| Service-role key, `SUPABASE_DB_URL` | Injected into functions by the platform; also needed in your shell for `scripts/supabase/*.mjs` | **Secret**, never in Expo/Vite |
| Brevo SMTP | Dashboard → Authentication → SMTP Settings | **Secret** |

Hosted Edge Functions cannot open SMTP ports 25/587, so no `nodemailer`: Auth mail goes through the Auth SMTP setting.

## 2. Local verification (no Docker needed)

```bash
npm install
npm run test:backend      # SQL replay + RLS matrix (PGlite) and Edge Function contract tests (Deno)
npm run check:functions   # Deno type-check of the three functions
```

`test:db` replays every migration in `supabase/migrations` on PGlite (in-process Postgres) and runs the anon / customer A / customer B / deleted / admin / service-role matrix. `test:functions` runs the real function handlers against that same schema over a Postgres socket, with Urable, Auth, Storage and Expo faked. PGlite is a single-connection engine: it proves SQL semantics and the replay, **not** concurrency under load or platform behaviour. To run the full stack, start Docker and use `supabase start` (config in `supabase/config.toml`).

## 3. Reproduce in a staging project

```bash
supabase login
supabase link --project-ref <STAGING-REF>
supabase db push                                   # applies supabase/migrations/*
supabase secrets set URABLE_API_KEY=... CRON_SECRET=... ADMIN_ORIGINS=https://<admin-host>
supabase functions deploy soflo-api cron-worker health
```

Dashboard settings to apply on staging, then record the final choices in the status file:
- **Authentication → Providers → Email**: decide *Confirm email*. The code supports both; with it on, signup shows a "check your email" screen and the profile is completed at first login.
- **Authentication → URL Configuration**: Site URL; redirect allow-list `soflosuds://reset`, `soflosuds://**`, and the admin origin.
- **Authentication → SMTP Settings**: Brevo host/port/user/password, approved sender.
- **Authentication → Sign In / Providers**: disable public signups only if admin invites are used for a closed beta; customers need signup on.
- Extensions: `pg_cron`, `pg_net`, `supabase_vault`; then run `supabase/cron/schedule.sql` by hand.

Create the first admin (no public admin signup exists):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='at-least-12-chars' \
  node scripts/supabase/bootstrap-admin.mjs
```

## 4. Existing customers

Passwords cannot be moved (Supabase Auth does not accept our bcrypt hashes and no plaintext exists). `scripts/supabase/migrate-legacy-users.mjs` creates a passwordless, pre-confirmed Auth identity per legacy customer and sets `users.auth_user_id`, keeping every `users.id`, Urable link, point, redemption and referral. Customers then choose a password through **Forgot password**. Dry run is the default; do one account (`--apply --limit 1`) end to end before the rest. The active project audit found no preexisting users, so this script was not run there.

## 5. Access model (summary)

Default-deny on all tables. Direct client reads exist only for: own `users` columns (no hash/Urable id), own `points_ledger` and `reward_redemptions`, active `rewards`, published `gallery` columns and active `shop_products` columns, plus the `shop_config()` RPC. Everything else, and every write, goes through `soflo-api`, which resolves the caller from the server-verified Auth user (`users.auth_user_id` / active `admins.auth_user_id`) and never from request bodies. Business transactions live in `soflo_private.*` SQL functions callable only by `service_role`. The details and tests are in `supabase/migrations/` and `supabase/tests/`.

## 6. Storage

Public `gallery` bucket (JPEG/PNG/WebP, 10 MB). Clients have no write policy; admin uploads go through `POST /admin/uploads/gallery`, which checks the file's magic bytes and generates the object key. Warranty documents (a private bucket with signed URLs) are still not implemented.
