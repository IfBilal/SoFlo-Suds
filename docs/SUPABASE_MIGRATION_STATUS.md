# Supabase migration status (redacted)

Branch `supabase-backend-migration`. `main` is untouched. The original four migrations, three Edge Functions and Cron are live on the active Supabase project. Migration 005 (booking handoff attempts) is also live, but the updated `soflo-api` and `cron-worker` functions are **not deployed**: the available Supabase CLI account gets HTTP 403 for this project. No real users were migrated. `apps/api` (Fastify) remains in the repo. No credentials or customer data appear here.

Last updated: 23 October 2026.

The installed-app, real Urable and release checklist is in [END_TO_END_QA.md](END_TO_END_QA.md).

## Gate summary

| Gate | State | Evidence |
| --- | --- | --- |
| 0 Baseline audit, backup/restore, staging | **Audit done; backup unnecessary (no data); no staging** | Live audit 22 Oct 2026 below. Docker unavailable (no sudo) |
| 1 Schema, RLS, SQL functions | **Live; new handoff table live** | `npm run test:db`: 52/52; migrations 001-005 applied remotely |
| 2 Routes ported with own/wrong-user tests | **Local passed; handoff update awaiting deploy** | `npm run test:functions`: 14 tests, 43 steps. Real checkout still unverified |
| 3 Mobile + admin without Fastify | **Built; device proof pending** | mobile/admin typecheck pass, admin hosted; APK `ff0e7241-0875-4f4e-854a-525d83d00756` finished from `ccf4727`. Uploading a newer build stalled before EAS returned an ID. No device or email round trip |
| 4 Cron/sync/push | **Original worker live; linked-job update awaiting deploy** | Local replay/partial-failure/lease/cursor tests pass; push not proven on device |
| 5/6 Release, rollback drill | **Open** | Android real-device QA, checkout/payment proof, push credentials, store submissions and rollback drill remain |

## Live audit, 22 Oct 2026 (read-only, counts only)

Project `tocofoxugjkaytxuxyzb` is **empty**: 0 active/deleted customers, 0 admins, 0 legacy sessions, 0 referrals, 0 job links, 0 points rows, 0 reviews, 0 gallery rows, 0 push tokens, 0 storage objects, 0 Auth users, 0 RLS policies. Extensions present: `pgcrypto`, `supabase_vault`; **`pg_cron` and `pg_net` are not enabled**. Auth: email confirmation **on** (`mailer_autoconfirm=false`), **no custom SMTP**, signups open, Site URL still `http://localhost:3000`, redirect allow-list empty. Consequence: no real data to migrate or back up; applying the additive migrations carries no data risk. Auth SMTP/URLs and extensions still need configuring.

## Applied to the active project, 22 Oct 2026 (empty project, approved)

Migrations 001-004 recorded in migration history; extensions `pg_net`, `pg_cron` enabled; functions `soflo-api` (gateway JWT on), `cron-worker`, `health` deployed; secrets `URABLE_API_KEY`, `CRON_SECRET` set; Auth Site URL `soflosuds://reset`, redirect allow-list set, Brevo SMTP set, email confirmation **left on**; Cron job `soflo-worker` every 5 minutes with Vault secrets. Security advisors: no critical findings (intentional closed tables; `shop_config()` public by design; `pg_net` in `public`, low).

**Live smoke test (18/18 passed)** with marked QA accounts (placeholder Urable id, so nothing created in Urable), all removed afterward (users, admins, Auth users, audit = 0): sign-in, `PROFILE_INCOMPLETE` then idempotent `/me/complete`, `/me`, `/rewards`, `/vehicles`, customer blocked from admin, RLS own-row only and protected column denied, `shop_config`, admin `/admin/me` + dashboard, admin identity is not a customer, deactivated admin blocked at once, account deletion, deleted token rejected.

