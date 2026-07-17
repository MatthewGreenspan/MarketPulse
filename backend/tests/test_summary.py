from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models import Asset, PriceHistory
from routers import assets


@pytest.fixture
def client():
    # In-memory SQLite with StaticPool so every connection shares one DB.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    now = datetime(2026, 7, 17, 12, 0, 0)
    db = TestingSessionLocal()
    # BTC: a row now and a row 25h ago -> change computable (+10%).
    db.add(Asset(id=1, symbol="BTC", name="Bitcoin", asset_type="crypto"))
    db.add(PriceHistory(asset_id=1, price_usd=100.0, volume_24h=1000.0, fetched_at=now - timedelta(hours=25)))
    db.add(PriceHistory(asset_id=1, price_usd=110.0, volume_24h=2000.0, fetched_at=now))
    # ETH: only recent rows (<24h apart) -> price present, change null.
    db.add(Asset(id=2, symbol="ETH", name="Ethereum", asset_type="crypto"))
    db.add(PriceHistory(asset_id=2, price_usd=50.0, volume_24h=500.0, fetched_at=now - timedelta(hours=2)))
    db.add(PriceHistory(asset_id=2, price_usd=55.0, volume_24h=600.0, fetched_at=now))
    # GOOGL: no price rows -> all metrics null.
    db.add(Asset(id=3, symbol="GOOGL", name="Alphabet", asset_type="stock"))
    db.commit()
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app = FastAPI()
    app.include_router(assets.router, prefix="/assets")
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _by_symbol(rows):
    return {row["symbol"]: row for row in rows}


def test_summary_returns_every_asset(client):
    response = client.get("/assets/summary")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 3
    assert set(_by_symbol(rows).keys()) == {"BTC", "ETH", "GOOGL"}


def test_summary_computes_24h_change(client):
    btc = _by_symbol(client.get("/assets/summary").json())["BTC"]
    assert btc["price_usd"] == 110.0
    assert btc["volume_24h"] == 2000.0
    assert btc["change_pct_24h"] == pytest.approx(10.0)


def test_summary_null_change_without_24h_reference(client):
    eth = _by_symbol(client.get("/assets/summary").json())["ETH"]
    assert eth["price_usd"] == 55.0
    assert eth["change_pct_24h"] is None


def test_summary_null_metrics_when_no_prices(client):
    googl = _by_symbol(client.get("/assets/summary").json())["GOOGL"]
    assert googl["price_usd"] is None
    assert googl["change_pct_24h"] is None
    assert googl["volume_24h"] is None
    assert googl["fetched_at"] is None
