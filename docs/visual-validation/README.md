# Concept UI validation — 22 October 2026

The [Developer Handbook](../SoFlo%20Suds%20-%20Developer%20Handbook.pdf) decides features and flow. The client's saved [concept HTML](../soflo.html) decides the visual language where those features overlap. This review compares the rendered HTML and the Expo web preview at 390 px, then checks the app at 350 px and 320 px. The UI mockup PDF remains a separate workstream.

## Evidence and method

- The original eight long concept captures are in [`docs/concept`](../concept/). The app captures are in [`390`](390/) and [`350`](350/). They use marked fixture data through a Playwright API intercept; no customer, booking, payment, or Urable record was created to make the screenshots.
- From the repository root, start Expo web on port 8082 and run `npm run visual:capture`. The script requires Google Chrome at `/usr/bin/google-chrome` (or `CHROME_PATH`) and the mobile `.env` API URL set to `http://localhost:3000`. It writes screenshots and [`results.json`](results.json).
- The repeatable run checked 47 rendered cases: 19 signed-in routes at 390 px, four key routes at 350 px, 19 signed-in routes at 320 px, and five signed-out routes at 390 px. Each had a response, visible content, no document-level horizontal overflow, and no browser console/page error.
- Admin dashboard was separately checked at 1365 px and 390 px using fixture counts: [desktop](admin/dashboard-desktop.png), [phone](admin/dashboard-mobile.png). Neither had overflow or browser errors.

## Comparison against the concept

| Surface | Visual result | Handbook-controlled differences and remaining work |
| --- | --- | --- |
| Shared customer shell | Black `#080808` canvas, supplied logo, cyan 2 px header rule, Oxanium body, Goldman display, 19 px page inset, dark cards, magenta primary/cyan secondary controls and five-item dock are in place. Back control now matches the inner concept pages. | The handbook's tabs are Home, Bookings, Rewards, Protection and Profile. Concept Book, Garage, Shop and Account labels are not carried into the dock. Demo tag and bag/cart entry are removed. |
| [Home](390/home.png) | The client hero photo now renders at the correct scale. At 390 px, hero starts at x≈19/y≈174, spans 352×320 px, and the CTA starts at x≈44/y≈379 with a 302×50 px footprint. The reference hero is x≈19/y≈176, 352×318 px, with its CTA at x≈44/y≈379. Greeting, points pill, shortcuts, service cards and section start follow the reference spacing. | Live name, points, service names and card imagery can change. Mobile area text comes from settings. Demo promos, track-detailer, ads, gift-card purchase, social feed, assistant/chat and maintenance club are omitted. Real content needs a final pass. |
| [Services](390/services.png) | Title, subtitle, filter chips, two-column image cards, alternating cyan/magenta outlines and compact card labels follow the reference. The narrow layout wraps without overflow. | Categories, names, prices and descriptions come from Urable. The concept's made-up packages and quote prices are not shown. Actual service photo mappings need client approval. |
| [Booking](390/booking.png) | Three-line step indicator, vehicle selection, service field and dark form card now follow the concept's first-step composition. Location options keep the same bordered-card language. | Handbook requires a real Urable booking and payment. The concept's local demo add-ons and fake review/payment are excluded; the Urable WebView provides slot, address and payment choices. Device checkout and job-link verification remain open. |
| [Bookings](390/bookings.png) | Title, upcoming/past tabs, cards and empty-state treatment use the concept's type, spacing and colors. | Arrival map/tracking and partner ad are excluded. Live job content and the completion timeline need device verification. |
| [Rewards](390/rewards.png) | Balance panel has a cyan-to-magenta border and progress bar; reward cards, referral area and section headings use the concept treatment. | Points and reward threshold are calculated from the account and admin catalog. The concept's fixed 850/1,000 sample and 5% referral promise are excluded. |
| [Vehicles and protection](390/vehicles.png) / [protection](390/protection.png) | Dark garage/protection cards, cyan vehicle actions and display hierarchy are present. | The concept's sample Porsche image/records are excluded. Urable vehicle records have no approved customer photo yet; showing the sample Porsche for every account would be wrong. Protection records need real completed jobs and warranties. |
| [Gallery](390/gallery.png) | Alternating accent cards, before/after image treatment and customer-review section use the concept theme. | Images and reviews are admin/customer data. A draggable before/after slider is still to be implemented and checked on device. |
| [Shop](390/shop.png) | Two-line headline, cyan intro card, search/chips and two-column product cards are in place; image URLs render when supplied. | The concept's cart, delivery and gift-card checkout are excluded. Actual chargeable physical products and add-to-booking integration are unresolved. |
| [Profile](390/profile.png) | Account card, cyan icon tiles and row navigation use the concept's dark panel language. | Gift cards, subscriptions, partner offers and demo profile fields are excluded. Required profile, payment, notification, privacy and deletion routes are added. |
| [Welcome](390/welcome.png), [login](390/login.png), [signup](390/signup.png) | Handbook-only authentication screens extend the logo, typography, photo, field and button system from the concept. A 1400 px web image overflow on Welcome was found and fixed. | No matching auth screens exist in the concept HTML; native device visual QA is still required. |
| Admin | [Desktop](admin/dashboard-desktop.png) and [phone](admin/dashboard-mobile.png) use the concept owner's dark panel, sidebar, cyan/magenta accent and compact stat style. Desktop content was moved to the top; phone has a selectable page menu. | Only handbook admin sections are included. Remaining admin forms and tables need full browser visual and interaction review. |

## Open visual gates

1. Compare Android and iOS device screenshots with these 390 px references, especially fonts, status bar, safe areas, keyboard and the Urable WebView. Browser previews do not establish native parity.
2. Run the same comparison with real Urable services, a real booking, gallery images and approved product photos. Fixture data proves layout, not live content quality.
3. Implement and visually verify the before/after slider, booking success/failure states, and remaining admin forms/tables.
4. Apply the separate UI mockup PDF when it arrives, while keeping handbook scope final.

The observed visual foundation is close to the concept on the compared screens. The open gates above prevent an honest claim of full pixel parity or a release-ready UI.
