# SoFlo Suds: concept-to-product implementation specification

**Status:** implementation contract, 21 October 2026. **Audience:** mobile, API, admin, QA, design. **Read together with:** [Developer Handbook](SoFlo%20Suds%20-%20Developer%20Handbook.pdf), [implementation plan](IMPLEMENTATION_PLAN.md), and [Urable test record](urable/API_TEST_RESULTS.md).

## 1. Authority and interpretation

1. The handbook, especially Sections 1.3, 1.4, 4, 5, 6, 7 and 9, decides **what exists and how business rules work**. Do not ship a concept-only feature.
2. `docs/soflo.html` and its adjacent `soflo_files` assets decide the **visual and interaction language** for overlapping features. Use the actual final CSS cascade, not just the first `style.css` values.
3. `docs/logo.webp` is the supplied brand asset. The HTML snapshot also contains a duplicate `soflo_files/logo.webp`. Preserve its aspect ratio; do not redraw it as text.
4. Live Urable data is the authority for services, vehicles, jobs and payments. Concept names, sample prices, demo balances and dates are placeholders, never production records.
5. The separate UI mockup PDF is in progress. Fold it in when delivered if it clarifies approved screens; resolve scope conflicts in favor of the handbook.
6. When the handbook lacks a visual state, compose it from the tokens, cards, controls and spacing here. When the concept shows a rule that contradicts the handbook, keep the visual treatment and use the handbook's rule.

### 1.1 Evidence gathered

- Opened the saved HTML from a local HTTP server and rendered 27 hash routes at 390 × 844 and 1440 × 900 in Chrome. Inspected buttons, links, text, computed CSS and eight full-page mobile screenshots. Route/action inventory appears in Appendix A.
- Read `app.js`, `features.js`, `calendar.js`, `owner.js` and the other extension scripts. The concept stores mutable demo data in browser `localStorage` under `soflo-demo-v1`; every prototype state must be replaced with server-owned state for production.
- Read the CSS load order: `style.css`, `mobile.css`, `owner.css`, `brand.css`, `advertising.css`, `vibrant.css`, `trust.css`, `referral-home.css`, `gift-social.css`, `navigation-social.css`, `instagram-feed.css`, `latest-work.css`, `premium-gift.css`. Later styles override earlier ones. `vibrant.css` changes the neutral dark palette to the final black/cyan/magenta palette.
- The saved HTML references `assets/*.jpg` images that were absent from the saved folder. On 22 October, the missing concept photos were recovered from the client's live concept site into `docs/assets/`; the eight main phone reference captures in `docs/concept/` were refreshed. Some dynamic project/Instagram images still do not resolve, so final content imagery needs client approval.
- The saved concept is a phone-oriented prototype even in a desktop browser: `.app-shell` is capped at 480 px. Its owner mode has a separate desktop layout, but the saved static `#garage` document and runtime owner preview are not a production admin app.

## 2. Scope translation: concept to shipping app

| Concept surface | Handbook destination | Implementation decision |
| --- | --- | --- |
| Logo, premium dark branding, `Your vehicle. Elevated.` | Splash, Welcome, customer shell, admin | Preserve brand look and approved wording. |
| Home greeting, hero, featured services, next visit | Home | Keep. Replace Marco/demo metrics with signed-in data. One dominant **Book Now / Schedule** CTA. |
| Services and service detail modal | Services, Service details | Keep visual cards and modal/stack treatment. Catalog, prices and duration come from Urable. |
| Three-step demo booking | Seven logical handbook steps, including location, live slots, review and pay | Retain progress indicator, cards and typography. Expand states and wire real Urable-backed flow. |
| Garage, vehicle selector, protection passport | My vehicles and Protection records | Keep vehicle card, chips, shield rows. Add edit/delete, ownership, warranty dates and empty states. |
| Appointments and status line | My bookings | Keep card/status timeline. Add Upcoming/Past, cancellation rules, rebook, review entry, live status. |
| Suds Rewards card | Rewards | Keep gradient/balance/progress visual. Real ledger, configurable rewards, redemption, referral code and history. |
| Referral section | Rewards referral area | Keep share/copy idea. Handbook awards both parties after first completed paid job; do not promise demo's 5% discount. |
| Product shop | Shop | Keep product grid/search/detail visual. Replace separate cart/checkout with **Add to next booking** and Urable booking payment. |
| Payment sample | Review & pay; Profile payment history | Keep summary rows and status pills. Show actual Urable records and hosted card flow only. |
| Client reviews and before/after work | Gallery & reviews | Keep card/grid/slider visual language; admin uploads and moderates. |
| Notifications toggles | Profile notification settings | Keep two toggle groups; server-backed preferences and real push events. |
| Account/profile | Profile | Keep avatar/form/list rows. Add phone, contact, privacy, account deletion and logout. |
| Owner preview | Separate admin web app | Use its dark data-panel style selectively; build only the handbook admin screens. |
| Maintenance club/subscriptions | None | Exclude. |
| In-app messages, AI assistant/support chat | None | Exclude; use call/email contact. |
| Track detailer map / van ETA | None | Exclude; job status remains. |
| Partner ads/offers, advertising tools, social feeds/events | None | Exclude. A handbook promo banner can use the hero/banner style. |
| Gift-card purchase flow, delivery/shipping/cart checkout | None | Exclude. Gift cards in Urable catalog do not authorize a separate gift-commerce feature. |
| Quote request workflow, photo upload, approval pipeline | None as standalone feature | Do not invent this product flow. Services requiring quotes must be handled through supported Urable booking behavior or clearly marked contact action if validated. |
| Owner CRM, leads, dispatch, team, inventory, reports | None in admin Section 5.3 | Exclude. |

## 3. Brand system: exact reference values

### 3.1 Colors

Use semantic tokens. The final customer-facing cascade takes most base values from `vibrant.css`.

| Token | Hex | Use |
| --- | --- | --- |
| Canvas | `#080808` | customer app background and dark controls |
| Surrounding web backdrop | `#030303` | desktop preview only |
| Primary panel | `#121212` | content cards |
| Alternate panel | `#101010` or `#111111` | banners/service/product cards |
| Border | `#303030` | regular separators |
| Main text | `#F5F6F9` / white | headings and primary content |
| Muted text | `#B7B7B7` | descriptions and secondary labels |
| Cyan | `#2FB3FA` | links, secondary CTA, icon outlines, alternating card edges |
| Magenta | `#E11184` | primary CTA, active chip, points pill, alternating accents |
| Bright magenta text | `#FF56B4` | small accent text |
| Cyan dark text | `#051722` | text on cyan buttons/cards |
| Green semantic | `#79DEB4` | success/status only; avoid replacing brand cyan or magenta |

There is an earlier `:root` in `style.css` with `#08090C`, `#13151B`, `#292C35`, `#A4A8B5`; the final loaded `vibrant.css` overrides the customer palette to the values above. The handbook mentions `#08090C` as concept direction; visually compare using the final cascade, whose canvas is `#080808`. Use the same tokens in native RN and admin where appropriate. Never hardcode colors separately in each screen.

