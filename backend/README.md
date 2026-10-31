# Backend

This folder is the Django 5.2 LTS + Django REST Framework application. Keep Django project configuration, API handlers, domain services, models, and migrations here; do not place React source or the reviewed database reference in this folder.

## Suggested app boundaries

- `accounts`: custom user, roles, sessions, password reset, shared permission classes.
- `catalog`: products, variants, plans, tax rules, discounts, pricing/eligibility.
- `customers`: customer records and account association.
- `subscriptions`: templates, quotes, subscription lifecycle and customer-scoped APIs.
- `billing`: billing runs, invoices, invoice snapshots, payment records and finance reports.
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

The Django project scaffold and feature code have not been generated yet. The feature tracker identifies each backend deliverable.
