# SoFlo Suds implementation plan

Updated 21 October 2026. The [Developer Handbook](SoFlo%20Suds%20-%20Developer%20Handbook.pdf) is the scope source. The UI mockup PDF is a separate workstream and will be applied before customer screens are finalized.

## Product and boundaries

Build one branded iOS/Android customer app and one web admin panel. Customers sign in, book SoFlo Suds services, manage vehicles and bookings, see job status and payment history, earn/redeem rewards, refer friends, review completed jobs, browse the gallery and shop, and view per-vehicle protection records. Staff continue working in Urable. Admin manages promos, rewards, referrals, reviews, gallery, warranties, products, push, and settings.

Urable is the source of truth for customers, vehicles, services, jobs, and payments. Our database stores the features Urable lacks and the links to Urable records. The app must not hold the Urable key or handle card numbers.

## Architecture decision

```text
Expo customer app ─── HTTPS ─── TypeScript API ─── Urable API
                              │
React admin web ───── HTTPS ───┤
                              └── Supabase PostgreSQL + Storage
```

- **Mobile:** Expo, React Native, TypeScript, Expo Router, TanStack Query, small local state.
- **API:** Node/TypeScript with Fastify, Zod, a single Urable adapter, scheduled sync/reminders, server-side prices and reward rules.
- **Data/files:** Supabase PostgreSQL and Storage, with migrations and ownership checks. Supabase project/hosting account must come from Ali; no paid account will be created independently.
- **Authentication:** follow the handbook's server JWT/refresh-token design unless Ali approves replacing it with Supabase Auth. Admin uses separate credentials.
- **Push:** Expo Push, driven by server-side booking/status/reminder events.

## Booking path and proof gates

The public Urable API successfully created and cancelled a test in-shop job. It does **not** publish an availability endpoint or a customer card-checkout link for API-created jobs. `POST /v1/payments` records money already collected; it does not charge a card.

The existing Urable virtual shop has been explored without submitting a booking. In-shop and mobile links can start directly at service categories with `jobType=shop|field&industry=vehicleCare`. Its cart shows customer and vehicle forms, a time-slot picker, add-ons, and a Payment step. The mobile flow asks for an address. The live account currently shows a 7% convenience fee and 25% deposit on the sample service.

**First build path:** after app login, open the SoFlo Suds virtual shop inside the app for slot choice and checkout. Once the customer finishes, the API searches Urable jobs for the verified customer/email and links only an unambiguous new job. The app reads subsequent status/payment state through our API. Native service discovery can use Urable's public catalog, but the virtual shop remains the authority for slot and checkout totals.

Before calling this solved, verify on a real device:

1. The virtual-shop checkout works inside the app, including any card authentication/redirect. No Android device or emulator is connected in the current environment, so this cannot yet be verified on-device.
2. A completed booking can be matched to the correct signed-in customer, including when Urable creates a duplicate customer record for the same email. A server-side candidate matcher and ambiguity checks are implemented and tested with simulated data; live end-to-end matching is still unverified.
3. The app handles cancelled/abandoned checkout, duplicate taps, and delayed Urable status updates without inventing a booking.
4. One marked test booking is made far in the future, cancelled the same day, and never charged to a real card.

If any gate fails, use an external browser handoff or ask Urable for a supported checkout URL/callback. Do not rely on private Urable JavaScript endpoints as a production API.

## Build order

| Step | Deliverable | Exit condition |
| --- | --- | --- |
| 0. Scope/design alignment | Handbook read, concept walkthrough, screen/state inventory, UI mockup from separate workstream, Urable capability table | Ali has the mockup, test results, and open decisions. |
| 1. Foundation | Monorepo, Expo shell, TypeScript API, Supabase migrations, secret handling, config, CI/typecheck | API and app run locally; no key in client or Git. |
| 2. Identity and Urable links | Sign-up/login/reset/logout, customer creation in Urable, vehicle CRUD, ownership rules | One test user can sign in and see only their vehicles. |
| 3. Booking vertical slice | Service discovery, location choice, virtual-shop handoff, verified job matching, status/payment read, confirmed screen | An installable APK completes a marked test booking and links the correct Urable job. |
| 4. Operational loop | Booking history, cancellation, rebook, status polling, reminders, push, profile | Status and notifications match Urable; test job cancelled. |
| 5. Value features | Promo rules, points ledger, rewards, referrals, reviews, gallery, protection records, shop | Server rules are idempotent; admin can manage required data; products actually charge through Urable. |
| 6. Release | All empty/loading/error/offline states, privacy/account deletion, store assets, Android+iOS tests and submissions | Handbook Milestone A/B checklists pass on physical devices. |

The handbook's calendar dates and weekdays conflict in 2026; Ali must confirm whether the dates or weekdays control the milestones. Until then, sequence and exit conditions above are the working plan.

