import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
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

# CORS is only needed for a split deploy (frontend on a different origin than the
# API). The bundled deploy serves the frontend from this same app, so it needs
# nothing. Set FRONTEND_ORIGIN (comma-separated for multiple) to lock the API to
# that origin; unset means same-origin only. Added last so it wraps outermost and
# error responses still carry CORS headers.
frontend_origin = os.getenv("FRONTEND_ORIGIN")
if frontend_origin:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in frontend_origin.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

models.Base.metadata.create_all(bind=engine)

app.include_router(assets.router, prefix="/assets", tags=["assets"])                
app.include_router(watchlist.router, prefix="/watchlist", tags=["watchlist"])
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])

app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")

scheduler = BackgroundScheduler()                                                 

@app.on_event("startup")
def start_scheduler():
    # Two jobs so a slow/failed stock fetch never blocks the crypto refresh.
    # Neither provider has a per-request cap we need to protect: CoinGecko
    # batches all coins into one request, and yfinance is unmetered — so both
    # run on the same short cadence.
    scheduler.add_job(
        fetch_crypto_prices_job, "interval", minutes=5,
        id="crypto_prices", max_instances=1, coalesce=True,
    )
    scheduler.add_job(
        fetch_stock_prices_job, "interval", minutes=5,
        id="stock_prices", max_instances=1, coalesce=True,
    )
    scheduler.start()

@app.on_event("shutdown")                                                           
def shutdown_scheduler():
    scheduler.shutdown()                                                           