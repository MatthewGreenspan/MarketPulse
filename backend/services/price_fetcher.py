import math
import httpx
import yfinance as yf
from models import Asset, PriceHistory
from database import SessionLocal
from services.alert_checker import check_alerts


def fetch_crypto_prices(db):
    crypto_assets = db.query(Asset).filter(Asset.asset_type == "crypto").all()      # Fetch all crypto assets
    
    ids = ",".join([a.coingecko_id for a in crypto_assets])
    
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true"
    
    response = httpx.get(url)
    data = response.json()
    
    for asset in crypto_assets:
        coin_data = data.get(asset.coingecko_id)
        if not coin_data:
            continue
        
        price = PriceHistory(
            asset_id=asset.id,
            price_usd=coin_data["usd"],
            volume_24h=coin_data.get("usd_24h_vol"),
            market_cap=coin_data.get("usd_market_cap"),
        )
        db.add(price)
    
    db.commit()
    print("Crypto prices fetched and stored.")


def _finite(value):
    # float(value) if it's a real, finite number, else None. yfinance hands back
    # None *or* NaN for fields it can't resolve, and 0 is a value worth keeping
    # (distinct from "unknown"), so a plain `if value` truthiness check is wrong.
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    return num if math.isfinite(num) else None


def _stock_quote(ticker):
    info = ticker.fast_info
    price = _finite(info.last_price)
    if price is None:
        return None

    volume = _finite(getattr(info, "last_volume", None))
    market_cap = _finite(getattr(info, "market_cap", None))
    return price, volume, market_cap


def fetch_stock_prices(db):
    stock_assets = db.query(Asset).filter(Asset.asset_type == "stock").all()
    if not stock_assets:
        return

    # yfinance has no daily request cap (unlike the old Alpha Vantage free tier),
    # so we can quote every seeded stock on each run. One symbol failing to
    # resolve must not sink the rest, so each is fetched under its own try.
    tickers = yf.Tickers(" ".join(asset.symbol for asset in stock_assets))

    for asset in stock_assets:
        try:
            quote = _stock_quote(tickers.tickers[asset.symbol])
        except Exception as error:
            print(f"Stock fetch failed for {asset.symbol}: {error}")
            continue

        if quote is None:
            continue

        price_usd, volume_24h, market_cap = quote
        db.add(PriceHistory(
            asset_id=asset.id,
            price_usd=price_usd,
            volume_24h=volume_24h,
            market_cap=market_cap,
        ))

    db.commit()
    print("Stock prices fetched and stored.")


def fetch_crypto_prices_job():
    db = SessionLocal()
    try:
        fetch_crypto_prices(db)
        check_alerts(db)
    finally:
        db.close()


def fetch_stock_prices_job():
    db = SessionLocal()
    try:
        fetch_stock_prices(db)
        check_alerts(db)
    finally:
        db.close()


def fetch_and_store_prices():
    db = SessionLocal()             # Create a new database session
    try:
        fetch_crypto_prices(db)     # Fetch crypto prices first
        fetch_stock_prices(db)      # Fetch stock prices after crypto prices
        check_alerts(db)            # Check alerts after fetching prices
    finally:
        db.close()