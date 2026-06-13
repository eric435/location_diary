from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db.models.functions import Lower
from .managers import UserManager

# Create your models here.
class User(AbstractBaseUser, PermissionsMixin):

  email = models.EmailField(unique=True)
  is_active = models.BooleanField(default=True)
  is_staff = models.BooleanField(default=False)
  date_joined = models.DateTimeField(auto_now_add=True)

  objects = UserManager()

  USERNAME_FIELD = "email"
  REQUIRED_FIELDS = []

  class Meta:
    contraints = [
      models.UniqueConstraint(Lower("email"), name="unique_email_ci")
    ]

  def __str__(self):
    return self.email