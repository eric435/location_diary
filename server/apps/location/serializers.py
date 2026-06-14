from rest_framework import serializers

from .models import EventLocation, Location


class LocationSerializer(serializers.ModelSerializer):

    user = serializers.HiddenField(default=serializers.CurrentUserDefault())
    # Convenience read fields so map clients get coordinates without parsing the
    # WKT `point`. Writes still use `point` (e.g. "POINT(-123.1 49.2)").
    lat = serializers.SerializerMethodField()
    lng = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = [
            "id",
            "user",
            "events",
            "title",
            "point",
            "lat",
            "lng",
            "created_at",
        ]
        # `events` is read-only: it's an M2M through EventLocation, so links are
        # managed via the /api/event-locations/ endpoint, not set here.
        read_only_fields = ["id", "user", "events", "created_at"]

    def get_lat(self, obj):
        return obj.point.y if obj.point else None

    def get_lng(self, obj):
        return obj.point.x if obj.point else None

    # Prevent setting a user that doesn't match authenticated user.
    def validate_user(self, user):
        if user.id != self.context["request"].user.pk:
            raise serializers.ValidationError(
                "Location owner must match authenticated user."
            )
        return user


class EventLocationSerializer(serializers.ModelSerializer):
    """A single event<->location link, carrying arrival/departure times.

    This is what makes the diary work: it records that the user was at a given
    location during a given event, optionally with when they arrived and left.
    `location_detail` is a nested read-only copy of the location so a client can
    render an event's stops (title + coordinates + times) in one request.
    """

    location_detail = LocationSerializer(source="location", read_only=True)

    class Meta:
        model = EventLocation
        fields = [
            "id",
            "event",
            "location",
            "location_detail",
            "arrival",
            "departure",
        ]
        read_only_fields = ["id"]

    # Prevent linking to an event the requester doesn't own.
    def validate_event(self, event):
        if event.user_id != self.context["request"].user.pk:
            raise serializers.ValidationError("You do not own this event.")
        return event

    # Prevent linking to a location the requester doesn't own.
    def validate_location(self, location):
        if location.user_id != self.context["request"].user.pk:
            raise serializers.ValidationError("You do not own this location.")
        return location
