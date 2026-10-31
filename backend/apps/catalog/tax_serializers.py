from rest_framework import serializers

from apps.catalog.models import TaxRule


class TaxRuleSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=160, required=False)
    ratePercent = serializers.DecimalField(source="rate_percent", max_digits=7, decimal_places=4, min_value=0, max_value=100, required=False)
    activeFrom = serializers.DateField(source="active_from", allow_null=True, required=False)
    activeUntil = serializers.DateField(source="active_until", allow_null=True, required=False)
    isActive = serializers.BooleanField(source="is_active", required=False)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    def validate(self, attrs):
        if self.instance is not None and not attrs:
            raise serializers.ValidationError("Provide at least one field to update.")
        if "name" in attrs:
            attrs["name"] = attrs["name"].strip()
            if not attrs["name"]:
                raise serializers.ValidationError({"name": "Enter a tax rule name."})
        if self.instance is None:
            required = {"name": "name", "rate_percent": "ratePercent"}
            missing = {api_field: "This field is required." for field, api_field in required.items() if field not in attrs}
            if missing:
                raise serializers.ValidationError(missing)
        start = attrs.get("active_from", self.instance.active_from if self.instance else None)
        end = attrs.get("active_until", self.instance.active_until if self.instance else None)
        if start and end and end < start:
            raise serializers.ValidationError({"activeUntil": "The end date must be on or after the start date."})
        return attrs

    def create(self, validated_data):
        return TaxRule.objects.create(**validated_data)

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "name": instance.name,
            "ratePercent": str(instance.rate_percent),
            "activeFrom": instance.active_from,
            "activeUntil": instance.active_until,
            "isActive": instance.is_active,
            "createdAt": instance.created_at,
            "updatedAt": instance.updated_at,
        }


class TaxPreviewSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    currency = serializers.RegexField(regex=r"^[A-Za-z]{3}$", max_length=3)
    onDate = serializers.DateField(required=False)

    def validate_currency(self, value):
        return value.upper()
