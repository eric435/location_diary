from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    # Clients upload through `file` but never read the raw storage path back...
    file = serializers.FileField(write_only=True)
    # ...they read `file_url`, a short-lived signed GCS URL instead.
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "is_active", "is_staff", "date_joined"]
        read_only_fields = ["id", "is_active", "is_staff", "date_joined"]

    def create(self, validated_data):
        validated_data["email"] = validated_data["email"].lower()
        return super().create(validated_data)