### 3.2 Typography

- Body: **Oxanium**, fallback sans-serif. HTML base is 15 px/1.55; phone shell uses 14 px/1.55. Load real font files in Expo and admin; a system-font substitution changes the visual substantially.
- Display: **Goldman** for italic, uppercase hero statements and selected promotional headings. On measured 390 px home view the hero heading is 32 px, weight 600, line height 34.56 px.
- Common headings in base CSS: `h1` 32 px/600/−1.2 letter spacing, `h2` 22 px/600/−0.5, `h3` 17 px/600. Phone overrides: `h1` about 27 px, `h2` 21 px, `h3` 16 px; later rules give home greeting 25 px.
- Small text 12 px. Eyebrow 11 px, 600, uppercase, letter spacing 2.1 px, cyan. Tiny tags 9–10 px; retain readability under device font scaling.
- Keep short, confident sentence-case copy for body and action labels; use uppercase only for eyebrows/display emphasis. Prices are USD with proper currency formatting. Dates/times use business timezone, not device-local assumptions.

### 3.3 Geometry and spacing

- Phone reference viewport: **390 × 844**. `app-shell` width 390; header 77 px high, sticky; horizontal header padding 18 px; main horizontal padding 19 px and top padding 23 px. At 390 px, content width is 352 px.
- App is vertically scrollable. Reserve space for safe area and fixed bottom navigation on Android/iOS. Avoid body content hidden beneath navigation.
- Measured home hero: x=19, y=176, width=352, height=318, 13 px corner radius, cyan border. Content inset ~25 px. Hero CTA x=44, width=302, height=50, 8 px radius.
- Common `.btn`: 46 px minimum height, padding 13 × 20 px, 8 px radius, 600 weight. Small variant minimum 40 px. Full variant spans container. RN touch target must stay at least 44 px even when visual button is smaller.
- Common panel padding: 18 px phone, dark fill, thin border and rounded corners. Two-column desktop layouts collapse to one column on phone. Service/product grids remain two columns at 390 px with about 11 px gap.
- Section heads have around 26 px top margin and 14 px bottom margin on phone, often with a slim magenta leading accent. Major sections should breathe; do not compress the home into generic flat lists.
- Hero/featured photography uses `cover`, a bottom-to-top dark gradient and white overlaid text. Preserve content placement and contrast even when replacing missing demo images.
- Cards alternate cyan and magenta outlines in selected grids. Cyan is the default icon tile outline; magenta marks an alternate/highlighted tile.
- Breakpoints in the source: 1601, 1100, 800/760, 480, 420, 380 and 350 px. Native app must adapt from narrow 320/350 px devices through tablets; admin web must reflow separately.

### 3.4 Iconography and media

- Source icons are inline 24 × 24 stroke SVGs, mostly 1.6 px rounded strokes. Motifs: home, calendar, car, bag, user, bell, star, arrow/back/chevron, pin, check, shield, gift, chat, clock, plus, document, settings, people, grid, copy, card and sparkle.
- Recreate as consistent stroke icons in RN; avoid mixing filled icon families. Concept-specific chat, gifts and ad icons only appear where a handbook surface still needs an equivalent.
- `logo.webp` is the primary wordmark. On the measured phone header, the HTML sets 123 px width. Splash and Welcome may scale it larger with generous dark negative space.
- Supplied photos `porsche.jpg` and `detail.jpg` may serve as temporary local assets if license/source is confirmed. Never show broken-image alt text in builds. Gallery images come from approved SoFlo sources/admin uploads.

### 3.5 Control states and motion

- Primary button: magenta fill/white label. Secondary: cyan fill/dark label in final cascade. Outline: dark fill/cyan border/cyan label. Destructive confirmations should use explicit copy and a visually distinct destructive treatment.
- Hover in web concept brightens `.btn` via `filter: brightness(1.13)`; nav row hover changes to panel background. Native equivalent is pressed-state opacity/brightness and light haptic feedback for primary actions; do not implement hover-only affordances on phone.
- Active filter chip is magenta fill/border/white label. Inactive chip is near-black with gray border/muted label. Active tab gets magenta underline/border.
- Focus-visible on web buttons/links uses a 3 px cyan outline with 4 px offset. In admin retain keyboard focus and visible ring; on native use accessibility focus and distinct selected state.
- Disabled button opacity is ~0.45. Disabled must also have an explanatory label or nearby text (e.g., points needed), not color alone.
- Source modal: dim full-screen backdrop, rounded dark dialog, title and close icon, first input focused; Escape closes and focus returns to trigger, Tab is trapped. RN equivalent uses accessible modal/sheet with same hierarchy, keyboard handling and return focus.
- Notices use bordered dark blocks; toast/success overlays provide action feedback. Loading uses matching panel skeletons. Error uses the same card plus retry action. Offline uses a persistent banner and preserves draft choices.
- The source declares reduced-motion handling. Honor OS reduced-motion preferences and avoid motion essential to comprehension.

## 4. Global app shell and navigation

### 4.1 Logged-out experience

The concept has no true auth gate; handbook does. Splash shows centered logo over dark canvas. Welcome shows `Your vehicle. Elevated.`, 2–3 concise slides for certified team, protection and rewards, then Sign up and Log in. Services require auth. Sign-up fields: name, email, phone, password, optional referral code. Login: email/password. Forgot: email and reset-confirm state. Use the dark card/control system; error text directly under fields. Preserve logo and premium quiet feel.

### 4.2 Logged-in shell

The HTML header contains logo, a demo tag, notifications and bag/account actions. Shipping app: logo, notification action/badge as appropriate, profile entry; remove DEMO MODE and bag checkout. The concept phone dock uses Home, Book, Garage, Shop, Account; handbook explicitly requires **Home, Bookings, Rewards, Protection, Profile**. Use handbook labels and routes, but retain the concept dock's near-black fill, 5 evenly spaced stroke icons, cyan/magenta active treatment and compact captions. Gallery and Shop open from Home links.

On all navigation: retain scroll position only when expected (back to list), reset to top on new primary tab, avoid blank render during network loads. Push taps deep-link to the relevant booking. Guests attempting a deep link go through login then return to destination.

### 4.3 Content states on every routed screen

The handbook requires skeleton loading, empty, error with retry, offline banner and success for every relevant screen. Use a single state component with screen-specific icon/title/body/action, shaped like the concept's empty `.panel`. Never fake data in production. Show stale cached data labeled as such when offline. Keep all long labels wrapped and support screen readers. Every action must have a real effect or be disabled with a plain reason.

## 5. Customer screen contracts

### 5.1 Home

**Visual anchor:** `#home`; full-page local screenshot evidence `/tmp/soflo-home.png` (temporary capture, not committed). Layout order at 390 px: greeting/points pill, photographic hero with eyebrow and large italic Goldman headline, primary magenta booking CTA, quick tiles, service-grid section, featured-work area, supporting trust/review sections.

