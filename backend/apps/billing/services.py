from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
import logging
import re
from typing import Any, Callable, List, Optional
import uuid

from django.db.models import Q

from django.apps import apps
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from apps.catalog.models import DiscountRule, TaxRule
from apps.catalog.discount_services import (
    DiscountUnavailable,
    discount_snapshot,
    evaluate_discount,
    reserve_discount_use,
)
from apps.catalog.tax_services import calculate_tax

from .models import (
    BillingRun,
    BillingRunItem,
    Invoice,
    InvoiceDiscountLine,
    InvoiceLine,
    InvoiceLineTax,
)

logger = logging.getLogger(__name__)


@dataclass
class SubscriptionLineData:
    line_number: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    currency: str = "USD"
    product_id: Optional[uuid.UUID] = None
    variant_id: Optional[uuid.UUID] = None
    tax_rules: List[dict] = field(default_factory=list)


@dataclass
class SubscriptionData:
    id: uuid.UUID
    number: str
    customer_id: uuid.UUID
    plan_id: Optional[uuid.UUID]
    status: str
    start_date: date
    next_billing_at: date
    next_period_start: Optional[date] = None
    expiry_date: Optional[date] = None
    payment_terms: str = "Net 30"
    currency: str = "USD"
    interval_unit: str = "monthly"
    interval_count: int = 1
    customer_name: str = ""
    customer_email: str = ""
    billing_address: str = ""
    lines: List[SubscriptionLineData] = field(default_factory=list)


def parse_business_date(val: Any) -> date:
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, str):
        return datetime.strptime(val.strip(), "%Y-%m-%d").date()
    return timezone.now().date()


def compute_period_bounds(
    period_start: date,
    interval_unit: str = "monthly",
    interval_count: int = 1,
) -> tuple[date, date]:
    """Compute (period_start, period_end) based on plan interval."""
    interval_unit = (interval_unit or "monthly").lower()
    count = max(1, interval_count or 1)

    if interval_unit == "daily":
        period_end = period_start + timedelta(days=count - 1)
    elif interval_unit == "weekly":
        period_end = period_start + timedelta(days=(7 * count) - 1)
    elif interval_unit == "yearly":
        try:
            next_start = period_start.replace(year=period_start.year + count)
        except ValueError:
            # Handle Feb 29 leap years
            next_start = period_start.replace(year=period_start.year + count, day=28)
        period_end = next_start - timedelta(days=1)
    else:
        # Default monthly calculation
        year = period_start.year
        month = period_start.month + count
        while month > 12:
            year += 1
            month -= 12
        day = period_start.day
        # Find valid day for destination month
        while True:
            try:
                next_start = date(year, month, day)
                break
            except ValueError:
                day -= 1
        period_end = next_start - timedelta(days=1)

    return period_start, period_end


def compute_due_date(issue_date: date, payment_terms: str) -> date:
    """Derive due date from payment terms string (e.g., 'Net 30', 'Net 15')."""
    if not payment_terms:
        return issue_date + timedelta(days=30)

    terms_lower = payment_terms.strip().lower()
    if "immediate" in terms_lower or "due on receipt" in terms_lower:
        return issue_date

    match = re.search(r"net\s*(\d+)", terms_lower)
    if match:
        days = int(match.group(1))
        return issue_date + timedelta(days=days)

    return issue_date + timedelta(days=30)


def generate_invoice_number(business_date: date) -> str:
    """Generate sequential invoice number: INV-YYYYMMDD-XXXX."""
    date_str = business_date.strftime("%Y%m%d")
    prefix = f"INV-{date_str}-"
    last_invoice = (
        Invoice.objects.filter(number__startswith=prefix)
        .order_by("-number")
        .first()
    )
    if last_invoice:
        try:
            last_seq = int(last_invoice.number.split("-")[-1])
            seq = last_seq + 1
        except (ValueError, IndexError):
            seq = Invoice.objects.count() + 1
    else:
        seq = 1

    candidate = f"{prefix}{seq:04d}"
    # Ensure uniqueness in case of race/deletion
    counter = seq
    while Invoice.objects.filter(number=candidate).exists():
        counter += 1
        candidate = f"{prefix}{counter:04d}"

    return candidate


