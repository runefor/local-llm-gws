from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, NotRequired, TypedDict
from urllib.parse import urlparse

from config import config

Period = Literal["1w", "1m", "3m", "all"]
WIKI_CONDITIONS_FILE = config.DATA_DIR / "wiki_conditions.json"
_VALID_PERIODS: set[str] = {"1w", "1m", "3m", "all"}
_FOLDER_ID_RE = re.compile(r"^[A-Za-z0-9_'\-]{3,}$")


class ConditionValidationError(Exception):
    """조건 입력이 V1 안전 범위를 벗어났을 때 발생합니다."""


class WikiCondition(TypedDict):
    id: str
    name: str
    gmailLabelIds: list[str]
    driveFolderIds: list[str]
    keyword: str
    period: Period
    autoWikiEnabled: bool
    createdAt: str
    updatedAt: str


class WikiConditionPatch(TypedDict, total=False):
    name: str
    gmailLabelIds: list[str]
    driveFolderIds: list[str]
    keyword: str
    period: Period
    autoWikiEnabled: bool


class WikiConditionInput(TypedDict):
    name: NotRequired[str]
    gmailLabelIds: NotRequired[list[str]]
    driveFolderIds: NotRequired[list[str]]
    keyword: NotRequired[str]
    period: NotRequired[Period]
    autoWikiEnabled: NotRequired[bool]
    id: NotRequired[str]
    createdAt: NotRequired[str]
    updatedAt: NotRequired[str]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _period_days(period: Period) -> int | None:
    match period:
        case "1w":
            return 7
        case "1m":
            return 30
        case "3m":
            return 90
        case "all":
            return None


def parse_drive_folder_id(raw_value: str) -> str:
    value = raw_value.strip()
    if not value:
        raise ConditionValidationError("Drive 폴더 ID 또는 링크를 입력하세요.")

    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        parts = [part for part in parsed.path.split("/") if part]
        if "folders" in parts:
            folder_index = parts.index("folders")
            if folder_index + 1 < len(parts):
                value = parts[folder_index + 1]
            else:
                raise ConditionValidationError("Drive 폴더 링크에서 폴더 ID를 찾지 못했습니다.")
        else:
            raise ConditionValidationError("Drive 폴더 링크만 지원합니다.")

    if not _FOLDER_ID_RE.match(value):
        raise ConditionValidationError("Drive 폴더 ID 형식이 올바르지 않습니다.")
    return value


def escape_drive_query_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def build_gmail_query(keyword: str, period: Period) -> str:
    query_parts: list[str] = []
    clean_keyword = keyword.strip()
    if clean_keyword:
        query_parts.append(clean_keyword)
    days = _period_days(period)
    if days is not None:
        target_date = datetime.now(timezone.utc).date().toordinal() - days
        date_value = datetime.fromordinal(target_date).strftime("%Y/%m/%d")
        query_parts.append(f"after:{date_value}")
    return " ".join(query_parts)


def build_drive_query(keyword: str, period: Period, drive_folder_ids: list[str]) -> str:
    clauses: list[str] = []
    days = _period_days(period)
    if days is not None:
        target_date = datetime.now(timezone.utc).date().toordinal() - days
        iso_date = datetime.fromordinal(target_date).replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        clauses.append(f"modifiedTime > '{iso_date}'")
    clean_keyword = keyword.strip()
    if clean_keyword:
        escaped_keyword = escape_drive_query_value(clean_keyword)
        clauses.append(f"(name contains '{escaped_keyword}' or fullText contains '{escaped_keyword}')")
    for folder_id in drive_folder_ids:
        clauses.append(f"'{escape_drive_query_value(folder_id)}' in parents")
    return " and ".join(clauses)


def normalize_condition(payload: WikiConditionInput) -> WikiCondition:
    now = utc_now()
    period_value = payload.get("period", "1w")
    if period_value not in _VALID_PERIODS:
        raise ConditionValidationError("지원하지 않는 기간입니다.")
    period: Period = period_value
    drive_folder_ids = [parse_drive_folder_id(folder_id) for folder_id in payload.get("driveFolderIds", []) if folder_id.strip()]
    condition: WikiCondition = {
        "id": payload.get("id") or uuid.uuid4().hex,
        "name": payload.get("name", "").strip(),
        "gmailLabelIds": [label_id.strip() for label_id in payload.get("gmailLabelIds", []) if label_id.strip()],
        "driveFolderIds": drive_folder_ids,
        "keyword": payload.get("keyword", "").strip(),
        "period": period,
        "autoWikiEnabled": payload.get("autoWikiEnabled", True),
        "createdAt": payload.get("createdAt") or now,
        "updatedAt": payload.get("updatedAt") or now,
    }
    validate_condition(condition)
    return condition


def validate_condition(condition: WikiCondition) -> None:
    if not condition["name"]:
        raise ConditionValidationError("조건 이름을 입력하세요.")
    has_scope = bool(
        condition["gmailLabelIds"]
        or condition["driveFolderIds"]
        or condition["keyword"]
        or condition["period"] != "all"
    )
    if not has_scope:
        raise ConditionValidationError("조건 범위를 하나 이상 지정하세요.")


class WikiConditionStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or WIKI_CONDITIONS_FILE

    def list(self) -> list[WikiCondition]:
        if not self.path.exists():
            return []
        try:
            raw_items = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ConditionValidationError("조건 저장 파일을 읽을 수 없습니다.") from exc
        if not isinstance(raw_items, list):
            raise ConditionValidationError("조건 저장 파일 형식이 올바르지 않습니다.")
        conditions: list[WikiCondition] = []
        for raw_item in raw_items:
            if isinstance(raw_item, dict):
                conditions.append(normalize_condition(raw_item))
        return conditions

    def create(self, payload: WikiConditionInput) -> WikiCondition:
        condition = normalize_condition(payload)
        conditions = self.list()
        conditions.append(condition)
        self._write(conditions)
        return condition

    def update(self, condition_id: str, patch: WikiConditionPatch) -> WikiCondition | None:
        conditions = self.list()
        updated_conditions: list[WikiCondition] = []
        updated: WikiCondition | None = None
        for condition in conditions:
            if condition["id"] == condition_id:
                merged: WikiConditionInput = {**condition, **patch, "updatedAt": utc_now()}
                updated = normalize_condition(merged)
                updated_conditions.append(updated)
            else:
                updated_conditions.append(condition)
        if updated is None:
            return None
        self._write(updated_conditions)
        return updated

    def delete(self, condition_id: str) -> bool:
        conditions = self.list()
        kept = [condition for condition in conditions if condition["id"] != condition_id]
        if len(kept) == len(conditions):
            return False
        self._write(kept)
        return True

    def get(self, condition_id: str) -> WikiCondition | None:
        return next((condition for condition in self.list() if condition["id"] == condition_id), None)

    def _write(self, conditions: list[WikiCondition]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_name(f"{self.path.name}.tmp")
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(conditions, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            tmp_path.replace(self.path)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise
