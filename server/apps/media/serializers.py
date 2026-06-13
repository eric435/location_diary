from rest_framework import serializers

from .models import Media


class MediaSerializer(serializers.ModelSerializer):
    # Clients upload through `file` but never read the raw storage path back...
    file = serializers.FileField(write_only=True)
    # ...they read `file_url`, a short-lived signed GCS URL instead.
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = [
            "id",
            "event",
            "location",
            "note",
            "file",
            "file_url",
            "mime_type",
            "media_type",
            "timestamp",
            "created_at",
        ]
        # mime_type / media_type are derived from the upload, not client-supplied.
        read_only_fields = ["id", "created_at", "mime_type", "media_type"]

    def create(self, validated_data):
        upload = validated_data["file"]
        mime = getattr(upload, "content_type", "") or ""
        validated_data["mime_type"] = mime
        validated_data["media_type"] = (
            Media.MediaType.IMAGE if mime.startswith("image/") else Media.MediaType.TEXT
        )
        return super().create(validated_data)

    def get_file_url(self, obj):
        # With the GCS backend + GS_QUERYSTRING_AUTH, .url is already a signed,
        # expiring URL. Ownership is enforced upstream: the client only reaches
        # this object through the user-scoped queryset.
        return obj.file.url if obj.file else None

    # Prevent attaching media to an event the requester doesn't own.
    def validate_event(self, event):
        if event.user_id != self.context["request"].user.pk:
            raise serializers.ValidationError("You do not own this event.")
        return event

    # Location is optional; only validate ownership when one is supplied.
    def validate_location(self, location):
        if location is not None and location.user_id != self.context["request"].user.pk:
            raise serializers.ValidationError("You do not own this location.")
        return location
