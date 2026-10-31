# Feature Tracker

This tracker is the shared source of truth for ownership and completion. Statuses: `Not started`, `In progress`, `Review`, `Done`, `Blocked`. Keep one primary owner per feature. Shared integration work is listed separately and is not a substitute for each person's feature ownership.

## Full-stack feature backlog

Each feature owner delivers its backend work in `backend/` and user-facing work in `frontend/`. The three owners are intentionally assigned end-to-end domains rather than splitting frontend to one person and backend to another.

| ID | Feature | Owner | Backend (`backend/`) | Frontend (`frontend/`) | Depends on | Acceptance criteria | Status |
|---|---|---|---|---|---|---|---|
| SETUP-01 | Project planning and repository workflow baseline | Srinanth | Workspace conventions and branch workflow | - | - | PRD, architecture, API, ADRs, tracker, and rules exist; branch structure bootstrapped | Done |
| STACK-01 | Select and document MVP technology stack | Srinanth | Django/DRF and PostgreSQL choice, deployment shape | React/TypeScript/Vite/Tailwind choice | SETUP-01 | Stack, cost/performance tradeoffs, and scaling path are recorded | Done |
| LAYOUT-01 | Separate frontend/backend folders and assign full-stack ownership | Srinanth | Backend app ownership and folder guidance | Frontend feature ownership and folder guidance | STACK-01 | `frontend/` and `backend/` guidance exists; each person owns a connected UI/API domain | Done |
| SCHEMA-01 | Model the complete PostgreSQL domain schema | Srinanth | `db/schema.sql`, Django source-of-truth guidance | - | STACK-01 | Schema reference, ER diagram, and integrity rules cover all MVP entities | Done |
| INIT-01 | Initialize frontend and backend projects | Srinanth | Django/DRF project, domain app packages, custom user model, settings and initial migration | Vite React/TypeScript/Tailwind app, API client and dev proxy | LAYOUT-01, SCHEMA-01 | Dependency locks are present; frontend builds and Django system checks pass | Done |
| AUTH-01 | Registration, login, password policy/reset | Srinanth | Custom Django user, session endpoints, password reset | Login, registration, reset screens and session bootstrap | - | Unique normalized email; password policy enforced; reset token expires and is single-use | Done |
| AUTH-02 | Roles, permissions, and staff creation | Srinanth | Role/permission policy; admin-only staff endpoint | Role-aware navigation and staff management screen | AUTH-01 | Current endpoints deny disallowed roles; only admins list/create staff; customer list/detail policies scope records from the linked account (CUST-01/PORTAL-01 must use these shared policies) | Done |
| CAT-01 | Product catalog and variants | Srinanth | Product/variant models and CRUD/pricing APIs | Catalog, variant editor, price preview | AUTH-02 | Admin create/read/update/deactivate works; sales/cost prices and notes persist; variant adjustment updates preview | Done |
| PLAN-01 | Plans and billing policy | Srinanth | Plan model/API, interval and lifecycle validation | Plan list/editor and availability/policy fields | CAT-01 | Interval, amount, minimum quantity, dates, close/pause/renew policy validate and persist | Done |
| TAX-01 | Tax rules | Srinanth | Tax rule model/API and calculation contract | Tax configuration screen and preview | CAT-01 | Configured rule calculates expected tax; applied rate can be snapshotted on quote/invoice | Done |
| DISC-01 | Discount rules and eligibility | Srinanth | Rule model, scopes, minimum/date/use-limit checks, atomic usage reservations and snapshots | Discount setup screen, product targeting, and eligibility preview | CAT-01, PLAN-01 | Fixed/percentage, minimums, date window, use cap, and product/subscription scope are enforced; discount details and amounts can be snapshotted | Done |
| CUST-01 | Customer records and account association | Srinanth | Customer model, staff CRUD/search API, account link | Customer list, search, profile form | AUTH-01, AUTH-02 | Staff can manage customers; portal account links to one customer; scope derives from session | Done |
| QUOTE-01 | Templates and quotation workflow | Srinanth | Template/quote models, server pricing and tax snapshots, expiry and send/confirm APIs | Template selector, quote editor, expiry and totals | CUST-01, CAT-01, PLAN-01, TAX-01 | Staff creates quote from template with valid lines, terms, taxes, total, and expiry | Done |
| SUB-01 | Quote conversion and subscription lifecycle | Srinanth | Idempotent conversion, state transitions, dates, billing anchor/API | Staff subscription list/actions and state history | QUOTE-01 | Confirm creates one subscription; valid pause/renew/close transitions and next due date work | Done |
| PORTAL-01 | Customer subscription/invoice portal | Srinanth (taking over) | Customer-scoped subscription/invoice APIs and actions | Customer home, own subscription/invoice views | AUTH-02, CUST-01, SUB-01, INV-01 | Customer sees only own records; supported self-service actions respect plan policy | In progress |
| BILL-01 | Recurring billing run | Deepak | Management command, run/item models, idempotent invoice generation | Staff billing-run trigger, progress/results/errors | SUB-01, TAX-01, DISC-01 | Due subscriptions create exactly one invoice per period, including retries; failures are visible | Done |
| INV-01 | Invoice calculation and workflow | Deepak | Invoice/tax/discount snapshots, state/action APIs, print/email adapter | Invoice list/detail, confirm/cancel/send/print controls | BILL-01, TAX-01, DISC-01 | Snapshot is stable; totals correct; Draft/Confirmed/Paid and supported actions work | Done |
| PAY-01 | Payment tracking and balances | Deepak | Payment model/API, balance and overdue calculation | Payment form/history and balance/status display | INV-01 | Method, amount, date, note save against invoice; balance and status recalculate | Done |
| FIN-01 | Finance reporting | Deepak | Filtered aggregate endpoints and query/index work | Summary cards, filters, overdue queue, charts/tables | SUB-01, INV-01, PAY-01 | Shows active, collected, invoiced, outstanding, payments, overdue; common report stays under 2s at thousands of rows | Done |

## Shared integration checkpoints

| Checkpoint | Participants | Done when | Status |
|---|---|---|---|
| INT-01: agree shared contracts | All | IDs, roles, state enums, money/currency format, date/timezone, and API response format are aligned with `docs/API.md` and `db/schema.sql` | Done |
| INT-02: quote-to-subscription slice | Srinanth, Angelo | Configured product and plan flow through both UI folders, APIs, and models into one active subscription | Done |
| INT-03: subscription-to-invoice slice | Angelo, Deepak | Active subscription reaches billing and produces one correct invoice, visible in staff UI and customer portal | Done |
| INT-04: end-to-end demo | All | Seeded customer completes setup/quote/subscription/invoice/payment/report walkthrough in the deployed app | Not started |

## Feature completion rule

An owner marks a feature `Done` only when all of its acceptance criteria are satisfied, the API/architecture/tracker docs reflect any contract changes, and the final diff has been reviewed for scope. The owner then commits that feature as one logical unit on their own `dev/<name>` branch. The project lead handles integration into `development` and promotion to `main` after review.
