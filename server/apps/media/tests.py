"""Media app: upload type-derivation, signed-url exposure, and ownership scoping.

These already pass — Media is the reference implementation the other apps' API
tests are written against. Shared fixtures live in the root conftest.py; the
`media_storage` fixture swaps GCS for in-memory storage.
"""

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.media.models import Media

MEDIA_URL = "/api/media/"


def _make_media(event, name="x.png", content_type="image/png", media_type="img"):
    """Create a Media row directly (bypassing the API) for setup."""
    return Media.objects.create(
        event=event,
        media_type=media_type,
        mime_type=content_type,
        file=SimpleUploadedFile(name, b"\x89PNG", content_type=content_type),
    )


# --- auth -------------------------------------------------------------------


def test_unauthenticated_request_is_rejected(api_client, db):
    assert api_client.get(MEDIA_URL).status_code == 403


# --- upload: type derivation + signed-url exposure --------------------------


def test_upload_image_derives_type_and_returns_signed_url(
    auth_client, event, files, media_storage
):
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


def test_upload_text_derives_text_type(auth_client, event, files, media_storage):
    resp = auth_client.post(
        MEDIA_URL, {"event": event.id, "file": files["text"]}, format="multipart"
    )

    assert resp.status_code == 201
    assert resp.data["mime_type"] == "text/plain"
    assert resp.data["media_type"] == "txt"


# --- ownership scoping (queryset) -------------------------------------------


def test_list_returns_only_own_media(auth_client, event, other_event, media_storage):
    mine = _make_media(event)
    _make_media(other_event)  # belongs to other_user

    resp = auth_client.get(MEDIA_URL)

    assert resp.status_code == 200
    returned_ids = [row["id"] for row in resp.data["results"]]
    assert returned_ids == [mine.id]


def test_cannot_retrieve_another_users_media(auth_client, other_event, media_storage):
    theirs = _make_media(other_event)

    resp = auth_client.get(f"{MEDIA_URL}{theirs.id}/")

    # Not in the requester's queryset -> 404, not 403 (don't leak existence).
    assert resp.status_code == 404


# --- cross-ownership validation (serializer guards) -------------------------


def test_cannot_attach_media_to_another_users_event(
    auth_client, other_event, files, media_storage
):
    resp = auth_client.post(
        MEDIA_URL, {"event": other_event.id, "file": files["png"]}, format="multipart"
    )

    assert resp.status_code == 400
    assert "event" in resp.data


def test_cannot_attach_another_users_location(
    auth_client, event, other_location, files, media_storage
):
    resp = auth_client.post(
        MEDIA_URL,
        {"event": event.id, "location": other_location.id, "file": files["png"]},
        format="multipart",
    )

    assert resp.status_code == 400
    assert "location" in resp.data


# --- list filtering ---------------------------------------------------------


def test_list_can_filter_by_event(auth_client, user, media_storage):
    from apps.events.models import Event

    e1 = Event.objects.create(user=user, title="One")
    e2 = Event.objects.create(user=user, title="Two")
    keep = _make_media(e1)
    _make_media(e2)

    resp = auth_client.get(f"{MEDIA_URL}?event={e1.id}")

    assert resp.status_code == 200
    returned_ids = [row["id"] for row in resp.data["results"]]
    assert returned_ids == [keep.id]


def test_list_filter_by_location(auth_client, event, location, media_storage):
    on_location = Media.objects.create(
        event=event,
        location=location,
        media_type="img",
        mime_type="image/png",
        file=SimpleUploadedFile("a.png", b"\x89PNG", content_type="image/png"),
    )
    _make_media(event)  # no location

    resp = auth_client.get(f"{MEDIA_URL}?location={location.id}")

    assert resp.status_code == 200
    returned_ids = [row["id"] for row in resp.data["results"]]
    assert returned_ids == [on_location.id]


def test_bad_filter_value_is_a_400(auth_client, media_storage):
    resp = auth_client.get(f"{MEDIA_URL}?event=notanumber")
    assert resp.status_code == 400