## Decisions and inputs for Ali

1. **Payment rule:** the handbook assumes full payment; the live virtual shop currently requests a 25% deposit and adds a 7% convenience fee. Confirm which customer experience and copy are approved.
2. **Shop catalog:** the Urable `type=product` catalog has only four gift cards. The virtual shop shows at least one physical add-on classified elsewhere. Obtain the intended physical product list and how each should be charged in Urable.
3. **Service visibility:** the API returned 69 services, of which 49 have `virtualShop: true`. Confirm that only those 49 should appear in customer service discovery.
4. **Accounts:** provide the approved Supabase/hosting project and later Apple/Google developer access.
5. **Booking handoff:** if a controlled end-to-end test cannot link the virtual-shop job back to our user, seek Urable's supported identity/return mechanism.

These decisions do not stop local API/app setup or isolated auth work. Do not place the key in a client build. Do not create extra live bookings while the handoff test is unresolved.

## Current status — 22 October 2026

- **Implemented and partly live-tested:** Supabase schema, RLS, runtime role and gallery bucket; customer auth/session/account deletion, Urable services and vehicle CRUD; mobile app and admin screen/API scaffolds; server-side booking candidate matcher; Brevo SMTP authentication and delivery to Gmail. Typechecks, API/admin builds and booking matcher tests pass.
- **In progress:** verified virtual-shop booking-to-app job handoff, full password reset test, visual comparison with the HTML and the separately prepared UI mockup.
- **Not done:** proven real checkout/payment, native booking flow and promo/reward/product application, push credentials and device proof, complete value-feature settlement, installable device-tested APK/iOS build, store submissions.

Detailed evidence: [Urable API test results](urable/API_TEST_RESULTS.md).

## Detailed delivery plan and dependency map

The [concept-to-product specification](CONCEPT_TO_PRODUCT_SPEC.md) is the design and screen contract. Its Appendix A records the clickable HTML routes and actions; Appendix B defines required production states. The handbook remains the final authority for scope, behavior, security and acceptance. Implementation follows the sequence below so each vertical slice can be installed and verified.

### A. Repository and configuration

1. Keep the monorepo as `apps/mobile`, `apps/api`, `apps/admin`, `packages/shared`, `docs/concept`, `docs/urable`.
2. Configure strict TypeScript, lint, format, environment validation and CI checks for all apps. Separate test and production environments.
3. Create reusable brand tokens in shared design files: final black/cyan/magenta palette, Oxanium/Goldman typography, spacing/radius and icons. Bundle fonts and supplied logo into mobile/admin assets.
4. Create `apps/mobile` shell with the handbook's five tabs, safe area, auth gate, loading/error/offline patterns and deep-link handling. Do not carry Expo template UI into customer routes.
5. Create `apps/admin` with Vite/React router, protected admin auth and reusable form/table/stat components.
6. Create API environment schema for database URL, Urable key/base URL, JWT signing keys, push credentials, storage and public config. Check in only `.env.example`, never values.
7. Add request IDs, structured redacted logging, Zod validation and a standard error envelope. Health/readiness probes must not expose secrets.

**Gate A:** `npm install`, all typechecks/builds, API health and mobile cold start succeed. Assets render offline. A source scan confirms no Urable key in app or repo.

### B. Data model and migrations

1. Provision the approved Supabase PostgreSQL project; use Prisma migrations or SQL reviewed against handbook Section 3. Do not assume Supabase Auth replaces the required API JWT design.
2. Create users and auth tables: users linked to Urable customer id, credentials, rotated refresh sessions, password reset tokens, admin users/roles and audit metadata.
3. Create `job_sync`/booking linkage with unique Urable job id, user id, last status, payment state, timestamps, reminder state, completion-paid marker and handoff correlation metadata.
4. Create notification token/preferences/log tables with uniqueness and idempotency keys.
5. Create promo definitions, reservations/redemptions and relevant uniqueness/limit indexes. Use database transactions and locks at redemption/booking.
6. Create points ledger and reward catalog/redemptions. Ledger rows are append-only and keyed by source event to prevent double earning.
7. Create referrals with referrer/referee uniqueness, status, rejection reason and reward linkage.
8. Create reviews with unique Urable job id, visibility state and immutable customer text; gallery projects/media with before/after and ordering.
9. Create warranties linked to customer and Urable vehicle/job, fallback shop products, public/private settings and admin audit records.
10. Create Supabase Storage buckets/policies for gallery and warranty assets. Customer access goes through ownership-checked signed URLs or backend proxy.
11. Seed only deterministic config and an explicit admin bootstrap method; do not seed demo customers, points, jobs or fake protection records into production.

