import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const API_BASE = "http://localhost:18731";

type Strictness = "strict" | "balanced" | "free";
type SourceType = "gmail" | "drive" | "wiki";
type DateRange = "all" | "7d" | "30d" | "90d" | "365d";

interface ChatOptions {
  grounding_enabled: boolean;
  source_types: SourceType[];
  date_range: DateRange;
  strictness: Strictness;
  drive_folder: string;
  evidence_set_id: string;
  search_scope: string;
  top_k: number;
  auto_compression: boolean;
}

interface ChatSource {
  evidence_id: string;
  source: string;
  title: string;
  snippet: string;
  date?: string;
  original_url?: string;
  location_label?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  used_options: ChatOptions;
  sources: ChatSource[];
  status: "ok" | "source_missing" | "llm_error";
}

interface ChatSessionSummary {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
  options: ChatOptions;
}

interface ChatSession extends ChatSessionSummary {
  messages: ChatMessage[];
}

interface EvidenceSetSummary {
  id: string;
  title: string;
  evidence_items?: unknown[];
  updated_at?: string;
}

type MarkdownBlock =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] }
  | { readonly kind: "code"; readonly text: string };

const defaultOptions: ChatOptions = {
  grounding_enabled: false,
  source_types: ["drive", "gmail"],
  date_range: "all",
  strictness: "strict",
  drive_folder: "",
  evidence_set_id: "",
  search_scope: "",
  top_k: 8,
  auto_compression: true,
};

const strictnessLabels: Record<Strictness, string> = {
  strict: "엄격",
  balanced: "균형",
  free: "자유",
};

const dateRangeLabels: Record<DateRange, string> = {
  all: "전체 기간",
  "7d": "최근 7일",
  "30d": "최근 30일",
  "90d": "최근 90일",
  "365d": "최근 1년",
};

const sourceLabels: Record<SourceType, string> = {
  gmail: "Gmail",
  drive: "Drive",
  wiki: "Wiki/정보 묶음",
};

const safeSourceUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok || data.status === "error") {
    throw new Error(data.message || "요청 처리에 실패했습니다.");
  }
  return data as T;
}

const headingFrom = (line: string): MarkdownBlock | null => {
  const match = /^(#{1,3})\s+(.+)$/.exec(line);
  if (!match) return null;
  const marker = match[1];
  const text = match[2]?.trim() ?? "";
  if (!text) return null;
  if (marker === "#") return { kind: "heading", level: 1, text };
  if (marker === "##") return { kind: "heading", level: 2, text };
  return { kind: "heading", level: 3, text };
};

const listItemFrom = (line: string): string | null => {
  const match = /^[-*]\s+(.+)$/.exec(line);
  return match ? match[1]?.trim() ?? "" : null;
};

const pushParagraph = (blocks: MarkdownBlock[], paragraphLines: string[]): void => {
  const text = paragraphLines.join(" ").trim();
  if (text) blocks.push({ kind: "paragraph", text });
  paragraphLines.length = 0;
};

const parseMarkdownBlocks = (content: string): readonly MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;

  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  };

  const flushCode = (): void => {
    blocks.push({ kind: "code", text: codeLines.join("\n") });
    codeLines = [];
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        pushParagraph(blocks, paragraphLines);
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line) {
      pushParagraph(blocks, paragraphLines);
      flushList();
      continue;
    }

    const heading = headingFrom(line);
    if (heading) {
      pushParagraph(blocks, paragraphLines);
      flushList();
      blocks.push(heading);
      continue;
    }

    const listItem = listItemFrom(line);
    if (listItem) {
      pushParagraph(blocks, paragraphLines);
      listItems.push(listItem);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  if (inCode) flushCode();
  pushParagraph(blocks, paragraphLines);
  flushList();
  return blocks;
};

const renderInlineMarkdown = (text: string): ReactNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em] text-text-primary">{part.slice(1, -1)}</code>;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const safeUrl = safeSourceUrl(link[2]);
      return safeUrl ? (
        <a key={index} href={safeUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
          {link[1]}
        </a>
      ) : link[1];
    }
    return part;
  });
};

