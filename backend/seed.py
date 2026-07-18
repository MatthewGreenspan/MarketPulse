"""Seed the assets table.

Idempotent: assets whose symbol already exists are skipped, so it's safe to
re-run. Run directly (`python seed.py`) or import `ASSETS` / `seed()` elsewhere
(reset_db.py reuses them).
"""
from database import SessionLocal
from models import Asset

ASSETS = [
    # Crypto — coingecko_id is the CoinGecko API slug used by the price fetcher.
    {"symbol": "BTC", "name": "Bitcoin", "asset_type": "crypto", "coingecko_id": "bitcoin"},
    {"symbol": "ETH", "name": "Ethereum", "asset_type": "crypto", "coingecko_id": "ethereum"},
    {"symbol": "SOL", "name": "Solana", "asset_type": "crypto", "coingecko_id": "solana"},
    {"symbol": "ADA", "name": "Cardano", "asset_type": "crypto", "coingecko_id": "cardano"},
    {"symbol": "LINK", "name": "Chainlink", "asset_type": "crypto", "coingecko_id": "chainlink"},
    {"symbol": "XRP", "name": "XRP", "asset_type": "crypto", "coingecko_id": "ripple"},
    {"symbol": "DOGE", "name": "Dogecoin", "asset_type": "crypto", "coingecko_id": "dogecoin"},
    {"symbol": "DOT", "name": "Polkadot", "asset_type": "crypto", "coingecko_id": "polkadot"},
    {"symbol": "AVAX", "name": "Avalanche", "asset_type": "crypto", "coingecko_id": "avalanche-2"},
    {"symbol": "LTC", "name": "Litecoin", "asset_type": "crypto", "coingecko_id": "litecoin"},
    {"symbol": "UNI", "name": "Uniswap", "asset_type": "crypto", "coingecko_id": "uniswap"},
    {"symbol": "ATOM", "name": "Cosmos", "asset_type": "crypto", "coingecko_id": "cosmos"},
    {"symbol": "MATIC", "name": "Polygon", "asset_type": "crypto", "coingecko_id": "matic-network"},
    {"symbol": "BCH", "name": "Bitcoin Cash", "asset_type": "crypto", "coingecko_id": "bitcoin-cash"},
    {"symbol": "XLM", "name": "Stellar", "asset_type": "crypto", "coingecko_id": "stellar"},
    # Stocks — symbol is the ticker used by yfinance. coingecko_id stays None.
    {"symbol": "AAPL", "name": "Apple Inc.", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "MSFT", "name": "Microsoft", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "GOOGL", "name": "Alphabet", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "AMZN", "name": "Amazon", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "NVDA", "name": "Nvidia", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "TSLA", "name": "Tesla", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "META", "name": "Meta Platforms", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "NFLX", "name": "Netflix", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "AMD", "name": "Advanced Micro Devices", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "JPM", "name": "JPMorgan Chase", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "V", "name": "Visa", "asset_type": "stock", "coingecko_id": None},
    {"symbol": "DIS", "name": "Walt Disney", "asset_type": "stock", "coingecko_id": None},
]


def seed(db):
    for spec in ASSETS:
        exists = db.query(Asset).filter(Asset.symbol == spec["symbol"]).first()
        if not exists:
            db.add(Asset(**spec))
    db.commit()


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
        print(f"Assets seeded ({len(ASSETS)} defined; existing symbols skipped).")
    finally:
        db.close()
