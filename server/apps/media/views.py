from apps.common.params import int_param
from apps.media.models import Media
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError

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
    #
    # Optional list filters:
    #   ?event=<id>        -> only media attached to that event
    #   ?location=<id>     -> only media linked to that location (via the FK)
    #   ?near=lng,lat,km   -> only geotagged media within km of a point, ordered
    #                         nearest-first. Mirrors LocationViewSet's ?near=.
    def get_queryset(self):
        qs = Media.objects.filter(event__user=self.request.user).select_related(
            "event", "location"
        )
        event_id = int_param(self.request, "event")
        if event_id is not None:
            qs = qs.filter(event_id=event_id)
        location_id = int_param(self.request, "location")
        if location_id is not None:
            qs = qs.filter(location_id=location_id)

        near = self.request.query_params.get("near")
        if near:
            try:
                x, y, dist = near.split(",")
                origin = Point(float(x), float(y))
                radius = D(km=float(dist))
            except ValueError:
                raise ValidationError({"near": "Expected format: lng,lat,km"})
            # `point__dwithin` naturally drops rows with a null point (untagged
            # media), so this returns only geotagged photos near the origin.
            qs = (
                qs.filter(point__dwithin=(origin, radius))
                .annotate(distance=Distance("point", origin))
                .order_by("distance")
            )
        return qs
