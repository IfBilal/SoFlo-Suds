# Supabase migration status (redacted)

Branch `supabase-backend-migration`. `main` is untouched. **Nothing in this file has been applied to the active Supabase project, no real users were migrated, and `apps/api` (Fastify) is still in the repo and unmodified.** No credentials, emails or customer data appear here.

Last updated: 22 October 2026.

## Gate summary

| Gate | State | Evidence |
| --- | --- | --- |
| 0 Baseline audit, backup/restore, staging | **Not done** | Live read-only audit was refused by the permission classifier; no staging project; Docker daemon unavailable (no sudo). Local-only baseline below |
| 1 Schema, RLS, SQL functions | **Passed locally (PGlite)** | `npm run test:db`: 51/51 |
| 2 Routes ported with own/wrong-user tests | **Passed locally (fakes for Urable/Auth/Expo)** | `npm run test:functions`: 11 tests, 42 steps. Real Urable reads **not** re-verified |
| 3 Mobile + admin without Fastify | **Builds only** | mobile typecheck + Android export, admin build. No device, no email round trip, no laptop-off/mobile-data test, no visual regression |
| 4 Cron/sync/push | **Passed locally** | replay/partial-failure/lease/cursor tests. No real Cron run, no push to a device |
| 5/6 Cutover, APK, rollback drill | **Not started** | needs Ali's decision ([ADR 0001](adr/0001-supabase-backend.md)) and staging |

## Phase log (code changed → where applied → tests → device → blocker → rollback)

**Phase 1** — `supabase/migrations/20261022000001..4`. Additive: `users/admins.auth_user_id` (unique), nullable password hashes, `soflo_private` schema, revoked all default client grants, column-limited own/public reads, `shop_config()` RPC, `complete_profile`, `redeem_reward`, `record_job` (credit-once, referral settlement for both sides, refund reversal), `delete_account`, sync lease, `push_tickets`. Applied: local PGlite only. Tests: `supabase/tests/{rls,functions}.test.ts`. Rollback: nothing deployed; if later deployed, columns/policies are safe to leave.

**Phase 2** — mobile `lib/{supabase,api,session}.ts`, signup verify screen, reset by `code`; admin `src/supabase.ts` + `main.tsx`; `POST /me/complete` (idempotent, Urable id kept in server-only `app_metadata` so retries never duplicate); `scripts/supabase/{bootstrap-admin,migrate-legacy-users}.mjs` (**syntax-checked only, never run**). Applied: none. Rollback: `main`.

**Phase 3** — `supabase/functions/soflo-api` (account, customer, admin routers), `_shared` (Urable adapter ported verbatim, handoff selector, session/role resolution, errors). Every route in `apps/api/src/routes/*` has an equivalent except `/auth/*` (Supabase Auth) and `/admin/login` (Supabase Auth); `/config` became the `shop_config()` RPC; `/admin/me` is new.

**Phase 4** — `cron-worker` (secret-authenticated; sync batch with lease+cursor, reminders, Expo receipts), `supabase/cron/schedule.sql` (manual, per environment).

## Verified commands (this machine)

```
npm run test:db          51 passed
npm run test:functions   11 passed (42 steps)
npm run check:functions  deno check OK
npm run typecheck        api, mobile, admin OK
npm run build            api, admin OK
mobile: npx expo export --platform android  OK (dummy public env)
mobile: npx expo-doctor  19/21; the 2 failures are Expo API lookups that timed out (network), not package findings
```

## Known gaps and decisions needed

1. **Live audit (Phase 0)** — counts of real users/admins/sessions/points/reviews/storage objects, Auth settings (email confirmation, SMTP, redirect URLs), extension availability, current grants/policies. Needs permission to run read-only queries against the active project (or the Supabase MCP after a restart), or a staging project.
2. **Staging** — Docker (`sudo snap start docker`) for `supabase start`, or a separate Supabase staging project (may cost money; needs approval).
3. **Gateway JWT + new key format** — `soflo-api` keeps `verify_jwt = true` as required. If the project uses the new publishable/secret key format with asymmetric JWT signing keys, the platform gateway may reject user JWTs; confirm on staging, and if so verify in-function only (already done via `auth.getUser`) and document the change.
4. **Referral reward amount** — settled from setting `referral_reward_points` (default 0 = marks rewarded, no points). Handbook amount unconfirmed.
5. **Refund handling** assumes Urable reports `paymentStatus = "refunded"`; unverified against Urable.
6. **Promo codes** are admin-managed only; reservation/consumption cannot be applied to Urable virtual-shop payments (documented API limit). Not faked.
7. **Booking/payment linkage** — `booking-handoff` selector is ported and tested but not yet exposed as a route or used by the UI (it was not wired in `main` either). Real paid checkout and return linkage remain unverified.
8. **Push** — needs an EAS project id, FCM/APNs credentials and a development build; Expo Go cannot test it.
9. **Account deletion** removes the Auth identity and anonymizes at once; already-issued access tokens stop working immediately because `soflo-api` re-checks the profile every call (tested). Tokens used directly against Supabase REST until expiry see nothing (RLS requires an undeleted profile).
10. **Visual regression** not run (needs a device or browser with a backend). UI changes: new "Check your email" state on signup only.
11. **Warranty documents** — private bucket + signed URLs still unbuilt.
12. `apps/api`, its docs and Fastify scripts remain until Ali approves; remove at cutover only.
