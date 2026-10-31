# API Contract (Draft)

This is the shared HTTP API contract for the MVP. Paths use `/api/v1`; JSON is UTF-8. The implementation is Django REST Framework with a same-origin React client, as recorded in [ADR-004](adr/ADR-004-selected-mvp-stack.md).

Implement API handlers and domain services under `backend/`; implement views and API clients under `frontend/`. The reviewed persistence model lives in [`db/schema.sql`](../db/schema.sql) and [`db/schema.mmd`](../db/schema.mmd); Django models and migrations remain the executable schema source of truth.

## Conventions

- Authenticate the same-origin browser app with Django sessions in secure, HTTP-only cookies and CSRF tokens on unsafe requests. Never accept a customer ID from the client as proof of ownership.
- Require authorization on the server for every operation. Admin-only configuration and staff creation are explicitly marked.
- Use opaque IDs in URLs. Normalize email before uniqueness checks.
- Dates are ISO 8601. Timestamps include timezone offsets and are stored in UTC. Business billing dates use the configured business timezone.
- Represent money as a decimal string plus ISO currency, never binary floating-point. Example: `{"amount":"12.50","currency":"USD"}`.
- Paginate list endpoints with `limit` and `cursor`; return `items` and `nextCursor`.
- Mutations validate state transitions and return the updated resource. Use an idempotency key for retryable commands such as billing-run creation and quote conversion.
- Errors use a stable shape: `{"error":{"code":"VALIDATION_ERROR","message":"Readable summary","fieldErrors":{"email":"Already in use"},"requestId":"..."}}`.
- The frontend and API are served from one origin in the MVP. Vite proxies `/api` to Django locally; do not add cross-origin token storage or CORS configuration unless a separate client becomes a real requirement.

## Identity and access

| Method and path | Access | Purpose |
|---|---|---|
| `POST /auth/register` | Public | Register a customer account |
| `POST /auth/login` | Public | Sign in |
| `POST /auth/logout` | Signed in | End session |
| `GET /auth/me` | Signed in | Return current user, role, and linked customer ID if applicable |
| `POST /auth/password-reset-requests` | Public | Send reset link to registered email without revealing whether it exists |
| `POST /auth/password-resets` | Public with valid token | Set a new password; token is single-use and expires |
| `GET /staff` | Admin | List staff accounts |
| `POST /staff` | Admin | Create a staff account |

Staff creation accepts `{"email":"staff@example.com","name":"Staff Name","password":"..."}`. The server assigns the `staff` role and records the creating administrator; callers cannot choose a role or Django admin privileges. The response contains `id`, `email`, `name`, `role`, `isActive`, and `createdAt`. Staff listing accepts `limit` (default 25, maximum 100), an opaque `cursor`, and optional `search` by name/email; it returns `{"items":[...],"nextCursor":"...","total":0,"activeCount":0,"inactiveCount":0}` and excludes administrator and customer accounts. Both methods require a signed-in administrator; authenticated staff and customers receive `403`. Customer portal detail views should use `IsCustomerOwner`, and customer portal lists should scope querysets with `customer_scoped` so ownership comes from the current session.

Before the browser sends an unsafe request, call `GET /auth/csrf` to obtain the CSRF cookie. Subsequent `POST`, `PATCH`, and `DELETE` requests send its value in `X-CSRFToken`. Registration and login establish a Django session and return `{"user":{...}}`; logout returns `204`. Password-reset request always returns the same `202` message whether or not the email is registered. Reset emails link to `/password-reset/{uid}/{token}/`; the local email backend writes them to the Django console, and production must configure an email provider.

Registration request:

```json
{"email":"customer@example.com","password":"...","name":"Example Customer"}
```

Enforce the brief's password policy (minimum 9 characters, uppercase, lowercase, special character), normalized unique email, and secure password hashing.

Password-reset submission uses `{"uid":"...","token":"...","newPassword":"..."}`. Reset tokens use Django's expiring token generator and become invalid after the password changes.

## Catalog and configuration

