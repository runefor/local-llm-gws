import type { WorkspaceItem } from "../context/AppContext";

export type OriginalDetail = {
  readonly id: string;
  readonly type: "gmail" | "drive";
  readonly title: string;
  readonly subtitle: string;
  readonly content: string;
  readonly content_type: string;
  readonly open_url?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const stringFrom = (value: unknown, fallback = ""): string => {
  return typeof value === "string" ? value : fallback;
};

const errorMessageFrom = (data: Record<string, unknown>): string => {
  const message = stringFrom(data["message"]);
  if (message) return message;

  const detail = data["detail"];
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return "요청 파라미터가 맞지 않아 원문을 불러오지 못했습니다.";

  return "원문을 불러오지 못했습니다.";
};

const parseOriginalDetail = (value: unknown): OriginalDetail | null => {
  if (!isRecord(value)) return null;
  const type = value["type"];
  if (type !== "gmail" && type !== "drive") return null;

  return {
    id: stringFrom(value["id"]),
    type,
    title: stringFrom(value["title"], "(제목 없음)"),
    subtitle: stringFrom(value["subtitle"], "알 수 없음"),
    content: stringFrom(value["content"], "표시할 원문 내용이 없습니다."),
    content_type: stringFrom(value["content_type"], "text/plain"),
    open_url: stringFrom(value["open_url"]) || undefined,
  };
};

export const fetchOriginalDetail = async (item: WorkspaceItem): Promise<OriginalDetail> => {
  const params = new URLSearchParams();
  if (item.type === "drive") {
    params.set("mime_type", item.subtitle);
    if (item.resourceKey) {
      params.set("resource_key", item.resourceKey);
    }
  }

  const endpoint = item.type === "gmail"
    ? `http://localhost:18731/api/gws/originals/gmail/${encodeURIComponent(item.id)}`
    : `http://localhost:18731/api/gws/originals/drive/${encodeURIComponent(item.id)}?${params.toString()}`;
  const response = await fetch(endpoint);
  const data: unknown = await response.json();

  if (!isRecord(data)) {
    throw new Error("원문을 불러오지 못했습니다.");
  }

  if (data["status"] !== "success") {
    throw new Error(errorMessageFrom(data));
  }

  const detail = parseOriginalDetail(data["original"]);
  if (!detail) {
    throw new Error("원문 응답 형식이 올바르지 않습니다.");
  }

  return detail;
};
