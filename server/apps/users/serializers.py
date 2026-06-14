from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    # write_only: accepted on register, never echoed back in a response.
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "password", "is_active", "is_staff", "date_joined"]
        read_only_fields = ["id", "is_active", "is_staff", "date_joined"]

    def validate_password(self, value):
        # Run AUTH_PASSWORD_VALIDATORS (min length, common, numeric, similarity).
        validate_password(value)
        return value

    def create(self, validated_data):
        # create_user hashes the password and lowercases the email.
        return User.objects.create_user(**validated_data)
