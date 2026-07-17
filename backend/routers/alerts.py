from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Asset, Alert

router = APIRouter()


@router.get("/") 
def get_alerts(db: Session = Depends(get_db)):  # Fetch all alerts from the database
    alerts = db.query(Alert).all()              # Return the list of alerts as a JSON response
    return alerts


@router.post("/")
def create_alert(symbol: str, condition: str, target_price: float, db: Session = Depends(get_db)):      # Create a new alert for a specific asset based on the provided symbol, condition, and target price
    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()                              # Fetch the asset by its symbol
    
    if not asset:
        return {"error": "Asset not found"}
    
    alert = Alert(
        asset_id=asset.id,
        condition=condition,
        target_price=target_price,
    )
    db.add(alert)
    db.commit()
    
    return {"message": f"Alert created for {asset.symbol} {condition} ${target_price}"}


@router.delete("/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    
    if not alert:
        return {"error": "Alert not found"}
    
    db.delete(alert)
    db.commit()
    
    return {"message": "Alert deleted"}


@router.get("/triggered")
def get_triggered_alerts(db: Session = Depends(get_db)):
    alerts = db.query(Alert).filter(Alert.is_triggered == True).all()
    return alerts