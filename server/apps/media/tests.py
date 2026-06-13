import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient

from apps.media.models import Media

# Swap GCS for in-memory storage so tests never touch the cloud. base_url lets
# InMemoryStorage.url() return a value (otherwise .url raises and file_url 500s).
IN_MEMORY = {
    "default": {
        "BACKEND": "django.core.files.storage.InMemoryStorage",
        "OPTIONS": {"base_url": "http://testserver/media/"},
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
    },
}

MEDIA_URL = "/api/media/"


@pytest.fixture
def files():
    return {
        "png": SimpleUploadedFile(
            "photo.png", b"\x89PNG\r\n\x1a\n", content_type="image/png"
        ),
        "text": SimpleUploadedFile(
            "note.txt", b"Example content", content_type="text/plain"
        ),
    }


def _make_media(event, name="x.png", content_type="image/png", media_type="img"):
    """Create a Media row directly (bypassing the API) for setup."""
    return Media.objects.create(
        event=event,
        media_type=media_type,
        mime_type=content_type,
        file=SimpleUploadedFile(name, b"\x89PNG", content_type=content_type),
    )


# --- auth ---


def test_unauthenticated_request_is_rejected(db):
    resp = APIClient().get(MEDIA_URL)
    assert resp.status_code == 403


# --- upload: type derivation + signed-url exposure ---


@override_settings(STORAGES=IN_MEMORY)
def test_upload_image_derives_type_and_returns_signed_url(auth_client, event, files):
    resp = auth_client.post(
        MEDIA_URL, {"event": event.id, "file": files["png"]}, format="multipart"
    )

    assert resp.status_code == 201
    # mime_type / media_type are derived server-side from the upload.
    assert resp.data["mime_type"] == "image/png"
    assert resp.data["media_type"] == "img"
    # The raw storage path is never exposed; clients get a URL instead.
    assert "file" not in resp.data
    assert resp.data["file_url"]


@override_settings(STORAGES=IN_MEMORY)
def test_upload_text_derives_text_type(auth_client, event, files):
    resp = auth_client.post(
        MEDIA_URL, {"event": event.id, "file": files["text"]}, format="multipart"
    )

    assert resp.status_code == 201
    assert resp.data["mime_type"] == "text/plain"
    assert resp.data["media_type"] == "txt"


# --- ownership scoping (Layer 1) ---


@override_settings(STORAGES=IN_MEMORY)
def test_list_returns_only_own_media(auth_client, event, other_event):
    mine = _make_media(event)
    _make_media(other_event)  # belongs to other_user

    resp = auth_client.get(MEDIA_URL)

    assert resp.status_code == 200
    returned_ids = [row["id"] for row in resp.data["results"]]
    assert returned_ids == [mine.id]


@override_settings(STORAGES=IN_MEMORY)
def test_cannot_retrieve_another_users_media(auth_client, other_event):
    theirs = _make_media(other_event)

    resp = auth_client.get(f"{MEDIA_URL}{theirs.id}/")

    # Not in the requester's queryset -> 404, not 403 (don't leak existence).
    assert resp.status_code == 404


# --- cross-ownership validation (serializer guards) ---


@override_settings(STORAGES=IN_MEMORY)
def test_cannot_attach_media_to_another_users_event(auth_client, other_event, files):
    resp = auth_client.post(
        MEDIA_URL, {"event": other_event.id, "file": files["png"]}, format="multipart"
    )

    assert resp.status_code == 400
    assert "event" in resp.data


@override_settings(STORAGES=IN_MEMORY)
def test_cannot_attach_another_users_location(
    auth_client, event, other_location, files
):
    resp = auth_client.post(
        MEDIA_URL,
        {"event": event.id, "location": other_location.id, "file": files["png"]},
        format="multipart",
    )

    assert resp.status_code == 400
    assert "location" in resp.data
