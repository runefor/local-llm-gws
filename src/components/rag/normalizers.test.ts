import { describe, expect, it } from "vitest";
import {
  formatEvidenceSourceLine,
  formatFileTypeLabel,
  formatRelevanceScore,
  normalizeArtifact,
  normalizeEvidenceRecord,
  normalizeEvidenceSet,
  normalizeMetadata,
  normalizeSourceLocation,
  parseDateFilterMode,
} from "./normalizers";

describe("normalizeEvidenceRecord", () => {
  it("fills deterministic fallbacks for an empty object", () => {
    const record = normalizeEvidenceRecord({}, 0);
    expect(record).toMatchObject({
      id: "evidence-0",
      evidence_id: "evidence-0",
      chunk_id: "evidence-0",
      title: "제목 없는 근거",
      source: "unknown",
      snippet: "미리보기 내용이 없습니다.",
      content_snapshot: "미리보기 내용이 없습니다.",
    });
    expect(record.metadata).toBeUndefined();
    expect(record.scores).toBeUndefined();
    expect(record.source_location).toBeUndefined();
  });

  it("derives id/evidence_id/chunk_id from the first available field", () => {
    expect(normalizeEvidenceRecord({ doc_id: "d1" }, 3)).toMatchObject({
      evidence_id: "d1",
      id: "d1",
      chunk_id: "d1",
      doc_id: "d1",
    });
    expect(normalizeEvidenceRecord({ id: "i1", chunk_id: "c1" }, 0)).toMatchObject({
      evidence_id: "i1",
      id: "i1",
      chunk_id: "c1",
    });
  });

  it("reads legacy field names (subject/name, content, created_at)", () => {
    const record = normalizeEvidenceRecord(
      { subject: "제목S", name: "이름N", content: "본문내용", created_at: "2020-01-02" },
      0
    );
    expect(record.title).toBe("제목S");
    expect(record.content_snapshot).toBe("본문내용");
    expect(record.date).toBe("2020-01-02");
  });

  it("falls back title to name when subject is absent", () => {
    expect(normalizeEvidenceRecord({ name: "이름N" }, 0).title).toBe("이름N");
  });

  it("synthesizes a truncated snippet from content when snippet is missing", () => {
    const content = "a".repeat(300);
    const record = normalizeEvidenceRecord({ content_snapshot: content }, 0);
    expect(record.snippet).toBe(`${"a".repeat(240)}...`);
    expect(record.content_snapshot).toBe(content);
  });

  it("does not append ellipsis when content is short", () => {
    const record = normalizeEvidenceRecord({ content: "짧은본문" }, 0);
    expect(record.snippet).toBe("짧은본문");
  });

  it("falls back location/url to source_location fields", () => {
    const record = normalizeEvidenceRecord(
      { source_location: { location_label: "p.3", original_url: "http://x/1" } },
      0
    );
    expect(record.location_label).toBe("p.3");
    expect(record.original_url).toBe("http://x/1");
    expect(record.source_location).toMatchObject({ location_label: "p.3", original_url: "http://x/1" });
  });

  it("derives score from scores.rrf_score when top-level score is absent", () => {
    expect(normalizeEvidenceRecord({ scores: { rrf_score: 0.42 } }, 0).score).toBe(0.42);
    expect(normalizeEvidenceRecord({ scores: { vector_distance: 1.1 } }, 0).score).toBe(1.1);
    expect(normalizeEvidenceRecord({ score: 9, scores: { rrf_score: 0.42 } }, 0).score).toBe(9);
  });

  it("keeps only primitive metadata entries", () => {
    const record = normalizeEvidenceRecord(
      { metadata: { sender: "kim", count: 2, ok: true, nested: { a: 1 }, list: [1] } },
      0
    );
    expect(record.metadata).toEqual({ sender: "kim", count: 2, ok: true });
  });
});

describe("normalizeSourceLocation", () => {
  it("returns undefined for an empty or non-object value", () => {
    expect(normalizeSourceLocation({})).toBeUndefined();
    expect(normalizeSourceLocation(undefined)).toBeUndefined();
    expect(normalizeSourceLocation("x")).toBeUndefined();
  });

  it("passes through known string/number fields", () => {
    expect(
      normalizeSourceLocation({ message_id: "m1", chunk_index: 4, thread_id: "t1" })
    ).toEqual({
      original_url: undefined,
      location_label: undefined,
      provider_item_id: undefined,
      chunk_index: 4,
      message_id: "m1",
      thread_id: "t1",
      rfc822msgid: undefined,
      file_id: undefined,
      resource_key: undefined,
    });
  });
});

