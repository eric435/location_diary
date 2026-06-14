from rest_framework import serializers

from .models import Location


class LocationSerializer(serializers.ModelSerializer):

    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Location
        fields = [
            "id",
            "user",
            "events",
            "title",
            "point",
            "created_at",
        ]
        read_only_fields = ["id", "user", "created_at"]

    # Prevent setting a user that doesn't match authenticated user.
    def validate_user(self, user):
        if user.id != self.context["request"].user.pk:
            raise serializers.ValidationError(
                "Event owner must match authenticated user."
            )
        return user
