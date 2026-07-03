import re
from typing import Any, Dict, List, Literal, assert_never

from src.evidence import _load_store

RELEVANT_FEEDBACK_BOOST = 0.04
IMPORTANT_FEEDBACK_BOOST = 0.12
IRRELEVANT_FEEDBACK_PENALTY = -0.06
SAME_DOC_FEEDBACK_WEIGHT = 0.5
EXCLUDED_CHUNK_DOC_PENALTY = -0.10 * SAME_DOC_FEEDBACK_WEIGHT


def _terms(query: str) -> set[str]:
    return {term for term in re.findall(r"[0-9A-Za-z가-힣_]{2,}", query.lower())}


def _applies(saved_query: str, current_query: str) -> bool:
    saved_terms = _terms(saved_query)
    current_terms = _terms(current_query)
    if not saved_terms or not current_terms:
        return True
    return bool(saved_terms & current_terms)


def _delta(feedback: Literal["relevant", "irrelevant", "important"]) -> float:
    match feedback:
        case "relevant":
            return RELEVANT_FEEDBACK_BOOST
        case "important":
            return IMPORTANT_FEEDBACK_BOOST
        case "irrelevant":
            return IRRELEVANT_FEEDBACK_PENALTY
        case unreachable:
            assert_never(unreachable)


def _feedback_adjustments(query: str) -> tuple[Dict[str, float], set[str]]:
    store = _load_store()
    scores: Dict[str, float] = {}
    latest_by_chunk: Dict[str, tuple[str, str, str]] = {}
    for item in store.relevance_feedback:
        if not _applies(item.query, query):
            continue
        if item.chunk_id:
            current = latest_by_chunk.get(item.chunk_id)
            if current is None or item.created_at >= current[0]:
                latest_by_chunk[item.chunk_id] = (item.created_at, item.feedback, item.doc_id)
        if item.feedback == "excluded":
            continue
        delta = _delta(item.feedback)
        if item.chunk_id:
            scores[f"chunk:{item.chunk_id}"] = scores.get(f"chunk:{item.chunk_id}", 0.0) + delta
        if item.doc_id:
            scores[f"doc:{item.doc_id}"] = scores.get(f"doc:{item.doc_id}", 0.0) + (delta * SAME_DOC_FEEDBACK_WEIGHT)

    excluded_chunk_ids: set[str] = set()
    for chunk_id, (_created_at, feedback, doc_id) in latest_by_chunk.items():
        if feedback != "excluded":
            continue
        excluded_chunk_ids.add(chunk_id)
        if doc_id:
            scores[f"doc:{doc_id}"] = scores.get(f"doc:{doc_id}", 0.0) + EXCLUDED_CHUNK_DOC_PENALTY
    return scores, excluded_chunk_ids


def _scores(query: str) -> Dict[str, float]:
    scores, _excluded_chunk_ids = _feedback_adjustments(query)
    return scores


def _chunk_score(chunk: Dict[str, Any], scores: Dict[str, float]) -> float:
    metadata = chunk.get("metadata") or {}
    chunk_id = chunk.get("id") or ""
    doc_id = metadata.get("doc_id") or metadata.get("provider_item_id") or ""
    return scores.get(f"chunk:{chunk_id}", 0.0) + scores.get(f"doc:{doc_id}", 0.0)


def apply_relevance_feedback(query: str, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    scores, excluded_chunk_ids = _feedback_adjustments(query)
    if not scores and not excluded_chunk_ids:
        return chunks
    personalized = []
    for rank, chunk in enumerate(chunks, 1):
        feedback_score = _chunk_score(chunk, scores)
        metadata = dict(chunk.get("metadata") or {})
        if feedback_score:
            metadata["personalization_score"] = feedback_score
        base_score = chunk.get("rrf_score") or (1.0 / (60 + rank))
        personalized.append(({**chunk, "metadata": metadata}, base_score + feedback_score))
    personalized.sort(key=lambda item: item[1], reverse=True)
    reordered = [chunk for chunk, _score in personalized]
    if not excluded_chunk_ids:
        return reordered
    filtered = [chunk for chunk in reordered if (chunk.get("id") or "") not in excluded_chunk_ids]
    return filtered or reordered
