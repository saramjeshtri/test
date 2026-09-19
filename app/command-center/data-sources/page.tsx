import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, FileText, Terminal, Table2, ArrowRight, Layers, ShieldCheck, ChevronDown } from "lucide-react";
import { loadSourcesData, type SourceSummary } from "@/lib/commandCenter/sources";
import { CANONICAL_FIELDS } from "@/lib/fusion/schema";
import { SOURCE_SHORT, fieldLabel, fieldDescription } from "@/lib/commandCenter/labels";
import PageHeader from "@/components/command-center/pages/PageHeader";

export const metadata: Metadata = { title: "Busulla · Burimet e të dhënave" };

const KIND: Record<SourceSummary["kind"], { label: string; icon: typeof Table2 }> = {
  excel: { label: "Excel", icon: FileSpreadsheet },
  csv: { label: "CSV", icon: Table2 },
  pdf: { label: "PDF", icon: FileText },
  legacy: { label: "Sistem i vjetër (TXT)", icon: Terminal },
};

const METHOD_LABEL = { exact: "E saktë", fuzzy: "E përafërt", llm: "AI", unmatched: "Pa përputhje" } as const;

const card = {
  borderColor: "var(--bc-border)",
  background: "var(--bc-surface)",
  boxShadow: "var(--bc-shadow)",
} as const;

