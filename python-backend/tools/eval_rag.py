from __future__ import annotations

import argparse
import contextlib
import importlib
import json
import subprocess
import sys
import tempfile
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

config = importlib.import_module("config").config
evidence_module = importlib.import_module("src.evidence")
evaluation = importlib.import_module("src.rag.evaluation")
indexer = importlib.import_module("src.rag.indexer")
retriever = importlib.import_module("src.rag.retriever")

FIXTURE_DIR = BACKEND_ROOT / "tests" / "fixtures"
CORPUS_PATH = FIXTURE_DIR / "rag_eval_corpus.json"
CASE_PATH = FIXTURE_DIR / "rag_eval_cases.json"
LIVE_CASE_PATH = config.DATA_DIR / "rag_eval_live_cases.json"

LIVE_CASES = [
    {"id": "builtin_contract_last_week", "query": "지난주 계약 일정과 마감 확인", "sources": ["gmail", "drive"]},
    {"id": "builtin_meeting_this_week", "query": "이번 주 회의 미팅 회의록 논의 자료", "sources": ["gmail", "drive"]},
    {"id": "builtin_payment_confirmation", "query": "결제 확인 영수증 인보이스 payment", "sources": ["gmail", "drive"]},
    {"id": "builtin_report_document", "query": "보고서 리포트 정리 자료", "sources": ["drive"]},
    {"id": "builtin_recruiting_interview", "query": "채용 지원자 면접 일정 자료", "sources": ["gmail", "drive"]},
    {"id": "builtin_quote_proposal", "query": "견적 비용 제안서 proposal quote", "sources": ["gmail", "drive"]},
]


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z").replace(":", "-")


def _write_report(mode: str, payload: dict[str, Any]) -> Path:
    report_dir = config.DATA_DIR / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    path = report_dir / f"rag_eval_{mode}_{_utc_stamp()}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _format_ratio(value: float) -> str:
    return f"{value:.2f}"


def _print_fixture_scorecard(rows: Sequence[dict[str, Any]], passed_count: int) -> None:
    print("RAG fixture 실모델 평가")
    print("case_id | recall@5 | recall@12 | MRR | duplicate_rate | 결과")
    print("-" * 82)
    for row in rows:
        metrics = row["metrics"]
        marker = "통과" if row["passed"] else "실패"
        print(
            f"{row['case_id']} | "
            f"{_format_ratio(metrics['recall_at_5'])} | "
            f"{_format_ratio(metrics['recall_at_12'])} | "
            f"{_format_ratio(metrics['mrr'])} | "
            f"{_format_ratio(metrics['duplicate_rate'])} | "
            f"{marker}"
        )
    total = len(rows)
    percent = (passed_count / total * 100.0) if total else 0.0
    print(f"최종 요약: {total}개 중 {passed_count}개 통과 ({percent:.1f}%).")


def _print_live_scorecard(rows: Sequence[dict[str, Any]]) -> None:
    print("RAG live 개인 인덱스 점검")
    print("case_id | results | duplicate_rate | missing_location_rate | latency_ms | gmail | drive")
    print("-" * 96)
    for row in rows:
        sources = row["source_counts"]
        print(
            f"{row['case_id']} | "
            f"{row['result_count']} | "
            f"{_format_ratio(row['duplicate_rate'])} | "
            f"{_format_ratio(row['missing_source_location_rate'])} | "
            f"{row['latency_ms']} | "
            f"{sources.get('gmail', 0)} | "
            f"{sources.get('drive', 0)}"
        )
    print(f"최종 요약: live probe {len(rows)}개 실행. 통과/실패 게이트는 적용하지 않음.")