**Production composition:** greeting with first name; optional real points pill; next booking/status card if one exists; hero with `Book Now / Schedule` as the sole primary CTA; smaller links to Services, Rewards, Protection records and Gallery; feature/service previews sourced from Urable; a current promo banner only when admin-published; before/after teaser and reviews teaser only when data exists. The concept's long gift/referral/social/ads stack should be shortened to handbook surfaces. Referral teaser may link to Rewards; no 5% promise. Service cards remain two-column, image top, bold name, compact descriptor and arrow. Empty upcoming booking should direct to Book Now.

**Interactions:** Book Now starts service selection; service card opens detail; Rewards/Protection/Gallery quick links navigate; next booking opens its detail. Do not simulate points or bookings. Home must not expose owner mode, track-detailer, AI, partner ads or gift-card purchase.

### 5.2 Services catalog and service detail

**Visual anchor:** `#services`. Header `The right care. Every time.` and subtitle `From a fresh start to long-term protection.` are useful concept copy. Top filter chips; 2-column image cards; alternation of cyan/magenta edges. The concept groups All, Detailing, Protection; production categories use the actual Urable taxonomy while preserving filter styling and client wording for Ceramic Coating, Paint Protection Film, Window Tinting, Mobile Detailing, Paint Correction, Interior Detailing and Exterior Detailing where Urable provides those names.

**Data:** Urable service id, name, category, display price, duration, description, image, eligible location modes, available add-ons and related products. Cache per handbook, surface freshness/Urable error accurately. Never use the concept's invented `Detail Reset` price or `Vehicle-dependent` duration when Urable supplies truth. If price varies, state that plainly and follow supported booking route.

**Detail:** modal or pushed detail screen with image, name, description, included items when verified, duration, price and selectable add-ons/products. Primary CTA starts booking with service held in draft. If Urable requires a quote, show a contact/Urable-supported action only after confirming that behavior; do not build the demo local quote inbox.

### 5.3 Booking wizard

The HTML demonstrates progress steps in rounded panels: selected service/vehicle/extras, date/location, review. Keep its progress strip, card surfaces, selected-service summary and full-width CTA. Implement the handbook's full workflow, with logical screens: (1) service/add-ons/products, (2) vehicle or add new, (3) in-shop/mobile and address, (4) date/time, (5) review/quote/promo/reward, (6) Urable payment, (7) confirmation. An app may visually group steps if all fields and validation remain clear.

**Service step:** preselect from service detail; list available add-ons/products; show quantity where supported; server validates actual eligibility and price. Preserve draft on navigation/errors.

**Vehicle step:** show saved vehicle chips/cards like garage, plus Add vehicle. Make/model/year/color required; plate optional. New vehicle is created in Urable before booking.

**Location step:** mutually exclusive In-shop and Mobile cards. In-shop displays address from config. Mobile requires address and displays configured service area. No hardcoded Miami Shores or shop address. Validate eligibility through supported Urable mechanism.

**Date/time step:** concept date input and three fixed arrival windows are placeholders. Show real Urable availability through a documented endpoint or approved virtual-shop handoff. Month controls, selected day, disabled days, no-slot state, timezone, and slot taken response must all be clear. Never imply a fixed sample slot is reserved.

**Review & pay:** rows for service, extras/products, vehicle, location, date/time, price, promo discount, reward discount, fees/deposit/full amount due, total. Server quote is authoritative and expires after 15 minutes per handbook. Promo errors stay beneath code field. Button text states actual financial action. Urable performs card entry; no card fields or card data in our app/API. The live Urable virtual shop's deposit/convenience-fee behavior should be displayed accurately if that is the selected production route.

**Confirmation:** only after Urable job/payment state is verified. Show job reference, service/vehicle, location, date/time, payment state, Add to calendar and My bookings. Do not create a fake local booking on click. Use idempotency key and guard repeat submits. For an abandoned/unknown handoff, show a neutral pending/lookup state and retry; never falsely confirm.

### 5.4 My bookings

**Visual anchor:** `#appointments`: stacked panel, status pill, date/time/location line, horizontal four-stage visual timeline and action row. Remove arrival-map banner. Add Upcoming and Past tabs. Upcoming card opens full detail; status comes from Urable. Past card offers one-tap Rebook with same service/vehicle and review prompt when eligible. Cancellation is confirmed; if not permitted, show configured shop phone. Use Urable cancellation semantics, not local array deletion. Paid/completed payment receipt appears where available. Empty view uses large calendar icon and Explore services button.

### 5.5 My vehicles

**Visual anchor:** `#garage`: title `Your garage. Protected.`, top Add vehicle button, horizontal chips to switch vehicles, large vehicle image, year/make/model, color, main booking button, shield list. Production splits vehicle CRUD from protection detail while keeping this visual hierarchy. Vehicle edit/delete appear as accessible actions on vehicle detail; deletion asks for confirmation and blocks or explains when upcoming jobs make it unsafe. All vehicles must be verified as the signed-in customer's Urable items. Car, truck, boat and RV input support should follow actual Urable item fields. Avoid fake stock imagery as proof of a specific customer's vehicle.

### 5.6 Protection records

**Visual anchor:** garage's `Protection passport` shield rows and `#history` list rows. Per selected vehicle, list completed protection jobs newest first: ceramic coating, PPF, tint and windshield film; show date, actual installed product, area/coverage, provider, warranty end and linked document/photo when available. Use `Covered until <date>`, `Expired` or `Warranty details coming soon`. Admin may attach warranty details; customer cannot edit them. No fabricated certification or coverage claim. Keep cyan outlined shield icon tile, title/subtitle/detail/chevron. No-protection state invites booking or viewing services.

### 5.7 Rewards and referrals

**Visual anchor:** `#rewards`: bordered/gradient dark card with cyan eyebrow, large balance, progress meter, two-column reward cards, icon tile, points cost and disabled reason; activity list underneath. Replace `850` and +200 demo points with server ledger sum. Rewards and earning settings are admin-configurable. Show earned/redeemed entries, pending vs available as needed, minimum points required and confirmation sheet before redeem. No local decrement. Redemption must be atomic and idempotent.

Referral code belongs on this screen or a linked Rewards subview. Retain copy/share interaction and numbered explanation from `#referrals`, but explain the handbook rule: referral is attached at sign-up; both people receive configured points after the new customer's first completed **paid** job. No 5% discount, $25 credit, friend list simulation or immediate reward on sign-up. Protect against self-referral and duplicates server-side. Screen shows pending/rewarded/rejected status without leaking another customer's information.

### 5.8 Gallery and reviews

**Visual anchor:** home's `Fresh from SoFlo` project cards, category chips, before/after project media, customer review/trust section. Production gallery is an admin-managed grid, with tag filter and true before/after pair slider. Preserve thin cyan/magenta outlines, dark overlays, eyebrow, large vehicle/service title and compact caption. The source's Instagram feed/link/carousel should not be required for the gallery; use uploaded/approved photos.

