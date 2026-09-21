import { Fragment, type ReactNode } from "react";
import type { Citation } from "@/lib/agent/types";

const TOKEN = /(\*\*[^*]+\*\*|\[R\d+(?:, R\d+)*\])/g;

interface Props {
  text: string;
  citations: Citation[];
  active: string | null;
  onCite: (ref: string) => void;
}

/** **bold** and [R1, R2] citation markers; everything else stays plain text (never raw HTML). */
function Inline({ text, citations, active, onCite }: Props) {
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} style={{ color: "var(--bc-text)" }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("[R")) {
          return (
            <Fragment key={i}>
              {part
                .slice(1, -1)
                .split(", ")
                .map((ref) => {
                  const n = citations.findIndex((c) => c.ref === ref) + 1;
                  if (n === 0) return null;
                  return (
                    <button
                      key={ref}
                      onClick={() => onCite(ref)}
                      aria-label={`Burimi ${n}`}
                      aria-pressed={active === ref}
                      className="bc-press mx-0.5 align-baseline inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
                      style={{
                        background: active === ref ? "var(--bc-forest)" : "var(--bc-forest-tint)",
                        color: active === ref ? "#fff" : "var(--bc-forest)",
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
            </Fragment>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/** Paragraphs and "- " / "1." lists. */
export default function RichText(props: Props) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="flex flex-col gap-1 pl-4 list-disc marker:text-[var(--bc-text-secondary)]">
        {list.map((item, i) => (
          <li key={i}>
            <Inline {...props} text={item} />
          </li>
        ))}
      </ul>
    );
    list = [];
  };
  for (const line of props.text.split("\n")) {
    const item = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (item) list.push(item[1]);
    else {
      flush();
      if (line.trim()) {
        blocks.push(
          <p key={`p${blocks.length}`}>
            <Inline {...props} text={line} />
          </p>
        );
      }
    }
  }
  flush();
  return <div className="flex flex-col gap-2.5">{blocks}</div>;
}
