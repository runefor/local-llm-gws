import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useApp, type DriveItem, type WorkspaceItem } from "../context/AppContext";
import { OriginalDetailModal, OriginalErrorToast } from "./OriginalDetailModal";
import { OriginalOpenButton } from "./OriginalOpenButton";
import { fetchOriginalDetail, type OriginalDetail } from "./originalDetail";
import {
  buildDriveOriginalQuery,
  drivePeriodOptions,
  driveTypeOptions,
  type DrivePeriodFilter,
  type DriveTypeFilter,
} from "./workspaceOriginalSearchHelpers";
import { loadSavedSearchConditions, saveSearchCondition, type SavedSearchCondition } from "./savedSearchConditions";

interface DriveSearchWorkspaceProps {
  readonly isDesktop?: boolean;
}

type Notice = {
  readonly type: "success" | "error" | "info";
  readonly text: string;
};

type DriveSearchConditionValues = {
  readonly keyword: string;
  readonly typeFilter: DriveTypeFilter;
  readonly period: DrivePeriodFilter;
  readonly sharedWithMe: boolean;
  readonly maxItems: string;
};

const driveSearchConditionKey = "local-llm-gws:drive-original-search-conditions:v1";

function driveItemToWorkspaceItem(item: DriveItem): WorkspaceItem {
  return {
    id: item.id,
    type: "drive",
    title: item.name || "이름 없는 파일",
    subtitle: item.mimeType || "알 수 없는 유형",
    resourceKey: item.resourceKey,
    timestamp: item.modifiedTime || new Date().toISOString(),
  };
}

function formatDriveDate(date?: string): string {
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

function getMimeTypeLabel(mimeType: string): string {
  if (mimeType.includes("document")) return "Google Docs";
  if (mimeType.includes("spreadsheet")) return "Google Sheets";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("plain")) return "텍스트";
  return mimeType.split("/").pop() || "파일";
}

