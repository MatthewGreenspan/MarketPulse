from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.sql import func
from database import Base

class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), unique=True, nullable=False)
    name = Column(String(100), unique=True, nullable=False)
    asset_type = Column(String(10), nullable=False)
    coingecko_id = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

class PriceHistory(Base):
    __tablename__ = "price_history"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, nullable=False)
    price_usd = Column(Float, nullable=False)
    volume_24h = Column(Float, nullable=True)
    market_cap = Column(Float,  nullable=True)
    fetched_at = Column(DateTime, server_default=func.now())

class Watchlist(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, nullable=False)
    added_at = Column(DateTime, server_default=func.now())

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, nullable=False)
    condition = Column(String(10), nullable=False)
    target_price = Column(Float, nullable=False)
    is_triggered = Column(Boolean, default=False)
    triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())






