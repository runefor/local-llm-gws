import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { classifyLlmEndpoint } from "../utils/llmEndpoint";
import type { OriginalExportDocument, WorkspaceItem } from "../context/AppContext";
import { OriginalDetailModal, OriginalErrorToast } from "./OriginalDetailModal";
import { fetchOriginalDetail, type OriginalDetail } from "./originalDetail";
import { API_BASE } from "../api/client";
import { ArtifactStatusPanel } from "./rag/ArtifactStatusPanel";
import { MatchReasonDetails } from "./rag/MatchReasonDetails";
import { RagEvidenceDetailModal } from "./rag/RagEvidenceDetailModal";
import type {
  Artifact,
  DateFilterMode,
  EvidenceRecord,
  EvidenceSet,
  IndexStatus,
  NotificationType,
  RagSource,
  RelevanceFeedbackValue,
} from "./rag/types";
import {
  emptyEvidenceSetFallback,
  formatEvidenceSourceLine,
  formatFileTypeLabel,
  formatRelevanceScore,
  getDriveFileType,
  getGmailSender,
  getMatchReason,
  getMetadataString,
  normalizeArtifact,
  normalizeEvidenceRecord,
  normalizeEvidenceSet,
  parseDateFilterMode,
  toNumberValue,
  toRecord,
  toStringValue,
} from "./rag/normalizers";

const relevanceFeedbackMessages: Record<RelevanceFeedbackValue, string> = {
  relevant: "관련 있음 피드백을 저장했습니다.",
  important: "중요 피드백을 저장했습니다.",
  irrelevant: "관련 없음 피드백을 저장했습니다.",
  excluded: "제외 피드백을 저장했습니다.",
};

const defaultArtifactInstruction = "선택한 자료 근거만 사용해 확정 사실/주장·평가/검증 필요를 분리하고, 출처 지도와 [ev_...] 근거를 붙여 주세요.";
const sourceOptions: Array<{ id: RagSource; label: string; description: string; icon: string }> = [
  { id: "gmail", label: "Gmail", description: "선택 벡터화된 메일 본문에서 찾기", icon: "mail" },
  { id: "drive", label: "Drive", description: "벡터 인덱싱된 문서와 시트에서 찾기", icon: "description" },
];