def _build_fixture_index(tmp_dir: Path, corpus: list[dict[str, Any]], embedder: Any) -> tuple[Any, dict[str, Any]]:
    chromadb = importlib.import_module("chromadb")
    Settings = importlib.import_module("chromadb.config").Settings
    BM25Okapi = importlib.import_module("rank_bm25").BM25Okapi

    client = chromadb.PersistentClient(
        path=str(tmp_dir),
        settings=Settings(anonymized_telemetry=False),
    )
    gmail_collection = indexer.get_chroma_collection(client, config.CHROMA_COLLECTION_GMAIL)
    drive_collection = indexer.get_chroma_collection(client, config.CHROMA_COLLECTION_DRIVE)

    chunks: list[dict[str, Any]] = []
    tokenized_corpus: list[list[str]] = []
    for doc in corpus:
        source = doc["source"]
        content = doc["content"]
        metadata = dict(doc.get("metadata") or {})
        collection = gmail_collection if source == "gmail" else drive_collection
        collection.add(
            ids=[doc["id"]],
            embeddings=[embedder.encode(f"passage: {content}").tolist()],
            documents=[content],
            metadatas=[metadata],
        )
        chunks.append(
            {
                "id": doc["id"],
                "content": content,
                "metadata": metadata,
                "source": source,
            }
        )
        tokenized_corpus.append(indexer.tokenize_text(content))

    return client, {
        "bm25": BM25Okapi(tokenized_corpus),
        "chunks": chunks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def run_fixture() -> int:
    corpus = _load_json(CORPUS_PATH)
    cases = _load_json(CASE_PATH)["cases"]
    embedder = indexer.get_embedding_model()

    with tempfile.TemporaryDirectory() as tmp_name:
        tmp_dir = Path(tmp_name)
        client, bm25_data = _build_fixture_index(tmp_dir / "chroma", corpus, embedder)

        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(retriever, "get_chroma_client", return_value=client))
            stack.enter_context(patch.object(retriever, "get_embedding_model", return_value=embedder))
            stack.enter_context(patch.object(retriever, "load_bm25_index", return_value=bm25_data))
            stack.enter_context(patch.object(evidence_module, "STORE_PATH", tmp_dir / "evidence_store_unused.json"))

            rows: list[dict[str, Any]] = []
            for case in cases:
                chunks = retriever.retrieve_chunks(case["query"], top_k=12, sources=case.get("sources"))
                result_ids = [str(chunk.get("id", "")) for chunk in chunks]
                result = evaluation.evaluate_search_case(case, result_ids)
                rows.append({**result, "result_ids": result_ids})

        system = getattr(client, "_system", None)
        if system is not None and hasattr(system, "stop"):
            system.stop()
        if hasattr(client, "clear_system_cache"):
            client.clear_system_cache()

    passed_count = sum(1 for row in rows if row["passed"])
    _print_fixture_scorecard(rows, passed_count)
    report_path = _write_report(
        "fixture",
        {
            "mode": "fixture",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "model": "intfloat/multilingual-e5-small",
            "case_count": len(rows),
            "passed_count": passed_count,
            "pass_rate": (passed_count / len(rows)) if rows else 0.0,
            "cases": rows,
        },
    )
    print(f"JSON 리포트: {report_path}")
    return 0 if passed_count == len(rows) else 1


def _path_is_gitignored(path: Path) -> bool:
    try:
        rel_path = path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return False
    result = subprocess.run(
        ["git", "check-ignore", "--quiet", rel_path],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def _load_live_cases() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not LIVE_CASE_PATH.exists():
        return list(LIVE_CASES), {"case_source": "built-in", "live_cases_gitignored": None}

    payload = _load_json(LIVE_CASE_PATH)
    cases = payload.get("cases") if isinstance(payload, dict) else None
    if not isinstance(cases, list):
        raise ValueError(f"{LIVE_CASE_PATH} 형식이 올바르지 않습니다. cases 배열이 필요합니다.")
    return cases, {
        "case_source": str(LIVE_CASE_PATH),
        "live_cases_gitignored": _path_is_gitignored(LIVE_CASE_PATH),
    }


def _source_counts(chunks: Sequence[dict[str, Any]]) -> dict[str, int]:
    counter = Counter(str(chunk.get("source") or (chunk.get("metadata") or {}).get("source") or "unknown") for chunk in chunks)
    return {"gmail": counter.get("gmail", 0), "drive": counter.get("drive", 0), "unknown": counter.get("unknown", 0)}


def run_live() -> int:
    cases, metadata = _load_live_cases()
    rows: list[dict[str, Any]] = []
    if metadata["live_cases_gitignored"] is False:
        print(f"경고: {LIVE_CASE_PATH} 파일이 .gitignore에 포함되지 않았습니다.")

    for index, case in enumerate(cases, start=1):
        case_id = str(case.get("id") or f"live_case_{index}")
        sources = case.get("sources")
        query = str(case.get("query") or "").strip()
        if not query:
            rows.append(
                {
                    "case_id": case_id,
                    "result_count": 0,
                    "result_ids": [],
                    "evidence_ids": [],
                    "duplicate_rate": 0.0,
                    "missing_source_location_rate": 0.0,
                    "latency_ms": 0,
                    "source_counts": {"gmail": 0, "drive": 0, "unknown": 0},
                    "error": "empty query",
                }
            )
            continue

        started = time.perf_counter()
        chunks = retriever.retrieve_chunks(query, top_k=12, sources=sources)
        response = retriever.search_evidence(query, top_k=12, sources=sources)
        latency_ms = round((time.perf_counter() - started) * 1000)

        result_ids = [str(chunk.get("id", "")) for chunk in chunks if chunk.get("id")]
        evidence = response.get("evidence") or []
        rows.append(
            {
                "case_id": case_id,
                "result_count": len(chunks),
                "result_ids": result_ids,
                "evidence_ids": [str(item.get("evidence_id", "")) for item in evidence if item.get("evidence_id")],
                "duplicate_rate": evaluation.duplicate_rate(result_ids),
                "missing_source_location_rate": evaluation.missing_source_location_rate(evidence),
                "latency_ms": latency_ms,
                "source_counts": _source_counts(chunks),
            }
        )

    _print_live_scorecard(rows)
    report_path = _write_report(
        "live",
        {
            "mode": "live",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "privacy": "returned document content and snippets are intentionally omitted",
            **metadata,
            "case_count": len(rows),
            "cases": rows,
        },
    )
    print(f"JSON 리포트: {report_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="RAG 검색 품질 개발용 평가 도구")
    parser.add_argument("--mode", choices=("fixture", "live"), required=True)
    args = parser.parse_args()
    return run_fixture() if args.mode == "fixture" else run_live()


if __name__ == "__main__":
    raise SystemExit(main())
