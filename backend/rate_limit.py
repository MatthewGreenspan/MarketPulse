from slowapi import Limiter
from slowapi.util import get_remote_address

# One shared limiter for the whole app. Lives in its own module so main.py and
# the routers can import it without a circular dependency.
#
# key_func=get_remote_address -> each client IP gets its own request budget.
# default_limits -> applied to every route via SlowAPIMiddleware unless a route
# sets a tighter limit with its own @limiter.limit(...) decorator.
#
# NOTE (deployment): get_remote_address reads the socket peer IP. Behind a proxy
# (e.g. Railway) every request appears to come from the proxy unless X-Forwarded-For
# handling is configured, which would put all users in one bucket. Revisit when we
# deploy -- see TODO.md.
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