export default function RagSearchPanel() {
  const {
    addLog,
    backendStatus,
    exportToObsidian,
    exportToNotion,
    obsidianVaultPath,
    notionApiKey,
    notionPageId,
    llmEndpoint,
    llmMode,
    suppressExternalLlmSensitiveWarning,
    saveExternalLlmWarningPreference,
    vectorizationProgress,
    indexRagSources
  } = useApp();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [evidenceSetTitle, setEvidenceSetTitle] = useState("");
  const [evidenceSetNotes, setEvidenceSetNotes] = useState("");
  const [savingEvidenceSet, setSavingEvidenceSet] = useState(false);
  const [savedEvidenceSet, setSavedEvidenceSet] = useState<EvidenceSet | null>(null);
  const [savedEvidenceSets, setSavedEvidenceSets] = useState<EvidenceSet[]>([]);
  const [loadingEvidenceSets, setLoadingEvidenceSets] = useState(false);
  const [openingEvidenceSetId, setOpeningEvidenceSetId] = useState<string | null>(null);
  const [artifactType, setArtifactType] = useState("wiki");
  const [artifactInstruction, setArtifactInstruction] = useState(defaultArtifactInstruction);
  const [generatingArtifact, setGeneratingArtifact] = useState(false);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [showExternalLlmWarning, setShowExternalLlmWarning] = useState(false);
  const [rememberExternalLlmWarning, setRememberExternalLlmWarning] = useState(false);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftTags, setDraftTags] = useState<string>("자료찾기, 정보묶음");

  const [exportingObsidian, setExportingObsidian] = useState(false);
  const [exportingNotion, setExportingNotion] = useState(false);
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [updatingArtifactStatus, setUpdatingArtifactStatus] = useState(false);

  const [notification, setNotification] = useState<{
    type: NotificationType;
    text: string;
  } | null>(null);

  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [selectedSources, setSelectedSources] = useState<RagSource[]>(["gmail", "drive"]);
  const [dateFilter, setDateFilter] = useState<DateFilterMode>("all");
  const [driveFileTypeFilter, setDriveFileTypeFilter] = useState("");
  const [gmailSenderFilter, setGmailSenderFilter] = useState("");
  const [feedbackByEvidenceId, setFeedbackByEvidenceId] = useState<Record<string, RelevanceFeedbackValue>>({});
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);
  const [focusedEvidence, setFocusedEvidence] = useState<EvidenceRecord | null>(null);
  const [originalDetail, setOriginalDetail] = useState<OriginalDetail | null>(null);
  const [originalLoadingId, setOriginalLoadingId] = useState<string | null>(null);
  const [originalError, setOriginalError] = useState<string | null>(null);

  const reviewRef = useRef<HTMLDivElement>(null);

  const driveFileTypeOptions = useMemo(() => {
    const fileTypes = evidence
      .filter((item) => item.source === "drive")
      .map((item) => getDriveFileType(item))
      .filter((mimeType) => mimeType.length > 0);
    return Array.from(new Set(fileTypes)).sort();
  }, [evidence]);

  const gmailSenderOptions = useMemo(() => {
    const senders = evidence
      .filter((item) => item.source === "gmail")
      .map((item) => getGmailSender(item))
      .filter((sender) => sender.length > 0);
    return Array.from(new Set(senders)).sort();
  }, [evidence]);

  const filteredEvidence = useMemo(() => {
    return evidence.filter((item) => {
      const sourceMatches = selectedSources.some((source) => source === item.source);
      if (!sourceMatches) return false;
      if (dateFilter === "known" && !item.date) return false;
      if (dateFilter === "unknown" && item.date) return false;
      if (driveFileTypeFilter && (item.source !== "drive" || getDriveFileType(item) !== driveFileTypeFilter)) return false;
      if (gmailSenderFilter && (item.source !== "gmail" || getGmailSender(item) !== gmailSenderFilter)) return false;
      return true;
    });
  }, [dateFilter, driveFileTypeFilter, evidence, gmailSenderFilter, selectedSources]);

  const selectedEvidence = evidence.filter((item) => selectedEvidenceIds.includes(item.id));
  const selectedCount = selectedEvidence.length;
  const filteredSelectedCount = filteredEvidence.filter((item) => selectedEvidenceIds.includes(item.id)).length;
  const allEvidenceSelected = filteredEvidence.length > 0 && filteredSelectedCount === filteredEvidence.length;
  const selectedSourceLabel = selectedSources.map((source) => source === "gmail" ? "Gmail" : "Drive").join(" + ");
  const vectorizationRunning = vectorizationProgress.status === "running";
  const gmailVectorizing = vectorizationRunning && vectorizationProgress.kind === "gmail";
  const indexing = vectorizationRunning && vectorizationProgress.kind === "drive";
  const llmServeMode = llmMode === "internal" ? "llamacpp" : "external";
  const llmEndpointClassification = classifyLlmEndpoint(llmEndpoint, llmServeMode);
  const shouldWarnBeforeExternalGeneration =
    llmEndpointClassification === "external-remote" && !suppressExternalLlmSensitiveWarning;
  const previousVectorizationStatusRef = useRef(vectorizationProgress.status);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchIndexStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/rag/status`);
      const data = toRecord(await response.json());
      if (data.status === "success") {
        setIndexStatus({
          gmail_chunks: toNumberValue(data.gmail_chunks) ?? 0,
          drive_chunks: toNumberValue(data.drive_chunks) ?? 0,
          total_chunks: toNumberValue(data.total_chunks) ?? 0
        });
      }
    } catch (err) {
      console.error("인덱스 상태 조회 에러:", err);
    }
  }, []);

  const showNotification = (type: NotificationType, text: string) => {
    setNotification({ type, text });
  };

  const toggleSource = (source: RagSource) => {
    setSelectedSources((prev) => {
      if (prev.includes(source)) {
        return prev.length === 1 ? prev : prev.filter((item) => item !== source);
      }
      return [...prev, source];
    });
  };

  const handleIndexing = async () => {
    showNotification("info", "선택한 출처의 벡터 인덱스를 갱신하는 중입니다...");
    const data = await indexRagSources(selectedSources);
    if (data.status === "success") {
      showNotification("success", `${selectedSourceLabel} 벡터 인덱스 갱신이 완료되었습니다.`);
      fetchIndexStatus();
    } else {
      const message = toStringValue(data.message, "알 수 없는 오류");
      showNotification("error", `인덱싱 실패: ${message}`);
    }
  };

  const buildDefaultEvidenceSetTitle = (searchQuery: string) => {
    const dateStr = new Date().toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    return `[정보 묶음] ${searchQuery.slice(0, 24)}${searchQuery.length > 24 ? "..." : ""} (${dateStr})`;
  };

  const evidenceToWorkspaceItem = (item: EvidenceRecord): WorkspaceItem | null => {
    if (item.source !== "gmail" && item.source !== "drive") return null;

    const sourceLocation = item.source_location;
    const id = item.source === "gmail"
      ? sourceLocation?.message_id || sourceLocation?.provider_item_id || item.doc_id || ""
      : sourceLocation?.file_id || sourceLocation?.provider_item_id || item.doc_id || "";
    if (!id) return null;

    return {
      id,
      type: item.source,
      title: item.title,
      subtitle: item.source === "drive" ? getDriveFileType(item) : getGmailSender(item),
      snippet: item.snippet,
      resourceKey: sourceLocation?.resource_key || getMetadataString(item, "resourceKey"),
      timestamp: item.date || new Date().toISOString(),
    };
  };

  const loadExportOriginals = async (): Promise<OriginalExportDocument[]> => {
    if (!savedEvidenceSet?.evidence_items.length) return [];

    return Promise.all(savedEvidenceSet.evidence_items.map(async (item): Promise<OriginalExportDocument> => {
      const workspaceItem = evidenceToWorkspaceItem(item);
      const sourceLine = formatEvidenceSourceLine(item);
      if (!workspaceItem) {
        return {
          evidence_id: item.evidence_id,
          title: item.title,
          content: `전체 원문 불러오기 실패: 원문 ID 없음\n\n${item.content_snapshot}`,
          source_line: sourceLine,
        };
      }
      try {
        const detail = await fetchOriginalDetail(workspaceItem);
        return {
          evidence_id: item.evidence_id,
          title: detail.title || item.title,
          content: detail.content,
          source_line: sourceLine,
          open_url: detail.open_url,
        };
      } catch (error) {
        return {
          evidence_id: item.evidence_id,
          title: item.title,
          content: `전체 원문 불러오기 실패: ${error instanceof Error ? error.message : "네트워크 오류"}\n\n${item.content_snapshot}`,
          source_line: sourceLine,
        };
      }
    }));
  };

  const handleOpenOriginal = async (item: EvidenceRecord) => {
    const workspaceItem = evidenceToWorkspaceItem(item);
    if (!workspaceItem) {
      setOriginalError("원문 ID가 없어 전체 원문을 불러올 수 없습니다.");
      return;
    }

    setOriginalLoadingId(item.id);
    setOriginalError(null);
    try {
      setOriginalDetail(await fetchOriginalDetail(workspaceItem));
    } catch (error) {
      setOriginalError(error instanceof Error ? error.message : "네트워크 오류로 원문을 불러오지 못했습니다.");
    } finally {
      setOriginalLoadingId(null);
    }
  };

  const getSourceIcon = (source: string) => {
    if (source === "gmail") return "mail";
    if (source === "drive") return "description";
    return "article";
  };

  const parseTags = () => {
    return draftTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  };

  const applyEvidenceSetToWorkspace = (set: EvidenceSet, restoredArtifact: Artifact | null = null) => {
    setSavedEvidenceSet(set);
    setEvidence(set.evidence_items);
    setSelectedEvidenceIds(set.evidence_items.map((item) => item.id));
    const restoredSources = Array.from(new Set(set.evidence_items.map((item) => item.source)))
      .filter((source): source is RagSource => source === "gmail" || source === "drive");
    setSelectedSources(restoredSources.length > 0 ? restoredSources : ["gmail", "drive"]);
    setQuery(set.original_query);
    setLastQuery(set.original_query);
    setDateFilter("all");
    setDriveFileTypeFilter("");
    setGmailSenderFilter("");
    setEvidenceSetTitle(set.title);
    setEvidenceSetNotes(set.notes || "");
    setDraftTags(set.tags.length > 0 ? set.tags.join(", ") : "자료찾기, 정보묶음");
    setArtifact(restoredArtifact);
    setDraftTitle(restoredArtifact?.title || set.title);
    setDraftContent(restoredArtifact?.content || "");
    setArtifactInstruction(restoredArtifact?.instruction || defaultArtifactInstruction);
    setArtifactType(restoredArtifact?.artifact_type || "wiki");
  };

  const fetchSavedEvidenceSets = useCallback(async () => {
    setLoadingEvidenceSets(true);
    try {
      const response = await fetch(`${API_BASE}/api/evidence-sets`);
      const data = toRecord(await response.json());
      if (data.status === "success" && Array.isArray(data.evidence_sets)) {
        setSavedEvidenceSets(
          data.evidence_sets
            .map((item) => normalizeEvidenceSet(item))
            .filter((item) => item.id)
            .slice(0, 8)
        );
      }
    } catch (err) {
      console.error("정보 묶음 목록 조회 에러:", err);
    } finally {
      setLoadingEvidenceSets(false);
    }
  }, []);

  const resetArtifactDraft = () => {
    setSavedEvidenceSet(null);
    setArtifact(null);
    setDraftTitle("");
    setDraftContent("");
    setArtifactInstruction(defaultArtifactInstruction);
    setArtifactType("wiki");
  };

  const clearGeneratedArtifact = () => {
    setArtifact(null);
    setDraftContent("");
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || loading || backendStatus !== "online") return;

    setLoading(true);
    setEvidence([]);
    setSelectedEvidenceIds([]);
    setFocusedEvidence(null);
    setOriginalDetail(null);
    setFeedbackByEvidenceId({});
    setLastQuery(trimmedQuery);
    setNotification(null);
    resetArtifactDraft();
    addLog(`RAG 근거 검색 요청(${selectedSourceLabel}): "${trimmedQuery}"`);

    try {
      const response = await fetch(`${API_BASE}/api/rag/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmedQuery, top_k: 12, sources: selectedSources }),
      });
      const data = toRecord(await response.json());

      if (data.status === "success") {
        const evidenceItems = Array.isArray(data.evidence)
          ? data.evidence.map((item, index) => normalizeEvidenceRecord(item, index))
          : [];
        const emptyGmailReason = selectedSources.includes("gmail") && indexStatus?.gmail_chunks === 0
          ? " Gmail 자료는 Gmail 원본 검색 탭에서 필요한 메일을 선택 벡터화한 뒤 다시 검색하세요."
          : "";
        setEvidence(evidenceItems);
        setSelectedEvidenceIds([]);
        setEvidenceSetTitle(buildDefaultEvidenceSetTitle(trimmedQuery));
        setEvidenceSetNotes("");
        addLog(`RAG 근거 검색 완료: ${evidenceItems.length}개 근거 반환.`);
        showNotification(
          evidenceItems.length > 0 ? "success" : "warning",
          evidenceItems.length > 0
            ? "자료 찾기가 완료되었습니다. 사용할 자료를 선택한 뒤 정보 묶음으로 저장하세요."
            : `검색은 완료되었지만 저장할 근거가 없습니다.${emptyGmailReason || " 다른 검색어를 시도해 주세요."}`
        );
        setTimeout(() => {
          reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      } else {
        const message = toStringValue(data.message, "알 수 없는 오류");
        addLog(`RAG 근거 검색 오류: ${message}`);
        showNotification("error", `검색 실패: ${message}`);
      }
    } catch (err) {
      addLog("RAG 근거 검색 중 오류가 발생했습니다.");
      showNotification("error", "네트워크 오류로 근거 검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleEvidenceSelection = (id: string) => {
    setSavedEvidenceSet(null);
    setArtifact(null);
    setDraftContent("");
    setSelectedEvidenceIds((prev) => prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]);
  };

  const toggleAllEvidence = () => {
    setSavedEvidenceSet(null);
    setArtifact(null);
    setDraftContent("");
    setSelectedEvidenceIds(allEvidenceSelected ? [] : filteredEvidence.map((item) => item.id));
  };

  const submitRelevanceFeedback = async (item: EvidenceRecord, feedback: RelevanceFeedbackValue) => {
    if (savingFeedbackId || backendStatus !== "online") return;
    setSavingFeedbackId(item.id);
    try {
      const response = await fetch(`${API_BASE}/api/rag/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: lastQuery || query.trim(),
          evidence_id: item.evidence_id,
          chunk_id: item.chunk_id,
          doc_id: item.doc_id,
          source: item.source,
          feedback,
          title: item.title,
          match_reason: getMatchReason(item),
        }),
      });
      const data = toRecord(await response.json());
      if (data.status === "success") {
        setFeedbackByEvidenceId((prev) => ({ ...prev, [item.id]: feedback }));
        showNotification("success", relevanceFeedbackMessages[feedback]);
      } else {
        showNotification("error", `피드백 저장 실패: ${toStringValue(data.message, "알 수 없는 오류")}`);
      }
    } catch {
      showNotification("error", "네트워크 오류로 피드백을 저장하지 못했습니다.");
    } finally {
      setSavingFeedbackId(null);
    }
  };

  const handleSaveEvidenceSet = async () => {
    if (selectedCount === 0 || savingEvidenceSet || backendStatus !== "online") return;

    const title = evidenceSetTitle.trim() || buildDefaultEvidenceSetTitle(lastQuery || query.trim());
    const payload = {
      title,
      original_query: lastQuery || query.trim(),
      evidence_items: selectedEvidence,
      notes: evidenceSetNotes.trim(),
      tags: parseTags(),
    };
    const isUpdatingEvidenceSet = !!savedEvidenceSet?.id;
    const requestUrl = isUpdatingEvidenceSet
      ? `${API_BASE}/api/evidence-sets/${encodeURIComponent(savedEvidenceSet.id)}`
      : `${API_BASE}/api/evidence-sets`;
    const requestMethod = isUpdatingEvidenceSet ? "PATCH" : "POST";

    setSavingEvidenceSet(true);
    showNotification("info", isUpdatingEvidenceSet ? "정보 묶음을 수정 저장하는 중입니다..." : "선택한 자료를 정보 묶음으로 저장하는 중입니다...");
    addLog(`정보 묶음 ${isUpdatingEvidenceSet ? "수정" : "저장"} 요청: ${selectedCount}개 근거 선택.`);

    try {
      const response = await fetch(requestUrl, {
        method: requestMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = toRecord(await response.json());

      if (data.status === "success") {
        const fallbackSet: EvidenceSet = {
          id: "evidence-set-draft",
          title,
          original_query: payload.original_query,
          evidence_items: selectedEvidence,
          notes: payload.notes,
          tags: payload.tags,
        };
        const normalizedSet = normalizeEvidenceSet(data.evidence_set, fallbackSet ?? emptyEvidenceSetFallback);
        setSavedEvidenceSet(normalizedSet);
        setSavedEvidenceSets((prev) => [normalizedSet, ...prev.filter((item) => item.id !== normalizedSet.id)].slice(0, 8));
        setArtifact(null);
        setDraftTitle(normalizedSet.title);
        setDraftContent("");
        addLog(`정보 묶음 ${isUpdatingEvidenceSet ? "수정" : "저장"} 완료: ${normalizedSet.id}`);
        showNotification("success", isUpdatingEvidenceSet ? "정보 묶음 수정이 저장되었습니다." : "정보 묶음이 저장되었습니다. 필요할 때만 Wiki 후보를 생성하세요.");
        setTimeout(() => {
          reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      } else {
        const message = toStringValue(data.message, "알 수 없는 오류");
        addLog(`정보 묶음 ${isUpdatingEvidenceSet ? "수정" : "저장"} 실패: ${message}`);
        showNotification("error", `정보 묶음 ${isUpdatingEvidenceSet ? "수정" : "저장"} 실패: ${message}`);
      }
    } catch (err) {
      addLog(`정보 묶음 ${isUpdatingEvidenceSet ? "수정" : "저장"} 중 네트워크 오류가 발생했습니다.`);
      showNotification("error", `네트워크 오류로 정보 묶음 ${isUpdatingEvidenceSet ? "수정" : "저장"}에 실패했습니다.`);
    } finally {
      setSavingEvidenceSet(false);
    }
  };

  const handleOpenEvidenceSet = async (evidenceSetId: string) => {
    if (openingEvidenceSetId || backendStatus !== "online") return;

    setOpeningEvidenceSetId(evidenceSetId);
    showNotification("info", "저장된 정보 묶음을 불러오는 중입니다...");
    try {
      const response = await fetch(`${API_BASE}/api/evidence-sets/${encodeURIComponent(evidenceSetId)}`);
      const data = toRecord(await response.json());
      if (data.status === "success") {
        const fallbackSet = savedEvidenceSets.find((item) => item.id === evidenceSetId);
        const normalizedSet = normalizeEvidenceSet(data.evidence_set, fallbackSet);
        const artifacts = Array.isArray(data.artifacts)
          ? data.artifacts.map((item) => normalizeArtifact(item, normalizedSet.id))
          : [];
        const restoredArtifact = artifacts.reduce<Artifact | null>((latest, current) => {
          if (!latest) return current;
          const latestTime = Date.parse(latest.updated_at || latest.created_at || "");
          const currentTime = Date.parse(current.updated_at || current.created_at || "");
          if (!Number.isFinite(latestTime)) return current;
          if (!Number.isFinite(currentTime)) return latest;
          return currentTime >= latestTime ? current : latest;
        }, null);
        applyEvidenceSetToWorkspace(normalizedSet, restoredArtifact);
        setSavedEvidenceSets((prev) => [normalizedSet, ...prev.filter((item) => item.id !== normalizedSet.id)].slice(0, 8));
        addLog(`정보 묶음 다시 열기 완료: ${normalizedSet.id}`);
        showNotification("success", restoredArtifact ? "정보 묶음과 최신 Wiki 후보를 다시 열었습니다." : "정보 묶음을 다시 열었습니다. 선택 자료와 메모를 이어서 사용할 수 있습니다.");
        setTimeout(() => {
          reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      } else {
        const message = toStringValue(data.message, "알 수 없는 오류");
        addLog(`정보 묶음 다시 열기 실패: ${message}`);
        showNotification("error", `정보 묶음 다시 열기 실패: ${message}`);
      }
    } catch (err) {
      addLog("정보 묶음 다시 열기 중 네트워크 오류가 발생했습니다.");
      showNotification("error", "네트워크 오류로 정보 묶음을 다시 열 수 없습니다.");
    } finally {
      setOpeningEvidenceSetId(null);
    }
  };

  const executeGenerateArtifact = async () => {
    if (!savedEvidenceSet || generatingArtifact || backendStatus !== "online") return;

    setGeneratingArtifact(true);
    showNotification("info", "저장된 정보 묶음에서 Wiki 후보를 생성하는 중입니다...");
    addLog(`Wiki 후보 생성 요청: 정보 묶음 ${savedEvidenceSet.id}, type=wiki`);

    try {
      const response = await fetch(`${API_BASE}/api/evidence-sets/${encodeURIComponent(savedEvidenceSet.id)}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifact_type: "wiki",
          instruction: artifactInstruction.trim(),
        }),
      });
      const data = toRecord(await response.json());

      if (data.status === "success") {
        const normalizedArtifact = normalizeArtifact(data.artifact, savedEvidenceSet.id);
        setArtifact(normalizedArtifact);
        setDraftTitle(normalizedArtifact.title || `[Wiki 후보] ${savedEvidenceSet.title}`);
        setDraftContent(normalizedArtifact.content);
        addLog(`Wiki 후보 생성 완료: ${normalizedArtifact.id}`);
        showNotification("success", "Wiki 후보가 생성되었습니다. Linter 상태를 확인한 뒤 승인하거나 내보낼 수 있습니다.");
      } else {
        const message = toStringValue(data.message, "알 수 없는 오류");
        addLog(`Wiki 후보 생성 실패: ${message}`);
        showNotification("error", `Wiki 후보 생성 실패: ${message}`);
      }
    } catch (err) {
      addLog("Wiki 후보 생성 중 네트워크 오류가 발생했습니다.");
      showNotification("error", "네트워크 오류로 Wiki 후보 생성에 실패했습니다.");
    } finally {
      setGeneratingArtifact(false);
    }
  };

  const handleGenerateArtifact = async () => {
    if (!savedEvidenceSet || generatingArtifact || backendStatus !== "online") return;
    if (shouldWarnBeforeExternalGeneration) {
      setRememberExternalLlmWarning(false);
      setShowExternalLlmWarning(true);
      return;
    }

    await executeGenerateArtifact();
  };

  const handleConfirmExternalLlmGeneration = async () => {
    setShowExternalLlmWarning(false);
    if (rememberExternalLlmWarning) {
      const saved = await saveExternalLlmWarningPreference(true);
      if (!saved) {
        showNotification("warning", "경고 숨김 설정 저장은 실패했지만 이번 요약 생성은 계속합니다.");
      }
    }
    await executeGenerateArtifact();
  };

  const handleSaveArtifactDraft = async (): Promise<Artifact | null> => {
    if (!artifact || !draftContent.trim() || backendStatus !== "online") {
      showNotification("warning", "저장할 Wiki 후보 본문이 없습니다.");
      return null;
    }

    setSavingArtifact(true);
    try {
      const response = await fetch(`${API_BASE}/api/artifacts/${encodeURIComponent(artifact.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle.trim(), content: draftContent }),
      });
      const data = toRecord(await response.json());
      if (data.status === "success") {
        const normalizedArtifact = normalizeArtifact(data.artifact, artifact.evidence_set_id);
        setArtifact(normalizedArtifact);
        setDraftTitle(normalizedArtifact.title || draftTitle);
        setDraftContent(normalizedArtifact.content);
        addLog(`Wiki 후보 저장 완료: ${normalizedArtifact.id}, status=${normalizedArtifact.status || "candidate"}`);
        showNotification("success", normalizedArtifact.status === "needs_review" ? "후보가 저장되었습니다. Linter 확인 항목을 먼저 해결해 주세요." : "Wiki 후보가 저장되었습니다.");
        return normalizedArtifact;
      }
      const message = toStringValue(data.message, "알 수 없는 오류");
      showNotification("error", `Wiki 후보 저장 실패: ${message}`);
      addLog(`Wiki 후보 저장 실패: ${message}`);
      return null;
    } catch (err) {
      showNotification("error", "네트워크 오류로 Wiki 후보 저장에 실패했습니다.");
      addLog("Wiki 후보 저장 중 네트워크 오류가 발생했습니다.");
      return null;
    } finally {
      setSavingArtifact(false);
    }
  };

  const handleSetArtifactStatus = async (nextStatus: "candidate" | "approved") => {
    if (!artifact || backendStatus !== "online") return;
    let targetArtifact: Artifact | null = artifact;
    if (nextStatus === "approved") {
      targetArtifact = await handleSaveArtifactDraft();
      if (!targetArtifact) return;
    }

    setUpdatingArtifactStatus(true);
    try {
      const response = await fetch(`${API_BASE}/api/artifacts/${encodeURIComponent(targetArtifact.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = toRecord(await response.json());
      if (data.status === "success") {
        const normalizedArtifact = normalizeArtifact(data.artifact, targetArtifact.evidence_set_id);
        setArtifact(normalizedArtifact);
        setDraftTitle(normalizedArtifact.title || draftTitle);
        setDraftContent(normalizedArtifact.content);
        showNotification("success", nextStatus === "approved" ? "Wiki 산출물을 승인했습니다." : "승인 상태를 해제하고 후보로 되돌렸습니다.");
        addLog(`Wiki 상태 변경: ${normalizedArtifact.id}, status=${normalizedArtifact.status || nextStatus}`);
      } else {
        const message = toStringValue(data.message, "알 수 없는 오류");
        showNotification("error", `Wiki 상태 변경 실패: ${message}`);
        addLog(`Wiki 상태 변경 실패: ${message}`);
      }
    } catch (err) {
      showNotification("error", "네트워크 오류로 Wiki 상태 변경에 실패했습니다.");
      addLog("Wiki 상태 변경 중 네트워크 오류가 발생했습니다.");
    } finally {
      setUpdatingArtifactStatus(false);
    }
  };

  const handleExportObsidian = async () => {
    if (!draftContent.trim()) {
      showNotification("warning", "내보낼 Wiki 후보 본문이 없습니다. 먼저 후보를 생성해 주세요.");
      return;
    }
    if (!obsidianVaultPath) {
      showNotification("warning", "Obsidian Vault 경로가 설정되지 않았습니다. 설정 탭에서 저장소 경로를 설정해 주세요.");
      return;
    }

    setExportingObsidian(true);
    showNotification("info", "전체 원문을 불러와 Obsidian Vault에 저장하는 중입니다...");

    try {
      const res = await exportToObsidian(draftTitle, draftContent, parseTags(), await loadExportOriginals());
      if (res.status === "success") {
        showNotification("success", `Obsidian 저장 성공! 생성된 노트: ${res.filename}`);
        addLog(`Obsidian 내보내기 완료: ${res.filename}`);
      } else {
        showNotification("error", `Obsidian 저장 실패: ${res.message}`);
        addLog(`Obsidian 내보내기 실패: ${res.message}`);
      }
    } catch (err) {
      showNotification("error", "통신 실패로 Obsidian 내보내기에 실패했습니다.");
    } finally {
      setExportingObsidian(false);
    }
  };

  const handleExportNotion = async () => {
    if (!draftContent.trim()) {
      showNotification("warning", "내보낼 Wiki 후보 본문이 없습니다. 먼저 후보를 생성해 주세요.");
      return;
    }
    if (!notionApiKey || !notionPageId) {
      showNotification("warning", "Notion API Key 또는 Page ID가 등록되지 않았습니다. 설정 탭에서 Notion을 연동해 주세요.");
      return;
    }

    setExportingNotion(true);
    showNotification("info", "전체 원문을 불러와 Notion 페이지로 전송하는 중입니다...");

    try {
      const res = await exportToNotion(draftTitle, draftContent, await loadExportOriginals());
      if (res.status === "success") {
        showNotification("success", "Notion 페이지에 성공적으로 Wiki 후보가 작성되었습니다.");
        addLog("Notion 내보내기 성공");
      } else {
        showNotification("error", `Notion 전송 실패: ${res.message}`);
        addLog(`Notion 내보내기 실패: ${res.message}`);
      }
    } catch (err) {
      showNotification("error", "통신 실패로 Notion 내보내기에 실패했습니다.");
    } finally {
      setExportingNotion(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!draftContent.trim()) {
      showNotification("warning", "복사할 Wiki 후보 본문이 없습니다. 먼저 후보를 생성해 주세요.");
      return;
    }
    const formattedNote = `# ${draftTitle}\n\n${draftContent}`;
    try {
      await navigator.clipboard.writeText(formattedNote);
      showNotification("success", "마크다운 Wiki 후보가 클립보드에 복사되었습니다. 원하는 곳에 붙여넣으세요.");
    } catch (err) {
      showNotification("error", "복사하는 도중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    if (backendStatus === "online") {
      fetchIndexStatus();
      fetchSavedEvidenceSets();
    }
  }, [backendStatus, fetchIndexStatus, fetchSavedEvidenceSets]);

  useEffect(() => {
    if (previousVectorizationStatusRef.current === "running" && vectorizationProgress.status !== "running" && backendStatus === "online") {
      fetchIndexStatus();
    }
    previousVectorizationStatusRef.current = vectorizationProgress.status;
  }, [backendStatus, fetchIndexStatus, vectorizationProgress.status]);

  return (
    <div className="h-full min-h-0 bg-white rounded-2xl p-6 border border-[#e1e3e1] shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] flex flex-col gap-4 w-full overflow-hidden">
      {/* 상단 고정 영역 */}
      <div className="flex-shrink-0 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-[#e1e3e1] pb-4 flex-wrap gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[#1f1f1f] text-base font-semibold flex items-center">
            <span className="material-symbols-rounded mr-2 text-[#0b57d0]">hub</span>
            검색하기
          </h2>
          <p className="text-xs text-[#444746] font-normal leading-relaxed">
            Gmail에서 선택 벡터화했거나 Drive 벡터 인덱스 갱신으로 넣은 근거만 검색하고, 선택한 자료를 정보 묶음으로 저장한 뒤 필요할 때만 요약을 생성합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleIndexing}
          disabled={vectorizationRunning || backendStatus !== "online"}
          className="text-xs bg-[#d3e3fd] hover:bg-[#c0d8fc] text-[#0b57d0] font-semibold py-1.5 px-4 rounded-full cursor-pointer disabled:cursor-default disabled:opacity-50 transition-all flex items-center gap-1.5"
        >
          <span className={`material-symbols-rounded text-sm ${vectorizationRunning ? "animate-spin" : ""}`}>sync</span>
          {gmailVectorizing ? "Gmail 벡터화 중..." : indexing ? "갱신 중..." : "벡터 인덱스 갱신"}
        </button>
      </div>

      {vectorizationRunning && (
        <div className="rounded-2xl border border-primary/15 bg-primary-container/35 p-3 text-xs text-primary">
          <div className="flex items-center justify-between gap-3 font-semibold">
            <span>{vectorizationProgress.label}</span>
            <span>{Math.round(vectorizationProgress.progress)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${vectorizationProgress.progress}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-text-secondary">
            {gmailVectorizing
              ? "Gmail 벡터화는 Gmail 원본 검색 탭에서 시작한 작업입니다. 완료되면 이 탭의 근거 수를 자동으로 다시 확인합니다."
              : "다른 탭으로 이동해도 백그라운드에서 계속 처리됩니다."}
          </p>
        </div>
      )}

      {indexStatus && (
        <div className="flex flex-wrap gap-4 text-xs bg-[#f8fafd] border border-[#e1e3e1] p-3.5 rounded-2xl text-[#444746] font-medium">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[#0b57d0] text-sm">mail</span>
            <span>Gmail 근거: <strong>{indexStatus.gmail_chunks}개</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[#0b57d0] text-sm">description</span>
            <span>Drive 근거: <strong>{indexStatus.drive_chunks}개</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[#0b57d0] text-sm">database</span>
            <span>전체 인덱싱된 근거: <strong>{indexStatus.total_chunks}개</strong></span>
          </div>
        </div>
      )}
      </div>

      {/* 2단 컨텐츠 스크롤 영역 */}
      <div className="flex-1 min-h-0 grid grid-cols-1 min-[1280px]:grid-cols-[1.1fr_0.9fr] gap-6 overflow-hidden">
        
        {/* 좌측 패널: 검색 및 리스트 */}
        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-2 pb-2">

      {(loadingEvidenceSets || savedEvidenceSets.length > 0) && (
        <section className="bg-[#f8fafd] border border-[#e1e3e1] rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-xs font-bold text-[#1f1f1f] flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-[#0b57d0]">inventory_2</span>
                최근 정보 묶음
              </h3>
              <p className="text-[11px] text-[#444746] leading-relaxed mt-1">
                이전에 저장한 벡터 검색 결과 묶음을 다시 열어 선택 자료, 메모, 요약 흐름을 이어갑니다.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchSavedEvidenceSets}
              disabled={loadingEvidenceSets || backendStatus !== "online"}
              className="text-[10px] bg-white hover:bg-[#d3e3fd]/50 border border-[#e1e3e1] text-[#0b57d0] px-3 py-1.5 rounded-full font-bold transition-all disabled:opacity-50"
            >
              {loadingEvidenceSets ? "불러오는 중..." : "목록 새로고침"}
            </button>
          </div>
          {savedEvidenceSets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {savedEvidenceSets.map((set) => (
                <article key={set.id} className="bg-white border border-[#e1e3e1] rounded-2xl p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-[#1f1f1f] truncate">{set.title}</h4>
                      <p className="text-[11px] text-[#444746] truncate">{set.original_query || "검색어 없음"}</p>
                    </div>
                    <span className="text-[10px] font-bold text-[#0b57d0] bg-[#d3e3fd]/70 rounded-full px-2 py-0.5 whitespace-nowrap">
                      자료 {set.evidence_items.length}개
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(set.tags.length > 0 ? set.tags : ["태그 없음"]).map((tag) => (
                      <span key={tag} className="text-[10px] text-[#444746] bg-[#f8fafd] border border-[#e1e3e1] rounded-full px-2 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-[#444746] truncate">
                      {(set.updated_at || set.created_at) ? new Date(set.updated_at || set.created_at || "").toLocaleString("ko-KR") : "저장일 없음"}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenEvidenceSet(set.id)}
                      disabled={!!openingEvidenceSetId || backendStatus !== "online"}
                      className="text-[10px] text-[#0b57d0] font-bold hover:underline disabled:text-[#444746]/40"
                    >
                      {openingEvidenceSetId === set.id ? "여는 중..." : "다시 열기"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="bg-[#f8fafd] border border-[#e1e3e1] rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xs font-bold text-[#1f1f1f] flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-[#0b57d0]">filter_alt</span>
              검색할 벡터 출처
            </h3>
            <p className="text-[11px] text-[#444746] leading-relaxed mt-1">
              원본 조회만 한 자료는 제외하고, 선택 벡터화 또는 벡터 인덱스 갱신까지 끝난 Gmail/Drive 자료만 찾습니다.
            </p>
          </div>
          <span className="text-[10px] font-bold text-[#0b57d0] bg-white border border-[#d3e3fd] rounded-full px-3 py-1">
            현재: {selectedSourceLabel}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {sourceOptions.map((option) => {
            const selected = selectedSources.includes(option.id);
            const isLastSelected = selected && selectedSources.length === 1;
            return (
              <label
                key={option.id}
                className={`flex items-start gap-3 rounded-2xl border p-3 transition-all ${selected ? "bg-white border-[#0b57d0]/30 shadow-[0_4px_16px_rgba(11,87,208,0.06)]" : "bg-white/60 border-[#e1e3e1] hover:border-[#0b57d0]/20"}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={isLastSelected || vectorizationRunning || loading || backendStatus !== "online"}
                  onChange={() => toggleSource(option.id)}
                  className="mt-0.5 h-4 w-4 rounded border-[#e1e3e1] accent-[#0b57d0] disabled:opacity-60"
                  aria-label={`${option.label} 검색 재료 선택`}
                />
                <span className="material-symbols-rounded text-[#0b57d0] text-lg mt-[-1px]">{option.icon}</span>
                <span className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-[#1f1f1f]">{option.label}</span>
                  <span className="text-[11px] text-[#444746] leading-relaxed">{option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[#444746]">
            날짜
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(parseDateFilterMode(e.target.value))}
              className="bg-white border border-[#e1e3e1] rounded-xl px-3 py-2 text-xs text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0]"
            >
              <option value="all">전체 날짜</option>
              <option value="known">날짜 있는 자료</option>
              <option value="unknown">날짜 없음</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[#444746]">
            Drive 파일 형식
            <select
              value={driveFileTypeFilter}
              onChange={(e) => setDriveFileTypeFilter(e.target.value)}
              disabled={driveFileTypeOptions.length === 0}
              className="bg-white border border-[#e1e3e1] rounded-xl px-3 py-2 text-xs text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] disabled:text-[#444746]/50 disabled:bg-[#f8fafd]"
            >
              <option value="">전체 형식</option>
              {driveFileTypeOptions.map((mimeType) => (
                <option key={mimeType} value={mimeType}>{formatFileTypeLabel(mimeType)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-[#444746]">
            Gmail 발신자
            <select
              value={gmailSenderFilter}
              onChange={(e) => setGmailSenderFilter(e.target.value)}
              disabled={gmailSenderOptions.length === 0}
              className="bg-white border border-[#e1e3e1] rounded-xl px-3 py-2 text-xs text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] disabled:text-[#444746]/50 disabled:bg-[#f8fafd]"
            >
              <option value="">전체 발신자</option>
              {gmailSenderOptions.map((sender) => (
                <option key={sender} value={sender}>{sender}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-[#444746]">
          <span className="rounded-full border border-[#e1e3e1] bg-white px-3 py-1">
            Gmail 라벨 필터는 선택 메일 인덱스에 labelIds가 저장된 뒤 활성화됩니다.
          </span>
          <span className="rounded-full border border-[#e1e3e1] bg-white px-3 py-1">
            Drive 담당자 필터는 owners/creator 메타데이터가 추가된 뒤 활성화됩니다.
          </span>
          {evidence.length > 0 && (
            <span className="rounded-full border border-[#d3e3fd] bg-white px-3 py-1 font-bold text-[#0b57d0]">
              표시 {filteredEvidence.length}개 / 전체 {evidence.length}개
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-[#444746] text-lg select-none">search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading || backendStatus !== "online"}
            placeholder="벡터 인덱스에 들어간 Gmail/Drive 자료만 찾아보세요..."
            className="w-full bg-[#f8fafd] pl-11 pr-4 py-3 rounded-full border border-[#e1e3e1] text-xs text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] disabled:opacity-50 transition-all placeholder:text-[#444746]/60 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || loading || backendStatus !== "online"}
          className="w-full sm:w-auto bg-[#0b57d0] hover:bg-[#0b57d0]/90 disabled:bg-[#f8fafd] disabled:text-[#444746]/40 text-[#ffffff] text-xs font-semibold px-6 py-3 rounded-full transition-all cursor-pointer disabled:cursor-default flex items-center justify-center min-w-[110px]"
        >
          {loading ? (
            <div className="flex items-center gap-1.5">
              <svg aria-hidden="true" className="animate-spin h-3.5 w-3.5 text-[#444746]/50" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>검색 중...</span>
            </div>
          ) : "자료 찾기"}
        </button>
      </form>

      {notification && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border text-xs transition-all animate-fadeIn ${
          notification.type === "success" ? "bg-[#dcfce7] border-[#22c55e]/30 text-[#15803d]" :
          notification.type === "error" ? "bg-[#fee2e2] border-[#ef4444]/30 text-[#b91c1c]" :
          notification.type === "warning" ? "bg-[#fef9c3] border-[#eab308]/30 text-[#854d0e]" :
          "bg-[#d3e3fd]/40 border-[#0b57d0]/20 text-[#0b57d0]"
        }`}>
          <span className="material-symbols-rounded text-base flex-shrink-0 mt-0.5">
            {notification.type === "success" ? "check_circle" :
             notification.type === "error" ? "error" :
             notification.type === "warning" ? "warning" : "info"}
          </span>
          <div className="flex-1 font-medium">{notification.text}</div>
          <button type="button" onClick={() => setNotification(null)} className="text-current opacity-60 hover:opacity-100 transition-opacity">
            <span className="material-symbols-rounded text-base">close</span>
          </button>
        </div>
      )}

      {evidence.length > 0 && (
        <div ref={reviewRef} className="flex flex-col gap-5 bg-[#f8fafd] border border-[#e1e3e1] p-5 rounded-2xl animate-slideUp">
          <div className="flex items-center justify-between border-b border-[#e1e3e1]/60 pb-3 flex-wrap gap-3">
            <h3 className="text-[#1f1f1f] text-xs font-bold flex items-center">
              <span className="material-symbols-rounded mr-2 text-[#0b57d0]">fact_check</span>
              찾은 자료 먼저 확인 ({filteredSelectedCount}/{filteredEvidence.length})
            </h3>
            <button
              type="button"
              onClick={toggleAllEvidence}
              className="text-[10px] bg-white hover:bg-[#d3e3fd]/50 border border-[#e1e3e1] text-[#0b57d0] px-3 py-1.5 rounded-full font-bold transition-all"
            >
              {allEvidenceSelected ? "전체 해제" : "전체 선택"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredEvidence.map((item) => {
              const selected = selectedEvidenceIds.includes(item.id);
              const relevanceLabel = formatRelevanceScore(item);
              const matchReason = getMatchReason(item);
              const currentFeedback = feedbackByEvidenceId[item.id];
              const isSavingFeedback = savingFeedbackId === item.id;
              return (
                <article
                  key={item.id}
                  className={`bg-white border rounded-2xl p-4 transition-all ${selected ? "border-[#0b57d0]/40 shadow-[0_8px_24px_rgba(11,87,208,0.08)]" : "border-[#e1e3e1] hover:border-[#0b57d0]/25"}`}
                >
                  <div className="flex gap-3">
                    <label className="pt-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleEvidenceSelection(item.id)}
                        className="h-4 w-4 rounded border-[#e1e3e1] accent-[#0b57d0] cursor-pointer"
                        aria-label={`${item.title} 근거 선택`}
                      />
                    </label>
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[#1f1f1f] leading-relaxed truncate">{item.title}</h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-[#444746]">
                            <span className="bg-[#d3e3fd]/70 text-[#0b57d0] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <span className="material-symbols-rounded text-[12px]">{getSourceIcon(item.source)}</span>
                              {item.source}
                            </span>
                            {item.location_label && <span title={item.location_label} className="max-w-full bg-[#f8fafd] border border-[#e1e3e1] px-2 py-0.5 rounded-full break-words">{item.location_label}</span>}
                            <span>{item.date || "날짜 없음"}</span>
                            <span className="bg-[#f8fafd] border border-[#e1e3e1] px-2 py-0.5 rounded-full font-semibold text-[#1f1f1f]">
                              {relevanceLabel}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFocusedEvidence(item)}
                          className="text-[10px] text-[#0b57d0] font-bold hover:underline flex items-center gap-0.5 flex-shrink-0"
                        >
                          자료 보기
                          <span className="material-symbols-rounded text-[13px]">open_in_new</span>
                        </button>
                      </div>
                      <MatchReasonDetails reason={matchReason} snippet={item.snippet} metadata={item.metadata} showSnippet={false} />
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs font-bold text-[#444746]">검색 품질 피드백</span>
                        <button
                          type="button"
                          onClick={() => submitRelevanceFeedback(item, "relevant")}
                          disabled={isSavingFeedback || backendStatus !== "online"}
                          className={`text-xs font-bold rounded-full border px-2.5 py-1 transition-all flex items-center gap-1 disabled:opacity-50 ${currentFeedback === "relevant" ? "bg-[#d3e3fd] border-[#d3e3fd] text-[#0b57d0]" : "bg-white border-[#e1e3e1] text-[#444746] hover:bg-[#d3e3fd]/40"}`}
                        >
                          <span className="material-symbols-rounded text-sm">thumb_up</span>
                          관련 있음
                        </button>
                        <button
                          type="button"
                          onClick={() => submitRelevanceFeedback(item, "important")}
                          disabled={isSavingFeedback || backendStatus !== "online"}
                          className={`text-xs font-bold rounded-full border px-2.5 py-1 transition-all flex items-center gap-1 disabled:opacity-50 ${currentFeedback === "important" ? "bg-[#fef7e0] border-[#fef7e0] text-[#a15c00]" : "bg-white border-[#e1e3e1] text-[#444746] hover:bg-[#fef7e0]/70"}`}
                        >
                          <span className="material-symbols-rounded text-sm">star</span>
                          중요
                        </button>
                        <button
                          type="button"
                          onClick={() => submitRelevanceFeedback(item, "irrelevant")}
                          disabled={isSavingFeedback || backendStatus !== "online"}
                          className={`text-xs font-bold rounded-full border px-2.5 py-1 transition-all flex items-center gap-1 disabled:opacity-50 ${currentFeedback === "irrelevant" ? "bg-[#fce8e6] border-[#fce8e6] text-[#b3261e]" : "bg-white border-[#e1e3e1] text-[#444746] hover:bg-[#fce8e6]/60"}`}
                        >
                          <span className="material-symbols-rounded text-sm">thumb_down</span>
                          관련 없음
                        </button>
                        <button
                          type="button"
                          onClick={() => submitRelevanceFeedback(item, "excluded")}
                          disabled={isSavingFeedback || backendStatus !== "online"}
                          title="이 결과를 다음 검색에서 숨깁니다. 다시 보려면 관련 있음을 눌러 되돌리세요."
                          className={`text-xs font-bold rounded-full border px-2.5 py-1 transition-all flex items-center gap-1 disabled:opacity-50 ${currentFeedback === "excluded" ? "bg-[#f1f3f4] border-[#dadce0] text-[#5f6368]" : "bg-white border-[#e1e3e1] text-[#444746] hover:bg-[#f1f3f4]"}`}
                        >
                          <span className="material-symbols-rounded text-sm">visibility_off</span>
                          제외
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
      </div>

      {/* 우측 패널: 정보 묶음 편집 / Wiki 후보 생성 */}
      <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-2 pb-2 border-t min-[1280px]:border-t-0 min-[1280px]:border-l border-[#e1e3e1] min-[1280px]:pl-6">
        
      {evidence.length > 0 && (
        <div className="flex flex-col gap-5 bg-[#f8fafd] border border-[#e1e3e1] p-5 rounded-2xl animate-slideUp">
          <div className="flex items-center justify-between border-b border-[#e1e3e1]/60 pb-3 flex-wrap gap-3">
            <h3 className="text-[#1f1f1f] text-xs font-bold flex items-center">
              <span className="material-symbols-rounded mr-2 text-[#0b57d0]">save</span>
              정보 묶음 저장
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evidence-set-title" className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-[#0b57d0]">title</span>
                정보 묶음 제목
              </label>
              <input
                id="evidence-set-title"
                type="text"
                value={evidenceSetTitle}
                onChange={(e) => setEvidenceSetTitle(e.target.value)}
                className="w-full bg-white border border-[#e1e3e1] rounded-xl px-4 py-2.5 text-xs text-[#1f1f1f] font-semibold focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all"
                placeholder="저장할 정보 묶음 제목을 입력하세요."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evidence-set-tags" className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-[#0b57d0]">local_offer</span>
                태그
              </label>
              <input
                id="evidence-set-tags"
                type="text"
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                className="w-full bg-white border border-[#e1e3e1] rounded-xl px-4 py-2.5 text-xs text-[#444746] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all"
                placeholder="자료찾기, 정보묶음"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="evidence-set-notes" className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-[#0b57d0]">notes</span>
              정보 묶음 메모
            </label>
            <textarea
              id="evidence-set-notes"
              value={evidenceSetNotes}
              onChange={(e) => setEvidenceSetNotes(e.target.value)}
              rows={3}
              className="w-full bg-white border border-[#e1e3e1] rounded-xl p-3 text-xs text-[#1f1f1f] leading-relaxed focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all resize-y"
              placeholder="나중에 Wiki 후보를 만들 때 참고할 맥락이나 검토 메모를 남길 수 있습니다."
            />
          </div>

          <div className="flex items-center justify-between gap-3 bg-white border border-[#e1e3e1]/60 p-4 rounded-xl flex-wrap">
            <div className="text-xs text-[#444746] font-medium">
              선택한 자료 <strong className="text-[#0b57d0]">{selectedCount}개</strong>를 {savedEvidenceSet ? "열린 정보 묶음에 수정 저장합니다." : "먼저 정보 묶음으로 저장합니다."}
            </div>
            <button
              type="button"
              onClick={handleSaveEvidenceSet}
              disabled={selectedCount === 0 || savingEvidenceSet || backendStatus !== "online"}
              className="bg-[#0b57d0] hover:bg-[#0b57d0]/90 disabled:bg-[#f8fafd] disabled:text-[#444746]/40 text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5 min-w-[150px]"
            >
              {savingEvidenceSet ? (
                <svg aria-hidden="true" className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span className="material-symbols-rounded text-sm">save</span>
              )}
              <span>{savingEvidenceSet ? "저장 중..." : savedEvidenceSet ? "정보 묶음 수정 저장" : "정보 묶음 저장"}</span>
            </button>
          </div>
        </div>
      )}

      {savedEvidenceSet && (
        <div className="flex flex-col gap-4 bg-[#f8fafd] border border-[#e1e3e1] p-5 rounded-2xl animate-slideUp">
          <div className="flex items-center justify-between border-b border-[#e1e3e1]/60 pb-3 flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-[#1f1f1f] text-xs font-bold flex items-center">
                <span className="material-symbols-rounded mr-2 text-[#0b57d0]">inventory_2</span>
                저장된 정보 묶음
              </h3>
              <p className="text-[11px] text-[#444746] break-words">{savedEvidenceSet.title} · 근거 {savedEvidenceSet.evidence_items.length}개</p>
            </div>
            <span className="text-[10px] bg-[#dcfce7] text-[#15803d] px-2.5 py-0.5 rounded-full font-bold">저장 완료</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="artifact-type" className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-[#0b57d0]">category</span>
                필요 시 생성할 Wiki 후보 유형
              </label>
              <select
                id="artifact-type"
                value={artifactType}
                onChange={(e) => {
                  setArtifactType(e.target.value);
                  clearGeneratedArtifact();
                }}
                className="w-full bg-white border border-[#e1e3e1] rounded-xl px-3 py-2.5 text-xs text-[#1f1f1f] font-semibold focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all"
              >
                <option value="wiki">wiki 후보</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="artifact-instruction" className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-[#0b57d0]">edit_note</span>
                생성 지시문
              </label>
              <textarea
                id="artifact-instruction"
                value={artifactInstruction}
                onChange={(e) => {
                  setArtifactInstruction(e.target.value);
                  clearGeneratedArtifact();
                }}
                rows={3}
                className="w-full bg-white border border-[#e1e3e1] rounded-xl p-3 text-xs text-[#1f1f1f] leading-relaxed focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all resize-y"
                placeholder="Wiki 후보 생성 지시문을 입력하세요."
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGenerateArtifact}
              disabled={generatingArtifact || backendStatus !== "online"}
              className="bg-[#1f1f1f] hover:bg-black disabled:bg-[#f8fafd] disabled:text-[#444746]/40 text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5 min-w-[160px]"
            >
              {generatingArtifact ? (
                <svg aria-hidden="true" className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span className="material-symbols-rounded text-sm">auto_awesome</span>
              )}
              <span>{generatingArtifact ? "생성 중..." : "Wiki 후보 생성"}</span>
            </button>
          </div>
        </div>
      )}

      {artifact && (
        <div className="flex flex-col gap-5 bg-[#f8fafd] border border-[#e1e3e1] p-5 rounded-2xl animate-slideUp">
          <div className="flex items-center justify-between border-b border-[#e1e3e1]/60 pb-3 flex-wrap gap-3">
            <h3 className="text-[#1f1f1f] text-xs font-bold flex items-center">
              <span className="material-symbols-rounded mr-2 text-[#0b57d0]">rate_review</span>
              Wiki 후보 검토 및 저장
            </h3>
            <span className="text-[10px] bg-[#d3e3fd] text-[#0b57d0] px-2.5 py-0.5 rounded-full font-bold">{artifact.status === "approved" ? "승인됨" : "후보 편집 가능"}</span>
          </div>

          <ArtifactStatusPanel
            status={artifact.status}
            lint={artifact.lint}
            saving={savingArtifact}
            approving={updatingArtifactStatus}
            canSave={Boolean(draftContent.trim()) && backendStatus === "online"}
            onSave={() => { void handleSaveArtifactDraft(); }}
            onApprove={() => { void handleSetArtifactStatus("approved"); }}
            onReturnToCandidate={() => { void handleSetArtifactStatus("candidate"); }}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="artifact-title" className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-[#0b57d0]">title</span>
              Wiki 제목
            </label>
            <input
              id="artifact-title"
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="w-full bg-white border border-[#e1e3e1] rounded-xl px-4 py-2.5 text-xs text-[#1f1f1f] font-semibold focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all"
              placeholder="내보낼 Wiki 제목을 입력하세요."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="artifact-tags" className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-[#0b57d0]">local_offer</span>
              태그 (콤마 구분, Obsidian 전용)
            </label>
            <input
              id="artifact-tags"
              type="text"
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
              className="w-full bg-white border border-[#e1e3e1] rounded-xl px-4 py-2 text-xs text-[#444746] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all"
              placeholder="예: 자료찾기, 정보묶음, Wiki"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="artifact-content" className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-[#0b57d0]">subject</span>
              Wiki 본문 (Markdown 지원)
            </label>
            <textarea
              id="artifact-content"
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={12}
              className="w-full bg-white border border-[#e1e3e1] rounded-xl p-4 text-xs text-[#1f1f1f] leading-relaxed focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all font-mono resize-y"
              placeholder="생성된 Wiki 후보 본문을 검토하고 편집하세요."
            />
          </div>

          {artifact.citation_map && artifact.citation_map.length > 0 && (
            <div className="flex flex-col gap-2 bg-white border border-[#e1e3e1]/60 p-4 rounded-xl">
              <span className="text-[11px] text-[#444746] font-bold flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-[#0b57d0]">format_quote</span>
                출처 매핑 ({artifact.citation_map.length}개)
              </span>
              <div className="flex flex-wrap gap-2">
                {artifact.citation_map.map((citation) => (
                  <span
                    key={`${citation.evidence_id}-${citation.marker || citation.title || "citation"}`}
                    title={citation.marker || citation.title || citation.evidence_id}
                    className="text-[10px] bg-[#f8fafd] border border-[#e1e3e1] px-3 py-1.5 rounded-lg text-[#1f1f1f] flex items-center gap-1.5"
                  >
                    <span className="material-symbols-rounded text-[12px] text-[#0b57d0]">bookmark</span>
                    <span className="font-semibold max-w-[220px] truncate">{citation.marker || citation.title || citation.evidence_id}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-3 border-t border-[#e1e3e1]/60">
            <button
              type="button"
              onClick={handleExportObsidian}
              disabled={exportingObsidian || exportingNotion || !draftContent.trim()}
              className="flex-1 min-w-[130px] bg-[#22c55e] hover:bg-[#16a34a] text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {exportingObsidian ? (
                <svg aria-hidden="true" className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span className="material-symbols-rounded text-sm">send_and_archive</span>
              )}
              <span>{artifact.status === "approved" ? "승인 Wiki Obsidian 저장" : "후보 Obsidian 저장"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportNotion}
              disabled={exportingObsidian || exportingNotion || !draftContent.trim()}
              className="flex-1 min-w-[130px] bg-[#1f1f1f] hover:bg-black text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {exportingNotion ? (
                <svg aria-hidden="true" className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span className="material-symbols-rounded text-sm">open_in_new</span>
              )}
              <span>{artifact.status === "approved" ? "승인 Wiki Notion 저장" : "후보 Notion 저장"}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyToClipboard}
              disabled={exportingObsidian || exportingNotion || !draftContent.trim()}
              className="bg-white hover:bg-[#f8fafd] text-[#444746] border border-[#e1e3e1] font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-rounded text-sm">content_copy</span>
              <span>마크다운 복사</span>
            </button>
          </div>
        </div>
      )}

      </div>
      </div>

      {focusedEvidence && (
        <RagEvidenceDetailModal
          item={focusedEvidence}
          matchReason={getMatchReason(focusedEvidence)}
          relevanceLabel={formatRelevanceScore(focusedEvidence)}
          isOriginalLoading={originalLoadingId === focusedEvidence.id}
          onOpenOriginal={() => { void handleOpenOriginal(focusedEvidence); }}
          onClose={() => setFocusedEvidence(null)}
        />
      )}

      {originalError && (
        <OriginalErrorToast message={originalError} onClose={() => setOriginalError(null)} />
      )}

      {originalDetail && (
        <OriginalDetailModal detail={originalDetail} onClose={() => setOriginalDetail(null)} />
      )}

      {showExternalLlmWarning && (
        <div
          className="fixed inset-0 z-50 bg-[#1f1f1f]/35 backdrop-blur-[1px] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="external-llm-warning-title"
        >
          <div className="w-full max-w-lg bg-white border border-[#e1e3e1] rounded-3xl shadow-[0_12px_32px_rgba(60,64,67,0.18)] p-6 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-rounded text-[#b3261e] bg-[#fce8e6] rounded-full p-2 text-xl">privacy_tip</span>
              <div className="flex flex-col gap-1">
                <h3 id="external-llm-warning-title" className="text-sm font-bold text-[#1f1f1f]">
                  외부 LLM 전송 전 확인
                </h3>
                <p className="text-xs text-[#444746] leading-relaxed">
                  선택한 Gmail/Drive 자료에 민감한 정보가 포함될 수 있습니다. 현재 LLM 설정은 외부 API로 보이며,
                  요약 생성을 계속하면 저장한 정보 묶음의 내용이 해당 원격 엔드포인트로 전송될 수 있습니다.
                </p>
              </div>
            </div>

            <div className="bg-[#f8fafd] border border-[#e1e3e1] rounded-2xl p-3 text-[11px] text-[#444746] leading-relaxed">
              <div className="font-bold text-[#1f1f1f] mb-1">현재 전송 대상</div>
              <div className="break-all">{llmEndpoint || "엔드포인트 미설정"}</div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#444746] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberExternalLlmWarning}
                onChange={(e) => setRememberExternalLlmWarning(e.target.checked)}
                className="h-4 w-4 accent-[#0b57d0]"
              />
              <span>이 기기에서 다시 보지 않기</span>
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowExternalLlmWarning(false);
                  setRememberExternalLlmWarning(false);
                }}
                className="px-5 py-2.5 rounded-full border border-[#e1e3e1] bg-white text-[#444746] text-xs font-bold hover:bg-[#f8fafd] transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmExternalLlmGeneration}
                disabled={generatingArtifact}
                className="px-5 py-2.5 rounded-full bg-[#0b57d0] text-white text-xs font-bold hover:bg-[#0842a0] disabled:opacity-50 transition-colors"
              >
                계속
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
