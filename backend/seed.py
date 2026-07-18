from database import SessionLocal
from models import Asset

db = SessionLocal()

assets = [
    # Crypto — coingecko_id is the CoinGecko API slug used by the price fetcher.
    Asset(symbol="BTC", name="Bitcoin", asset_type="crypto", coingecko_id="bitcoin"),
    Asset(symbol="ETH", name="Ethereum", asset_type="crypto", coingecko_id="ethereum"),
    Asset(symbol="SOL", name="Solana", asset_type="crypto", coingecko_id="solana"),
    Asset(symbol="ADA", name="Cardano", asset_type="crypto", coingecko_id="cardano"),
    Asset(symbol="LINK", name="Chainlink", asset_type="crypto", coingecko_id="chainlink"),
    Asset(symbol="XRP", name="XRP", asset_type="crypto", coingecko_id="ripple"),
    Asset(symbol="DOGE", name="Dogecoin", asset_type="crypto", coingecko_id="dogecoin"),
    Asset(symbol="DOT", name="Polkadot", asset_type="crypto", coingecko_id="polkadot"),
    Asset(symbol="AVAX", name="Avalanche", asset_type="crypto", coingecko_id="avalanche-2"),
    Asset(symbol="LTC", name="Litecoin", asset_type="crypto", coingecko_id="litecoin"),
    Asset(symbol="UNI", name="Uniswap", asset_type="crypto", coingecko_id="uniswap"),
    Asset(symbol="ATOM", name="Cosmos", asset_type="crypto", coingecko_id="cosmos"),
    Asset(symbol="MATIC", name="Polygon", asset_type="crypto", coingecko_id="matic-network"),
    Asset(symbol="BCH", name="Bitcoin Cash", asset_type="crypto", coingecko_id="bitcoin-cash"),
    Asset(symbol="XLM", name="Stellar", asset_type="crypto", coingecko_id="stellar"),
    # Stocks — symbol is the ticker used by yfinance. coingecko_id stays None.
    Asset(symbol="AAPL", name="Apple Inc.", asset_type="stock", coingecko_id=None),
    Asset(symbol="MSFT", name="Microsoft", asset_type="stock", coingecko_id=None),
    Asset(symbol="GOOGL", name="Alphabet", asset_type="stock", coingecko_id=None),
    Asset(symbol="AMZN", name="Amazon", asset_type="stock", coingecko_id=None),
    Asset(symbol="NVDA", name="Nvidia", asset_type="stock", coingecko_id=None),
    Asset(symbol="TSLA", name="Tesla", asset_type="stock", coingecko_id=None),
    Asset(symbol="META", name="Meta Platforms", asset_type="stock", coingecko_id=None),
    Asset(symbol="NFLX", name="Netflix", asset_type="stock", coingecko_id=None),
    Asset(symbol="AMD", name="Advanced Micro Devices", asset_type="stock", coingecko_id=None),
    Asset(symbol="JPM", name="JPMorgan Chase", asset_type="stock", coingecko_id=None),
    Asset(symbol="V", name="Visa", asset_type="stock", coingecko_id=None),
    Asset(symbol="DIS", name="Walt Disney", asset_type="stock", coingecko_id=None),
]

for asset in assets:    # Check if the asset already exists in the database
    existing = db.query(Asset).filter(Asset.symbol == asset.symbol).first()
    if not existing:
        db.add(asset)

db.commit()
db.close()

print("Assets seeded successfully!")