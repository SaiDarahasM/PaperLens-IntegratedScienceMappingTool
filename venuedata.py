from fastapi import HTTPException, APIRouter, Request
from pydantic import BaseModel
import requests
from time import sleep
import spacy
from pymongo import MongoClient

# Load SciSpacy model
nlp = spacy.load("en_core_sci_sm")

router = APIRouter()

# Pydantic model for request body
class SearchRequest(BaseModel):
    topic: str
    year: int
    userId: str  # Add userId to the request body



# Function to extract keywords from user topic
def extract_keywords(text):
    doc = nlp(text.lower())
    noun_chunks = [chunk.text.strip() for chunk in doc.noun_chunks]
    individual_tokens = [
        token.text.strip() for token in doc 
        if token.pos_ in ["NOUN", "VERB"] and not token.is_stop
    ]
    keywords = set(noun_chunks + individual_tokens)

    cleaned_keywords = set()
    for keyword in keywords:
        if not any(keyword in chunk and keyword != chunk for chunk in noun_chunks):
            cleaned_keywords.add(keyword)
    return sorted(list(cleaned_keywords))

# Fetch works from OpenAlex based on refined topic
def fetch_works(refined_query, year, per_page=200):
    OPENALEX_API_URL = f"https://api.openalex.org/works"
    params = {
        "filter": f"title_and_abstract.search:{refined_query},publication_year:{year}",
        "per_page": per_page,
        "cursor": "*"
    }
    all_results = []

    while True:
        response = requests.get(OPENALEX_API_URL, params=params)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Error fetching data from OpenAlex")
        
        data = response.json()
        all_results.extend(data.get("results", []))

        next_cursor = data.get("meta", {}).get("next_cursor")
        if next_cursor:
            params["cursor"] = next_cursor
        else:
            break

        sleep(0.2)

    return all_results

# Batch fetch host organization details for sources
def batch_fetch_host_org_details(source_ids):
    host_org_map = {}
    batch_size = 100
    for i in range(0, len(source_ids), batch_size):
        batch = source_ids[i:i + batch_size]
        openalex_ids = [src_id.split("/")[-1] for src_id in batch]
        filter_query = "|".join(openalex_ids)
        url = f"https://api.openalex.org/sources?filter=openalex_id:{filter_query}"
        response = requests.get(url)
        if response.status_code == 200:
            sources = response.json().get("results", [])
            for source in sources:
                source_id = source.get("id")
                # Handle the case where host_organization is a string (URL)
                host_org_id = source.get("host_organization", "unknown")
                host_org_name = source.get("host_organization_name", "unknown")
                
                host_org_map[source_id] = {
                    "host_organization_name": host_org_name,
                    "host_organization_id": host_org_id
                }
            sleep(0.1)
        else:
            raise HTTPException(status_code=response.status_code, detail="Error fetching host organization details")
    return host_org_map

# Extract metadata from works
def extract_metadata(works):
    source_ids = list({
        work["primary_location"]["source"]["id"]
        for work in works 
        if work.get("primary_location") and work["primary_location"].get("source")
    })
    
    # Fetch host organization details (name and ID)
    host_org_map = batch_fetch_host_org_details(source_ids)
    
    metadata = []
    for work in works:
        primary_location = work.get("primary_location", {}) or {}
        source = primary_location.get("source", {}) or {}

        source_id = source.get("id")
        host_org_details = host_org_map.get(source_id, {"host_organization_name": "Unknown", "host_organization_id": "Unknown"})

        # Extract type field
        work_type = (
            work.get("type") or  # Check the top-level "type" field
            primary_location.get("type") or  # Check "type" in primary_location
            source.get("type") or  # Check "type" in source
            "unknown"  # Fallback value
        )

        metadata.append({
            "id": work.get("id"),
            "is_oa": work.get("open_access", {}).get("is_oa", False),
            "oa_status": work.get("open_access", {}).get("oa_status", "unknown"),
            "venue": source.get("display_name", "unknown"),
            "venue_id": source_id or "unknown",
            "host_organization_name": host_org_details["host_organization_name"],
            "host_organization_id": host_org_details["host_organization_id"],
            "type": work_type,
            "publication_date": work.get("publication_date", "unknown"),
        })
    return metadata

# Clean metadata by removing entries with unknown venue and host organization name
def clean_metadata(metadata):
    initial_count = len(metadata)
    cleaned_metadata = [
        entry for entry in metadata
        if not (entry["venue"] == "unknown" and entry["host_organization_name"] == "Unknown")
    ]
    final_count = len(cleaned_metadata)
    print(f"Total papers before cleaning: {initial_count}")
    print(f"Total papers after cleaning: {final_count}")
    return cleaned_metadata

# Save metadata to MongoDB
async def save_to_mongodb(userId, topic, year, metadata,request:Request):
    document = {
        "userId": userId,
        "topic": topic,
        "year": year,
        "metadata": metadata
    }
    collection = request.app.state.collection2
    await collection.update_one(
        {"userId": userId, "topic": topic, "year": year},
        {"$set": document},
        upsert=True
    )
    print(f"Data saved to MongoDB for userId: {userId}, topic: {topic}, year: {year}")

# FastAPI endpoint
@router.post("/search/")
async def search(data:SearchRequest,request: Request):
    userId = data.userId
    topic = data.topic
    year = data.year

    # Extract keywords and refine query
    keywords = extract_keywords(topic)
    refined_query = "+".join(keywords)
    print(f"Using refined search query: {refined_query}")

    # Fetch works from OpenAlex
    works = fetch_works(refined_query, year)
    if not works:
        raise HTTPException(status_code=404, detail="No works found for the given query")

    # Extract metadata
    metadata = extract_metadata(works)

    # Clean metadata
    cleaned_metadata = clean_metadata(metadata)

    # Save metadata to MongoDB
    await save_to_mongodb(userId, topic, year, cleaned_metadata,request)

    # Return metadata as JSON response
    return {"message": f"Data saved to MongoDB for userId: {userId}, topic: {topic}, year: {year}", "metadata": cleaned_metadata}

@router.post("/check-data-exists-venue/")
async def check_data_exists(request_data: SearchRequest, request:Request):
    # Create a query to check if the data exists
    query = {
        "userId": request_data.userId,
        "topic": request_data.topic
    }
    
    # Add year to query if it's provided
    if request_data.year:
        query["year"] = request_data.year
    
    collection = request.app.state.collection2
    # Check if a document matching the query exists
    document = await collection.find_one(query)  # Await the async operation
    
    # Return result
    return {
        "exists": document is not None,
        "message": "Data found" if document else "Data not found"
    }
    

