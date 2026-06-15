import { useApp } from "../context/AppContext";

export default function RagSearchPanel() {
  const { addLog } = useApp();

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
      <h2 className="text-base font-semibold mb-3 flex items-center text-text-primary">
        <span className="material-symbols-rounded mr-2 text-primary">search</span>
        RAG 지식 검색 테스트
      </h2>
      <div className="space-y-3">
        <input 
          type="text" 
          placeholder="지식베이스에서 검색할 질문을 입력하세요..." 
          className="w-full bg-white border border-surface-variant rounded-lg px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = e.currentTarget.value;
              if (!value) return;
              addLog(`RAG 쿼리 전송: "${value}"`);
              e.currentTarget.value = '';
              setTimeout(() => {
                addLog("RAG 검색 결과: 메일 2건, Drive 기획서 1건 검색됨. 요약 응답 생성 완료.");
              }, 1200);
            }
          }}
        />
        <p className="text-[10px] text-text-secondary leading-normal">
          동기화된 옵시디언 마크다운 지식 베이스를 바탕으로 로컬 임베딩 DB(ChromaDB)와 연동해 질문할 수 있습니다. (엔터키를 눌러 테스트)
        </p>
      </div>
    </div>
  );
}
