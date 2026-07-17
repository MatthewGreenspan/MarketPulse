from models import Alert, PriceHistory, Asset
from database import SessionLocal

def check_alerts(db):
    alerts = db.query(Alert).filter(Alert.is_triggered == False).all()

    for alert in alerts:
        latest_price = (
            db.query(PriceHistory)
            .filter(PriceHistory.asset_id == alert.asset_id)
            .order_by(PriceHistory.fetched_at.desc())
            .first()
        )

        if not latest_price:
            continue

        triggered = False

        if alert.condition == "above" and latest_price.price_usd >= alert.target_price:
            triggered = True
        elif alert.condition == "below" and latest_price.price_usd <= alert.target_price:
            triggered = True

        if triggered:
            alert.is_triggered = True
            from datetime import datetime
            alert.triggered_at = datetime.utcnow()
            db.commit()

        print("Alerts Checked")