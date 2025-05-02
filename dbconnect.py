from dotenv import load_dotenv
import os
from motor.motor_asyncio import AsyncIOMotorClient
load_dotenv()


def db_Connect():
    MONGO_URI = os.getenv("MONGO_URI")
    DATABASE_NAME = "PaperLens_Db"
    COLLECTION_NAME = "Trend_Analysis_Data"
    COLLECTION_NAME1 = "Citation_Analysis_Data"
    COLLECTION_NAME2 = "Venue_Analysis_Data"
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DATABASE_NAME]
    collection = db[COLLECTION_NAME]
    collection1 = db[COLLECTION_NAME1]
    collection2 = db[COLLECTION_NAME2]
    return collection,collection1,collection2



    
    