| Method and path | Access | Purpose |
|---|---|---|
| `GET/POST /products` | Staff read / Admin write | List or create products |
| `GET/PATCH /products/{productId}` | Staff read / Admin write | Read or update product |
| `POST /products/{productId}/variants` | Admin | Add a variant with explicit configurable adjustment |
| `PATCH /products/{productId}/variants/{variantId}` | Admin | Update or deactivate a variant |
| `GET/POST /plans` | Staff read / Admin write | Search/list or create plans |
| `GET/PATCH /plans/{planId}` | Staff read / Admin write | Read, update, or deactivate a plan |
| `GET/POST /tax-rules` | Staff read / Admin write | Search/list or create tax rules |
| `GET/PATCH /tax-rules/{taxRuleId}` | Staff read / Admin write | Read, update, or deactivate a tax rule |
| `GET /tax-rules/{taxRuleId}/preview?amount=100.00&currency=USD&onDate=2026-11-01` | Staff | Calculate an eligible tax amount and return snapshot fields |
| `GET/POST /discount-rules` | Staff read / Admin write | Search/list or create discount rules |
| `GET/PATCH /discount-rules/{discountRuleId}` | Staff read / Admin write | Read, update, or deactivate a discount rule |
| `POST /discount-rules/{discountRuleId}/preview` | Staff | Evaluate rule eligibility and calculate a discount preview |
| `POST /pricing/preview` | Staff | Calculate quote/line price, tax, and discount preview |

Product example:

Product listing accepts `limit` (default 25, maximum 100), opaque `cursor`, and optional `search`; it returns `items` and `nextCursor`. Product updates can change name, type, prices, notes, and active status. Deactivation is soft so historical quote/invoice references remain valid. Variants have a signed price adjustment in the product currency; active variant prices cannot be negative. Product and variant price values are decimal strings and are validated without floating-point arithmetic.

```json
{
  "name":"Business Suite",
  "type":"service",
  "salesPrice":{"amount":"100.00","currency":"USD"},
  "costPrice":{"amount":"35.00","currency":"USD"},
  "notes":"Core subscription",
  "variants":[{"name":"Odoo brand","priceAdjustment":{"amount":"560.00","currency":"USD"}}]
}
```

Plan example:

Plan listing accepts `limit` (default 25, maximum 100), opaque `cursor`, and optional name `search`; it returns `items` and `nextCursor`. Create requires `name`, `interval`, `price`, `minimumQuantity`, and `endPolicy`; `intervalCount` defaults to 1, availability dates may be null, and pause/renewal/active policy fields use documented defaults. `availableUntil` must be on or after `availableFrom`. Currency is normalized to uppercase and immutable after creation. Admins can deactivate plans with `PATCH` and `isActive:false`; historical references are retained.

```json
{
  "name":"Business Monthly",
  "interval":"monthly",
  "intervalCount":1,
  "price":{"amount":"100.00","currency":"USD"},
  "minimumQuantity":1,
  "availableFrom":"2026-11-01",
  "availableUntil":null,
  "endPolicy":"close_at_end",
  "allowPause":true,
  "allowRenewal":true
}
```

Intervals: `daily`, `weekly`, `monthly`, `yearly`. End policy: `close_at_end` or `renew_until_closed`. Discount type: `fixed` or `percentage`; scope: `products` or `whole_subscription`. Tax and discount eligibility is evaluated server-side and snapshotted on invoice lines.

Tax rule listing uses the common `limit`, opaque `cursor`, and name `search` parameters. Create requires `name` and `ratePercent` (0 to 100, up to four decimal places); optional inclusive `activeFrom`/`activeUntil` dates constrain eligibility, and `activeUntil` must be on or after `activeFrom`. Preview accepts a non-negative decimal `amount`, three-letter `currency`, and optional `onDate` (defaults to the business-local current date). It returns the base, rate, tax, total, and a snapshot containing the rule name/rate/tax amount; inactive or out-of-window rules return `applies:false` and zero tax. Tax is rounded to two decimal places using half-up rounding. Quote and invoice writers use the shared `tax_snapshot` service to persist the rule name, rate, and calculated amount at the time of pricing.

Discount rules support `fixed` or `percentage` values, a minimum purchase and quantity, inclusive start/end timestamps, a maximum use count, and either selected product IDs or `whole_subscription` scope. Fixed values require a currency; percentage values are limited to 100 and do not store a currency. Product-scoped rules require at least one active product. Create accepts `name`, `discountType`, `value`, `scope`, and optional `currency`, `productIds`, `minimumPurchase`, `minimumQuantity`, `startsAt`, `endsAt`, `maximumUses`, and `isActive`. `minimumPurchase` is a decimal string in the line currency. The preview body contains `lines:[{productId,amount,currency,quantity}]` where amount is the pre-discount line total. Only targeted lines contribute to a product-scoped rule; all lines contribute to a whole-subscription rule. The response identifies eligibility/reason, eligible amount/quantity, calculated discount, and uses remaining. Fixed and percentage discounts are capped at the eligible subtotal and rounded half-up to two decimals. Invoice generation reserves a use; confirmation consumes it and cancellation of an unconfirmed invoice releases it. Reservation is idempotent by rule and invoice, and row locking enforces the cap under concurrent requests.

