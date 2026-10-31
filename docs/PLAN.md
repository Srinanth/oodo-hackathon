# Brightloop Hosting and Cost Plan

**Status:** Proposed MVP deployment plan  
**Pricing checked:** 2026-10-31  
**Currency:** USD; taxes, currency conversion, and card fees are excluded.

## Recommendation

Keep the documented modular-monolith deployment: one Django/Gunicorn web service serves the built React app and API from one origin, with one managed PostgreSQL database. For a persistent selection-round demo, use Render Hobby with a paid small web service and paid PostgreSQL in the same region. This avoids a separate frontend host, Redis, a worker, Kubernetes, and a second deployment pipeline.

Use the provider's free tier only for short-lived previews or rehearsals with disposable data. It is not the persistent demo target: Render's free web service spins down after 15 minutes idle, can take about a minute to wake, and its free PostgreSQL database expires after 30 days without backups. [Render free-tier limits](https://render.com/docs/free)

## MVP monthly budget

| Environment | Web/API | PostgreSQL | Expected platform total | Use |
|---|---:|---:|---:|---|
| Local development | $0 | $0 (Docker Compose) | $0 | Team development; each contributor runs the app locally. |
| Temporary preview | $0 (free web service) | $0 (free DB) | $0 | Short demo rehearsals using disposable, synthetic data; accept cold starts and DB expiry. |
| Persistent selection demo | $7/month (512 MB web service) | $6/month (256 MB DB compute; 1 GB storage included) | **About $13/month** | Recommended always-on demo baseline; allow for taxes and usage over included limits. |
| Small persistent deployment with more DB headroom | $7/month (512 MB web service) | $19/month (1 GB DB compute) | **About $26/month** | Upgrade the database first if measured memory pressure or query latency requires it. |

Render's Hobby workspace is listed at $0/month; service compute is billed separately. Its published pricing lists the smallest web service at $7/month, the smallest paid PostgreSQL compute at $6/month, and 1 GB of database storage included, with additional storage at $0.30/GB/month. The 1 GB RAM PostgreSQL compute tier is listed at $19/month. See [Render pricing](https://render.com/pricing) and [Render compute plan details](https://render.com/docs/compute-plans).

The totals above are estimates for continuously running instances, before taxes, bandwidth/storage growth, transactional email, and optional domain registration. Confirm the selected region and final plan in the provider dashboard before provisioning.

## Scalability cost metric

Use **monthly infrastructure cost per active subscription** as a planning metric:

```text
monthly infrastructure cost per active subscription
  = modeled monthly platform infrastructure spend
    / average number of subscriptions in active status during that month
```

Paused and closed subscriptions are excluded from the denominator. This is an infrastructure unit-cost indicator for the team; it is not a customer price or a full accounting cost. It excludes support, engineering, taxes, email, payment processing, domain fees, and usage over included bandwidth. Render charges workspace, compute, storage, and metered usage separately. [Render pricing](https://render.com/pricing)

| Scale scenario | Average active subscriptions | Illustrative monthly infrastructure | Cost per active subscription / month |
|---|---:|---|---:|
| Selection demo | 100 | $7 web (`0.5c-512mb`) + $6 Postgres (`0.1c-256mb`); 1 GB DB storage included = **$13** | **$0.1300** |
| Pilot | 1,000 | $25 web (`1c-2g`) + $19 Postgres (`0.5c-1g`) + 4 GB extra DB storage × $0.30 = **$45.20** | **$0.0452** |
| Growth | 10,000 | Pro workspace $25 + 2 × $25 web (`1c-2g`) + $55 Postgres (`1c-4g`) + 49 GB extra DB storage × $0.30 + $1 scheduled-job minimum = **$145.70** | **$0.01457** |

These scenarios are planning examples, not capacity guarantees. The growth example assumes a Pro workspace for autoscaling, two web instances, 50 GB total database storage, and one small scheduled billing job; actual cron charges depend on run time. Render currently includes 5 GB monthly bandwidth on Hobby and 25 GB on Pro, then charges $0.15/GB; overages are not included above. Paid compute plans are billed per instance, so a second web instance adds another plan charge. [Compute plan specs](https://render.com/docs/compute-plans), [Postgres storage](https://render.com/docs/postgresql-creating-connecting), [Cron job billing](https://render.com/docs/cronjobs)

Active subscription count alone does not determine required capacity. Request rate, concurrency, billing batch size, invoice history, and report query cost all matter. Treat each row as an initial budget envelope, then measure p95 response time, report latency, database CPU/memory/connections, storage growth, and billing duration in a representative workload before changing tiers. Keep the PRD report target of under two seconds at thousands of subscriptions as a performance gate.

## Included in the MVP; defer until required

| Service or capability | MVP decision | Cost treatment |
|---|---|---|
| React hosting | Build with Vite and serve through Django/WhiteNoise | Included in the single web-service estimate; no separate static-site service. |
| Database | One managed PostgreSQL instance; colocate it with the web service | Included in the estimate; keep the database private to the app where supported. |
| Billing schedule | Staff-triggered billing run for the demo | No always-on worker or scheduler. Add one scheduled job only when automatic billing is required; price it from measured run duration. |
| Email | Console backend locally; for the demo, use a clearly labeled simulated send or configure a transactional email provider | Provider cost is not included. Choose a provider and verify its current sending limits and price before enabling real mail. |
| Domain | Use the provider hostname for the selection round | Optional domain registration is not included; price it at purchase time. |
| File/PDF storage | No uploads or generated PDF archive until required | No object-storage bucket in the initial deployment. If PDFs become persistent records, add object storage and lifecycle/retention rules. |
| Cache/queue | No Redis, Celery, or separate worker | Keep billing idempotency and report aggregation in PostgreSQL for the current scale. Revisit after profiling or when request-time work becomes too long. |
| Payments | Manual payment recording only | No gateway fees or payment-provider integration in the MVP budget. |
| UI design | Stitch is a development/design tool, not part of Brightloop's runtime | Excluded from hosting costs; verify any account-specific Stitch limits separately. |

## Deployment shape

1. Build the frontend and package it with Django/Gunicorn using the root `Dockerfile`.
2. `render.yaml` describes a Singapore-region web service, checks `/healthz/`, and runs `python manage.py migrate --noinput` as a pre-deploy command.
3. Provision one managed PostgreSQL database in the same region. Put its private connection URL in the service's `DATABASE_URL` secret; also set `DJANGO_ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` before exposing the app.
4. Keep migrations in the host's deploy/release step, not in every web worker's startup command.
5. Trigger billing manually during selection demos. If recurring automated runs become a product requirement, add a scheduled management-command job with a bounded timeout and idempotent run key.
6. Configure HTTPS, secure session/CSRF cookies, allowed hosts, trusted origins, and a strong Django secret before exposing the app.

The deployment blueprint is preparation only. It does not create a database or deploy the service. Provisioning and a hosted end-to-end rehearsal remain part of shared checkpoint `INT-04`.

## Spend controls and operational guardrails

- Set a monthly spend limit or billing alert before enabling paid services. Alert the team at 50%, 80%, and 100% of the expected budget.
- Keep all contributors on local Docker Compose; do not create one cloud database per developer.
- Use one persistent demo environment only. Stop or delete unused preview services and databases promptly.
- Avoid large image/PDF responses and keep API pages paginated. Serve the SPA and API from one origin and keep app/database traffic within the provider network.
- Use synthetic customer and payment data in selection demos. Never load production credentials, payment data, or personal customer data into Stitch or preview environments.
- Keep database backups enabled for any persistent demo with data that must survive. Rehearse a restore before relying on a backup as the only recovery path.
- Review provider usage weekly during the hackathon and after each demo; record actual service, database, bandwidth, and storage usage before increasing tiers.

## Scale-up triggers

Scale only in response to measurements:

- Increase web memory/CPU if sustained memory pressure, restarts, or p95 latency show the 512 MB web plan is insufficient.
- Increase PostgreSQL compute/storage if database memory pressure, connection saturation, disk growth, or report latency requires it. The PRD's finance-report target remains under two seconds at thousands of subscriptions; use indexes, pagination, and SQL aggregates before adding a cache.
- Add a scheduled billing job when a manual run no longer satisfies the product workflow. Add a queue/worker only if measured billing duration or retry handling cannot fit a scheduled command safely.
- Add a read replica only after profiling demonstrates database read contention; do not introduce it for the selection-round dataset.
- Add a second web replica/load balancing only when traffic or availability needs justify the added compute. Keep app instances stateless and PostgreSQL authoritative.

## Open cost decisions

- Confirm the cloud account owner and billing contact before provisioning paid resources.
- Confirm the intended region and whether the persistent demo must remain reachable continuously or only during judging windows.
- Decide whether password reset and invoice sending need real transactional email for judging. If yes, compare current provider plans and add the chosen amount to this budget.
- Add a custom domain only if the judging flow benefits from one; the Render service hostname is sufficient for the MVP.
- Recheck provider pricing immediately before deployment because rates, plan names, and included usage can change.

## Sources

- [Render pricing](https://render.com/pricing)
- [Render compute plans](https://render.com/docs/compute-plans)
- [Render free-service limitations](https://render.com/docs/free)
- [Render web services and deployment configuration](https://render.com/docs/web-services)