export default function DriveSearchWorkspace({ isDesktop = false }: DriveSearchWorkspaceProps) {
  const {
    backendStatus,
    isGwsAuthenticated,
    driveItems,
    syncStatus,
    searchDriveMetadata,
  } = useApp();

  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<DriveTypeFilter>("all");
  const [period, setPeriod] = useState<DrivePeriodFilter>("30d");
  const [sharedWithMe, setSharedWithMe] = useState(false);
  const [maxItems, setMaxItems] = useState("30");
  const [conditionName, setConditionName] = useState("");
  const [selectedConditionId, setSelectedConditionId] = useState("");
  const [savedConditions, setSavedConditions] = useState<SavedSearchCondition<DriveSearchConditionValues>[]>(() => loadSavedSearchConditions<DriveSearchConditionValues>(driveSearchConditionKey));
  const [notice, setNotice] = useState<Notice | null>(null);
  const [originalDetail, setOriginalDetail] = useState<OriginalDetail | null>(null);
  const [originalLoadingId, setOriginalLoadingId] = useState<string | null>(null);
  const [originalError, setOriginalError] = useState<string | null>(null);

  const isSearching = syncStatus === "syncing";
  const canUseDrive = backendStatus === "online" && isGwsAuthenticated;
  const driveQuery = useMemo(() => buildDriveOriginalQuery({ keyword, typeFilter, period, sharedWithMe }), [keyword, period, sharedWithMe, typeFilter]);
  const disabledReason = !canUseDrive
    ? backendStatus !== "online"
      ? "백엔드 서버가 온라인이어야 합니다."
      : "Google Workspace 인증이 필요합니다."
    : "";
  const noticeClassName = notice?.type === "success"
    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : notice?.type === "error"
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : "bg-primary-container/40 border-primary/20 text-primary";

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!canUseDrive) return;

    setNotice(null);
    const parsedMaxItems = Number.parseInt(maxItems, 10);
    const searched = await searchDriveMetadata(driveQuery, Number.isNaN(parsedMaxItems) ? 30 : parsedMaxItems);
    setNotice(searched
      ? { type: "success", text: "Drive 원본 검색이 완료되었습니다. 필요한 문서를 열어 내용을 확인하세요." }
      : { type: "error", text: "Drive 원본 검색에 실패했습니다. 실행 로그를 확인하세요." });
  };

  const handleSaveCondition = () => {
    if (!conditionName.trim()) {
      setNotice({ type: "info", text: "저장할 조건 이름을 먼저 입력하세요." });
      return;
    }
    const nextConditions = saveSearchCondition<DriveSearchConditionValues>(driveSearchConditionKey, conditionName, {
      keyword,
      typeFilter,
      period,
      sharedWithMe,
      maxItems,
    });
    setSavedConditions(nextConditions);
    setSelectedConditionId(nextConditions[0]?.id ?? "");
    setNotice({ type: "success", text: "Drive 검색 조건을 저장했습니다." });
  };

  const handleApplyCondition = () => {
    const condition = savedConditions.find((item) => item.id === selectedConditionId);
    if (!condition) {
      setNotice({ type: "info", text: "적용할 저장 조건을 선택하세요." });
      return;
    }
    setKeyword(condition.values.keyword);
    setTypeFilter(condition.values.typeFilter);
    setPeriod(condition.values.period);
    setSharedWithMe(condition.values.sharedWithMe);
    setMaxItems(condition.values.maxItems);
    setNotice({ type: "success", text: "Drive 검색 조건을 입력값에 적용했습니다. 검색은 실행하지 않았습니다." });
  };

  const handleOpenOriginal = async (item: DriveItem) => {
    if (!canUseDrive) return;

    setOriginalLoadingId(item.id);
    setOriginalError(null);
    try {
      setOriginalDetail(await fetchOriginalDetail(driveItemToWorkspaceItem(item)));
    } catch (error) {
      setOriginalError(error instanceof Error ? error.message : "네트워크 오류로 원문을 불러오지 못했습니다.");
    } finally {
      setOriginalLoadingId(null);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border border-surface-variant shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col ${isDesktop ? "h-full min-h-0 overflow-hidden" : "min-h-[680px]"}`}>
      <div className={`${isDesktop ? "p-4" : "p-6"} border-b border-surface-variant flex items-start justify-between gap-4 flex-wrap`}>
        <div className="flex flex-col gap-1">
          <h2 className="text-text-primary text-base font-semibold flex items-center">
            <span className="material-symbols-rounded mr-2 text-primary">folder_special</span>
            Drive 원본 검색
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Drive 원본을 파일 형식, 수정 기간, 공유 여부로 좁혀 찾습니다. 여기서 찾은 원본은 자동으로 벡터 검색에 들어가지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          <span className={`px-3 py-1 rounded-full border ${backendStatus === "online" ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700"}`}>백엔드 {backendStatus === "online" ? "실행 중" : backendStatus === "connecting" ? "확인 중" : "대기 중"}</span>
          <span className={`px-3 py-1 rounded-full border ${isGwsAuthenticated ? "bg-primary-container/60 border-primary-container text-primary" : "bg-surface border-surface-variant text-text-secondary"}`}>Google {isGwsAuthenticated ? "연결됨" : "로그인 필요"}</span>
          <span className="px-3 py-1 rounded-full bg-surface border border-surface-variant text-text-secondary">결과 {driveItems.length}개</span>
        </div>
      </div>

      {notice && (
        <div className={`mx-6 mt-5 flex items-start gap-2 rounded-xl border p-3 text-xs font-medium ${noticeClassName}`}>
          <span className="material-symbols-rounded text-base mt-0.5">{notice.type === "success" ? "check_circle" : notice.type === "error" ? "error" : "info"}</span>
          <span className="flex-1 leading-relaxed">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100 transition-opacity">
            <span className="material-symbols-rounded text-sm">close</span>
          </button>
        </div>
      )}

      {!canUseDrive && (
        <div className="mx-6 mt-5 bg-surface border border-surface-variant rounded-xl p-3 text-xs text-text-secondary flex items-start gap-2">
          <span className="material-symbols-rounded text-primary text-base mt-0.5">lock</span>
          <span className="leading-relaxed">{disabledReason}</span>
        </div>
      )}

      <div className={`grid grid-cols-1 min-[1140px]:grid-cols-[minmax(320px,0.78fr)_minmax(560px,1.22fr)] ${isDesktop ? "flex-1 min-h-0 gap-4 overflow-hidden p-4" : "gap-5 p-6"}`}>
        <section className={`bg-surface rounded-2xl border border-surface-variant flex flex-col min-h-0 ${isDesktop ? "gap-2 p-2" : "gap-3 p-3"}`}>
          <form onSubmit={handleSearch} className={`flex flex-col ${isDesktop ? "gap-2" : "gap-3"}`}>
            <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-rounded text-primary text-sm">tune</span>
              Drive 상세 조건
            </h3>

            <div className={`rounded-2xl border border-surface-variant bg-white ${isDesktop ? "p-2" : "p-3"}`}>
              <div className={`${isDesktop ? "mb-1.5" : "mb-2"} flex items-center gap-1.5 text-[11px] font-semibold text-text-primary`}>
                <span className="material-symbols-rounded text-sm text-primary">bookmark</span>
                저장 조건
              </div>
              <div className={`grid grid-cols-1 ${isDesktop ? "gap-1.5" : "gap-2"}`}>
                <input type="text" value={conditionName} onChange={(event) => setConditionName(event.target.value)} disabled={!canUseDrive || isSearching} placeholder="조건 이름" className={`w-full rounded-full border border-surface-variant bg-surface px-3 text-xs text-text-primary transition-all placeholder:text-text-secondary/55 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 ${isDesktop ? "py-1.5" : "py-2"}`} />
                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                  <select value={selectedConditionId} onChange={(event) => setSelectedConditionId(event.target.value)} disabled={!canUseDrive || isSearching || savedConditions.length === 0} className={`min-w-0 rounded-full border border-surface-variant bg-surface px-3 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 ${isDesktop ? "py-1.5" : "py-2"}`}>
                    <option value="">불러올 조건 선택</option>
                    {savedConditions.map((condition) => (
                      <option key={condition.id} value={condition.id}>{condition.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={handleSaveCondition} disabled={!canUseDrive || isSearching} className={`rounded-full border border-surface-variant bg-surface px-3 text-[11px] font-semibold text-text-primary hover:border-primary/30 hover:bg-primary-container/25 disabled:opacity-50 ${isDesktop ? "py-1.5" : "py-2"}`}>
                    저장
                  </button>
                  <button type="button" onClick={handleApplyCondition} disabled={!canUseDrive || isSearching || savedConditions.length === 0} className={`rounded-full bg-primary px-3 text-[11px] font-semibold text-white hover:bg-primary/90 disabled:bg-white disabled:text-text-secondary/40 ${isDesktop ? "py-1.5" : "py-2"}`}>
                    적용
                  </button>
                </div>
                {!isDesktop && <p className="text-[11px] leading-relaxed text-text-secondary">적용은 입력값만 채우고 검색은 실행하지 않습니다.</p>}
              </div>
            </div>

            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold text-text-secondary">키워드</span>
              <div className="relative">
                <span className="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary text-lg">search</span>
                <input type="text" value={keyword} onChange={(event) => setKeyword(event.target.value)} disabled={!canUseDrive || isSearching} placeholder="예: 계약서, 보고서, 지원 자료" className={`w-full bg-white border border-surface-variant rounded-full pl-10 pr-4 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 transition-all placeholder:text-text-secondary/55 ${isDesktop ? "py-2" : "py-2.5"}`} />
              </div>
            </label>

            <div className={isDesktop ? "space-y-1.5" : "space-y-2"}>
              <span className="text-[11px] font-semibold text-text-secondary">파일 형식</span>
              <div className="flex flex-wrap gap-2">
                {driveTypeOptions.map((option) => (
                  <button key={option.value} type="button" onClick={() => setTypeFilter(option.value)} disabled={!canUseDrive || isSearching} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${typeFilter === option.value ? "border-primary/20 bg-primary-container text-primary" : "border-surface-variant bg-white text-text-secondary hover:border-primary/30 hover:bg-primary-container/25"} disabled:opacity-50`}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={isDesktop ? "space-y-1.5" : "space-y-2"}>
              <span className="text-[11px] font-semibold text-text-secondary">수정 기간</span>
              <div className="flex flex-wrap gap-2">
                {drivePeriodOptions.map((option) => (
                  <button key={option.value} type="button" onClick={() => setPeriod(option.value)} disabled={!canUseDrive || isSearching} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${period === option.value ? "border-primary/20 bg-primary-container text-primary" : "border-surface-variant bg-white text-text-secondary hover:border-primary/30 hover:bg-primary-container/25"} disabled:opacity-50`}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className={`flex items-center gap-2 rounded-2xl border border-surface-variant bg-white px-3 text-[11px] font-semibold text-text-primary ${isDesktop ? "py-1.5" : "py-2"}`}>
              <input type="checkbox" checked={sharedWithMe} onChange={(event) => setSharedWithMe(event.target.checked)} disabled={!canUseDrive || isSearching} className="h-4 w-4 accent-primary" />
              공유받은 문서만
            </label>

            <div className="grid grid-cols-[110px_1fr] gap-2">
              <input type="number" min="1" max="200" value={maxItems} onChange={(event) => setMaxItems(event.target.value)} disabled={!canUseDrive || isSearching} aria-label="최대 검색 Drive 문서 수" className={`bg-white border border-surface-variant rounded-full px-3 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 ${isDesktop ? "py-1.5" : "py-2"}`} />
              <button type="submit" disabled={!canUseDrive || isSearching} className={`bg-primary hover:bg-primary/90 disabled:bg-white disabled:text-text-secondary/40 text-white text-xs font-semibold px-5 rounded-full transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5 ${isDesktop ? "py-1.5" : "py-2"}`}>
                <span className={`material-symbols-rounded text-sm ${isSearching ? "animate-spin" : ""}`}>{isSearching ? "sync" : "travel_explore"}</span>
                <span>{isSearching ? "검색 중..." : "Drive 원본 검색"}</span>
              </button>
            </div>
          </form>

          <div className={`rounded-2xl border border-surface-variant bg-white text-[11px] text-text-secondary ${isDesktop ? "p-2" : "p-2.5"}`}>
            <span>검색 결과 <strong className="text-text-primary">{driveItems.length}</strong>개</span>
            {!isDesktop && <p className="mt-1.5 leading-relaxed">원문 확인 후 벡터 검색 대상이 필요하면 벡터 자료 찾기에서 Drive 인덱스를 갱신하세요.</p>}
          </div>
        </section>

        <section className={`bg-surface rounded-2xl border border-surface-variant p-4 flex flex-col gap-4 ${isDesktop ? "min-h-0 overflow-hidden" : ""}`}>
          <div className="flex items-center justify-between gap-3 bg-white border border-surface-variant rounded-xl px-4 py-3 text-[11px] text-text-secondary">
            <div>
              <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <span className="material-symbols-rounded text-primary text-sm">description</span>
                검색된 Drive 원본
              </h3>
              <p className="mt-1 leading-relaxed">문서명, 유형, 수정 시간을 확인하고 필요한 원본만 엽니다.</p>
            </div>
            <span className="rounded-full border border-surface-variant bg-surface px-3 py-1 font-bold">결과 {driveItems.length}개</span>
          </div>

          <div className={`flex-1 pr-1 -mr-1 ${isDesktop ? "min-h-0 overflow-y-auto" : "max-h-[680px] overflow-y-auto"}`}>
            {isSearching ? (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center gap-2 text-text-secondary">
                <span className="material-symbols-rounded text-4xl text-primary animate-spin">sync</span>
                <p className="text-xs font-semibold">Drive 원본을 가져오는 중입니다.</p>
              </div>
            ) : driveItems.length === 0 ? (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center gap-2 text-text-secondary">
                <span className="material-symbols-rounded text-4xl text-text-secondary/35">folder_open</span>
                <p className="text-xs font-semibold">아직 검색한 Drive 원본이 없습니다.</p>
                <p className="text-[11px] leading-relaxed max-w-[300px]">왼쪽 상세 조건으로 Drive 문서를 먼저 찾으세요.</p>
              </div>
            ) : (
              <div className="space-y-3 pb-2">
                {driveItems.map((item) => (
                  <article key={item.id} className="bg-white border border-surface-variant hover:border-primary/25 rounded-2xl p-4 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-text-primary leading-relaxed truncate">{item.name || "이름 없는 파일"}</h4>
                        <p className="text-[11px] text-text-secondary truncate mt-0.5">{getMimeTypeLabel(item.mimeType)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-surface border-surface-variant text-text-secondary">
                          {formatDriveDate(item.modifiedTime)}
                        </span>
                        <OriginalOpenButton isLoading={originalLoadingId === item.id} onClick={() => void handleOpenOriginal(item)} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-text-secondary">
                      <span className="bg-surface border border-surface-variant px-2 py-0.5 rounded-full">id {item.id}</span>
                      {item.resourceKey && <span className="bg-surface border border-surface-variant px-2 py-0.5 rounded-full">resource key</span>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {originalError && (
        <OriginalErrorToast message={originalError} onClose={() => setOriginalError(null)} />
      )}

      {originalDetail && (
        <OriginalDetailModal detail={originalDetail} onClose={() => setOriginalDetail(null)} />
      )}
    </div>
  );
}
