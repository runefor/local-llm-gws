import type { GmailItem } from "../context/AppContext";

export const metadataPeriodOptions = [
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "90d", label: "최근 90일" },
  { value: "all", label: "전체 기간" },
] as const;

export type MetadataPeriod = (typeof metadataPeriodOptions)[number]["value"];

type MetadataExampleChip = {
  readonly label: string;
  readonly values: {
    readonly period: MetadataPeriod;
    readonly keyword: string;
    readonly hasAttachment?: boolean;
  };
};

export const metadataExampleChips: readonly MetadataExampleChip[] = [
  { label: "첨부 있는 최근 메일", values: { period: "30d", hasAttachment: true, keyword: "" } },
  { label: "이력서/지원", values: { period: "90d", keyword: "이력서 OR 지원" } },
  { label: "논문/리서치", values: { period: "90d", keyword: "논문 OR research OR paper" } },
] as const;

export function getMessageId(item: GmailItem): string {
  return item.messageId || item.id;
}

export function formatMailDate(date?: string): string {
  if (!date) return "날짜 없음";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return date;
  return parsedDate.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildMetadataQuery(options: {
  readonly keyword: string;
  readonly sender: string;
  readonly period: MetadataPeriod;
  readonly hasAttachment: boolean;
}): string {
  const queryParts = [
    options.keyword.trim(),
    options.sender.trim() ? `from:${options.sender.trim()}` : "",
    options.period === "all" ? "" : `newer_than:${options.period}`,
    options.hasAttachment ? "has:attachment" : "",
  ].filter(Boolean);
  return queryParts.join(" ");
}