This is the historical 22 October smoke test. Since then, an owner admin was created, admin hosting was deployed, and an Android preview APK build finished. Real signup email round trip and device checks remain open.

## Phase log (code changed → where applied → tests → device → blocker → rollback)

**Phase 1** — `supabase/migrations/20261022000001..4`. Additive: `users/admins.auth_user_id` (unique), nullable password hashes, `soflo_private` schema, revoked all default client grants, column-limited own/public reads, `shop_config()` RPC, `complete_profile`, `redeem_reward`, `record_job` (credit-once, referral settlement for both sides, refund reversal), `delete_account`, sync lease, `push_tickets`. Applied to the active project on 22 October; local PGlite replay and RLS matrix pass. Rollback: leave additive tables/policies and redeploy the prior functions if needed.

**Phase 2** — mobile `lib/{supabase,api,session}.ts`, signup verify screen, reset by `code`; admin `src/supabase.ts` + `main.tsx`; `POST /me/complete` (idempotent, Urable id kept in server-only `app_metadata` so retries never duplicate); `scripts/supabase/{bootstrap-admin,migrate-legacy-users}.mjs`. The owner admin was bootstrapped. Legacy migration was not run because the live project had no users. Rollback: use the `main` client with its Fastify backend if that environment is available.

**Phase 3** — `supabase/functions/soflo-api` (account, customer, admin routers), `_shared` (Urable adapter ported verbatim, handoff selector, session/role resolution, errors). Every route in `apps/api/src/routes/*` has an equivalent except `/auth/*` (Supabase Auth) and `/admin/login` (Supabase Auth); `/config` became the `shop_config()` RPC; `/admin/me` is new.

**Phase 4** — `cron-worker` (secret-authenticated; sync batch with lease+cursor, reminders, Expo receipts), `supabase/cron/schedule.sql` (manual, per environment).

**Phase 5, 23 October** — Added `booking_handoffs` with default-deny RLS, `POST /bookings/handoff` and `GET /bookings/handoff/:id`, mobile checkout/check UI, duplicate-customer job ownership mapping, linked payment history, and linked job polling for points/status. Local tests and typechecks pass. Migration 005 was applied to the active project. Deploying the changed functions failed with Supabase HTTP 403 because the CLI login cannot access this project; until deployment, the live API returns 404 for the new handoff routes. No real booking or payment was made.
`GET /bookings/handoff/latest` and a "Check recent booking" action were added so a customer can resume an unexpired handoff after leaving the booking screen or restarting the app; this is locally tested only.
Confirmation push now waits for Urable's `paymentStatus = paid`; an unpaid matched job is displayed as payment pending. The public Urable OpenAPI lists `pending`, `unpaid` and `paid` payment states. This prevents a scheduled job created before checkout payment from being announced as a paid booking.
The updated booking browser interaction passed with mocked network responses (`node scripts/qa-booking-web.mjs` while Expo web runs on port 8082); it is not proof of a native WebView or real payment.

## Verified commands (this machine)

```
npm run test:db          52 passed
npm run test:functions   14 passed (43 steps)
npm run check:functions  deno check OK
npm run typecheck        api, mobile, admin OK
npm run build            api, admin OK
mobile: npx expo export --platform android  OK (dummy public env)
mobile: npx expo-doctor  19/21; the 2 failures are Expo API lookups that timed out (network), not package findings
```

## Known gaps and decisions needed