**Gate B:** migrations apply cleanly to an empty database and rollback strategy is documented; constraints reject duplicate reward/job/review links; unprivileged mobile cannot access database directly.

### C. Authentication and customer identity

1. `POST /auth/signup`: validate name, email, phone, password and referral; create/find a Urable customer safely; create our user link; return access/refresh session. Resolve partial failure with retryable reconciliation, not duplicate customers.
2. `POST /auth/login`: bcrypt verify, rate limit and issue 15-minute access plus rotated 30-day refresh token. Store refresh token securely on device.
3. Forgot/reset: single-use, 30-minute token delivered by configured email provider; generic outward response, rate limits and token revocation after use.
4. `/me`: read/update profile and notification preferences, sync editable fields to Urable where supported. Delete account anonymizes, revokes sessions and removes push tokens per handbook.
5. Admin login is separate, no public sign-up. All admin mutations carry admin identity in audit logs.
6. Build native Splash, Welcome, Sign up, Login, Forgot and Profile screens with concept visuals, all validation states and keyboard behavior.

**Gate C:** two test accounts cannot see each other's vehicles/jobs/rewards; reset token expires; logout invalidates refresh; app resumes session after restart.

### D. Catalog, vehicles and branded discovery

1. Implement one Urable adapter with typed customer, item/vehicle, service/product, job/payment operations. Set timeouts, retry only safe reads, redact request logs.
2. Cache catalog for 10 minutes and map service categories/display names without inventing prices. The API returns capability flags for shop/mobile/add-ons where verified.
3. Build Home and Services from live catalog. Match HTML card proportions, two-column layout, chip styling, hero typography and color order. Add detail screen with verified includes/duration/price.
4. Implement vehicle CRUD through Urable with ownership checks; build My vehicles, add/edit/delete forms and protection-link entry.
5. Use server config for shop contact, in-shop address and mobile coverage text. The exact values should be entered by admin when known, never baked into JSX.

**Gate D:** a new signed-in account sees no fake vehicles, can create/edit/delete its own Urable vehicle, and service prices/names match the current Urable catalog.

### E. Booking and Urable payment vertical slice

1. Build a persistent booking draft model with service/add-ons/products, vehicle, location/address, date/slot, promo/reward and quote state. Each step validates locally and on server where values matter.
2. Implement slot discovery via a supported Urable route if one is confirmed. Otherwise use the documented virtual shop as the availability/payment surface. Keep the branded app shell around handoff where possible and make the transition explicit.
3. Implement `POST /bookings/quote` as server-authoritative. Quote lines include any Urable deposit and convenience fee, real due-now and balance-later labels, expiry and eligibility. Promo/reward mutations occur only in the correct transaction window.
4. Implement booking creation with idempotency and customer/vehicle/service ownership. Store a `job_sync` row and send confirmation push only when a real Urable job is identified.
5. Implement verified virtual-shop handoff: open with approved job type, observe a supported return or safely poll Urable jobs for the signed-in customer's identity, require unambiguous matching and create a link only when confirmed. Handle duplicate Urable customer records and abandoned payment conservatively.
6. Build Review & pay, pending/failure/success and Booking confirmed screens. Card entry stays in Urable. Add to calendar and My bookings use the confirmed job details.
7. Run one marked real-world test booking far in the future using approved test payment method/conditions, verify it appears in Urable and in the app, then cancel the test if appropriate. Preserve evidence without card data or secrets.

**Gate E:** an installable APK can complete the required service→vehicle→location→date/time→review/pay path and display the same Urable job and payment state. A double tap does not create a second job.

### F. Job status, notifications and profile history

1. Implement own-bookings list/detail with Upcoming/Past, status mapping, cancellation rule, payment history and rebook prefill. All states come from Urable/API.
2. Poll active jobs per handbook every five minutes, use webhooks if Urable offers them, and reconcile status changes idempotently. Trigger status push once per transition.
3. Schedule day-before reminders around shop timezone and configured hour. Record send attempts; avoid repeats and respect user settings.
4. Register Expo Push tokens after permission explainer, renew on token change, remove on logout/account deletion. Admin promo push is opt-in and capped at one per user/day.
5. Deep-link notification taps to own booking or a safe fallback. No cross-account push details after logout.
6. Build payment history within Profile using Urable records, with receipt/status where supported.

**Gate F:** real Urable status changes reach the correct account, reminder/promo preference rules hold, cancellation and rebook work with current price and availability.

### G. Value features

