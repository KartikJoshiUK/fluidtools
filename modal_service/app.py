"""
FluidTools Embedding Service - Modal Deployment

This service provides embedding-based semantic search for tool selection.
It uses sentence-transformers for local embedding generation and Qdrant
for vector storage.
"""

import modal
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

# Define Modal app
app = modal.App("fluidtools-embeddings")

# Create Modal image with all dependencies
image = (
    modal.Image.debian_slim()
    .pip_install(
        "sentence-transformers==3.0.1",
        "qdrant-client==1.7.0",
        "fastapi==0.104.1",
        "pydantic==2.5.0"
    )
)

# Request/Response models
class Tool(BaseModel):
    name: str
    description: str
    parameters: Optional[Dict[str, Any]] = None


class IndexRequest(BaseModel):
    session_id: str
    tools: List[Tool]


class IndexResponse(BaseModel):
    indexed_count: int
    session_id: str


class SearchRequest(BaseModel):
    session_id: str
    query: str
    top_k: int = 15


class SearchResult(BaseModel):
    name: str
    score: float


class SearchResponse(BaseModel):
    tools: List[SearchResult]


class DeleteResponse(BaseModel):
    deleted: bool


@app.cls(
    image=image,
    cpu=1.0,  # Use 1 CPU (cheapest option)
    memory=1024,  # 1GB RAM (minimum for sentence-transformers)
    container_idle_timeout=300,  # Keep container alive for 5 minutes
)
class EmbeddingService:
    """
    Modal service class for embedding generation and semantic search.
    
    The model is loaded once when the container starts and reused across
    requests for efficiency.
    """
    
    @modal.enter()
    def load_model(self):
        """Load the sentence-transformers model and initialize Qdrant on container startup."""
        from sentence_transformers import SentenceTransformer
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams
        import os
        
        print("Loading sentence-transformers model...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.dimension = 384  # all-MiniLM-L6-v2 embedding dimension
        print(f"Model loaded successfully. Embedding dimension: {self.dimension}")
        
        # Check for Qdrant Cloud configuration
        qdrant_url = os.environ.get("QDRANT_URL")
        qdrant_api_key = os.environ.get("QDRANT_API_KEY")
        
        if qdrant_url and qdrant_api_key:
            print(f"Initializing Qdrant Cloud client: {qdrant_url}")
            self.qdrant = QdrantClient(
                url=qdrant_url,
                api_key=qdrant_api_key,
            )
            print("Qdrant Cloud client initialized successfully")
        else:
            print("Initializing Qdrant client (in-memory)...")
            self.qdrant = QdrantClient(":memory:")
            print("Qdrant client initialized successfully (in-memory mode)")
    
    @modal.method()
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text string.
        
        Args:
            text: Input text to embed
            
        Returns:
            List of floats representing the embedding vector
        """
        embedding = self.model.encode(text)
        return embedding.tolist()
    
    @modal.method()
    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in batch.
        
        Args:
            texts: List of input texts to embed
            
        Returns:
            List of embedding vectors
        """
        embeddings = self.model.encode(texts)
        return [emb.tolist() for emb in embeddings]
    
    @modal.method()
    def create_collection(self, session_id: str) -> bool:
        """
        Create a Qdrant collection for a session.
        
        Args:
            session_id: Unique session identifier
            
        Returns:
            True if collection created successfully
        """
        from qdrant_client.models import Distance, VectorParams
        
        collection_name = f"tools_{session_id}"
        
        try:
            # Check if collection already exists
            collections = self.qdrant.get_collections().collections
            if any(c.name == collection_name for c in collections):
                print(f"Collection {collection_name} already exists, deleting...")
                self.qdrant.delete_collection(collection_name)
            
            # Create new collection
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=self.dimension,
                    distance=Distance.COSINE
                )
            )
            print(f"Created collection: {collection_name}")
            return True
        except Exception as e:
            print(f"Error creating collection: {e}")
            raise
    
    @modal.method()
    def delete_collection(self, session_id: str) -> bool:
        """
        Delete a Qdrant collection for a session.
        
        Args:
            session_id: Unique session identifier
            
        Returns:
            True if collection deleted successfully
        """
        collection_name = f"tools_{session_id}"
        
        try:
            self.qdrant.delete_collection(collection_name)
            print(f"Deleted collection: {collection_name}")
            return True
        except Exception as e:
            print(f"Error deleting collection: {e}")
            # Don't raise - collection might not exist
            return False
    
    @modal.method()
    def insert_points(self, session_id: str, tools: List[Tool]) -> int:
        """
        Insert tool embeddings into Qdrant collection.
        
        Args:
            session_id: Unique session identifier
            tools: List of tools to index
            
        Returns:
            Number of points inserted
        """
        from qdrant_client.models import PointStruct
        
        collection_name = f"tools_{session_id}"
        
        # Generate embeddings for all tools
        texts = []
        for tool in tools:
            # Combine name and description for embedding
            text = f"{tool.name}: {tool.description}"
            texts.append(text)
        
        embeddings = self.generate_embeddings_batch(texts)
        
        # Create points
        points = []
        for idx, (tool, embedding) in enumerate(zip(tools, embeddings)):
            points.append(PointStruct(
                id=idx,
                vector=embedding,
                payload={"name": tool.name, "description": tool.description}
            ))
        
        # Insert into Qdrant
        self.qdrant.upsert(
            collection_name=collection_name,
            points=points
        )
        
        print(f"Inserted {len(points)} points into {collection_name}")
        return len(points)
    
    @modal.method()
    def search_similar(self, session_id: str, query: str, top_k: int = 15) -> List[SearchResult]:
        """
        Search for similar tools using semantic search.
        
        Args:
            session_id: Unique session identifier
            query: Search query text
            top_k: Number of results to return
            
        Returns:
            List of search results with tool names and scores
        """
        collection_name = f"tools_{session_id}"
        
        try:
            # Generate query embedding
            query_embedding = self.generate_embedding(query)
            
            # Search Qdrant
            results = self.qdrant.search(
                collection_name=collection_name,
                query_vector=query_embedding,
                limit=top_k
            )
            
            # Format results
            search_results = [
                SearchResult(name=r.payload['name'], score=r.score)
                for r in results
            ]
            
            print(f"Found {len(search_results)} results for query: {query}")
            return search_results
            
        except Exception as e:
            print(f"Error searching: {e}")
            # Return empty results on error
            return []



