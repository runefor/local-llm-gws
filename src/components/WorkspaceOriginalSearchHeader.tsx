import type { FormEvent } from "react";

type WorkspaceOriginalSearchHeaderProps = {
  readonly query: string;
  readonly disabled: boolean;
  readonly isSyncing: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onSubmit: (event: FormEvent) => void;
};

export function WorkspaceOriginalSearchHeader({
  query,
  disabled,
  isSyncing,
  onQueryChange,
  onSubmit,
}: WorkspaceOriginalSearchHeaderProps) {
  return (
    <div className="flex flex-col space-y-3 flex-shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="text-[#1f1f1f] text-base font-semibold flex items-center">
          <span className="material-symbols-rounded mr-2 text-[#0b57d0]">hub</span>
          Gmail · Drive 원본 검색
        </h2>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col space-y-2">
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <span className="material-symbols-rounded absolute left-3.5 top-1/2 -translate-y-1/2 text-[#444746] text-lg">search</span>
            <input
              type="text"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="GWS Gmail/Drive 원본 검색 (예: 보고서, from:sender)"
              disabled={disabled}
              className="w-full bg-[#f8fafd] pl-10 pr-4 py-2.5 rounded-full border border-[#e1e3e1] text-sm text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] disabled:opacity-50 transition-all placeholder:text-[#444746]/60"
            />
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="px-6 py-2.5 bg-[#0b57d0] hover:bg-[#0b57d0]/90 text-white rounded-full text-sm font-medium transition-all disabled:opacity-50 flex items-center space-x-1 cursor-pointer flex-shrink-0"
          >
            {isSyncing ? (
              <>
                <svg aria-hidden="true" className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>가져오는 중...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-rounded text-sm">sync</span>
                <span>원본 가져오기</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center space-x-1.5 text-[11px] text-[#444746] px-3">
          <span className="material-symbols-rounded text-[14px] text-[#0b57d0]">info</span>
          <span>
            검색어로 GWS 원본 목록만 조회합니다. 검색어가 없을 경우 <strong>기본 1주일</strong> 기간 필터가 적용됩니다.
            (팁: 여기서 가져온 Drive 원본은 자동으로 벡터 검색에 들어가지 않습니다. 검색하기에서 벡터 인덱스 갱신을 따로 실행하세요.)
          </span>
        </div>
      </form>
    </div>
  );
}
