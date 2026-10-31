# Selection-round demo walkthrough

This walkthrough uses synthetic records only. Run it against a local database or a dedicated demo database; never against production customer data.

## Prepare the demo data

From the repository root, start the three-service development stack:

```sh
docker compose up --build -d
```

Compose starts PostgreSQL 18, Django, and Vite. The backend waits for the database and applies migrations before it starts accepting requests. The frontend is available at `http://localhost:5173`.

If a local port is already in use, set `POSTGRES_PORT`, `BACKEND_PORT`, and/or `FRONTEND_PORT` before `docker compose up`. Compose builds the matching Vite origin into Django's CSRF trusted-origin list, so sign-in, sign-out, and other protected requests continue to work on the selected frontend port. Use `localhost` or `127.0.0.1` consistently in the browser.

Seed the synthetic accounts and catalog:

```sh
docker compose exec backend python manage.py seed_demo
```

The command prompts for a demo-only password of at least nine characters with uppercase, lowercase, and a special character. It is repeatable and does not reset existing passwords. A non-interactive agent can set `DEMO_SEED_PASSWORD` in its process environment and pass it through (PowerShell example):

```powershell
docker compose exec -T -e "DEMO_SEED_PASSWORD=$env:DEMO_SEED_PASSWORD" backend python manage.py seed_demo
```

Do not put the password in the repository or logs.

Use `docker compose logs -f backend frontend` to inspect startup and request logs. Stop the services with `docker compose down`; this preserves the local database volume. `docker compose down --volumes` deletes that Compose-managed database and all demo records.

The command creates these synthetic users:

| Role | Email |
|---|---|
| Administrator | `demo-admin@example.test` |
| Staff | `demo-staff@example.test` |
| Customer | `demo-customer@example.test` |

All three use the password entered during seeding. Keep this password out of commits, screenshots, and shared logs. The customer login is linked to the synthetic Brightloop Demo Company record.

## What is seeded

Seeding is additive and safe to repeat. It does not reset existing demo passwords or touch non-demo customers and subscriptions. The billing run is restricted to the seeded subscription; it will not bill other local records.

| Area | Ready-to-show records |
|---|---|
| Customers | Brightloop Demo Company linked to the customer login, plus Northstar Demo Labs for staff customer management |
| Configuration | Odoo Brand Add-on and Odoo variant, Demo Monthly Team Plan, Demo Sales Tax, Demo Volume Discount, and Selection Round Demo Quote template |
| Quotes | `Q-DEMO-DRAFT-01` (Draft), `Q-DEMO-OPEN-01` (Quotation), and `Q-DEMO-ACTIVE-01` (Confirmed) |
| Subscription | One active subscription created from the confirmed quote, with lifecycle history and a next billing date |
| Billing | One completed billing run and one current Draft invoice generated from the active subscription |
| Invoice history | `INV-DEMO-PAID-01` is Paid; `INV-DEMO-OVERDUE-01` is Confirmed, partially paid, and due one day before the seed date |
| Payments | One synthetic settlement and one partial payment, ready for finance summaries and invoice balance displays |

The historical invoices are synthetic examples for the overdue and collection screens. They are stored as invoice snapshots and do not represent real customer activity.

## Walk through the product flow

1. Sign in as the administrator. Review the **Odoo Brand Add-on** and its `Odoo` variant, the monthly team plan, the `8.25%` tax rule, the `10%` volume discount, and the **Team** staff-management page. Sign out before changing roles.
2. Sign in as staff. Open **Customers** and review both synthetic customer records. In **Quotes**, inspect the seeded Draft, Quotation, and Confirmed examples. Create another quote for Brightloop Demo Company from **Selection Round Demo Quote**; it defaults to five monthly plan seats, the Odoo variant, tax rules, Net 30 terms, and 14-day validity. The server calculates the variant price and taxes.
3. Review the quote totals, send it, and confirm the simulated email status. Confirm the quotation to create an active subscription. In **Subscriptions**, review its number, next billing date, lines, and lifecycle history.
4. Open **Billing runs** to review the completed seed run. Run billing for today's business date for the new due subscription, then repeat the same date and confirm no duplicate invoice is created.
5. Open **Invoices**. Confirm the new Draft invoice and record a partial payment. Review the remaining balance. Inspect the seeded Paid invoice and the partially paid overdue invoice as examples for payment, status, and overdue handling.
6. Open **Reports** and review active subscriptions, collected payments, invoiced totals, outstanding balances, and overdue invoices. Widen the date range if needed, then change it to see the summary update.
7. Sign out, then sign in as `demo-customer@example.test`. The portal should show only Brightloop Demo Company's subscription and invoices. Try **Pause** and **Resume** on the seeded active subscription to demonstrate self-service, then sign out.

For a short selection-round video, show the admin configuration/team, staff quote-to-subscription and invoice/payment/report flow, and the customer portal. Use a fresh browser context or sign out between roles. Keep the demo password out of the recording; sign in before capture or mask the credential fields.

Expected quote calculation before discount: five plan seats at `$120.00` plus one add-on at `$600.00` (base `$40.00` + variant adjustment `$560.00`) gives `$1,200.00` subtotal. At `8.25%` tax, the quote total is `$1,299.00`. The 10% discount applies during invoice generation, subject to the live rule's eligibility and remaining-use checks.

## Prepare a hosted selection demo

The root [`Dockerfile`](../Dockerfile) builds the Vite client and packages it with Django/Gunicorn. [`render.yaml`](../render.yaml) configures a Render web service, `/healthz/`, and a pre-deploy migration command. It expects a separately provisioned PostgreSQL URL, allowed-host list, and CSRF trusted-origin list; supply them through the host's secret/environment settings. See the cost assumptions in [`PLAN.md`](PLAN.md).

After deployment, seed only synthetic data in the dedicated demo database. Set `DEMO_SEED_PASSWORD` as a temporary secret for the one-off seed command, run `python manage.py seed_demo`, then remove the temporary value. Verify the deployed walkthrough before sharing the URL with judges. Quote and invoice emails remain simulated until a provider is configured.
