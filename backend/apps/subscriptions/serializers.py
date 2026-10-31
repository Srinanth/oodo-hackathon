from django.utils import timezone
from rest_framework import serializers

from apps.customers.models import Customer
from .models import Quote, QuoteTemplate


class QuoteTemplateSerializer(serializers.ModelSerializer):
    validityDays = serializers.IntegerField(source="validity_days", min_value=1)
    paymentTerms = serializers.CharField(source="payment_terms", required=False, allow_blank=True, max_length=200)
    createdById = serializers.IntegerField(source="created_by_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = QuoteTemplate
        fields = ("id", "name", "validityDays", "paymentTerms", "createdById", "createdAt", "updatedAt")
        read_only_fields = ("id", "createdById", "createdAt", "updatedAt")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A template name is required.")
        return value

    def validate_paymentTerms(self, value):
        return value.strip()


class QuoteSerializer(serializers.ModelSerializer):
    customerId = serializers.PrimaryKeyRelatedField(source="customer", queryset=Customer.objects.all())
    templateId = serializers.PrimaryKeyRelatedField(
        source="template",
        queryset=QuoteTemplate.objects.all(),
        allow_null=True,
        required=False,
    )
    customerName = serializers.CharField(source="customer.contact_name", read_only=True)
    templateName = serializers.CharField(source="template.name", read_only=True, allow_null=True)
    validUntil = serializers.DateField(source="valid_until")
    startDate = serializers.DateField(source="start_date", read_only=True)
    paymentTerms = serializers.CharField(source="payment_terms", required=False, allow_blank=True, max_length=200)
    taxTotal = serializers.DecimalField(source="tax_total", max_digits=14, decimal_places=2, read_only=True)
    discountTotal = serializers.DecimalField(source="discount_total", max_digits=14, decimal_places=2, read_only=True)
    createdById = serializers.IntegerField(source="created_by_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    lines = serializers.ListField(child=serializers.DictField(), required=False, write_only=True)

    class Meta:
        model = Quote
        fields = (
            "id", "number", "customerId", "customerName", "templateId", "templateName", "status",
            "validUntil", "startDate", "paymentTerms", "currency", "subtotal", "taxTotal",
            "discountTotal", "total", "createdById", "createdAt", "updatedAt",
            "lines",
        )
        read_only_fields = ("id", "number", "status", "startDate", "subtotal", "taxTotal", "discountTotal", "total", "createdById", "createdAt", "updatedAt")

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
        if attrs.get("lines"):
            raise serializers.ValidationError({"lines": "Priced quote lines are not available until catalog integration is complete."})
        attrs.pop("lines", None)
        if self.instance and self.instance.status != Quote.Status.DRAFT:
            raise serializers.ValidationError("Only draft quotes can be updated.")
        valid_until = attrs.get("valid_until", getattr(self.instance, "valid_until", None))
        start_date = getattr(self.instance, "start_date", timezone.localdate())
        if valid_until and valid_until < start_date:
            raise serializers.ValidationError({"validUntil": "Validity must be on or after the quote start date."})
        return attrs

    def create(self, validated_data):
        template = validated_data.get("template")
        if template and "payment_terms" not in validated_data:
            validated_data["payment_terms"] = template.payment_terms
        return super().create(validated_data)
