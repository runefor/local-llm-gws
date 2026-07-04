import type { ArtifactLintResult, ArtifactStatus } from "./ArtifactStatusPanel";
import type {
  Artifact,
  CitationMapEntry,
  DateFilterMode,
  EvidenceRecord,
  EvidenceScores,
  EvidenceSet,
  SourceLocation,
} from "./types";

export const toRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value)) : {};
};

export const toStringValue = (value: unknown, fallback = ""): string => {
  return typeof value === "string" ? value : fallback;
};

export const maybeString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

export const toNumberValue = (value: unknown): number | undefined => {
  return typeof value === "number" ? value : undefined;
};

export const normalizeMetadata = (value: unknown): Record<string, string | number | boolean | null> | undefined => {
  const record = toRecord(value);
  const entries = Object.entries(record).filter((entry): entry is [string, string | number | boolean | null] => {
    const entryValue = entry[1];
    return typeof entryValue === "string" || typeof entryValue === "number" || typeof entryValue === "boolean" || entryValue === null;
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const normalizeCitationMap = (value: unknown): CitationMapEntry[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const citations = value.map((item, index) => {
    const record = toRecord(item);
    const evidenceId = toStringValue(record.evidence_id, toStringValue(record.id, `citation-${index}`));
    const sourceLocation = toRecord(record.source_location);
    return {
      evidence_id: evidenceId,
      marker: maybeString(record.marker),
      title: maybeString(record.title),
      source: maybeString(record.source),
      location_label: maybeString(record.location_label) || maybeString(sourceLocation.location_label),
      url: maybeString(record.url) || maybeString(sourceLocation.original_url),
    };
  });
  return citations.length > 0 ? citations : undefined;
};


export const parseArtifactStatus = (value: unknown): ArtifactStatus | undefined => {
  if (value === "candidate" || value === "needs_review" || value === "approved" || value === "source_missing") {
    return value;
  }
  return undefined;
};

export const normalizeArtifactLint = (value: unknown): ArtifactLintResult | undefined => {
  const record = toRecord(value);
  const status = record.status === "passed" || record.status === "failed" ? record.status : undefined;
  const rawIssues = Array.isArray(record.issues) ? record.issues : [];
  const issues = rawIssues.map((item) => {
    const issue = toRecord(item);
    const severity: "warning" | "error" = issue.severity === "warning" ? "warning" : "error";
    return {
      code: toStringValue(issue.code, "lint"),
      severity,
      message: toStringValue(issue.message, "확인 필요"),
      evidence_id: maybeString(issue.evidence_id),
    };
  });
  return status || issues.length > 0 ? { status, issues } : undefined;
};

export const normalizeArtifactFrontmatter = (value: unknown): Record<string, string | number | boolean | string[] | null> | undefined => {
  const record = toRecord(value);
  const entries = Object.entries(record).filter((entry): entry is [string, string | number | boolean | string[] | null] => {
    const entryValue = entry[1];
    return typeof entryValue === "string"
      || typeof entryValue === "number"
      || typeof entryValue === "boolean"
      || entryValue === null
      || (Array.isArray(entryValue) && entryValue.every((item) => typeof item === "string"));
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const normalizeSourceLocation = (value: unknown): SourceLocation | undefined => {
  const record = toRecord(value);
  if (Object.keys(record).length === 0) return undefined;
  return {
    original_url: maybeString(record.original_url),
    location_label: maybeString(record.location_label),
    provider_item_id: maybeString(record.provider_item_id),
    chunk_index: toNumberValue(record.chunk_index),
    message_id: maybeString(record.message_id),
    thread_id: maybeString(record.thread_id),
    rfc822msgid: maybeString(record.rfc822msgid),
    file_id: maybeString(record.file_id),
    resource_key: maybeString(record.resource_key),
  };
};

export const normalizeScores = (value: unknown): EvidenceScores | undefined => {
  const record = toRecord(value);
  const scores = {
    vector_distance: toNumberValue(record.vector_distance),
    rrf_score: toNumberValue(record.rrf_score),
    rank: toNumberValue(record.rank),
  };
  return scores.vector_distance !== undefined || scores.rrf_score !== undefined || scores.rank !== undefined ? scores : undefined;
};

export const formatRelevanceScore = (item: EvidenceRecord): string => {
  const rank = item.scores?.rank;
  if (rank !== undefined && Number.isFinite(rank)) {
    const percent = Math.max(45, 100 - (rank - 1) * 5);
    return `관련도 ${percent}% · ${rank}위`;
  }
  if (item.score !== undefined && Number.isFinite(item.score)) {
    return `관련도 참고값 ${item.score.toFixed(item.score >= 10 ? 0 : 2)}`;
  }
  return "관련도 정보 없음";
};

export const getMetadataString = (item: EvidenceRecord, key: string): string => {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : "";
};

export const getDriveFileType = (item: EvidenceRecord): string => {
  return getMetadataString(item, "mime_type") || getMetadataString(item, "mimeType");
};

export const getGmailSender = (item: EvidenceRecord): string => {
  return getMetadataString(item, "sender") || getMetadataString(item, "from");
};

export const getMatchReason = (item: EvidenceRecord): string => {
  return getMetadataString(item, "match_reason");
};

export const formatEvidenceSourceLine = (item: EvidenceRecord): string => {
  const location = item.source_location;
  return [
    item.source,
    item.date,
    item.location_label || location?.location_label,
    item.original_url || location?.original_url,
    location?.provider_item_id || location?.message_id || location?.file_id,
  ].filter(Boolean).join(" | ");
};

export const formatFileTypeLabel = (mimeType: string): string => {
  if (mimeType === "application/vnd.google-apps.document") return "Google 문서";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "Google 스프레드시트";
  if (mimeType === "application/vnd.google-apps.presentation") return "Google 프레젠테이션";
  if (mimeType === "text/plain") return "텍스트";
  return mimeType.split("/").pop()?.replace("vnd.google-apps.", "Google ") || mimeType;
};

export const parseDateFilterMode = (value: string): DateFilterMode => {
  if (value === "known" || value === "unknown") return value;
  return "all";
};

export const normalizeEvidenceRecord = (value: unknown, index: number): EvidenceRecord => {
  const record = toRecord(value);
  const sourceLocation = normalizeSourceLocation(record.source_location);
  const evidenceId = toStringValue(record.evidence_id, toStringValue(record.id, toStringValue(record.doc_id, `evidence-${index}`)));
  const id = toStringValue(record.id, evidenceId);
  const chunkId = toStringValue(record.chunk_id, id);
  const title = toStringValue(record.title, toStringValue(record.subject, toStringValue(record.name, "제목 없는 근거")));
  const contentSnapshot = toStringValue(record.content_snapshot, toStringValue(record.content, toStringValue(record.text, "")));
  const snippet = toStringValue(record.snippet, contentSnapshot ? `${contentSnapshot.slice(0, 240)}${contentSnapshot.length > 240 ? "..." : ""}` : "미리보기 내용이 없습니다.");
  const scores = toRecord(record.scores);

  return {
    id,
    evidence_id: evidenceId,
    chunk_id: chunkId,
    doc_id: maybeString(record.doc_id),
    title,
    source: toStringValue(record.source, "unknown"),
    snippet,
    content_snapshot: contentSnapshot || snippet,
    location_label: maybeString(record.location_label) || sourceLocation?.location_label || maybeString(record.location),
    original_url: maybeString(record.original_url) || sourceLocation?.original_url,
    open_url: maybeString(record.open_url),
    url: maybeString(record.url),
    date: maybeString(record.date) || maybeString(record.created_at),
    score: toNumberValue(record.score) ?? toNumberValue(scores.rrf_score) ?? toNumberValue(scores.vector_distance),
    scores: normalizeScores(record.scores),
    source_location: sourceLocation,
    citation_map: normalizeCitationMap(record.citation_map),
    metadata: normalizeMetadata(record.metadata),
  };
};

export const emptyEvidenceSetFallback: EvidenceSet = {
  id: "",
  title: "",
  original_query: "",
  evidence_items: [],
  notes: "",
  tags: [],
};

export const normalizeEvidenceSet = (value: unknown, fallback: EvidenceSet = emptyEvidenceSetFallback): EvidenceSet => {
  const record = toRecord(value);
  const evidenceItems = Array.isArray(record.evidence_items)
    ? record.evidence_items.map((item, index) => normalizeEvidenceRecord(item, index))
    : fallback.evidence_items;
  const rawTags = Array.isArray(record.tags) ? record.tags : fallback.tags;
  const tags = rawTags.filter((tag): tag is string => typeof tag === "string");

  return {
    id: toStringValue(record.id, fallback.id),
    title: toStringValue(record.title, fallback.title),
    original_query: toStringValue(record.original_query, fallback.original_query),
    evidence_items: evidenceItems,
    notes: toStringValue(record.notes, fallback.notes),
    tags,
    created_at: maybeString(record.created_at) || fallback.created_at,
    updated_at: maybeString(record.updated_at) || fallback.updated_at,
  };
};

export const normalizeArtifact = (value: unknown, fallbackEvidenceSetId?: string): Artifact => {
  const record = toRecord(value);
  return {
    id: toStringValue(record.id, "artifact-draft"),
    evidence_set_id: maybeString(record.evidence_set_id) || fallbackEvidenceSetId,
    artifact_type: toStringValue(record.artifact_type, "summary"),
    title: maybeString(record.title),
    content: toStringValue(record.content, toStringValue(record.markdown, toStringValue(record.body, ""))),
    instruction: maybeString(record.instruction),
    status: parseArtifactStatus(record.status),
    frontmatter: normalizeArtifactFrontmatter(record.frontmatter),
    lint: normalizeArtifactLint(record.lint),
    citation_map: normalizeCitationMap(record.citation_map),
    created_at: maybeString(record.created_at),
    updated_at: maybeString(record.updated_at),
    approved_at: typeof record.approved_at === "string" || record.approved_at === null ? record.approved_at : undefined,
  };
};
