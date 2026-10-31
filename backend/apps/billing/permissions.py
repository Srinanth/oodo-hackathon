from rest_framework.permissions import BasePermission

from apps.accounts.models import User


class IsBillingStaff(BasePermission):
    message = "Only administrators and staff can execute or inspect billing runs."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.role in (User.Role.ADMIN, User.Role.STAFF) or user.is_staff or user.is_superuser)
        )
