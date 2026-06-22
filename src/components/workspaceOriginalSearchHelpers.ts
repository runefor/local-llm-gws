export const driveTypeOptions = [
  { value: "all", label: "전체 형식", mimeTypes: [] },
  { value: "docs", label: "문서", mimeTypes: ["application/vnd.google-apps.document", "text/plain"] },
  { value: "sheets", label: "스프레드시트", mimeTypes: ["application/vnd.google-apps.spreadsheet"] },
  { value: "pdf", label: "PDF", mimeTypes: ["application/pdf"] },
] as const;

export const drivePeriodOptions = [
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "90d", label: "최근 90일" },
  { value: "all", label: "전체 기간" },
] as const;

export type DriveTypeFilter = (typeof driveTypeOptions)[number]["value"];
export type DrivePeriodFilter = (typeof drivePeriodOptions)[number]["value"];

type DriveSearchOptions = {
  readonly keyword: string;
  readonly typeFilter: DriveTypeFilter;
  readonly period: DrivePeriodFilter;
  readonly sharedWithMe: boolean;
};

const dayCounts: Record<Exclude<DrivePeriodFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function modifiedAfterClause(period: DrivePeriodFilter): string {
  if (period === "all") return "modifiedTime > '1970-01-01T00:00:00.000Z'";
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - dayCounts[period]);
  date.setUTCHours(0, 0, 0, 0);
  return `modifiedTime > '${date.toISOString()}'`;
}

export function buildDriveOriginalQuery(options: DriveSearchOptions): string {
  const selectedType = driveTypeOptions.find((option) => option.value === options.typeFilter);
  const escapedKeyword = escapeDriveQueryValue(options.keyword.trim());
  const typeClauses = selectedType?.mimeTypes.map((mimeType) => `mimeType='${mimeType}'`) ?? [];
  const queryParts = [
    escapedKeyword ? `(name contains '${escapedKeyword}' or fullText contains '${escapedKeyword}')` : "",
    modifiedAfterClause(options.period),
    typeClauses.length ? `(${typeClauses.join(" or ")})` : "",
    options.sharedWithMe ? "sharedWithMe" : "",
  ].filter(Boolean);
  return queryParts.join(" and ");
}
