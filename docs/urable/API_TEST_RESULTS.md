# Urable API test results — 21 October 2026

Source: [Urable Public API OpenAPI document](https://app.urable.com/docs/openapi.yaml), plus live calls to the SoFlo Suds Urable account. The key was used locally and is not included here. All writes used a customer and vehicle named `TEST`, a far-future job marked `TEST - please ignore`, and no payment. The job was cancelled and its cancelled status verified.

## Live capability matrix

| Capability | Result | Evidence and implementation note |
| --- | --- | --- |
| Authentication/scopes | Works for the tested routes | `GET` customers, items, products, categories, jobs, events, orders, payments and proposals all returned HTTP 200. `POST` customer/item/job and `PATCH` item/job also returned HTTP 200. Other write scopes remain untested. |
| Create/read customer | Works | Created `TEST Markhor API`; read it back. Sign-up can create an Urable customer. |
| List/create/read/update vehicle | Works | Urable calls vehicles **items**. Created and updated `TEST API Vehicle`; customer-filtered list returned it. Delete remains untested. |
| Services and prices | Works | `GET /v1/products?type=service&industry=vehicleCare` returned 69 services, 67 with at least one positive price, and 49 with `virtualShop: true`. Only the public/eligible services should be offered to customers. Urable amounts are **cents**. |
| Create/read/list in-shop job | Works | Created a scheduled, future in-shop job with a service line item; read it back with invoice subtotal, total, `status: scheduled`, `paymentStatus: unpaid`; customer-filtered list returned it. |
| Cancel job | Works through update | `PATCH /v1/jobs/{id}` to `status: canceled` succeeded; a subsequent read confirmed cancellation. Customer cancellation policy still belongs in our API. |
| Discount on a job | Works with invoice recomputation | `PATCH` with `adjustments` alone returned 200 but did **not** change the invoice. Sending `lineItems` and `adjustments` together recomputed a 1% discount: subtotal 25,000 cents, total 24,750 cents. Promo limits and eligibility still belong in our API. |
| Read payment state/history | Works | Job exposed `paymentStatus: unpaid`; `GET /v1/payments?jobId=...` returned an empty list for the unpaid test job. No real payment was attempted. |
| Shop products | Data gap | `GET /v1/products?type=product&industry=vehicleCare` returned four products, all named Gift Card. The virtual shop also showed an add-on named Bio-Bombs Air Freshener Bars; product/service classification needs checking before concluding the whole physical catalog is absent. |
| Mobile/field job | Virtual-shop flow observed; API write untested | `JobInput.type: field` and a structured `location` are documented. The virtual shop with `?jobType=field&industry=vehicleCare` reaches services and then asks for a required customer address and service location. The attempted live API write did not start because DNS failed before any write. |
| Availability/free slots | Works in virtual shop; no public API endpoint | Both in-shop and mobile virtual-shop checkout showed a date picker and available times. Creating a job through the public API does not by itself prove that a slot is free. |
| Customer card checkout/payment link | Virtual-shop checkout visible; no public API endpoint | `POST /v1/payments` records **already collected** cash/check/other payments; it does not charge a card. The virtual shop showed a Payment step, but no real payment or confirmation was submitted. A payment link for an API-created job remains unverified. |
| Webhooks | No public endpoint/configuration in OpenAPI | Use the handbook's polling plan unless Urable support confirms a separate webhook facility. |

## Redacted response shapes observed

```json
{"success":true,"data":{"id":"<customer-id>"}}
{"success":true,"data":{"id":"<vehicle-id>"}}
{"success":true,"data":{"id":"<job-id>","num":"<job-number>"}}
{"success":true,"data":{"status":"canceled","paymentStatus":"unpaid","invoice":{"subtotal":25000,"total":24750,"adjustments":[{"type":"discount","value":1,"percent":true}]}}}
```

The last shape shows selected fields from `GET /v1/jobs/{id}` after the test discount and cancellation; other response fields are omitted. Amounts are cents.

## Virtual-shop flow observed without submitting

The existing shop page accepted `?jobType=shop&industry=vehicleCare` and `?jobType=field&industry=vehicleCare`, opening directly on its category list. In a browser I selected **Detail Reset → Coupe / Sedan → Add to Cart → Checkout**. The shop checkout displayed customer and vehicle fields, a date picker with available times, a payment step, and add-on suggestions. The mobile path also required a customer address and service location. [Screenshot of the in-shop cart](virtual-shop-inshop-checkout.png).

For this service, the live shop added a **7% convenience fee** ($12.25 on a $174.99 service) and showed a **25% deposit** ($46.81 on a $187.24 total). No personal details were entered, no booking was submitted, and no card was charged. These shop settings conflict with the handbook's working assumption of full payment; the client must choose which rule the app should present.

The virtual-shop page appears to support direct links to a category/service/price variant through `categoryId`, `productServiceId`, and `sku` query parameters, but these are not documented public API contracts. Customer prefill and a return callback were not found. The app should treat the completed-booking match as unverified until a controlled end-to-end test confirms it.

## Decisions for Ali today

1. Use the handbook's virtual-shop fallback for slot selection and checkout. Its service, cart, calendar and payment steps are visible for both in-shop and mobile paths. The remaining test is completing a controlled booking and reliably matching the resulting Urable job to the signed-in customer. Ask Urable for a different integration only if this handoff fails or fully native booking is required.
2. Confirm whether the customer app should list only `virtualShop: true` services. The API contains 20 services with `virtualShop: false`.
3. Confirm the live shop's **25% deposit and 7% convenience fee** against the handbook's full-payment assumption before implementing our quote/payment copy.
4. Decide how physical shop products enter Urable. The product filter returns only gift cards, though the shop page offers a physical add-on. Job line items require an Urable product/service ID; a note alone will not charge for a product.
5. Confirm whether the shop wants the `TEST Markhor API` customer and vehicle retained as integration fixtures. The test booking is already cancelled.

## Message ready to send to Ali

> Urable API tested today. Customer and vehicle creation, service/pricing reads, in-shop job creation, job status, cancellation and invoice discount all work. The test booking was cancelled; no payment was made. The public API has no availability or hosted checkout endpoint, but I walked Urable's existing virtual shop through service selection, cart and its live time-slot picker for both in-shop and mobile paths. It displays a Payment step, which I did not submit. The remaining integration test is matching a completed virtual-shop booking back to the signed-in app user. The live shop currently shows a 25% deposit and 7% convenience fee, while the handbook assumes full payment, so please confirm which rule to use. The product API returns only gift cards, though the shop page offers an add-on; we need the intended physical shop product list. Details are in `docs/urable/API_TEST_RESULTS.md`.