Reviews list shows average, count, stars, short text and date. Only signed-in owners of completed jobs can write one review per job; show that action in booking detail and review view. Rating 1–5 required, text optional max 1,000 chars, success state. Admin may hide/show, not edit. Empty gallery and reviews states should be distinct.

### 5.9 Shop

**Visual anchor:** `#shop`: title/subtitle, category chips, search, two-column product grid, stylized product art, brand name, price and small action button; product detail modal. Product records come from Urable if usable or admin-managed `shop_products`; no sample PAICAR/FEYNLAB products unless confirmed. `Add to next booking` queues product selection for the booking flow. If no booking draft or eligible upcoming booking, explain that products are purchased with a service and offer Book Now. No independent cart, shipping, delivery, stock counts, order-history screen or standalone charge. Check product eligibility/price server-side at quote time.

### 5.10 Profile

**Visual anchor:** `#account`: avatar/name in panel, stacked labeled inputs and full-width Save, then simple icon/label/chevron rows. Production fields: name, email, phone and appropriate address/contact details; actual auth state. Rows: payment history from Urable, notification settings, contact shop (call/email config), privacy policy, delete account and logout. Keep settings in server database. Notification preferences include service/appointment and promotional pushes; promo opt-out must be respected. Use separate destructive confirmation for account deletion, revoke tokens and anonymize per handbook. Remove owner preview, subscriptions, partner offers, reset demo and local orders.

### 5.11 System views

No internet screen/banner, forced update, maintenance notice and push permission explainer use the same black canvas, logo, rounded bordered panel, icon tile, concise heading, muted explanation and a clear action. Handle notification permission denial without breaking booking. Android back and iOS gestures respect form drafts and modal close behavior.

## 6. Admin web visual and functional contract

The concept's owner pages demonstrate dark panels, cyan eyebrow, page heading, stat tiles, searchable tables, status badges and action buttons. Use that density/style for a separate React/Vite admin web app. The customer app must never expose admin navigation. Admin auth is separate and there is no public admin sign-up.

| Admin route | Required content and actions | Concept visual to borrow |
| --- | --- | --- |
| Login | Email, password, error/lockout, logout | Dark centered panel, logo and magenta CTA |
| Dashboard | Users, bookings this week, points issued, active promos | `owner` stat cards; no demo invoices/leads |
| Promo codes | List, create, edit, deactivate, usage and constraints | Search/table/chip/badge styling |
| Loyalty & rewards | Points-per-dollar setting, reward CRUD, redemption code and mark used | Reward cards, stat rows, modal form |
| Referrals | Reward points setting, status/rejection list | Owner table and status badges |
| Reviews | List, hide/show, no edit of customer text | Table, detail panel and badge |
| Gallery | Before/after upload, caption, tags, sort order, publish | Featured work cards and upload form |
| Protection records | Search customer/vehicle, add/edit warranty | Owner customer search and shield records |
| Shop products | CRUD only when Urable cannot supply products | Product cards/table, no inventory management |
| Push | Promo title/body/deep link, send and history | Dark form, confirmation and history table |
| Settings | Contact, address, mobile area, reminder hour, min version, category mapping | Settings form groups |

All admin mutations require validation, success/error feedback and audit attribution. No card numbers, Urable key, raw refresh tokens or full sensitive addresses in admin logs.

## 7. Data and integration contracts

### 7.1 Ownership and sources

Urable owns customer, vehicle/item, service/product, job, order and payment records. PostgreSQL owns users/auth links, job sync metadata, notification preferences/tokens, promo rules and reservations, points ledger, reward redemptions, referrals, reviews, gallery metadata, warranties, fallback shop products and settings. Supabase Storage owns approved gallery and warranty files. The mobile app calls only our API; the Urable key remains server-side.

### 7.2 API mapping

Implement the handbook Section 6 routes exactly or add a documented adapter where a route must differ. The mobile app needs `GET /config`, auth/signup/login/refresh/forgot/reset, `/me`, `/services`, `/vehicles`, `/availability` or supported fallback, `/bookings/quote`, `/bookings`, `/bookings/:id/pay`, `/bookings/:id/cancel`, `/rewards`, `/me/points`, `/me/referral`, `/reviews`, `/gallery`, `/protection`, `/shop/products`, and push-token registration. Admin routes cover Section 5.3. Use one error envelope `{ error: { code, message, details } }` and app behavior from Section 6.

### 7.3 Booking integration reality

Public Urable API test created and cancelled a test job. The observed public OpenAPI did not offer availability or hosted payment URL for an API-created job. The account's existing virtual shop can show service choice, time slots and card checkout, so it is the practical initial slot/payment surface, with a server-side verified job handoff. This is an implementation detail, not a reason to replace Urable or change customer-facing design. Keep a branded wrapper and persist the selected draft; avoid implying confirmation until job identity and payment state are matched. If a concrete Urable issue appears, document the failing request and choose the smallest supported fallback then.

### 7.4 Server invariants

- Every customer data read/mutation checks ownership. Never trust an Urable id supplied by a client without checking the linked customer.
- Every money-related value is calculated or verified on the server; mobile displays returned totals only.
- Quote validity 15 minutes; booking idempotency key; no duplicate jobs from taps/retries.
- Points ledger append-only, one earn per completed paid Urable job, atomic redemption, reversal entry on qualifying refunds/cancellations.
- Promo validation and reservation in a transaction, with first-booking/user/total limits and rate limits.
- Referral reward only on the first completed paid job and only once per referral; abuse constraints from handbook.
- Status sync and reminder jobs are idempotent, use shop timezone, respect preferences and maintain notification log.
- Reviews are unique per job and server-enforced to own completed jobs.
- Sensitive secrets stay in server env; never bundle them in Expo, web admin, logs or repository.

## 8. Acceptance and visual fidelity protocol

1. Compare the RN app against the locally served HTML at 390 × 844, 350 × 760 and a larger phone. Match safe-area-adjusted header, content width, hero proportions, typography, colors, cards, control radius, icon strokes and spacing. Use image captures for each screen/state; source screenshots are guidance, not a substitute for live comparisons.
2. Verify the final font files render. The saved snapshot's missing images mean photographic fidelity must be checked again with approved source photos.
3. Walk every clickable in-scope action. No demo-only button, broken link, localStorage-only mutation or placeholder points/prices remains.
4. For each required screen, test loading, empty, error/retry, offline and success where meaningful; test keyboard/screen reader, large text and narrow phone width.
5. Execute an actual Urable test lifecycle: sign up/link customer, vehicle CRUD, book, pay through supported Urable flow, verify ownership/job status, cancel or complete, points/referral/review where appropriate. Clean up test records safely.
6. Review app and admin against the handbook Section 9 checklist. A visually accurate shell without an end-to-end booking/payment is not Milestone A.

## 9. Known source gaps and explicit decisions