## Customers, quotes, and subscriptions

| Method and path | Access | Purpose |
|---|---|---|
| `GET/POST /customers` | Staff | Search or create customer |
| `GET/PATCH /customers/{customerId}` | Staff | Read or update customer |
| `GET/POST /quote-templates` | Staff read / Admin write | List or manage reusable templates |
| `GET/POST /quotes` | Staff | List or create quotes |
| `GET/PATCH /quotes/{quoteId}` | Staff | Read or update a draft quote |
| `POST /quotes/{quoteId}/send` | Staff | Send quotation / mark sent |
| `POST /quotes/{quoteId}/confirm` | Staff | Confirm and convert to subscription; idempotent |
| `GET /subscriptions` | Staff | Search subscriptions |
| `GET /subscriptions/{subscriptionId}` | Staff or owning customer | Read subscription |
| `POST /subscriptions/{subscriptionId}/actions` | Staff or owning customer, per action policy | Pause, renew, close early, or request supported action |
| `GET /portal/subscriptions` | Customer | List only current customer's subscriptions |

Quote create example:

```json
{
  "customerId":"cus_123",
  "templateId":"qtpl_12",
  "validUntil":"2026-11-15",
  "paymentTerms":"Net 30",
  "lines":[{
    "productId":"prd_10",
    "variantId":"var_2",
    "planId":"pln_3",
    "quantity":5,
    "unitPrice":{"amount":"100.00","currency":"USD"},
    "taxRuleIds":["tax_1"]
  }]
}
```

Lifecycle states: `draft`, `quotation`, `confirmed`, `active`, `paused`, `closed`. The API rejects invalid transitions and returns a field/state error; it does not let callers set arbitrary state values directly. Conversion returns both the confirmed quote and the created subscription ID.

## Billing, invoices, and payments

| Method and path | Access | Purpose |
|---|---|---|
| `POST /billing-runs` | Admin/staff with billing permission | Run billing for a business date; idempotent by run key/date |
| `GET /billing-runs/{runId}` | Staff | Inspect counts and per-subscription failures |
| `GET /invoices` | Staff | Search invoices by customer, status, due date, or period |
| `GET /invoices/{invoiceId}` | Staff or owning customer | Read invoice and line snapshots |
| `POST /invoices/{invoiceId}/actions` | Staff | `confirm`, `cancel`, or `send`; send returns `deliveryStatus:"simulated"` until an email provider is configured. Printing is provided by the frontend print view. |
| `GET /portal/invoices` | Customer | List only current customer's invoices |
| `GET /portal/invoices/{invoiceId}` | Owning customer | Read own invoice |
| `GET/POST /invoices/{invoiceId}/payments` | Staff | List or record payments |

Billing request:

```json
{"businessDate":"2026-11-01"}
```

Invoice response shape (abbreviated):

```json
{
  "id":"inv_123",
  "number":"INV-000123",
  "customerId":"cus_123",
  "subscriptionId":"sub_123",
  "billingPeriod":{"start":"2026-10-01","end":"2026-10-31"},
  "status":"confirmed",
  "dueDate":"2026-11-30",
  "currency":"USD",
  "lines":[{"description":"Business Monthly","quantity":1,"unitPrice":"100.00","taxAmount":"10.00","discountAmount":"0.00","total":"110.00"}],
  "total":"110.00",
  "paidAmount":"0.00",
  "balanceDue":"110.00"
}
```

Payment create example:

```json
{"method":"bank_transfer","amount":{"amount":"110.00","currency":"USD"},"paidAt":"2026-11-04T10:30:00Z","note":"November settlement"}
```

Payment method is a free/configurable enum for the MVP. Overpayment and refunds are out of scope unless explicitly added to the PRD. Billing enforces one invoice per subscription and billing period, including concurrent retries.

## Reporting

`GET /reports/finance?from=2026-11-01&to=2026-11-30&status=overdue&customerId=cus_123`

Response includes summary counts and totals for active subscriptions, payments collected within the selected period, invoiced amount, outstanding balance, and overdue invoices, plus paginated invoice/subscription rows. Collected revenue, invoiced amount, and outstanding balance are separate measures. The endpoint must use bounded database queries and target under two seconds with thousands of subscriptions.

## Status and contract ownership

This API is a draft for implementation. Owners update this document when contracts change: Srinanth (identity/catalog/configuration), Angelo (customers/quotes/subscriptions/portal), Deepak (billing/invoices/payments/reports). Shared contract changes are coordinated before implementation and recorded in an ADR when they change an architecture decision.
