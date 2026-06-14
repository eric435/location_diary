from apps.common.params import int_param
from apps.location.models import EventLocation, Location
from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from .serializers import EventLocationSerializer, LocationSerializer
from django.contrib.gis.db.models.functions import Distance


class IsOwner(permissions.BasePermission):
    """Object-level backstop: the location's owner matches request user."""

    def has_object_permission(self, request, view, obj: Location):
        return obj.user_id == request.user.pk  # pyright: ignore


class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    # Primary defense: a user only ever sees/touches their own locations.
    # A non-owner requesting another user's location gets a 404, not a 403.
    #
    # All list filtering lives here so the stock list() handles pagination for us:
    #   ?event=<id>        -> only locations linked to that event
    #   ?near=lng,lat,km   -> only locations within km, ordered nearest-first
    def get_queryset(self):
        qs = Location.objects.filter(user=self.request.user).select_related("user")

        event_id = int_param(self.request, "event")
        if event_id is not None:
            qs = qs.filter(events__id=event_id).distinct()

        near = self.request.query_params.get("near")
        if near:
            try:
                x, y, dist = near.split(",")
                origin = Point(float(x), float(y))
                radius = D(km=float(dist))
            except ValueError:
                raise ValidationError({"near": "Expected format: lng,lat,km"})
            qs = (
                qs.filter(point__dwithin=(origin, radius))
                .annotate(distance=Distance("point", origin))
                .order_by("distance")
            )
        return qs


class IsEventLocationOwner(permissions.BasePermission):
    """Object-level backstop: the link belongs to the user who owns its event."""

    def has_object_permission(self, request, view, obj: EventLocation):
        return obj.event.user_id == request.user.pk  # pyright: ignore


class EventLocationViewSet(viewsets.ModelViewSet):
    """CRUD for event<->location links (with arrival/departure times).

    Scoped to links whose event belongs to the requester. Supports
    ?event=<id> and ?location=<id> filters so a client can fetch one event's
    stops or one location's visits.
    """

    queryset = EventLocation.objects.all()
    serializer_class = EventLocationSerializer
    permission_classes = [permissions.IsAuthenticated, IsEventLocationOwner]

    def get_queryset(self):
        qs = EventLocation.objects.filter(
            event__user=self.request.user
        ).select_related("event", "location")
        event_id = int_param(self.request, "event")
        if event_id is not None:
            qs = qs.filter(event_id=event_id)
        location_id = int_param(self.request, "location")
        if location_id is not None:
            qs = qs.filter(location_id=location_id)
        return qs