1. **Live audit (Phase 0)** — completed on 22 October: no preexisting app users or data. An owner admin was added later. Recheck counts before final release.
2. **Staging** — Docker (`sudo snap start docker`) for `supabase start`, or a separate Supabase staging project (may cost money; needs approval).
3. **Gateway JWT + new key format** — `soflo-api` keeps `verify_jwt = true` as required. If the project uses the new publishable/secret key format with asymmetric JWT signing keys, the platform gateway may reject user JWTs; confirm on staging, and if so verify in-function only (already done via `auth.getUser`) and document the change.
4. **Referral reward amount** — settled from setting `referral_reward_points` (default 0 = marks rewarded, no points). Handbook amount unconfirmed.
5. **Refund handling** assumes Urable reports `paymentStatus = "refunded"`; unverified against Urable.
6. **Promo codes** are admin-managed only; reservation/consumption cannot be applied to Urable virtual-shop payments (documented API limit). Not faked.
7. **Booking/payment linkage** — route and UI are implemented and locally tested, including duplicate Urable customer records and later payment/status sync. Function deploy is blocked by CLI access (403). Real paid checkout and return linkage remain unverified.
8. **Push** — EAS project exists; FCM/APNs credentials and a development build are still needed. Expo Go cannot test remote push.
9. **Account deletion** removes the Auth identity and anonymizes at once; already-issued access tokens stop working immediately because `soflo-api` re-checks the profile every call (tested). Tokens used directly against Supabase REST until expiry see nothing (RLS requires an undeleted profile).
10. **Visual regression** — existing browser comparison is recorded in `docs/visual-validation/`; the new booking handoff screen and all native interactions need device review.
11. **Protection records** — the handbook requires per-vehicle completed protection jobs plus admin-entered warranty product, coverage and dates; the app and admin implement this. A private warranty-document bucket is not required by handbook Section 4.8 and is out of scope.
12. `apps/api`, its docs and Fastify scripts remain until Ali approves; remove at cutover only.

