# Store listing drafts (App Store + Google Play)

Drafts written 1 Nov 2026 from what the app actually does (handbook Section 1.3 and the code). Nothing here is final until the client approves the wording. No prices, shop address, phone, hours or statistics are included on purpose: the client has not supplied them. Items marked **[CLIENT]** need the client.

## 1. Listing text

| Field | Draft | Limit |
| --- | --- | --- |
| App name | SoFlo Suds | 30 |
| Subtitle (iOS) | Your vehicle. Elevated. | 30 |
| Short description (Play) | Book detailing, ceramic coating and PPF with SoFlo Suds. Track jobs and earn rewards. | 80 |
| Category | Primary: Lifestyle (iOS) / Auto & Vehicles (Play). Secondary iOS: Utilities | n/a |
| Keywords (iOS) | auto detailing,ceramic coating,PPF,car wash,paint protection,window tint,South Florida,vehicle care | 100 chars |
| Support URL | https://soflo-suds.vercel.app/ (replace with the shop's domain if the client prefers) | n/a |
| Privacy policy URL | https://soflo-suds.vercel.app/#privacy | n/a |
| Marketing URL | https://soflosuds.com **[CLIENT to confirm]** | n/a |
| Copyright | 2026 SoFlo Suds **[CLIENT to confirm legal name]** | n/a |
| Age rating | 4+ (iOS) / Everyone (Play). No user-generated public content, no web browsing beyond the booking page, no gambling, no mature content. | n/a |

### Promotional text (iOS, 170)
Your vehicle. Elevated. Book your next detail, coating or paint protection film, follow your job live and earn rewards every visit.

### Full description (both stores)
SoFlo Suds is the official app of SoFlo Suds, South Florida's detailing, ceramic coating and paint protection film studio.

Book your service
- Browse the services the shop offers and choose the vehicle you want worked on.
- Pick a time and pay securely in the shop's booking page, right inside the app.
- Choose in-shop or mobile service.

Stay in the loop
- Follow your booking from scheduled to complete.
- Get a confirmation once your booking is paid, a reminder the day before, and updates when your job status changes.
- Add your appointment to your calendar in one tap.
- Cancel free of charge up to 24 hours before your visit, or rebook a past service.

Your vehicles and protection records
- Save the cars, trucks, boats and RVs you own.
- See the ceramic coating, PPF and tint work done on each vehicle, with the product, coverage and the date your warranty runs until.

Rewards that add up
- Earn points on every completed, paid visit.
- Redeem points for rewards on a booking.
- Share your referral code. When a friend completes their first visit, you both earn points.
- Apply promo codes from the shop.

See the work
- Browse before-and-after photos from the shop.
- Leave a review after a completed visit.
- Add shop products to your next booking.

Notifications are optional and you control them in the app. You can delete your account any time from Profile.

Questions? Open Contact in the app to reach the shop.

### Notes
- "Add shop products", "gallery" and "protection records" will look empty until the client supplies content. The description is accurate about capability; screenshots must only show real screens.
- Do not mention price, deposits, fees or "Urable" in public text. The privacy policy names Urable as the booking provider because it must.

## 2. App Review notes (Apple) and Play review instructions

> SoFlo Suds is the customer app for a real auto-detailing business. Customers sign up, save their vehicles, book a service, follow the job, earn rewards and leave reviews. Booking date, time and payment happen on the shop's own booking page, which opens inside the app (a web view) because the shop's scheduling and payment system is hosted there. The app adds its own account, vehicle management, job tracking, protection records, rewards and referrals, push notifications and calendar integration around it, so it is not only a website.
>
> Demo account: **[email]** / **[password]**. This is a test account.
> To see the booking flow: Services > pick a service > choose the vehicle > Book. Please do not complete a payment; no card is needed to review the screens. Account deletion is in Profile > Delete account.
>
> Push notifications are optional and requested after an explanation screen. The app uses the camera and photo library: no. Location: no. Tracking: no.

