import SyncPanel from "./SyncPanel";

export function IndexingWorkspacePanel() {
  return (
    <div className="h-full min-h-0 space-y-6 overflow-y-auto pr-1">
      <SyncPanel />
      <div className="bg-primary-container/20 rounded-2xl p-6 border border-primary-container/30 text-xs text-text-secondary">
        <h3 className="font-semibold text-text-primary mb-2 flex items-center">
          <span className="material-symbols-rounded text-primary mr-1 text-sm">route</span>
          벡터화/인덱싱 안내
        </h3>
        <p className="leading-relaxed">
          자료 가져오기에서 찾은 Gmail/Drive 원본을 검색 가능한 근거로 준비하는 단계입니다. 완료 후 검색하기 메뉴에서 근거를 찾고 정보 묶음으로 저장하세요.
        </p>
      </div>
    </div>
  );
}