def fetch_customer_snapshots(customer_id: uuid.UUID) -> tuple[str, str, str]:
    """Fetch customer name, email, billing address snapshots."""
    try:
        CustomerModel = apps.get_model("customers", "Customer")
        cust = CustomerModel.objects.filter(id=customer_id).first()
        if cust:
            name = (cust.company_name or cust.contact_name).strip() or "Customer"
            email = cust.email or "billing@example.com"
            address = cust.billing_address or ""
            return name, email, address
    except (LookupError, ValueError, Exception):
        pass

    # Try raw SQL if customer table exists
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT company_name, contact_name, email, billing_address FROM customer WHERE id = %s",
                [customer_id],
            )
            row = cursor.fetchone()
            if row:
                name = (row[0] or row[1] or "").strip() or "Customer"
                email = row[2] or "billing@example.com"
                address = row[3] or ""
                return name, email, address
    except Exception:
        pass

    return f"Customer {str(customer_id)[:8]}", "billing@example.com", ""


def get_due_subscriptions(
    business_date: date,
    subscription_provider: Optional[Callable[[date], List[SubscriptionData]]] = None,
) -> List[SubscriptionData]:
    """
    Retrieve subscriptions due for billing on or before the business date.

    Selection criteria (all must hold):
      - status is 'confirmed' or 'active'
      - next_billing_at <= business_date (the subscription period is due)
      - expiry_date is NULL or expiry_date >= business_date
        (expired subscriptions are not billed)

    Supports a pluggable subscription_provider callback, Django ORM query
    with SELECT FOR UPDATE row locking, or a raw SQL fallback.
    """
    if subscription_provider is not None:
        return subscription_provider(business_date)

    # 1. Try query via Django ORM if Subscription model exists
    try:
        SubscriptionModel = apps.get_model("subscriptions", "Subscription")
        qs = SubscriptionModel.objects.filter(
            status__in=["confirmed", "active"],
            next_billing_at__lte=business_date,
        ).filter(
            # Exclude subscriptions past their expiry date
            Q(expiry_date__isnull=True) | Q(expiry_date__gte=business_date)
        ).select_for_update(
            # Row-level lock prevents concurrent billing workers from
            # double-processing the same subscription.
            skip_locked=True
        ).order_by("next_billing_at", "id")

        if hasattr(SubscriptionModel, "lines"):
            qs = qs.prefetch_related("lines")

        results = []
        for sub in qs:
            name, email, address = fetch_customer_snapshots(sub.customer_id)

            # Resolve interval from related plan when available
            interval_unit = "monthly"
            interval_count = 1
            if hasattr(sub, "plan") and sub.plan is not None:
                interval_unit = getattr(sub.plan, "interval_unit", "monthly") or "monthly"
                interval_count = getattr(sub.plan, "interval_count", 1) or 1

            lines = []
            if hasattr(sub, "lines"):
                for line in sub.lines.all():
                    tax_rules = []
                    # Resolve attached tax rules if the join table exists
                    if hasattr(line, "tax_rules"):
                        current_tax_rules = line.tax_rules.filter(is_active=True).filter(
                            (Q(active_from__isnull=True) | Q(active_from__lte=business_date))
                            & (Q(active_until__isnull=True) | Q(active_until__gte=business_date))
                        )
                        for tr in current_tax_rules:
                            tax_rules.append({
                                "id": tr.id,
                                "name": tr.name,
                                "rate_percent": str(tr.rate_percent),
                            })
                    lines.append(
                        SubscriptionLineData(
                            line_number=line.line_number,
                            description=line.description,
                            quantity=Decimal(str(line.quantity)),
                            unit_price=Decimal(str(line.unit_price)),
                            currency=getattr(line, "currency", sub.currency),
                            product_id=getattr(line, "product_id", None),
                            tax_rules=tax_rules,
                        )
                    )
            results.append(
                SubscriptionData(
                    id=sub.id,
                    number=sub.number,
                    customer_id=sub.customer_id,
                    plan_id=getattr(sub, "plan_id", None),
                    status=sub.status,
                    start_date=sub.start_date,
                    next_billing_at=sub.next_billing_at,
                    next_period_start=getattr(sub, "next_period_start", None),
                    expiry_date=getattr(sub, "expiry_date", None),
                    payment_terms=getattr(sub, "payment_terms", "Net 30"),
                    currency=getattr(sub, "currency", "USD"),
                    interval_unit=interval_unit,
                    interval_count=interval_count,
                    customer_name=name,
                    customer_email=email,
                    billing_address=address,
                    lines=lines,
                )
            )
        logger.info(
            "get_due_subscriptions ORM: found %d due subscriptions for %s",
            len(results), business_date,
        )
        return results
    except (LookupError, ValueError, Exception):
        pass

    # 2. Try raw SQL query if PostgreSQL subscription table exists
    try:
        # Missing subscription tables are expected until the subscription
        # domain is integrated. A savepoint lets this optional fallback fail
        # safely without aborting the caller's transaction.
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT s.id, s.number, s.customer_id, s.plan_id, s.status,
                           s.start_date, s.expiry_date, s.next_period_start,
                           s.next_billing_at, s.payment_terms, s.currency,
                           COALESCE(p.interval_unit, 'monthly') AS interval_unit,
                           COALESCE(p.interval_count, 1)        AS interval_count
                    FROM subscription s
                    LEFT JOIN plan p ON p.id = s.plan_id
                    WHERE s.status IN ('confirmed', 'active')
                      AND s.next_billing_at <= %s
                      AND (s.expiry_date IS NULL OR s.expiry_date >= %s)
                    ORDER BY s.next_billing_at, s.id
                    FOR UPDATE OF s SKIP LOCKED
                    """,
                    [business_date, business_date],
                )
                rows = cursor.fetchall()

        results = []
        for row in rows:
            sub_id = row[0]
            name, email, address = fetch_customer_snapshots(row[2])

            lines = []
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT sl.id, sl.line_number, sl.product_id, sl.description,
                               sl.quantity, sl.unit_price, sl.currency
                        FROM subscription_line sl
                        WHERE sl.subscription_id = %s
                        ORDER BY sl.line_number
                        """,
                        [sub_id],
                    )
                    line_rows = cursor.fetchall()
                    for lr in line_rows:
                        # Resolve tax rules for this subscription line
                        tax_rules = []
                        try:
                            with connection.cursor() as tax_cursor:
                                tax_cursor.execute(
                                    """
                                    SELECT tr.id, tr.name, tr.rate_percent
                                    FROM subscription_line_tax_rule sltr
                                    JOIN tax_rule tr ON tr.id = sltr.tax_rule_id
                                    WHERE sltr.subscription_line_id = %s
                                      AND tr.is_active = TRUE
                                      AND (tr.active_from IS NULL OR tr.active_from <= %s)
                                      AND (tr.active_until IS NULL OR tr.active_until >= %s)
                                    """,
                                    [lr[0], business_date, business_date],
                                )
                                for tr_row in tax_cursor.fetchall():
                                    tax_rules.append({
                                        "id": tr_row[0],
                                        "name": tr_row[1],
                                        "rate_percent": str(tr_row[2]),
                                    })
                        except Exception:
                            pass

                        lines.append(
                            SubscriptionLineData(
                                line_number=lr[1],
                                product_id=lr[2],
                                description=lr[3],
                                quantity=Decimal(str(lr[4])),
                                unit_price=Decimal(str(lr[5])),
                                currency=lr[6] or row[10],
                                tax_rules=tax_rules,
                            )
                        )
            except Exception:
                pass

            results.append(
                SubscriptionData(
                    id=sub_id,
                    number=row[1],
                    customer_id=row[2],
                    plan_id=row[3],
                    status=row[4],
                    start_date=row[5],
                    expiry_date=row[6],
                    next_period_start=row[7],
                    next_billing_at=row[8],
                    payment_terms=row[9] or "Net 30",
                    currency=row[10] or "USD",
                    interval_unit=row[11] or "monthly",
                    interval_count=row[12] or 1,
                    customer_name=name,
                    customer_email=email,
                    billing_address=address,
                    lines=lines,
                )
            )
        logger.info(
            "get_due_subscriptions SQL: found %d due subscriptions for %s",
            len(results), business_date,
        )
        return results
    except Exception:
        # Tables don't exist yet in DB
        return []


