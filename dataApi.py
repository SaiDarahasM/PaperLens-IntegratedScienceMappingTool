from fastapi import FastAPI, HTTPException, APIRouter, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import requests
import spacy
import time
import torch
from transformers import AutoTokenizer
from adapters import AutoAdapterModel
from typing import Optional

router = APIRouter()


# Load spaCy model
nlp = spacy.load("en_core_sci_sm")

# Pydantic models for request/response
class ResearchQuery(BaseModel):
    userId: str  # User ID
    topic: str   # Research topic
    year: str    # Year of publication


class PaperMetadata(BaseModel):
    paperId: str
    title: str
    abstract: str
    citationCount: int
    influentialCitationCount: int
    publicationDate: str
    url: str


# Extract keywords from the research topic
def extract_keywords(text):
    doc = nlp(text.lower())  # Normalize to lowercase

    # Step 1: Extract noun chunks (compound phrases)
    noun_chunks = [chunk.text for chunk in doc.noun_chunks]

    # Step 2: Extract individual tokens (nouns and verbs)
    individual_tokens = [
        token.text
        for token in doc
        if token.pos_ in ["NOUN", "VERB"] and not token.is_stop
    ]

    # Step 3: Combine noun chunks and individual tokens
    keywords = set(noun_chunks + individual_tokens)
    cleaned_keywords = set()
    for keyword in keywords:
        # Check if the keyword is part of any larger noun chunk
        if not any(keyword in chunk for chunk in noun_chunks if keyword != chunk):
            cleaned_keywords.add(keyword)

    return sorted(list(cleaned_keywords))


# Construct query based on keywords
def construct_query(keywords):
    query = " + ".join(keywords)
    return query


# Fetch Paper IDs using Semantic Scholar Bulk Search API
def fetch_paper_ids(query, year):
    search_url = "https://api.semanticscholar.org/graph/v1/paper/search/bulk"
    search_params = {
        "query": query,
        "year": year,
        "fields": "paperId",
    }
    response = requests.get(search_url, params=search_params)

    if response.status_code == 200:
        data = response.json()
        papers = data.get("data", [])
        paper_ids = [paper["paperId"] for paper in papers]
        return paper_ids
    else:
        raise HTTPException(status_code=response.status_code, detail="Error fetching paper IDs")


# Fetch metadata using Semantic Scholar Graph API
def fetch_metadata(batch_ids):
    graph_url = "https://api.semanticscholar.org/graph/v1/paper/batch"
    metadata_params = {
        "fields": "title,abstract,citationCount,influentialCitationCount,publicationDate,url"
    }

    attempt = 0
    max_retries = 20

    while attempt < max_retries:
        response = requests.post(graph_url, json={"ids": batch_ids}, params=metadata_params)

        if response.status_code == 200:
            return response.json()

        elif response.status_code == 429:
            wait_time = 5
            print(f"429 Too Many Requests. Retrying in {wait_time} seconds...")
            time.sleep(wait_time)
            attempt += 1

        else:
            raise HTTPException(status_code=response.status_code, detail="Error fetching metadata")

    raise HTTPException(status_code=500, detail="Max retries reached while fetching metadata")


# Clean and process metadata using SPECTER2 embeddings
def clean_and_process_metadata(metadata_list):
    # Load tokenizer and base model
    tokenizer = AutoTokenizer.from_pretrained("allenai/specter2_base")
    model = AutoAdapterModel.from_pretrained("allenai/specter2_base")

    # Load and activate the proximity adapter
    model.load_adapter("allenai/specter2", source="hf", load_as="proximity", set_active=True)

    # Move model to GPU if available
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    cleaned_metadata = []
    invalid_papers = []

    for paper in metadata_list:
        paper_id = paper.get("paperId")
        title = paper.get("title")
        abstract = paper.get("abstract")

        # Case 1: Paper lacks sufficient content (title + abstract or just abstract)
        if not (title and abstract) and not abstract:
            invalid_papers.append(paper_id)
            continue

        # Prepare text for embedding generation
        text = title + tokenizer.sep_token + abstract if title and abstract else abstract

        # Tokenize and encode
        inputs = tokenizer(text, padding=True, truncation=True, return_tensors="pt", max_length=512)
        inputs = {k: v.to(device) for k, v in inputs.items()}  # Move inputs to device

        with torch.no_grad():
            output = model(**inputs)
            embedding = output.last_hidden_state[:, 0, :].cpu().numpy().tolist()

        # Add embedding to the paper metadata
        paper["embedding"] = {"model": "specter2_proximity", "vector": embedding}

        # Add the cleaned paper to the list
        cleaned_metadata.append(paper)

    return cleaned_metadata, invalid_papers


# Save metadata to MongoDB under username and topic
async def save_to_mongodb(userId: str, topic: str, year:str , metadata_list, request:Request):
    # Create or update the document for the user-topic combination
    collection = request.app.state.collection
    
    await collection.update_one(
        {"userId": userId, "topic": topic ,"year": year},  # Filter by user and topic
        {"$set": {"papers": metadata_list}},  # Update the papers field
        upsert=True  # Create the document if it doesn't exist
    )

    print(f"Saved {len(metadata_list)} papers for user '{userId}' and topic '{topic}'")


@router.get("/test")
def greet():
    return {
        "message":"helllo jessi"
    }


# Endpoint to process user input and fetch data
@router.post("/analyze")
async def analyze(query: ResearchQuery,requests:Request):
    # Extract keywords and construct query
    keywords = extract_keywords(query.topic)
    refined_query = construct_query(keywords)

    print(f"\n🔍 Refined Query: {refined_query}")

    # Fetch paper IDs
    paper_ids = fetch_paper_ids(refined_query, query.year)
    print(f"\nFound {len(paper_ids)} papers for '{query.topic}' in {query.year}\n")

    # Fetch metadata in batches
    metadata_list = []
    batch_size = 100

    for i in range(0, len(paper_ids), batch_size):
        batch_ids = paper_ids[i : i + batch_size]
        metadata = fetch_metadata(batch_ids)
        metadata_list.extend(metadata)
        print(f"Retrieved {len(batch_ids)} papers' metadata...")

    # Clean and process metadata
    cleaned_metadata, invalid_papers = clean_and_process_metadata(metadata_list)

    # Save cleaned metadata to MongoDB under the username and topic
    await save_to_mongodb(query.userId, query.topic, query.year, cleaned_metadata,requests )

    return {
        "message": f"Processed {len(cleaned_metadata)} papers and cleaned data.",
        "invalid_papers_removed": len(invalid_papers),
    }



# Pydantic model for request data
class CheckDataRequest(BaseModel):
    userId: str
    topic: str
    year: Optional[str] = None

# Endpoint to check if the combination of userId, topic, and year exists

@router.post("/check-data-exists/")
async def check_data_exists(request_data: CheckDataRequest, request:Request):
    # Create a query to check if the data exists
    query = {
        "userId": request_data.userId,
        "topic": request_data.topic
    }
    
    # Add year to query if it's provided
    if request_data.year:
        query["year"] = request_data.year
    
    collection = request.app.state.collection
    # Check if a document matching the query exists
    document = await collection.find_one(query)  # Await the async operation
    
    # Return result
    return {
        "exists": document is not None,
        "message": "Data found" if document else "Data not found"
    }
    
