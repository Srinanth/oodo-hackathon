# API Contract (Draft)

This is the shared HTTP API contract for the MVP. Paths use `/api/v1`; JSON is UTF-8. The technology stack is not selected yet, so these are logical HTTP operations and payload shapes rather than framework-specific code.

## Conventions

- Authenticate with a secure session cookie or bearer token. Never accept a customer ID from the client as proof of ownership.
- Require authorization on the server for every operation. Admin-only configuration and staff creation are explicitly marked.
- Use opaque IDs in URLs. Normalize email before uniqueness checks.
- Dates are ISO 8601. Timestamps include timezone offsets and are stored in UTC. Business billing dates use the configured business timezone.
- Represent money as a decimal string plus ISO currency, never binary floating-point. Example: `{"amount":"12.50","currency":"USD"}`.
- Paginate list endpoints with `limit` and `cursor`; return `items` and `nextCursor`.
- Mutations validate state transitions and return the updated resource. Use an idempotency key for retryable commands such as billing-run creation and quote conversion.
- Errors use a stable shape: `{"error":{"code":"VALIDATION_ERROR","message":"Readable summary","fieldErrors":{"email":"Already in use"},"requestId":"..."}}`.

## Identity and access

| Method and path | Access | Purpose |
|---|---|---|
| `POST /auth/register` | Public | Register a customer account |
| `POST /auth/login` | Public | Sign in |
| `POST /auth/logout` | Signed in | End session |
| `GET /auth/me` | Signed in | Return current user, role, and linked customer ID if applicable |
| `POST /auth/password-reset-requests` | Public | Send reset link to registered email without revealing whether it exists |
| `POST /auth/password-resets` | Public with valid token | Set a new password; token is single-use and expires |
| `POST /staff` | Admin | Create a staff account |

Registration request:

```json
{"email":"customer@example.com","password":"...","name":"Example Customer"}
```

Enforce the brief's password policy (minimum 9 characters, uppercase, lowercase, special character), normalized unique email, and secure password hashing.

## Catalog and configuration

| Method and path | Access | Purpose |
|---|---|---|
| `GET/POST /products` | Staff read / Admin write | List or create products |
| `GET/PATCH /products/{productId}` | Staff read / Admin write | Read or update product |
| `POST /products/{productId}/variants` | Admin | Add a variant with explicit configurable adjustment |
| `GET/POST /plans` | Staff read / Admin write | List or create plans |
| `GET/PATCH /plans/{planId}` | Staff read / Admin write | Read or update plan |
| `GET/POST /tax-rules` | Staff read / Admin write | List or create tax rules |
| `GET/POST /discount-rules` | Staff read / Admin write | List or create discount rules |
| `POST /pricing/preview` | Staff | Calculate quote/line price, tax, and discount preview |

Product example:

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

```json
{
  "name":"Business Monthly",
  "interval":"monthly",
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
| `POST /invoices/{invoiceId}/actions` | Staff | `confirm`, `cancel`, `send`, or `print` |
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