## Admin site (deployed 2026-10-23)
- Hosted as a prebuilt static site on Vercel: https://soflo-suds-admin.vercel.app (project `soflo-suds-admin`). Source builds fail on Vercel (monorepo `npm install`), so deploy prebuilt: build `apps/admin`, copy `dist` to `apps/admin/.vercel/output/static`, add `config.json` with an SPA fallback, then `vercel deploy --prebuilt --prod`.
- `ADMIN_ORIGINS` secret = the Vercel URL plus `http://localhost:5173`; the URL is also in the Auth redirect allow-list. CORS preflight from that origin verified.
- Owner admin account created (the project owner's own account for now); the client's admin is added later with `scripts/supabase/bootstrap-admin.mjs`, then the owner row is set `active = false`.
- Admin sign-in verified against the live project through the API (`GET /admin/me` returns 200); browser sign-in on the hosted site is still to be clicked through.

## Functions deployed from branch HEAD (2026-10-23)
- `soflo-api` and `cron-worker` redeployed (both now version 3) from `supabase-backend-migration` with `supabase functions deploy --use-api`, using the owner's access token supplied in the shell only. `health` unchanged. Migrations were not rerun.
- Route check: `GET /bookings/handoff/latest` with no token returns 401 UNAUTHORIZED; with the admin token it returns PROFILE_INCOMPLETE (a customer-only route, so the route exists and runs the customer check); `/admin/me` still 200. This shows the routes are deployed, not that the live Urable handoff matches real checkouts; that still needs a real-device test.
- Cron after deploy: see the check below.

## Live end-to-end test as a user and admin (2026-10-23)
`node scripts/qa/live-e2e.mjs` (needs the project URL, publishable key, service key, Urable key and admin login in the environment) runs the real flows against the live Supabase project and the shop's real Urable account. **27 of 27 steps pass.** It creates one confirmed TEST customer (standing in for the email-link click, since a real inbox is needed for that), far-future *unpaid* TEST jobs that it cancels, and a TEST promo; it never pays anything. What it proved:
- sign-in, wrong password rejected, profile completion creating a **real Urable customer**, idempotent retry, `/me`;
- 49 real services, vehicle add/edit in Urable, every customer read route, notification preference save, RLS (anon cannot read tables), customer blocked from admin;
- owner admin sign-in and dashboard; admin-created promo; admin settings change reaching the public config (maintenance on/off);
- **a 10% promo applied to a real Urable invoice** (subtotal 1995 → total 1795 cents), a second code refused, cancellation through the app confirmed canceled in Urable and the promo released;
- **virtual-shop handoff on real data**: a duplicate Urable customer with the same email plus a new job is linked to the right app user (simulated checkout; no card, and not through the shop's own page);
- another customer cannot see the job; account deletion kills the token.

Two bugs only real data exposed and are now fixed with regression tests: Urable's customer `email` can be an object (`{label,value}`), and a job's `created` is `{uid,timestamp}`, not a number — the handoff matcher would have failed on both. Test residue (7 soft-deleted TEST users, handoffs, sync rows) was purged afterwards; Urable keeps the TEST customers it created (named `TEST Markhor E2E`, no delete call exists in the client) and every TEST job is canceled.

Still not covered by this run: the email-confirmation click and password-reset link on a phone, the shop's own checkout page and card payment, paid-job points, push delivery.

## Added in this pass
- System screens: offline banner, maintenance screen (admin setting `maintenance_message`), forced-update screen (`min_app_version`). Migration 006. Unit-tested (`npm run test:mobile`).
- Promo codes: `POST /bookings/:id/promo` (handbook 4.4 rules under a row lock, 10 wrong codes/hour limit, release on cancel or Urable failure, applied when Urable reports paid). Migration 007. Applies the discount through Urable's supported invoice adjustment.
- Not built: native service/date/time/quote screens and `/availability` (Urable has no public slot or card-checkout API; the virtual shop remains the supported route, handbook Fallback A/B), promo entry UI in the app, shop products added to a booking.

## App UI checked in a browser against the live backend (2026-10-23)
Static web export of the app (live Supabase env) served locally and driven in Chrome as a TEST customer: real login screen → Home ("Hi, TEST.", points chip, next visit pulled live from Urable) → Bookings tab → booking detail. Native-only gaps remain: this is a browser, not the installed APK. The new promo-code field (`PromoCodeCard`) on unpaid bookings was typechecked and its server route proven live (see above), but I did not get to click it in the browser: the Chrome extension disconnected. Web builds need the page origin in `ADMIN_ORIGINS` (CORS); native apps do not, so the temporary `localhost:8083` origin was removed afterwards. TEST customer, job (canceled in Urable), and promo were deleted.

## Email confirmation gets its own deep link (2026-10-23)
Signup confirmation previously redirected to `soflosuds://reset`, which opens the reset-password screen. Signup now uses `soflosuds://confirm` (new `app/confirm.tsx`): it exchanges the PKCE code for a session, completes the profile, and opens Home; expired, invalid or other-device links show a clear message with Log in / Sign up again. Password reset still uses `soflosuds://reset`. The existing allow-list entry `soflosuds://**` covers both; live check: Supabase's verify endpoint returned 303 to `soflosuds://confirm` and to `soflosuds://reset`. Not yet verified: tapping the real email link on a phone with the installed APK (the code must be used on the phone that started signup).

## Points and referrals verified on the live database (2026-10-23)
- Found: `referral_reward_points` was not set live, so referrals would have paid 0. Migration 008 seeds the handbook's working defaults as editable settings (`points_per_usd` 1, `referral_reward_points` 250, `referral_monthly_cap` 20) and adds handbook 4.6 anti-abuse to `record_job`: a referral between customers with the same phone is rejected (`duplicate_phone`) and a referrer past the monthly cap is rejected (`monthly_cap`). Not implemented: the same-device / same-payment-name checks (no device id or payment name is available).
- Live check in a rolled-back transaction on the production database: a $125.50 completed+paid job credits 125 points once and 0 on replay; referrer +250, referee +375; referral `rewarded`. Nothing persisted.
- **Not done on purpose:** a real Urable paid job. Recording a cash payment through the API would add a completed, paid job to the shop's real earnings reports and cannot be removed through the API. So Urable's actual `paymentStatus`/`amountPaid` values after a real payment remain unverified, as does the refund status string.
- Tests: `npm run test:db` 55 passing (3 new referral-defence tests).

## Handbook gaps closed (2026-10-23)
- **Push taps open the right screen** (`PushTapHandler`, `routeForDeepLink`, whitelist of known routes; foreground display on). Previously no tap handler existed.
- **Review prompt push** 2 hours after a job completes, once per job, skipped if already reviewed (migration 009 `job_sync.completed_at`; `cron-worker` step `reviewPrompts`).
- **Day-before reminder** now fires on the shop's local date-before once `reminder_hour_local` (default 9) has passed, in `shop_timezone`, instead of a fixed 20–28 h window.
- Tests: 19 function tests (54 steps), 7 app-logic tests, 55 database tests.
- "Add to calendar" (web calendar link, no extra permission) on the matched booking and booking detail screens; unit-tested.
- Still not built from the handbook: same-device / same-payment-name referral checks.
- **Cancellation rule** (handbook open-question default): free cancel up to `cancel_window_hours` (default 24) before the visit, then `CANCEL_NOT_ALLOWED` with "call the shop at <phone>". Setting editable in admin; tested.
- **Contact screen fixed**: it called a `/config` route that no longer exists on the Supabase API; it now reads `shop_config`.
- **Welcome screen** now has the handbook's 2–3 slides (certified team, protection, rewards).
- Admin site redeployed with the new settings fields.
- **Urable network failures** (timeout, connection reset) now surface as `URABLE_UNAVAILABLE` (503, retryable) instead of an opaque 500; one live run of the handoff start had returned a 500 intermittently (1 of 5 runs) and this is the likely cause (not reproduced on demand).

## 24 Oct 2026: rewards and shop products on a booking, Firebase push setup
- **Rewards at checkout (handbook 4.2/4.5, Fallback C).** `POST /bookings/:id/reward` attaches an available redemption to one unpaid, upcoming booking. The shop sees `SOFLO REWARD <code>: <name>` in the Urable job notes and marks it used in the admin. One reward per booking, one booking per redemption (unique index). Cancelling the booking, or the sync seeing `canceled`, frees the redemption again. If Urable cannot record the note the claim is undone.
- **Shop products on a booking (handbook 4.9).** Urable lists only gift cards, so products come from `shop_products`. `POST /bookings/:id/products` adds a real invoice line when the product has a `urable_product_id` (discount kept), otherwise a `SOFLO SHOP PRODUCT` note for the shop. `POST/GET/DELETE /shop/next-booking` is the "Add to next booking" list; it is applied when the handoff links the next booking. Booking detail now returns `totalCents`, `reward` and `products`.
- **Schema:** migration `20261024000010_booking_extras` (applied live): `reward_redemptions.applied_job_id`, `booking_products`, `next_booking_products` (RLS on, no client grants).
- **App:** `BookingExtras` card on booking detail, new `shop-add` screen, Shop button "Add to booking", rewards screen shows which codes are on a booking. Admin redemptions table shows the booking.
- **Tests:** `extras.test.ts` (15 cases: ownership, double use, paid booking, Urable failure rollback, cancel release, cart apply), RLS test covers the new tables, live E2E extended to 33 steps and passes against real Urable (reward note, note-only product, linked product as invoice line with the promo discount kept, next-booking cart applied through the handoff). Live residue purged.
- **Push (Firebase):** project `soflo-suds-push` (owner's Google account, swap for the client's at delivery), Android app `com.soflosuds.app`, `google-services.json` committed (client config, GitHub alert is a false positive), FCM v1 service-account key uploaded to EAS. Google OAuth and FCM `validate_only` accepted the credentials; Expo's push API answers correctly. **Not yet verified on a device** (needs a new APK).
- **Still open:** real-phone QA, a real paid Urable job/refund string, iOS build and store assets (client accounts), retiring `apps/api`, rollback drill.
