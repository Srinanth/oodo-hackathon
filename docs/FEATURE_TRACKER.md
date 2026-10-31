# Feature Tracker

This tracker is the shared source of truth for ownership and completion. Statuses: `Not started`, `In progress`, `Review`, `Done`, `Blocked`. Keep one primary owner per feature. Shared integration work is listed separately and is not a substitute for each person's feature ownership.

## Feature backlog

| ID | Feature | Primary owner | Priority | Depends on | Acceptance criteria | Status |
|---|---|---|---|---|---|---|
| SETUP-01 | Project planning and repository workflow baseline | Srinanth | P0 | - | PRD, architecture, API contract, ADRs, tracker, and workspace rules are available; team branch structure is bootstrapped from this baseline | Done |
| AUTH-01 | Customer registration, sign-in, unique email, password policy, reset flow | Srinanth | P0 | - | Customer can register/sign in; duplicate normalized email is rejected; passwords meet brief; reset token is single-use and expires | Not started |
| AUTH-02 | Roles, authorization policies, admin-created staff | Srinanth | P0 | AUTH-01 | Admin/staff/customer permissions enforced server-side; only admin creates staff; customer cannot read another customer's records | Not started |
| CAT-01 | Product catalog and variants | Srinanth | P0 | AUTH-02 | Admin can create/edit product and variant; sales/cost price and notes persist; configurable variant adjustment is reflected in preview price | Not started |
| PLAN-01 | Plan configuration and billing schedule fields | Srinanth | P0 | CAT-01 | Admin sets interval, amount, minimum quantity, availability and lifecycle policy; unsupported dates/values rejected | Not started |
| TAX-01 | Tax rule configuration and calculation contract | Srinanth | P0 | CAT-01 | Admin configures a tax rule; eligible lines calculate the expected tax; applied rate is available to invoice snapshot | Not started |
| DISC-01 | Discount rules and eligibility | Srinanth | P0 | CAT-01, PLAN-01 | Fixed/percentage, minimums, date window, usage cap, and product/subscription scope are enforced; ineligible/expired rules do not apply | Not started |
| CUST-01 | Customer records and account association | Angelo | P0 | AUTH-01, AUTH-02 | Staff can find/create customer; customer portal account maps to one customer; portal identity is not selected from an untrusted request parameter | Not started |
| QUOTE-01 | Quotation templates and quotes | Angelo | P0 | CUST-01, CAT-01, PLAN-01, TAX-01 | Staff creates quote from template with validity, terms, lines, prices and taxes; expiry and total are visible | Not started |
| SUB-01 | Quote conversion and subscription lifecycle | Angelo | P0 | QUOTE-01 | Confirming an eligible quote creates one subscription; state transitions and next billing date follow the selected plan; pause/renew/early or end-date close are supported per policy | Not started |
| PORTAL-01 | Customer subscription and invoice portal | Angelo | P0 | AUTH-02, CUST-01, SUB-01, INV-01 | Signed-in customer sees own subscriptions/invoices and supported self-service actions; cross-customer access is denied | Not started |
| BILL-01 | Billing run and recurring invoice generation | Deepak | P0 | SUB-01, TAX-01, DISC-01 | Due active subscriptions produce one invoice per period; repeat/concurrent run does not duplicate or skip a period; run outcome/failures are visible | Not started |
| INV-01 | Invoice details, calculation, and state/actions | Deepak | P0 | BILL-01, TAX-01, DISC-01 | Invoice snapshots customer/line/price/tax/discount/currency; totals are correct; Draft/Confirmed/Paid and cancel/send/print actions are represented | Not started |
| PAY-01 | Payment recording and invoice balance | Deepak | P0 | INV-01 | Staff records method, amount, date and note against an invoice; remaining balance and paid/outstanding/overdue status recalculate correctly | Not started |
| FIN-01 | Finance dashboard and filtered reporting | Deepak | P0 | SUB-01, INV-01, PAY-01 | Summary shows active subscriptions, collected revenue, invoice/outstanding totals, payments and overdue invoices; date/status filters work; target is under two seconds at thousands of records | Not started |

## Shared integration checkpoints

| Checkpoint | Participants | Done when | Status |
|---|---|---|---|
| INT-01: agree shared contracts | All | IDs, roles, state enums, money/currency format, date/timezone, and API response format are aligned with `docs/API.md` | Not started |
| INT-02: quote-to-subscription slice | Srinanth, Angelo | Configured plan and product data can be used to create a quote and activate a subscription | Not started |
| INT-03: subscription-to-invoice slice | Angelo, Deepak | An active subscription reaches the billing run and produces a correct invoice once | Not started |
| INT-04: end-to-end demo | All | Seeded customer completes portal/quote/subscription/invoice/payment/report walkthrough | Not started |

## Feature completion rule

An owner marks a feature `Done` only when all of its acceptance criteria are satisfied, the API/architecture/tracker docs reflect any contract changes, and the final diff has been reviewed for scope. The owner then commits that feature as one logical unit on their own `dev/<name>` branch. The project lead handles integration into `development` and promotion to `main` after review.
