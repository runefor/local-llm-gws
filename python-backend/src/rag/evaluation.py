from typing import Any, Dict, Iterable, List, Sequence

SOURCE_POINTER_FIELDS = [
    "original_url",
    "location_label",
    "provider_item_id",
    "message_id",
    "thread_id",
    "file_id",
]


def _unique(values: Iterable[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for value in values:
        normalized = str(value).strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def recall_at(expected_ids: Sequence[str], result_ids: Sequence[str], k: int) -> float:
    expected = set(_unique(expected_ids))
    if not expected:
        return 1.0
    returned = set(_unique(result_ids[:k]))
    return len(expected & returned) / len(expected)


def mean_reciprocal_rank(expected_ids: Sequence[str], result_ids: Sequence[str]) -> float:
    expected = set(_unique(expected_ids))
    if not expected:
        return 1.0
    for index, result_id in enumerate(result_ids, start=1):
        if result_id in expected:
            return 1.0 / index
    return 0.0


def duplicate_rate(result_ids: Sequence[str]) -> float:
    if not result_ids:
        return 0.0
    unique_count = len(set(str(item) for item in result_ids))
    return (len(result_ids) - unique_count) / len(result_ids)


def _location_dict(record: Any) -> Dict[str, Any]:
    if isinstance(record, dict):
        value = record.get("source_location") or {}
        return value if isinstance(value, dict) else {}
    location = getattr(record, "source_location", None)
    if location is None:
        return {}
    if hasattr(location, "model_dump"):
        return location.model_dump()
    return {field: getattr(location, field, "") for field in SOURCE_POINTER_FIELDS}


def missing_source_location_rate(records: Sequence[Any]) -> float:
    if not records:
        return 0.0
    missing = 0
    for record in records:
        location = _location_dict(record)
        if not any(str(location.get(field, "") or "").strip() for field in SOURCE_POINTER_FIELDS):
            missing += 1
    return missing / len(records)


def evaluate_search_case(case: Dict[str, Any], result_ids: Sequence[str]) -> Dict[str, Any]:
    expected_ids = case.get("expected_ids") or []
    metrics = {
        "recall_at_5": recall_at(expected_ids, result_ids, 5),
        "recall_at_12": recall_at(expected_ids, result_ids, 12),
        "mrr": mean_reciprocal_rank(expected_ids, result_ids),
        "duplicate_rate": duplicate_rate(result_ids),
    }
    passed = (
        metrics["recall_at_5"] >= float(case.get("minimum_recall_at_5", 0.0))
        and metrics["recall_at_12"] >= float(case.get("minimum_recall_at_12", 0.0))
        and metrics["mrr"] >= float(case.get("minimum_mrr", 0.0))
        and metrics["duplicate_rate"] <= float(case.get("maximum_duplicate_rate", 0.0))
    )
    return {"case_id": case.get("id", ""), "passed": passed, "metrics": metrics}