- Core concept photos are now available in `docs/assets/` and the corresponding mobile assets; dynamic featured-work/Instagram imagery remains incomplete. Use only approved client photos for final Gallery content. The UI should never ship with broken image boxes.
- Oxanium/Goldman are specified by the concept's CSS/Google Fonts link; bundle licensed files locally for reliable native rendering and offline use.
- The concept advertises a 5% referral discount and sample 1,000-point rewards. Handbook says points for both users after a first completed paid referral job; reward amounts are configurable. Treat all concept numerical offers as visual samples.
- The concept's three fixed time options are illustrative. Actual availability and payment must be Urable-backed.
- The concept's owner module includes many excluded tools; admin Section 5.3 is the exact allowed scope.
- The handbook calls for a full-payment Review & pay while the tested virtual shop sample showed a deposit and convenience fee. Render the actual Urable amount and payment terms; record any unresolved copy/business rule with Ali when it affects an implemented screen.
- The handbook's dates and weekdays disagree in 2026. Engineering uses its sequence and acceptance gates while schedule owner resolves the calendar labels.

## Appendix A. Concept route and action inventory

This appendix is generated from the actual browser-rendered saved concept. Actions are retained here for traceability; Section 2 determines whether they ship.

### A.home: `#home`

- Browser title: `Home | SoFlo Suds`.
- Visible content sequence: `Hi, Marco.` → `Your vehicle. Elevated.` → `850 pts` → `MIAMI-DADE & BROWARD` → `GREAT CARE.` → `EVERY SURFACE.` → `Detailing, ceramic coating and paint protection built around your vehicle.` → `Book your service` → `Explore ceramic protection` → `My garage` → `Appointments` → `Track detailer` → `All features` → `Care that fits your vehicle.` → `All services` → `Detail Reset` → `Explore service` → `Ceramic Coating` → `Request a quote` → `Paint Protection Film` → `Request a quote` → `Interior Renewal` → …
- Button/action map:
  - `go:rewards` — 850 pts.
  - `go:services` — Book your service.
  - `service:ceramic` — Explore ceramic protection.
  - `go:garage` — My garage.
  - `go:appointments` — Appointments.
  - `go:track` — Track detailer.
  - `go:explore` — All features.
  - `go:services` — All services.
  - `service:reset` — Detail Reset Explore service.
  - `service:ceramic` — Ceramic Coating Request a quote.
  - `service:ppf` — Paint Protection Film Request a quote.
  - `service:interior` — Interior Renewal Explore service.
  - `project-filter:All` — All.
  - `project-filter:Detailing` — Detailing.
  - `project-filter:Ceramic Coating` — Ceramic Coating.
  - `project-filter:PPF` — PPF.
  - `service:interior` — Give my vehicle this care.
  - `project-prev` — icon-only control.
  - `project-next` — icon-only control.
  - `go:referrals` — Refer a Friend & Save.
  - `go:subscriptions` — Your maintenance routine Explore recurring care and househol.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:home` — icon-only control.
  - `ad-next:home` — icon-only control.
- Links: `#projects` (View projects), `https://www.instagram.com/reel/Dej2gQhRDlS/` (Watch the project on Instagram), `#giftcards` (Buy Gift Cards), `https://soflosuds.com/reviews/` (Read customer reviews), `https://g.page/r/CSWJLiEPVmeYEBE/review` (Leave a Google review), `https://www.instagram.com/soflosuds/` (@soflosuds), `https://www.instagram.com/soflosuds/` (Instagram), `https://www.facebook.com/soflosuds/` (Facebook), `https://www.tiktok.com/@soflosuds` (TikTok), `https://www.youtube.com/channel/UCpyVPzcJa5KelFF-VwhuxHA` (YouTube), `https://x.com/soflosuds` (X), `#social` (View more), `https://www.instagram.com/reel/Dej2gQhRDlS/` (REEL You see a Porsche. We see every detail everyone else mi), `https://www.instagram.com/reel/Deh_UBaAks8/` (REEL A truck this big deserves attention to the smallest det).


### A.services: `#services`

- Browser title: `Book a service | SoFlo Suds`.
- Visible content sequence: `The right care. Every time.` → `From a fresh start to long-term protection.` → `All` → `Detailing` → `Protection` → `Detail Reset` → `Refresh · Rejuvenate · Protect` → `Explore service` → `Clay & Protect` → `Decontaminate · Smooth · Protect` → `Explore service` → `Interior Renewal` → `Deep Clean · Refresh · Restore` → `Explore service` → `Ceramic Coating` → `Gloss that goes further` → `Request a quote` → `Paint Correction` → `Restore clarity. Refine the finish.` → `Request a quote` → `Paint Protection Film` → `Protect what drives you` → …
- Button/action map:
  - `service-filter:All` — All.
  - `service-filter:Detailing` — Detailing.
  - `service-filter:Protection` — Protection.
  - `service:reset` — Detail Reset Refresh · Rejuvenate · Protect Explore service.
  - `service:clay` — Clay & Protect Decontaminate · Smooth · Protect Explore serv.
  - `service:interior` — Interior Renewal Deep Clean · Refresh · Restore Explore serv.
  - `service:ceramic` — Ceramic Coating Gloss that goes further Request a quote.
  - `service:correction` — Paint Correction Restore clarity. Refine the finish. Request.
  - `service:ppf` — Paint Protection Film Protect what drives you Request a quot.
  - `service:tint` — Ceramic Window Tint Comfort. Privacy. Clarity. Request a quo.
  - `go:messages` — Ask the team.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:services` — icon-only control.
  - `ad-next:services` — icon-only control.


### A.booking: `#booking`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `Your next clean starts here.` → `Build your appointment request.` → `1. Vehicle & extras` → `2. Date & location` → `3. Review` → `Your vehicle & extras` → `Choose your vehicle` → `2024 Porsche 911 Carrera S` → `2025 BMW X7` → `Service` → `Detail Reset` → `Clay & Protect` → `Interior Renewal` → `Make it yours` → `Engine Bay Detail` → `Price confirmed with your quote` → `Glass Protection` → `Price confirmed with your quote` → `Leather Protection` → `Price confirmed with your quote` → `Condition or special requests` → `Choose a time` → …
- Button/action map:
  - `go:services` — Services.
  - `booking-next` — Choose a time.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:booking` — icon-only control.
  - `ad-next:booking` — icon-only control.


### A.garage: `#garage`