1. **Promo codes:** admin CRUD and validation/reservation/consume/release with all handbook limits and errors. Present field-level results at Review & pay.
2. **Points/rewards:** award after completed paid job only, append-only ledger, transactional redeem, configurable rules, reversal on refund/cancellation. Show real balance and history in concept-shaped Rewards screen.
3. **Referrals:** unique personal code at sign-up, attach one referrer, settle both rewards after first paid completion and perform handbook abuse checks. Provide share/copy and status.
4. **Reviews:** one per own completed job, rating 1–5, optional sanitized text ≤1,000 chars; admin hide/show. Build gallery/review customer screen.
5. **Gallery:** admin before/after upload, caption/tag/order/publish; signed URLs/optimized thumbnails; native comparison slider.
6. **Protection records:** map completed Urable protection jobs, join admin warranties, show per vehicle newest first with pending/expired state.
7. **Shop:** map real Urable products or fallback admin catalog, product grid/detail and add-to-booking. No independent cart/checkout or delivery.

**Gate G:** each feature works with a real customer/admin session and persists after restart. No demo points, sample price or fabricated warranty appears.

### H. Admin panel

1. Build admin login and protected layout.
2. Dashboard counts: users, bookings this week, points issued, active promos.
3. Forms/tables for promo codes; loyalty/rewards/redemptions; referral status and settings; review moderation; gallery; warranty; fallback products; push composition/history; settings.
4. Use the concept owner CSS language: black/dark panels, cyan eyebrow, magenta/cyan actions, clear stat tiles, badges, compact tables and modals. Remove concept owner CRM, leads, dispatch, subscriptions, inventory, partner ads, assistant, reports and team management.
5. Add admin form validation, conflict handling, optimistic actions only where safe and audit attribution. Check narrow browser layouts and keyboard navigation.

**Gate H:** every handbook admin Section 5.3 control creates a visible, correct change in the customer app/API; admin cannot see card data.

### I. QA, visual review and release

1. Capture reference states from saved HTML and matching app screenshots at 390 px and a narrow phone. Compare header, logo size, font rendering, spacing, hero/card dimensions, buttons, chips, tabs and modal treatment. Replace missing concept images with approved client photos and repeat visual review.
2. Exercise every screen's loading, empty, error/retry, offline, success and accessibility states. Check screen reader labels, text scaling, focus/keyboard, safe areas and Android back/iOS gestures.
3. Verify server ownership, authentication, rate limits, idempotency, transaction boundaries and error mapping. Run integration tests against an isolated database and safe Urable test records.
4. Build Android APK, install on real Android, complete booking/payment and status loop; then iOS test build on a real device. Resolve WebView/card-authentication behavior on both.
5. Publish privacy policy page, app icons/splash, screenshots, descriptions and account deletion instructions. Configure EAS identifiers, signing and store metadata using client-approved accounts.
6. Submit Google Play and App Store builds only after handbook Section 9 checklist and approvals are met. Update README/env/release runbook and handoff notes.

**Gate I:** Milestone A is a full installable APK with Section 1.3 features functioning; Milestone B is store-ready submissions and Section 9 complete. The UI mockup PDF can refine visual details but does not substitute for app verification.

## Current execution checklist

| Work item | Current state | Next concrete step |
| --- | --- | --- |
| Handbook and Urable discovery | Complete initial pass | Revisit only on a specific implementation conflict. |
| HTML concept inventory and visual spec | Detailed spec and eight reference screenshots present | Compare every native screen/state and apply the separate UI mockup when ready. |
| API/mobile scaffold | Present with branded customer screens and live data routes | Finish booking and edge states, then device QA. |
| Supabase project and migrations | Applied to the approved project | Add versioned future migrations and verify remaining live flows. |
| Customer auth | API/mobile implemented; SMTP delivered a test message | Test real forgot/reset flow and session/device edge cases. |
| Live booking and payment | Virtual-shop handoff and matcher implemented | Complete a controlled device checkout, verify job identity and payment state. |
| Admin app | Screens and routes present; selected live checks passed | Bootstrap real owner and test remaining CRUD workflows. |
| Full QA/release | Typechecks, builds and matcher tests pass | Installable builds, physical device checks, push, privacy/store submission. |

## Working rules for agentic implementation

- At the start of each task, read the relevant handbook section, the corresponding part of `CONCEPT_TO_PRODUCT_SPEC.md`, and the relevant existing code. State the source-backed acceptance conditions.
- Implement a full vertical slice (API, storage, app, admin if needed) before marking a feature done. A screen with placeholder data is incomplete.
- Keep one domain mapping from Urable to API DTOs; UI code must not interpret raw Urable payloads or know the Urable key.
- Use stable semantic design tokens/components, then compare actual screenshots to the HTML. Do not visually approximate each screen independently.
- Do not add concept-only sections because they look polished. Check the scope table first.
- For an Urable issue, record the failing endpoint/response, affected flow and supported workaround. Continue independent work while resolving it.
- Keep `README.md`, progress table and test evidence updated when a gate changes status. Do not claim full completion from typecheck or a mocked screen.
