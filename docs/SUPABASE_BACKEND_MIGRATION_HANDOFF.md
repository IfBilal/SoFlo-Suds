# Claude Code handoff: move the SoFlo Suds backend into Supabase

**Prepared:** 22 October 2026

**Working branch:** `supabase-backend-migration`, branched from clean, pushed `main` at `1beb548`

**Status:** Proposed architecture change while Ali confirms whether the handbook's technology stack is fixed. This document is a handoff and execution plan, not a claim that the migration is implemented.

## 1. Your assignment

Implement and verify the SoFlo Suds backend on the existing Supabase project so an installed Android/iOS app works without a Node API running on a developer's laptop or on a separate Render/Railway server. Use Supabase Auth for customer and admin sessions, Postgres/RLS for data, Edge Functions for private Urable integration and privileged business rules, Storage for gallery files, and Supabase Cron for scheduled reconciliation/reminders. Keep Urable as the authority for customers, vehicles, services, jobs, availability, and payments. Keep Brevo for auth email through Supabase Auth's custom SMTP settings; use an HTTPS email API for any other server-generated mail if needed.

Carry the migration through the customer app, admin web app, SQL migrations, Edge Functions, tests, docs, and an installable device build. Do not stop after creating a Supabase client or a few functions. Preserve the client's approved scope and visual design. Work on this branch until Ali approves the architecture; **do not cut over or destructively alter the active Supabase project before that decision**. If Ali rejects the change, `main` remains the working Fastify implementation.

The user's newest instruction proposes Supabase-hosted backend logic. It overrides the handbook's **implementation choice** of a separate Node API and custom JWTs only if Ali accepts it. The handbook remains the final authority for **features, business rules, security outcomes, and acceptance**. Record Ali's decision in this document or an ADR before production cutover. If the stack is fixed, stop migration and use `main`; do not quietly ship a conflicting architecture.

## 2. Why this work is being requested

The project started as Expo React Native + Fastify + Supabase PostgreSQL/Storage + Urable. The phone calls `EXPO_PUBLIC_API_URL`, currently a local `:3000` URL. Expo Go first failed because the app used SDK 58 and the installed client used SDK 57. The app was moved to SDK 57 (`fabbd13`). A missing `ExpoTopicSubscriptionModule` crash in Expo Go was handled by loading push code only in a suitable build (`7fc92e9`). Signup then failed because `localhost:3000` on a phone means the phone, not the computer. The local test URL was changed to the computer's Wi-Fi address, and the setup example was corrected (`1beb548`). That address is only a development workaround: an APK sent to another person needs a publicly reachable backend.

The user has built previous React Native apps with direct Supabase access and wants this app to avoid operating a separate API host. The proposed target still has server-side code, but it runs as Supabase Edge Functions. The Urable key must remain private; “fully Supabase” means **our backend runtime is Supabase-hosted**, not that Urable or Brevo cease to exist. The Vite admin frontend still needs static hosting for other people to open it; static hosting is separate from operating a Node API.

## 3. Sources and authority

Read these before editing:

1. [`docs/SoFlo Suds - Developer Handbook.pdf`](SoFlo%20Suds%20-%20Developer%20Handbook.pdf), especially §§1.3, 2–4, 5.1–5.3, 6–9. Section 2 currently sketches a Node API (Express **or** Fastify), custom JWTs, and Render/Railway hosting. The user's proposed Supabase switch conflicts with those architecture choices; it does not waive the feature list.
2. [`docs/CONCEPT_TO_PRODUCT_SPEC.md`](CONCEPT_TO_PRODUCT_SPEC.md) and `docs/soflo.html` for the in-scope UI. Keep the existing branded screens, typography, colors, spacing, and behaviors. Do not introduce concept-only features.
3. [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and [`docs/BUILD_STATUS.md`](BUILD_STATUS.md) for known gaps. Both describe the old API architecture; update them after migration instead of treating them as proof of completion.
4. [`docs/urable/API_TEST_RESULTS.md`](urable/API_TEST_RESULTS.md) for what the public Urable API actually does. Do not infer availability or card checkout endpoints.
5. [`docs/SUPABASE_SETUP.md`](SUPABASE_SETUP.md) for the connected project and current access boundary. It must be rewritten for direct authenticated access.
6. [`docs/visual-validation/README.md`](visual-validation/README.md) for prior concept comparisons. A backend migration must not regress the UI.

Use current official Supabase/Expo documentation to verify commands and APIs before implementation. Particularly relevant: [React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [Edge Function auth](https://supabase.com/docs/guides/functions/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), [Cron](https://supabase.com/docs/guides/cron), [Auth custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), and [native auth deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

## 4. Current repository and verified state

| Area | Current implementation | Migration consequence |
| --- | --- | --- |
| Mobile | `apps/mobile`, Expo Router, Expo SDK 57, React Native, TanStack Query, `apps/mobile/lib/api.ts`, `apps/mobile/lib/session.tsx` | Replace custom API tokens/sessions with Supabase Auth. Preserve screen components and query keys where possible. |
| Admin | `apps/admin`, Vite/React; one file `src/main.tsx` contains custom API fetch, login, and screens | Replace custom admin JWT and API URL; preserve the admin UI and required CRUD behavior. |
| Node API | `apps/api`, Fastify routes in `src/routes/{auth,customer,admin}.ts`, Urable client in `src/urable`, cron logic in `src/jobs`, push in `src/notifications` | Treat as executable reference until feature parity is proven. Port rules to Edge Functions and SQL, then retire it. |
| DB | Active Supabase project `tocofoxugjkaytxuxyzb`; `apps/api/sql/001_initial.sql` created 20 app tables | Existing table primary keys and FKs must survive; add migrations, never rewrite migration 001 in place. |
| Access | All 20 tables have RLS enabled with **no anon/authenticated policies**. Dedicated `soflo_api` server role bypasses RLS. | Direct client queries will currently return no rows. Add only narrowly scoped policies after a table-by-table security review. |
| Storage | Public `gallery` bucket, JPEG/PNG/WebP, 10 MB; current uploads go through `/admin/uploads/gallery` with service-role key | Add admin-only upload/update/delete policies or an authorized function; public gallery reads still require `gallery.published` filtering. |
| Auth | Custom `users.password_hash`, `refresh_sessions`, `password_resets`, `admins.password_hash`, JWTs in `apps/api/src/auth.ts` | Supabase Auth identity must be mapped to existing app `users.id`/`admins.id`; revoke legacy sessions at cutover. |
| External services | Urable API key in ignored local `apps/api/.env`; Brevo SMTP also local; Expo push server call in Node | Move secrets to Supabase secret settings / Auth SMTP. Never put them in Expo/Vite public variables. |
| Tests | `npm run typecheck`, `npm run build`, `npm test --workspace @soflo/api`, Android JS export passed before migration | Add SQL/RLS/Edge Function/customer/admin/device verification, not only compilation. |

No production-ready APK, completed paid Urable booking linkage, FCM/APNs setup, or store submission has been demonstrated. Previous live signup/login/vehicle API checks used marked QA records and were cleaned up. **Audit the actual live tables before assuming there are no real users or admin records.** Do not print credentials or personal data into logs or this file.

## 5. Target architecture and boundaries

```text
Expo customer app ── Supabase Auth (email/password, reset, session)
                 ├─ Supabase Data API with customer RLS (approved own/read-only data)
                 ├─ Supabase Edge Functions (Urable, account orchestration,
                 │   booking, rewards, reviews, push-token actions)
                 └─ Supabase Storage read for published gallery images

Vite admin web ───── Supabase Auth (invited/seeded admin, no public admin signup)
                 ├─ Supabase Edge Functions (privileged CRUD, audit, push)
                 └─ Supabase Storage (admin-authorized uploads)

Supabase Cron ─────── Edge Function(s) for paginated Urable sync and reminders
Edge Functions ────── Urable API, Expo Push HTTP API, Supabase Postgres/Storage
Supabase Auth ─────── Brevo custom SMTP for auth mail
Urable virtual shop ─ customer slot selection and card payment
```

**Hard boundaries:**

- The only public client values are project URL and publishable/anon key. Both are normal Supabase client configuration. Service-role/secret keys, database URLs, Urable key, SMTP password, Expo server credential, and any webhook secret remain server-side.
- Customer and admin calls must use a **verified Supabase Auth user identity**. Never accept `userId`, `adminId`, `urableCustomerId`, or an admin role from a request body as authority. A bearer token's presence alone is insufficient.
- Direct PostgREST access is for operations that RLS can safely express. Any Urable call, monetary/reward state change, admin mutation, or cross-table transaction belongs in an Edge Function backed by a transaction-safe SQL RPC/function where needed.
- Urable remains the authority for service price, job state, availability, payment state, and customer/vehicle records. No app screen may fabricate a booking confirmation or payment.
- RLS applies to mobile/admin clients; server-side secret clients can bypass it, so Edge Functions must enforce ownership and role checks themselves before every privileged action.
- Preserve `users.id` and all dependent foreign keys. Add `users.auth_user_id uuid UNIQUE` and `admins.auth_user_id uuid UNIQUE` for Supabase Auth mapping unless a verified, safer ID-preserving migration is available. A unique mapping is essential; never join only on email at request time.

### Execution sequence for Claude Code

| Phase | Work | Evidence to leave before advancing |
| --- | --- | --- |
| 0 | Baseline audit, account count, backup/restore proof, local or staging Supabase setup | Redacted inventory and baseline command results. |
| 1 | Additive identity mapping migrations, RLS/storage policies, SQL transaction functions | Clean local migration replay; anon/A/B/admin access matrix. |
| 2 | Customer/admin Supabase Auth and account migration path | Real-device signup/login/reset; legacy account linked without ID or Urable loss. |
| 3 | Urable Edge adapter and all customer/admin route equivalents | Contract tests for every current route and wrong-user ID. |
| 4 | Cron, sync, points, promo/referral settlement, reminders/push | Replay and partial-failure tests; no duplicate credits or messages. |
| 5 | Mobile/admin URL and token cutover, static admin build, Android/iOS development builds | Laptop-off/mobile-data test, visual regression review. |
| 6 | Ali approval, live backup, staged deployment, APK rollout, monitoring, legacy shutdown | Signed-off cutover record, rollback drill, known release blockers. |

Finish each phase in a reviewable commit and update a redacted status file. Phases may overlap in code, but their gates must be checked in order. The live Supabase project has not been designated as a disposable test environment.

### Configuration ownership

| Value | Where it belongs | Notes |
| --- | --- | --- |
| Supabase project URL + publishable/anon key | Expo `EXPO_PUBLIC_*`, Vite `VITE_*`, EAS public environment | Public client config, usable only with correct RLS and function auth. |
| Urable API key/base URL | Edge Function secrets | Base URL may be public, but keep one server adapter; key never in APK/admin bundle. |
| Supabase secret/service-role key | Supabase-managed function environment only | Do not expose, log, or use in mobile/admin. Prefer current platform-injected secret configuration. |
| Brevo SMTP credentials | Supabase Auth custom SMTP configuration | Edge Functions cannot send on SMTP ports 25/587 on the hosted platform. |
| Brevo HTTP API key, if transactional mail beyond Auth is required | Edge Function secret | Only add when a concrete non-Auth email flow requires it. |
| Expo push access credential, if configured | Edge Function secret | Device FCM/APNs credentials belong in EAS/native build setup. |
| Cron invocation credential | Supabase Vault/secret + secret-authenticated function | Never use a customer JWT or a public no-auth endpoint for scheduled mutation. |
| Legacy database URL/JWT secret/admin password | Ignored local `.env` while old API is retained | Remove from deployment only after verified cutover; never copy into public variables. |

## 6. Required read-only audit before any live change

Record a **redacted** preflight result in a new migration status file. Do not include emails, passwords, tokens, connection strings, or raw customer responses.

1. Confirm branch and clean worktree. Count active/deleted customer rows, admin rows, legacy sessions, referrals, job links, points rows, reviews, and storage objects. Confirm which are test versus real; do not infer from filenames.
2. Check Supabase Auth settings and existing Auth users, providers, email confirmation setting, site URL, allowed redirect URLs, custom SMTP, RLS grants, storage policies, and CLI project link. Do not use `supabase db reset --linked`: it drops and replays the remote schema.
3. Verify current Urable adapter methods and timeouts, tested customer/vehicle/service/job/payment shapes, and whether one user can have duplicate Urable customer records after virtual-shop checkout.
4. Create a recoverable database backup before applying any live migration. Verify that a restore can be performed in a separate local or staging database. A Git revert cannot undo database or Auth user changes.
5. Establish a local Supabase stack or a separate staging project. Do development migrations and integration tests there. Use the active project for read-only audit until the architecture decision and cutover gate are satisfied.
6. Check current official Supabase Edge Function limits. The old `syncJobsOnce` loops over **every** user; port it as bounded batches with a cursor/lease, not one long request. Hosted Edge Functions also block outbound SMTP ports 25 and 587; do not port `nodemailer` into an Edge Function.

**Gate 0:** schema/data inventory, account migration strategy, baseline tests, and rollback snapshot are documented without secrets.

## 7. Database and auth migration

### 7.1 Additive SQL migrations

Use versioned files under `supabase/migrations/` (or the repo's clearly documented migration location). Keep `apps/api/sql/001_initial.sql` as historical evidence. SQL should be repeatable in a clean local project and should not alter the active project before approval.

- Add `users.auth_user_id` and `admins.auth_user_id` with unique indexes, preserving the existing app IDs. Add useful checks for deleted users and indexes for lookup. Do not drop `password_hash`, `refresh_sessions`, or `password_resets` until cutover and retention review. If new Supabase-created profiles cannot satisfy `password_hash NOT NULL`, add a carefully staged nullable/default transition; do not write dummy plaintext or reusable hashes.
- Verify table ownership, grants to `anon`/`authenticated`, existing `soflo_api` bypass role, and RLS behavior. Default deny remains for all rows without a reviewed policy.
- Add a single profile resolution pattern: verified `auth.uid()` maps through `users.auth_user_id` to the app user ID. Customer policies must also exclude `deleted_at IS NOT NULL`.
- Start with narrowly scoped reads: own profile/points activity/redemptions/referrals/job links/push tokens where safe; active rewards, published gallery, approved reviews, and public shop config only as required. Avoid broad `USING (true)` on sensitive tables. Do not grant direct client writes to `points_ledger`, `promo_uses`, `job_sync`, `settings`, `notification_log`, `admin_audit`, or arbitrary user profile IDs.
- For account profile and notification preference writes, either use column-limited permissions/RLS or an Edge Function with explicit validation. Never allow a client to change `urable_customer_id`, `referred_by`, referral code, balance, or `auth_user_id`.
- Implement money/points/referral/admin mutations as transaction-safe Postgres functions called by authorized Edge Functions. Use unique constraints/idempotency keys and row/advisory locking as in the existing reward redemption code. `SECURITY DEFINER` functions must have a fixed empty `search_path`, schema-qualified references, restricted `EXECUTE` grants, and reviewed inputs.
- Write storage policies for admin gallery upload only, or keep upload in an admin Edge Function. Reject wrong MIME/type/size; use generated object keys; ensure published customer reads cannot see unpublished metadata. Warranty documents need a separate private bucket and signed access if implemented.
- Add SQL/RLS tests for anon, customer A, customer B, deleted customer, active admin, inactive admin, and service/secret context. Test both REST reads and attempted writes, not only policy definitions.

Use this table inventory to make an explicit allow/deny decision for **every** existing table. The “direct client” column is a starting design, not an instruction to grant all listed access automatically:

| Existing table | Intended direct client access | Server/function boundary |
| --- | --- | --- |
| `users` | Customer read of own non-sensitive profile columns; narrow validated preference/profile write if policy can enforce columns | Signup link, Urable ID, referral attribution, deletion/anonymization. Avoid exposing `password_hash` via a broad row select. |
| `refresh_sessions`, `password_resets` | None | Legacy only; freeze, revoke, then retire after cutover. |
| `admins` | None | Active admin lookup by verified Auth UID. Never expose password hash. |
| `job_sync` | Own read if necessary | Sync/paid markers and status writes only from trusted function. |
| `booking_idempotency` | None | Trusted booking action only. |
| `settings` | Only selected public shop config, preferably a safe view/function | Admin writes and reward rules. |
| `promo_codes`, `promo_uses` | At most a safe eligibility result, not raw usage of other users | Reservation, application, release, count limits. |
| `points_ledger` | Own read, never write | Credits, reversals, redemption debit. |
| `rewards`, `reward_redemptions` | Active rewards read; own redemption read | Admin reward edits and atomic redemption issuance/use. |
| `referrals` | Own status/count, with no unrelated customer PII | Create/settle/reject and abuse checks. |
| `reviews` | Published/visible reviews read, own review read | Completed-job eligibility and one-review write; admin moderation. |
| `gallery` | Published items read | Admin metadata writes and Storage upload. |
| `warranties` | Own joined records only if ownership can be proven in SQL; otherwise function result | Admin verification against Urable customer/vehicle/completed job. |
| `shop_products` | Active products read | Admin writes; never use display price as payment authority. |
| `push_tokens` | Possibly own token registration through validated function only | Removal, invalidation, push fan-out. |
| `notification_log` | At most own history if required | Send idempotency, promo cap, receipts. |
| `admin_audit` | None | Trusted admin mutation writes and owner review. |

PostgREST can expose **all columns** of a permitted table unless grants/views are designed carefully. Prefer a safe view or Edge Function for `users` rather than giving authenticated clients a general `SELECT` that includes legacy password hashes. Verify that server-side functions using the service role do not accidentally return raw rows.

### 7.2 Customer Supabase Auth

- Replace custom `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot`, `/auth/reset` with Supabase Auth flows while keeping the current screens' design and errors. Configure native deep link `soflosuds://...` and approved redirect URLs for password recovery; verify a real email round trip.
- Keep name, email, phone, password, optional referral code inputs. After a successful Auth signup/session, call an authenticated, **idempotent** profile-completion function that validates the referral, creates or locates the Urable customer, creates the app `users` row, and records the referral. A partial Urable or DB failure must have a documented retry/recovery path and must not create duplicate Urable customers on every retry.
- Handle the actual project's email-confirmation setting. If verification is enabled, Auth may return no usable session until confirmation; show a branded pending/verify state, then complete the profile after the user returns. Do not assume immediate login. Do not silently turn off verification without recording the decision.
- For existing users, preserve app rows/IDs and Urable links. Determine the live account count first. If supported, use an official safe migration path; otherwise create/invite Auth identities and send password setup/reset links. Do **not** copy bcrypt hashes into a client, assume Supabase accepts them, or ask users for plaintext passwords. Run one account through login, app data, logout, reset, deletion before bulk migration.
- Use official React Native session persistence for SDK 57 with compatible packages. Supabase's current quickstart uses AsyncStorage and auto-refresh; if retaining encrypted storage, account for SecureStore's item-size limit rather than storing a large session JSON naively. Handle app foreground/background and session refresh. Remove the old custom access/refresh keys only after a verified new login path; clear both on migration logout.
- Account deletion must anonymize the app profile, remove push tokens, revoke/disable the Supabase Auth identity, and preserve legally retained Urable records. A service-role Auth deletion must be in an authenticated Edge Function after resolving the caller; never expose the admin auth API to the app. Test what happens to already issued access tokens until expiry.

### 7.3 Admin Supabase Auth

- No public admin signup. Create/invite approved admins via privileged setup. Map each Auth ID to an active `admins` row; keep `admins.id` for `admin_audit` FKs. Do not confer admin rights based on email domain, email equality alone, untrusted metadata, or a client-supplied role.
- Every admin Edge Function action must resolve the verified Auth user, find an active admin mapping, validate input, perform the operation, and insert an audit row. Deactivating an admin must block subsequent function calls even if an Auth JWT remains unexpired.
- Replace the Vite admin app's custom token/sessionStorage and `/admin/login` flow with Supabase Auth. A static admin site can be hosted separately; no Node process should be needed to serve its backend.

**Gate 1:** two customer accounts and one admin authenticate through Supabase; no cross-account data can be read or changed; legacy user IDs/Urable links remain intact; password recovery and deletion work on a device.

## 8. Edge Function migration map

Minimize UI churn with a stable, typed client wrapper, but do not make an Edge Function a blind SQL proxy. A path-preserving `soflo-api` function (for example `/functions/v1/soflo-api/vehicles`) is acceptable if it explicitly routes, validates methods/inputs, authenticates each call, and dispatches to small domain modules. Separate a public/health function and a secret-only scheduled worker. If current Supabase SDK/CLI routing prefers another layout, document the chosen URL contract and update all call sites.

| Existing Fastify routes / code | Destination | Mandatory behavior |
| --- | --- | --- |
| `/config`, `/services`, `/services/:id`; `customer.ts` | Read-only SQL for approved config; authenticated Edge Function for Urable catalog | No Urable key in client; prices/service visibility match Urable; preserve catalog mapping and safe caching. |
| `/vehicles` GET/POST, `/vehicles/:id` PATCH/DELETE | Authenticated Urable Edge Function | Resolve caller's Urable customer ID server-side; verify vehicle ownership before edit/delete; block delete for active booking. |
| `/bookings`, `/bookings/:id`, `/bookings/:id/cancel`, `/payments` | Authenticated Urable Edge Function | Check Urable customer ownership on every ID read/mutation; preserve status/payment semantics and error codes. |
| `/rewards`, `/rewards/:id/redeem`, `/me/points`, `/me/referral` | RLS reads plus transaction-safe redemption function/RPC | Never trust client balance; atomic nonnegative redemption and unique ledger source. |
| `/protection` | Edge Function joining Urable completed jobs/vehicles with warranties/settings | A customer must see only owned vehicle/job records, even with guessed IDs. |
| `/shop/products`, `/gallery`, `/reviews`, `/bookings/:id/review` | RLS for safe reads; Edge Function for Urable product fallback and review eligibility/write | Keep published/visible filtering; review only an owned completed job once. |
| `/me`, `/me` PATCH/DELETE, `/me/push-token` | Profile policies or authenticated Edge Functions | Protect immutable IDs and account deletion; bind push token to verified user. |
| `/admin/dashboard`, `/admin/customers*`, `/admin/promos*`, `/admin/rewards*`, `/admin/redemptions*`, `/admin/referrals`, `/admin/reviews*`, `/admin/gallery*`, `/admin/protection*`, `/admin/shop-products*`, `/admin/settings`, `/admin/push*` | Admin-authenticated Edge Function modules + SQL/storage | Preserve validation, active-admin check, audit, search, upload, warranty verification, opt-in and promo push cap. |
| `apps/api/src/urable/client.ts`, `booking-handoff.ts` | Shared Edge Function server-only Urable adapter | Port typed mapping, timeouts, errors, safe retry behavior, URL building, and ambiguity checks; keep one adapter. |
| `apps/api/src/jobs/sync.ts`, `notifications/push.ts` | Secret-authenticated scheduled Edge Function(s), SQL RPCs, Supabase Cron | Paginate, lease work, idempotent status/points/reminders, no duplicate pushes, inspect Expo tickets/receipts and invalid tokens. |

Preserve the existing `{ error: { code, message } }` convention or adapt the mobile/admin wrappers in one place. Never display raw Urable/Supabase errors, tokens, or customer addresses. Validate request bodies server-side; `zod` is usable in Edge Functions if supported by the current runtime. Add CORS for the approved admin static origin and handle OPTIONS; mobile CORS assumptions are different from browser admin calls. Verify current Supabase Function auth header format: a signed-in user JWT belongs in `Authorization`, and the public project key belongs in `apikey`.

Do not copy `pg` pooled Node code or the Fastify server into the Deno Edge runtime and assume it works. Port the behavior into Fetch handlers plus `supabase-js`/SQL RPCs; test the runtime locally. Do not disable JWT verification for customer/admin functions to make calls pass. A cron function should require a server secret/key and never accept customer JWTs as scheduler authority.

## 9. Booking, payments, points, and notifications: special gates

### Booking/payment

The repo currently has a branded handoff to Urable's virtual shop (`apps/mobile/lib/urableBooking.ts`, `UrableBookingWebView`), but **not** a proven full native booking/quote/payment flow. The public Urable API created/cancelled a test job but did not expose a supported availability endpoint or hosted checkout URL for API-created jobs. `POST /v1/payments` records a payment already taken; it does not charge a card. The virtual shop shows a slot picker and a Payment step; actual paid checkout and reliable return-to-account linkage remain unverified.

- Preserve the current virtual-shop handoff while migrating the backend. Do not present “booking confirmed” until a job is unambiguously matched to the authenticated user's Urable identity and payment state is verified.
- Port and extend `booking-handoff.ts` with tests for duplicate Urable customer emails, ambiguous jobs, delayed jobs, abandoned checkout, repeated callbacks/polls, and wrong-user IDs. Never call private browser endpoints as a substitute for a documented Urable API.
- Implement the handbook's missing quote/booking/promo/reward/product path only when Urable supports the exact charging and identity linkage. Keep all discounts and points authoritative on the server. Record the precise blocker where the API cannot apply them; do not fake a success or mark a feature complete.
- Any live test booking must follow the handbook's marked-test/far-future/same-day-cancel rules and approved payment conditions. Do not make a real charge just to finish a test.

### Points/referrals/promo

- `points_ledger` remains append-only. Award once for completed **and paid** Urable jobs; unique `(user_id, reason, source_key)` must prevent duplicate credits. Use a transaction for marker + ledger, and a compensating entry for refund/reversal.
- Reward redemption must lock or serialize per user, check a current server-computed balance, issue one unique code, and insert the negative ledger entry atomically.
- Referral attribution happens once at signup, and rewards only after the referee's qualifying first completed paid job; validate self/duplicate abuse conditions from the handbook.
- Promo reservation/consume/release and first-booking/per-user/total limits require server-side transactions; never let a client write promo usage directly.

### Sync/push/reminders

- Use Supabase Cron to invoke a **secret-authenticated** Edge Function. Separate a small dispatcher from bounded worker batches if needed; store cursor/lease/checkpoint and expose run counts/errors. Maintain the current five-minute intent and shop timezone, while ensuring a slow Urable call cannot time out the whole run.
- `notification_log` and `job_sync.reminder_sent_at` are idempotency markers. Respect appointment/promo preferences and max one promo push per user per day. Handle invalid Expo tokens and push receipts.
- Expo Go on Android SDK 57 cannot test remote push. Use a development build with FCM/APNs credentials for device verification. Keep the existing lazy notification import behavior until the native build is available.

**Gate 2:** all old routes used by the current app/admin have a working Supabase-hosted equivalent; own/wrong-user and duplicate-action cases pass; Urable reads are real; billing/booking gaps are reported accurately.

## 10. Client and admin cutover

1. Add typed Supabase clients for mobile and admin with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. These public values are safe to bundle; a service-role key is not. Keep local, staging, and production values distinct.
2. Replace `apps/mobile/lib/session.tsx` with Supabase Auth state and profile completion. Preserve existing `useSession()` consumers and navigation behavior. Handle loading, signed out, email verification pending, incomplete Urable link, deleted/disabled account, and expired session.
3. Replace `apps/mobile/lib/api.ts` custom refresh/SecureStore token mechanism with a single typed gateway/data layer that obtains the current Supabase session. Replace all `api()`/`endpoints` usages, including profile, vehicles, bookings, payments, rewards, protection, gallery, reviews, shop, push token, and account deletion. Keep TanStack Query invalidation correct after mutations.
4. Replace `apps/admin/src/main.tsx` custom login, `sessionStorage` JWT, and `VITE_API_URL` with Supabase Auth and function calls. Admin CRUD, gallery upload, push, audit, and owner lookup must still work. No visual redesign.
5. Update auth reset redirects and Expo `scheme`/link handling. Test link opening from real Gmail on Android and iOS rather than trusting browser simulation.
6. Do not bake `localhost`, a developer Wi-Fi IP, or `:3000` into any distributable build. The Supabase project URL and publishable key are stable endpoints; verify that the same installed APK works with the laptop off and on mobile data.
7. Configure EAS build environments for the public Supabase values. `EXPO_PUBLIC_*` are bundled at build/export time. Verify an APK's embedded values before sharing it; do not put secrets there. A release build should fail its preflight if either public value is missing or malformed.
8. Keep Expo SDK 57 package alignment while the tester uses Expo Go 57.0.9; do not mix this backend refactor with an SDK upgrade unless the current toolchain requires it. Run Expo Doctor after any package change.

**Gate 3:** mobile signup/login/reset/profile/vehicle/service/reward flows and all admin pages work without the Fastify process. An APK on a second phone uses mobile data successfully. UI screenshots show no unintended layout change.

## 11. Test plan and evidence

Run the existing checks, then add focused tests for the new trust boundaries:

```bash
npm install
npm run typecheck
npm run build
npm test --workspace @soflo/api # while legacy reference remains
npx expo-doctor            # from apps/mobile
npx expo export --platform android # from apps/mobile
```

- **Schema:** apply all versioned migrations to a clean local Supabase database; check constraints, indexes, grants, RLS, storage policies, and transaction functions. Do not use a remote reset to prove repeatability.
- **Auth:** signup (with/without referral), repeated profile completion, email already taken, bad password, session restore/refresh, logout, forgot/reset email link, deleted user, disabled admin, migrated legacy user. Test the actual email-confirmation setting.
- **Authorization:** anon cannot read app tables; customer A cannot view/edit customer B's profile, vehicles, jobs, points, push tokens, reviews, or files by guessing IDs; admin mutation rejects ordinary customer JWT; inactive admin loses access.
- **Business rules:** Urable ownership checks, canceled/ambiguous checkout, duplicate sync, paid completion credits once, unpaid completion credits zero, retry-safe redemption, first-booking/referral and promo limits, review only own completed job, warranty only verified completed Urable job.
- **Operational:** Cron runs more than once without double actions, survives partial Urable errors, resumes batches, emits redacted logs and useful run metrics. Push opt-in/cap/reminder rules work in a development build. Direct SMTP from Edge Functions is not used.
- **Release:** run against staging, install an Android APK, turn the laptop off, use mobile data, and complete a safe test account flow. Compare core UI/screens to `docs/visual-validation`. Test admin from its deployed static URL. Only then cut over the approved production project.

For every phase, leave a concise status entry with: code changed, migration applied where, test command/result, device result, remaining blocker, and exact rollback action. A passing bundle is **not** proof of runtime, payment, push, or store readiness.

## 12. Cutover and rollback

### Before cutover

- Obtain Ali's written answer about the handbook's stack requirement. Obtain approval for production Auth settings, email sender, admin identity, and controlled Urable checkout. Make a database/Storage/Auth migration backup and a list of deployed function versions.
- Audit existing customer/admin accounts and select a supported password migration or reset invitation path. Notify affected users only through approved channels; do not silently invalidate a real account.
- Deploy additive schema and functions to staging, run all gates, then to active Supabase. Keep the legacy API available during a short verification window if real users exist. Do not allow two writers to award points/send reminders at once; disable the old scheduler before enabling Supabase Cron.
- Switch staging app/admin to Supabase endpoints, then build a new production APK/admin static bundle with production public values. Verify signup on mobile data before distribution. Keep old builds' API compatibility in mind: an already distributed APK pointing to the old API will not magically retarget itself.

### If Ali rejects the change or a gate fails

- Return to `main` at `1beb548` or its newer approved Fastify commits. Do not merge this branch. Restore old app/admin build configurations; keep or redeploy the old API and its scheduler as needed.
- **Do not run `git reset --hard` against shared work or assume Git reverts cloud state.** Disable new Supabase Cron schedules and Edge Functions, revoke new secrets if exposed, and apply a reviewed reverse migration only where it preserves data. Additive `auth_user_id` columns/policies may safely remain temporarily; destructive rollback needs a verified backup and account mapping review.
- If the new Supabase Auth has been used by real customers, preserve those identities and their profile mappings; plan a supported transition rather than deleting accounts to “roll back.”

**Final completion criterion:** Ali accepts the architecture; all required screens and admin operations work against Supabase-hosted backend logic; no customer/admin call depends on `apps/api` at runtime; Urable secrets are server-only; ownership and RLS tests pass; scheduled work is reliable; a second device can use the installed APK away from the developer network; known booking/payment/push gaps are either genuinely closed with evidence or explicitly reported as release blockers. Do not call the project fully complete while those gates remain open.

## 13. Inputs and handoff output expected from Claude Code

Use existing repo access and local ignored credentials only where authorized. Never copy `.env` values, the personal Supabase access token, Urable key, database passwords, service-role key, SMTP key, or customer PII into Git, a PR, logs, screenshots, or this document. If access to a separate staging project, Expo/EAS project, FCM/APNs, or an approved payment test is missing, finish all independent implementation and tests, then report the exact missing input and the command/UI step it blocks.

Deliver on the migration branch:

1. Versioned SQL/RLS/storage changes and local verification scripts.
2. Supabase Edge Functions with shared Urable adapter, auth/role checks, business transactions, scheduled jobs, and typed error contract.
3. Mobile and admin clients using Supabase Auth/functions with the same approved visual design.
4. Tests and evidence for cross-account isolation, idempotency, existing-user migration, email/deep links, second-phone APK, admin, and scheduled work.
5. Updated README, Supabase setup, build status, deployment/cutover runbook, and a list of any unresolved Urable/approval blockers.
6. Small reviewable commits pushed to the branch. Keep `main` untouched until Ali approves and the gates pass.

### Suggested opening prompt for Claude Code

> Work from `docs/SUPABASE_BACKEND_MIGRATION_HANDOFF.md` on branch `supabase-backend-migration`. Read the handbook and linked repo docs first. Implement the migration in small, tested commits, preserving the handbook's feature scope and the concept app's UI. The architecture switch is provisional pending Ali's answer: develop locally or in staging, and do not cut over the active Supabase project or real users until approval. Report evidence and blockers at each gate; do not claim completion from compilation alone.
