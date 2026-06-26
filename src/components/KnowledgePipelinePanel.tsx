import { useApp } from "../context/AppContext";

const flowSteps = [
  {
    icon: "travel_explore",
    title: "1. 원본 후보 찾기",
    body: "Gmail/Drive 원본 검색에서 제목, 사람, 날짜, 라벨, 폴더 기준으로 필요한 자료 후보를 먼저 좁힙니다.",
  },
  {
    icon: "search",
    title: "2. 검색하기",
    body: "벡터화된 본문을 검색해 관련 청크, 매칭 이유, 원문 위치를 확인합니다.",
  },
  {
    icon: "inventory_2",
    title: "3. 정보 묶음 확정",
    body: "검색 결과 중 믿을 수 있는 근거만 골라 정보 묶음으로 저장합니다. 이 단계가 LLM Wiki의 검토 게이트입니다.",
  },
  {
    icon: "auto_stories",
    title: "4. LLM Wiki 생성",
    body: "정보 묶음에 저장된 근거만 사용해 요약, 핵심 사실, 결정사항, 할 일, 원문 링크가 남는 Wiki 초안을 만듭니다.",
  },
] as const;

const guardrails = [
  "검색 결과를 곧바로 LLM에 보내 요약하지 않습니다.",
  "Wiki 초안은 사용자가 선택한 정보 묶음 근거만 사용합니다.",
  "Gmail/Drive에서 온 내용이 외부 LLM endpoint로 나갈 때는 별도 확인이 필요합니다.",
] as const;

function connectionLabel(enabled: boolean) {
  return enabled ? "설정됨" : "설정 필요";
}

export default function KnowledgePipelinePanel() {
  const { obsidianVaultPath, notionApiKey, notionPageId } = useApp();
  const notionReady = Boolean(notionApiKey && notionPageId);

  return (
    <div className="bg-surface rounded-2xl p-6 border border-surface-variant/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center text-text-primary">
            <span className="material-symbols-rounded mr-2 text-primary">auto_stories</span>
            정보 묶음 기반 LLM Wiki 저장 흐름
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed mt-1 max-w-3xl">
            이 화면은 바로 요약을 실행하지 않습니다. 먼저 원본을 찾고, 벡터 검색 결과를 검토한 뒤, 정보 묶음에 저장된 근거만 LLM Wiki와 Obsidian/Notion 저장 대상으로 사용합니다.
          </p>
        </div>
        <span className="rounded-full bg-primary-container border border-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
          Find first · Organize second
        </span>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {flowSteps.map((step) => (
          <article key={step.title} className="bg-white border border-surface-variant rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span className="material-symbols-rounded text-primary text-xl">{step.icon}</span>
            <h3 className="text-xs font-bold text-text-primary mt-3">{step.title}</h3>
            <p className="text-[11px] text-text-secondary leading-relaxed mt-2">{step.body}</p>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white border border-surface-variant rounded-2xl p-5">
          <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
            <span className="material-symbols-rounded text-sm text-primary">verified_user</span>
            저장 전 검토 게이트
          </h3>
          <ul className="mt-3 space-y-2">
            {guardrails.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed">
                <span className="material-symbols-rounded text-primary text-sm mt-[-1px]">check_circle</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-2xl bg-primary-container/40 border border-primary/10 p-4">
            <p className="text-xs font-semibold text-text-primary">실제 실행 위치</p>
            <p className="text-[11px] text-text-secondary leading-relaxed mt-1">
              왼쪽 메뉴의 <strong className="text-primary">검색하기</strong>에서 검색 결과를 선택해 정보 묶음을 만들고, 정보 묶음 상세에서 Wiki 초안과 저장을 진행하세요.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-surface-variant rounded-2xl p-5">
          <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
            <span className="material-symbols-rounded text-sm text-primary">output</span>
            저장 대상 설정 상태
          </h3>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f8fafd] border border-surface-variant/80 px-3 py-2">
              <span className="text-xs text-text-secondary">Obsidian Vault</span>
              <span className="text-[11px] font-bold text-primary">{connectionLabel(Boolean(obsidianVaultPath))}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f8fafd] border border-surface-variant/80 px-3 py-2">
              <span className="text-xs text-text-secondary">Notion API/Page</span>
              <span className="text-[11px] font-bold text-primary">{connectionLabel(notionReady)}</span>
            </div>
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed mt-4">
            저장 대상은 설정 탭에서 관리합니다. 이 화면은 원본 근거 없는 요약 저장을 막기 위한 안내 패널입니다.
          </p>
        </div>
      </section>
    </div>
  );
}
