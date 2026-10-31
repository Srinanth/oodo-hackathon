# ADR-004: Select a Low-Operations Stack for the MVP

- **Status:** Accepted
- **Date:** 2026-10-31
- **Decision owner:** Srinanth

## Context

The application has role-based staff/customer views, catalog and plan setup, quote/subscription workflows, recurring invoices, payment tracking, and a finance dashboard. Three people need to build a convincing selection-round demo quickly. Billing needs relational transactions, unique constraints, and accurate financial snapshots. The brief does not require a particular programming language or an Odoo module.

## Decision

Build a standalone **modular monolith** with:

- **Backend:** Python 3.13, Django 5.2 LTS, Django REST Framework, and Psycopg 3.
- **Frontend:** React with TypeScript, built by Vite and styled with Tailwind CSS.
- **Database:** PostgreSQL 18, using the current supported minor release available from the chosen host.
- **Local development:** Docker Compose for the Django service and PostgreSQL; Vite development server proxies API requests to Django.
- **Demo deployment:** One Gunicorn/Django web service serves `/api/v1`, the React SPA entry point, and collected static assets through WhiteNoise; one small managed PostgreSQL database stores all durable state. Keep both on the same origin. Use one platform cron invocation for scheduled billing; billing remains manually triggerable for the demo.
- **Authentication:** Django/DRF session authentication with secure, HTTP-only cookies and CSRF validation; server-side role and customer-ownership permissions.
- **Financial operations:** PostgreSQL transactions, fixed-precision decimals, invoice snapshots, and a unique constraint on subscription plus billing-period start make billing retries safe.

Use supported stable releases and lock exact dependencies. Django 5.2 is selected over the newer Django feature line because its LTS security support extends through April 2028 and provides a steadier compatibility window for an MVP. PostgreSQL 18 is selected as the current supported major release with a published support window through November 2030.

## Why this fits

- Django supplies authentication, database models/migrations, admin, and security features, reducing the amount of infrastructure and boilerplate the team must build.
- DRF matches the documented JSON API and provides serializers, permission hooks, and pagination without introducing a second backend framework.
- React/TypeScript supports a polished dashboard and customer portal while keeping UI components and API payloads explicit across three contributors.
- Same-origin serving avoids a separate frontend deployment and simplifies session/CSRF handling.
- PostgreSQL is appropriate for linked financial records, transactional billing, uniqueness constraints, and filtered aggregate reports.
- A single app and database keep demo hosting inexpensive. No Redis, Celery, Kubernetes, microservices, payment gateway, or separate worker is required for the current volume and feature scope.

## Consequences and guardrails

- The team maintains Python and TypeScript environments, but only one backend service and one database.
- Keep API handlers thin; place subscription transitions, pricing, billing, and payment calculations in domain services so they remain testable and reusable.
- Use SQL aggregation, pagination, and indexes for the thousands-of-subscriptions reporting target. Profile before adding cache infrastructure.
- Keep billing in a management command callable by both a manual staff action and a platform cron job. Do not run long billing batches inside ordinary web requests.
- The React client and Django API must stay same-origin in the MVP. Vite proxies the API during development.
- Store secrets in deployment environment configuration, never in the repository. Serve production traffic over HTTPS and use secure cookies.
- If a separate Odoo platform requirement is confirmed, revisit this ADR before implementation. The source brief's Odoo example is a configurable product/variant price adjustment and does not itself require Odoo as the application framework.
- If traffic outgrows one app instance, scale web replicas horizontally first; keep PostgreSQL as the system of record and consider pooling, background workers, or caching only after measurement.

## Alternatives considered

| Alternative | Reason not selected |
|---|---|
| Next.js + hosted backend/database platform | Fast to prototype, but splits business logic across server/client platform conventions and makes relational billing invariants, scheduled work, and provider-specific auth more coupled to one vendor. Reconsider only if the team already has strong experience and the platform is mandated. |
| Django templates + HTMX | Lower JavaScript overhead and a valid choice for mostly forms/tables, but the team has already documented a JSON API and needs a distinctive finance dashboard and portal. Keeping React avoids maintaining parallel HTML-fragment and JSON interaction patterns. |
| Odoo module | Could reuse existing business features if Odoo is required, but the brief does not state that the implementation must run inside Odoo. A custom module may also constrain the demo to an Odoo edition/hosting setup that the team has not selected. |
| Microservices, Celery/Redis, Kubernetes | Add deployment and operating cost without solving a current workload problem. The MVP can use database transactions and a scheduled management command. |

## References checked on 2026-10-31

- Django lists 5.2 as an LTS release with security support through April 2028: [Django supported releases](https://www.djangoproject.com/download/) and [Django 5.2 release notes](https://docs.djangoproject.com/en/5.2/releases/5.2/).
- Django 5.2 supports Python 3.13: [Django installation FAQ](https://docs.djangoproject.com/en/5.2/faq/install/).
- PostgreSQL 18 is supported through November 2030: [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/).
- Django recommends PostgreSQL for production: [Django installation FAQ](https://docs.djangoproject.com/en/5.2/faq/install/).
- DRF supports session authentication for same-session AJAX clients and requires CSRF tokens for unsafe requests: [DRF authentication](https://www.django-rest-framework.org/api-guide/authentication/).
- React's official guide documents TypeScript and the Vite React TypeScript setup path: [React TypeScript](https://react.dev/learn/typescript), [React build from scratch](https://react.dev/learn/build-a-react-app-from-scratch), and [Vite production build](https://vite.dev/guide/build).
- Tailwind CSS documents a Vite plugin workflow that generates a static stylesheet with no runtime dependency: [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite).
- WhiteNoise can let a Django app serve its own collected static files without a separate static-file service: [WhiteNoise with Django](https://whitenoise.readthedocs.io/en/stable/django.html).
