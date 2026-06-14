"""Cross-app integration suite — flows and invariants no single app owns.

Three concerns live here:
  1. End-to-end happy path across events + locations + media.
  2. A multi-tenant isolation sweep across every resource endpoint.
  3. Relational integrity (cascades / SET_NULL) at the DB layer.

The DB-layer cascade tests pass today; the API flows are TODO until the
events/location viewsets and the EventLocation endpoint exist.
"""

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.events.models import Event
from apps.location.models import EventLocation, Location
from apps.media.models import Media

EVENTS_URL = "/api/events/"
LOCATIONS_URL = "/api/locations/"
MEDIA_URL = "/api/media/"


# --- end-to-end happy path (TODO) -------------------------------------------


def test_full_event_assembly_flow(auth_client, user, files, media_storage):
    """Create an event, a location, link them, attach media, then read it back."""
    event_id = auth_client.post(EVENTS_URL, {"title": "Road Trip"}).data["id"]
    location_id = auth_client.post(
        LOCATIONS_URL,
        {"title": "Banff", "point": "POINT(-115.57 51.18)"},
        format="json",
    ).data["id"]

    media_resp = auth_client.post(
        MEDIA_URL,
        {"event": event_id, "location": location_id, "file": files["png"]},
        format="multipart",
    )
    assert media_resp.status_code == 201

    # The assembled graph is all owned by, and visible to, the one user.
    assert auth_client.get(f"{EVENTS_URL}{event_id}/").status_code == 200
    listed = auth_client.get(MEDIA_URL).data["results"]
    assert any(row["id"] == media_resp.data["id"] for row in listed)


# --- multi-tenant isolation sweep (TODO) ------------------------------------


def test_no_endpoint_leaks_across_tenants(
    other_auth_client, event, location, media_storage
):
    """`other_user` must never see `user`'s rows on any list endpoint."""
    Media.objects.create(
        event=event,
        media_type="img",
        mime_type="image/png",
        file=SimpleUploadedFile("x.png", b"\x89PNG", content_type="image/png"),
    )
    for url in (EVENTS_URL, LOCATIONS_URL, MEDIA_URL):
        resp = other_auth_client.get(url)
        assert resp.status_code == 200, url
        assert resp.data["results"] == [], f"{url} leaked another tenant's data"


# --- relational integrity (implemented, DB-layer) --------------------------


def test_deleting_event_cascades_media(event, media_storage):
    Media.objects.create(
        event=event,
        media_type="img",
        mime_type="image/png",
        file=SimpleUploadedFile("x.png", b"\x89PNG", content_type="image/png"),
    )
    event.delete()
    assert Media.objects.count() == 0


def test_deleting_location_nulls_media_fk(event, location, media_storage):
    m = Media.objects.create(
        event=event,
        location=location,
        media_type="img",
        mime_type="image/png",
        file=SimpleUploadedFile("x.png", b"\x89PNG", content_type="image/png"),
    )
    location.delete()  # Media.location is on_delete=SET_NULL
    m.refresh_from_db()
    assert m.location_id is None
    assert Media.objects.filter(id=m.id).exists()


def test_deleting_user_cascades_events_and_locations(user, event, location):
    EventLocation.objects.create(event=event, location=location)
    user.delete()
    assert Event.objects.count() == 0
    assert Location.objects.count() == 0
    assert EventLocation.objects.count() == 0
