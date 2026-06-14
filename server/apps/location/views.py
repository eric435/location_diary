from apps.location.models import Location
from rest_framework import permissions, viewsets
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from .serializers import LocationSerializer
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
    def get_queryset(self):
        return Location.objects.filter(user=self.request.user).select_related("user")

    # Overload to allow for nearby location query
    def list(self, request, *args, **kwargs):
        near = request.query_params.get("near")
        if not near:
            return super().list(request, *args, **kwargs)

        try:
            x, y, dist = near.split(",")
        except ValueError:
            raise ValidationError({"near": "Expected format: lng,lat,km"})

        origin = Point(float(x), float(y))
        qs = (
            self.get_queryset()
            .filter(point__dwithin=(origin, D(km=float(dist))))
            .annotate(distance=Distance("point", origin))
            .order_by("distance")
        )
        page = self.paginate_queryset(qs)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
