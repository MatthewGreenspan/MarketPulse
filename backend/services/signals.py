from sqlalchemy.orm import Session
from models import PriceHistory


def compute_rsi(prices: list, period: int = 14) -> float | None:
    """
    Compute RSI from a price list (newest-first).
    Requires at least period + 1 data points.
    """
    if len(prices) < period + 1:
        return None

    # Reverse to oldest-first for change calculation
    prices_asc = list(reversed(prices))
    changes = [prices_asc[i] - prices_asc[i - 1] for i in range(1, len(prices_asc))]

    # Use only the most recent `period` changes
    changes = changes[-period:]

    gains = [c for c in changes if c > 0]
    losses = [abs(c) for c in changes if c < 0]

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    if avg_gain == 0 and avg_loss == 0:
        return None  # Flat price — RSI is undefined, not overbought
    if avg_loss == 0:
        return 100.0  # Gains with no losses — fully overbought

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_signals(asset_id, db: Session) -> dict | None:
    """
    Compute trading signals for an asset using the last 7 days of price history.

    Signals:
      - moving_avg_7d:  average price over the last 7 days
      - recent_high_7d: highest price in the last 7 days
      - pct_below_high: how far (%) current price sits below the recent high
      - rsi_14:         14-period RSI (< 30 oversold, > 70 overbought)
      - suggested_entry: price level worth considering as an entry point
      - signal:         "oversold" | "dip" | "neutral" | "overbought"

    Returns None if there is insufficient history (< 15 data points).
    """
    rows = (
        db.query(PriceHistory)
        .filter(PriceHistory.asset_id == asset_id)
        .order_by(PriceHistory.fetched_at.desc())
        .limit(2016)  # ~7 days at 5-min intervals
        .all()
    )

    if not rows:
        return None

    prices = [r.price_usd for r in rows]
    current_price = prices[0]

    # 7-day moving average
    moving_avg_7d = sum(prices) / len(prices)

    # % below the 7-day high
    recent_high = max(prices)
    pct_below_high = (
        (recent_high - current_price) / recent_high * 100
        if recent_high
        else None
    )

    # RSI (14-period)
    rsi = compute_rsi(prices, period=14)

    # Signal classification
    # rsi is None when price is flat (e.g. stocks outside market hours) — skip RSI signals
    if rsi is not None and rsi < 30:
        signal = "oversold"           # Classic buy signal — price beaten down
        suggested_entry = current_price
    elif rsi is not None and rsi > 70:
        signal = "overbought"         # Caution — may be due for a pullback
        suggested_entry = round(moving_avg_7d * 0.97, 6)
    elif current_price < moving_avg_7d * 0.97:
        signal = "dip"                # Trading 3%+ below 7d average — potential entry
        suggested_entry = current_price
    elif rsi is None:
        signal = "no_data"            # Flat price history — market likely closed
        suggested_entry = None
    else:
        signal = "neutral"            # No strong signal
        suggested_entry = round(moving_avg_7d * 0.97, 6)  # Wait for a 3% dip from MA

    return {
        "current_price": round(current_price, 6),
        "moving_avg_7d": round(moving_avg_7d, 6),
        "recent_high_7d": round(recent_high, 6),
        "pct_below_high": round(pct_below_high, 2) if pct_below_high is not None else None,
        "rsi_14": round(rsi, 2) if rsi is not None else None,
        "suggested_entry": suggested_entry,
        "signal": signal,
        "data_points": len(prices),
    }
