import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";

interface SearchSource {
  doc_id: string;
  title: string;
  source: "gmail" | "drive";
  date: string;
}

interface SearchResult {
  answer: string;
  thought?: string;
  sources: SearchSource[];
}

interface IndexStatus {
  gmail_chunks: number;
  drive_chunks: number;
  total_chunks: number;
}

export default function RagSearchPanel() {
  const {
    addLog,
    backendStatus,
    exportToObsidian,
    exportToNotion,
    obsidianVaultPath,
    notionApiKey,
    notionPageId
  } = useApp();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  // 지식 노트 편집을 위한 상태
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftTags, setDraftTags] = useState<string>("rag-search, 지식베이스");

  // 내보내기 진행 상태
  const [exportingObsidian, setExportingObsidian] = useState(false);
  const [exportingNotion, setExportingNotion] = useState(false);

  // 알림 메시지 상태 (Inline Toast)
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info" | "warning";
    text: string;
  } | null>(null);

  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexing, setIndexing] = useState(false);

  const reviewRef = useRef<HTMLDivElement>(null);

  // 알림 자동 제거 타이머 설정
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // 인덱스 상태 조회
  const fetchIndexStatus = async () => {
    try {
      const response = await fetch("http://localhost:18000/api/rag/status");
      const data = await response.json();
      if (data.status === "success") {
        setIndexStatus({
          gmail_chunks: data.gmail_chunks,
          drive_chunks: data.drive_chunks,
          total_chunks: data.total_chunks
        });
      }
    } catch (err) {
      console.error("인덱스 상태 조회 에러:", err);
    }
  };

  // 강제 인덱싱 수행
  const handleIndexing = async () => {
    setIndexing(true);
    addLog("ChromaDB 지식베이스 인덱싱 작업 실행 중...");
    showNotification("info", "지식베이스 인덱싱을 갱신하는 중입니다...");
    try {
      const response = await fetch("http://localhost:18000/api/rag/index", { method: "POST" });
      const data = await response.json();
      if (data.status === "success") {
        addLog(`인덱싱 완료! Gmail ${data.gmail_indexed}개, Drive ${data.drive_indexed}개 동기화 처리.`);
        showNotification("success", "지식베이스 인덱싱 갱신이 완료되었습니다.");
        fetchIndexStatus();
      } else {
        addLog(`인덱싱 실패: ${data.message}`);
        showNotification("error", `인덱싱 실패: ${data.message}`);
      }
    } catch (err) {
      addLog("인덱싱 실패: 네트워크 에러");
      showNotification("error", "네트워크 에러로 인덱싱에 실패했습니다.");
    } finally {
      setIndexing(false);
    }
  };

  const showNotification = (type: "success" | "error" | "info" | "warning", text: string) => {
    setNotification({ type, text });
  };

  // RAG 검색 및 지식 추출
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading || backendStatus !== "online") return;

    setLoading(true);
    setResult(null);
    setNotification(null);
    addLog(`RAG 검색 및 지식 추출 요청: "${query}"`);

    try {
      const response = await fetch("http://localhost:18000/api/rag/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 5 }),
      });
      const data = await response.json();

      if (data.status === "success") {
        const searchRes: SearchResult = {
          answer: data.answer,
          thought: data.thought,
          sources: data.sources || [],
        };
        setResult(searchRes);
        
        // 검색 결과를 기반으로 검토용 초안 작성
        const dateStr = new Date().toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
        setDraftTitle(`[지식 정리] ${query.slice(0, 20)}${query.length > 20 ? "..." : ""} (${dateStr})`);
        setDraftContent(data.answer);
        
        addLog("RAG 검색 및 지식 정리 완료. 초안 검토를 진행합니다.");
        showNotification("success", "지식 추출 및 정리가 완료되었습니다. 아래 초안을 확인 후 외부 도구로 내보내세요.");
        
        // 검색 완료 후 화면을 스크롤 다운하여 편집 패널을 보여줌
        setTimeout(() => {
          reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      } else {
        addLog(`RAG 검색 오류: ${data.message}`);
        showNotification("error", `검색 실패: ${data.message}`);
      }
    } catch (err) {
      addLog("RAG 검색 중 오류가 발생했습니다.");
      showNotification("error", "네트워크 오류로 RAG 검색 및 요약에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // Obsidian 내보내기 처리
  const handleExportObsidian = async () => {
    if (!obsidianVaultPath) {
      showNotification("warning", "Obsidian Vault 경로가 설정되지 않았습니다. 설정 탭에서 저장소 경로를 설정해 주세요.");
      return;
    }

    setExportingObsidian(true);
    showNotification("info", "Obsidian Vault에 마크다운 파일을 생성하는 중입니다...");
    
    const tags = draftTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await exportToObsidian(draftTitle, draftContent, tags);
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

  // Notion 내보내기 처리
  const handleExportNotion = async () => {
    if (!notionApiKey || !notionPageId) {
      showNotification("warning", "Notion API Key 또는 Page ID가 등록되지 않았습니다. 설정 탭에서 Notion을 연동해 주세요.");
      return;
    }

    setExportingNotion(true);
    showNotification("info", "Notion 페이지로 지식 노트를 전송하는 중입니다...");

    try {
      const res = await exportToNotion(draftTitle, draftContent);
      if (res.status === "success") {
        showNotification("success", "Notion 페이지에 성공적으로 새 지식 노트가 작성되었습니다.");
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

  // 마크다운 노트 클립보드 복사
  const handleCopyToClipboard = async () => {
    const formattedNote = `# ${draftTitle}\n\n${draftContent}`;
    try {
      await navigator.clipboard.writeText(formattedNote);
      showNotification("success", "마크다운 노트가 클립보드에 복사되었습니다. 원하는 곳에 붙여넣으세요.");
    } catch (err) {
      showNotification("error", "복사하는 도중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    if (backendStatus === "online") {
      fetchIndexStatus();
    }
  }, [backendStatus]);

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#e1e3e1] shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] flex flex-col gap-6 w-full">
      {/* 타이틀 및 헤더 영역 */}
      <div className="flex items-center justify-between border-b border-[#e1e3e1] pb-4 flex-wrap gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[#1f1f1f] text-base font-semibold flex items-center">
            <span className="material-symbols-rounded mr-2 text-[#0b57d0]">hub</span>
            RAG 지식 추출 및 저장 파이프라인
          </h2>
          <p className="text-xs text-[#444746] font-normal leading-relaxed">
            Gmail 및 Drive 데이터를 기반으로 지식 초안을 작성하고 Notion/Obsidian에 안전하게 기록합니다.
          </p>
        </div>
        
        {/* 인덱싱 강제 갱신 버튼 (완전한 알약 형태) */}
        <button
          onClick={handleIndexing}
          disabled={indexing || backendStatus !== "online"}
          className="text-xs bg-[#d3e3fd] hover:bg-[#c0d8fc] text-[#0b57d0] font-semibold py-1.5 px-4 rounded-full cursor-pointer disabled:cursor-default disabled:opacity-50 transition-all flex items-center gap-1.5"
        >
          <span className={`material-symbols-rounded text-sm ${indexing ? "animate-spin" : ""}`}>sync</span>
          {indexing ? "갱신 중..." : "인덱싱 갱신"}
        </button>
      </div>

      {/* 인덱스 데이터 청크 상태 요약 */}
      {indexStatus && (
        <div className="flex flex-wrap gap-4 text-xs bg-[#f8fafd] border border-[#e1e3e1] p-3.5 rounded-2xl text-[#444746] font-medium">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[#0b57d0] text-sm">mail</span>
            <span>Gmail: <strong>{indexStatus.gmail_chunks} chunks</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[#0b57d0] text-sm">description</span>
            <span>Drive: <strong>{indexStatus.drive_chunks} chunks</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[#0b57d0] text-sm">database</span>
            <span>전체 지식: <strong>{indexStatus.total_chunks} chunks</strong></span>
          </div>
        </div>
      )}

      {/* 검색 입력 양식 */}
      <form onSubmit={handleSearch} className="flex gap-2.5">
        <div className="relative flex-1">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-[#444746] text-lg select-none">search</span>
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading || backendStatus !== "online"}
            placeholder="동기화된 이메일/문서 내에서 검색 및 요약할 내용을 입력하세요 (예: 2분기 예산안 핵심 정리)..." 
            className="w-full bg-[#f8fafd] pl-11 pr-4 py-3 rounded-full border border-[#e1e3e1] text-xs text-[#1f1f1f] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] disabled:opacity-50 transition-all placeholder:text-[#444746]/60 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || loading || backendStatus !== "online"}
          className="bg-[#0b57d0] hover:bg-[#0b57d0]/90 disabled:bg-[#f8fafd] disabled:text-[#444746]/40 text-[#ffffff] text-xs font-semibold px-6 rounded-full transition-all cursor-pointer disabled:cursor-default flex items-center justify-center min-w-[110px]"
        >
          {loading ? (
            <div className="flex items-center gap-1.5">
              <svg className="animate-spin h-3.5 w-3.5 text-[#444746]/50" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>추출 중...</span>
            </div>
          ) : "지식 추출"}
        </button>
      </form>

      {/* 실시간 피드백 및 상태 토스트 */}
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
          <button onClick={() => setNotification(null)} className="text-current opacity-60 hover:opacity-100 transition-opacity">
            <span className="material-symbols-rounded text-base">close</span>
          </button>
        </div>
      )}

      {/* 지식 초안 검토 영역 (결과 렌더링) */}
      {result && (
        <div ref={reviewRef} className="flex flex-col gap-5 bg-[#f8fafd] border border-[#e1e3e1] p-5 rounded-2xl animate-slideUp">
          <div className="flex items-center justify-between border-b border-[#e1e3e1]/60 pb-3">
            <h3 className="text-[#1f1f1f] text-xs font-bold flex items-center">
              <span className="material-symbols-rounded mr-2 text-[#0b57d0]">rate_review</span>
              지식 노트 초안 검토 (Review Draft)
            </h3>
            <span className="text-[10px] bg-[#d3e3fd] text-[#0b57d0] px-2.5 py-0.5 rounded-full font-bold">수정 편집 가능</span>
          </div>

          {/* 노트 제목 수정 인풋 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-[#0b57d0]">title</span>
              노트 제목
            </label>
            <input 
              type="text" 
              value={draftTitle} 
              onChange={(e) => setDraftTitle(e.target.value)}
              className="w-full bg-white border border-[#e1e3e1] rounded-xl px-4 py-2.5 text-xs text-[#1f1f1f] font-semibold focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all"
              placeholder="저장할 지식 노트의 제목을 입력하세요."
            />
          </div>

          {/* 노트 태그 설정 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-[#0b57d0]">local_offer</span>
              태그 (콤마 구분, Obsidian 전용)
            </label>
            <input 
              type="text" 
              value={draftTags} 
              onChange={(e) => setDraftTags(e.target.value)}
              className="w-full bg-white border border-[#e1e3e1] rounded-xl px-4 py-2 text-xs text-[#444746] focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all"
              placeholder="예: RAG-검색, 이메일-정리, 지식추출"
            />
          </div>

          {/* 본문 에디터 (Textarea) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-[#444746] flex items-center gap-1.5">
              <span className="material-symbols-rounded text-sm text-[#0b57d0]">subject</span>
              지식 노트 본문 (Markdown 지원)
            </label>
            <textarea 
              value={draftContent} 
              onChange={(e) => setDraftContent(e.target.value)}
              rows={12}
              className="w-full bg-white border border-[#e1e3e1] rounded-xl p-4 text-xs text-[#1f1f1f] leading-relaxed focus:outline-none focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] transition-all font-mono resize-y"
              placeholder="여기에 요약 정리된 내용이 들어옵니다. 내보내기 전 자유롭게 편집할 수 있습니다."
            />
          </div>

          {/* DeepSeek 생각 과정 아코디언 */}
          {result.thought && (
            <details className="group border border-[#e1e3e1]/60 bg-white rounded-xl overflow-hidden transition-all duration-300">
              <summary className="flex items-center justify-between p-3 text-xs text-[#444746] font-medium cursor-pointer hover:bg-[#f8fafd] select-none list-none">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-rounded text-amber-600 text-base">psychology</span>
                  <span>에이전트 생각 과정 (LLM Thinking Process)</span>
                </div>
                <span className="material-symbols-rounded transition-transform group-open:rotate-180 text-[#444746]">expand_more</span>
              </summary>
              <div className="p-4 border-t border-[#e1e3e1]/60 text-[10.5px] text-amber-900 bg-amber-50/20 italic whitespace-pre-wrap leading-relaxed">
                {result.thought}
              </div>
            </details>
          )}

          {/* 출처 목록 */}
          {result.sources.length > 0 && (
            <div className="flex flex-col gap-2 bg-white border border-[#e1e3e1]/60 p-4 rounded-xl">
              <span className="text-[11px] text-[#444746] font-bold flex items-center gap-1.5">
                <span className="material-symbols-rounded text-sm text-[#0b57d0]">source</span>
                참고 근거 및 출처 ({result.sources.length}개)
              </span>
              <div className="flex flex-wrap gap-2">
                {result.sources.map((src, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] bg-[#f8fafd] border border-[#e1e3e1] hover:border-[#0b57d0]/30 px-3 py-1.5 rounded-lg text-[#1f1f1f] flex items-center gap-1.5 cursor-default transition-all"
                  >
                    <span className="material-symbols-rounded text-[12px] text-[#0b57d0]">
                      {src.source === "gmail" ? "mail" : "description"}
                    </span>
                    <span className="font-semibold max-w-[200px] truncate">{src.title}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 연동 내보내기 액션 버튼 영역 (완전한 알약 형태) */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-[#e1e3e1]/60">
            {/* Obsidian 저장 버튼 */}
            <button
              onClick={handleExportObsidian}
              disabled={exportingObsidian || exportingNotion}
              className="flex-1 min-w-[130px] bg-[#22c55e] hover:bg-[#16a34a] text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {exportingObsidian ? (
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span className="material-symbols-rounded text-sm">send_and_archive</span>
              )}
              <span>Obsidian 저장</span>
            </button>

            {/* Notion 저장 버튼 */}
            <button
              onClick={handleExportNotion}
              disabled={exportingObsidian || exportingNotion}
              className="flex-1 min-w-[130px] bg-[#1f1f1f] hover:bg-black text-white font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {exportingNotion ? (
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span className="material-symbols-rounded text-sm">open_in_new</span>
              )}
              <span>Notion 저장</span>
            </button>

            {/* 클립보드 복사 버튼 */}
            <button
              onClick={handleCopyToClipboard}
              disabled={exportingObsidian || exportingNotion}
              className="bg-white hover:bg-[#f8fafd] text-[#444746] border border-[#e1e3e1] font-semibold py-2.5 px-5 rounded-full text-xs transition-all cursor-pointer disabled:cursor-default disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-rounded text-sm">content_copy</span>
              <span>마크다운 복사</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
