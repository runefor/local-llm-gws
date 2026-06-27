import React, { useEffect, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Mail, FileText, Tag, Calendar, ExternalLink, Hash, CornerDownRight, Layers } from "lucide-react";

interface Chunk {
  id: string;
  content: string;
  chunk_index: number;
  length: number;
  metadata: Record<string, any>;
}

interface DocumentInfo {
  doc_id: string;
  title: string;
  source: string;
  chunk_count: number;
  date: string;
  sender: string;
}

interface ChunkExplorerProps {
  collectionName: string;
  onBack: () => void;
}

export const ChunkExplorer: React.FC<ChunkExplorerProps> = ({ collectionName, onBack }) => {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentInfo | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null);

  // 문서 검색 및 페이징 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // 유사도 검색 디버깅 상태
  const [testQuery, setTestQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const limit = 15;

  // 문서 목록 가져오기
  const fetchDocuments = async () => {
    try {
      setLoadingDocs(true);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(searchQuery && { search_query: searchQuery })
      });
      const res = await fetch(`http://localhost:28731/api/collections/${collectionName}/documents?${queryParams}`);
      const data = await res.json();
      if (data.status === "success") {
        setDocuments(data.documents);
        setTotalDocs(data.total);
      }
    } catch (err) {
      console.error("문서 목록을 가져오는 중 오류:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    setSelectedDoc(null);
    setChunks([]);
    setSelectedChunk(null);
  }, [collectionName, page, searchQuery]);

  // 특정 문서의 청크 가져오기
  const handleSelectDoc = async (doc: DocumentInfo) => {
    setSelectedDoc(doc);
    setSelectedChunk(null);
    try {
      setLoadingChunks(true);
      const res = await fetch(`http://localhost:28731/api/collections/${collectionName}/documents/${encodeURIComponent(doc.doc_id)}/chunks`);
      const data = await res.json();
      if (data.status === "success") {
        setChunks(data.chunks);
        if (data.chunks.length > 0) {
          setSelectedChunk(data.chunks[0]); // 첫 번째 청크 자동 선택
        }
      }
    } catch (err) {
      console.error("청크를 가져오는 중 오류:", err);
    } finally {
      setLoadingChunks(false);
    }
  };

  // 실시간 유사도 검색 (임베딩 서치 검증용)
  const handleEmbeddingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;

    try {
      setSearching(true);
      const res = await fetch(`http://localhost:28731/api/collections/${collectionName}/search?query=${encodeURIComponent(testQuery)}&limit=5`);
      const data = await res.json();
      if (data.status === "success") {
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error("유사도 검색 오류:", err);
    } finally {
      setSearching(false);
    }
  };

  const totalPages = Math.ceil(totalDocs / limit);

  // 날짜 보기 좋게 가다듬기
  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === "unknown") return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] space-y-4">
      {/* 상단 액션 바 */}
      <div className="flex items-center justify-between bg-white p-4 border border-slate-100 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h3 className="font-bold text-lg text-slate-800">{collectionName} 상세 분석</h3>
            <p className="text-xs text-slate-400">문서 청킹 조각 및 벡터 검색 품질을 분석합니다.</p>
          </div>
        </div>

        {/* 미니 RAG 유사도 검색 디버거 */}
        <form onSubmit={handleEmbeddingSearch} className="flex items-center gap-2">
          <div className="relative">
            <input 
              type="text" 
              placeholder="임베딩 검색 테스트..."
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 w-60 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
            />
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
          </div>
          <button 
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-colors"
          >
            {searching ? "검색 중..." : "검색"}
          </button>
        </form>
      </div>

      {/* 메인 3단 레이아웃 */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        
        {/* 1단: 문서 리스트 (Left - 3 cols) */}
        <div className="col-span-3 bg-white border border-slate-100 rounded-xl flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <input 
                type="text"
                placeholder="문서 제목 검색..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-8 pr-3 py-1.5 w-full text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
            </div>
          </div>

          {/* 리스트 본문 */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingDocs ? (
              <div className="p-8 text-center text-xs text-slate-400">문서를 로드하는 중...</div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">조회된 문서가 없습니다.</div>
            ) : (
              documents.map((doc) => (
                <button
                  key={doc.doc_id}
                  onClick={() => handleSelectDoc(doc)}
                  className={`w-full text-left p-3 text-xs transition-colors hover:bg-slate-50 flex flex-col gap-1 ${
                    selectedDoc?.doc_id === doc.doc_id ? "bg-blue-50/70 hover:bg-blue-50 border-l-4 border-blue-600" : ""
                  }`}
                >
                  <span className="font-semibold text-slate-700 line-clamp-1">{doc.title}</span>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                    <span className="flex items-center gap-1 font-mono">
                      {doc.source === "gmail" ? <Mail size={10} /> : <FileText size={10} />}
                      {doc.chunk_count} chunks
                    </span>
                    <span>{formatDate(doc.date).split(" ")[0]}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* 페이징 하단바 */}
          {totalPages > 1 && (
            <div className="p-2 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/50">
              <button 
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1 hover:bg-slate-200 rounded-md disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-semibold text-slate-600">{page} / {totalPages}</span>
              <button 
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1 hover:bg-slate-200 rounded-md disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* 2단: 청크 리스트 & 시각화 (Center - 4 cols) */}
        <div className="col-span-4 bg-white border border-slate-100 rounded-xl flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-700">청킹 레이아웃 시각화</span>
            {selectedDoc && (
              <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                총 {chunks.length}개 조각
              </span>
            )}
          </div>

          {/* 유사도 테스트 결과 오버레이 뷰 */}
          {searchResults.length > 0 && (
            <div className="p-3 bg-blue-50/60 border-b border-blue-100 space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold text-blue-800">
                <span>검색 매칭 결과 (Top 5)</span>
                <button 
                  onClick={() => setSearchResults([])}
                  className="text-blue-600 hover:underline"
                >
                  지우기
                </button>
              </div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {searchResults.map((res, i) => (
                  <button
                    key={res.id}
                    onClick={() => setSelectedChunk(res)}
                    className="w-full text-left p-2 bg-white rounded-lg border border-blue-200 hover:border-blue-400 transition-colors text-[10px] flex flex-col gap-1"
                  >
                    <div className="flex justify-between font-semibold text-slate-700">
                      <span>Rank {i+1} · {res.metadata.title || res.id}</span>
                      <span className="text-blue-600">Sim: {res.score}</span>
                    </div>
                    <p className="text-slate-500 line-clamp-1 font-sans">{res.content}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 청크 흐름 시각화 본문 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingChunks ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">청크 분해 중...</div>
            ) : !selectedDoc ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
                <Layers className="mb-2 opacity-50" size={32} />
                <p className="text-xs font-semibold">좌측 리스트에서 문서를 선택하면<br />청킹 맵이 이곳에 생성됩니다.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 간략 문서 메타 */}
                <div className="text-xs border-b border-slate-100 pb-3">
                  <span className="block font-bold text-slate-800 mb-1">{selectedDoc.title}</span>
                  <span className="text-[10px] text-slate-400 font-mono break-all block">{selectedDoc.doc_id}</span>
                </div>

                {/* 청크 블록 맵 */}
                <div className="flex flex-col gap-3">
                  {chunks.map((chunk) => {
                    const isSelected = selectedChunk?.id === chunk.id;
                    return (
                      <div 
                        key={chunk.id}
                        onClick={() => setSelectedChunk(chunk)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all hover:-translate-y-0.5 ${
                          isSelected 
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                            : "bg-white text-slate-600 border-slate-100 shadow-2xs hover:border-slate-300"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                          }`}>
                            Chunk {chunk.chunk_index + 1}
                          </span>
                          <span className={`text-[10px] font-mono ${isSelected ? "text-blue-100" : "text-slate-400"}`}>
                            {chunk.length}자
                          </span>
                        </div>
                        <p className={`line-clamp-2 leading-relaxed font-sans ${isSelected ? "text-white" : "text-slate-500"}`}>
                          {chunk.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3단: 청크 상세 분석 (Right - 5 cols) */}
        <div className="col-span-5 bg-white border border-slate-100 rounded-xl flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <span className="text-xs font-bold text-slate-700">청크 속성 및 오버랩 상세 분석</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!selectedChunk ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                <FileText className="mb-2 opacity-50" size={32} />
                <p className="text-xs font-semibold">청크를 선택하면 본문 상세 분석과<br />메타데이터 스키마가 로드됩니다.</p>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* 텍스트 내용 및 오버랩 표시 */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">청크 원문 텍스트</span>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-sans text-xs leading-relaxed whitespace-pre-wrap text-slate-700 select-text max-h-[250px] overflow-y-auto relative">
                    
                    {/* 오버랩 영역 시각 하이라이트 */}
                    {selectedChunk.content.length > 100 ? (
                      <>
                        <span className="bg-amber-100 border-b border-amber-300 text-slate-800 font-semibold px-0.5 rounded-xs" title="인접 청크 오버랩 후보군 (첫 50자)">
                          {selectedChunk.content.slice(0, 50)}
                        </span>
                        {selectedChunk.content.slice(50, -50)}
                        <span className="bg-emerald-100 border-b border-emerald-300 text-slate-800 font-semibold px-0.5 rounded-xs" title="인접 청크 오버랩 후보군 (끝 50자)">
                          {selectedChunk.content.slice(-50)}
                        </span>
                      </>
                    ) : (
                      selectedChunk.content
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-slate-400 px-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-200 inline-block rounded-full"></span>시작 50자</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-200 inline-block rounded-full"></span>끝 50자</span>
                    <span className="italic">* 슬라이딩 오버랩 설계(50자) 경계 디버깅용</span>
                  </div>
                </div>

                {/* 메타데이터 표 */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">임베딩 메타데이터 스키마</span>
                  <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                    <table className="w-full divide-y divide-slate-100">
                      <thead className="bg-slate-50 font-bold text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left w-1/3">Key</th>
                          <th className="px-3 py-2 text-left">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[10px] text-slate-600 bg-white">
                        {Object.entries(selectedChunk.metadata).map(([key, val]) => {
                          const isUrl = String(val).startsWith("http");
                          return (
                            <tr key={key} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-bold text-slate-500">{key}</td>
                              <td className="px-3 py-2 break-all max-w-[200px]">
                                {isUrl ? (
                                  <a 
                                    href={val} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-blue-600 hover:underline inline-flex items-center gap-1"
                                  >
                                    원문 링크 열기 <ExternalLink size={10} />
                                  </a>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 청크 식별자 정보 */}
                <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-[10px] text-slate-500 font-mono">
                  <div className="flex items-center gap-1.5"><Hash size={12} /> ID: {selectedChunk.id}</div>
                  <div className="flex items-center gap-1.5"><CornerDownRight size={12} /> Doc Hash: {selectedChunk.metadata.document_hash || "None"}</div>
                </div>

              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