function MarkdownAnswer({ content }: { readonly content: string }) {
  const blocks = parseMarkdownBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          if (block.level === 1) return <h1 key={key} className="pt-1 text-xl font-semibold leading-tight text-text-primary">{renderInlineMarkdown(block.text)}</h1>;
          if (block.level === 2) return <h2 key={key} className="pt-1 text-lg font-semibold leading-snug text-text-primary">{renderInlineMarkdown(block.text)}</h2>;
          return <h3 key={key} className="pt-1 text-base font-semibold leading-snug text-text-primary">{renderInlineMarkdown(block.text)}</h3>;
        }
        if (block.kind === "list") {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "code") {
          return <pre key={key} className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-surface p-3 font-mono text-xs leading-6 text-text-primary">{block.text}</pre>;
        }
        return <p key={key}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

export default function ChatPanel() {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [evidenceSets, setEvidenceSets] = useState<EvidenceSetSummary[]>([]);
  const [options, setOptions] = useState<ChatOptions>(defaultOptions);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const activeTitle = activeSession?.title || "새 채팅";
  const hasGrounding = options.grounding_enabled;

  const selectedSourceText = useMemo(() => {
    if (!hasGrounding) return "일반 LLM 대화";
    return options.source_types.map((source) => sourceLabels[source]).join(", ") || "선택된 자료 없음";
  }, [hasGrounding, options.source_types]);

  const loadSessions = async () => {
    const data = await readJson<{ sessions: ChatSessionSummary[] }>(await fetch(`${API_BASE}/api/chat/sessions`));
    setSessions(data.sessions);
    if (!activeSession && data.sessions.length > 0) {
      await loadSession(data.sessions[0].id);
    }
  };

  const loadSession = async (sessionId: string) => {
    const data = await readJson<{ session: ChatSession }>(await fetch(`${API_BASE}/api/chat/sessions/${encodeURIComponent(sessionId)}`));
    setActiveSession(data.session);
    setOptions({ ...defaultOptions, ...data.session.options });
  };

  useEffect(() => {
    const loadInitialData = async () => {
      const [sessionsData, evidenceSetsData] = await Promise.all([
        readJson<{ sessions: ChatSessionSummary[] }>(await fetch(`${API_BASE}/api/chat/sessions`)),
        readJson<{ evidence_sets: EvidenceSetSummary[] }>(await fetch(`${API_BASE}/api/evidence-sets`)),
      ]);
      setSessions(sessionsData.sessions);
      setEvidenceSets(evidenceSetsData.evidence_sets);
      if (sessionsData.sessions.length > 0) {
        const data = await readJson<{ session: ChatSession }>(
          await fetch(`${API_BASE}/api/chat/sessions/${encodeURIComponent(sessionsData.sessions[0].id)}`)
        );
        setActiveSession(data.session);
        setOptions({ ...defaultOptions, ...data.session.options });
      }
    };

    loadInitialData().catch((error) => {
      setNotice(error instanceof Error ? error.message : "채팅 정보를 불러오지 못했습니다.");
    });
  }, []);

  const createSession = async (): Promise<ChatSession> => {
    const data = await readJson<{ session: ChatSession }>(await fetch(`${API_BASE}/api/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", options }),
    }));
    setActiveSession(data.session);
    setOptions({ ...defaultOptions, ...data.session.options });
    await loadSessions();
    return data.session;
  };

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || loading) return;
    setLoading(true);
    setNotice("");
    try {
      const session = activeSession || await createSession();
      setDraft("");
      const data = await readJson<{ session: ChatSession }>(await fetch(`${API_BASE}/api/chat/sessions/${encodeURIComponent(session.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, options }),
      }));
      setActiveSession(data.session);
      setOptions({ ...defaultOptions, ...data.session.options });
      await loadSessions();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "답변 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (source: SourceType) => {
    setOptions((current) => {
      const exists = current.source_types.includes(source);
      const sourceTypes = exists
        ? current.source_types.filter((item) => item !== source)
        : [...current.source_types, source];
      return { ...current, source_types: sourceTypes };
    });
  };

  return (
    <div className="h-full min-h-0 rounded-3xl border border-surface-variant/70 bg-surface shadow-sm flex overflow-hidden">
      <aside className="w-72 border-r border-surface-variant/70 bg-background p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">채팅</h2>
            <p className="text-xs text-text-secondary">LLM 대화와 RAG/Wiki 근거 답변</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveSession(null);
              setOptions(defaultOptions);
              setDraft("");
            }}
            className="h-9 w-9 rounded-full bg-primary text-white hover:bg-primary/95 transition-colors flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            title="새 채팅"
          >
            <span className="material-symbols-rounded text-lg">add</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
          {sessions.length === 0 && (
            <div className="rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-text-secondary">
              아직 저장된 채팅이 없습니다. 첫 질문을 보내면 로컬에 저장됩니다.
            </div>
          )}
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => {
                loadSession(session.id).catch((error) => {
                  setNotice(error instanceof Error ? error.message : "채팅을 열지 못했습니다.");
                });
              }}
              className={`w-full rounded-2xl px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                activeSession?.id === session.id
                  ? "bg-primary-container text-primary"
                  : "bg-surface hover:bg-primary-container/40 text-text-primary"
              }`}
            >
              <span className="block truncate text-sm font-semibold">{session.title}</span>
              <span className="mt-1 block text-[11px] text-text-secondary">
                메시지 {session.message_count}개 · {session.options.grounding_enabled ? strictnessLabels[session.options.strictness] : "일반"}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-w-0 flex-1 flex flex-col">
        <header className="border-b border-surface-variant/70 bg-background px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-normal text-text-primary">{activeTitle}</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {selectedSourceText} · {hasGrounding ? strictnessLabels[options.strictness] : "근거 없이 일반 대화"}
              </p>
            </div>
            <label className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-text-primary">
              <input
                type="checkbox"
                checked={options.grounding_enabled}
                onChange={(event) => setOptions((current) => ({ ...current, grounding_enabled: event.target.checked }))}
                className="h-4 w-4 accent-primary"
              />
              RAG/Wiki 근거 사용
            </label>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
          {notice && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-text-secondary">
              {notice}
            </div>
          )}

          {(!activeSession || activeSession.messages.length === 0) && (
            <div className="mx-auto max-w-2xl rounded-3xl border border-primary-container bg-background p-6 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-primary">
                <span className="material-symbols-rounded">forum</span>
              </div>
              <h3 className="text-lg font-semibold text-text-primary">LLM과 바로 대화하거나, 자료 기반 답변으로 전환하세요</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                기본은 일반 LLM 대화입니다. RAG/Wiki 근거 사용을 켜면 자료 종류, 기간, 출처 엄격도와 고급 범위를 함께 저장합니다.
              </p>
            </div>
          )}

          {activeSession?.messages.map((message) => (
            <article
              key={message.id}
              className={`max-w-3xl rounded-3xl px-5 py-4 shadow-sm ${
                message.role === "user"
                  ? "ml-auto bg-primary text-white"
                  : "mr-auto border border-surface-variant/70 bg-background text-text-primary"
              }`}
            >
              {message.role === "assistant" ? (
                <MarkdownAnswer content={message.content} />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
              )}
              {message.role === "assistant" && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-primary-container px-3 py-1 font-semibold text-primary">
                      {message.used_options.grounding_enabled ? strictnessLabels[message.used_options.strictness] : "일반 LLM"}
                    </span>
                    {message.status === "source_missing" && (
                      <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">자료에서 못 찾음</span>
                    )}
                  </div>
                  {message.sources.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-text-secondary">사용한 출처</p>
                      <div className="grid gap-2">
                        {message.sources.map((source) => {
                          const safeUrl = safeSourceUrl(source.original_url);
                          const sourceBody = (
                            <>
                              <span className="block font-semibold text-text-primary">
                                [{source.evidence_id}] {source.title}
                              </span>
                              <span className="mt-1 line-clamp-2 block leading-relaxed">{source.snippet}</span>
                              <span className="mt-1 block text-[10px]">
                                {sourceLabels[source.source as SourceType] || source.source} · {source.location_label || source.date || "위치 정보 없음"}
                              </span>
                            </>
                          );
                          return safeUrl ? (
                            <a
                              key={`${message.id}-${source.evidence_id}`}
                              href={safeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-2xl border border-surface-variant/70 bg-surface px-3 py-2 text-xs text-text-secondary hover:border-primary-container hover:bg-primary-container/20"
                            >
                              {sourceBody}
                            </a>
                          ) : (
                            <div
                              key={`${message.id}-${source.evidence_id}`}
                              className="rounded-2xl border border-surface-variant/70 bg-surface px-3 py-2 text-xs text-text-secondary"
                            >
                              {sourceBody}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="border-t border-surface-variant/70 bg-background p-4">
          <div className="mb-4 rounded-3xl border border-surface-variant/70 bg-surface p-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-text-primary">자료 종류</p>
                <div className="flex flex-wrap gap-2">
                  {(["gmail", "drive", "wiki"] as SourceType[]).map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => toggleSource(source)}
                      disabled={!hasGrounding}
                      className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        options.source_types.includes(source) && hasGrounding
                          ? "bg-primary text-white"
                          : "bg-background text-text-secondary hover:bg-primary-container/40 disabled:opacity-50"
                      }`}
                    >
                      {sourceLabels[source]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-text-primary">기간</span>
                <select
                  value={options.date_range}
                  disabled={!hasGrounding}
                  onChange={(event) => setOptions((current) => ({ ...current, date_range: event.target.value as DateRange }))}
                  className="w-full rounded-2xl border border-surface-variant bg-background px-3 py-2 text-sm text-text-primary focus:outline-primary disabled:opacity-50"
                >
                  {Object.entries(dateRangeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-text-primary">출처 엄격도</span>
                <select
                  value={options.strictness}
                  disabled={!hasGrounding}
                  onChange={(event) => setOptions((current) => ({ ...current, strictness: event.target.value as Strictness }))}
                  className="w-full rounded-2xl border border-surface-variant bg-background px-3 py-2 text-sm text-text-primary focus:outline-primary disabled:opacity-50"
                >
                  <option value="strict">엄격: 자료에서만 답변</option>
                  <option value="balanced">균형: 자료 우선, 추론 분리</option>
                  <option value="free">자유: 일반 지식 허용</option>
                </select>
              </label>
            </div>

            <details className="mt-4 rounded-2xl bg-background px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary">고급 검색 범위</summary>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-text-primary">Drive 폴더 힌트</span>
                  <input
                    value={options.drive_folder}
                    disabled={!hasGrounding}
                    onChange={(event) => setOptions((current) => ({ ...current, drive_folder: event.target.value }))}
                    placeholder="폴더명 또는 ID 일부로 좁히기"
                    className="w-full rounded-2xl border border-surface-variant bg-white px-3 py-2 text-sm focus:outline-primary disabled:opacity-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-text-primary">Wiki/정보 묶음</span>
                  <select
                    value={options.evidence_set_id}
                    disabled={!hasGrounding}
                    onChange={(event) => setOptions((current) => ({ ...current, evidence_set_id: event.target.value }))}
                    className="w-full rounded-2xl border border-surface-variant bg-white px-3 py-2 text-sm focus:outline-primary disabled:opacity-50"
                  >
                    <option value="">선택하지 않음</option>
                    {evidenceSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.title} ({set.evidence_items?.length ?? 0})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-text-primary">검색어 보강</span>
                  <input
                    value={options.search_scope}
                    disabled={!hasGrounding}
                    onChange={(event) => setOptions((current) => ({ ...current, search_scope: event.target.value }))}
                    placeholder="예: 계약, 회의록, 프로젝트명"
                    className="w-full rounded-2xl border border-surface-variant bg-white px-3 py-2 text-sm focus:outline-primary disabled:opacity-50"
                  />
                </label>
              </div>
            </details>
          </div>

          <div className="flex items-end gap-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  sendMessage();
                }
              }}
              placeholder="질문을 입력하세요. Ctrl/⌘ + Enter로 보낼 수 있습니다."
              className="min-h-24 flex-1 resize-none rounded-3xl border border-surface-variant bg-white px-4 py-3 text-sm leading-relaxed text-text-primary focus:outline focus:outline-2 focus:outline-primary"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!draft.trim() || loading}
              className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary/95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {loading ? "답변 중" : "보내기"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
