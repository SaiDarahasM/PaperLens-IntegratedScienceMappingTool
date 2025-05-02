from fastapi import FastAPI, HTTPException, APIRouter, Request
from fastapi.responses import HTMLResponse
import uvicorn
from dataApi import router as dataAPI_router
from TrendAnalysis import router as trend_analysis_process
from datacite import router as citation_analysis_process
from fastapi.middleware.cors import CORSMiddleware
from dbconnect import db_Connect 
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from venuAnalysis import router as venue_analysis_process
from venuedata import router as venuedata_router



# Initialize FastAPI app
app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

templates = Jinja2Templates(directory="templates")
templates.env.auto_reload = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development - restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




# # Include routers
app.include_router(dataAPI_router)
app.include_router(trend_analysis_process)
app.include_router(citation_analysis_process)
app.include_router(venue_analysis_process)
app.include_router(venuedata_router)


collection,collection1,collection2 = db_Connect()
app.state.collection =  collection
app.state.collection1 =  collection1
app.state.collection2 =  collection2




# Root endpoint
@app.get("/")
async def root():
    return {"message": "Welcome to the Science Mapping Tool!"}



@app.get("/home", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("homepage.html", {"request": request})

@app.get("/login", response_class=HTMLResponse)
async def login(request: Request):
    return templates.TemplateResponse("loginpage.html", {"request": request})

@app.get("/contact", response_class=HTMLResponse)
async def login(request: Request):
    return templates.TemplateResponse("contactBoard.html", {"request": request})

@app.get("/feedback", response_class=HTMLResponse)
async def login(request: Request):
    return templates.TemplateResponse("feedback.html", {"request": request})


# uvicorn app:app --host 0.0.0.0 --port 3000 --reload