(Fill the demo credentials after the reviewer account exists. Never commit the password.)

## 3. Apple privacy nutrition labels (draft)

Based on: signup collects name, email, phone, password; vehicles; bookings; reviews; reward/referral activity; notification preferences; a random per-install id; the Expo push token. No card data is stored by us. No ads and no analytics, camera or location library in `apps/mobile/package.json` (checked 1 Nov 2026).

**Tracking: No.** The app does not track users across other companies' apps or sites.

| Data type | Collected | Linked to user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact info: Name | Yes | Yes | No | App functionality |
| Contact info: Email address | Yes | Yes | No | App functionality |
| Contact info: Phone number | Yes | Yes | No | App functionality |
| User content: Photos or videos | No | n/a | n/a | n/a |
| User content: Other user content (reviews, vehicle details) | Yes | Yes | No | App functionality |
| Purchases: purchase history (bookings, payments status) | Yes | Yes | No | App functionality |
| Identifiers: Device ID (random install id, plus push token) | Yes | Yes | No | App functionality (fraud prevention for referrals, push delivery) |
| Financial info: payment info | No (card entry happens in the booking provider's page; we store only brand and last 4 for a referral duplicate check as a hash) | n/a | n/a | n/a |
| Location | No | n/a | n/a | n/a |
| Usage data / Diagnostics | No | n/a | n/a | n/a |

To confirm before submitting: whether Urable's booking page (inside the web view) counts as our collection. Declare it conservatively: payment and contact info are shared with the booking provider to schedule and pay for the service.

## 4. Google Play Data safety (draft)

- Data collected and shared: Name, email address, phone number, user IDs (install id), purchase history, other in-app content (vehicles, reviews), device or other IDs (push token).
- Shared with third parties: booking and customer details with the booking provider (needed to schedule and pay for the service). Push tokens with Expo/Google for delivery.
- Data is encrypted in transit: Yes.
- Users can request deletion: Yes, in-app (Profile > Delete account) and via the privacy policy contact.
- Data collection is optional?: Account details are required to use the app; push notifications are optional.
- No ads, no data sold, no location, no contacts, no photos, no financial info stored.
- Account deletion URL (Play requires a web path): needs a page or section on the shop's site. The public site currently documents in-app deletion only. Done 1 Nov 2026: the `#privacy` section now has step-by-step deletion text, deployed. Use https://soflo-suds.vercel.app/#delete-account as the Play deletion URL.

## 5. Other store tasks (status)

| Item | Status |
| --- | --- |
| 1024 px icon | Ready: `apps/mobile/assets/images/icon.png` is 1024x1024 RGB with no alpha channel |
| Play feature graphic 1024x500 | Not made |
| Screenshots iPhone 6.7" (1290x2796) and 6.5" (1242x2688) | Captured 1 Nov from the real app's web build, logged in to the live backend as the reviewer account. Saved outside git in `~/Desktop/SoFlo-Suds-store-screenshots/`. Strong: Home, Services, Profile. Weak (accurate empty states until the client adds content): Bookings, Protection, Gallery. Not usable: Rewards (shows the leftover test reward), Welcome (the web build shows two slides side by side, which the phone app does not) |
| Play phone screenshots | Not made |
| Demo reviewer account | Created 1 Nov 2026 (`TEST Apple Review`, no bookings, no vehicles). Login saved only in `~/.config/soflo-suds/apple-review-login.txt`. It is one more TEST customer in the client's Urable that must be deleted by hand at delivery |
| Leftover live test reward | `TEST App QA Reward` deactivated 1 Nov 2026 (`active = false`, row kept; re-enable in admin or SQL if needed). Rewards screen is empty until the client supplies rewards |
| Apple Developer / Play Console access | **[CLIENT]** |
| Content rating questionnaires | Answers above; submit once the accounts exist |
