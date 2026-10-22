# Supabase setup for SoFlo Suds

The handbook is the scope authority. This project uses a Supabase PostgreSQL database and Supabase Storage. The API owns access to both. No Supabase service-role key or database password belongs in the mobile/admin bundles.

## 1. Project and connection status

The active `SoFlo-Suds` project (`tocofoxugjkaytxuxyzb`) was connected on 22 October 2026. The 20 app tables and seed settings were applied, row-level security is enabled on all 20 tables with no direct-client policies, and the public `gallery` bucket was created with JPEG/PNG/WebP and 10 MB limits. A dedicated `soflo_api` role has only runtime table permissions and bypasses RLS for the server. The local connection and service-role key are stored in ignored `apps/api/.env`; the personal access token is outside the repository. A live anonymous PostgREST read of the seeded `settings` table returned zero rows, while the server role read three, confirming the intended access boundary. Keep test and production separate before releasing customer data.

Codex's `supabase-soflo` MCP connection is scoped to this project and uses a local credential helper. MCP `list_tables` and `list_storage_buckets` both succeeded after setup. The helper and token live under `~/.config/soflo-suds/`, outside the repository.

## 2. Set server environment

Copy `apps/api/.env.example` to `apps/api/.env` and fill in at least:

```text
DATABASE_URL=postgresql://...
DATABASE_CA_CERT_PATH=/absolute/path/to/supabase-ca.crt
JWT_SECRET=<at least 32 random characters>
URABLE_API_KEY=<current SoFlo Suds key>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only key>
ADMIN_ORIGIN=http://localhost:5173
ADMIN_EMAIL=<owner admin email>
ADMIN_PASSWORD=<temporary strong password, 12+ characters>
```

The API loads `.env` automatically. The file is ignored by Git. `EXPO_PUBLIC_*` values are visible in the compiled app, so never put API/database/service-role secrets there. For Supabase pooled PostgreSQL, download its CA certificate from the project Database settings and set `DATABASE_CA_CERT_PATH`; the API verifies the TLS chain. The configured runtime connection uses the documented shared transaction pooler and the `soflo_api.<project-ref>` username.

## 3. Apply schema and bootstrap admin

```bash
npm install
npm run migrate --workspace @soflo/api
npm run bootstrap:admin --workspace @soflo/api
```

The current project already has migration 001 applied. For a fresh project, `migrate` applies `apps/api/sql/001_initial.sql` only when `DATABASE_URL` uses a privileged migration role; the least-privilege runtime role cannot perform DDL. Schema changes after first deployment need versioned migrations; do not edit a deployed migration in place. `bootstrap:admin` creates or resets the configured admin login. Remove `ADMIN_PASSWORD` from persistent server env after bootstrapping if the hosting process does not need it.

## 4. Storage buckets

The **public** `gallery` bucket now exists with JPEG, PNG and WebP uploads limited to 10 MB. Admin uploads flow through `/admin/uploads/gallery`, which authenticates the admin and uses the server-side service-role key. The customer app only reads published gallery URLs.

Create a **private** `warranty-documents` bucket when warranty document upload is enabled. The current implementation stores warranty text/dates but does not upload or serve private warranty files yet. Do not place private documents in the public gallery bucket.

## 5. Customer app and admin URLs

Copy `apps/mobile/.env.example` to `apps/mobile/.env`. Set `EXPO_PUBLIC_API_URL` to the HTTPS API URL for a physical phone; `localhost` on a phone means the phone itself. For Android emulator local testing, `http://10.0.2.2:3000` reaches the host API. Set `VITE_API_URL` in `apps/admin/.env` to the API URL.

```bash
npm run dev:api
npm run dev:mobile
npm run dev:admin
```

For real payment/checkout tests, use a phone build and the client's approved test conditions. A browser preview alone does not establish WebView card-authentication behavior.

## 6. Other production inputs

- Transactional email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, and `APP_RESET_URL` for password reset. Use an SMTP service with an approved sender address before testing delivery.
- Shop config: set address, phone, email, mobile area, timezone and reward values from the admin Settings screen. Do not publish blank contact details.
- Push: connect the Expo/EAS project, add Android FCM and iOS APNs credentials, then request permission in the mobile Notification settings screen. `npm run sync:once --workspace @soflo/api` is the server job to run every five minutes in a single scheduled worker.
- Store access: Apple and Google developer accounts and final privacy policy approval are needed before submissions.

## 7. First live verification

1. Run migration; bootstrap admin; sign in to admin.
2. Start API and mobile app; sign up a marked test customer. Verify the customer appears in Urable.
3. Add/edit/delete a marked test vehicle, checking Urable after each action.
4. Read the live service catalog, open an in-shop and mobile booking handoff, and verify the Urable time-slot/payment UI.
5. Complete one approved future test booking only when a test payment path is agreed, then verify same-account booking linkage and payment state. Cancel the test as appropriate.
6. Test reward, review and protection behavior on a legitimately completed paid test job, then clean up or clearly tag test records.

If database or storage credentials are absent, the API health route can run but data-backed routes cannot be verified. Do not describe the project as end-to-end tested until this checklist and the handbook's Milestone A checklist pass.
