import { useEffect, useMemo, useState } from "react";
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
    handleGmailSync,
    handleDriveSync,
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

  const loadConditions = async () => {
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
  };

  useEffect(() => {
    void loadConditions();
  }, []);

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

  const onLegacySync = () => {
    void handleGmailSync(draft.keyword, null, draft.gmailLabelIds);
    void handleDriveSync(draft.keyword);
  };

  return (
    <section className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-[1.125rem] font-medium leading-snug text-text-primary flex items-center gap-2">
            <span className="material-symbols-rounded text-primary">inventory_2</span>
            Gmail · Drive 가져오기
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed mt-1">
            조건을 만들어 필요한 자료만 가져오고, 조건 범위에서 Wiki 초안을 만듭니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadConditions}
          disabled={controlsDisabled}
          className="rounded-full border border-surface-variant bg-white px-4 py-2 text-sm font-medium text-text-primary hover:border-primary/30 hover:bg-primary-container/20 disabled:opacity-50"
        >
          조건 새로고침
        </button>
      </header>

      {message && (
        <div className="rounded-2xl border border-primary/20 bg-primary-container/40 px-4 py-3 text-sm text-text-primary">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] gap-6">
        <div className="bg-white rounded-2xl border border-surface-variant p-5 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">새 조건 만들기</h3>
              <p className="text-xs text-text-secondary mt-1">전체 계정이 아니라 라벨, 폴더, 검색어, 기간 중 하나 이상으로 범위를 좁힙니다.</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-text-primary">
              <input
                type="checkbox"
                checked={draft.autoWikiEnabled}
                onChange={(event) => setDraft((current) => ({ ...current, autoWikiEnabled: event.target.checked }))}
                className="h-4 w-4 accent-primary"
              />
              자동 Wiki
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-text-secondary">조건 이름</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="예: 취업 자료, 논문 읽기"
                className="w-full rounded-full border border-surface-variant bg-surface px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-text-secondary">검색어</span>
              <input
                value={draft.keyword}
                onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value }))}
                placeholder="예: resume, paper, 계약서"
                className="w-full rounded-full border border-surface-variant bg-surface px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-text-secondary">기간</span>
            <div className="flex flex-wrap gap-2">
              {(["1w", "1m", "3m", "all"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, period }))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${draft.period === period ? "border-primary/20 bg-primary-container text-primary" : "border-surface-variant bg-surface text-text-secondary hover:text-text-primary"}`}
                >
                  {periodLabels[period]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-surface-variant/70 pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-secondary">Gmail 라벨</span>
              <button
                type="button"
                onClick={loadGmailLabels}
                disabled={labelControlsDisabled || gmailLabelsLoading}
                className="rounded-full border border-surface-variant bg-white px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-primary/30 hover:bg-primary-container/20 disabled:opacity-50"
              >
                {gmailLabelsLoading ? "불러오는 중" : "라벨 새로고침"}
              </button>
            </div>
            <input
              value={labelSearch}
              onChange={(event) => setLabelSearch(event.target.value)}
              placeholder="라벨 이름 검색"
              disabled={labelControlsDisabled || gmailLabels.length === 0}
              className="w-full rounded-full border border-surface-variant bg-surface px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <div className="max-h-28 overflow-y-auto flex flex-wrap gap-2">
              {!isGwsAuthenticated ? (
                <p className="text-xs text-text-secondary">Google Workspace 인증 후 라벨을 불러올 수 있습니다.</p>
              ) : filteredGmailLabels.length === 0 ? (
                <p className="text-xs text-text-secondary">표시할 라벨이 없습니다.</p>
              ) : (
                filteredGmailLabels.map((label) => {
                  const selected = draft.gmailLabelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.id)}
                      disabled={labelControlsDisabled}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected ? "border-primary/30 bg-primary-container text-primary" : "border-surface-variant bg-surface text-text-secondary hover:text-text-primary"} disabled:opacity-50`}
                    >
                      {selected ? "✓ " : ""}{label.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3 border-t border-surface-variant/70 pt-4">
            <span className="text-xs font-semibold text-text-secondary">Drive 폴더 ID 또는 링크</span>
            <div className="flex gap-2">
              <input
                value={driveFolderInput}
                onChange={(event) => setDriveFolderInput(event.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="min-w-0 flex-1 rounded-full border border-surface-variant bg-surface px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={addDriveFolder}
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-[#094cb3]"
              >
                추가
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.driveFolderIds.map((folderId) => (
                <button
                  key={folderId}
                  type="button"
                  onClick={() => removeDriveFolder(folderId)}
                  className="rounded-full border border-surface-variant bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
                >
                  {folderId} ×
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={saveCondition}
              disabled={controlsDisabled}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/60"
            >
              조건 저장
            </button>
            <button
              type="button"
              onClick={onLegacySync}
              disabled={controlsDisabled}
              className="rounded-full border border-surface-variant bg-white px-5 py-2.5 text-sm font-medium text-text-primary hover:border-primary/30 hover:bg-primary-container/20 disabled:opacity-50"
            >
              기존 동기화로 실행
            </button>
          </div>
        </div>

        <aside className="bg-white rounded-2xl border border-surface-variant p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">저장된 조건</h3>
          {conditions.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-text-secondary">아직 저장된 조건이 없습니다.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {conditions.map((condition) => (
                <button
                  key={condition.id}
                  type="button"
                  onClick={() => setSelectedConditionId(condition.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedConditionId === condition.id ? "border-primary/30 bg-primary-container/50" : "border-surface-variant bg-surface hover:border-primary/20"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-primary">{condition.name}</span>
                    <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-text-secondary">{condition.autoWikiEnabled ? "Wiki ON" : "Wiki OFF"}</span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary leading-relaxed">
                    {periodLabels[condition.period]} · {condition.keyword || "검색어 없음"} · Gmail {condition.gmailLabelIds.length} · Drive {condition.driveFolderIds.length}
                  </p>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => runSelectedCondition(false)}
            disabled={controlsDisabled || !selectedCondition}
            className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-[#094cb3] disabled:bg-surface-variant disabled:text-text-secondary/60"
          >
            {loading ? "실행 중" : "선택 조건 실행"}
          </button>
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
            확인 후 Wiki 만들기
          </button>
        </div>
      )}

      {runResult?.status === "success" && (
        <div className="bg-white rounded-2xl border border-surface-variant p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">가져온 결과</h3>
              <p className="text-xs text-text-secondary mt-1">
                Gmail {runResult.gmail?.count ?? 0}개 · Drive {runResult.drive?.count ?? 0}개 · Wiki 상태: {runResult.wiki?.status ?? "unknown"}
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
            Gmail은 V1에서 제목, 보낸 사람, 날짜, 라벨, 스니펫 기준으로 Wiki 초안을 만듭니다. 본문 전체 Wiki화는 후속 고도화 범위입니다.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
