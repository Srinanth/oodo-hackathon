from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import Plan, Product, ProductVariant, TaxRule
from apps.customers.models import Customer

from .models import (
    Quote,
    QuoteLine,
    QuoteLineTax,
    QuoteTemplate,
    QuoteTemplateLine,
    Subscription,
    SubscriptionEvent,
    SubscriptionLine,
)
from .services import price_for_line, replace_quote_lines


class QuoteTemplateLineSerializer(serializers.ModelSerializer):
    lineNumber = serializers.IntegerField(source="line_number", read_only=True)
    planId = serializers.PrimaryKeyRelatedField(source="plan", queryset=Plan.objects.all(), allow_null=True, required=False)
    productId = serializers.PrimaryKeyRelatedField(source="product", queryset=Product.objects.all(), allow_null=True, required=False)
    variantId = serializers.PrimaryKeyRelatedField(source="variant", queryset=ProductVariant.objects.all(), allow_null=True, required=False)
    taxRuleIds = serializers.PrimaryKeyRelatedField(source="tax_rules", queryset=TaxRule.objects.all(), many=True, required=False)
    description = serializers.CharField(max_length=500, required=False, allow_blank=True)

    class Meta:
        model = QuoteTemplateLine
        fields = ("id", "lineNumber", "planId", "productId", "variantId", "description", "quantity", "taxRuleIds")
        read_only_fields = ("id", "lineNumber")

    def validate(self, attrs):
        product = attrs.get("product")
        plan = attrs.get("plan")
        variant = attrs.get("variant")
        if bool(product) == bool(plan):
            raise serializers.ValidationError("Choose exactly one plan or product for this template line.")
        if variant and (not product or variant.product_id != product.pk):
            raise serializers.ValidationError({"variantId": "The variant must belong to the selected product."})
        if not attrs.get("description"):
            attrs["description"] = " · ".join(part for part in [product.name if product else None, variant.name if variant else None, plan.name if plan else None] if part) or "Subscription service"
        return attrs


class QuoteTemplateSerializer(serializers.ModelSerializer):
    validityDays = serializers.IntegerField(source="validity_days", min_value=1)
    paymentTerms = serializers.CharField(source="payment_terms", required=False, allow_blank=True, max_length=200)
    createdById = serializers.IntegerField(source="created_by_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    lines = QuoteTemplateLineSerializer(many=True, required=False)

    class Meta:
        model = QuoteTemplate
        fields = ("id", "name", "validityDays", "paymentTerms", "createdById", "createdAt", "updatedAt", "lines")
        read_only_fields = ("id", "createdById", "createdAt", "updatedAt")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A template name is required.")
        return value

    def validate_paymentTerms(self, value):
        return value.strip()

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        template = QuoteTemplate.objects.create(**validated_data)
        self._save_lines(template, lines)
        return template

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            self._save_lines(instance, lines)
        return instance

    @staticmethod
    def _save_lines(template, lines):
        for index, data in enumerate(lines, start=1):
            tax_rules = data.pop("tax_rules", [])
            line = QuoteTemplateLine.objects.create(template=template, line_number=index, **data)
            line.tax_rules.set(tax_rules)


class QuoteLineTaxSerializer(serializers.ModelSerializer):
    taxRuleId = serializers.UUIDField(source="tax_rule_id", allow_null=True)
    nameSnapshot = serializers.CharField(source="name_snapshot")
    ratePercentSnapshot = serializers.DecimalField(source="rate_percent_snapshot", max_digits=7, decimal_places=4)

    class Meta:
        model = QuoteLineTax
        fields = ("id", "taxRuleId", "nameSnapshot", "ratePercentSnapshot", "amount")


class QuoteLineReadSerializer(serializers.ModelSerializer):
    lineNumber = serializers.IntegerField(source="line_number")
    planId = serializers.UUIDField(source="plan_id", allow_null=True)
    productId = serializers.UUIDField(source="product_id", allow_null=True)
    variantId = serializers.UUIDField(source="variant_id", allow_null=True)
    taxRules = QuoteLineTaxSerializer(source="taxes", many=True, read_only=True)
    unitPrice = serializers.DecimalField(source="unit_price", max_digits=14, decimal_places=2)
    taxTotal = serializers.DecimalField(source="tax_total", max_digits=14, decimal_places=2)
    discountTotal = serializers.DecimalField(source="discount_total", max_digits=14, decimal_places=2)

    class Meta:
        model = QuoteLine
        fields = ("id", "lineNumber", "planId", "productId", "variantId", "description", "quantity", "unitPrice", "currency", "subtotal", "taxTotal", "discountTotal", "total", "taxRules")


class QuoteLineInputSerializer(serializers.Serializer):
    planId = serializers.PrimaryKeyRelatedField(source="plan", queryset=Plan.objects.filter(is_active=True), allow_null=True, required=False)
    productId = serializers.PrimaryKeyRelatedField(source="product", queryset=Product.objects.filter(is_active=True), allow_null=True, required=False)
    variantId = serializers.PrimaryKeyRelatedField(source="variant", queryset=ProductVariant.objects.filter(is_active=True), allow_null=True, required=False)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    description = serializers.CharField(max_length=500, required=False, allow_blank=True)
    taxRuleIds = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)

    def validate(self, attrs):
        product, plan, variant = attrs.get("product"), attrs.get("plan"), attrs.get("variant")
        if bool(product) == bool(plan):
            raise serializers.ValidationError("Choose exactly one plan or product for every line.")
        if variant and (not product or variant.product_id != product.pk):
            raise serializers.ValidationError({"variantId": "The variant must belong to the selected product."})
        ids = attrs.pop("taxRuleIds", [])
        rules = list(TaxRule.objects.filter(pk__in=ids, is_active=True))
        if len(rules) != len(set(ids)):
            raise serializers.ValidationError({"taxRuleIds": "Select active tax rules that exist."})
        current = timezone.localdate()
        rules = [rule for rule in rules if (not rule.active_from or rule.active_from <= current) and (not rule.active_until or rule.active_until >= current)]
        if len(rules) != len(set(ids)):
            raise serializers.ValidationError({"taxRuleIds": "A selected tax rule is outside its active dates."})
        attrs["tax_rules"] = rules
        return attrs


