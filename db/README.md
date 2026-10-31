# Database schema reference

- `schema.mmd` is the relationship diagram for the subscription system.
- `schema.sql` is the PostgreSQL-oriented table/constraint reference for that model.
- Django models and migrations in `../backend/` are the executable source of truth. Do not apply `schema.sql` manually to a deployed database; evolve the schema through Django migrations and keep this reviewed reference in sync.

The schema uses UUID primary keys, fixed-precision money values with explicit currency, immutable invoice snapshots, and database uniqueness for invoice-per-subscription-period idempotency. Django's framework-owned auth/group/permission/session tables are created by Django migrations and are not duplicated in this reference.
