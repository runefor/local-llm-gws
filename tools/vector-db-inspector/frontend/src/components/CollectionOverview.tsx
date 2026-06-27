import React, { useEffect, useState } from "react";
import { Database, FileText, ChevronRight, BarChart2, Layers } from "lucide-react";

interface Collection {
  name: string;
  count: number;
  metadata: any;
}

interface Stats {
  total_chunks: number;
  avg_chunk_length: number;
  doc_count: number;
  length_distribution: Record<string, number>;
}

interface CollectionOverviewProps {
  onSelectCollection: (name: string) => void;
}

export const CollectionOverview: React.FC<CollectionOverviewProps> = ({ onSelectCollection }) => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch("http://localhost:28731/api/collections");
        const data = await res.json();
        
        if (data.status === "success") {
          setCollections(data.collections);
          
          // 각 컬렉션별로 상세 통계 가져오기
          const statsMap: Record<string, Stats> = {};
          for (const col of data.collections) {
            const statsRes = await fetch(`http://localhost:28731/api/collections/${col.name}/stats`);
            const statsData = await statsRes.json();
            if (statsData.status === "success") {
              statsMap[col.name] = statsData;
            }
          }
          setStats(statsMap);
        } else {
          setError("컬렉션 목록을 가져오지 못했습니다.");
        }
      } catch (err: any) {
        setError("백엔드 서버(http://localhost:18750)가 실행 중인지 확인해 주세요.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
        <p className="text-slate-500 font-medium">ChromaDB 데이터를 분석하는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-xl mx-auto my-12 text-center">
        <h3 className="text-red-800 font-bold text-lg mb-2">서버 연결 오류</h3>
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <div className="text-left bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-xs overflow-x-auto">
          cd tools/vector-db-inspector/backend<br />
          python main.py
        </div>
      </div>

    );
  }

  return (
    <div className="space-y-8">
      {/* 대시보드 상단 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Vector DB 대시보드</h2>
        <p className="text-slate-500 mt-1">로컬 ChromaDB 컬렉션의 전반적인 상태를 관찰합니다.</p>
      </div>

      {/* 컬렉션 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {collections.map((col) => {
          const colStats = stats[col.name];
          const maxDistCount = colStats ? Math.max(...Object.values(colStats.length_distribution), 1) : 1;

          return (
            <div key={col.name} className="bg-white border border-slate-100 rounded-xl shadow-xs p-6 hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                {/* 카드 상단 헤더 */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                      <Database size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800">{col.name}</h3>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wide">
                        {col.name.includes("gmail") ? "Gmail" : col.name.includes("drive") ? "Google Drive" : "Other"}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => onSelectCollection(col.name)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-50 px-4 py-2 rounded-full transition-colors"
                  >
                    이 문서 분석하기
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* 핵심 통계 수치 */}
                <div className="grid grid-cols-3 gap-4 mb-6 bg-slate-50 p-4 rounded-xl">
                  <div className="text-center border-r border-slate-200">
                    <div className="flex justify-center text-slate-400 mb-1"><Layers size={16} /></div>
                    <span className="block text-2xl font-extrabold text-slate-800">{col.count}</span>
                    <span className="text-[11px] text-slate-500 font-medium">총 청크 조각 수</span>
                  </div>
                  <div className="text-center border-r border-slate-200">
                    <div className="flex justify-center text-slate-400 mb-1"><FileText size={16} /></div>
                    <span className="block text-2xl font-extrabold text-slate-800">{colStats?.doc_count ?? 0}</span>
                    <span className="text-[11px] text-slate-500 font-medium">인덱싱된 문서 수</span>
                  </div>
                  <div className="text-center">
                    <div className="flex justify-center text-slate-400 mb-1"><BarChart2 size={16} /></div>
                    <span className="block text-2xl font-extrabold text-slate-800">{colStats?.avg_chunk_length ?? 0}</span>
                    <span className="text-[11px] text-slate-500 font-medium">평균 청크 글자 수</span>
                  </div>
                </div>

                {/* 청크 길이 분포도 (커스텀 막대 차트) */}
                {colStats && Object.keys(colStats.length_distribution).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">청크 길이 분포 (글자수 구간)</h4>
                    <div className="space-y-2">
                      {Object.entries(colStats.length_distribution).map(([range, count]) => {
                        const percent = (count / maxDistCount) * 100;
                        return (
                          <div key={range} className="flex items-center text-xs">
                            <span className="w-16 text-slate-500 font-mono font-medium">{range}</span>
                            <div className="flex-1 h-3.5 bg-slate-100 rounded-md overflow-hidden mx-3 relative">
                              <div 
                                className="h-full bg-blue-500 hover:bg-blue-600 transition-all rounded-md" 
                                style={{ width: `${percent}%` }}
                              ></div>
                            </div>
                            <span className="w-8 text-right font-bold text-slate-700">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 하단 코멘트 */}
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400 italic">
                {col.name.includes("gmail") 
                  ? "* 지메일은 메일 원문 500자 기준으로 청킹되어 있습니다." 
                  : "* 구글 드라이브 파일은 마크다운 변환 후 500자 기준으로 청킹되어 있습니다."}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
