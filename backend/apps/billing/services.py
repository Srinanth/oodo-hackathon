from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
import logging
import re
from typing import Any, Callable, List, Optional
import uuid

from django.apps import apps
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

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
    Supports pluggable subscription provider, Django model query, or DB query.
    """
    if subscription_provider is not None:
        return subscription_provider(business_date)

    # 1. Try query via Django ORM if Subscription model exists
    try:
        SubscriptionModel = apps.get_model("subscriptions", "Subscription")
        qs = SubscriptionModel.objects.filter(
            status__in=["confirmed", "active"],
            next_billing_at__lte=business_date,
        )
        if hasattr(SubscriptionModel, "lines"):
            qs = qs.prefetch_related("lines")

        results = []
        for sub in qs:
            name, email, address = fetch_customer_snapshots(sub.customer_id)
            lines = []
            if hasattr(sub, "lines"):
                for line in sub.lines.all():
                    lines.append(
                        SubscriptionLineData(
                            line_number=line.line_number,
                            description=line.description,
                            quantity=Decimal(str(line.quantity)),
                            unit_price=Decimal(str(line.unit_price)),
                            currency=getattr(line, "currency", sub.currency),
                            product_id=getattr(line, "product_id", None),
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
                    customer_name=name,
                    customer_email=email,
                    billing_address=address,
                    lines=lines,
                )
            )
        return results
    except (LookupError, ValueError, Exception):
        pass

    # 2. Try raw SQL query if PostgreSQL subscription table exists
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, number, customer_id, plan_id, status, start_date, expiry_date,
                       next_period_start, next_billing_at, payment_terms, currency
                FROM subscription
                WHERE status IN ('confirmed', 'active') AND next_billing_at <= %s
                ORDER BY next_billing_at, id
                """,
                [business_date],
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
                        SELECT line_number, product_id, description, quantity, unit_price, currency
                        FROM subscription_line
                        WHERE subscription_id = %s
                        ORDER BY line_number
                        """,
                        [sub_id],
                    )
                    line_rows = cursor.fetchall()
                    for lr in line_rows:
                        lines.append(
                            SubscriptionLineData(
                                line_number=lr[0],
                                product_id=lr[1],
                                description=lr[2],
                                quantity=Decimal(str(lr[3])),
                                unit_price=Decimal(str(lr[4])),
                                currency=lr[5] or row[10],
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
                    customer_name=name,
                    customer_email=email,
                    billing_address=address,
                    lines=lines,
                )
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


def execute_billing_run(
    business_date: Any,
    triggered_by: Optional[Any] = None,
    dry_run: bool = False,
    subscription_provider: Optional[Callable[[date], List[SubscriptionData]]] = None,
    subscriptions_override: Optional[List[SubscriptionData]] = None,
) -> BillingRun:
    """
    Executes a recurring billing run for the given business date.
    Ensures idempotency: if an invoice already exists for (subscription_id, period_start),
    no duplicate is created and the item status is marked 'already_exists'.
    """
    parsed_date = parse_business_date(business_date)

    billing_run = BillingRun.objects.create(
        business_date=parsed_date,
        status=BillingRun.Status.RUNNING,
        triggered_by=triggered_by if getattr(triggered_by, "is_authenticated", False) else None,
        started_at=timezone.now(),
    )

    if subscriptions_override is not None:
        due_subscriptions = subscriptions_override
    else:
        due_subscriptions = get_due_subscriptions(
            parsed_date,
            subscription_provider=subscription_provider,
        )

    billing_run.subscriptions_seen = len(due_subscriptions)

    invoices_created = 0
    failures = 0
    failure_messages = []

    for sub in due_subscriptions:
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
            else:
                BillingRunItem.objects.create(
                    billing_run=billing_run,
                    subscription_id=sub.id,
                    period_start=period_start,
                    status=BillingRunItem.Status.CREATED,
                )
                invoices_created += 1
            continue

        # Check existing invoice first for fast-path idempotency
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
            continue

        # Transactional creation per subscription with atomic savepoint
        try:
            with transaction.atomic():
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

                lines_to_create = []
                subtotal_acc = Decimal("0.00")
                tax_acc = Decimal("0.00")
                discount_acc = Decimal("0.00")

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
                        t_amount = (line_subtotal * (t_rate / Decimal("100"))).quantize(Decimal("0.01"))
                        InvoiceLineTax.objects.create(
                            invoice_line=inv_line,
                            tax_rule_id=t_rule.get("id"),
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

        except IntegrityError as ie:
            # Concurrency race: existing invoice was created concurrently
            logger.info("Invoice already exists for subscription %s period %s: %s", sub.id, period_start, ie)
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
    return billing_run