export default function DataSourcesPage() {
  const data = loadSourcesData();
  const columns = data.sources.reduce((a, s) => a + s.mapping.length, 0);

  return (
    <>
      <PageHeader
        title="Burimet e të dhënave"
        description="Bashkia i mban të dhënat në sisteme që nuk flasin me njëri-tjetrin. Busulla i lexon të gjitha, i përputh kolonat me një model të vetëm dhe e tregon çdo hap, që të dish nga vjen çdo numër."
      />

      {/* headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          ["SISTEME TË BASHKUARA", String(data.sources.length + 1), "4 për kërkesat, 1 për buxhetin"],
          ["RRESHTA TË NORMALIZUAR", String(data.totalRecords), "në një tabelë të vetme"],
          ["KOLONA TË PËRPUTHURA", String(columns), `${data.unmappedColumns} pa përputhje`],
          ["THIRRJE AI", String(data.llmCalls), "fjalori i mbuloi të gjitha kolonat"],
        ].map(([label, value, note], i) => (
          <div key={label} className="bc-rise rounded-[14px] border px-4 py-3.5" style={{ ...card, animationDelay: `${i * 50}ms` }}>
            <div className="text-[10.5px] font-semibold tracking-[0.08em]" style={{ color: "var(--bc-text-secondary)" }}>{label}</div>
            <div className="mt-2 text-[28px] font-bold leading-none tracking-tight" style={{ color: "var(--bc-text)" }}>{value}</div>
            <div className="mt-1.5 text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>{note}</div>
          </div>
        ))}
      </div>

      {/* sources -> one model */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_360px] items-stretch mb-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {data.sources.map((s, i) => {
            const K = KIND[s.kind];
            const Icon = K.icon;
            const gaps = Object.entries(s.gaps);
            return (
              <article key={s.file} className="bc-rise rounded-[14px] border p-4 flex flex-col" style={{ ...card, animationDelay: `${i * 50}ms` }}>
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center w-9 h-9 rounded-[10px] shrink-0" style={{ background: "var(--bc-forest-tint)", color: "var(--bc-forest)" }}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[13px] font-semibold leading-tight" style={{ color: "var(--bc-text)" }}>{SOURCE_SHORT[s.file] ?? s.file}</h2>
                    <div className="mt-0.5 text-[10.5px] bc-mono truncate" style={{ color: "var(--bc-text-secondary)" }} title={s.file}>{s.file}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                  <span><b className="bc-mono" style={{ color: "var(--bc-text)" }}>{s.records}</b> rreshta</span>
                  <span><b className="bc-mono" style={{ color: "var(--bc-text)" }}>{s.mapping.length}</b> kolona</span>
                  <span>{K.label}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(Object.keys(s.methods) as (keyof typeof s.methods)[]).filter((m) => s.methods[m] > 0).map((m) => (
                    <span key={m} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--bc-surface-2)", color: "var(--bc-text-secondary)" }}>
                      {METHOD_LABEL[m]} · {s.methods[m]}
                    </span>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t text-[11.5px] flex-1" style={{ borderColor: "var(--bc-border)", color: "var(--bc-text-secondary)" }}>
                  {gaps.length === 0 ? (
                    <span className="flex items-center gap-1.5"><ShieldCheck size={13} style={{ color: "var(--bc-st-resolved)" }} /> Nuk mungon asnjë fushë.</span>
                  ) : (
                    <>
                      <div className="text-[10px] font-semibold tracking-[0.06em] mb-1">ÇFARË NUK NDJEK KY BURIM</div>
                      <span>{gaps.map(([f]) => fieldLabel(f)).join(", ")}</span>
                    </>
                  )}
                </div>
                <Link href={`/command-center/requests?source=${encodeURIComponent(s.file)}`} className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "var(--bc-forest)" }}>
                  Shiko rreshtat <ArrowRight size={12} />
                </Link>
              </article>
            );
          })}
        </div>

        <div className="hidden xl:grid place-items-center" aria-hidden="true" style={{ color: "var(--bc-text-secondary)" }}>
          <ArrowRight size={22} />
        </div>

        <aside className="bc-rise rounded-[14px] border overflow-hidden" style={{ ...card, animationDelay: "120ms" }}>
          <header className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--bc-border)" }}>
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-[10px]" style={{ background: "var(--bc-forest)", color: "#fff" }}><Layers size={17} /></span>
              <div>
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--bc-text)" }}>Modeli i vetëm</h2>
                <div className="text-[11px]" style={{ color: "var(--bc-text-secondary)" }}>{CANONICAL_FIELDS.length} fusha të përbashkëta</div>
              </div>
            </div>
          </header>
          <ul>
            {CANONICAL_FIELDS.map((f, i) => (
              <li key={f.field} className="px-4 py-2 text-[11.5px]" style={{ borderTop: i ? "1px solid var(--bc-border)" : "none" }}>
                <div className="font-semibold" style={{ color: "var(--bc-text)" }}>{fieldLabel(f.field)} <span className="bc-mono font-normal text-[10.5px]" style={{ color: "var(--bc-text-secondary)" }}>{f.field}</span></div>
                <div className="mt-0.5" style={{ color: "var(--bc-text-secondary)" }}>{fieldDescription(f.field)}</div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* how it works */}
      <section className="bc-rise rounded-[14px] border p-4 mb-4" style={card}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--bc-text)" }}>Si i bashkon Busulla burimet</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-5">
          {[
            ["Lexo", "Çdo format lexohet me lexuesin e vet: Excel, CSV, PDF ose skedar i vjetër."],
            ["Përputh kolonat", "Fjalori përputh emrat e kolonave, edhe kur janë shkruar ndryshe."],
            ["AI vetëm si rezervë", "Vetëm kolonat që fjalori nuk i njeh i shkojnë modelit AI."],
            ["Normalizo vlerat", "Zonat, statuset, kategoritë dhe datat kthehen në një formë të vetme."],
            ["Shënjo boshllëqet", "Ç'nuk ndjek një burim shënohet hapur, jo mbushet me të dhëna të sajuara."],
          ].map(([title, text], i) => (
            <li key={title} className="rounded-[10px] p-3" style={{ background: "var(--bc-surface-2)" }}>
              <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--bc-text)" }}>
                <span className="grid place-items-center w-5 h-5 rounded-full text-[10.5px] bc-mono" style={{ background: "var(--bc-forest)", color: "#fff" }}>{i + 1}</span>
                {title}
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: "var(--bc-text-secondary)" }}>{text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
          {data.llmCalls === 0
            ? "Në këtë set të dhënash fjalori përputhi 100% të kolonave, prandaj AI nuk u thirr asnjëherë. Do të përdoret vetëm kur të shfaqen kolona të reja."
            : `AI u përdor për ${data.llmCalls} kolona që fjalori nuk i njihte.`}
        </p>
      </section>

      {/* column-level detail */}
      <section className="bc-rise rounded-[14px] border overflow-hidden" style={card}>
        <header className="px-4 pt-3.5 pb-3 border-b" style={{ borderColor: "var(--bc-border)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--bc-text)" }}>Përputhja kolonë për kolonë</h2>
          <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>Hap një burim për të parë çdo kolonë origjinale dhe fushën ku përfundoi.</p>
        </header>
        {data.sources.map((s, i) => (
          <details key={s.file} className="group" style={{ borderTop: i ? "1px solid var(--bc-border)" : "none" }}>
            <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none transition-colors duration-150 hover:bg-[var(--bc-panel-hover)]">
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--bc-text)" }}>{SOURCE_SHORT[s.file] ?? s.file}</span>
              <span className="flex items-center gap-2 text-[11.5px]" style={{ color: "var(--bc-text-secondary)" }}>
                {s.mapping.length} kolona
                <ChevronDown size={14} className="transition-transform duration-200 group-open:rotate-180" />
              </span>
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" style={{ color: "var(--bc-text)" }}>
                <thead style={{ background: "var(--bc-surface-2)", color: "var(--bc-text-secondary)" }}>
                  <tr>
                    {["KOLONA ORIGJINALE", "FUSHA NË MODEL", "METODA", "BESUESHMËRIA"].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-[10.5px] font-semibold tracking-[0.06em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.mapping.map((m) => (
                    <tr key={m.sourceHeader} className="border-t" style={{ borderColor: "var(--bc-border)" }}>
                      <td className="px-4 py-2 bc-mono">{m.sourceHeader}</td>
                      <td className="px-4 py-2 font-medium">{m.canonicalField ? fieldLabel(m.canonicalField) : "—"}</td>
                      <td className="px-4 py-2" style={{ color: "var(--bc-text-secondary)" }}>{METHOD_LABEL[m.method]}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bc-surface-2)" }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.round(m.confidence * 100)}%`, background: "var(--bc-forest)" }} />
                          </div>
                          <span className="bc-mono text-[11px]">{Math.round(m.confidence * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
