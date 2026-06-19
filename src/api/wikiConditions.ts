export type WikiConditionPeriod = "1w" | "1m" | "3m" | "all";

export type WikiCondition = {
  id: string;
  name: string;
  gmailLabelIds: string[];
  driveFolderIds: string[];
  keyword: string;
  period: WikiConditionPeriod;
  autoWikiEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WikiConditionDraft = {
  name: string;
  gmailLabelIds: string[];
  driveFolderIds: string[];
  keyword: string;
  period: WikiConditionPeriod;
  autoWikiEnabled: boolean;
};

export type ConditionRecord = {
  source: "gmail" | "drive";
  id: string;
  title: string;
  subject?: string;
  from?: string;
  date?: string;
  labelIds?: string[];
  snippet?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  locationStatus?: string;
  conditionId: string;
};

export type WikiRunStatus = "created" | "skipped" | "failed" | "warning_required";

export type WikiRunState = {
  auto: boolean;
  status: WikiRunStatus;
  message: string;
  artifact_id?: string;
  artifact_status?: "candidate";
  markdown?: string;
  warning?: {
    title: string;
    message: string;
  };
};

export type WikiConditionRunResult = {
  status: "success" | "error";
  message?: string;
  condition?: WikiCondition;
  gmail?: { count: number; items: ConditionRecord[]; has_more: boolean };
  drive?: { count: number; items: ConditionRecord[]; has_more: boolean };
  records?: ConditionRecord[];
  wiki?: WikiRunState;
};

type ConditionListResponse = {
  status: "success" | "error";
  message?: string;
  conditions: WikiCondition[];
};

type ConditionResponse = {
  status: "success" | "error";
  message?: string;
  condition?: WikiCondition;
};

const API_BASE = "http://localhost:18731";

const parseJson = async <T>(response: Response): Promise<T> => {
  return response.json() as Promise<T>;
};

export const listWikiConditions = async (): Promise<ConditionListResponse> => {
  const response = await fetch(`${API_BASE}/api/wiki-conditions`);
  return parseJson<ConditionListResponse>(response);
};

export const createWikiCondition = async (draft: WikiConditionDraft): Promise<ConditionResponse> => {
  const response = await fetch(`${API_BASE}/api/wiki-conditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return parseJson<ConditionResponse>(response);
};

export const runWikiCondition = async (
  conditionId: string,
  confirmExternalLlm: boolean
): Promise<WikiConditionRunResult> => {
  const response = await fetch(`${API_BASE}/api/wiki-conditions/${conditionId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm_external_llm: confirmExternalLlm }),
  });
  return parseJson<WikiConditionRunResult>(response);
};
