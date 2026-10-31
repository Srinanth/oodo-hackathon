# Brightloop Subscription Management

Brightloop is a subscription operations platform for managing products and plans, customer quotations, subscription lifecycles, recurring invoices, payments, and finance reporting. It replaces spreadsheet-based coordination with one role-aware staff workspace and a customer portal scoped to each customer's own records.

## Project overview

The selection-round MVP demonstrates the full subscription revenue workflow:

1. Configure products, variants, subscription plans, tax rules, and discount rules.
2. Manage customer records and prepare a quotation from a reusable template.
3. Price quote lines from the server-side catalog, review tax and totals, and confirm the quote into one subscription.
4. Run billing for subscriptions that are due. Idempotency rules prevent duplicate invoices on retries.
5. Record manual invoice payments and review balances, collections, and overdue amounts in finance reports.
6. Let customers sign in to view their own subscriptions and invoices and use plan-permitted lifecycle actions.

The application enforces account roles and customer ownership in the backend. Prices, tax rates, and discounts are calculated and snapshotted so later catalog changes do not rewrite invoice history.

## Features

- Customer registration, session login, password reset, staff account management, and role-based access.
- Product catalog with configurable variants and price adjustments.
- Subscription plans with billing intervals, availability dates, quantity rules, and pause, renewal, and closure policies.
- Configurable percentage taxes and fixed or percentage discounts with eligibility and usage limits.
- Reusable quote templates, server-priced quotations, tax snapshots, simulated sending, and idempotent quote conversion.
- Subscription lifecycle actions, next billing dates, and transition history.
- Idempotent recurring billing, invoice workflow and snapshots, manual payment recording, and balance calculation.
- Finance summaries, date filters, invoice tables, and overdue invoice views.
- Responsive staff navigation and a customer portal for subscription and invoice self-service.

### Delivery status

The core product features are implemented and tracked in [`docs/FEATURE_TRACKER.md`](docs/FEATURE_TRACKER.md). The local seeded walkthrough and integration checks cover quote creation through payment and finance reporting. Shared checkpoint **INT-04** remains in progress until the hosted service is provisioned and the full walkthrough is recorded there.

Invoice and quote email delivery is simulated unless an email provider is configured. Payments are recorded manually; a payment gateway is outside the MVP scope.

## Technology and architecture

The product uses a modular monolith: one React client, one Django REST API, and one PostgreSQL database. The frontend and API are served from the same origin in deployment, which keeps session and CSRF authentication straightforward and avoids a separate frontend service.

| Area | Technology |
|---|---|
| Backend | Python 3.13, Django 5.2 LTS, Django REST Framework |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Database | PostgreSQL 18 with Psycopg 3 |
| Authentication | Django sessions, secure HTTP-only cookies, CSRF protection, server-side role and ownership checks |
| Local frontend development | Node.js 24 and npm; Vite proxies API requests to Django |
| Deployment | Multi-stage Docker image, Gunicorn, WhiteNoise, and a Render service blueprint |

Database transactions, decimal money fields, unique constraints, and invoice snapshots protect billing and payment data. PostgreSQL aggregation and indexes support finance reporting. Redis, Celery, microservices, and a payment gateway are deferred until measured product needs justify them.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/adr/ADR-004-selected-mvp-stack.md`](docs/adr/ADR-004-selected-mvp-stack.md) for design decisions and trade-offs.

## Repository layout

```text
backend/    Django project, API, domain apps, models, and migrations
frontend/   React + TypeScript client and feature modules
db/         Reviewed PostgreSQL schema and ER diagram
docs/       PRD, API contract, architecture, ADRs, tracker, cost plan, and demo guide
Dockerfile  Builds the frontend and Django runtime image
render.yaml Render web-service configuration; database provisioning is separate
```

Django models and migrations in `backend/` are the executable schema source of truth. The reviewed references in `db/` should be updated when persisted models change.

## Local development

### Prerequisites

- Python 3.13 and PostgreSQL 18.
- Node.js 24 and npm.
- Docker Desktop with the WSL 2 backend if running PostgreSQL in a local container. Docker Desktop's per-user installation is suitable for local development; WSL 2 must be enabled and available.

### Backend

1. Start PostgreSQL and create a local database and role. The expected defaults are in [`backend/.env.example`](backend/.env.example).
2. In PowerShell, create the virtual environment, configure the database, and apply migrations:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   if (!(Test-Path .env)) { Copy-Item .env.example .env }
   # Set a local secret and PostgreSQL credentials in .env.
   python manage.py migrate
   python manage.py runserver 127.0.0.1:8000
   ```

### Frontend

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the Vite URL shown in the terminal. The dev server proxies `/api` and `/healthz` to Django.

### Seed the selection-round demo

With the backend database ready, run `python manage.py seed_demo` from `backend/`. Choose a demo-only password when prompted, then follow [`docs/DEMO.md`](docs/DEMO.md) to exercise the staff and customer flows. The command creates synthetic data and is safe to rerun; use it only with a local or dedicated demo database.

## Verification

Run backend tests from `backend/`:

```powershell
python manage.py test
```

Run frontend type-check/build and lint from `frontend/`:

```powershell
npm run build
npm run lint
```

## Deployment and cost

The root [`Dockerfile`](Dockerfile) builds the Vite app and packages it with Django, Gunicorn, and WhiteNoise. [`render.yaml`](render.yaml) configures the web service, health check, and pre-deploy migration command. It expects a separately provisioned PostgreSQL database and deployment environment values such as `DATABASE_URL`, `DJANGO_ALLOWED_HOSTS`, and `CSRF_TRUSTED_ORIGINS`; it does not provision the database or deploy the application by itself.

The current persistent-demo estimate is approximately **$13 USD per month** for a small Render web service and PostgreSQL database. As a scale-planning indicator, the cost plan models base infrastructure at about **$0.130 per active subscription/month** for 100 subscriptions, **$0.0452** at 1,000, and **$0.01457** at 10,000 under the stated service, database, and storage assumptions. These are infrastructure estimates, not customer prices or capacity guarantees; bandwidth overages and variable costs are excluded. See [`docs/PLAN.md`](docs/PLAN.md) for the formula, tier assumptions, scale-up checks, and current pricing sources.

## Team and workflow

The project team is **Srinanth, Angelo, and Deepak**. Work is organized by related full-stack domains and tracked in [`docs/FEATURE_TRACKER.md`](docs/FEATURE_TRACKER.md). Contributors work on their own `dev/<name>` branches; `development` is the shared integration branch and `main` is the release/demo branch. Repository agent guidance is in [`AGENTS.md`](AGENTS.md).

## Project documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Feature tracker](docs/FEATURE_TRACKER.md)
- [Architecture decision records](docs/adr/)
- [Database schema and ER diagram](db/)
- [Selection-round demo walkthrough](docs/DEMO.md)
- [Hosting and cost plan](docs/PLAN.md)
