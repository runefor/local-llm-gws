export type ArtifactStatus = "candidate" | "needs_review" | "approved" | "source_missing";

export interface ArtifactLintIssue {
  code: string;
  severity?: "error" | "warning";
  message: string;
  evidence_id?: string;
}

export interface ArtifactLintResult {
  status?: "passed" | "failed";
  issues?: ArtifactLintIssue[];
}

interface ArtifactStatusPanelProps {
  status?: ArtifactStatus;
  lint?: ArtifactLintResult;
  saving: boolean;
  approving: boolean;
  canSave: boolean;
  onSave: () => void;
  onApprove: () => void;
  onReturnToCandidate: () => void;
}

const statusCopy: Record<ArtifactStatus, { label: string; tone: string; description: string; icon: string }> = {
  candidate: {
    label: "후보",
    tone: "bg-[#d3e3fd] text-[#0b57d0] border-[#0b57d0]/20",
    description: "근거 묶음 기반 후보입니다. 검토 후 승인하세요.",
    icon: "draft",
  },
  needs_review: {
    label: "검토 필요",
    tone: "bg-[#fef9c3] text-[#854d0e] border-[#eab308]/30",
    description: "필수 섹션, 인용 또는 원문 위치 조건을 다시 확인해야 합니다.",
    icon: "rule",
  },
  approved: {
    label: "승인됨",
    tone: "bg-[#dcfce7] text-[#15803d] border-[#22c55e]/30",
    description: "검토를 통과해 승인된 Wiki 산출물입니다.",
    icon: "verified",
  },
  source_missing: {
    label: "원문 부족",
    tone: "bg-[#fee2e2] text-[#b91c1c] border-[#ef4444]/30",
    description: "원문 근거가 없어 Wiki로 확정할 수 없습니다.",
    icon: "content_paste_search",
  },
};

export function ArtifactStatusPanel({
  status = "candidate",
  lint,
  saving,
  approving,
  canSave,
  onSave,
  onApprove,
  onReturnToCandidate,
}: ArtifactStatusPanelProps) {
  const copy = statusCopy[status];
  const issues = lint?.issues ?? [];
  const lintPassed = lint?.status === "passed";
  const busy = saving || approving;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#e1e3e1] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold ${copy.tone}`}>
            <span className="material-symbols-rounded text-[13px]">{copy.icon}</span>
            Wiki 상태: {copy.label}
          </span>
          <p className="text-[11px] leading-relaxed text-[#444746]">{copy.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || busy}
            className="rounded-full border border-[#e1e3e1] bg-white px-4 py-2 text-[11px] font-bold text-[#0b57d0] transition-all hover:bg-[#f8fafd] disabled:cursor-default disabled:opacity-50"
          >
            {saving ? "저장 중..." : "후보 저장"}
          </button>
          {status === "approved" ? (
            <button
              type="button"
              onClick={onReturnToCandidate}
              disabled={busy}
              className="rounded-full bg-[#1f1f1f] px-4 py-2 text-[11px] font-bold text-white transition-all hover:bg-black disabled:cursor-default disabled:opacity-50"
            >
              후보로 되돌리기
            </button>
          ) : (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy || !canSave || !lintPassed}
              className="rounded-full bg-[#0b57d0] px-4 py-2 text-[11px] font-bold text-white transition-all hover:bg-[#0b57d0]/90 disabled:cursor-default disabled:opacity-50"
            >
              {approving ? "승인 중..." : "승인"}
            </button>
          )}
        </div>
      </div>
      {issues.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-[#e1e3e1] bg-[#f8fafd] p-3">
          <span className="text-[11px] font-bold text-[#1f1f1f]">Linter 확인 항목</span>
          {issues.slice(0, 5).map((issue) => (
            <p key={`${issue.code}-${issue.evidence_id || issue.message}`} className="text-[11px] leading-relaxed text-[#444746]">
              <span className="font-bold text-[#b91c1c]">{issue.code}</span> · {issue.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
