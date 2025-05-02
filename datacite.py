import spacy
import requests
from time import sleep
from tqdm import tqdm
from fastapi import  HTTPException
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from fastapi import  APIRouter, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import json
# Load spaCy model
nlp = spacy.load("en_core_sci_sm")
templates = Jinja2Templates(directory="templates")
# Constants
OPENALEX_API_URL = "https://api.openalex.org/works"
PER_PAGE = 100
REQUEST_DELAY = 0.5
MAX_RESULTS = 1000


router = APIRouter()


# Pydantic Models
class CitationAnalysisRequest(BaseModel):
    userId: str
    topic: str
    year: int
    

    

# 1. Keyword Extraction
def extract_keywords(text):
    doc = nlp(text.lower())
    noun_chunks = [chunk.text for chunk in doc.noun_chunks]
    individual_tokens = [token.text for token in doc if token.pos_ in ["NOUN", "VERB"] and not token.is_stop]
    keywords = set(noun_chunks + individual_tokens)

    cleaned_keywords = set()
    for keyword in keywords:
        if not any(keyword in chunk for chunk in noun_chunks if keyword != chunk):
            cleaned_keywords.add(keyword)
    return sorted(list(cleaned_keywords))

# 2. Citation Batch Fetching
def fetch_citing_papers_for_batch(paper_ids):
    citing_map = {pid: [] for pid in paper_ids}
    batch_size = 100

    def fetch_batch(batch_ids):
        filter_query = "|".join(batch_ids)
        cursor = "*"
        local_citing_map = {pid: [] for pid in batch_ids}

        while True:
            params = {
                "filter": f"cites:{filter_query}",
                "per_page": 200,
                "cursor": cursor
            }

            try:
                response = requests.get(OPENALEX_API_URL, params=params)
                if response.status_code != 200:
                    print(f"❌ Error while fetching citing papers: {response.status_code}")
                    break

                data = response.json()
                for citing_work in data.get("results", []):
                    refs = citing_work.get("referenced_works", [])
                    for ref_id in refs:
                        if ref_id in local_citing_map:
                            local_citing_map[ref_id].append(citing_work["id"])

                next_cursor = data.get("meta", {}).get("next_cursor")
                if not next_cursor:
                    break
                cursor = next_cursor
                sleep(REQUEST_DELAY)

            except Exception as e:
                print(f"❌ Exception: {e}")
                break

        return local_citing_map

    print("\n🔗 Fetching citing papers for all topic papers...")
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = []
        for i in range(0, len(paper_ids), batch_size):
            batch_ids = paper_ids[i:i + batch_size]
            futures.append(executor.submit(fetch_batch, batch_ids))

        for future in tqdm(futures, desc="ParallelGroup"):
            local_citing_map = future.result()
            citing_map.update(local_citing_map)

    return citing_map

# 3. Fetch topic papers
def fetch_papers_with_citations(keywords, year, concept_threshold=0.8, max_results=MAX_RESULTS):
    query = " + ".join(keywords)
    print(f"\n🔍 Final OpenAlex Query: {query}")
    params = {
        "filter": f"title_and_abstract.search:{query},publication_year:{year}",
        "per_page": PER_PAGE,
        "cursor": "*"
    }

    all_papers = []
    paper_id_map = {}
    print("\n🚀 Fetching topic papers from OpenAlex...")

    while len(all_papers) < max_results:
        response = requests.get(OPENALEX_API_URL, params=params)
        if response.status_code != 200:
            print(f"❌ Error: {response.status_code}")
            break

        data = response.json()
        results = data.get("results", [])

        for paper in tqdm(results, desc="📄 Collecting papers"):
            paper_id = paper.get("id", "")
            concepts = [
                c["display_name"]
                for c in paper.get("concepts", [])
                if c.get("score", 0) >= concept_threshold
            ]

            paper_data = {
                "id": paper_id,
                "title": paper.get("title", "No title"),
                "cited_by_count": paper.get("cited_by_count", 0),
                "publication_date": paper.get("publication_date", ""),
                "referenced_works": paper.get("referenced_works", []),
                "concepts": concepts,
                "cited_by_ids": []  # to be filled later
            }
            paper_id_map[paper_id] = paper_data
            all_papers.append(paper_data)

        next_cursor = data.get("meta", {}).get("next_cursor")
        if not next_cursor:
            break

        params["cursor"] = next_cursor
        sleep(REQUEST_DELAY)

    all_ids = list(paper_id_map.keys())
    citing_map = fetch_citing_papers_for_batch(all_ids)

    for pid, citing_ids in citing_map.items():
        paper_id_map[pid]["cited_by_ids"] = citing_ids

    cleaned_papers = []
    for paper in all_papers:
        if paper.get("referenced_works") or paper.get("cited_by_ids"):
            cleaned_papers.append(paper)

    print(f"\n🧹 Removed {len(all_papers) - len(cleaned_papers)} papers without references or citations.")
    return cleaned_papers[:max_results]

