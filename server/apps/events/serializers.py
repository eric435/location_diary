from rest_framework import serializers

from .models import Event


class EventSerializer(serializers.ModelSerializer):

    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Event
        fields = [
            "id",
            "user",
            "title",
            "description",
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
