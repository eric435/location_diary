from typing import Any

from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.contrib.auth.base_user import AbstractBaseUser
from django.http import HttpRequest

class EmailBackend(ModelBackend):
  def authenticate(self, request: HttpRequest, username: str | None = None, password: str | None = None, **kwargs: Any) -> AbstractBaseUser | None:
    User = get_user_model()
    try:
      user = User.objects.get(email__iexact=username)
    except User.DoesNotExist:
      return None
    if (password == None):
      return None
    if user.check_password(password) and self.user_can_authenticate(user):
      return user
    return None