def advance_subscription_date(subscription_id: uuid.UUID, new_date: date) -> None:
    """Advance the subscription next_billing_at and next_period_start."""
    try:
        SubscriptionModel = apps.get_model("subscriptions", "Subscription")
        sub = SubscriptionModel.objects.filter(id=subscription_id).first()
        if sub:
            sub.next_billing_at = new_date
            sub.next_period_start = new_date
            sub.save(update_fields=["next_billing_at", "next_period_start", "updated_at"])
            return
    except (LookupError, ValueError, Exception):
        pass

    try:
        # Keep the optional raw-SQL fallback in a savepoint. During tests and
        # early integrations the subscriptions table may not exist yet; a
        # caught PostgreSQL error without a savepoint still poisons the
        # surrounding invoice transaction.
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE subscription
                    SET next_billing_at = %s, next_period_start = %s, updated_at = now()
                    WHERE id = %s
                    """,
                    [new_date, new_date, subscription_id],
                )
    except Exception:
        pass


def _skip_expired_subscription(sub: SubscriptionData, business_date: date) -> bool:
    """Return True if the subscription has expired and should be skipped."""
    if sub.expiry_date and sub.expiry_date < business_date:
        logger.info(
            "Skipping subscription %s (%s): expired on %s, business_date=%s",
            sub.id, sub.number, sub.expiry_date, business_date,
        )
        return True
    return False


def execute_billing_run(
    business_date: Any,
    triggered_by: Optional[Any] = None,
    dry_run: bool = False,
    subscription_provider: Optional[Callable[[date], List[SubscriptionData]]] = None,
    subscriptions_override: Optional[List[SubscriptionData]] = None,
) -> BillingRun:
    """
    Executes a recurring billing run for the given business date.

    Idempotency guarantees:
      1. Fast-path check: query for existing invoice by
         (subscription_id, billing_period_start) before attempting creation.
      2. Atomic savepoint: invoice creation + subscription date advancement
         happen inside transaction.atomic().
      3. IntegrityError catch: if a concurrent worker created the invoice
         between our check and our INSERT, the unique constraint
         'invoice_one_per_period' fires and we gracefully record
         'already_exists' instead of failing.
      4. Row-level locking: when using the ORM/SQL selection path,
         SELECT FOR UPDATE SKIP LOCKED prevents two billing workers from
         processing the same subscription simultaneously.

    Subscription selection filter:
      - Only 'confirmed' or 'active' subscriptions.
      - next_billing_at <= business_date.
      - expiry_date is NULL or >= business_date (expired subs excluded).
    """
    parsed_date = parse_business_date(business_date)

    billing_run = BillingRun.objects.create(
        business_date=parsed_date,
        status=BillingRun.Status.RUNNING,
        triggered_by=triggered_by if getattr(triggered_by, "is_authenticated", False) else None,
        started_at=timezone.now(),
    )
    logger.info("Billing run %s started for business_date=%s", billing_run.id, parsed_date)

    if subscriptions_override is not None:
        due_subscriptions = subscriptions_override
    else:
        # NOTE: When using the ORM/SQL path, get_due_subscriptions acquires
        # SELECT FOR UPDATE SKIP LOCKED on the subscription rows to serialize
        # concurrent billing workers.  For subscriptions_override (tests),
        # this lock is not held since the data is caller-supplied.
        due_subscriptions = get_due_subscriptions(
            parsed_date,
            subscription_provider=subscription_provider,
        )

    billing_run.subscriptions_seen = len(due_subscriptions)

    invoices_created = 0
    failures = 0
    skipped = 0
    failure_messages = []

    for sub in due_subscriptions:
        # Guard: skip subscriptions that have expired (defense-in-depth;
        # the selection query also filters these, but overrides may not).
        if _skip_expired_subscription(sub, parsed_date):
            BillingRunItem.objects.create(
                billing_run=billing_run,
                subscription_id=sub.id,
                period_start=sub.next_period_start or sub.next_billing_at or parsed_date,
                status=BillingRunItem.Status.SKIPPED,
                error_message="Subscription expired before business date.",
            )
            skipped += 1
            continue

        period_start = sub.next_period_start or sub.next_billing_at or parsed_date
        period_start, period_end = compute_period_bounds(
            period_start,
            interval_unit=sub.interval_unit,
            interval_count=sub.interval_count,
        )
        new_next_billing_at = period_end + timedelta(days=1)

        # Dry run simulation
        if dry_run:
            existing = Invoice.objects.filter(
                subscription_id=sub.id,
                billing_period_start=period_start,
            ).first()
            if existing:
                BillingRunItem.objects.create(
                    billing_run=billing_run,
                    subscription_id=sub.id,
                    period_start=period_start,
                    invoice=existing,
                    status=BillingRunItem.Status.ALREADY_EXISTS,
                )
                logger.debug(
                    "[DRY-RUN] Sub %s period %s: invoice %s already exists",
                    sub.id, period_start, existing.number,
                )
            else:
                BillingRunItem.objects.create(
                    billing_run=billing_run,
                    subscription_id=sub.id,
                    period_start=period_start,
                    status=BillingRunItem.Status.CREATED,
                )
                invoices_created += 1
                logger.debug(
                    "[DRY-RUN] Sub %s period %s: would create invoice",
                    sub.id, period_start,
                )
            continue

        # ── Idempotency: fast-path check ────────────────────────────
        # Before entering the atomic block, check if an invoice already
        # exists for this (subscription, period).  This avoids taking a
        # savepoint and doing the full calculation for the common retry
        # scenario where the invoice was already created.
        existing_invoice = Invoice.objects.filter(
            subscription_id=sub.id,
            billing_period_start=period_start,
        ).first()

        if existing_invoice:
            BillingRunItem.objects.create(
                billing_run=billing_run,
                subscription_id=sub.id,
                period_start=period_start,
                invoice=existing_invoice,
                status=BillingRunItem.Status.ALREADY_EXISTS,
            )
            logger.info(
                "Idempotency: invoice %s already exists for sub %s period %s; skipping.",
                existing_invoice.number, sub.id, period_start,
            )
            continue

        # ── Idempotency: atomic invoice creation ─────────────────────
        # Wrap invoice creation + subscription advancement in a single
        # atomic savepoint.  If a concurrent worker races past the
        # fast-path check above, the unique constraint
        # 'invoice_one_per_period' on (subscription_id,
        # billing_period_start) will raise IntegrityError, caught below.
        try:
            with transaction.atomic():
                # Re-check inside the savepoint for safety; this narrows
                # the race window to practically zero.
                recheck = Invoice.objects.filter(
                    subscription_id=sub.id,
                    billing_period_start=period_start,
                ).select_for_update().first()

                if recheck:
                    # Created between the fast-path check and entering
                    # the savepoint — treat as already_exists.
                    BillingRunItem.objects.create(
                        billing_run=billing_run,
                        subscription_id=sub.id,
                        period_start=period_start,
                        invoice=recheck,
                        status=BillingRunItem.Status.ALREADY_EXISTS,
                    )
                    logger.info(
                        "Idempotency (recheck): invoice %s for sub %s period %s; skipping.",
                        recheck.number, sub.id, period_start,
                    )
                    continue

                due_date = compute_due_date(parsed_date, sub.payment_terms)
                cust_name = sub.customer_name or f"Customer {str(sub.customer_id)[:8]}"
                cust_email = sub.customer_email or "billing@example.com"
                cust_addr = sub.billing_address or ""

                invoice = Invoice(
                    number=generate_invoice_number(parsed_date),
                    customer_id=sub.customer_id,
                    subscription_id=sub.id,
                    billing_run=billing_run,
                    billing_period_start=period_start,
                    billing_period_end=period_end,
                    status=Invoice.Status.DRAFT,
                    issue_date=parsed_date,
                    due_date=due_date,
                    currency=sub.currency or "USD",
                    customer_name_snapshot=cust_name,
                    customer_email_snapshot=cust_email,
                    billing_address_snapshot=cust_addr,
                    subtotal=Decimal("0.00"),
                    tax_total=Decimal("0.00"),
                    discount_total=Decimal("0.00"),
                    total=Decimal("0.00"),
                )
                invoice.save()

                subtotal_acc = Decimal("0.00")
                tax_acc = Decimal("0.00")
                discount_acc = Decimal("0.00")
                applied_line_amounts = []

                sub_lines = sub.lines
                if not sub_lines:
                    # Create default subscription line if none present
                    sub_lines = [
                        SubscriptionLineData(
                            line_number=1,
                            description=f"Subscription recurring charge ({sub.number})",
                            quantity=Decimal("1.000"),
                            unit_price=Decimal("0.00"),
                            currency=sub.currency or "USD",
                        )
                    ]

                for s_line in sub_lines:
                    if s_line.line_number <= 0:
                        raise ValueError(f"Invalid line number {s_line.line_number}: must be positive.")
                    if s_line.quantity <= 0:
                        raise ValueError(f"Invalid quantity {s_line.quantity}: must be positive.")
                    if s_line.unit_price < 0:
                        raise ValueError(f"Invalid unit price {s_line.unit_price}: cannot be negative.")

                    line_subtotal = (s_line.quantity * s_line.unit_price).quantize(Decimal("0.01"))
                    line_tax = Decimal("0.00")
                    line_disc = Decimal("0.00")
                    line_total = line_subtotal + line_tax - line_disc

                    inv_line = InvoiceLine(
                        invoice=invoice,
                        line_number=s_line.line_number,
                        line_type=InvoiceLine.LineType.PRODUCT,
                        product_id=s_line.product_id,
                        description=s_line.description,
                        quantity=s_line.quantity,
                        unit_price=s_line.unit_price,
                        currency=s_line.currency,
                        subtotal=line_subtotal,
                        tax_total=line_tax,
                        discount_total=line_disc,
                        total=line_total,
                    )
                    inv_line.save()

                    # Save taxes if specified
                    for t_rule in s_line.tax_rules:
                        t_rate = Decimal(str(t_rule.get("rate_percent", "0.0000")))
                        t_amount = calculate_tax(line_subtotal, t_rate)
                        tax_rule_id = t_rule.get("id")
                        if tax_rule_id and not TaxRule.objects.filter(pk=tax_rule_id).exists():
                            # Preserve the financial snapshot while avoiding an
                            # invalid source FK for externally supplied data.
                            tax_rule_id = None
                        InvoiceLineTax.objects.create(
                            invoice_line=inv_line,
                            tax_rule_id=tax_rule_id,
                            name_snapshot=t_rule.get("name", "Tax"),
                            rate_percent_snapshot=t_rate,
                            amount=t_amount,
                        )
                        line_tax += t_amount

                    if line_tax > 0:
                        inv_line.tax_total = line_tax
                        inv_line.total = line_subtotal + line_tax - line_disc
                        inv_line.save(update_fields=["tax_total", "total"])

                    subtotal_acc += line_subtotal
                    tax_acc += line_tax
                    discount_acc += line_disc
                    applied_line_amounts.append({
                        "productId": s_line.product_id,
                        "amount": line_subtotal,
                        "currency": (s_line.currency or sub.currency or "USD").upper(),
                        "quantity": s_line.quantity,
                    })

                # Apply eligible configured discounts in a stable order. Each
                # discount consumes only the remaining amount on its eligible
                # lines, so multiple rules cannot discount the same subtotal.
                discount_as_of = timezone.make_aware(
                    datetime.combine(parsed_date, datetime.max.time()),
                    timezone.get_current_timezone(),
                )
                discount_rules = DiscountRule.objects.filter(is_active=True).prefetch_related("products").order_by("id")
                for rule in discount_rules:
                    result = evaluate_discount(rule, applied_line_amounts, evaluated_at=discount_as_of)
                    discount_amount = result["discountAmount"]
                    if not result["eligible"] or discount_amount <= 0:
                        continue
                    try:
                        reserve_discount_use(rule.pk, invoice.pk, as_of=discount_as_of)
                    except DiscountUnavailable:
                        # A concurrent invoice may claim the last use after
                        # preview; this invoice proceeds without that rule.
                        continue

                    InvoiceDiscountLine.objects.create(
                        invoice=invoice,
                        **discount_snapshot(rule, discount_amount, result["currency"]),
                    )
                    discount_acc += discount_amount
                    eligible_product_ids = (
                        set(rule.products.values_list("id", flat=True))
                        if rule.scope == DiscountRule.Scope.PRODUCTS
                        else None
                    )
                    remaining_discount = discount_amount
                    for line in applied_line_amounts:
                        if eligible_product_ids is not None and line["productId"] not in eligible_product_ids:
                            continue
                        if line["currency"] != result["currency"] or line["amount"] <= 0:
                            continue
                        deduction = min(line["amount"], remaining_discount)
                        line["amount"] -= deduction
                        remaining_discount -= deduction
                        if remaining_discount <= 0:
                            break

                # Update invoice totals
                invoice.subtotal = subtotal_acc
                invoice.tax_total = tax_acc
                invoice.discount_total = discount_acc
                invoice.total = subtotal_acc + tax_acc - discount_acc
                invoice.save(update_fields=["subtotal", "tax_total", "discount_total", "total"])

                # Advance next billing date on subscription
                advance_subscription_date(sub.id, new_next_billing_at)

                # Record successful item
                BillingRunItem.objects.create(
                    billing_run=billing_run,
                    subscription_id=sub.id,
                    period_start=period_start,
                    invoice=invoice,
                    status=BillingRunItem.Status.CREATED,
                )
                invoices_created += 1
                logger.info(
                    "Created invoice %s for sub %s period %s..%s (run %s)",
                    invoice.number, sub.id, period_start, period_end, billing_run.id,
                )

        except IntegrityError as ie:
            # Concurrency race: existing invoice was created between our
            # recheck SELECT FOR UPDATE and the INSERT.  This is the
            # last-resort idempotency safety net.
            logger.info(
                "Idempotency (IntegrityError): invoice already exists for sub %s period %s: %s",
                sub.id, period_start, ie,
            )
            existing = Invoice.objects.filter(
                subscription_id=sub.id,
                billing_period_start=period_start,
            ).first()
            BillingRunItem.objects.create(
                billing_run=billing_run,
                subscription_id=sub.id,
                period_start=period_start,
                invoice=existing,
                status=BillingRunItem.Status.ALREADY_EXISTS,
            )
        except Exception as exc:
            logger.exception("Failed billing subscription %s: %s", sub.id, exc)
            failures += 1
            err_msg = str(exc)
            failure_messages.append(f"Subscription {sub.number or sub.id}: {err_msg}")
            BillingRunItem.objects.create(
                billing_run=billing_run,
                subscription_id=sub.id,
                period_start=period_start,
                status=BillingRunItem.Status.FAILED,
                error_message=err_msg,
            )

    # Finalize billing run record
    billing_run.invoices_created = invoices_created
    billing_run.failures = failures
    billing_run.finished_at = timezone.now()

    if failures == 0:
        billing_run.status = BillingRun.Status.COMPLETED
    elif invoices_created > 0:
        billing_run.status = BillingRun.Status.COMPLETED_WITH_ERRORS
    else:
        billing_run.status = BillingRun.Status.FAILED

    if failure_messages:
        billing_run.error_summary = "\n".join(failure_messages[:20])

    billing_run.save()
    logger.info(
        "Billing run %s finished: status=%s seen=%d created=%d skipped=%d failures=%d",
        billing_run.id, billing_run.status, billing_run.subscriptions_seen,
        invoices_created, skipped, failures,
    )
    return billing_run
