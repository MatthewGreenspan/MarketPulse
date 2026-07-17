from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles 
from database import engine
import models
from routers import assets, watchlist, alerts
from services.price_fetcher import fetch_and_store_prices
from apscheduler.schedulers.background import BackgroundScheduler


app = FastAPI()

models.Base.metadata.create_all(bind=engine)

app.include_router(assets.router, prefix="/assets", tags=["assets"])                
app.include_router(watchlist.router, prefix="/watchlist", tags=["watchlist"])
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])

app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")

scheduler = BackgroundScheduler()                                                 

@app.on_event("startup")                                                            
def start_scheduler():
    scheduler.add_job(fetch_and_store_prices, "interval", minutes=10)              
    scheduler.start()                                                              

@app.on_event("shutdown")                                                           
def shutdown_scheduler():
    scheduler.shutdown()                                                           