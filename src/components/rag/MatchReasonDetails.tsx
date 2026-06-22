interface MatchReasonDetailsProps {
  reason: string;
  snippet: string;
  metadata?: Record<string, string | number | boolean | null>;
  showSnippet?: boolean;
}

const splitMetadataList = (value: string): string[] => {
  return value.split(/[,|]/).map((item) => item.trim()).filter(Boolean).slice(0, 6);
};

const metadataString = (metadata: MatchReasonDetailsProps["metadata"], key: string): string => {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
};

export function MatchReasonDetails({ reason, snippet, metadata, showSnippet = true }: MatchReasonDetailsProps) {
  const fields = splitMetadataList(metadataString(metadata, "matched_fields"));
  const expandedTerms = splitMetadataList(metadataString(metadata, "expanded_terms"));
  const channels = splitMetadataList(metadataString(metadata, "match_channels"));
  const terms = splitMetadataList(metadataString(metadata, "matched_terms"));
  const hasDetails = fields.length > 0 || expandedTerms.length > 0 || channels.length > 0 || terms.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-[#444746] whitespace-pre-wrap">
        <span className="font-bold text-[#1f1f1f]">매칭 근거: </span>
        {reason || snippet}
      </p>
      {hasDetails && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#e1e3e1] bg-[#f8fafd] px-3 py-2 text-[10px] text-[#444746]">
          {channels.map((channel) => (
            <span key={`channel-${channel}`} className="rounded-full bg-white border border-[#d3e3fd] px-2 py-0.5 font-bold text-[#0b57d0]">{channel}</span>
          ))}
          {fields.map((field) => (
            <span key={`field-${field}`} className="rounded-full bg-white border border-[#e1e3e1] px-2 py-0.5">필드 {field}</span>
          ))}
          {terms.map((term) => (
            <span key={`term-${term}`} className="rounded-full bg-white border border-[#e1e3e1] px-2 py-0.5">단서 {term}</span>
          ))}
          {expandedTerms.map((term) => (
            <span key={`expanded-${term}`} className="rounded-full bg-[#d3e3fd]/50 border border-[#d3e3fd] px-2 py-0.5 text-[#0b57d0]">확장 {term}</span>
          ))}
        </div>
      )}
      {reason && showSnippet && (
        <p className="text-[11px] leading-relaxed text-[#444746] whitespace-pre-wrap rounded-xl border border-[#e1e3e1] bg-[#f8fafd] px-3 py-2">
          {snippet}
        </p>
      )}
    </div>
  );
}