# 4. Save to MongoDB
async def save_to_mongodb(userId, topic, year, papers , request:Request):
    metadata = {
        "userId": userId,
        "topic": topic,
        "year": year,
        "scraped_on": datetime.utcnow().isoformat() + "Z",
        "papers": papers
    }
    collection = request.app.state.collection1
    result = await collection.insert_one(metadata)
    print(f"\n✅ Saved metadata to MongoDB with ID: {result.inserted_id}")
    return str(result.inserted_id)

# 5. FastAPI Endpoints
@router.post("/save")
async def save_data( data_request:CitationAnalysisRequest , saveRequest: Request):
    userId = data_request.userId
    topic = data_request.topic
    year = data_request.year

    keywords = extract_keywords(topic)
    print("\n🔑 Extracted Keywords:")
    print(keywords)

    if not keywords:
        raise HTTPException(status_code=400, detail="No keywords extracted. Please provide a valid topic.")

    papers = fetch_papers_with_citations(keywords, year)
    if not papers:
        raise HTTPException(status_code=404, detail="No papers retrieved for the given topic and year.")

    document_id = await save_to_mongodb(userId, topic, year, papers ,saveRequest)
    return {"message": "Data saved successfully!", "document_id": document_id}

# NEW ENDPOINT: Get citation data from MongoDB
# @router.post("/citation-data",response_class=HTMLResponse)
# async def get_citation_data(data_request:CitationAnalysisRequest , saveRequest: Request):
#     # Build the query based on provided parameters
#     query = {"userId": data_request.userId}
    
#     if data_request.topic:
#         query["topic"] = data_request.topic
    
#     if data_request.year:
#         query["year"] = data_request.year
    
#     collection = saveRequest.app.state.collection1
#     result = await collection.find_one(
#         query,
#         sort=[("scraped_on", 1)]  # Sort by scraped_on in descending order to get the most recent
#     )
    
#     if not result:
#         raise HTTPException(status_code=404, detail="No data found for the specified criteria")
    
#     # Convert ObjectId to string for JSON serialization
#     result["_id"] = str(result["_id"])
    
#     data =  result["papers"]
#     data_json = json.dumps(data)
#     print(" i am here")
#     return  templates.TemplateResponse("gra.html", {"request": saveRequest,"data":data_json})


@router.get("/citation-data", response_class=HTMLResponse)
async def get_citation_data(request: Request):
    # Extract query parameters
    user_id = request.query_params.get("userId")
    topic = request.query_params.get("topic")
    year = request.query_params.get("year")

    if not user_id or not topic or not year:
        raise HTTPException(status_code=400, detail="Missing required query parameters.")

    # Build the query based on provided parameters
    query = {"userId": user_id, "topic": topic, "year": int(year)}

    collection = request.app.state.collection1
    result = await collection.find_one(
        query,
        sort=[("scraped_on", -1)]  # Sort by scraped_on in descending order to get the most recent
    )

    if not result:
        raise HTTPException(status_code=404, detail="No data found for the specified criteria")

    # Convert ObjectId to string for JSON serialization
    result["_id"] = str(result["_id"])

    data = result["papers"]
    if not data:
        raise HTTPException(status_code=404, detail="No papers found in the database.")

    data_json = json.dumps(data)
    

    return templates.TemplateResponse("gra.html", {"request": request, "data": data_json})

@router.post("/check-data-exists-citation/")
async def check_data_exists(data_request: CitationAnalysisRequest, saveRequest: Request):
    # Build the query based on provided parameters
    query = {
        "userId": data_request.userId,
        "topic": data_request.topic,
        "year": data_request.year
    }
    
    # Access the MongoDB collection from the app state
    collection = saveRequest.app.state.collection1
    
    # Check if a document matching the query exists
    document = await collection.find_one(query)
    
    # Return the result
    if document:
        return {
            "exists": True,
            "message": "Data found for the given userId, topic, and year."
        }
    else:
        return {
            "exists": False,
            "message": "No data found for the given userId, topic, and year."
        }