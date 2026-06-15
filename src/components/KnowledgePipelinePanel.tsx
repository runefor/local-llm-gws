import React, { useState } from "react";
import { useApp } from "../context/AppContext";

interface SourceDoc {
  doc_id: string;
  title: string;
  source: "gmail" | "drive";
  date: string;
  sender: string;
  content: string;
  snippet: string;
}

export default function KnowledgePipelinePanel() {
  const {
    backendStatus,
    obsidianVaultPath,
    notionApiKey,
    notionPageId,
    exportToObsidian,
    exportToNotion,
    addLog,
  } = useApp();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [thought, setThought] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceDoc[]>([]);

  // 내보내기용 상태
  const [exportTitle, setExportTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("workspace, summary");
  const [exportingObsidian, setExportingObsidian] = useState(false);
  const [exportingNotion, setExportingNotion] = useState(false);

  // 원본 문서 미리보기 모달 상태
  const [selectedDoc, setSelectedDoc] = useState<SourceDoc | null>(null);

  // 마크다운 파서 및 렌더러
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const lineContent = line.trim();
      
      if (lineContent.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-xs font-bold text-text-primary mt-4 mb-1.5 flex items-center gap-1">
            <span className="w-1 h-3 bg-primary rounded-full"></span>
            {lineContent.slice(4)}
          </h4>
        );
      }
      if (lineContent.startsWith("## ")) {
        return (
          <h3 key={idx} className="text-sm font-bold text-text-primary mt-5 mb-2 border-b border-slate-100 pb-1">
            {lineContent.slice(3)}
          </h3>
        );
      }
      if (lineContent.startsWith("# ")) {
        return (
          <h2 key={idx} className="text-base font-bold text-text-primary mt-6 mb-3 border-l-4 border-primary pl-2">
            {lineContent.slice(2)}
          </h2>
        );
      }
      if (lineContent.startsWith("- ") || lineContent.startsWith("* ")) {
        return (
          <li key={idx} className="text-xs text-text-secondary ml-4 list-disc mb-1 leading-relaxed">
            {lineContent.slice(2)}
          </li>
        );
      }
      if (lineContent.startsWith("> ")) {
        return (
          <blockquote key={idx} className="border-l-4 border-indigo-400 pl-3 italic text-text-secondary bg-slate-50 py-2 px-3 rounded-r-xl my-2.5 text-xs">
            {lineContent.slice(2)}
          </blockquote>
        );
      }

      // 볼드체 처리
      const boldRegex = /\*\*(.*?)\*\*/g;
      if (boldRegex.test(lineContent)) {
        const parts = lineContent.split(boldRegex);
        return (
          <p key={idx} className="text-xs text-text-primary leading-relaxed mb-2">
            {parts.map((part, i) =>
              i % 2 === 1 ? (
                <strong key={i} className="font-semibold text-primary">
                  {part}
                </strong>
              ) : (
                part
              )
            )}
          </p>
        );
      }

      return (
        <p key={idx} className="text-xs text-text-primary leading-relaxed mb-2 min-h-[1em]">
          {lineContent}
        </p>
      );
    });
  };

  const handleRunPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading || backendStatus !== "online") return;

    setLoading(true);
    setAnswer("");
    setThought(null);
    setSources([]);
    addLog(`지식 취합 파이프라인 시작: "${query}"`);

    try {
      const response = await fetch("http://localhost:8000/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 8 }),
      });
      const data = await response.json();

      if (data.status === "success") {
        setAnswer(data.answer);
        setThought(data.thought || null);
        setSources(data.sources || []);
        
        // 내보내기용 기본 제목 자동 설정
        const querySnippet = query.length > 15 ? query.slice(0, 15) + " 요약" : query + " 요약";
        setExportTitle(querySnippet);
        addLog("지식 취합 및 LLM 요약 완료.");
      } else {
        addLog(`파이프라인 실행 중 오류: ${data.message}`);
        alert(`실행 실패: ${data.message}`);
      }
    } catch (err) {
      addLog("파이프라인 실행 중 네트워크 오류 발생");
      alert("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportObsidian = async () => {
    if (!obsidianVaultPath) {
      alert("Obsidian Vault 경로가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.");
      return;
    }
    setExportingObsidian(true);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const res = await exportToObsidian(exportTitle, answer, tags);
    setExportingObsidian(false);

    if (res.status === "success") {
      alert(`Obsidian 파일 생성 완료:\n${res.filename}`);
    } else {
      alert(`Obsidian 저장 실패: ${res.message}`);
    }
  };

  const handleExportNotion = async () => {
    if (!notionApiKey || !notionPageId) {
      alert("Notion API Key 또는 Page ID가 설정되지 않았습니다. 설정 탭에서 입력해 주세요.");
      return;
    }
    setExportingNotion(true);
    const res = await exportToNotion(exportTitle, answer);
    setExportingNotion(false);

    if (res.status === "success") {
      alert("Notion 페이지에 요약 노트가 성공적으로 전송되었습니다.");
    } else {
      alert(`Notion 전송 실패: ${res.message}`);
    }
  };

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col gap-6">
      {/* 제목 및 설명 */}
      <div>
        <h2 className="text-base font-semibold flex items-center text-text-primary">
          <span className="material-symbols-rounded mr-2 text-primary">insights</span>
          개인 지식 추출 및 가공 파이프라인
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed mt-1">
          구글 워크스페이스(메일, 드라이브)에서 원하는 주제의 정보를 안전하게 수집한 뒤, 로컬 LLM을 통해 정돈된 노트를 생성하고 Obsidian이나 Notion으로 내보냅니다.
        </p>
      </div>

      {/* 입력 폼 */}
      <form onSubmit={handleRunPipeline} className="flex gap-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading || backendStatus !== "online"}
          placeholder="예: '이번 달 서버 모니터링 에러 리포트 이메일과 관련 로그 문서를 모아서 정리해줘'"
          className="flex-1 min-h-[50px] bg-white border border-surface-variant/80 rounded-xl p-3 text-xs text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-secondary/50 resize-none shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        />
        <button
          type="submit"
          disabled={!query.trim() || loading || backendStatus !== "online"}
          className="bg-primary hover:bg-[#094cb3] disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold px-6 rounded-full transition-all cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5"
        >
          {loading ? (
            <>
              <span className="material-symbols-rounded text-sm animate-spin">sync</span>
              분석 중...
            </>
          ) : (
            <>
              <span className="material-symbols-rounded text-sm">construction</span>
              지식 취합 시작
            </>
          )}
        </button>
      </form>

      {/* 분석 중 애니메이션 피드백 */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-10 bg-slate-50/40 border border-dashed border-slate-100 rounded-2xl gap-3">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-text-primary">로컬 데이터를 읽고 분석하는 중입니다...</p>
            <p className="text-[10px] text-text-secondary mt-1">로컬 LLM이 여러 메일/문서 원본을 대조하여 지식을 정리하고 있습니다.</p>
          </div>
        </div>
      )}

      {/* 결과 영역 */}
      {answer && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          {/* 왼쪽 컬럼: 요약 결과 및 외부 연동 내보내기 */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            {/* LLM 사고 과정 (있는 경우) */}
            {thought && (
              <details className="bg-amber-50/30 border border-amber-100/40 rounded-2xl p-4 text-[11px] text-amber-800 leading-relaxed cursor-pointer">
                <summary className="font-bold select-none outline-none">추론 로그 (Reasoning Log)</summary>
                <div className="mt-2 whitespace-pre-wrap italic">{thought}</div>
              </details>
            )}

            {/* 최종 정리 답변 */}
            <div className="bg-white p-5 border border-surface-variant/80 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
              <h3 className="text-xs font-bold text-text-primary mb-3 flex items-center border-b border-slate-50 pb-2">
                <span className="material-symbols-rounded text-xs text-primary mr-1.5">draw</span>
                지식 베이스 가공 결과
              </h3>
              <div className="prose max-w-none">{renderMarkdown(answer)}</div>
            </div>

            {/* 내보내기 조작 패널 */}
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col gap-4">
              <div>
                <h4 className="text-xs font-bold text-text-primary flex items-center">
                  <span className="material-symbols-rounded text-xs text-primary mr-1.5 font-icon">output</span>
                  외부 지식 베이스로 내보내기
                </h4>
                <p className="text-[10px] text-text-secondary mt-0.5">정리된 내용을 로컬 Obsidian 보관소나 연결된 Notion으로 안전하게 전달합니다.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">지식 노트 제목</label>
                  <input
                    type="text"
                    value={exportTitle}
                    onChange={(e) => setExportTitle(e.target.value)}
                    className="w-full bg-white border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary"
                    placeholder="노트 제목 입력"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1">태그 설정 (쉼표 구분)</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="w-full bg-white border border-surface-variant rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary"
                    placeholder="예: workspace, email, server"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleExportObsidian}
                  disabled={exportingObsidian}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-2.5 px-4 rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-rounded text-xs">book</span>
                  {exportingObsidian ? "저장 중..." : "Obsidian에 노트 생성"}
                </button>
                <button
                  onClick={handleExportNotion}
                  disabled={exportingNotion}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold py-2.5 px-4 rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-rounded text-xs">edit_note</span>
                  {exportingNotion ? "전송 중..." : "Notion으로 내보내기"}
                </button>
              </div>
            </div>
          </div>

          {/* 오른쪽 컬럼: 원본 소스 카드 (카드 UI 구현) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-text-primary flex items-center px-1">
              <span className="material-symbols-rounded text-xs text-primary mr-1.5">source</span>
              수집된 원본 이메일 및 문서 ({sources.length}개)
            </h3>

            <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
              {sources.map((src) => (
                <div
                  key={src.doc_id}
                  onClick={() => setSelectedDoc(src)}
                  className="bg-white hover:bg-slate-50/60 p-3.5 border border-slate-100 hover:border-primary/20 rounded-xl cursor-pointer transition-all duration-200 flex flex-col gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.01)] group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-text-primary group-hover:text-primary transition-colors line-clamp-1 flex-1">
                      {src.title}
                    </span>
                    <span className={`flex-shrink-0 text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${
                      src.source === "gmail" ? "bg-red-50 text-red-600 border border-red-100/50" : "bg-blue-50 text-blue-600 border border-blue-100/50"
                    }`}>
                      <span className="material-symbols-rounded text-[9px]">
                        {src.source === "gmail" ? "mail" : "description"}
                      </span>
                      {src.source.toUpperCase()}
                    </span>
                  </div>

                  {src.source === "gmail" && src.sender && (
                    <div className="text-[10px] text-text-secondary truncate">
                      발신: {src.sender}
                    </div>
                  )}

                  <p className="text-[11px] text-text-secondary/70 leading-relaxed italic line-clamp-2">
                    "{src.snippet}"
                  </p>

                  <div className="flex justify-between items-center mt-1 text-[9px] text-text-secondary/50 font-medium">
                    <span>{src.date}</span>
                    <span className="text-primary hover:underline flex items-center gap-0.5">
                      자세히 보기
                      <span className="material-symbols-rounded text-[10px]">chevron_right</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 원본 문서 보기 모달 */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-100">
            {/* 모달 헤더 */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${
                    selectedDoc.source === "gmail" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                  }`}>
                    <span className="material-symbols-rounded text-[10px]">
                      {selectedDoc.source === "gmail" ? "mail" : "description"}
                    </span>
                    {selectedDoc.source.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-text-secondary">{selectedDoc.date}</span>
                </div>
                <h3 className="text-sm font-bold text-text-primary leading-normal">{selectedDoc.title}</h3>
                {selectedDoc.source === "gmail" && selectedDoc.sender && (
                  <p className="text-xs text-text-secondary mt-1">발신자: {selectedDoc.sender}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="p-1 text-text-secondary hover:text-text-primary rounded-full hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="material-symbols-rounded text-lg block">close</span>
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
              <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap break-all bg-white p-5 border border-slate-100 rounded-xl">
                {selectedDoc.content}
              </div>
            </div>

            {/* 모달 하단 */}
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedDoc(null)}
                className="bg-primary hover:bg-[#094cb3] text-white text-xs font-semibold py-2 px-6 rounded-full cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
