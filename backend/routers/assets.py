from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Asset, PriceHistory
from services.signals import compute_signals

router = APIRouter()
@router.get("/")
def get_assets(db: Session = Depends(get_db)):
    assets = db.query(Asset).all()
    return assets

@router.get("/summary")
def get_asset_summary(db: Session = Depends(get_db)):
    assets = db.query(Asset).order_by(Asset.id).all()
    result = []
    for asset in assets:
        rows = (
            db.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset.id)
            .order_by(PriceHistory.fetched_at.desc())
            .all()
        )
        if not rows:
            result.append({
                "symbol": asset.symbol,
                "name": asset.name,
                "asset_type": asset.asset_type,
                "price_usd": None,
                "change_pct_24h": None,
                "volume_24h": None,
                "fetched_at": None,
            })
            continue

        latest = rows[0]
        change_pct = None
        cutoff = latest.fetched_at - timedelta(hours=24)
        # rows are newest-first; the first row at/older than the cutoff is the
        # closest one to 24h ago. No such row -> not enough history -> null.
        reference = next((row for row in rows if row.fetched_at <= cutoff), None)
        if reference is not None and reference.price_usd:
            change_pct = (latest.price_usd - reference.price_usd) / reference.price_usd * 100

        result.append({
            "symbol": asset.symbol,
            "name": asset.name,
            "asset_type": asset.asset_type,
            "price_usd": latest.price_usd,
            "change_pct_24h": change_pct,
            "volume_24h": latest.volume_24h,
            "fetched_at": latest.fetched_at,
        })
    return result

@router.get("/signals")
def get_all_signals(db: Session = Depends(get_db)):
    """Return trading signals for all assets."""
    assets = db.query(Asset).order_by(Asset.id).all()
    result = []
    for asset in assets:
        signals = compute_signals(asset.id, db)
        result.append({
            "symbol": asset.symbol,
            "name": asset.name,
            "asset_type": asset.asset_type,
            **(signals if signals else {"signal": None, "reason": "insufficient_data"}),
        })
    return result


@router.get("/{symbol}/signals")
def get_signals(symbol: str, db: Session = Depends(get_db)):
    """Return trading signals for a specific asset."""
    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    signals = compute_signals(asset.id, db)
    if signals is None:
        return {"symbol": asset.symbol, "signal": None, "reason": "insufficient_data"}
    return {"symbol": asset.symbol, "name": asset.name, **signals}


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