from apps.media.models import Media
from rest_framework import permissions, viewsets

from .serializers import MediaSerializer


class IsOwner(permissions.BasePermission):
    """Object-level backstop: the media's owner is media.event.user."""

    def has_object_permission(self, request, view, obj):
        return obj.event.user_id == request.user.pk


class MediaViewSet(viewsets.ModelViewSet):
    # NOTE: this class-level queryset is NOT a security hole. DRF only uses it for
    # basename inference + typing; every real data access goes through
    # get_queryset() below, which scopes to the requesting user.
    queryset = Media.objects.all()
    serializer_class = MediaSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    # Primary defense: a user only ever sees/touches their own media.
    # A non-owner requesting another user's media gets a 404, not a 403.
    def get_queryset(self):
        return Media.objects.filter(event__user=self.request.user).select_related(
            "event", "location"
        )
