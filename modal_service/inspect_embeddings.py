"""
Script to inspect Qdrant embeddings during testing.

This is a standalone script that doesn't use Modal decorators.
"""

from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from typing import List

class LocalEmbeddingService:
    """Local version of embedding service without Modal decorators."""
    
    def __init__(self):
        print("Loading sentence-transformers model...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.dimension = 384
        print(f"Model loaded. Embedding dimension: {self.dimension}")
        
        print("Initializing Qdrant client (in-memory)...")
        self.qdrant = QdrantClient(":memory:")
        print("Qdrant client initialized")
    
    def generate_embedding(self, text: str) -> List[float]:
        embedding = self.model.encode(text)
        return embedding.tolist()
    
    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(texts)
        return [emb.tolist() for emb in embeddings]
    
    def create_collection(self, session_id: str):
        collection_name = f"tools_{session_id}"
        
        # Check if exists and delete
        collections = self.qdrant.get_collections().collections
        if any(c.name == collection_name for c in collections):
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
    
    def insert_points(self, session_id: str, tools: List[dict]):
        collection_name = f"tools_{session_id}"
        
        # Generate embeddings
        texts = [f"{tool['name']}: {tool['description']}" for tool in tools]
        embeddings = self.generate_embeddings_batch(texts)
        
        # Create points
        points = []
        for idx, (tool, embedding) in enumerate(zip(tools, embeddings)):
            points.append(PointStruct(
                id=idx,
                vector=embedding,
                payload={"name": tool['name'], "description": tool['description']}
            ))
        
        # Insert
        self.qdrant.upsert(
            collection_name=collection_name,
            points=points
        )
        
        return len(points)
    
    def search_similar(self, session_id: str, query: str, top_k: int = 15):
        collection_name = f"tools_{session_id}"
        
        # Generate query embedding
        query_embedding = self.generate_embedding(query)
        
        # Search
        results = self.qdrant.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=top_k
        )
        
        return results
    
    def delete_collection(self, session_id: str):
        collection_name = f"tools_{session_id}"
        self.qdrant.delete_collection(collection_name)


def inspect_collection(service: LocalEmbeddingService, session_id: str):
    """Inspect a Qdrant collection to see what's stored."""
    collection_name = f"tools_{session_id}"
    
    try:
        # Get collection info
        collection_info = service.qdrant.get_collection(collection_name)
        print(f"\n📊 Collection: {collection_name}")
        print(f"   Vectors count: {collection_info.vectors_count}")
        print(f"   Points count: {collection_info.points_count}")
        
        # Scroll through all points
        points, _ = service.qdrant.scroll(
            collection_name=collection_name,
            limit=100,
            with_payload=True,
            with_vectors=True
        )
        
        print(f"\n🔍 Points in collection:")
        for point in points:
            print(f"\n   ID: {point.id}")
            print(f"   Name: {point.payload.get('name')}")
            print(f"   Description: {point.payload.get('description')}")
            print(f"   Vector (first 5 dims): {point.vector[:5]}...")
            print(f"   Vector length: {len(point.vector)}")
        
        return points
        
    except Exception as e:
        print(f"❌ Error inspecting collection: {e}")
        return []


def test_with_inspection():
    """Test and inspect embeddings."""
    print("=" * 60)
    print("Qdrant Embedding Inspection")
    print("=" * 60)
    
    service = LocalEmbeddingService()
    
    session_id = "inspect_test"
    
    # Create collection and add tools
    service.create_collection(session_id)
    
    tools = [
        {"name": "getUserProfile", "description": "Fetches user profile information by email"},
        {"name": "updateUserSettings", "description": "Updates user preferences and settings"},
        {"name": "deleteUserAccount", "description": "Permanently deletes a user account"},
    ]
    
    count = service.insert_points(session_id, tools)
    print(f"\n✅ Indexed {count} tools")
    
    # Inspect the collection
    points = inspect_collection(service, session_id)
    
    # Test a search
    query = "get user data"
    print(f"\n🔎 Searching for: '{query}'")
    results = service.search_similar(session_id, query, top_k=3)
    
    print(f"\n📋 Search Results:")
    for i, result in enumerate(results, 1):
        print(f"   {i}. {result.payload['name']} (score: {result.score:.4f})")
    
    # Clean up
    service.delete_collection(session_id)
    print(f"\n🧹 Cleaned up collection")


if __name__ == "__main__":
    test_with_inspection()
