import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Plan, TaxRule
from apps.catalog.tax_services import calculate_tax

from .models import Quote, QuoteLine, QuoteLineTax, Subscription, SubscriptionEvent, SubscriptionLine

CENT = Decimal("0.01")


def price_for_line(data, currency, on_date):
    plan = data.get("plan")
    product = data.get("product")
    variant = data.get("variant")
    quantity = Decimal(data.get("quantity", 1)).quantize(Decimal("0.001"))
    if quantity <= 0:
        raise ValueError("Line quantity must be greater than zero.")
    if bool(plan) == bool(product):
        raise ValueError("Choose exactly one plan or product for every quote line.")
    if variant and (not product or variant.product_id != product.pk):
        raise ValueError("The selected variant must belong to the selected product.")
    if plan:
        if not plan.is_active:
            raise ValueError(f"Plan {plan.name} is inactive.")
        if quantity < plan.minimum_quantity:
            raise ValueError(f"Plan {plan.name} requires a minimum quantity of {plan.minimum_quantity}.")
        if plan.available_from and on_date < plan.available_from:
            raise ValueError(f"Plan {plan.name} is not available yet.")
        if plan.available_until and on_date > plan.available_until:
            raise ValueError(f"Plan {plan.name} is no longer available.")
        line_currency = plan.currency
        price = plan.price
    else:
        if not product.is_active:
            raise ValueError(f"Product {product.name} is inactive.")
        line_currency = product.currency
        price = product.sales_price
    if line_currency.upper() != currency.upper():
        raise ValueError("All quote lines must use the quote currency.")
    if variant:
        if not variant.is_active or variant.currency.upper() != line_currency.upper():
            raise ValueError("The selected variant is inactive or uses a different currency.")
        price += variant.price_adjustment
    if price < 0:
        raise ValueError("The selected product and variant produce a negative price.")
    description = data.get("description") or " · ".join(
        part for part in [product.name if product else None, variant.name if variant else None, plan.name if plan else None] if part
    )
    return {
        "plan": plan,
        "product": product,
        "variant": variant,
        "description": description or "Subscription service",
        "quantity": quantity,
        "unit_price": Decimal(price).quantize(CENT, rounding=ROUND_HALF_UP),
        "currency": line_currency.upper(),
        "tax_rules": data.get("tax_rules", []),
    }


@transaction.atomic
def replace_quote_lines(quote, line_data):
    quote.lines.all().delete()
    subtotal_total = Decimal("0.00")
    tax_total = Decimal("0.00")
    for number, raw in enumerate(line_data, start=1):
        priced = price_for_line(raw, quote.currency, quote.start_date)
        subtotal = (priced["quantity"] * priced["unit_price"]).quantize(CENT, rounding=ROUND_HALF_UP)
        line_tax = Decimal("0.00")
        line = QuoteLine.objects.create(
            quote=quote,
            line_number=number,
            plan=priced["plan"],
            product=priced["product"],
            variant=priced["variant"],
            description=priced["description"],
            quantity=priced["quantity"],
            unit_price=priced["unit_price"],
            currency=priced["currency"],
            subtotal=subtotal,
            total=subtotal,
        )
        requested_ids = raw.get("tax_rules", [])
        if requested_ids:
            current = timezone.localdate()
            rules = list(TaxRule.objects.filter(
                pk__in=[rule.pk if isinstance(rule, TaxRule) else rule for rule in requested_ids],
                is_active=True,
            ).filter(
                (models_q_date("active_from", current)) & (models_q_date("active_until", current))
            ).order_by("id"))
            if len(rules) != len(set(rule.pk if isinstance(rule, TaxRule) else rule for rule in requested_ids)):
                raise ValueError("A selected tax rule is inactive, expired, or does not exist.")
            for rule in rules:
                amount = calculate_tax(subtotal, rule.rate_percent)
                QuoteLineTax.objects.create(
                    quote_line=line,
                    tax_rule=rule,
                    name_snapshot=rule.name,
                    rate_percent_snapshot=rule.rate_percent,
                    amount=amount,
                )
                line_tax += amount
        line.tax_total = line_tax
        line.total = subtotal + line_tax
        line.save(update_fields=("tax_total", "total"))
        subtotal_total += subtotal
        tax_total += line_tax
    quote.subtotal = subtotal_total
    quote.tax_total = tax_total
    quote.discount_total = Decimal("0.00")
    quote.total = subtotal_total + tax_total
    quote.save(update_fields=("subtotal", "tax_total", "discount_total", "total", "updated_at"))


def models_q_date(field, current):
    from django.db.models import Q
    return Q(**{f"{field}__isnull": True}) | Q(**{f"{field}__lte": current}) if field == "active_from" else Q(**{f"{field}__isnull": True}) | Q(**{f"{field}__gte": current})


def month_safe_add(start, months):
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def interval_add(start, plan):
    count = plan.interval_count if plan else 1
    unit = plan.interval_unit if plan else "monthly"
    if unit == "daily":
        from datetime import timedelta
        return start + timedelta(days=count)
    if unit == "weekly":
        from datetime import timedelta
        return start + timedelta(weeks=count)
    if unit == "yearly":
        return month_safe_add(start, 12 * count)
    return month_safe_add(start, count)


@transaction.atomic
def convert_quote_to_subscription(quote, actor):
    quote = Quote.objects.select_for_update().select_related("customer").get(pk=quote.pk)
    existing = Subscription.objects.filter(source_quote=quote).first()
    if existing:
        return existing
    if quote.status != Quote.Status.QUOTATION:
        raise ValueError("Only a sent quotation can be confirmed.")
    if quote.valid_until < timezone.localdate():
        raise ValueError("This quotation has expired.")
    lines = list(quote.lines.select_related("plan", "product", "variant"))
    if not lines:
        raise ValueError("Add at least one priced line before confirming this quotation.")
    plans = {line.plan_id for line in lines if line.plan_id}
    if len(plans) > 1:
        raise ValueError("A quote can convert to one subscription plan. Use one plan across its lines.")
    plan = lines[0].plan if len(plans) == 1 else None
    if plan and plan.end_policy == Plan.EndPolicy.CLOSE_AT_END and not quote.expiry_date:
        raise ValueError("Set a subscription end date for a plan that closes at its end date.")
    next_due = quote.start_date
    subscription = Subscription.objects.create(
        customer=quote.customer,
        source_quote=quote,
        plan=plan,
        status=Subscription.Status.ACTIVE,
        start_date=quote.start_date,
        expiry_date=quote.expiry_date,
        next_period_start=next_due,
        next_billing_at=next_due,
        payment_terms=quote.payment_terms,
        currency=quote.currency,
        close_at_period_end=bool(quote.expiry_date or (plan and plan.end_policy == Plan.EndPolicy.CLOSE_AT_END)),
    )
    for line in lines:
        copied = SubscriptionLine.objects.create(
            subscription=subscription,
            line_number=line.line_number,
            plan=line.plan,
            product=line.product,
            variant=line.variant,
            description=line.description,
            quantity=line.quantity,
            unit_price=line.unit_price,
            currency=line.currency,
        )
        copied.tax_rules.set([tax.tax_rule for tax in line.taxes.select_related("tax_rule") if tax.tax_rule_id])
    quote.status = Quote.Status.CONFIRMED
    quote.save(update_fields=("status", "updated_at"))
    SubscriptionEvent.objects.create(
        subscription=subscription,
        actor=actor,
        action="created_from_quote",
        from_status="",
        to_status=subscription.status,
        note=f"Created from {quote.number}",
    )
    return subscription
