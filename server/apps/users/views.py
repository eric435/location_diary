from django.contrib.auth import authenticate, login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import UserSerializer


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Public bootstrap: plant the csrftoken cookie before login.

    The SPA calls this once on load so the browser holds a CSRF cookie it can
    echo back in the X-CSRFToken header on subsequent unsafe requests. The body
    is empty; only the Set-Cookie matters.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(generics.CreateAPIView):
    """Public: create an account and start a session in one step."""

    serializer_class = UserSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        user = serializer.save()
        # Two backends are configured; name the one that owns this session.
        login(self.request, user, backend="apps.users.backends.EmailBackend")


class LoginView(APIView):
    """Public: establish a session from email + password."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        user = authenticate(
            request,
            username=request.data.get("email"),
            password=request.data.get("password"),
        )
        if user is None:
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    """End the current session."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveAPIView):
    """Return the authenticated user."""

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
