import os
from slowapi import Limiter
from slowapi.util import get_remote_address


def _client_ip(request):
    """Per-IP key for rate limiting.

    get_remote_address reads the socket peer IP. Behind a proxy (e.g. Railway)
    that peer is the proxy, so without special handling every client would share
    one bucket. When TRUST_PROXY is set we trust the first hop of X-Forwarded-For
    instead. It stays OFF by default because that header is trivially spoofable
    unless a trusted proxy is actually in front of the app.
    """
    if os.getenv("TRUST_PROXY", "").strip().lower() in ("1", "true", "yes"):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# One shared limiter for the whole app. Lives in its own module so main.py and
# the routers can import it without a circular dependency.
#
# default_limits -> applied to every route via SlowAPIMiddleware unless a route
# sets a tighter limit with its own @limiter.limit(...) decorator.
limiter = Limiter(key_func=_client_ip, default_limits=["60/minute"])
