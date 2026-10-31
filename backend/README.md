# Backend

This folder is the Django 5.2 LTS + Django REST Framework application. Keep Django project configuration, API handlers, domain services, models, and migrations here; do not place React source or the reviewed database reference in this folder.

## Run locally

1. Create a virtual environment (`python -m venv .venv`) and create `.env` from `.env.example`; replace the development secret.
2. Install Python dependencies with `.venv/Scripts/python -m pip install -r requirements.txt` on Windows or `.venv/bin/python -m pip install -r requirements.txt` on macOS/Linux.
3. Start PostgreSQL 18 with `docker compose up -d db` (run in this folder).
4. Run migrations with `.venv/Scripts/python manage.py migrate` (Windows) or `.venv/bin/python manage.py migrate` (macOS/Linux).
5. Start Django with the same Python executable and `manage.py runserver 127.0.0.1:8000`.

The frontend development server runs separately from `../frontend/` and proxies `/api` and `/healthz` to Django. The Vite scaffold is configured for Node 24.

For the synthetic selection-round dataset and walkthrough, see [`../docs/DEMO.md`](../docs/DEMO.md). Run `python manage.py seed_demo` only against a local or dedicated demo database.

For the same-origin production layout, `npm run build` writes the React entry point and assets into `backend/static/frontend/`; `python manage.py collectstatic --noinput` then collects them for WhiteNoise. The generated frontend build is ignored by Git and should be recreated during deployment.

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
