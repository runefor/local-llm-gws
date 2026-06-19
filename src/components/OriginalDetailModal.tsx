import type { OriginalDetail } from "./originalDetail";

type OriginalDetailModalProps = {
  readonly detail: OriginalDetail;
  readonly onClose: () => void;
};

type OriginalErrorToastProps = {
  readonly message: string;
  readonly onClose: () => void;
};

type MarkdownBlock =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] };

const headingFrom = (line: string): MarkdownBlock | null => {
  const match = /^(#{1,3})\s+(.+)$/.exec(line);
  if (!match) return null;

  const marker = match[1];
  const text = match[2]?.trim() ?? "";
  if (!text) return null;

  if (marker === "#") return { kind: "heading", level: 1, text };
  if (marker === "##") return { kind: "heading", level: 2, text };
  return { kind: "heading", level: 3, text };
};

const listItemFrom = (line: string): string | null => {
  const match = /^[-*]\s+(.+)$/.exec(line);
  return match ? match[1]?.trim() ?? "" : null;
};

const pushParagraph = (blocks: MarkdownBlock[], paragraphLines: string[]): void => {
  const text = paragraphLines.join(" ").trim();
  if (text) blocks.push({ kind: "paragraph", text });
  paragraphLines.length = 0;
};

const parseMarkdownBlocks = (content: string): readonly MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      pushParagraph(blocks, paragraphLines);
      flushList();
      continue;
    }

    const heading = headingFrom(line);
    if (heading) {
      pushParagraph(blocks, paragraphLines);
      flushList();
      blocks.push(heading);
      continue;
    }

    const listItem = listItemFrom(line);
    if (listItem) {
      pushParagraph(blocks, paragraphLines);
      listItems.push(listItem);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  pushParagraph(blocks, paragraphLines);
  flushList();

  return blocks;
};

function MarkdownContent({ content }: { readonly content: string }) {
  const blocks = parseMarkdownBlocks(content);

  if (blocks.length === 0) {
    return <p className="text-sm leading-relaxed text-[#444746]">표시할 원문 내용이 없습니다.</p>;
  }

  return (
    <article className="mx-auto max-w-3xl space-y-4 text-[#1f1f1f]">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          if (block.level === 1) {
            return <h1 key={key} className="pt-2 text-2xl font-medium leading-tight tracking-[-0.01em] text-[#1f1f1f]">{block.text}</h1>;
          }
          if (block.level === 2) {
            return <h2 key={key} className="pt-4 text-xl font-medium leading-snug text-[#1f1f1f]">{block.text}</h2>;
          }
          return <h3 key={key} className="pt-3 text-base font-semibold leading-snug text-[#1f1f1f]">{block.text}</h3>;
        }

        if (block.kind === "list") {
          return (
            <ul key={key} className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#444746]">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        return <p key={key} className="text-sm leading-7 text-[#444746]">{block.text}</p>;
      })}
    </article>
  );
}

function PlainTextContent({ content }: { readonly content: string }) {
  return (
    <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words rounded-2xl bg-[#f8fafd] p-4 font-sans text-sm leading-7 text-[#444746]">
      {content}
    </pre>
  );
}

export function OriginalErrorToast({ message, onClose }: OriginalErrorToastProps) {
  return (
    <div className="fixed inset-x-6 bottom-6 z-40 mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
      <div className="flex items-start gap-2">
        <span className="material-symbols-rounded text-base">error</span>
        <span className="flex-1 leading-relaxed">{message}</span>
        <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-white/70">
          <span className="material-symbols-rounded text-sm">close</span>
        </button>
      </div>
    </div>
  );
}

export function OriginalDetailModal({ detail, onClose }: OriginalDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f1f1f]/35 p-6">
      <section className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#e1e3e1] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <header className="flex items-start justify-between gap-4 border-b border-[#e1e3e1] bg-[#f8fafd] p-5">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-[#d3e3fd] px-3 py-1 text-[#0b57d0]">{detail.type === "gmail" ? "Gmail 원본" : "Drive 원본"}</span>
              <span className="rounded-full border border-[#e1e3e1] bg-white px-3 py-1 text-[#444746]">{detail.content_type}</span>
            </div>
            <h3 className="truncate text-lg font-semibold text-[#1f1f1f]">{detail.title}</h3>
            <p className="truncate text-xs text-[#444746]">{detail.subtitle}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {detail.open_url && (
              <a
                href={detail.open_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[#d3e3fd] bg-white px-4 py-2 text-xs font-semibold text-[#0b57d0] hover:bg-[#d3e3fd]/50 transition-all flex items-center gap-1"
              >
                원문 열기
                <span className="material-symbols-rounded text-sm">open_in_new</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#e1e3e1] bg-white p-2 text-[#444746] hover:bg-[#d3e3fd]/40 transition-all"
              aria-label="원문 보기 닫기"
            >
              <span className="material-symbols-rounded text-lg">close</span>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-white px-5 py-6">
          {detail.content_type === "text/markdown" ? (
            <MarkdownContent content={detail.content} />
          ) : (
            <PlainTextContent content={detail.content} />
          )}
        </div>
      </section>
    </div>
  );
}
