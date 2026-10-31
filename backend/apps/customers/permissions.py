from rest_framework.permissions import BasePermission

from apps.accounts.models import User


class IsOperationalStaff(BasePermission):
    message = "Only administrators and staff can manage customer records."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.role in (User.Role.ADMIN, User.Role.STAFF)
        )


class IsCustomerAccount(BasePermission):
    message = "A customer account is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == User.Role.CUSTOMER)
