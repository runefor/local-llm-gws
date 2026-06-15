import logging
from typing import Dict, Any, List
from src.harness.state import ExternalizedStateStore, CuratedEvidence, VerificationRecord
from src.rag.retriever import retrieve_chunks

logger = logging.getLogger(__name__)

async def execute_tool(action: Dict[str, Any], state: ExternalizedStateStore) -> str:
    """
    LLM의 action에 알맞은 도구를 호출하여 실행하고 결과를 문자열로 반환하며
    주어진 state 상태를 직접 업데이트합니다.
    """
    act_name = action.get("action")
    args = action.get("arguments", {})
    
    if act_name == "search_knowledge":
        query = args.get("query", "")
        if not query:
            return "오류: 검색 쿼리가 지정되지 않았습니다."
            
        # 1. RAG Retriever에서 관련 청크 검색
        chunks = retrieve_chunks(query, top_k=5)
        
        # 2. 검색 기록 보존
        state.search_history.append(query)
        
        # 3. 신규 획득 문서들을 candidate_pool에 추가
        new_docs = 0
        for chunk in chunks:
            meta = chunk["metadata"]
            doc_id = meta.get("doc_id")
            content = chunk["content"]
            
            if doc_id not in state.candidate_pool:
                state.candidate_pool[doc_id] = content
                new_docs += 1
                
        return f"지식 검색 수행 완료. 쿼리: '{query}' | 새로 발견된 문서 수: {new_docs}개 (후보 풀 전체: {len(state.candidate_pool)}개)"
        
    elif act_name == "curate_evidence":
        doc_id = args.get("doc_id")
        title = args.get("title", "")
        importance = args.get("importance_tag", "fair")
        
        if not doc_id:
            return "오류: 큐레이션할 문서 ID(doc_id)가 제공되지 않았습니다."
            
        content = state.candidate_pool.get(doc_id)
        if not content:
            # 이미 큐레이션 대장에 존재한다면 중요도만 갱신
            if doc_id in state.curated_evidence_ledger:
                state.curated_evidence_ledger[doc_id].importance_tag = importance
                return f"문서 '{title}' ({doc_id})의 중요도 설정을 {importance}로 변경했습니다."
            return f"오류: 후보 풀(candidate_pool)에서 문서 ID {doc_id}를 찾지 못했습니다. 먼저 search_knowledge를 통해 탐색해 주십시오."
            
        # 1. 2단계 퍼지 중복 제거 검사 (MinHash-LSH)
        from src.harness.dedup import should_merge, merge_documents
        duplicate_id = None
        for cur_id in list(state.curated_evidence_ledger.keys()):
            cur_content = state.candidate_pool.get(cur_id, "")
            if should_merge(content, cur_content):
                duplicate_id = cur_id
                break
                
        # 중복 감지 시 병합 처리
        if duplicate_id:
            logger.info(f"중복 문서 탐지: {doc_id}와 {duplicate_id} 병합.")
            existing_ev = state.curated_evidence_ledger[duplicate_id]
            
            # 텍스트 병합 및 후보 풀 갱신
            merged_content = merge_documents(content, state.candidate_pool.get(duplicate_id, ""))
            state.candidate_pool[duplicate_id] = merged_content
            
            # 중요도 설정 업데이트 (더 높은 중요도로 병합)
            priority = {"very_high": 4, "high": 3, "fair": 2, "low": 1}
            if priority.get(importance, 2) > priority.get(existing_ev.importance_tag, 2):
                existing_ev.importance_tag = importance
                
            # Sentence-BM25 압축
            from src.harness.compressor import compress_text
            compressed = compress_text(state.primary_query, merged_content)
            existing_ev.compressed_chunks = compressed
            
            return f"기존 유사 문서 '{existing_ev.original_title}' ({duplicate_id})와 내용을 병합 및 갱신하였습니다."
            
        # 2. 신규 문서 큐레이션 등록 및 BM25 압축
        from src.harness.compressor import compress_text
        compressed = compress_text(state.primary_query, content)
        
        evidence = CuratedEvidence(
            doc_id=doc_id,
            original_title=title or doc_id,
            importance_tag=importance,
            compressed_chunks=compressed
        )
        state.curated_evidence_ledger[doc_id] = evidence
        return f"문서 '{title}' ({doc_id})를 큐레이션 대장에 추가했습니다. 중요도: {importance}"
        
    elif act_name == "verify_claim":
        claim_id = args.get("claim_id")
        claim_statement = args.get("claim_statement", "")
        status = args.get("status", "unverified")
        evidence_ids = args.get("assigned_evidence_ids", [])
        
        if not claim_id or not claim_statement:
            return "오류: 주장 정보(claim_id 또는 claim_statement)가 부족합니다."
            
        # 유효한 증거 ID 필터링
        valid_ev_ids = [eid for eid in evidence_ids if eid in state.curated_evidence_ledger]
        
        record = VerificationRecord(
            claim_statement=claim_statement,
            status=status,
            assigned_evidence_ids=valid_ev_ids
        )
        state.verification_registry[claim_id] = record
        return f"가설 검증 정보 업데이트 완료. 주장 ID: '{claim_id}' | 상태: {status.upper()} | 연결된 증거: {len(valid_ev_ids)}개"
        
    elif act_name == "finalize_answer":
        answer = args.get("answer", "")
        return f"종료 액션 실행. 최종 답변: {answer}"
        
    else:
        return f"오류: 알 수 없는 액션 '{act_name}'입니다."
