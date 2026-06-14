"""Events app: model (passing) + owner-scoped CRUD viewset at /api/events/ (TODO).

The viewset is expected to mirror Media's contract: queryset scoped to the
requesting user, non-owner access returns 404 (not 403), and the owner is taken
from request.user rather than the request body.
"""

from apps.events.models import Event

EVENTS_URL = "/api/events/"


# --- model ----------------------------------------------------


def test_str_is_title(event):
    assert str(event) == "My Trip"


def test_created_at_is_set(event):
    assert event.created_at is not None


# --- auth ------------------------------------------------------------


def test_unauthenticated_request_is_rejected(api_client, db):
    assert api_client.get(EVENTS_URL).status_code == 403


# --- ownership scoping -----------------------------------------------


def test_list_returns_only_own_events(auth_client, event, other_event):
    resp = auth_client.get(EVENTS_URL)
    assert resp.status_code == 200
    returned_ids = [row["id"] for row in resp.data["results"]]
    assert returned_ids == [event.id]


def test_create_assigns_owner_from_request_user(auth_client, user, other_user):
    # Even if a different user is supplied in the body, ownership comes from the
    # authenticated request — a client can't create events for someone else.
    resp = auth_client.post(EVENTS_URL, {"title": "Solo Trip", "user": other_user.id})
    assert resp.status_code == 201
    created = Event.objects.get(id=resp.data["id"])
    assert created.user_id == user.id  # pyright: ignore[reportAttributeAccessIssue]


def test_cannot_retrieve_another_users_event(auth_client, other_event):
    resp = auth_client.get(f"{EVENTS_URL}{other_event.id}/")
    assert resp.status_code == 404


def test_cannot_update_another_users_event(auth_client, other_event):
    resp = auth_client.patch(f"{EVENTS_URL}{other_event.id}/", {"title": "Hijacked"})
    assert resp.status_code == 404


def test_cannot_delete_another_users_event(auth_client, other_event):
    resp = auth_client.delete(f"{EVENTS_URL}{other_event.id}/")
    assert resp.status_code == 404
    assert Event.objects.filter(id=other_event.id).exists()


def test_owner_can_update_event(auth_client, event):
    resp = auth_client.patch(f"{EVENTS_URL}{event.id}/", {"title": "Renamed"})
    assert resp.status_code == 200
    event.refresh_from_db()
    assert event.title == "Renamed"
