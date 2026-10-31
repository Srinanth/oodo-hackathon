# Selection-round demo walkthrough

This walkthrough uses synthetic records only. Run it against a local database or a dedicated demo database; never against production customer data.

## Prepare the demo data

From the repository root, start the three-service development stack:

```sh
docker compose up --build -d
```

Compose starts PostgreSQL 18, Django, and Vite. The backend waits for the database and applies migrations before it starts accepting requests. The frontend is available at `http://localhost:5173`.

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

## Walk through the product flow

1. Sign in as the administrator. Review the **Odoo Brand Add-on** product and its `Odoo` variant, which adds `$560.00`; the monthly team plan; the `8.25%` tax rule; and the `10%` volume discount.
2. Open **Quotes** as staff and create a quote for Brightloop Demo Company from **Selection Round Demo Quote**. Its defaults include five monthly plan seats, the Odoo variant, tax rules, Net 30 terms, and 14-day validity. The server prices the add-on from the product plus variant instead of trusting a client-supplied price.
3. Review the line and tax totals, then send the quote. The UI labels email delivery as simulated. Confirm the quotation to create one active subscription.
4. Open **Subscriptions** and verify the generated subscription number, next billing date, lines, and lifecycle history.
5. Sign in as `demo-customer@example.test` in another browser session. Verify that the portal shows the linked subscription and only that customer's invoices. The plan permits pause and renewal actions.
6. Return to the staff session and run billing for the current business date. The system should create one invoice with line/tax snapshots and the eligible volume discount. Re-run the same date and verify that the subscription-period invoice is not duplicated.
7. Open **Invoices**, record a manual payment against the generated invoice, and verify the remaining balance and paid state after settling the balance.
8. Open **Reports** and review active subscriptions, collected payments, invoiced totals, outstanding balances, and overdue invoices. Change the date range and confirm the summary refreshes.

Expected quote calculation before discount: five plan seats at `$120.00` plus one add-on at `$600.00` (base `$40.00` + variant adjustment `$560.00`) gives `$1,200.00` subtotal. At `8.25%` tax, the quote total is `$1,299.00`. The 10% discount applies during invoice generation, subject to the live rule's eligibility and remaining-use checks.

## Prepare a hosted selection demo

The root [`Dockerfile`](../Dockerfile) builds the Vite client and packages it with Django/Gunicorn. [`render.yaml`](../render.yaml) configures a Render web service, `/healthz/`, and a pre-deploy migration command. It expects a separately provisioned PostgreSQL URL, allowed-host list, and CSRF trusted-origin list; supply them through the host's secret/environment settings. See the cost assumptions in [`PLAN.md`](PLAN.md).

After deployment, seed only synthetic data in the dedicated demo database. Set `DEMO_SEED_PASSWORD` as a temporary secret for the one-off seed command, run `python manage.py seed_demo`, then remove the temporary value. Verify the deployed walkthrough before sharing the URL with judges. Quote and invoice emails remain simulated until a provider is configured.
