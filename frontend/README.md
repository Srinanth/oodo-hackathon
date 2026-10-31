# Frontend

This folder is the React + TypeScript + Vite + Tailwind CSS client. Keep frontend code here; do not place Django views or models in this folder.

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

The Vite app scaffold and feature code have not been generated yet. The feature tracker identifies the frontend deliverable for each owner.
