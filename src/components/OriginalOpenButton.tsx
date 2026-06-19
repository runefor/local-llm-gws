type OriginalOpenButtonProps = {
  readonly isLoading: boolean;
  readonly onClick: () => void;
};

export function OriginalOpenButton({ isLoading, onClick }: OriginalOpenButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={isLoading}
      className="rounded-full border border-[#d3e3fd] bg-white px-3 py-1 text-[11px] font-semibold text-[#0b57d0] hover:bg-[#d3e3fd]/50 disabled:opacity-60 transition-all flex items-center gap-1"
    >
      <span className="material-symbols-rounded text-[13px]">{isLoading ? "hourglass_top" : "article"}</span>
      전체 원문 보기
    </button>
  );
}
