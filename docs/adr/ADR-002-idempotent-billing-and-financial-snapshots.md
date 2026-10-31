# ADR-002: Make Billing Idempotent and Preserve Financial Snapshots

- **Status:** Accepted for selection-round MVP
- **Date:** 2026-10-31
- **Decision owners:** Srinanth, Angelo, Deepak

## Context

The brief requires recurring invoices to be generated without duplicates or missed subscriptions. Product prices, tax rules, discounts, or customer details may change after an invoice is issued. Scheduled jobs can fail or be retried.

## Decision

- Identify a billing period by subscription and period start; enforce uniqueness for that pair in persistent storage.
- Create the invoice and advance the subscription's next billing date in one transaction, or use an equivalent recoverable claim protocol.
- Persist billing-run outcomes and per-subscription failures so operators can retry safely.
- Snapshot customer billing details, currency, quantities, unit prices, tax rates/amounts, and discounts on invoice records/lines.
- Reserve a capped discount use with the invoice UUID during invoice generation, consume it when the invoice is confirmed, and release it only if the unconfirmed invoice is cancelled. Make the rule/invoice pair unique and serialize concurrent reservations by locking the discount rule row.
- Represent money with fixed-precision decimals and an explicit currency.
- Treat invoice totals as immutable after confirmation; corrections require a separate adjustment workflow if added later.

## Consequences

- Retries and concurrent billing workers cannot create duplicate invoices for one period.
- Issued invoices remain explainable after catalog and tax configuration changes.
- The data model needs period keys, snapshots, and transactional state advancement.
- Discount redemptions use a protected foreign key to the invoice, and snapshot rows retain nullable foreign keys to the source tax/discount rules so a deleted configuration can never rewrite an issued invoice.
