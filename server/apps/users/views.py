from apps.users.models import User
from rest_framework import permissions, viewsets

from .serializers import UserSerializer


class IsOwner(permissions.BasePermission):
    """Object-level backstop: the media's owner is media.event.user."""

    def has_object_permission(self, request, view, obj):
        return obj.event.user_id == request.user.pk


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    # Primary defense: a user only ever sees/touches their own user object.
    def get_queryset(self):
        return User.objects.filter(id=self.request.user.pk)
