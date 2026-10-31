from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal("0.01")
HUNDRED = Decimal("100")


def calculate_tax(base_amount, rate_percent):
    """Return the rounded tax for a non-negative base and percentage rate."""
    base_amount = Decimal(base_amount)
    rate_percent = Decimal(rate_percent)
    if base_amount < 0:
        raise ValueError("Tax base amount cannot be negative.")
    if rate_percent < 0 or rate_percent > HUNDRED:
        raise ValueError("Tax rate must be between 0 and 100 percent.")
    return (base_amount * rate_percent / HUNDRED).quantize(CENT, rounding=ROUND_HALF_UP)


def tax_snapshot(rule, base_amount):
    """Return immutable quote/invoice tax snapshot fields for this rule and line."""
    return {
        "tax_rule_id": rule.pk,
        "name_snapshot": rule.name,
        "rate_percent_snapshot": rule.rate_percent,
        "amount": calculate_tax(base_amount, rule.rate_percent),
    }
