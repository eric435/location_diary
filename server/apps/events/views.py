from apps.common.params import int_param
from apps.events.models import Event
from rest_framework import permissions, viewsets

from .serializers import EventSerializer


class IsOwner(permissions.BasePermission):
    """Object-level backstop: the event's owner matches request user."""

    def has_object_permission(self, request, view, obj: Event):
        return obj.user_id == request.user.pk  # pyright: ignore


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    # Primary defense: a user only ever sees/touches their own events.
    # A non-owner requesting another user's event gets a 404, not a 403.
    def get_queryset(self):
        qs = Event.objects.filter(user=self.request.user).select_related("user")
        # Optional: ?location=<id> -> only events that include that location.
        location_id = int_param(self.request, "location")
        if location_id is not None:
            qs = qs.filter(locations__id=location_id).distinct()
        return qs
