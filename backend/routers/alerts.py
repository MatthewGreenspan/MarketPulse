from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Asset, Alert, User
from dependencies import get_current_user

router = APIRouter()

def serialize_alert(alert: Alert, asset: Asset | None) -> dict:
    return {
        "id": alert.id,
        "asset_id": alert.asset_id,
        "symbol": asset.symbol if asset else None,
        "name": asset.name if asset else None,
        "condition": alert.condition,
        "target_price": alert.target_price,
        "is_triggered": alert.is_triggered,
        "triggered_at": alert.triggered_at,
        "created_at": alert.created_at,
    }


def with_assets(alerts: list[Alert], db: Session) -> list[dict]:
    if not alerts:
        return []
    asset_ids = {alert.asset_id for alert in alerts}
    assets = db.query(Asset).filter(Asset.id.in_(asset_ids)).all()
    by_id = {asset.id: asset for asset in assets}
    return [serialize_alert(alert, by_id.get(alert.asset_id)) for alert in alerts]


@router.get("/")
def get_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alerts = db.query(Alert).filter(Alert.user_id == current_user.id).all()
    return with_assets(alerts, db)

@router.post("/")
def create_alert(symbol: str, condition: str, target_price: float, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if condition not in ("above", "below"):
        raise HTTPException(status_code=400, detail="condition must be 'above' or 'below'")
    if target_price <= 0:
        raise HTTPException(status_code=400, detail="target_price must be positive")

    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()

    if not asset:
        return {"error": "Asset not found"}

    alert = Alert(
        asset_id=asset.id,
        user_id=current_user.id,
        condition=condition,
        target_price=target_price,
    )
    db.add(alert)
    db.commit()
    
    return {"message": f"Alert created for {asset.symbol} {condition} ${target_price}"}

@router.delete("/{alert_id}")
def delete_alert(alert_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.user_id == current_user.id).first()
    
    if not alert:
        return {"error": "Alert not found"}
    
    db.delete(alert)
    db.commit()
    
    return {"message": "Alert deleted"}

@router.get("/triggered")
def get_triggered_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alerts = db.query(Alert).filter(Alert.is_triggered == True, Alert.user_id == current_user.id).all()
    return with_assets(alerts, db)