"""Project-wide pytest fixtures.

Living at the repo root, these are auto-discovered by every app's tests and the
cross-app integration suite. Keep app-specific setup in the app's own
tests.py; only genuinely shared building blocks belong here.
"""

import pytest
from django.contrib.gis.geos import Point
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.location.models import Location
from apps.users.models import User

# --- file storage -----------------------------------------------------------
# Swap the GCS backend for in-memory storage so tests never touch the cloud.
# base_url lets InMemoryStorage.url() return a value; without it, reading
# Media.file.url raises and the signed-url serializer field 500s.
IN_MEMORY_STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.InMemoryStorage",
        "OPTIONS": {"base_url": "http://testserver/media/"},
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}


@pytest.fixture
def media_storage():
    """Use in-memory storage for any test that uploads or reads Media files."""
    with override_settings(STORAGES=IN_MEMORY_STORAGES):
        yield


# --- users ------------------------------------------------------------------
# `user` owns the `event`/`location` fixtures; `other_user` is the intruder
# used to assert cross-tenant isolation.


@pytest.fixture
def user(db):
    return User.objects.create_user(email="owner@example.com", password="pw12345!")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(email="intruder@example.com", password="pw12345!")


# --- events -----------------------------------------------------------------


@pytest.fixture
def event(user):
    return Event.objects.create(user=user, title="My Trip")


@pytest.fixture
def other_event(other_user):
    return Event.objects.create(user=other_user, title="Their Trip")


# --- locations --------------------------------------------------------------


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


# --- clients ----------------------------------------------------------------


@pytest.fixture
def api_client():
    """Unauthenticated DRF client."""
    return APIClient()


@pytest.fixture
def auth_client(user):
    """Client authenticated as `user` (owner of the event/location fixtures)."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def other_auth_client(other_user):
    """Client authenticated as `other_user` (the intruder)."""
    client = APIClient()
    client.force_authenticate(user=other_user)
    return client


# --- uploads ----------------------------------------------------------------


@pytest.fixture
def files():
    """A small image + text upload, fresh per test (file handles are consumed)."""
    return {
        "png": SimpleUploadedFile(
            "photo.png", b"\x89PNG\r\n\x1a\n", content_type="image/png"
        ),
        "text": SimpleUploadedFile(
            "note.txt", b"Example content", content_type="text/plain"
        ),
    }
