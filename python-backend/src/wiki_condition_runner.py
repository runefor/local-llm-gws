from __future__ import annotations

from typing import Any, Callable, TypedDict
from urllib.parse import urlparse

from config import config
from src.gws.drive import list_drive_files as default_list_drive_files
from src.gws.gmail import list_message_metadata as default_list_message_metadata
from src.llm.inference import chat_completion as default_chat_completion
from src.settings import load_settings
from src.wiki_conditions import WikiCondition, build_drive_query, build_gmail_query

list_message_metadata = default_list_message_metadata
list_drive_files = default_list_drive_files
chat_completion = default_chat_completion


class WarningPayload(TypedDict):
    title: str
    message: str


def is_external_llm_endpoint() -> bool:
    if config.LLM_SERVE_MODE == "llamacpp":
        return False
    endpoint = config.OLLAMA_BASE if config.LLM_SERVE_MODE == "ollama" else config.LLM_API_BASE
    try:
        host = urlparse(endpoint).hostname or ""
    except ValueError:
        return True
    return host.lower() not in {"localhost", "127.0.0.1", "::1"}


def _normalize_gmail_item(item: dict[str, Any], condition: WikiCondition) -> dict[str, Any]:
    return {
        "source": "gmail",
        "id": str(item.get("id", "")),
        "threadId": str(item.get("threadId", "")),
        "messageId": str(item.get("messageId", "")),
        "title": str(item.get("subject", "(제목 없음)")),
        "subject": str(item.get("subject", "(제목 없음)")),
        "from": str(item.get("from", "")),
        "date": str(item.get("date", "")),
        "labelIds": item.get("labelIds", []),
        "snippet": str(item.get("snippet", "")),
        "conditionId": condition["id"],
    }


def _normalize_drive_item(item: dict[str, Any], condition: WikiCondition) -> dict[str, Any]:
    return {
        "source": "drive",
        "id": str(item.get("id", "")),
        "name": str(item.get("name", "(제목 없음)")),
        "title": str(item.get("name", "(제목 없음)")),
        "mimeType": str(item.get("mimeType", "")),
        "modifiedTime": str(item.get("modifiedTime", "")),
        "webViewLink": str(item.get("webViewLink", "")),
        "locationStatus": "조건 폴더 기준" if condition["driveFolderIds"] else "위치 정보 없음",
        "conditionId": condition["id"],
    }


def _build_wiki_prompt(condition: WikiCondition, records: list[dict[str, Any]]) -> list[dict[str, str]]:
    record_lines = []
    for index, record in enumerate(records, start=1):
        if record["source"] == "gmail":
            record_lines.append(
                f"[{index}] Gmail | 제목: {record['subject']} | 보낸 사람: {record['from']} | 날짜: {record['date']}\n"
                f"스니펫: {record['snippet']}"
            )
        else:
            record_lines.append(
                f"[{index}] Drive | 파일명: {record['name']} | 종류: {record['mimeType']} | 수정일: {record['modifiedTime']}\n"
                f"위치: {record['locationStatus']}"
            )
    context = "\n\n".join(record_lines) or "조건에 맞는 항목이 없습니다."
    return [
        {
            "role": "system",
            "content": (
                "당신은 Gmail/Drive 메타데이터와 스니펫만 사용해 개인 지식 Wiki 초안을 만드는 비서입니다. "
                "Gmail 본문 원문은 제공되지 않았으므로 스니펫 밖의 내용을 추측하지 마세요. 이 결과는 최종 Wiki가 아니라 원문 검토 전 후보 초안입니다. "
                "한국어 Markdown으로 제목, 요약, 근거 항목, 후속 확인 필요 항목을 작성하세요.\n\n"
                f"--- 조건: {condition['name']} ---\n{context}"
            ),
        },
        {"role": "user", "content": f"'{condition['name']}' 조건 결과를 LLM Wiki 초안으로 정리해줘."},
    ]


def _warning_payload() -> WarningPayload:
    return {
        "title": "외부 LLM 전송 확인",
        "message": "조건 후보 생성을 위해 Gmail/Drive 메타데이터와 스니펫이 외부 LLM endpoint로 전송될 수 있습니다. 최종 Wiki는 원문 검토와 정보 묶음 확정 뒤 생성하세요.",
    }


def run_condition(
    condition: WikiCondition,
    *,
    confirm_external_llm: bool = False,
    suppress_external_warning: bool | None = None,
    is_external_llm: bool | None = None,
    list_gmail_metadata: Callable[..., tuple[list[dict[str, Any]], str | None]] | None = None,
    list_drive_files: Callable[..., tuple[list[dict[str, Any]], str | None]] | None = None,
    chat_completion: Callable[..., dict[str, Any]] | None = None,
) -> dict[str, Any]:
    gmail_lister = list_message_metadata if list_gmail_metadata is None else list_gmail_metadata
    drive_lister = globals()["list_drive_files"] if list_drive_files is None else list_drive_files
    chat = globals()["chat_completion"] if chat_completion is None else chat_completion
    gmail_query = build_gmail_query(condition["keyword"], condition["period"])
    drive_query = build_drive_query(condition["keyword"], condition["period"], condition["driveFolderIds"])
    gmail_items, gmail_next = gmail_lister(
        max_results=100,
        query=gmail_query or None,
        label_ids=condition["gmailLabelIds"] or None,
    )
    drive_items, drive_next = drive_lister(
        max_results=100,
        query=drive_query or None,
    )
    records = [_normalize_gmail_item(item, condition) for item in gmail_items]
    records.extend(_normalize_drive_item(item, condition) for item in drive_items)

    wiki: dict[str, Any] = {"auto": condition["autoWikiEnabled"], "status": "skipped", "message": "스니펫 초안 생성이 꺼져 있습니다."}
    if condition["autoWikiEnabled"]:
        settings = load_settings()
        suppress_warning = settings.get("suppress_external_llm_sensitive_warning", False) if suppress_external_warning is None else suppress_external_warning
        external_llm = is_external_llm_endpoint() if is_external_llm is None else is_external_llm
        if external_llm and not suppress_warning and not confirm_external_llm:
            wiki = {"auto": True, "status": "warning_required", "warning": _warning_payload(), "message": "스니펫 초안을 만들기 전 외부 LLM 전송 확인이 필요합니다."}
        else:
            llm_result = chat(messages=_build_wiki_prompt(condition, records), max_tokens=2048, temperature=0.2)
            if "error" in llm_result:
                wiki = {"auto": True, "status": "failed", "message": str(llm_result["error"])}
            else:
                wiki = {
                    "auto": True,
                    "status": "created",
                    "artifact_id": f"wiki-candidate-{condition['id']}",
                    "artifact_status": "candidate",
                    "markdown": llm_result.get("content", ""),
                    "message": "조건 후보 기반 스니펫 초안을 만들었습니다. 원문 검토 후 정보 묶음 기반 Wiki로 확정하세요.",
                }

    return {
        "status": "success",
        "condition": condition,
        "gmail": {"count": len(gmail_items), "items": records[:len(gmail_items)], "has_more": gmail_next is not None},
        "drive": {"count": len(drive_items), "items": records[len(gmail_items):], "has_more": drive_next is not None},
        "records": records,
        "wiki": wiki,
    }
