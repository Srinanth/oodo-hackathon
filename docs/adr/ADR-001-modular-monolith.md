# ADR-001: Use a Modular Monolith for the MVP

- **Status:** Accepted for selection-round MVP
- **Date:** 2026-10-31
- **Decision owners:** Srinanth, Angelo, Deepak

## Context

The product needs tightly connected catalog, quote, subscription, billing, payment, and reporting workflows. Three people need to build in parallel during a short hackathon. The brief does not mandate a language, framework, deployment model, or Odoo module.

## Decision

Build one application with clear domain modules and one relational database. Keep identity/access, catalog/configuration, sales/subscriptions, billing/invoices, and finance reporting separated by code and API boundaries. Do not introduce separately deployed services for the MVP. Select the implementation stack as a team before feature development; this ADR intentionally does not prescribe one.

## Consequences

- Cross-domain operations can use database transactions, which simplifies quote conversion and recurring invoice creation.
- Team members can own modules while integrating against shared contracts.
- Module boundaries and API contracts require discipline because deployment boundaries do not enforce them.
- A later service split is possible if real scaling or ownership needs justify the added operational complexity.
- The standalone-app-versus-Odoo-module question remains open until the team confirms the target environment.
