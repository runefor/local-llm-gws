import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { API_BASE } from "../api/client";

export default function ServiceConfigPanel() {
  const {
    obsidianVaultPath,
    notionApiKey,
    notionPageId,
    savePipelineSettings,
    backendStatus,
    triggerNotionLogin,
    fetchNotionPages,
    addLog
  } = useApp();

  const [vaultPath, setVaultPath] = useState(obsidianVaultPath);
  const [apiKey, setApiKey] = useState(notionApiKey);
  const [pageId, setPageId] = useState(notionPageId);
  const [loading, setLoading] = useState(false);
  const [selectingFolder, setSelectingFolder] = useState(false);

  // Notion 연동 페이지 목록 상태
  const [notionPages, setNotionPages] = useState<{ id: string; title: string; url: string }[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [showManualNotion, setShowManualNotion] = useState(false);

  useEffect(() => {
    setVaultPath(obsidianVaultPath);
    setApiKey(notionApiKey);
    setPageId(notionPageId);
  }, [obsidianVaultPath, notionApiKey, notionPageId]);

  // Notion API Key가 갱신되면 페이지 리스트를 다시 가져옵니다.
  const loadNotionPages = async () => {
    if (!apiKey) {
      setNotionPages([]);
      return;
    }
    setLoadingPages(true);
    const pages = await fetchNotionPages();
    setNotionPages(pages);
    setLoadingPages(false);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: apiKey 변경 시에만 Notion 페이지 목록을 새로고침합니다.
  useEffect(() => {
    loadNotionPages();
  }, [apiKey]);

  const handleSelectFolder = async () => {
    if (backendStatus !== "online") return;
    setSelectingFolder(true);
    try {
      const response = await fetch(`${API_BASE}/api/utils/select_directory`, {
        method: "POST"
      });
      const data = await response.json();
      if (data.status === "success") {
        setVaultPath(data.directory);
      } else if (data.status === "error") {
        addLog(`폴더 선택 실패: ${data.message}`);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "알 수 없는 오류";
      addLog(`폴더 선택기 실행 실패: ${detail}`);
    } finally {
      setSelectingFolder(false);
    }
  };

  const handlePageIdChange = (val: string) => {
    // Notion URL 또는 32자리 UUID 패턴 매칭
    const notionUuidRegex = /[a-fA-F0-9]{32}/;
    const match = val.match(notionUuidRegex);
    if (match) {
      setPageId(match[0]);
    } else {
      setPageId(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backendStatus !== "online") return;
    setLoading(true);
    const success = await savePipelineSettings(vaultPath, apiKey, pageId);
    setLoading(false);
    addLog(success ? "지식 파이프라인 연동 설정 완료" : "지식 파이프라인 연동 설정 저장 실패");
  };

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold flex items-center text-text-primary">
          <span className="material-symbols-rounded mr-2 text-primary">extension</span>
          외부 지식 베이스 연동 설정
        </h2>
        <p className="text-[11px] text-text-secondary leading-relaxed mt-1">
          가공된 문서 데이터를 내보낼 Obsidian Vault 경로와 Notion API 키를 설정합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Obsidian 설정 */}
        <div className="border border-slate-100 p-4 rounded-xl space-y-3 bg-slate-50/30">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            Obsidian 설정
          </div>
          <div>
            <label htmlFor="obsidian-vault-path" className="block text-[10px] font-bold text-text-secondary uppercase mb-1">
              Obsidian Vault 로컬 절대 경로
            </label>
            <div className="flex gap-2">
              <input
                id="obsidian-vault-path"
                type="text"
                value={vaultPath}
                onChange={(e) => setVaultPath(e.target.value)}
                placeholder="예: C:\Users\Username\Documents\ObsidianVault"
                disabled={backendStatus !== "online"}
                className="flex-1 bg-white border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-secondary/30"
              />
              <button
                type="button"
                onClick={handleSelectFolder}
                disabled={selectingFolder || backendStatus !== "online"}
                className="bg-white hover:bg-slate-50 border border-surface-variant text-text-primary text-xs font-semibold px-4 rounded-full transition-colors cursor-pointer disabled:cursor-default"
              >
                {selectingFolder ? "선택 중..." : "폴더 선택"}
              </button>
            </div>
          </div>
        </div>

        {/* Notion 설정 */}
        <div className="border border-slate-100 p-4 rounded-xl space-y-3 bg-slate-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Notion 연동
            </div>
            {apiKey && (
              <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                <span className="material-symbols-rounded text-[10px]">check_circle</span>
                연결됨
              </span>
            )}
          </div>

          {/* 연결이 안 되어 있는 경우: OAuth 로그인 버튼 제공 */}
          {!apiKey ? (
            <div className="space-y-3">
              <p className="text-[11px] text-text-secondary">
                노션 로그인(OAuth)을 통해 코딩이나 설정 없이 클릭 한 번으로 간편하게 워크스페이스를 연동하세요.
              </p>
              <button
                type="button"
                onClick={triggerNotionLogin}
                disabled={backendStatus !== "online"}
                className="w-full bg-[#0b57d0] hover:bg-[#094cb3] text-white text-xs font-semibold py-2.5 px-4 rounded-full transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-rounded text-sm">login</span>
                Notion 계정으로 로그인 연동하기
              </button>
              
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualNotion(!showManualNotion)}
                  className="text-[10px] text-text-secondary hover:text-text-primary font-semibold underline cursor-pointer"
                >
                  {showManualNotion ? "간편 로그인 화면으로 돌아가기" : "직접 API Key 입력하여 수동 연동하기"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* 이미 연결된 경우: 페이지 선택 드롭다운 */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="notion-target-page" className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                  가공 노트를 전송할 대상 페이지 선택
                </label>
                {loadingPages ? (
                  <div className="text-xs text-text-secondary py-1 animate-pulse">페이지 목록을 읽어오는 중...</div>
                ) : notionPages.length === 0 ? (
                  <div className="text-[11px] text-amber-700 bg-amber-50/55 border border-amber-200/40 p-3 rounded-lg flex flex-col gap-2 leading-relaxed">
                    <span>가져온 페이지가 없습니다. 노션 사이트(또는 앱)에서 대상 페이지 우측 상단 <code>...</code> 클릭 → <strong>연결 추가</strong> 메뉴에서 생성한 통합 앱(GWS Extractor 등)에 체크하여 연동 권한을 허용해 주세요.</span>
                    <button type="button" onClick={loadNotionPages} className="text-xs text-primary font-bold text-left hover:underline">
                      목록 다시 불러오기
                    </button>
                  </div>
                ) : (
                  <select
                    id="notion-target-page"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    className="w-full bg-white border border-surface-variant rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
                  >
                    <option value="">-- 내보낼 페이지 선택 --</option>
                    {notionPages.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100/50">
                <span className="text-[10px] text-text-secondary">연결을 해제하고 다른 계정으로 연동하려면 버튼을 누르세요.</span>
                <button
                  type="button"
                  onClick={() => {
                    setApiKey("");
                    setPageId("");
                  }}
                  className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold py-1.5 px-4 rounded-full border border-red-200/50 cursor-pointer"
                >
                  연동 해제
                </button>
              </div>
            </div>
          )}

          {/* 수동 설정 또는 OAuth 로그인 창이 아닌 경우에 한해 수동 설정 렌더링 */}
          {(!apiKey && showManualNotion) && (
            <div className="mt-3 pt-3 border-t border-slate-100/50 space-y-3 animate-fadeIn">
              {/* 비개발자용 인터랙티브 가이드 */}
              <details className="text-[10px] text-text-secondary border border-slate-100 bg-slate-50/50 p-3 rounded-lg cursor-pointer">
                <summary className="font-semibold select-none outline-none">수동 연동 가이드 보기</summary>
                <ol className="list-decimal pl-4 mt-2 space-y-1 leading-relaxed">
                  <li>
                    <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer" className="text-primary font-semibold hover:underline">
                      Notion 통합 관리 페이지
                    </a>
                    에 접속하여 <strong>'새 통합'</strong>을 만듭니다.
                  </li>
                  <li>
                    생성된 통합의 API Key(Internal Token)를 복사해 아래 입력란에 넣습니다.
                  </li>
                  <li>
                    내보낼 페이지 우측 상단 <code>...</code> 클릭 → <strong>연결 추가</strong>에서 생성한 통합 이름을 검색해 추가합니다.
                  </li>
                  <li>
                    해당 페이지의 URL 주소 전체를 복사해서 아래 Page ID 칸에 붙여넣으면 32자리 ID가 자동으로 추출됩니다!
                  </li>
                </ol>
              </details>

              <div>
                <label htmlFor="notion-api-key" className="block text-[10px] font-bold text-text-secondary uppercase mb-1">
                  Notion API Key
                </label>
                <input
                  id="notion-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="secret_..."
                  disabled={backendStatus !== "online"}
                  className="w-full bg-white border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-secondary/30"
                />
              </div>
              <div>
                <label htmlFor="notion-page-id" className="block text-[10px] font-bold text-text-secondary uppercase mb-1">
                  대상 Page ID (또는 페이지 URL 붙여넣기)
                </label>
                <input
                  id="notion-page-id"
                  type="text"
                  value={pageId}
                  onChange={(e) => handlePageIdChange(e.target.value)}
                  placeholder="페이지 URL을 통째로 붙여넣으셔도 좋습니다."
                  disabled={backendStatus !== "online"}
                  className="w-full bg-white border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-secondary/30"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || backendStatus !== "online"}
          className="bg-primary hover:bg-[#094cb3] disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold py-2 px-6 rounded-full transition-all cursor-pointer disabled:cursor-default"
        >
          {loading ? "저장 중..." : "연동 설정 저장"}
        </button>
      </form>
    </div>
  );
}
