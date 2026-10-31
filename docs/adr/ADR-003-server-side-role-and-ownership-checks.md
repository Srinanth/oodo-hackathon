# ADR-003: Enforce Roles and Customer Ownership on the Server

- **Status:** Accepted for selection-round MVP
- **Date:** 2026-10-31
- **Decision owners:** Srinanth, Angelo, Deepak

## Context

The brief defines administrator, internal staff, and customer access. Customers must only see their own subscriptions and invoices, and only an administrator can create staff accounts. Hiding UI controls does not prevent direct API access.

## Decision

- Apply role authorization on every protected API operation, defaulting to deny.
- Resolve the customer's data scope from the authenticated account's server-side customer association.
- Do not treat a client-supplied customer ID as authorization evidence.
- Restrict staff creation and business configuration to administrators; grant staff only operational permissions.
- Return a non-disclosing not-found/forbidden response when a customer requests another customer's resource.

## Consequences

- Ownership and role policies must be shared across API handlers, not duplicated only in the frontend.
- Customer portal endpoints can use the current session to scope queries.
- Authorization behavior can be reviewed consistently as endpoint features are added.
