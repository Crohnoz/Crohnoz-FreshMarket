from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed


class PilotTokenAuthentication(TokenAuthentication):
    """Temporary token authentication with a strict server-side lifetime."""

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        max_age = timedelta(hours=settings.PILOT_TOKEN_MAX_HOURS)
        if token.created < timezone.now() - max_age:
            raise AuthenticationFailed("La sesión venció. Ingresa nuevamente.", code="token_expired")
        return user, token
