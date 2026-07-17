from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from database import engine
import models
from rate_limit import limiter
from routers import assets, watchlist, alerts, auth
from services.price_fetcher import fetch_crypto_prices_job, fetch_stock_prices_job
from apscheduler.schedulers.background import BackgroundScheduler


app = FastAPI()

# Rate limiting: the shared limiter enforces a 60/minute default on every route.
# SlowAPIMiddleware applies that default app-wide; the exception handler turns a
# breach into an HTTP 429 before the endpoint runs. Auth routes tighten this
# further with their own @limiter.limit decorators.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

models.Base.metadata.create_all(bind=engine)

app.include_router(assets.router, prefix="/assets", tags=["assets"])                
app.include_router(watchlist.router, prefix="/watchlist", tags=["watchlist"])
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])

app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")

scheduler = BackgroundScheduler()                                                 

@app.on_event("startup")
def start_scheduler():
    # Crypto and stocks are scheduled apart because their APIs cost different
    # things: CoinGecko batches all coins into one free request, while Alpha
    # Vantage spends one request per symbol from a small daily quota.
    scheduler.add_job(
        fetch_crypto_prices_job, "interval", minutes=5,
        id="crypto_prices", max_instances=1, coalesce=True,
    )
    scheduler.add_job(
        fetch_stock_prices_job, "interval", minutes=30,
        id="stock_prices", max_instances=1, coalesce=True,
    )
    scheduler.start()

@app.on_event("shutdown")                                                           
def shutdown_scheduler():
    scheduler.shutdown()                                                           