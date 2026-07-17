import httpx
import os
from dotenv import load_dotenv
from models import Asset, PriceHistory
from database import SessionLocal
from services.alert_checker import check_alerts

load_dotenv()

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")


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


def fetch_stock_prices(db):
    stock_assets = db.query(Asset).filter(Asset.asset_type == "stock").all()
    
    for asset in stock_assets:
        url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={asset.symbol}&apikey={ALPHA_VANTAGE_KEY}"
        
        response = httpx.get(url)
        data = response.json()
        
        quote = data.get("Global Quote", {})
        price_str = quote.get("05. price")
        
        if not price_str:
            continue
        
        price = PriceHistory(
            asset_id=asset.id,
            price_usd=float(price_str),
            volume_24h=float(quote.get("06. volume", 0)), 
            market_cap=None,
        )
        db.add(price)
    
    db.commit()
    print("Stock prices fetched and stored.")


def fetch_crypto_prices_job():
    """CoinGecko batches every coin into one request, so this can run often."""
    db = SessionLocal()
    try:
        fetch_crypto_prices(db)
        check_alerts(db)
    finally:
        db.close()


def fetch_stock_prices_job():
    """Alpha Vantage costs one request per symbol against a small daily quota,
    so this runs far less often than the crypto job. See TODO.md."""
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