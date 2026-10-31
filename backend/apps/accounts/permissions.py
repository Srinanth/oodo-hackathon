from rest_framework.permissions import BasePermission

from apps.accounts.models import User


class IsAdministrator(BasePermission):
    """Allow access only to an authenticated account with the admin role."""

    message = "Administrator access is required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.ADMIN
        )


class IsStaffOrAdministrator(BasePermission):
    """Allow operational staff and administrators to use internal pricing tools."""

    message = "Staff access is required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (User.Role.ADMIN, User.Role.STAFF)
        )


class IsStaffReadAdminWrite(BasePermission):
    """Allow staff and admins to read; allow only admins to mutate."""

    message = "Staff access is required."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role == User.Role.ADMIN:
            return True
        return request.user.role == User.Role.STAFF and request.method in ("GET", "HEAD", "OPTIONS")


class IsCustomerOwner(BasePermission):
    """Allow portal customers to access only objects linked to their account."""

    message = "This record is not available to your account."

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role in (User.Role.ADMIN, User.Role.STAFF):
            return True
        customer = getattr(obj, "customer", obj)
        return user.role == User.Role.CUSTOMER and getattr(customer, "account_user_id", None) == user.pk


def customer_scoped(queryset, user, customer_field="customer__account_user_id"):
    """Scope a customer-owned queryset to the customer linked to this session."""
    if not user or not user.is_authenticated:
        return queryset.none()
    if user.role != User.Role.CUSTOMER:
        return queryset.none()
    return queryset.filter(**{customer_field: user.pk})
