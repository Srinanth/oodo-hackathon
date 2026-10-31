from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import DiscountRedemption, DiscountRule, Product


class DiscountRuleSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=160, required=False)
    discountType = serializers.ChoiceField(source="discount_type", choices=DiscountRule.DiscountType.choices, required=False)
    value = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=Decimal("0.0001"), required=False)
    currency = serializers.RegexField(regex=r"^[A-Za-z]{3}$", max_length=3, allow_null=True, required=False)
    minimumPurchase = serializers.DecimalField(source="minimum_purchase", max_digits=14, decimal_places=2, min_value=0, required=False, default=Decimal("0.00"))
    minimumQuantity = serializers.IntegerField(source="minimum_quantity", min_value=1, required=False, default=1)
    scope = serializers.ChoiceField(choices=DiscountRule.Scope.choices, required=False)
    productIds = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    startsAt = serializers.DateTimeField(source="starts_at", allow_null=True, required=False)
    endsAt = serializers.DateTimeField(source="ends_at", allow_null=True, required=False)
    maximumUses = serializers.IntegerField(source="maximum_uses", min_value=1, allow_null=True, required=False)
    isActive = serializers.BooleanField(source="is_active", required=False, default=True)
    usesCount = serializers.SerializerMethodField()
    usesRemaining = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    def validate_currency(self, value):
        return value.upper() if value else None

    def validate_productIds(self, values):
        if len(values) != len(set(values)):
            raise serializers.ValidationError("Product IDs must be unique.")
        return values

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and not attrs:
            raise serializers.ValidationError("Provide at least one field to update.")
        if "name" in attrs:
            attrs["name"] = attrs["name"].strip()
            if not attrs["name"]:
                raise serializers.ValidationError({"name": "Enter a discount rule name."})

        if instance is None:
            required = {"name": "name", "discount_type": "discountType", "value": "value", "scope": "scope"}
            missing = {api_field: "This field is required." for field, api_field in required.items() if field not in attrs}
            if missing:
                raise serializers.ValidationError(missing)

        discount_type = attrs.get("discount_type", instance.discount_type if instance else None)
        value = attrs.get("value", instance.value if instance else None)
        currency = attrs.get("currency", instance.currency if instance else None)
        scope = attrs.get("scope", instance.scope if instance else None)
        product_ids = attrs.get("productIds", list(instance.products.values_list("id", flat=True)) if instance else [])
        starts_at = attrs.get("starts_at", instance.starts_at if instance else None)
        ends_at = attrs.get("ends_at", instance.ends_at if instance else None)
        maximum_uses = attrs.get("maximum_uses", instance.maximum_uses if instance else None)

        if discount_type == DiscountRule.DiscountType.FIXED and not currency:
            raise serializers.ValidationError({"currency": "Fixed discounts require a currency."})
        if discount_type == DiscountRule.DiscountType.PERCENTAGE:
            if currency:
                raise serializers.ValidationError({"currency": "Percentage discounts do not use a fixed currency."})
            if value is not None and value > Decimal("100"):
                raise serializers.ValidationError({"value": "Percentage discounts cannot exceed 100."})
        if scope == DiscountRule.Scope.PRODUCTS and not product_ids:
            raise serializers.ValidationError({"productIds": "Select at least one product for a product-scoped discount."})
        if scope == DiscountRule.Scope.WHOLE_SUBSCRIPTION and product_ids:
            raise serializers.ValidationError({"productIds": "Whole-subscription discounts do not target individual products."})
        if starts_at and ends_at and ends_at < starts_at:
            raise serializers.ValidationError({"endsAt": "The end date must be on or after the start date."})
        if product_ids:
            known_ids = set(Product.objects.filter(id__in=product_ids).values_list("id", flat=True))
            if known_ids != set(product_ids):
                raise serializers.ValidationError({"productIds": "Every selected product must exist."})
            active_ids = set(Product.objects.filter(id__in=product_ids, is_active=True).values_list("id", flat=True))
            previously_selected = set(instance.products.values_list("id", flat=True)) if instance else set()
            if active_ids | previously_selected != set(product_ids):
                raise serializers.ValidationError({"productIds": "Newly selected products must be active."})
        if instance and maximum_uses is not None:
            used = instance.redemptions.filter(status__in=(DiscountRedemption.Status.RESERVED, DiscountRedemption.Status.CONSUMED)).count()
            if maximum_uses < used:
                raise serializers.ValidationError({"maximumUses": f"The limit cannot be lower than the {used} reserved or consumed uses."})
        return attrs

    def create(self, validated_data):
        product_ids = validated_data.pop("productIds", [])
        rule = DiscountRule.objects.create(**validated_data)
        if product_ids:
            rule.products.set(product_ids)
        return rule

    def update(self, instance, validated_data):
        product_ids = validated_data.pop("productIds", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if product_ids is not None:
            instance.products.set(product_ids)
        return instance

    def get_usesCount(self, instance):
        count = getattr(instance, "active_uses_count", None)
        if count is not None:
            return count
        return instance.redemptions.filter(status__in=(DiscountRedemption.Status.RESERVED, DiscountRedemption.Status.CONSUMED)).count()

    def get_usesRemaining(self, instance):
        if instance.maximum_uses is None:
            return None
        return max(instance.maximum_uses - self.get_usesCount(instance), 0)

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "name": instance.name,
            "discountType": instance.discount_type,
            "value": str(instance.value),
            "currency": instance.currency,
            "minimumPurchase": str(instance.minimum_purchase),
            "minimumQuantity": instance.minimum_quantity,
            "scope": instance.scope,
            "productIds": [str(product.id) for product in instance.products.all()],
            "startsAt": instance.starts_at,
            "endsAt": instance.ends_at,
            "maximumUses": instance.maximum_uses,
            "usesCount": self.get_usesCount(instance),
            "usesRemaining": self.get_usesRemaining(instance),
            "isActive": instance.is_active,
            "createdAt": instance.created_at,
            "updatedAt": instance.updated_at,
        }


class DiscountLineSerializer(serializers.Serializer):
    productId = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    currency = serializers.RegexField(regex=r"^[A-Za-z]{3}$", max_length=3)
    quantity = serializers.IntegerField(min_value=1)

    def validate_currency(self, value):
        return value.upper()


class DiscountPreviewSerializer(serializers.Serializer):
    lines = DiscountLineSerializer(many=True, allow_empty=False)
    evaluatedAt = serializers.DateTimeField(required=False)

    def validate_lines(self, lines):
        if len(lines) > 200:
            raise serializers.ValidationError("A preview can contain at most 200 lines.")
        currencies = {line["currency"] for line in lines}
        if len(currencies) != 1:
            raise serializers.ValidationError("All line amounts must use the same currency.")
        return [{**line, "productId": line["productId"], "currency": line["currency"]} for line in lines]
