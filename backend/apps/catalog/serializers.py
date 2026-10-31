from decimal import Decimal

from django.db import IntegrityError, transaction
from rest_framework import serializers

from apps.catalog.models import Product, ProductVariant


class MoneySerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"))
    currency = serializers.RegexField(regex=r"^[A-Za-z]{3}$", max_length=3)

    def validate_currency(self, value):
        return value.upper()


class VariantPriceSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    currency = serializers.RegexField(regex=r"^[A-Za-z]{3}$", max_length=3)

    def validate_currency(self, value):
        return value.upper()


class VariantInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    priceAdjustment = VariantPriceSerializer()


class VariantReadSerializer(serializers.ModelSerializer):
    priceAdjustment = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source="is_active", read_only=True)

    class Meta:
        model = ProductVariant
        fields = ("id", "name", "priceAdjustment", "isActive")
        read_only_fields = fields

    def get_priceAdjustment(self, variant):
        return {"amount": str(variant.price_adjustment), "currency": variant.currency}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["id"] = str(instance.id)
        data["isActive"] = instance.is_active
        return data


class ProductSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=200, required=False)
    type = serializers.CharField(source="product_type", max_length=24, required=False)
    salesPrice = MoneySerializer(source="sales_price", required=False)
    costPrice = MoneySerializer(source="cost_price", required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    isActive = serializers.BooleanField(source="is_active", required=False)
    variants = VariantInputSerializer(many=True, required=False, write_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    def validate(self, attrs):
        currency = None
        sales_price = attrs.get("sales_price")
        cost_price = attrs.get("cost_price")
        variants = attrs.get("variants", [])
        if "name" in attrs:
            attrs["name"] = attrs["name"].strip()
            if not attrs["name"]:
                raise serializers.ValidationError({"name": "Enter a product name."})
        if self.instance and "variants" in attrs:
            raise serializers.ValidationError({"variants": "Manage variants through the product variants endpoint."})
        if self.instance:
            for field_name, money in (("salesPrice", sales_price), ("costPrice", cost_price)):
                if money and money["currency"] != self.instance.currency:
                    raise serializers.ValidationError({field_name: "Product currency cannot be changed after creation."})
        else:
            required_fields = {"name": "name", "product_type": "type", "sales_price": "salesPrice", "cost_price": "costPrice"}
            missing = [api_name for key, api_name in required_fields.items() if key not in attrs]
            if missing:
                raise serializers.ValidationError({key: "This field is required." for key in missing})
        if sales_price:
            currency = sales_price["currency"]
        elif self.instance:
            currency = self.instance.currency
        if cost_price and currency and cost_price["currency"] != currency:
            raise serializers.ValidationError({"costPrice": "Sales and cost prices must use the same currency."})
        if sales_price and cost_price and sales_price["currency"] != cost_price["currency"]:
            raise serializers.ValidationError({"costPrice": "Sales and cost prices must use the same currency."})
        if self.instance:
            effective_sales_price = sales_price["amount"] if sales_price else self.instance.sales_price
            if self.instance.variants.filter(price_adjustment__lt=-effective_sales_price, is_active=True).exists():
                raise serializers.ValidationError({"salesPrice": "The new price would make an active variant price negative."})
        if variants and not self.instance:
            names = []
            for variant in variants:
                name = str(variant.get("name", "")).strip()
                adjustment = variant.get("priceAdjustment", {})
                if not name or len(name) > 160:
                    raise serializers.ValidationError({"variants": "Each variant needs a name of 1 to 160 characters."})
                if adjustment.get("currency", "").upper() != (currency or ""):
                    raise serializers.ValidationError({"variants": "Variant adjustment currency must match the product."})
                names.append(name)
            if len(names) != len(set(names)):
                raise serializers.ValidationError({"variants": "Variant names must be unique within a product."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        variants = validated_data.pop("variants", [])
        sales_price = validated_data.pop("sales_price")
        cost_price = validated_data.pop("cost_price")
        product = Product.objects.create(
            **validated_data,
            sales_price=sales_price["amount"],
            cost_price=cost_price["amount"],
            currency=sales_price["currency"],
        )
        for variant in variants:
            adjustment = variant["priceAdjustment"]
            ProductVariant.objects.create(
                product=product,
                name=variant["name"].strip(),
                price_adjustment=adjustment["amount"],
                currency=adjustment["currency"].upper(),
            )
        return product

    def update(self, instance, validated_data):
        sales_price = validated_data.pop("sales_price", None)
        cost_price = validated_data.pop("cost_price", None)
        if sales_price:
            instance.sales_price = sales_price["amount"]
        if cost_price:
            instance.cost_price = cost_price["amount"]
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "name": instance.name,
            "type": instance.product_type,
            "salesPrice": {"amount": str(instance.sales_price), "currency": instance.currency},
            "costPrice": {"amount": str(instance.cost_price), "currency": instance.currency},
            "notes": instance.notes,
            "isActive": instance.is_active,
            "variants": VariantReadSerializer(instance.variants.all(), many=True).data,
            "createdAt": instance.created_at,
            "updatedAt": instance.updated_at,
        }


class ProductVariantCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    priceAdjustment = VariantPriceSerializer()

    def validate(self, attrs):
        attrs["name"] = attrs["name"].strip()
        if not attrs["name"]:
            raise serializers.ValidationError({"name": "Enter a variant name."})
        product = self.context["product"]
        adjustment = attrs["priceAdjustment"]
        if adjustment["currency"] != product.currency:
            raise serializers.ValidationError({"priceAdjustment": "Variant adjustment currency must match the product."})
        if product.sales_price + adjustment["amount"] < 0:
            raise serializers.ValidationError({"priceAdjustment": "The resulting variant price cannot be negative."})
        return attrs

    def create(self, validated_data):
        product = self.context["product"]
        price_adjustment = validated_data["priceAdjustment"]
        try:
            return ProductVariant.objects.create(
                product=product,
                name=validated_data["name"].strip(),
                price_adjustment=price_adjustment["amount"],
                currency=price_adjustment["currency"],
            )
        except IntegrityError as exc:
            raise serializers.ValidationError({"name": "This product already has a variant with that name."}) from exc


class ProductVariantUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160, required=False)
    priceAdjustment = VariantPriceSerializer(required=False)
    isActive = serializers.BooleanField(source="is_active", required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide at least one field to update.")
        name = attrs.get("name")
        if name is not None:
            attrs["name"] = name.strip()
            if not attrs["name"]:
                raise serializers.ValidationError({"name": "Enter a variant name."})
        variant = self.instance
        adjustment = attrs.get("priceAdjustment")
        if adjustment:
            if adjustment["currency"] != variant.currency:
                raise serializers.ValidationError({"priceAdjustment": "Variant currency cannot be changed."})
        effective_adjustment = adjustment["amount"] if adjustment else variant.price_adjustment
        effective_is_active = attrs.get("is_active", variant.is_active)
        if effective_is_active and variant.product.sales_price + effective_adjustment < 0:
            raise serializers.ValidationError({"priceAdjustment": "The resulting variant price cannot be negative."})
        if name and ProductVariant.objects.filter(product=variant.product, name=attrs["name"]).exclude(pk=variant.pk).exists():
            raise serializers.ValidationError({"name": "This product already has a variant with that name."})
        return attrs

    def update(self, instance, validated_data):
        price_adjustment = validated_data.pop("priceAdjustment", None)
        if price_adjustment:
            instance.price_adjustment = price_adjustment["amount"]
        for field, value in validated_data.items():
            setattr(instance, field, value)
        try:
            instance.save()
        except IntegrityError as exc:
            raise serializers.ValidationError({"name": "This product already has a variant with that name."}) from exc
        return instance
