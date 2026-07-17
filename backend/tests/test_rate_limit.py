import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from database import Base, get_db
from rate_limit import limiter
from routers import auth

# The auth login/signup limit ("5/minute") set in routers/auth.py. The 6th
# request from the same IP inside the window must be rejected.
AUTH_LIMIT = 5


@pytest.fixture
def client():
    # slowapi storage is process-global; reset it so each test starts with a
    # fresh per-IP budget and stays isolated from the others.
    limiter.reset()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    app.include_router(auth.router, prefix="/auth")
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _login(client):
    # No such user exists, so a request that reaches the handler returns 401.
    # A request blocked by the limiter returns 429 before the handler runs.
    return client.post("/auth/login", json={"email": "nobody@real.com", "password": "whatever123"})


def test_login_allows_requests_under_the_limit(client):
    response = _login(client)
    # Reaches the handler (invalid creds) rather than being rate limited.
    assert response.status_code == 401


def test_login_blocks_after_exceeding_the_limit(client):
    for _ in range(AUTH_LIMIT):
        assert _login(client).status_code == 401
    # The next request is over budget for this IP.
    blocked = _login(client)
    assert blocked.status_code == 429
