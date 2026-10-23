# End-to-end QA: SoFlo Suds

Last updated: 23 October 2026. Handbook Section 9 is the release criterion. A passing typecheck, bundle or fake-backed test is not a substitute for the installed app, real Urable checkout, email delivery or push delivery.

## Current evidence

| Area | Evidence | Release state |
| --- | --- | --- |
| Supabase schema and RLS | `npm run test:db` passes 52 checks; migrations 001-005 are applied to the live project | Local semantics passed; hosted security smoke covered migrations 001-004 only |
| Edge Function contracts | `npm run test:functions` passes 14 tests and 42 nested steps, including duplicate Urable customer handoff, wrong-user access, payments and linked-job sync | New functions await deployment; real checkout untested |
| Compilation | `npm run typecheck`, `npm run check:functions`, `npm run build`, Android JS export | Passed locally; no device runtime proof |
| Booking browser interaction | With `CI=1 npx expo start --web --port 8082`, `node scripts/qa-booking-web.mjs` passed start handoff → checkout → pending → matched with mocked Supabase/Urable responses | Browser interaction passed; native WebView and real backend still unverified |
| Android artifact | Earlier EAS preview APK finished, built from commit `017b2bf` | Does not contain migration 005 handoff work; needs a new build after function deployment |
| Live Supabase | Four original migrations/functions/Cron and admin site deployed; migration 005 table applied | Supabase CLI deploy receives HTTP 403 for current login; old functions remain live |
| Urable | Marked test customer/vehicle/job creation, read, cancel; no payment made | Paid virtual-shop checkout and return-to-account link unverified |
| Physical devices | `adb devices` lists no attached device in this workspace | Android/iOS device tests pending |

## Release test sequence

Record date, device/OS, build ID, test account, result and a redacted screenshot for each step. Use two accounts and a second phone on mobile data. Remove QA records and cancel marked Urable test bookings afterward.

1. **Deploy the handoff functions.** Use a Supabase CLI login or access token with Function deploy permission for project `tocofoxugjkaytxuxyzb`. Deploy `soflo-api` and `cron-worker`. Verify `POST /bookings/handoff` returns 401 without an Auth JWT and that the live Functions list shows the new versions. Confirm migration 005 is present and `booking_handoffs` has RLS enabled.
2. **Build/install Android.** Create a new EAS `preview` APK from the commit containing the handoff changes. Install on a physical Android phone, cold start while the laptop is off, and use mobile data. Check logo, splash, fonts, all tabs, scrolling, safe areas, keyboard, back navigation and the concept-based layout.
3. **Auth/email.** Sign up with a real inbox, follow the confirmation link on the phone, sign in/out, force-close/reopen, request password reset, follow the deep link and sign in with the new password. Repeat sign-in on a second phone. Confirm Urable has exactly one customer record after profile-completion retries.
4. **Service/vehicle.** Compare visible service names and prices with Urable. Add, edit and delete a test vehicle; check the corresponding Urable item. Verify a vehicle with an upcoming booking cannot be deleted.
5. **Booking handoff.** Start from a service and vehicle in the app. Test in-shop and mobile paths, including the mobile address field. Confirm the app opens the correct Urable shop type and its date/time and payment screens. Make one controlled, far-future, clearly marked test booking under Ali's approved payment conditions. Do not call it confirmed until the job is unambiguously linked to the correct signed-in account. Check pending, retry, ambiguous-number, abandoned checkout and app restart behavior. Cancel the test job the same day.
6. **Payment/status.** Verify the actual Urable payment/deposit status and amount in booking detail and payment history. Confirm changes appear in the app after sync, and that completed paid jobs credit points once, unpaid jobs credit none, and a refund reverses points. Resolve the actual Urable refund status string.
7. **Other handbook features.** Exercise points and reward redemption, referral first paid job, review once per completed job, gallery, protection records, shop product added to booking, promo code at Review & pay, profile edits, privacy and account deletion. Record any feature that cannot be charged/applied through the Urable virtual shop as a release blocker.
8. **Push.** In an EAS development/production build with FCM/APNs credentials, verify booking confirmation, status change, day-before reminder and promo push. Check opt-out and promo cap, and verify tapping each notification opens the intended screen.
9. **Admin and security.** Sign in on the hosted admin site in a real browser. Check each admin operation, audits and uploads. Verify customer A cannot read or mutate customer B's records; inactive admin loses access immediately. Confirm warranty documents require a private bucket and signed access before declaring them complete.
10. **Release.** Perform a 30-minute crash/empty/error/offline pass, compare key screens to `docs/soflo.html`, check privacy-policy and deletion URLs, produce Play/App Store assets, test rollback and submit both store builds through the client's accounts.

## Blocking inputs and limits

- The current Supabase CLI login cannot deploy Functions to the live project (HTTP 403). The database migration succeeded through the connected Supabase MCP. A project member with Function deploy access must sign in, or provide a suitable token through the local environment; never put that token in a repo file or chat.
- No Android device or emulator is attached here. Automated checks cannot prove native WebView payment redirects, deep links or push.
- A real checkout/payment test needs Ali's decision on the live shop's 25% deposit and 7% fee versus the handbook's full-payment assumption, plus approved controlled-test conditions. No charge was made during development.
- The public Urable API does not expose availability or customer card checkout. The handbook explicitly permits the virtual-shop fallback. Promo/reward/product application inside that checkout remains unresolved until Urable or Ali confirms a supported method.
