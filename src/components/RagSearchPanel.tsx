import { useState, useEffect } from "react";
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
  const { addLog, backendStatus } = useApp();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexing, setIndexing] = useState(false);

  // 인덱스 상태 조회
  const fetchIndexStatus = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/rag/status");
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
    try {
      const response = await fetch("http://localhost:8000/api/rag/index", { method: "POST" });
      const data = await response.json();
      if (data.status === "success") {
        addLog(`인덱싱 완료! Gmail ${data.gmail_indexed}개, Drive ${data.drive_indexed}개 동기화 처리.`);
        fetchIndexStatus();
      } else {
        addLog(`인덱싱 실패: ${data.message}`);
      }
    } catch (err) {
      addLog("인덱싱 실패: 네트워크 에러");
    } finally {
      setIndexing(false);
    }
  };

  // 검색 쿼리 실행
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading || backendStatus !== "online") return;

    setLoading(true);
    setResult(null);
    addLog(`RAG 검색 요청 전송: "${query}"`);

    try {
      const response = await fetch("http://localhost:8000/api/rag/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 5 }),
      });
      const data = await response.json();

      if (data.status === "success") {
        setResult({
          answer: data.answer,
          thought: data.thought,
          sources: data.sources || [],
        });
        addLog("RAG 검색 및 요약 완료.");
      } else {
        addLog(`RAG 검색 오류: ${data.message}`);
      }
    } catch (err) {
      addLog("RAG 검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (backendStatus === "online") {
      fetchIndexStatus();
    }
  }, [backendStatus]);

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col gap-5">
      {/* 타이틀 영역 */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center text-text-primary">
          <span className="material-symbols-rounded mr-2 text-primary">search</span>
          RAG 지식 검색 테스트
        </h2>
        
        {/* 인덱싱 현황 및 버튼 */}
        <button
          onClick={handleIndexing}
          disabled={indexing || backendStatus !== "online"}
          className="text-[10px] bg-primary/10 hover:bg-primary/20 text-primary border border-primary/10 font-bold py-1 px-3 rounded-full cursor-pointer disabled:cursor-default disabled:opacity-50 transition-all flex items-center gap-1"
        >
          <span className={`material-symbols-rounded text-[10px] ${indexing ? "animate-spin" : ""}`}>sync</span>
          {indexing ? "인덱싱 중..." : "인덱싱 갱신"}
        </button>
      </div>

      {/* 청크 현황 요약 */}
      {indexStatus && (
        <div className="flex gap-4 text-[10px] bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-text-secondary font-medium">
          <span>Gmail: <strong>{indexStatus.gmail_chunks} chunks</strong></span>
          <span>Drive: <strong>{indexStatus.drive_chunks} chunks</strong></span>
          <span>전체: <strong>{indexStatus.total_chunks} chunks</strong></span>
        </div>
      )}

      {/* 검색 입력 폼 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading || backendStatus !== "online"}
          placeholder="동기화된 데이터에서 찾고 싶은 내용을 입력해 검색하세요..." 
          className="flex-1 bg-white border border-surface-variant/80 rounded-xl px-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-secondary/50 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        />
        <button
          type="submit"
          disabled={!query.trim() || loading || backendStatus !== "online"}
          className="bg-primary hover:bg-[#094cb3] disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold px-4 rounded-xl transition-all cursor-pointer disabled:cursor-default"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </form>

      {/* 검색 결과 출력 */}
      {result && (
        <div className="flex flex-col gap-4 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
          {/* DeepSeek R1의 Thought가 있으면 가볍게 렌더링 */}
          {result.thought && (
            <div className="text-[11px] text-amber-800 bg-amber-50/40 border border-amber-100/40 p-2.5 rounded-xl italic leading-relaxed">
              <strong>생각 과정:</strong> {result.thought}
            </div>
          )}
          
          {/* 답변 */}
          <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap font-medium">
            {result.answer}
          </div>

          {/* 출처 목록 */}
          {result.sources.length > 0 && (
            <div className="border-t border-slate-100/80 pt-3 flex flex-col gap-1.5">
              <span className="text-[10px] text-text-secondary font-bold">근거 및 출처:</span>
              <div className="flex flex-wrap gap-2">
                {result.sources.map((src, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] bg-white border border-slate-100 hover:border-primary/20 px-2.5 py-1 rounded-lg text-text-primary shadow-[0_1px_2px_rgba(0,0,0,0.01)] flex items-center gap-1 cursor-default transition-all"
                  >
                    <span className="material-symbols-rounded text-[10px] text-primary">
                      {src.source === "gmail" ? "mail" : "description"}
                    </span>
                    {src.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

