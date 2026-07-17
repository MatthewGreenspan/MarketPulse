from database import SessionLocal
from models import Asset

db = SessionLocal()

assets = [
    Asset(symbol="BTC", name="Bitcoin", asset_type="crypto", coingecko_id="bitcoin"),
    Asset(symbol="ETH", name="Ethereum", asset_type="crypto", coingecko_id="ethereum"),
    Asset(symbol="SOL", name="Solana", asset_type="crypto", coingecko_id="solana"),
    Asset(symbol="ADA", name="Cardano", asset_type="crypto", coingecko_id="cardano"),
    Asset(symbol="LINK", name="Chainlink", asset_type="crypto", coingecko_id="chainlink"),
    Asset(symbol="AAPL", name="Apple Inc.", asset_type="stock", coingecko_id=None),
    Asset(symbol="MSFT", name="Microsoft", asset_type="stock", coingecko_id=None),
    Asset(symbol="GOOGL", name="Alphabet", asset_type="stock", coingecko_id=None),
    Asset(symbol="AMZN", name="Amazon", asset_type="stock", coingecko_id=None),
    Asset(symbol="NVDA", name="Nvidia", asset_type="stock", coingecko_id=None),
]

for asset in assets:    # Check if the asset already exists in the database
    existing = db.query(Asset).filter(Asset.symbol == asset.symbol).first()
    if not existing:
        db.add(asset)

db.commit()
db.close()

print("Assets seeded successfully!")