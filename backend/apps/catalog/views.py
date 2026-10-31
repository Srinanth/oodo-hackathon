import uuid

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAdministrator, IsStaffOrAdministrator, IsStaffReadAdminWrite
from apps.catalog.models import DiscountRedemption, DiscountRule, Plan, Product, ProductVariant, TaxRule
from apps.catalog.discount_serializers import DiscountPreviewSerializer, DiscountRuleSerializer
from apps.catalog.discount_services import evaluate_discount
from apps.catalog.plan_serializers import PlanSerializer
from apps.catalog.tax_serializers import TaxPreviewSerializer, TaxRuleSerializer
from apps.catalog.tax_services import calculate_tax, tax_snapshot
from apps.catalog.serializers import (
    ProductSerializer,
    ProductVariantCreateSerializer,
    ProductVariantUpdateSerializer,
    VariantReadSerializer,
)


def _page_params(request):
    try:
        limit = int(request.query_params.get("limit", "25"))
    except ValueError as exc:
        raise ValidationError({"limit": "Use an integer from 1 to 100."}) from exc
    if limit < 1 or limit > 100:
        raise ValidationError({"limit": "Use an integer from 1 to 100."})

    cursor_value = request.query_params.get("cursor")
    if not cursor_value:
        return limit, None
    try:
        return limit, uuid.UUID(cursor_value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValidationError({"cursor": "This cursor is invalid."}) from exc


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def products(request):
    if request.method == "GET":
        limit, cursor = _page_params(request)
        queryset = Product.objects.prefetch_related("variants").order_by("id")
        if cursor:
            queryset = queryset.filter(id__gt=cursor)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(notes__icontains=search)).distinct()
        page = list(queryset[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit]
        return Response({
            "items": ProductSerializer(page, many=True).data,
            "nextCursor": str(page[-1].id) if has_more and page else None,
        })

    serializer = ProductSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    product = serializer.save()
    product = Product.objects.prefetch_related("variants").get(pk=product.pk)
    return Response(ProductSerializer(product).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def product_detail(request, product_id):
    try:
        product = Product.objects.prefetch_related("variants").get(pk=product_id)
    except Product.DoesNotExist as exc:
        raise NotFound("Product not found.") from exc

    if request.method == "GET":
        return Response(ProductSerializer(product).data)

    serializer = ProductSerializer(product, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated_product = serializer.save()
    updated_product = Product.objects.prefetch_related("variants").get(pk=updated_product.pk)
    return Response(ProductSerializer(updated_product).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdministrator])
def product_variants(request, product_id):
    try:
        product = Product.objects.get(pk=product_id)
    except Product.DoesNotExist as exc:
        raise NotFound("Product not found.") from exc

    serializer = ProductVariantCreateSerializer(data=request.data, context={"product": product})
    serializer.is_valid(raise_exception=True)
    variant = serializer.save()
    return Response(VariantReadSerializer(variant).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdministrator])
def product_variant_detail(request, product_id, variant_id):
    try:
        variant = Product.objects.get(pk=product_id).variants.get(pk=variant_id)
    except (Product.DoesNotExist, ProductVariant.DoesNotExist) as exc:
        raise NotFound("Product variant not found.") from exc

    serializer = ProductVariantUpdateSerializer(variant, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated_variant = serializer.save()
    return Response(VariantReadSerializer(updated_variant).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def plans(request):
    if request.method == "GET":
        limit, cursor = _page_params(request)
        queryset = Plan.objects.order_by("id")
        if cursor:
            queryset = queryset.filter(id__gt=cursor)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name__icontains=search)
        page = list(queryset[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit]
        return Response({
            "items": PlanSerializer(page, many=True).data,
            "nextCursor": str(page[-1].id) if has_more and page else None,
        })

    serializer = PlanSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    plan = serializer.save()
    return Response(PlanSerializer(plan).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def plan_detail(request, plan_id):
    try:
        plan = Plan.objects.get(pk=plan_id)
    except Plan.DoesNotExist as exc:
        raise NotFound("Plan not found.") from exc

    if request.method == "GET":
        return Response(PlanSerializer(plan).data)

    serializer = PlanSerializer(plan, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    return Response(PlanSerializer(serializer.save()).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def tax_rules(request):
    if request.method == "GET":
        limit, cursor = _page_params(request)
        queryset = TaxRule.objects.order_by("id")
        if cursor:
            queryset = queryset.filter(id__gt=cursor)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name__icontains=search)
        page = list(queryset[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit]
        return Response({
            "items": TaxRuleSerializer(page, many=True).data,
            "nextCursor": str(page[-1].id) if has_more and page else None,
        })

    serializer = TaxRuleSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    rule = serializer.save()
    return Response(TaxRuleSerializer(rule).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def tax_rule_detail(request, tax_rule_id):
    try:
        rule = TaxRule.objects.get(pk=tax_rule_id)
    except TaxRule.DoesNotExist as exc:
        raise NotFound("Tax rule not found.") from exc
    if request.method == "GET":
        return Response(TaxRuleSerializer(rule).data)
    serializer = TaxRuleSerializer(rule, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    return Response(TaxRuleSerializer(serializer.save()).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def tax_rule_preview(request, tax_rule_id):
    try:
        rule = TaxRule.objects.get(pk=tax_rule_id)
    except TaxRule.DoesNotExist as exc:
        raise NotFound("Tax rule not found.") from exc

    serializer = TaxPreviewSerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    on_date = data.get("onDate", timezone.localdate())
    applies = rule.is_active and (rule.active_from is None or rule.active_from <= on_date) and (rule.active_until is None or rule.active_until >= on_date)
    tax_amount = calculate_tax(data["amount"], rule.rate_percent) if applies else calculate_tax(data["amount"], 0)
    snapshot = tax_snapshot(rule, data["amount"]) if applies else None
    return Response({
        "ruleId": str(rule.id),
        "name": rule.name,
        "onDate": on_date,
        "applies": applies,
        "baseAmount": str(data["amount"]),
        "ratePercent": str(rule.rate_percent),
        "taxAmount": str(tax_amount),
        "totalAmount": str(data["amount"] + tax_amount),
        "currency": data["currency"],
        "snapshot": {
            "name": snapshot["name_snapshot"],
            "ratePercent": str(snapshot["rate_percent_snapshot"]),
            "taxAmount": str(snapshot["amount"]),
            "currency": data["currency"],
        } if snapshot else None,
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def discount_rules(request):
    if request.method == "GET":
        limit, cursor = _page_params(request)
        queryset = DiscountRule.objects.annotate(
            active_uses_count=Count(
                "redemptions",
                filter=Q(redemptions__status__in=(DiscountRedemption.Status.RESERVED, DiscountRedemption.Status.CONSUMED)),
            )
        ).prefetch_related("products").order_by("id")
        if cursor:
            queryset = queryset.filter(id__gt=cursor)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name__icontains=search)
        page = list(queryset[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit]
        return Response({
            "items": DiscountRuleSerializer(page, many=True).data,
            "nextCursor": str(page[-1].id) if has_more and page else None,
        })

    serializer = DiscountRuleSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    rule = serializer.save()
    return Response(DiscountRuleSerializer(rule).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsStaffReadAdminWrite])
def discount_rule_detail(request, discount_rule_id):
    try:
        rule = DiscountRule.objects.prefetch_related("products").get(pk=discount_rule_id)
    except DiscountRule.DoesNotExist as exc:
        raise NotFound("Discount rule not found.") from exc
    if request.method == "GET":
        return Response(DiscountRuleSerializer(rule).data)
    serializer = DiscountRuleSerializer(rule, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    return Response(DiscountRuleSerializer(serializer.save()).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsStaffOrAdministrator])
def discount_rule_preview(request, discount_rule_id):
    try:
        rule = DiscountRule.objects.prefetch_related("products").get(pk=discount_rule_id)
    except DiscountRule.DoesNotExist as exc:
        raise NotFound("Discount rule not found.") from exc
    serializer = DiscountPreviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    lines = serializer.validated_data["lines"]
    product_ids = {line["productId"] for line in lines}
    found = set(Product.objects.filter(id__in=product_ids, is_active=True).values_list("id", flat=True))
    if found != product_ids:
        raise ValidationError({"lines": "Every line must reference an active product."})
    evaluated_at = serializer.validated_data.get("evaluatedAt", timezone.now())
    result = evaluate_discount(rule, lines, evaluated_at=evaluated_at)
    return Response({
        "ruleId": str(rule.id),
        "name": rule.name,
        "discountType": rule.discount_type,
        "value": str(rule.value),
        "eligible": result["eligible"],
        "reason": result["reason"],
        "eligibleAmount": str(result["eligibleAmount"]),
        "eligibleQuantity": result["eligibleQuantity"],
        "discountAmount": str(result["discountAmount"]),
        "currency": result["currency"],
        "usesCount": rule.redemptions.filter(status__in=(DiscountRedemption.Status.RESERVED, DiscountRedemption.Status.CONSUMED)).count(),
        "usesRemaining": result["usesRemaining"],
        "evaluatedAt": evaluated_at,
    })
