from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import DiscountRedemption, DiscountRule


CENT = Decimal("0.01")
HUNDRED = Decimal("100")
ACTIVE_REDEMPTION_STATUSES = (DiscountRedemption.Status.RESERVED, DiscountRedemption.Status.CONSUMED)


class DiscountUnavailable(Exception):
    """Raised when a discount is no longer eligible or its use cap is full."""


def _active_redemption_count(rule):
    return rule.redemptions.filter(status__in=ACTIVE_REDEMPTION_STATUSES).count()


def evaluate_discount(rule, lines, *, evaluated_at=None):
    """Evaluate a rule against pre-discount line totals using exact decimals."""
    evaluated_at = evaluated_at or timezone.now()
    target_ids = set(rule.products.values_list("id", flat=True)) if rule.scope == DiscountRule.Scope.PRODUCTS else None
    eligible_lines = [
        line for line in lines
        if target_ids is None or line["productId"] in target_ids
    ]
    eligible_amount = sum((line["amount"] for line in eligible_lines), Decimal("0.00"))
    eligible_quantity = sum(line["quantity"] for line in eligible_lines)
    currencies = {line["currency"] for line in eligible_lines}

    reason = None
    if not rule.is_active:
        reason = "inactive"
    elif rule.starts_at and evaluated_at < rule.starts_at:
        reason = "not_started"
    elif rule.ends_at and evaluated_at > rule.ends_at:
        reason = "expired"
    elif target_ids is not None and not eligible_lines:
        reason = "no_targeted_products"
    elif len(currencies) > 1:
        reason = "mixed_currency"
    elif eligible_quantity < rule.minimum_quantity:
        reason = "minimum_quantity_not_met"
    elif eligible_amount < rule.minimum_purchase:
        reason = "minimum_purchase_not_met"
    elif rule.discount_type == DiscountRule.DiscountType.FIXED and currencies and rule.currency not in currencies:
        reason = "currency_mismatch"
    elif rule.maximum_uses is not None and _active_redemption_count(rule) >= rule.maximum_uses:
        reason = "maximum_uses_reached"
    elif eligible_amount <= 0:
        reason = "no_discountable_amount"

    currency = next(iter(currencies), lines[0]["currency"] if lines else rule.currency or "")
    amount = Decimal("0.00")
    if reason is None:
        if rule.discount_type == DiscountRule.DiscountType.FIXED:
            amount = min(rule.value, eligible_amount)
        else:
            amount = eligible_amount * rule.value / HUNDRED
        amount = min(amount, eligible_amount).quantize(CENT, rounding=ROUND_HALF_UP)
        if amount <= 0:
            reason = "discount_rounds_to_zero"

    return {
        "eligible": reason is None,
        "reason": reason,
        "eligibleAmount": eligible_amount.quantize(CENT),
        "eligibleQuantity": eligible_quantity,
        "discountAmount": amount,
        "currency": currency,
        "usesRemaining": max(rule.maximum_uses - _active_redemption_count(rule), 0) if rule.maximum_uses is not None else None,
    }


def discount_snapshot(rule, amount, currency):
    """Return invoice snapshot fields; future rule edits cannot change the invoice."""
    return {
        "discount_rule_id": rule.pk,
        "name_snapshot": rule.name,
        "discount_type_snapshot": rule.discount_type,
        "value_snapshot": rule.value,
        "amount": Decimal(amount).quantize(CENT, rounding=ROUND_HALF_UP),
        "currency": currency.upper(),
    }


@transaction.atomic
def reserve_discount_use(rule_id, invoice_id, *, as_of=None):
    """Reserve one capped use for an invoice, safely under concurrent callers.

    Keep this call in the invoice confirmation transaction. The unique
    rule/invoice constraint makes retries idempotent; released reservations
    do not count against the cap and may be reserved again.
    """
    rule = DiscountRule.objects.select_for_update().get(pk=rule_id)
    redemption = DiscountRedemption.objects.filter(discount_rule=rule, invoice_id=invoice_id).first()
    if redemption and redemption.status != DiscountRedemption.Status.RELEASED:
        return redemption
    now = as_of or timezone.now()
    if not rule.is_active or (rule.starts_at and now < rule.starts_at) or (rule.ends_at and now > rule.ends_at):
        raise DiscountUnavailable("This discount is not active now.")
    active_count = _active_redemption_count(rule)
    if rule.maximum_uses is not None and active_count >= rule.maximum_uses:
        raise DiscountUnavailable("This discount has reached its use limit.")
    if redemption:
        redemption.status = DiscountRedemption.Status.RESERVED
        redemption.consumed_at = None
        redemption.reserved_at = timezone.now()
        redemption.save(update_fields=("status", "consumed_at", "reserved_at"))
        return redemption
    return DiscountRedemption.objects.create(discount_rule=rule, invoice_id=invoice_id, status=DiscountRedemption.Status.RESERVED)


@transaction.atomic
def consume_discount_use(rule_id, invoice_id):
    """Consume the reserved use once an invoice is confirmed; safe to retry."""
    redemption = reserve_discount_use(rule_id, invoice_id)
    if redemption.status != DiscountRedemption.Status.CONSUMED:
        redemption.status = DiscountRedemption.Status.CONSUMED
        redemption.consumed_at = timezone.now()
        redemption.save(update_fields=("status", "consumed_at"))
    return redemption


@transaction.atomic
def release_discount_use(rule_id, invoice_id):
    """Release a reservation for an invoice that is cancelled before confirmation."""
    rule = DiscountRule.objects.select_for_update().get(pk=rule_id)
    redemption = DiscountRedemption.objects.select_for_update().filter(discount_rule=rule, invoice_id=invoice_id).first()
    if redemption and redemption.status == DiscountRedemption.Status.RESERVED:
        redemption.status = DiscountRedemption.Status.RELEASED
        redemption.save(update_fields=("status",))
    return redemption
