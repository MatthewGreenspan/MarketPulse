from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Asset, Watchlist, PriceHistory

router = APIRouter()


@router.get("/")
def get_watchlist(db: Session = Depends(get_db)):
    watchlist = db.query(Watchlist).all()
    
    result = []
    for item in watchlist:
        asset = db.query(Asset).filter(Asset.id == item.asset_id).first()
        latest_price = (
            db.query(PriceHistory)
            .filter(PriceHistory.asset_id == item.asset_id)
            .order_by(PriceHistory.fetched_at.desc())
            .first()
        )
        
        result.append({
            "id": item.id,
            "symbol": asset.symbol,
            "name": asset.name,
            "price_usd": latest_price.price_usd if latest_price else None,
            "fetched_at": latest_price.fetched_at if latest_price else None,
        })
    
    return result


@router.post("/")
def add_to_watchlist(symbol: str, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()
    
    if not asset:
        return {"error": "Asset not found"}
    
    existing = db.query(Watchlist).filter(Watchlist.asset_id == asset.id).first()
    if existing:
        return {"error": "Asset already in watchlist"}
    
    item = Watchlist(asset_id=asset.id)
    db.add(item)
    db.commit()
    
    return {"message": f"{asset.symbol} added to watchlist"}


@router.delete("/{symbol}")
def remove_from_watchlist(symbol: str, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()
    
    if not asset:
        return {"error": "Asset not found"}
    
    item = db.query(Watchlist).filter(Watchlist.asset_id == asset.id).first()
    if not item:
        return {"error": "Asset not in watchlist"}
    
    db.delete(item)
    db.commit()
    
    return {"message": f"{asset.symbol} removed from watchlist"}