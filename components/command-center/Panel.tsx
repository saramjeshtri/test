import type { ReactNode } from "react";

export default function Panel({
  title,
  icon,
  right,
  className = "",
  bodyClassName = "",
  /** Frosted glass instead of a solid card -- for panels sitting directly on
   *  top of the map rather than in a bounded column. */
  floating = false,
  accent,
  rise = true,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  floating?: boolean;
  /** Draws a colored bar along the top edge and a faint tint -- for the one card that should stand out. */
  accent?: string;
  /** Entrance animation. Turn off for content that re-mounts often (tab bodies) -- it would replay on every switch. */
  rise?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`${rise ? "bc-rise" : ""} flex flex-col rounded-[14px] ${floating ? "bc-glass" : "border"} ${className}`}
      style={
        floating
          ? undefined
          : {
              borderColor: accent ? `color-mix(in srgb, ${accent} 28%, var(--bc-border))` : "var(--bc-border)",
              background: accent ? `color-mix(in srgb, ${accent} 5%, var(--bc-surface))` : "var(--bc-surface)",
              boxShadow: accent ? `inset 0 3px 0 ${accent}, var(--bc-shadow)` : "var(--bc-shadow)",
            }
      }
    >
      {title && (
        <div
          className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b shrink-0"
          style={{ borderColor: "var(--bc-border)" }}
        >
          <div className="flex items-center gap-2.5 text-[13px] font-semibold" style={{ color: "var(--bc-text)" }}>
            {icon && (
              <span
                className="grid place-items-center w-7 h-7 rounded-[9px] shrink-0"
                style={{ background: "var(--bc-surface-2)" }}
              >
                {icon}
              </span>
            )}
            {title}
          </div>
          {right}
        </div>
      )}
      <div className={`px-4 py-3.5 flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
    </div>
  );
}
