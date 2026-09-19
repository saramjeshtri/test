import type { ReactNode } from "react";

/** Title block shared by the detail pages. */
export default function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="bc-rise flex flex-wrap items-end justify-between gap-4 mb-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight leading-tight" style={{ color: "var(--bc-text)" }}>
          {title}
        </h1>
        <p className="mt-1 text-[12.5px] max-w-[62ch]" style={{ color: "var(--bc-text-secondary)" }}>
          {description}
        </p>
      </div>
      {actions}
    </div>
  );
}
