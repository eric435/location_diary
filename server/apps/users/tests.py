"""Users app: custom email-based model/manager/backend (passing) plus the
session-auth API surface (register / login / logout / me) — TODO, not built yet.
"""

import pytest
from django.contrib.auth import authenticate
from django.db import IntegrityError
from apps.users.models import User

REGISTER_URL = "/api/auth/register/"
LOGIN_URL = "/api/auth/login/"
LOGOUT_URL = "/api/auth/logout/"
ME_URL = "/api/auth/me/"


# --- model + manager (implemented) ------------------------------------------


def test_create_user_lowercases_email(db):
    u = User.objects.create_user(email="Owner@Example.COM", password="pw12345!")
    assert u.email == "owner@example.com"


def test_create_user_requires_email(db):
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password="pw12345!")


def test_create_user_hashes_password(db):
    u = User.objects.create_user(email="a@example.com", password="pw12345!")
    # Never stored in plaintext; check_password verifies the hash.
    assert u.password != "pw12345!"
    assert u.check_password("pw12345!")


def test_create_superuser_sets_flags(db):
    admin = User.objects.create_superuser(
        email="admin@example.com", password="pw12345!"
    )
    assert admin.is_staff
    assert admin.is_superuser
    assert admin.is_active


def test_email_uniqueness_is_case_insensitive(db):
    User.objects.create_user(email="dup@example.com", password="pw12345!")
    # Stored lowercased + a Lower() unique constraint -> a differing-case dup collides.
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="DUP@example.com", password="pw12345!")


def test_str_is_email(db):
    u = User.objects.create_user(email="a@example.com", password="pw12345!")
    assert str(u) == "a@example.com"


# --- authentication backend (implemented) -----------------------------------


def test_backend_authenticates_case_insensitively(db):
    User.objects.create_user(email="owner@example.com", password="pw12345!")
    assert authenticate(username="OWNER@example.com", password="pw12345!") is not None


def test_backend_rejects_wrong_password(db, user):
    assert authenticate(username=user.email, password="wrong") is None


def test_backend_rejects_missing_password(db, user):
    assert authenticate(username=user.email, password=None) is None


# --- registration API (TODO) ------------------------------------------------


def test_register_creates_user(api_client, db):
    resp = api_client.post(
        REGISTER_URL, {"email": "new@example.com", "password": "sup3r-secret!"}
    )
    assert resp.status_code == 201
    assert User.objects.filter(email="new@example.com").exists()
    # The password (hash or raw) must never come back in the response.
    assert "password" not in resp.data


def test_register_rejects_duplicate_email(api_client, user):
    resp = api_client.post(
        REGISTER_URL, {"email": user.email, "password": "sup3r-secret!"}
    )
    assert resp.status_code == 400


def test_register_rejects_weak_password(api_client, db):
    # AUTH_PASSWORD_VALIDATORS should reject short/numeric/common passwords.
    resp = api_client.post(
        REGISTER_URL, {"email": "weak@example.com", "password": "123"}
    )
    assert resp.status_code == 400


# --- login / logout / me API (TODO) -----------------------------------------


def test_login_succeeds_with_valid_credentials(api_client, user):
    resp = api_client.post(LOGIN_URL, {"email": user.email, "password": "pw12345!"})
    assert resp.status_code == 200


def test_login_fails_with_bad_credentials(api_client, user):
    resp = api_client.post(LOGIN_URL, {"email": user.email, "password": "nope"})
    assert resp.status_code in (400, 401)


def test_me_returns_current_user(auth_client, user):
    resp = auth_client.get(ME_URL)
    assert resp.status_code == 200
    assert resp.data["email"] == user.email


def test_me_requires_authentication(api_client, db):
    assert api_client.get(ME_URL).status_code == 403


def test_logout_ends_session(auth_client):
    assert auth_client.post(LOGOUT_URL).status_code in (200, 204)
