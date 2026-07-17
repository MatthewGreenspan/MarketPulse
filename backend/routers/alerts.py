from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Asset, Alert, User
from dependencies import get_current_user

router = APIRouter()

@router.get("/") 
def get_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alerts = db.query(Alert).filter(Alert.user_id == current_user.id).all()
    return alerts

@router.post("/")
def create_alert(symbol: str, condition: str, target_price: float, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
def delete_alert(alert_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.user_id == current_user.id).first()
    
    if not alert:
        return {"error": "Alert not found"}
    
    db.delete(alert)
    db.commit()
    
    return {"message": "Alert deleted"}

@router.get("/triggered")
def get_triggered_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alerts = db.query(Alert).filter(Alert.is_triggered == True, Alert.user_id == current_user.id).all()
    return alerts