- Browser title: `My garage | SoFlo Suds`.
- Visible content sequence: `Your garage. Protected.` → `Every vehicle. Every service. One place.` → `Add vehicle` → `Porsche 911 Carrera S` → `BMW X7` → `2024 Porsche 911 Carrera S` → `Jet Black · Demo vehicle record` → `Photos and installed protection are sample records for exploring the app.` → `Book for this vehicle` → `Protection passport` → `Ceramic coating` → `Paint & body protection` → `Coating care matters` → `Paint protection film` → `Full front coverage` → `Inspection recommended` → `Ceramic window tint` → `Sides & rear` → `Follow film care guidance` → `Service history` → `Care instructions` → `Maintenance plan` → …
- Button/action map:
  - `add-vehicle` — Add vehicle.
  - `vehicle:0` — Porsche 911 Carrera S.
  - `vehicle:1` — BMW X7.
  - `go:services` — Book for this vehicle.
  - `passport:Ceramic coating` — Ceramic coating Paint & body protection Coating care matters.
  - `passport:Paint protection film` — Paint protection film Full front coverage Inspection recomme.
  - `passport:Ceramic window tint` — Ceramic window tint Sides & rear Follow film care guidance.
  - `go:history` — Service history.
  - `go:care` — Care instructions.
  - `go:membership` — Maintenance plan.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:garage` — icon-only control.
  - `ad-next:garage` — icon-only control.


### A.rewards: `#rewards`

- Browser title: `Suds rewards | SoFlo Suds`.
- Visible content sequence: `Good care deserves more.` → `Your proposed Suds Rewards experience.` → `YOUR AVAILABLE POINTS` → `850 POINTS` → `150 points to a 1,000-point reward` → `A little something for you` → `$25 service credit` → `Put your points toward a future eligible service.` → `1,000 points` → `1,000 points needed` → `Complimentary add-on` → `Choose from eligible add-ons at your next visit.` → `1,000 points` → `1,000 points needed` → `Test the reward experience` → `Add 200 demo points to try redeeming a reward.` → `+200 points` → `Your reward activity` → `Welcome demo balance` → `+850` → `Illustrative rewards only. Earning rules, exclusions and redemption terms are not finalized.` → `AD SPACE AVAILABLE` → …
- Button/action map:
  - `redeem:credit` — 1,000 points needed.
  - `redeem:addon` — 1,000 points needed.
  - `demo-points` — +200 points.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:rewards` — icon-only control.
  - `ad-next:rewards` — icon-only control.


### A.shop: `#shop`

- Browser title: `Product shop | SoFlo Suds`.
- Visible content sequence: `Bring the SoFlo feeling home.` → `Build a better routine between details.` → `Cart` → `THE CARE COLLECTION` → `Your finish. Your care kit.` → `Explore sample PAICAR, FEYNLAB and accessory collections.` → `Sample catalog, bottle artwork and prices. Supplier SKUs, stock and product directions are not conne` → `Search products` → `Search` → `All` → `PAICAR` → `FEYNLAB` → `Accessories` → `PAICAR` → `DEMO` → `WASH` → `PAICAR` → `Wash Shampoo` → `Sample product · Demo price` → `$16.99` → `PAICAR` → `DEMO` → …
- Button/action map:
  - `go:cart` — Cart.
  - `shop-filter:All` — All.
  - `shop-filter:PAICAR` — PAICAR.
  - `shop-filter:FEYNLAB` — FEYNLAB.
  - `shop-filter:Accessories` — Accessories.
  - `product:wash` — PAICAR DEMO WASH.
  - `cart-add:wash` — icon-only control.
  - `product:tire` — PAICAR DEMO WHEELS.
  - `cart-add:tire` — icon-only control.
  - `product:interior-cleaner` — PAICAR DEMO INTERIOR.
  - `cart-add:interior-cleaner` — icon-only control.
  - `product:ceramic-care` — FEYNLAB DEMO WASH.
  - `cart-add:ceramic-care` — icon-only control.
  - `product:topper` — FEYNLAB DEMO PROTECTION.
  - `cart-add:topper` — icon-only control.
  - `product:towel` — SOFLO ESSENTIALS DEMO ACCESSORIES.
  - `cart-add:towel` — icon-only control.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:shop` — icon-only control.
  - `ad-next:shop` — icon-only control.


### A.cart: `#cart`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `Your care kit.` → `Review your sample order before checkout.` → `A fresh start for your cart.` → `Explore the sample care collection.` → `Browse products` → `AD SPACE AVAILABLE` → `YOUR COMPANY HERE` → `Put your brand in the driver’s seat.` → `Reach the SoFlo community with a featured banner on our app.` → `Advertise with us` → `1 / 4`.
- Button/action map:
  - `go:shop` — Browse products.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:cart` — icon-only control.
  - `ad-next:cart` — icon-only control.


### A.appointments: `#appointments`

- Browser title: `Appointments | SoFlo Suds`.
- Visible content sequence: `ARRIVAL TRACKING` → `See your SoFlo vehicle on the map.` → `Try the journey from confirmed to complete.` → `Track detailer` → `Your next clean, organized.` → `Appointment requests created in this demo.` → `Your next visit starts here.` → `Create a demo booking to see the appointment timeline.` → `Explore services` → `AD SPACE AVAILABLE` → `YOUR COMPANY HERE` → `Put your brand in the driver’s seat.` → `Reach the SoFlo community with a featured banner on our app.` → `Advertise with us` → `1 / 4`.
- Button/action map:
  - `go:track` — Track detailer.
  - `go:services` — Explore services.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:appointments` — icon-only control.
  - `ad-next:appointments` — icon-only control.


### A.referrals: `#referrals`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `Send a friend. Save on your next job.` → `When your referred friend books, you earn 5% off your next service.` → `YOUR REFERRAL REWARD` → `5% OFF` → `One next SoFlo Suds job after your friend books.` → `YOUR DEMO CODE` → `SOFLOMARCO` → `Copy code` → `A good introduction goes further.` → `1` → `Share your referral code` → `Your friend enters it when booking.` → `2` → `Your friend books` → `That booking qualifies your referral.` → `3` → `You get 5% off your next job` → `Apply one referral reward to one service.` → `Preview my invitation` → `Friends added` → `0` → `Booked referrals` → …
- Button/action map:
  - `copy-code` — Copy code.
  - `new-invite-preview` — Preview my invitation.
  - `add-friend` — Add demo friend.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:referrals` — icon-only control.
  - `ad-next:referrals` — icon-only control.


### A.notifications: `#notifications`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `You’re in the loop.` → `Sample appointment, vehicle and reward updates.` → `Appointment reminders` → `See your upcoming service details in one place.` → `Your quotes` → `Review requested services and scope.` → `Rewards are waiting` → `Explore your points and proposed rewards.` → `Keep your protection cared for` → `View your maintenance options.` → `Order updates` → `View your sample shop orders.` → `Make notifications yours` → `Appointment & service updates` → `Offers & promotional messages` → `These are local preference controls. No push notification service is connected.`.
- Button/action map:
  - `go:appointments` — Appointment reminders See your upcoming service details in o.
  - `go:quotes` — Your quotes Review requested services and scope..
  - `go:rewards` — Rewards are waiting Explore your points and proposed rewards.
  - `go:membership` — Keep your protection cared for View your maintenance options.
  - `go:orders` — Order updates View your sample shop orders..


### A.account: `#account`