# FastAPI web endpoints
@app.function(
    image=image,
    cpu=0.5,  # Even cheaper - 0.5 CPU for web endpoint
    memory=512,  # 512MB RAM (enough for FastAPI)
    container_idle_timeout=300,
)
@modal.asgi_app()
def fastapi_app():
    """
    FastAPI application with all endpoints.
    """
    from fastapi import FastAPI, HTTPException
    
    web_app = FastAPI(title="FluidTools Embedding Service")
    
    @web_app.post("/index", response_model=IndexResponse)
    async def index_endpoint(request: IndexRequest):
        """
        Index tools for a session.

        Creates a Qdrant collection and stores tool embeddings for semantic search.
        """
        try:
            service = EmbeddingService()

            # Create collection
            await service.create_collection.remote(request.session_id)

            # Insert tools
            count = await service.insert_points.remote(request.session_id, request.tools)

            return IndexResponse(indexed_count=count, session_id=request.session_id)

        except Exception as e:
            print(f"Error in /index endpoint: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @web_app.post("/search", response_model=SearchResponse)
    async def search_endpoint(request: SearchRequest):
        """
        Search for relevant tools using semantic similarity.

        Embeds the query and searches the Qdrant collection for similar tools.
        """
        try:
            service = EmbeddingService()

            # Search for similar tools
            results = await service.search_similar.remote(
                request.session_id,
                request.query,
                request.top_k
            )

            return SearchResponse(tools=results)

        except Exception as e:
            print(f"Error in /search endpoint: {e}")
            # Return empty results on error (triggers fallback in client)
            return SearchResponse(tools=[])

    @web_app.delete("/session/{session_id}", response_model=DeleteResponse)
    async def delete_session_endpoint(session_id: str):
        """
        Delete session data and clean up Qdrant collection.

        Args:
            session_id: Session identifier from URL path
        """
        try:
            service = EmbeddingService()

            # Delete collection
            success = await service.delete_collection.remote(session_id)

            return DeleteResponse(deleted=success)

        except Exception as e:
            print(f"Error in /session DELETE endpoint: {e}")
            return DeleteResponse(deleted=False)
    
    @web_app.get("/debug/session/{session_id}")
    def debug_session_endpoint(session_id: str):
        """
        Debug endpoint to inspect what's stored in a session's collection.
        
        Returns collection info and all stored points.
        """
        try:
            service = EmbeddingService()
            collection_name = f"tools_{session_id}"
            
            # Get collection info
            collection_info = service.qdrant.get_collection(collection_name)
            
            # Get all points
            points, _ = service.qdrant.scroll(
                collection_name=collection_name,
                limit=1000,
                with_payload=True,
                with_vectors=False  # Don't return full vectors (too large)
            )
            
            return {
                "session_id": session_id,
                "collection_name": collection_name,
                "vectors_count": collection_info.vectors_count,
                "points_count": collection_info.points_count,
                "tools": [
                    {
                        "id": p.id,
                        "name": p.payload.get("name"),
                        "description": p.payload.get("description")
                    }
                    for p in points
                ]
            }
            
        except Exception as e:
            print(f"Error in /debug endpoint: {e}")
            raise HTTPException(status_code=404, detail=f"Session not found or error: {str(e)}")
    
    return web_app