describe("normalizeMetadata", () => {
  it("returns undefined when no primitive entries remain", () => {
    expect(normalizeMetadata({ nested: { a: 1 }, list: [1, 2] })).toBeUndefined();
    expect(normalizeMetadata(undefined)).toBeUndefined();
  });

  it("keeps string, number, boolean and null values", () => {
    expect(normalizeMetadata({ a: "x", b: 1, c: false, d: null, e: [1] })).toEqual({
      a: "x",
      b: 1,
      c: false,
      d: null,
    });
  });
});

describe("normalizeEvidenceSet", () => {
  it("normalizes nested evidence items and filters non-string tags", () => {
    const set = normalizeEvidenceSet({
      id: "set1",
      title: "묶음",
      original_query: "질의",
      evidence_items: [{ id: "e1" }, {}],
      tags: ["a", 3, "b", null],
    });
    expect(set.id).toBe("set1");
    expect(set.evidence_items).toHaveLength(2);
    expect(set.evidence_items[0]).toMatchObject({ id: "e1" });
    expect(set.evidence_items[1].id).toBe("evidence-1");
    expect(set.tags).toEqual(["a", "b"]);
  });

  it("applies fallback fields when input is empty", () => {
    const set = normalizeEvidenceSet({});
    expect(set).toMatchObject({ id: "", title: "", original_query: "", tags: [] });
    expect(set.evidence_items).toEqual([]);
  });
});

describe("normalizeArtifact", () => {
  it("fills defaults for an empty object", () => {
    expect(normalizeArtifact({})).toMatchObject({
      id: "artifact-draft",
      artifact_type: "summary",
      content: "",
    });
  });

  it("reads legacy content field 'markdown' and applies fallback evidence set id", () => {
    const artifact = normalizeArtifact({ markdown: "# 제목" }, "set-9");
    expect(artifact.content).toBe("# 제목");
    expect(artifact.evidence_set_id).toBe("set-9");
  });

  it("preserves an explicit null approved_at but drops invalid types", () => {
    expect(normalizeArtifact({ approved_at: null }).approved_at).toBeNull();
    expect(normalizeArtifact({ approved_at: 123 }).approved_at).toBeUndefined();
  });
});

describe("formatRelevanceScore", () => {
  const record = (over: Record<string, unknown>) => normalizeEvidenceRecord(over, 0);

  it.each([
    [{ scores: { rank: 1 } }, "관련도 100% · 1위"],
    [{ scores: { rank: 2 } }, "관련도 95% · 2위"],
    [{ scores: { rank: 20 } }, "관련도 45% · 20위"],
  ])("formats rank %o", (input, expected) => {
    expect(formatRelevanceScore(record(input))).toBe(expected);
  });

  it("uses the reference score when no rank is present", () => {
    expect(formatRelevanceScore(record({ score: 5 }))).toBe("관련도 참고값 5.00");
    expect(formatRelevanceScore(record({ score: 12 }))).toBe("관련도 참고값 12");
  });

  it("reports missing info when neither rank nor score exist", () => {
    expect(formatRelevanceScore(record({}))).toBe("관련도 정보 없음");
  });
});

describe("formatFileTypeLabel", () => {
  it.each([
    ["application/vnd.google-apps.document", "Google 문서"],
    ["application/vnd.google-apps.spreadsheet", "Google 스프레드시트"],
    ["application/vnd.google-apps.presentation", "Google 프레젠테이션"],
    ["text/plain", "텍스트"],
    ["application/pdf", "pdf"],
  ])("maps %s", (mime, expected) => {
    expect(formatFileTypeLabel(mime)).toBe(expected);
  });
});

describe("formatEvidenceSourceLine", () => {
  it("joins present fields with a pipe and skips empty ones", () => {
    const record = normalizeEvidenceRecord(
      { source: "gmail", date: "2021-05-01", source_location: { message_id: "m1" } },
      0
    );
    expect(formatEvidenceSourceLine(record)).toBe("gmail | 2021-05-01 | m1");
  });
});

describe("parseDateFilterMode", () => {
  it.each([
    ["known", "known"],
    ["unknown", "unknown"],
    ["all", "all"],
    ["garbage", "all"],
  ])("maps %s -> %s", (input, expected) => {
    expect(parseDateFilterMode(input)).toBe(expected);
  });
});
