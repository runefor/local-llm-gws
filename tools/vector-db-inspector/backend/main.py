import os
import sys
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings

app = FastAPI(title="Vector DB Inspector API", description="ChromaDB Read-Only Visualizer Backend")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 독립 실행되므로 일단 와일드카드 허용 (포트 격리)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ChromaDB 경로 설정 (python-backend/data/vectordb)
CHROMA_DB_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../python-backend/data/vectordb")
)

def get_chroma_client():
    if not os.path.exists(CHROMA_DB_PATH):
        raise HTTPException(
            status_code=500,
            detail=f"ChromaDB 경로가 존재하지 않습니다: {CHROMA_DB_PATH}. 먼저 데스크톱 앱에서 인덱싱을 진행해 주세요."
        )
    return chromadb.PersistentClient(
        path=CHROMA_DB_PATH,
        settings=Settings(anonymized_telemetry=False)
    )

# 캐싱된 embedding_model (유사도 검색용)
_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        # 기존 앱과 동일한 모델 사용
        _embedding_model = SentenceTransformer("intfloat/multilingual-e5-small")
    return _embedding_model

@app.get("/api/collections")
def list_collections():
    """ChromaDB 내 모든 컬렉션과 각 컬렉션의 청크 수 조회"""
    try:
        client = get_chroma_client()
        collections = client.list_collections()
        result = []
        for col in collections:
            result.append({
                "name": col.name,
                "count": col.count(),
                "metadata": col.metadata
            })
        return {"status": "success", "collections": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/collections/{name}/documents")
def list_documents(
    name: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search_query: Optional[str] = None
):
    """특정 컬렉션 안의 고유 doc_id 목록과 메타데이터 정보 조회 (페이징 지원)"""
    try:
        client = get_chroma_client()
        collection = client.get_collection(name)
        
        # 10000개까지의 메타데이터를 가져와서 메모리에서 고유 doc_id 그룹핑 수행
        # ChromaDB는 직접적인 Group By/Distinct 절을 지원하지 않기 때문에 메모리 그룹핑이 일반적임
        all_data = collection.get(include=["metadatas"])
        metadatas = all_data.get("metadatas") or []
        
        # doc_id별로 정보 합산
        docs_map = {}
        for meta in metadatas:
            if not meta:
                continue
            doc_id = meta.get("doc_id")
            if not doc_id:
                continue
                
            if doc_id not in docs_map:
                docs_map[doc_id] = {
                    "doc_id": doc_id,
                    "title": meta.get("title") or meta.get("subject") or doc_id,
                    "source": meta.get("source") or "unknown",
                    "chunk_count": 0,
                    "date": meta.get("date") or meta.get("modified_time") or "unknown",
                    "sender": meta.get("sender") or meta.get("owners") or ""
                }
            docs_map[doc_id]["chunk_count"] += 1
            
        docs_list = list(docs_map.values())
        
        # 날짜 최신순 정렬
        docs_list.sort(key=lambda x: x["date"], reverse=True)
        
        # 검색 필터
        if search_query:
            q = search_query.lower()
            docs_list = [
                d for d in docs_list 
                if q in str(d["title"]).lower() or q in str(d["doc_id"]).lower() or q in str(d["sender"]).lower()
            ]
            
        total = len(docs_list)
        start = (page - 1) * limit
        end = start + limit
        paginated_docs = docs_list[start:end]
        
        return {
            "status": "success",
            "total": total,
            "page": page,
            "limit": limit,
            "documents": paginated_docs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/collections/{name}/documents/{doc_id}/chunks")
def get_document_chunks(name: str, doc_id: str):
    """특정 doc_id 문서에 속한 모든 청크를 chunk_index 순서대로 조회"""
    try:
        client = get_chroma_client()
        collection = client.get_collection(name)
        
        data = collection.get(
            where={"doc_id": doc_id},
            include=["documents", "metadatas"]
        )
        
        ids = data.get("ids") or []
        documents = data.get("documents") or []
        metadatas = data.get("metadatas") or []
        
        chunks = []
        for i in range(len(ids)):
            meta = metadatas[i] or {}
            chunks.append({
                "id": ids[i],
                "content": documents[i],
                "chunk_index": meta.get("chunk_index", 0),
                "length": len(documents[i]),
                "metadata": meta
            })
            
        # chunk_index 기준으로 정렬하여 문맥 흐름 복원
        chunks.sort(key=lambda x: x["chunk_index"])
        
        return {
            "status": "success",
            "doc_id": doc_id,
            "total_chunks": len(chunks),
            "chunks": chunks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/collections/{name}/stats")
def get_collection_stats(name: str):
    """컬렉션 통계 및 청크 길이 분포 분석"""
    try:
        client = get_chroma_client()
        collection = client.get_collection(name)
        
        all_data = collection.get(include=["documents", "metadatas"])
        documents = all_data.get("documents") or []
        metadatas = all_data.get("metadatas") or []
        
        total_chunks = len(documents)
        if total_chunks == 0:
            return {
                "status": "success",
                "total_chunks": 0,
                "avg_chunk_length": 0,
                "doc_count": 0,
                "length_distribution": {}
            }
            
        lengths = [len(doc) for doc in documents]
        avg_length = sum(lengths) / total_chunks
        
        # 고유 문서 계산
        unique_docs = set()
        for meta in metadatas:
            if meta and meta.get("doc_id"):
                unique_docs.add(meta.get("doc_id"))
                
        # 길이 분포 구간 (100자 단위)
        distribution = {}
        for length in lengths:
            bucket = (length // 100) * 100
            bucket_name = f"{bucket}-{bucket+99}"
            distribution[bucket_name] = distribution.get(bucket_name, 0) + 1
            
        # 정렬된 분포 딕셔너리 생성
        sorted_dist = dict(sorted(distribution.items(), key=lambda x: int(x[0].split('-')[0])))
        
        return {
            "status": "success",
            "total_chunks": total_chunks,
            "avg_chunk_length": round(avg_length, 2),
            "doc_count": len(unique_docs),
            "length_distribution": sorted_dist
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/collections/{name}/search")
def search_chunks(name: str, query: str, limit: int = Query(5, ge=1, le=20)):
    """로컬 e5 임베딩 모델을 활용한 유사 청크 검색 및 디버깅용 유사도 제공"""
    try:
        client = get_chroma_client()
        collection = client.get_collection(name)
        
        # 임베딩 모델 가져오기
        model = get_embedding_model()
        # E5 모델 규격에 따라 "query: " 접두사 필수
        query_vector = model.encode(f"query: {query}").tolist()
        
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=limit,
            include=["documents", "metadatas", "distances"]
        )
        
        ids = results.get("ids")[0] if results.get("ids") else []
        documents = results.get("documents")[0] if results.get("documents") else []
        metadatas = results.get("metadatas")[0] if results.get("metadatas") else []
        distances = results.get("distances")[0] if results.get("distances") else []
        
        chunks = []
        for i in range(len(ids)):
            chunks.append({
                "id": ids[i],
                "content": documents[i],
                "distance": distances[i],
                # 유사도는 코사인 유사도 거리 역변환 (L2 거리에 따라 다름)
                "score": round(1 - distances[i], 4),
                "metadata": metadatas[i] or {}
            })
            
        return {
            "status": "success",
            "query": query,
            "results": chunks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # 28731 포트로 실행 (충돌 방지용 대체 포트)
    uvicorn.run("main:app", host="127.0.0.1", port=28731, reload=True)
