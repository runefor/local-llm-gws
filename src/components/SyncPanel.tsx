import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWikiCondition,
  listWikiConditions,
  runWikiCondition,
  type ConditionRecord,
  type WikiCondition,
  type WikiConditionDraft,
  type WikiConditionPeriod,
  type WikiConditionRunResult,
} from "../api/wikiConditions";
import { useApp } from "../context/AppContext";

const periodLabels: Record<WikiConditionPeriod, string> = {
  "1w": "최근 1주일",
  "1m": "최근 1개월",
  "3m": "최근 3개월",
  "all": "전체 기간",
};

const emptyDraft: WikiConditionDraft = {
  name: "",
  gmailLabelIds: [],
  driveFolderIds: [],
  keyword: "",
  period: "1m",
  autoWikiEnabled: true,
};

const recordMatches = (record: ConditionRecord, searchTerm: string): boolean => {
  if (!searchTerm) return true;
  const haystack = [
    record.title,
    record.subject ?? "",
    record.from ?? "",
    record.snippet ?? "",
    record.name ?? "",
    record.mimeType ?? "",
    record.locationStatus ?? "",
    ...(record.labelIds ?? []),
  ].join(" ").toLowerCase();
  return haystack.includes(searchTerm);
};

export default function SyncPanel() {
  const {
    syncStatus,
    backendStatus,
    gmailLabels,
    gmailLabelsLoading,
    loadGmailLabels,
    isGwsAuthenticated,
  } = useApp();

  const [draft, setDraft] = useState<WikiConditionDraft>(emptyDraft);
  const [conditions, setConditions] = useState<WikiCondition[]>([]);
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [labelSearch, setLabelSearch] = useState("");
  const [driveFolderInput, setDriveFolderInput] = useState("");
  const [resultSearch, setResultSearch] = useState("");
  const [runResult, setRunResult] = useState<WikiConditionRunResult | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);

  const controlsDisabled = loading || syncStatus === "syncing" || backendStatus !== "online";
  const labelControlsDisabled = controlsDisabled || !isGwsAuthenticated;
  const selectedCondition = conditions.find((condition) => condition.id === selectedConditionId) ?? null;

  const filteredGmailLabels = useMemo(() => {
    const searchTerm = labelSearch.trim().toLowerCase();
    if (!searchTerm) return gmailLabels;
    return gmailLabels.filter((label) => label.name.toLowerCase().includes(searchTerm));
  }, [gmailLabels, labelSearch]);

  const filteredRecords = useMemo(() => {
    const records = runResult?.records ?? [];
    return records.filter((record) => recordMatches(record, resultSearch.trim().toLowerCase()));
  }, [resultSearch, runResult]);

  const labelNameById = useMemo(() => {
    return new Map(gmailLabels.map((label) => [label.id, label.name]));
  }, [gmailLabels]);

  const selectedLabelNames = useMemo(() => {
    return draft.gmailLabelIds.map(id => labelNameById.get(id) || id);
  }, [draft.gmailLabelIds, labelNameById]);

  const loadConditions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listWikiConditions();
      if (response.status === "success") {
        setConditions(response.conditions);
        setSelectedConditionId((current) => current || response.conditions[0]?.id || "");
        setMessage("");
      } else {
        setMessage(response.message ?? "조건 목록을 불러오지 못했습니다.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "조건 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConditions();
  }, [loadConditions]);

  const toggleLabel = (labelId: string) => {
    setDraft((current) => ({
      ...current,
      gmailLabelIds: current.gmailLabelIds.includes(labelId)
        ? current.gmailLabelIds.filter((id) => id !== labelId)
        : [...current.gmailLabelIds, labelId],
    }));
  };

  const addDriveFolder = () => {
    const value = driveFolderInput.trim();
    if (!value) return;
    setDraft((current) => ({ ...current, driveFolderIds: [...current.driveFolderIds, value] }));
    setDriveFolderInput("");
  };

  const removeDriveFolder = (folderId: string) => {
    setDraft((current) => ({
      ...current,
      driveFolderIds: current.driveFolderIds.filter((id) => id !== folderId),
    }));
  };

  const saveCondition = async () => {
    setLoading(true);
    try {
      const response = await createWikiCondition(draft);
      if (response.status !== "success" || !response.condition) {
        setMessage(response.message ?? "조건을 저장하지 못했습니다.");
        return;
      }
      setConditions((current) => [response.condition as WikiCondition, ...current]);
      setSelectedConditionId(response.condition.id);
      setDraft(emptyDraft);
      setRunResult(null);
      setMessage("조건을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "조건을 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const runSelectedCondition = async (confirmExternalLlm = false) => {
    if (!selectedCondition) {
      setMessage("실행할 조건을 선택하세요.");
      return;
    }
    setLoading(true);
    try {
      const response = await runWikiCondition(selectedCondition.id, confirmExternalLlm);
      setRunResult(response);
      setMessage(response.status === "success" ? "조건 실행이 끝났습니다." : response.message ?? "조건 실행에 실패했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "조건 실행에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-surface rounded-2xl p-4 md:p-6 border border-surface-variant/80 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] flex flex-col h-full min-h-0 gap-4 md:gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="text-[1.125rem] font-medium leading-snug text-text-primary flex items-center gap-2">
            <span className="material-symbols-rounded text-primary">auto_stories</span>
            Wiki 후보 조건
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed mt-1 break-keep">
            조건별로 필요한 원본 후보를 모으고, 메타데이터/스니펫 기반 초안을 만듭니다. 최종 Wiki는 검색하기에서 정보 묶음으로 확정하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={loadConditions}
          disabled={controlsDisabled}
          className="shrink-0 rounded-full border border-surface-variant bg-white px-4 py-2 text-sm font-medium text-text-primary hover:border-primary/30 hover:bg-primary-container/20 disabled:opacity-50 whitespace-nowrap"
        >
          조건 새로고침
        </button>
      </header>

      {message && (
        <div className="rounded-2xl border border-primary/20 bg-primary-container/40 px-4 py-3 text-sm text-text-primary">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] gap-4 md:gap-6 flex-1 min-h-0 overflow-hidden">
        {/* 새 조건 만들기 영역 - 압축 */}
        <div className="bg-white rounded-2xl border border-surface-variant p-4 space-y-3 flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between gap-2 border-b border-surface-variant/60 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">새 조건 만들기</h3>
              <p className="text-[11px] text-text-secondary mt-0.5">라벨, 폴더, 검색어, 기간 중 하나 이상으로 범위를 좁힙니다.</p>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-primary cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={draft.autoWikiEnabled}
                onChange={(event) => setDraft((current) => ({ ...current, autoWikiEnabled: event.target.checked }))}
                className="h-3.5 w-3.5 accent-primary cursor-pointer"
              />
              스니펫 초안 만들기
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-text-secondary">조건 이름</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="예: 취업 자료, 논문 읽기"
                className="w-full rounded-full border border-surface-variant bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-text-secondary">검색어</span>
              <input
                value={draft.keyword}
                onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value }))}
                placeholder="예: resume, paper"
                className="w-full rounded-full border border-surface-variant bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-text-secondary">기간</span>
            <div className="flex flex-wrap gap-1.5">
              {(["1w", "1m", "3m", "all"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, period }))}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${draft.period === period ? "border-primary/20 bg-primary-container text-primary" : "border-surface-variant bg-surface text-text-secondary hover:text-text-primary"}`}
                >
                  {periodLabels[period]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 border-t border-surface-variant/70 pt-3">
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-text-secondary">Gmail 라벨</span>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-0 rounded-2xl border border-surface-variant bg-surface px-4 py-2 text-xs text-text-secondary truncate">
                {selectedLabelNames.length > 0 ? selectedLabelNames.join(", ") : "선택된 라벨 없음"}
              </div>
              <button
                type="button"
                onClick={() => setLabelPickerOpen(true)}
                disabled={labelControlsDisabled}
                className="shrink-0 rounded-full border border-surface-variant bg-background px-3 py-1.5 text-[11px] font-semibold text-text-primary transition-colors hover:border-primary/30 hover:bg-primary-container/25 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                라벨 변경
              </button>
            </div>

            {labelPickerOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/20 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-background shadow-lg border border-surface-variant animate-in slide-in-from-bottom-4 duration-300">
                  <div className="flex items-center justify-between border-b border-surface-variant px-5 py-4 bg-surface">
                    <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                      <span className="material-symbols-rounded text-primary text-base">label</span>
                      Gmail 라벨 선택
                    </h3>
                    <button
                      type="button"
                      onClick={() => setLabelPickerOpen(false)}
                      className="rounded-full p-1 text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                    >
                      <span className="material-symbols-rounded text-xl">close</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 bg-surface p-4 border-b border-surface-variant/50">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={labelSearch}
                        onChange={(event) => setLabelSearch(event.target.value)}
                        disabled={labelControlsDisabled || gmailLabels.length === 0}
                        placeholder="라벨 이름 검색"
                        className="min-w-0 flex-1 rounded-full border border-surface-variant bg-surface px-4 py-2 text-xs text-text-primary transition-all placeholder:text-text-secondary/55 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={loadGmailLabels}
                        disabled={labelControlsDisabled || gmailLabelsLoading}
                        className="rounded-full border border-surface-variant bg-white px-4 py-2 text-xs font-semibold text-text-primary hover:border-primary/30 hover:bg-primary-container/25 disabled:opacity-50"
                      >
                        {gmailLabelsLoading ? "불러오는 중" : "라벨 불러오기"}
                      </button>
                    </div>
                  </div>
                  <div className="p-5 flex-1 min-h-[160px] max-h-[300px] overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {!isGwsAuthenticated ? (
                        <p className="text-xs text-text-secondary py-2">Google Workspace 인증 후 라벨을 불러올 수 있습니다.</p>
                      ) : gmailLabelsLoading ? (
                        <p className="text-xs text-text-secondary py-2">라벨 목록을 불러오고 있습니다...</p>
                      ) : gmailLabels.length === 0 ? (
                        <p className="text-xs text-text-secondary py-2">표시할 라벨이 없습니다.</p>
                      ) : filteredGmailLabels.length === 0 ? (
                        <p className="text-xs text-text-secondary py-2">검색어와 일치하는 라벨이 없습니다.</p>
                      ) : (
                        filteredGmailLabels.map((label) => {
                          const selected = draft.gmailLabelIds.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              onClick={() => toggleLabel(label.id)}
                              disabled={labelControlsDisabled}
                              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                                selected
                                  ? "border-primary/25 bg-primary-container text-primary shadow-sm"
                                  : "border-surface-variant bg-white text-text-secondary hover:border-primary/30 hover:bg-primary-container/25 hover:text-text-primary"
                              } disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
                            >
                              {selected ? "✓ " : ""}{label.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-surface-variant px-5 py-4 bg-surface">
                    <p className="text-xs text-text-secondary">선택 {draft.gmailLabelIds.length}개</p>
                    <button
                      type="button"
                      onClick={() => setLabelPickerOpen(false)}
                      className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      확인
                    </button>
                  </div>
                </div>
              </div>
            )}
            </div>

            <div className="space-y-1.5 lg:border-l lg:border-surface-variant/70 lg:pl-3 lg:mt-0 mt-3 border-t border-surface-variant/70 lg:border-t-0 pt-3 lg:pt-0">
              <span className="text-[11px] font-semibold text-text-secondary">Drive 폴더 ID/링크</span>
              <div className="flex gap-1.5">
                <input
                  value={driveFolderInput}
                  onChange={(event) => setDriveFolderInput(event.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="min-w-0 flex-1 rounded-full border border-surface-variant bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={addDriveFolder}
                  className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-on-primary hover:bg-[#094cb3] shrink-0"
                >
                  추가
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {draft.driveFolderIds.map((folderId) => (
                  <button
                    key={folderId}
                    type="button"
                    onClick={() => removeDriveFolder(folderId)}
                    className="rounded-full border border-surface-variant bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                  >
                    {folderId} ×
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={saveCondition}
              disabled={controlsDisabled}
              className="rounded-full bg-primary px-5 py-2 text-xs font-medium text-on-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/60 flex items-center justify-center gap-1 min-w-[120px]"
            >
              <span className="material-symbols-rounded text-[14px]">save</span>
              조건 저장
            </button>
          </div>
        </div>

        {/* 저장된 조건 (우측 패널) - 여기에만 스크롤 */}
        <aside className="bg-white rounded-2xl border border-surface-variant p-4 flex flex-col gap-3 min-h-0">
          <h3 className="text-sm font-semibold text-text-primary shrink-0">저장된 조건</h3>
          {conditions.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-text-secondary shrink-0">아직 저장된 조건이 없습니다.</p>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {conditions.map((condition) => (
                <button
                  key={condition.id}
                  type="button"
                  onClick={() => setSelectedConditionId(condition.id)}
                  className={`w-full rounded-2xl border p-3.5 text-left transition-all ${selectedConditionId === condition.id ? "border-primary/30 bg-primary-container/50 shadow-sm" : "border-surface-variant bg-surface hover:border-primary/20"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-primary truncate pr-2">{condition.name}</span>
                    <span className="shrink-0 rounded-full bg-white/80 border border-surface-variant px-2 py-0.5 text-[10px] font-bold text-primary">{condition.autoWikiEnabled ? "초안 ON" : "초안 OFF"}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-text-secondary leading-relaxed break-keep">
                    {periodLabels[condition.period]} · {condition.keyword || "검색어 없음"} · Gmail {condition.gmailLabelIds.length} · Drive {condition.driveFolderIds.length}
                  </p>
                </button>
              ))}
            </div>
          )}
          <div className="shrink-0 pt-1">
            <button
              type="button"
              onClick={() => runSelectedCondition(false)}
              disabled={controlsDisabled || !selectedCondition}
              className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/60 flex items-center justify-center gap-2"
            >
              {loading ? (
                 <span className="material-symbols-rounded text-sm animate-spin">sync</span>
              ) : (
                 <span className="material-symbols-rounded text-sm">play_arrow</span>
              )}
              {loading ? "실행 중..." : "선택 조건 후보 수집"}
            </button>
          </div>
        </aside>
      </div>

      {runResult?.wiki?.status === "warning_required" && (
        <div className="rounded-2xl border border-[#fbbc04]/40 bg-[#fff7d6] p-5 text-sm text-text-primary">
          <h3 className="font-semibold">{runResult.wiki.warning?.title ?? "외부 LLM 전송 확인"}</h3>
          <p className="mt-2 text-text-secondary">{runResult.wiki.warning?.message}</p>
          <button
            type="button"
            onClick={() => runSelectedCondition(true)}
            disabled={controlsDisabled}
            className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary hover:bg-[#094cb3] disabled:opacity-50"
          >
            확인 후 스니펫 초안 만들기
          </button>
        </div>
      )}

      {runResult?.status === "success" && (
        <div className="bg-white rounded-2xl border border-surface-variant p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">가져온 결과</h3>
              <p className="text-xs text-text-secondary mt-1">
                Gmail {runResult.gmail?.count ?? 0}개 · Drive {runResult.drive?.count ?? 0}개 · 초안 상태: {runResult.wiki?.status ?? "unknown"}{runResult.wiki?.artifact_status ? ` · 산출물: ${runResult.wiki.artifact_status}` : ""}
              </p>
            </div>
            <input
              value={resultSearch}
              onChange={(event) => setResultSearch(event.target.value)}
              placeholder="가져온 결과 안에서 검색"
              className="w-full md:w-72 rounded-full border border-surface-variant bg-surface px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <p className="rounded-2xl bg-surface px-4 py-3 text-xs text-text-secondary">
            Gmail은 V1에서 제목, 보낸 사람, 날짜, 라벨, 스니펫 기준으로 후보 초안을 만듭니다. 최종 Wiki는 원문을 검토한 정보 묶음에서 생성합니다.
          </p>

          <div className="max-h-[500px] overflow-y-auto pr-1 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredRecords.length === 0 ? (
              <p className="text-sm text-text-secondary">표시할 결과가 없습니다.</p>
            ) : (
              filteredRecords.map((record) => (
                <article key={`${record.source}-${record.id}`} className="rounded-2xl border border-surface-variant bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-semibold text-text-primary leading-snug">{record.title}</h4>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-primary uppercase">{record.source}</span>
                  </div>
                  {record.source === "gmail" ? (
                    <div className="mt-3 space-y-2 text-xs text-text-secondary">
                      <p>보낸 사람: {record.from || "알 수 없음"}</p>
                      <p>날짜: {record.date || "날짜 없음"}</p>
                      <p>라벨: {(record.labelIds ?? []).map((id) => labelNameById.get(id) ?? id).join(", ") || "라벨 없음"}</p>
                      <p className="leading-relaxed">{record.snippet || "스니펫 없음"}</p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2 text-xs text-text-secondary">
                      <p>종류: {record.mimeType || "알 수 없음"}</p>
                      <p>수정일: {record.modifiedTime || "수정일 없음"}</p>
                      <p>위치: {record.locationStatus || "위치 정보 없음"}</p>
                      {record.webViewLink && <a href={record.webViewLink} target="_blank" rel="noreferrer" className="text-primary font-semibold">Drive에서 열기</a>}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {syncStatus === "syncing" && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-text-secondary">
            <span className="font-medium">처리 상황</span>
            <span className="font-bold text-primary">처리 중</span>
          </div>
          <div className="w-full bg-surface-variant h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full w-full rounded-full animate-pulse" />
          </div>
        </div>
      )}
    </section>
  );
}