- Browser title: `My account | SoFlo Suds`.
- Visible content sequence: `A great gift for their ride.` → `Explore SoFlo Suds gift cards.` → `Buy Gift Cards` → `Subscriptions` → `Refer & save 5%` → `Partner offers` → `All features` → `Your SoFlo, your way.` → `Manage your demo profile and explore every feature.` → `MA` → `Marco` → `Customer profile · Demo` → `First name` → `Email (optional)` → `Preferred service area` → `Save demo profile` → `Stored only in this browser. Use sample information while testing.` → `Suds rewards` → `Maintenance club` → `Appointments` → `My quote requests` → `Invoices & payments` → …
- Button/action map:
  - `go:subscriptions` — Subscriptions.
  - `go:referrals` — Refer & save 5%.
  - `go:partners` — Partner offers.
  - `go:explore` — All features.
  - `go:rewards` — Suds rewards.
  - `go:membership` — Maintenance club.
  - `go:appointments` — Appointments.
  - `go:quotes` — My quote requests.
  - `go:payments` — Invoices & payments.
  - `go:orders` — Shop orders.
  - `go:offers` — Offers, gifts & events.
  - `go:referrals` — Refer a friend.
  - `go:notifications` — Notification preferences.
  - `go:owner` — Owner dashboard preview.
  - `reset-demo` — Reset all demo data.
- Links: `#giftcards` (Buy Gift Cards).


### A.orders: `#orders`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `Your orders.` → `Sample orders stored on this device.` → `Your care kit is waiting.` → `Place a demo order to explore this screen.` → `Shop the collection`.
- Button/action map:
  - `go:shop` — Shop the collection.


### A.quotes: `#quotes`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `Your protection plans.` → `Quote requests created in the prototype.` → `Start with your goals.` → `Explore ceramic coating, paint correction, PPF or tint.` → `Explore protection`.
- Button/action map:
  - `go:services` — Explore protection.


### A.history: `#history`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `A record of great care.` → `Illustrative service history for Porsche 911 Carrera S` → `Ceramic Coating & Preparation` → `Protection installation · Sample record` → `Maintenance Detail` → `Interior and exterior care · Sample record` → `AD SPACE AVAILABLE` → `YOUR COMPANY HERE` → `Put your brand in the driver’s seat.` → `Reach the SoFlo community with a featured banner on our app.` → `Advertise with us` → `1 / 4`.
- Button/action map:
  - `history-record` — Ceramic Coating & Preparation Protection installation · Samp.
  - `history-record` — Maintenance Detail Interior and exterior care · Sample recor.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:history` — icon-only control.
  - `ad-next:history` — icon-only control.


### A.care: `#care`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `Protect the finish you love.` → `General care pointers. Follow your installed product’s instructions.` → `Wash with care` → `Use suitable wash products, clean tools and gentle techniques. Ask your installer for product-specif` → `Keep a consistent routine` → `Regular maintenance helps remove contamination and gives us a chance to assess the finish.` → `Check your documents` → `Curing times, maintenance requirements and warranty coverage vary by product and installation.` → `Ask before treating a mark` → `Send photos before trying abrasive or aggressive treatments on protected surfaces.` → `Ask about my protection` → `AD SPACE AVAILABLE` → `YOUR COMPANY HERE` → `Put your brand in the driver’s seat.` → `Reach the SoFlo community with a featured banner on our app.` → `Advertise with us` → `1 / 4`.
- Button/action map:
  - `go:messages` — Ask about my protection.
  - `ad-open:advertise-slot` — Advertise with us.
  - `ad-prev:care` — icon-only control.
  - `ad-next:care` — icon-only control.


### A.payments: `#payments`

- Browser title: `SoFlo Suds | SoFlo Suds`.
- Visible content sequence: `Simple, from quote to receipt.` → `An illustrative invoice and payment experience.` → `Detail Reset` → `SAMPLE INVOICE` → `Demo invoice SS-1001 · Porsche 911 Carrera S` → `Sample service` → `$200.00` → `Sample deposit` → `−$50.00` → `Demo balance` → `$150.00` → `Illustrative amounts only. No payment processor is connected and no financial information is request` → `Simulate payment` → `Your payment history` → `A live connection would display deposits, invoices, receipts and outstanding balances from your serv`.
- Button/action map:
  - `payment-demo` — Simulate payment.

## Appendix B. Screen-by-screen state and action matrix

The following rows are implementation acceptance criteria, including states absent from the clickable demo. The target route names are product routes, not necessarily the HTML hashes.

### B.1 Splash, Welcome and authentication

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| Splash first launch | Centered supplied logo, black canvas, no demo badge | Determine signed-in status, then Welcome or Home. |
| Splash returning user | Same logo, brief transition | Refresh token securely, then Home or Login. |
| Welcome slide 1 | Logo, `Your vehicle. Elevated.`, premium photo/gradient | Swipe or Next. |
| Welcome slide 2 | Certified care/protection message | Swipe or Next. |
| Welcome slide 3 | Rewards and simple booking message | Sign up or Log in. |
| Sign-up default | Name, email, phone, password, optional referral | Submit through API; password obscured and reveal toggle. |
| Sign-up field error | Under-field plain-language error; input border accent | Correct field without losing others. |
| Sign-up email taken | Email-level message and Log in link | Navigate with email preserved. |
| Sign-up invalid referral | Referral-level error, ability to clear | Retry or continue without a code. |
| Sign-up success | Branded success panel | Continue authenticated if API returns session. |
| Login default | Email, password, forgot link | Authenticate, store rotated session in SecureStore. |
| Login wrong password | Error near password and safe retry | Never reveal whether a third-party account exists beyond approved API code. |
| Forgot submitted | Confirmation that reset instructions were sent | Back to Login. |
| Reset expired | Error card | Request another reset link. |
| Logout | Confirmation only if a draft would be lost | Revoke/clear tokens, return Welcome. |

### B.2 Home and discovery

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| First customer visit | Greeting, no-booking state, dominant Book Now | Start service choice. |
| Upcoming job | Next visit card with real status/date/vehicle | Open booking detail. |
| Booking in progress | Resumable draft/pending confirmation card | Resume or verify outcome. |
| Active promo | Admin-published banner using concept's magenta/cyan treatment | Open eligible service or promo details. |
| No promo | No empty ad slot | Remaining cards close naturally. |
| Service data loading | Two-column skeleton cards | Wait for API; primary booking CTA remains understandable. |
| Service data unavailable | Dark bordered error card | Retry; do not display concept sample catalog. |
| Gallery empty | Small link/section may disappear | Main booking flow remains intact. |

### B.3 Service selection and details

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| Catalog loaded | Header, category chips, two-column cards | Select filter, then service. |
| Filter with zero matches | Empty card with reset filter | Return to All. |
| Service detail loaded | Hero image, name, verified description, duration, price, included items | Choose add-ons/products, Book Now. |
| Service with variable price | Clear quote/estimate copy from Urable | Follow supported booking path; no invented total. |
| Service ineligible for mobile | Disabled/hidden Mobile location with reason | Choose In-shop. |
| Add-on changed | Selected treatment and updated server-backed estimate when available | Preserve in booking draft. |
| Product added | Count/selected indicator, no independent checkout | Include in booking quote. |
| Urable catalog error | Bordered error state and retry | Keep previous valid draft without fabricating price. |

