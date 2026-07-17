from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Asset, PriceHistory

router = APIRouter()
@router.get("/")
def get_assets(db: Session = Depends(get_db)):
    assets = db.query(Asset).all()
    return assets

@router.get("/{symbol}/prices")
def get_prices(symbol: str, limit: int = 48, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()

    if not asset:
        return {"error": "Asset not found"}
    
    prices = (
        db.query(PriceHistory)
        .filter(PriceHistory.asset_id == asset.id)
        .order_by(PriceHistory.fetched_at.desc())
        .limit(limit)
        .all()
    )
    return prices