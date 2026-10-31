# Backend

This folder is the Django 5.2 LTS + Django REST Framework application. Keep Django project configuration, API handlers, domain services, models, and migrations here; do not place React source or the reviewed database reference in this folder.

## Run locally

### Recommended: run the full stack in Docker Compose

From the repository root, run `docker compose up --build -d`. This starts PostgreSQL 18, Django, and the Vite development server; Django applies migrations when it starts. The frontend proxies API and health requests to the backend service. The app is at `http://localhost:5173`.

To seed synthetic test accounts and catalog data, run `docker compose exec backend python manage.py seed_demo`, then follow [`../docs/DEMO.md`](../docs/DEMO.md). The repeatable seed also prepares customer records, quotes in multiple states, an active subscription, a current Draft invoice, paid/overdue invoice history, and payments. It only runs billing for its own seeded subscription. This Compose stack uses local-only credentials and must not be used with production data.

### Run Django on the host

1. Start PostgreSQL 18 locally or start just the Compose database from the repository root with `docker compose up -d db`.
2. Create a virtual environment (`python -m venv .venv`), create `.env` from `.env.example` if needed, and set the PostgreSQL host/port and local-only credentials. When using the Compose database, use `127.0.0.1:55432`.
3. Install Python dependencies with `.venv/Scripts/python -m pip install -r requirements.txt` on Windows or `.venv/bin/python -m pip install -r requirements.txt` on macOS/Linux.
4. Run migrations and start Django with the virtual-environment Python executable.

Run the Vite client from `frontend/` with Node 24/npm and `npm run dev`; it proxies `/api` and `/healthz` to `http://127.0.0.1:8000`. For the same-origin production layout, `npm run build` writes the React entry point and assets into `backend/static/frontend/`; `python manage.py collectstatic --noinput` collects them for WhiteNoise.

The generated frontend build is ignored by Git and should be recreated during deployment.

## Suggested app boundaries

- `apps/accounts`: custom user, roles, sessions, password reset, shared permission classes.
- `apps/catalog`: products, variants, plans, tax rules, discounts, pricing/eligibility.
- `apps/customers`: customer records and account association.
- `apps/subscriptions`: templates, quotes, subscription lifecycle and customer-scoped APIs.
- `apps/billing`: billing runs, invoices, invoice snapshots, payment records and finance reports.
- `config`: Django settings, URL routing and deployment configuration.

## Domain ownership

- **Srinanth:** `accounts`, `catalog`, shared API/auth conventions.
- **Angelo:** `customers`, quote and subscription APIs/services.
- **Deepak:** `billing`, invoice/payment/report APIs/services.

## Data rules

- Django models and committed migrations are the executable schema source of truth.
- `../db/schema.sql` and `../db/schema.mmd` are reviewed references; update them in the same feature when a persisted model or relationship changes.
- Create the custom Django user model before the first migration. Store money as `DecimalField` with explicit currency; never use floating-point amounts.
- Put transactional workflows in domain services, not serializers or frontend code. Enforce the invoice-per-subscription-period uniqueness constraint in the database.
- Keep the Django admin for internal setup/debugging; the user-facing product still uses the React client.

The core selection-round domains are implemented in their respective apps; see [`../docs/FEATURE_TRACKER.md`](../docs/FEATURE_TRACKER.md) for current status and [`../docs/DEMO.md`](../docs/DEMO.md) for the integrated walkthrough.
