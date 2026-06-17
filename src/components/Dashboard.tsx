import SyncPanel from "./SyncPanel";
import HybridMailWorkspace from "./HybridMailWorkspace";
import MultiViewWorkspace from "./MultiViewWorkspace";
import LlmConfigPanel from "./LlmConfigPanel";
import ServiceConfigPanel from "./ServiceConfigPanel";
import RagSearchPanel from "./RagSearchPanel";
import AgentPanel from "./AgentPanel";
import KnowledgePipelinePanel from "./KnowledgePipelinePanel";

export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-3">
        <HybridMailWorkspace />
      </section>

      {/* 좌측 패널: 동기화 컨트롤 및 데이터 목록 */}
      <section className="lg:col-span-2 space-y-6">
        <SyncPanel />
        <KnowledgePipelinePanel />
        <MultiViewWorkspace />
        <AgentPanel />
        
        {/* 로컬 폴더 정책 안내 */}
        <div className="bg-primary-container/20 rounded-2xl p-5 border border-primary-container/30 text-xs text-text-secondary flex items-start space-x-3">
          <span className="material-symbols-rounded text-primary flex-shrink-0 text-lg">security</span>
          <div>
            <p className="font-semibold text-text-primary mb-1">엄격한 데이터 로컬(Local Only) 보존 원칙</p>
            <p className="leading-relaxed">
              가져온 이메일 캐시, 토큰 정보, 변환된 옵시디언 마크다운 지식베이스는 모두 실행 디렉토리 하위의 <code className="text-primary font-mono bg-primary-container/30 px-1 py-0.5 rounded">./data/</code> 폴더 내에 저장되며, OS 시스템 폴더를 침범하지 않는 포터블 사양입니다.
            </p>
          </div>
        </div>
      </section>

      {/* 우측 패널: 설정 및 테스팅 */}
      <section className="space-y-6">
        <LlmConfigPanel />
        <ServiceConfigPanel />
        <RagSearchPanel />
      </section>
    </div>
  );
}
