import pytest
from django.contrib.gis.geos import Point
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.location.models import Location
from apps.users.models import User


@pytest.fixture
def user(db):
    return User.objects.create_user(email="owner@example.com", password="pw12345!")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(email="intruder@example.com", password="pw12345!")


@pytest.fixture
def event(user):
    return Event.objects.create(user=user, title="My Trip")


@pytest.fixture
def other_event(other_user):
    return Event.objects.create(user=other_user, title="Their Trip")


@pytest.fixture
def location(user):
    return Location.objects.create(
        user=user, title="YVR", point=Point(-123.175, 49.193)
    )


@pytest.fixture
def other_location(other_user):
    return Location.objects.create(
        user=other_user, title="Theirs", point=Point(0.0, 0.0)
    )


@pytest.fixture
def auth_client(user):
    """API client authenticated as `user` (the owner of `event`/`location`)."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client
