# Frontend

This folder is the React + TypeScript + Vite + Tailwind CSS client. Keep frontend code here; do not place Django views or models in this folder.

## Run locally

From this folder, run `npm install` once, then `npm run dev`. Vite starts at `http://127.0.0.1:5173` and proxies `/api` and `/healthz` to the Django server at `http://127.0.0.1:8000`. Run `npm run build` to create a production bundle.

## Domain ownership

- **Srinanth:** app shell, shared navigation, authentication screens, role-aware layout, product/variant/plan/tax/discount setup.
- **Angelo:** customer management, quotation templates/quotes, staff subscription views/actions, customer portal.
- **Deepak:** billing-run controls/results, invoice and payment screens, finance dashboard and filters.

## Integration rules

- Call the JSON API in `../docs/API.md` through one shared typed API client.
- In production, the SPA and `/api/v1` share one origin. In development, configure Vite to proxy `/api` to Django.
- Keep the session cookie HTTP-only; obtain and send CSRF tokens for unsafe methods. Do not store session or bearer credentials in browser local storage.
- Share page layout, form fields, status labels, currency/date formatters, and loading/error states instead of building a different UI pattern per feature.
- Keep customer views scoped by the backend session; client route guards are only a usability feature, never authorization.

The Vite/React/TypeScript/Tailwind scaffold and shared API client are initialized. Product feature screens remain tracked separately in the feature tracker.
