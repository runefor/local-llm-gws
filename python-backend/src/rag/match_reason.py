import re
from typing import Any, Dict, List, Set, Tuple

MAX_MATCH_TERMS = 8
def _unique_strings(values: List[str]) -> List[str]:
    unique: List[str] = []
    seen: Set[str] = set()
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


def _query_terms(query: str) -> List[str]:
    terms = re.findall(r"[0-9A-Za-z가-힣_]{2,}", query.lower())
    return _unique_strings(terms)


def _metadata_list(metadata: Dict[str, Any], key: str) -> List[str]:
    value = metadata.get(key)
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in re.split(r"[,|]", value) if item.strip()]
    return []


def _merge_metadata_values(existing: Dict[str, Any], incoming: Dict[str, Any], key: str) -> None:
    merged = _unique_strings(_metadata_list(existing, key) + _metadata_list(incoming, key))
    if merged:
        existing[key] = ", ".join(merged)


def _field_texts(content: str, metadata: Dict[str, Any]) -> Dict[str, str]:
    return {
        "content": content or "",
        "title": str(metadata.get("title", "")),
        "name": str(metadata.get("name", "")),
        "sender": str(metadata.get("sender", "")),
        "from": str(metadata.get("from", "")),
        "owners": str(metadata.get("owners", "")),
        "creator": str(metadata.get("creator", "")),
    }


def _query_term_sets(query_expansions: List[str]) -> Tuple[List[str], List[str]]:
    original_terms = _query_terms(query_expansions[0]) if query_expansions else []
    all_terms: List[str] = []
    for expanded_query in query_expansions:
        all_terms.extend(_query_terms(expanded_query))
    unique_all = _unique_strings(all_terms)
    expanded_only = [term for term in unique_all if term not in set(original_terms)]
    return unique_all, expanded_only


def _matched_terms(content: str, metadata: Dict[str, Any], query_expansions: List[str]) -> List[str]:
    haystack = " ".join(_field_texts(content, metadata).values()).lower()
    terms, _ = _query_term_sets(query_expansions)
    return [term for term in sorted(terms, key=len, reverse=True) if term in haystack][:MAX_MATCH_TERMS]


def _matched_fields(content: str, metadata: Dict[str, Any], matched_terms: List[str]) -> List[str]:
    fields: List[str] = []
    for field, value in _field_texts(content, metadata).items():
        haystack = value.lower()
        if any(term in haystack for term in matched_terms):
            fields.append(field)
    return fields


def _expanded_terms(content: str, metadata: Dict[str, Any], query_expansions: List[str]) -> List[str]:
    haystack = " ".join(_field_texts(content, metadata).values()).lower()
    _, expanded_only = _query_term_sets(query_expansions)
    return [term for term in expanded_only if term in haystack][:MAX_MATCH_TERMS]


def _build_match_reason(metadata: Dict[str, Any]) -> str:
    channels = _metadata_list(metadata, "match_channels")
    terms = _metadata_list(metadata, "matched_terms")
    fields = _metadata_list(metadata, "matched_fields")
    channel_label = " + ".join(
        "의미 검색" if channel == "semantic" else "키워드 검색" if channel == "keyword" else channel
        for channel in channels
    )
    field_label = f" ({', '.join(fields[:3])})" if fields else ""
    if channel_label and terms:
        return f"{channel_label} 매칭{field_label}: {', '.join(terms[:4])}"
    if channel_label:
        return f"{channel_label}으로 관련 자료를 찾았습니다."
    if terms:
        return f"검색어와 겹친 단서{field_label}: {', '.join(terms[:4])}"
    return ""


def _merge_match_metadata(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(existing)
    for key, value in incoming.items():
        if key not in merged or merged[key] in (None, ""):
            merged[key] = value
    for key in ["match_channels", "matched_terms", "matched_fields", "expanded_terms", "query_expansions"]:
        _merge_metadata_values(merged, incoming, key)
    merged["match_reason"] = _build_match_reason(merged)
    return merged


def _with_match_metadata(chunk: Dict[str, Any], channel: str, query_expansions: List[str]) -> Dict[str, Any]:
    metadata = dict(chunk.get("metadata") or {})
    metadata["match_channels"] = ", ".join(_unique_strings(_metadata_list(metadata, "match_channels") + [channel]))
    metadata["query_expansions"] = " | ".join(query_expansions)
    terms = _matched_terms(chunk.get("content") or "", metadata, query_expansions)
    if terms:
        metadata["matched_terms"] = ", ".join(_unique_strings(_metadata_list(metadata, "matched_terms") + terms))
        fields = _matched_fields(chunk.get("content") or "", metadata, terms)
        if fields:
            metadata["matched_fields"] = ", ".join(_unique_strings(_metadata_list(metadata, "matched_fields") + fields))
        expanded_terms = _expanded_terms(chunk.get("content") or "", metadata, query_expansions)
        if expanded_terms:
            metadata["expanded_terms"] = ", ".join(_unique_strings(_metadata_list(metadata, "expanded_terms") + expanded_terms))
    metadata["match_reason"] = _build_match_reason(metadata)
    return {**chunk, "metadata": metadata}
