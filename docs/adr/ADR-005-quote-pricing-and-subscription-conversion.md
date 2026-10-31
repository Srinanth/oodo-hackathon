# ADR-005: Price Quotes on the Server and Convert Them into Billing Subscriptions

- **Status:** Accepted for selection-round MVP
- **Date:** 2026-10-31
- **Decision owners:** Srinanth, Angelo, Deepak

## Context

The quote and subscription workflow crosses the catalog, tax, customer, and recurring billing domains. Client-supplied prices could become stale or be manipulated, and retries must not create duplicate subscriptions. Billing also needs stable product, price, and tax inputs after catalog changes.

## Decision

- Quote lines select active plans or products, optional matching variants, quantity, and tax rules. The backend derives the unit price from catalog data and rejects mixed currencies, unavailable offerings, and invalid quantities.
- Store the priced line totals and tax name/rate snapshots on the quote. Template lines retain defaults; creating a quote copies them and prices them against the current catalog.
- Sending a quote changes its state to `quotation`. Until an email provider is configured, the API explicitly reports simulated delivery.
- Confirm only a sent, unexpired quote with at least one priced line. Within one transaction, create at most one subscription per source quote, copy its lines and tax-rule assignments, and record the lifecycle event.
- Use the selected plan interval for recurring billing. Product-only subscriptions use a monthly interval. Preserve the subscription's copied unit prices and tax assignments for billing.
- Enforce customer ownership and plan pause/renewal policy on the server. Lifecycle changes create subscription events.

## Consequences

- `QuoteLine`, `QuoteLineTax`, `SubscriptionLine`, and tax-rule assignments are persisted so billing is independent of client input and the quote's historical totals remain reviewable.
- Quote confirmation and billing retries are safe to repeat. Subscription-to-invoice generation continues through the existing billing service and its subscription-period idempotency constraint.
- Quote and subscription models/migrations are the executable schema source of truth; `db/schema.sql`, `db/schema.mmd`, and `docs/API.md` must stay aligned.
- Email delivery remains simulated for the MVP. Customer portal access requires a staff-managed customer/account association.