class QuoteSerializer(serializers.ModelSerializer):
    customerId = serializers.PrimaryKeyRelatedField(source="customer", queryset=Customer.objects.all())
    templateId = serializers.PrimaryKeyRelatedField(source="template", queryset=QuoteTemplate.objects.all(), allow_null=True, required=False)
    customerName = serializers.CharField(source="customer.contact_name", read_only=True)
    templateName = serializers.CharField(source="template.name", read_only=True, allow_null=True)
    validUntil = serializers.DateField(source="valid_until")
    startDate = serializers.DateField(source="start_date", read_only=True)
    expiryDate = serializers.DateField(source="expiry_date", allow_null=True, required=False)
    paymentTerms = serializers.CharField(source="payment_terms", required=False, allow_blank=True, max_length=200)
    taxTotal = serializers.DecimalField(source="tax_total", max_digits=14, decimal_places=2, read_only=True)
    discountTotal = serializers.DecimalField(source="discount_total", max_digits=14, decimal_places=2, read_only=True)
    createdById = serializers.IntegerField(source="created_by_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    lines = serializers.ListField(child=serializers.DictField(), required=False)
    subscriptionId = serializers.UUIDField(source="subscription.id", read_only=True, allow_null=True)

    class Meta:
        model = Quote
        fields = ("id", "number", "customerId", "customerName", "templateId", "templateName", "status", "validUntil", "startDate", "expiryDate", "paymentTerms", "currency", "subtotal", "taxTotal", "discountTotal", "total", "createdById", "createdAt", "updatedAt", "lines", "subscriptionId")
        read_only_fields = ("id", "number", "status", "startDate", "subtotal", "taxTotal", "discountTotal", "total", "createdById", "createdAt", "updatedAt", "subscriptionId")

    def to_internal_value(self, data):
        validated = super().to_internal_value(data)
        if "lines" in data:
            line_serializer = QuoteLineInputSerializer(data=data["lines"], many=True, context=self.context)
            line_serializer.is_valid(raise_exception=True)
            validated["lines"] = line_serializer.validated_data
        return validated

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["lines"] = QuoteLineReadSerializer(instance.lines.select_related("plan", "product", "variant").prefetch_related("taxes"), many=True).data
        return data

    def validate_currency(self, value):
        value = value.strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Currency must be a three-letter code.")
        return value

    def validate_validUntil(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError("A draft quote cannot expire in the past.")
        return value

    def validate(self, attrs):
        if self.instance and self.instance.status != Quote.Status.DRAFT:
            raise serializers.ValidationError("Only draft quotes can be updated.")
        valid_until = attrs.get("valid_until", getattr(self.instance, "valid_until", None))
        start_date = getattr(self.instance, "start_date", timezone.localdate())
        if valid_until and valid_until < start_date:
            raise serializers.ValidationError({"validUntil": "Validity must be on or after the quote start date."})
        expiry_date = attrs.get("expiry_date", getattr(self.instance, "expiry_date", None))
        if expiry_date and expiry_date < start_date:
            raise serializers.ValidationError({"expiryDate": "Subscription expiry must be on or after its start date."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("lines", None)
        template = validated_data.get("template")
        if template and "payment_terms" not in validated_data:
            validated_data["payment_terms"] = template.payment_terms
        quote = Quote.objects.create(**validated_data)
        if lines is None and template:
            lines = [{"plan": row.plan, "product": row.product, "variant": row.variant, "description": row.description, "quantity": row.quantity, "tax_rules": list(row.tax_rules.all())} for row in template.lines.select_related("plan", "product", "variant").prefetch_related("tax_rules")]
        if lines:
            try:
                replace_quote_lines(quote, lines)
            except ValueError as exc:
                raise serializers.ValidationError({"lines": str(exc)}) from exc
        return quote

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if lines is not None:
            try:
                replace_quote_lines(instance, lines)
            except ValueError as exc:
                raise serializers.ValidationError({"lines": str(exc)}) from exc
        return instance


class SubscriptionLineSerializer(serializers.ModelSerializer):
    lineNumber = serializers.IntegerField(source="line_number")
    planId = serializers.UUIDField(source="plan_id", allow_null=True)
    productId = serializers.UUIDField(source="product_id", allow_null=True)
    variantId = serializers.UUIDField(source="variant_id", allow_null=True)
    unitPrice = serializers.DecimalField(source="unit_price", max_digits=14, decimal_places=2)

    class Meta:
        model = SubscriptionLine
        fields = ("id", "lineNumber", "planId", "productId", "variantId", "description", "quantity", "unitPrice", "currency")


class SubscriptionEventSerializer(serializers.ModelSerializer):
    fromStatus = serializers.CharField(source="from_status")
    toStatus = serializers.CharField(source="to_status")
    actorEmail = serializers.EmailField(source="actor.email", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = SubscriptionEvent
        fields = ("id", "action", "fromStatus", "toStatus", "note", "actorEmail", "createdAt")


class SubscriptionSerializer(serializers.ModelSerializer):
    customerId = serializers.UUIDField(source="customer_id")
    customerName = serializers.CharField(source="customer.contact_name", read_only=True)
    customerEmail = serializers.EmailField(source="customer.email", read_only=True)
    planId = serializers.UUIDField(source="plan_id", allow_null=True)
    planName = serializers.CharField(source="plan.name", read_only=True, allow_null=True)
    planAllowPause = serializers.BooleanField(source="plan.allow_pause", read_only=True, default=False)
    planAllowRenewal = serializers.BooleanField(source="plan.allow_renewal", read_only=True, default=False)
    planEndPolicy = serializers.CharField(source="plan.end_policy", read_only=True, allow_null=True)
    sourceQuoteId = serializers.UUIDField(source="source_quote_id", allow_null=True)
    startDate = serializers.DateField(source="start_date")
    expiryDate = serializers.DateField(source="expiry_date", allow_null=True)
    nextPeriodStart = serializers.DateField(source="next_period_start")
    nextBillingAt = serializers.DateField(source="next_billing_at")
    paymentTerms = serializers.CharField(source="payment_terms")
    closeAtPeriodEnd = serializers.BooleanField(source="close_at_period_end")
    createdAt = serializers.DateTimeField(source="created_at")
    lines = SubscriptionLineSerializer(many=True, read_only=True)
    events = SubscriptionEventSerializer(many=True, read_only=True)

    class Meta:
        model = Subscription
        fields = ("id", "number", "customerId", "customerName", "customerEmail", "planId", "planName", "planAllowPause", "planAllowRenewal", "planEndPolicy", "sourceQuoteId", "status", "startDate", "expiryDate", "nextPeriodStart", "nextBillingAt", "paymentTerms", "currency", "closeAtPeriodEnd", "createdAt", "lines", "events")


class PortalSubscriptionSerializer(SubscriptionSerializer):
    class Meta(SubscriptionSerializer.Meta):
        fields = tuple(field for field in SubscriptionSerializer.Meta.fields if field != "events")