### B.4 Vehicle management

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| No vehicles | Car icon tile, brief copy, Add vehicle CTA | Open form. |
| Vehicle list | Chips or cards, selected car details | Switch selected vehicle. |
| Add vehicle | Make, model, year, color, optional plate/type | Validate and create Urable item. |
| Add failure | Form stays populated, error/retry | No local-only vehicle shown. |
| Edit vehicle | Existing values in dark form | Save through API; refreshed Urable item appears. |
| Delete request | Confirmation naming vehicle | Delete only if safe and authorized. |
| Delete blocked by upcoming job | Explanation and route to booking/contact | Keep vehicle. |
| Ownership mismatch | Generic unavailable state | Never expose another customer's item. |

### B.5 Booking location and schedule

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| In-shop selected | Cyan/magenta selected card, config shop address | Continue. |
| Mobile selected | Selected card, address field, service-area text | Continue only after validation. |
| Mobile address missing | Under-field error | Remain on step. |
| Date calendar loading | Month grid skeleton/spinner | Keep service/location/vehicle. |
| Day unavailable | Muted disabled day | Explain if selected by deep link. |
| Day with slots | Actual available times | Select exactly one. |
| No slots | Empty card, nearby dates or date picker | Change day. |
| Slot taken on confirm | `SLOT_TAKEN` banner and next three options | Select a new time. |
| Urable schedule unavailable | `URABLE_UNAVAILABLE` and Try again | Preserve selections. |
| Virtual-shop handoff | Branded loading/wrapper with explanatory copy | Open supported Urable booking/payment UI. |
| Handoff abandoned | Pending/unknown state, no fake booking | Retry lookup or return to draft. |

### B.6 Review, payment and confirmation

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| Quote loading | Summary-row skeletons | Wait for server quote. |
| Quote loaded | Item lines, discounts, fees, due now and later, total | Apply code/reward or Pay. |
| Promo valid | Discount row, successful field note | Continue with server quote. |
| Promo invalid/limited | Exact handbook API code mapped to field copy | Edit/clear code. |
| Reward ineligible | Disabled choice and points-needed explanation | Continue without reward. |
| Quote expired | Notice and Refresh total | Get new quote before payment. |
| Payment processing | Full-width disabled button and progress | Prevent second job/charge. |
| Payment authentication | Hosted Urable view/redirect with branded surrounding state | Return to app via supported callback/verification. |
| Payment failed | Error card, retry or another supported Urable method | No confirmed state. |
| Payment pending | Neutral status, booking lookup | Poll safely without duplicate create. |
| Confirmed | Job reference, details, payment state, Add to calendar | Open My bookings. |

### B.7 My bookings and history

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| No bookings | Calendar icon, `Your next visit starts here.` | Explore services. |
| Upcoming list | Cards with real status chip and date/vehicle | Open detail. |
| Past list | Completed/cancelled cards | Open receipt/review/rebook as eligible. |
| Status updated | Timeline step and timestamp update | Show only Urable-confirmed status. |
| Rebook | Same service/vehicle preselected | Re-run live price/availability; no automatic charge. |
| Cancel allowed | Confirmation sheet and result toast | API cancels Urable job and refreshes list. |
| Cancel forbidden | `CANCEL_NOT_ALLOWED`, shop phone | Offer call action. |
| Review eligible | Write review action | Open rating form. |
| Review already exists | Existing review summary, no second submit | Open read-only review. |
| Offline cached list | Banner and last synced time | Disable destructive actions until online. |

### B.8 Protection, rewards and referral

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| No protection jobs | Shield icon, no-record message | Browse protection services. |
| Protection record | Product, scope, applied date, warranty deadline | Open details/document. |
| Warranty pending | `Warranty details coming soon` | Do not invent expiry. |
| Warranty expired | Expired badge and date | Display historical record, contact shop. |
| Rewards empty | Zero balance and no reward configured message | Show how earning works. |
| Rewards available | Balance, progress, reward cards, ledger | Select redemption. |
| Points insufficient | Disabled action and shortfall count | No server mutation. |
| Redeem success | Code/status and negative ledger entry | Refresh balance. |
| Redeem duplicate | Same redemption result | Avoid second debit. |
| Referral pending | Code, share, pending status | Explain first paid completion condition. |
| Referral awarded | Both-side award shown in own ledger | No other customer's private details. |
| Referral rejected | Status/reason if safe to display | No points issued. |

### B.9 Gallery, reviews, shop and profile

| Surface/state | Visible UI | Action/result |
| --- | --- | --- |
| Gallery list | Before/after cards, tags and captions | Filter/open project. |
| Gallery project | True draggable before/after split with labels | Close/back preserves list. |
| Gallery empty | Camera/image icon card | No fake Instagram preview. |
| Review list | Rating summary and published review cards | Open eligible write flow. |
| Review form | 1–5 rating, optional text ≤1000 chars | Submit once for completed own job. |
| Review moderation hidden | Review disappears publicly | Owner still sees own status per product decision. |
| Shop loaded | Search/chips/product cards | Open detail, Add to next booking. |
| Shop empty | Bag icon and explanation | Return to Home/Book. |
| Shop product unavailable | Disabled add with reason | No invented product substitution. |
| Profile edit | Populated name/email/phone/contact fields | Save and refresh. |
| Payment history | Actual Urable invoices/payments | Open receipt/status, no card details. |
| Notification settings | Two dark toggle rows | Persist to API. |
| Contact shop | Config phone/email actions | Call or mail external app. |
| Privacy policy | Published policy text/link | Open in accessible viewer/browser. |
| Delete account | Destructive confirmation | API anonymizes/revokes; return Welcome. |

### B.10 Admin acceptance details

| Admin area | Empty/loading/error requirement | Critical validation |
| --- | --- | --- |
| Dashboard | Skeleton stats, data error/retry | Time window labeled in shop timezone. |
| Promo codes | No-promo empty CTA, table loading/error | Date window, min order, per-user/total limits, first-booking flag. |
| Rewards | No-reward empty CTA, ledger/redeem loading | Numeric settings, nonnegative costs, no direct ledger edit. |
| Referrals | No-referral state, status filter | One code/link per referee, paid-first-job rule. |
| Reviews | No-review state, publish status | Hide/show only; text cannot be edited. |
| Gallery | Empty gallery CTA, upload progress/error | Before/after pair, caption, tag, order, publish. |
| Protection | No warranty state and vehicle search error | Vehicle/customer relationship and dates. |
| Shop products | Empty CTA only for fallback catalog | Price, active status, booking eligibility. |
| Push | No-history state, send progress/error | Preference filter, daily promo limit, deep-link validation. |
| Settings | Load error and unsaved-change state | Address, contact, timezone, version and category mapping. |
