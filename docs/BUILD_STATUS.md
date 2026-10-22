# SoFlo Suds build status — 22 October 2026

This file tracks implementation honestly. The handbook is the final scope authority. A screen or API route is not complete until it works against the approved Supabase and Urable accounts on an installable app.

| Area | Implemented in repo | Still needed for completion |
| --- | --- | --- |
| Concept reference | 667-line concept-to-product spec, eight refreshed phone screenshots, recovered images, 205-line implementation plan | Final UI mockup PDF review; detailed device screenshot comparison for every screen/state |
| Brand/shell | Logo, fonts, dark cyan/magenta tokens, five handbook tabs, dark splash/icon, auth entry screens | Narrow-phone/tablet/native device review, welcome slides, final icon approval |
| Auth | API signup/login/refresh/logout/reset/delete, mobile forms, hashed passwords, SecureStore refresh; live signup/login/refresh/logout/delete passed and marked QA customer was removed from Supabase and Urable; Brevo SMTP authenticated and a test email arrived in Gmail | Full forgot/reset flow with a real app account, email verification requirement if approved, rate-limit/distributed-session QA |
| Urable adapter | Live catalog read: 69 services, 49 bookable; customer login reads and vehicle create/edit/delete passed against Urable; customer signup/delete cleanup passed | Live integration through remaining routes, product mapping, production job handoff |
| Booking/payment | Branded service/location handoff into Urable virtual shop; no false confirmation | Verified post-checkout job identity, native vehicle/address/date/review/pay steps, actual payment/device test, promo/reward/product application |
| Bookings/status | Urable list/detail/cancel reads and UI, sync job, reminder/points code | Rebook prefill, live status/push device proof, cancellation-policy config, external-checkout duplicate customer handling |
| Vehicles | List/create/edit/delete API and mobile actions; edit form preloads Urable vehicle fields and delete asks for confirmation; live API create/edit/list/delete passed | Device UI QA; preserve structured make/model for vehicles with unusual names |
| Rewards/referrals | Ledger schema, balance/reward UI, atomic redemption, referral code/share, referral table; live insufficient-points and successful redemption checks passed with QA cleanup | Reward settlement after qualifying paid job, anti-abuse checks, admin settings/live test |
| Reviews/gallery | Own completed-job review route/form, admin moderation, gallery admin CRUD/upload and customer grid; live test image uploaded, publicly read and removed | True before/after slider, approved real gallery content, review eligibility/live test |
| Protection | Admin warranty CRUD with Urable relationship validation; customer list joins completed protection jobs | Category mapping QA, real warranty records/documents and per-vehicle filtering UI |
| Shop | Product list/detail styling and admin fallback catalog; product action directs customers to services without claiming the item is in checkout | Proven chargeable Urable product mapping and add-to-booking payment integration; no separate checkout |
| Notifications | Push token registration, server send, promo cap, settings, sync reminders | EAS/FCM/APNs credentials, ticket/receipt handling, deep-link testing, scheduled job hosting |
| Admin | Login and handbook-specific dashboard, promo/reward/referral/review/gallery/protection/product/push/settings screens and routes; customer→vehicle→completed-job warranty search UI; live admin login/dashboard/search/settings/gallery upload checks passed with QA cleanup | Admin bootstrap with real owner email, remaining CRUD/browser QA, production auth hardening |
| Release | Typechecks, API build, admin build, Android Expo JS bundle export, web visual check | Installable Android/iOS builds, privacy policy approval/public page, store assets/listing/accounts/submission |

## Inputs needed for live verification

- Supabase project, schema, dedicated runtime role and gallery bucket are connected. Keep the local server credentials in `apps/api/.env` and the personal access token outside this repository.
- Current Urable API key is in the ignored local server `.env`; provision it again as a hosting secret for deployment.
- Brevo SMTP is configured locally and a test message reached Gmail. Configure the same secrets on hosting and test the app's full forgot/reset flow with a real account.
- Shop address, phone, email and mobile area text; admin can enter these once connected.
- EAS project and push credentials; Apple/Google developer accounts for release.
- One approved, controlled Urable checkout/payment test and a physical Android/iOS device.

## Next engineering order

1. Bootstrap the admin with the owner's email, then test auth and admin against real storage and Urable.
2. Resolve the verified Urable checkout-to-app job link on an actual device, then complete the booking vertical slice.
3. Implement promo/reward/product application on the actual payment path or document the precise Urable support need.
4. Complete referral settlement, reviews/protection/shop edge cases and push lifecycle.
5. Finish all screen states and visual comparisons; install APK, run handbook checklist, prepare stores.
