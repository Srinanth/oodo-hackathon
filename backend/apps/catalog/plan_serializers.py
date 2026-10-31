from rest_framework import serializers

from apps.catalog.models import Plan


class PlanMoneySerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    currency = serializers.RegexField(regex=r"^[A-Za-z]{3}$", max_length=3)

    def validate_currency(self, value):
        return value.upper()


class PlanSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=200, required=False)
    interval = serializers.ChoiceField(choices=Plan.Interval.choices, required=False)
    intervalCount = serializers.IntegerField(source="interval_count", min_value=1, max_value=32767, required=False)
    price = PlanMoneySerializer(required=False)
    minimumQuantity = serializers.IntegerField(source="minimum_quantity", min_value=1, required=False)
    availableFrom = serializers.DateField(source="available_from", allow_null=True, required=False)
    availableUntil = serializers.DateField(source="available_until", allow_null=True, required=False)
    endPolicy = serializers.ChoiceField(source="end_policy", choices=Plan.EndPolicy.choices, required=False)
    allowPause = serializers.BooleanField(source="allow_pause", required=False)
    allowRenewal = serializers.BooleanField(source="allow_renewal", required=False)
    isActive = serializers.BooleanField(source="is_active", required=False)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    def validate(self, attrs):
        if self.instance is not None and not attrs:
            raise serializers.ValidationError("Provide at least one field to update.")
        if "name" in attrs:
            attrs["name"] = attrs["name"].strip()
            if not attrs["name"]:
                raise serializers.ValidationError({"name": "Enter a plan name."})

        if self.instance is None:
            required = {
                "name": "name",
                "interval_unit": "interval",
                "price": "price",
                "minimum_quantity": "minimumQuantity",
                "end_policy": "endPolicy",
            }
            missing = {api_field: "This field is required." for model_field, api_field in required.items() if model_field not in attrs}
            if missing:
                raise serializers.ValidationError(missing)
        elif "price" in attrs and attrs["price"]["currency"] != self.instance.currency:
            raise serializers.ValidationError({"price": "Plan currency cannot be changed after creation."})

        start = attrs.get("available_from", self.instance.available_from if self.instance else None)
        end = attrs.get("available_until", self.instance.available_until if self.instance else None)
        if start and end and end < start:
            raise serializers.ValidationError({"availableUntil": "The end date must be on or after the start date."})
        return attrs

    def create(self, validated_data):
        price = validated_data.pop("price")
        return Plan.objects.create(
            **validated_data,
            price=price["amount"],
            currency=price["currency"],
        )

    def update(self, instance, validated_data):
        price = validated_data.pop("price", None)
        if price:
            instance.price = price["amount"]
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "name": instance.name,
            "interval": instance.interval_unit,
            "intervalCount": instance.interval_count,
            "price": {"amount": str(instance.price), "currency": instance.currency},
            "minimumQuantity": instance.minimum_quantity,
            "availableFrom": instance.available_from,
            "availableUntil": instance.available_until,
            "endPolicy": instance.end_policy,
            "allowPause": instance.allow_pause,
            "allowRenewal": instance.allow_renewal,
            "isActive": instance.is_active,
            "createdAt": instance.created_at,
            "updatedAt": instance.updated_at,
        }
