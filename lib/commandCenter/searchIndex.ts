import { STATUS_LABEL, STATUS_ORDER } from "./labels";

export type SearchItem = {
  id: string;
  label: string;
  /** One short line saying where it leads. */
  hint: string;
  group: "Faqe" | "Zonat" | "Pjesë që nuk shihen menjëherë";
  /** Extra words that should find this item. */
  keywords?: string;
  path: string;
  /** Query string appended when navigating from another page. */
  query?: Record<string, string>;
  /** Home page only: select a zone / open a sidebar tab in place. */
  home?: { zone?: string; tab?: "trend" | "evidence" };
  /** Analytics page only: id of the section to scroll to. */
  section?: string;
};

const HOME = "/command-center";
const REQUESTS = "/command-center/requests";
const ANALYTICS = "/command-center/analytics";

/**
 * What the header search can reach. Deliberately the things you can't see from where you stand:
 * other pages, zones on the map, the tabs and charts tucked inside a page, and ready-made
 * request filters -- not the request rows themselves (the Kërkesat page has its own search for those).
 */
export function buildSearchIndex(zones: { zoneId: string; zoneLabel: string }[]): SearchItem[] {
  return [
    { id: "p-home", group: "Faqe", label: "Përmbledhje", hint: "Hartë, zona dhe pamja e përgjithshme", keywords: "kryefaqja ballina home", path: HOME },
    { id: "p-requests", group: "Faqe", label: "Kërkesat", hint: "Tabela e plotë e kërkesave të qytetarëve", keywords: "tabela ankesat", path: REQUESTS },
    { id: "p-analytics", group: "Faqe", label: "Analitika", hint: "Grafikët dhe krahasimet", keywords: "grafik statistika raporte", path: ANALYTICS },
    { id: "p-sources", group: "Faqe", label: "Burimet e të dhënave", hint: "Nga vijnë të dhënat dhe sa janë të plota", keywords: "excel csv pdf sisteme", path: "/command-center/data-sources" },

    ...zones.map<SearchItem>((z) => ({
      id: `z-${z.zoneId}`,
      group: "Zonat",
      label: z.zoneLabel,
      hint: "Fokuso hartën te kjo zonë",
      keywords: "lagje zone",
      path: HOME,
      query: { zone: z.zoneId },
      home: { zone: z.zoneId },
    })),

    { id: "s-trend", group: "Pjesë që nuk shihen menjëherë", label: "Trendi mujor", hint: "Përmbledhje > Trendi", keywords: "muaj grafik linje", path: HOME, query: { tab: "trend" }, home: { tab: "trend" } },
    { id: "s-evidence", group: "Pjesë që nuk shihen menjëherë", label: "Evidenca", hint: "Përmbledhje > Evidencë: kërkesat e zonës së zgjedhur", keywords: "lista kërkesat qytetarët", path: HOME, query: { tab: "evidence" }, home: { tab: "evidence" } },

    { id: "a-monthly", group: "Pjesë që nuk shihen menjëherë", label: "Kërkesat sipas muajit", hint: "Analitika", keywords: "trend muaj", path: ANALYTICS, query: { focus: "monthly" }, section: "monthly" },
    { id: "a-category", group: "Pjesë që nuk shihen menjëherë", label: "Kërkesat sipas kategorisë", hint: "Analitika", keywords: "rruge ndricim ujë mbeturina", path: ANALYTICS, query: { focus: "category" }, section: "category" },
    { id: "a-status", group: "Pjesë që nuk shihen menjëherë", label: "Statusi sipas zonës", hint: "Analitika", keywords: "zgjidhur proces pritje", path: ANALYTICS, query: { focus: "status" }, section: "status" },
    { id: "a-budget", group: "Pjesë që nuk shihen menjëherë", label: "Buxheti i shpenzuar sipas zonës", hint: "Analitika", keywords: "lekë financa shpenzime", path: ANALYTICS, query: { focus: "budget" }, section: "budget" },
    { id: "a-priority", group: "Pjesë që nuk shihen menjëherë", label: "Kërkesat sipas prioritetit", hint: "Analitika", keywords: "urgjente përparësia", path: ANALYTICS, query: { focus: "priority" }, section: "priority" },
    { id: "a-risk", group: "Pjesë që nuk shihen menjëherë", label: "Renditja e zonave sipas rrezikut", hint: "Analitika", keywords: "rezultati vëmendje prioritet", path: ANALYTICS, query: { focus: "risk" }, section: "risk" },

    ...STATUS_ORDER.map<SearchItem>((st) => ({
      id: `r-${st}`,
      group: "Pjesë që nuk shihen menjëherë",
      label: `Kërkesat: ${STATUS_LABEL[st].toLowerCase()}`,
      hint: "Kërkesat, të filtruara sipas statusit",
      keywords: "filtër status",
      path: REQUESTS,
      query: { status: st },
    })),
    { id: "r-urgent", group: "Pjesë që nuk shihen menjëherë", label: "Kërkesat urgjente", hint: "Kërkesat, të filtruara sipas prioritetit", keywords: "prioritet i lartë", path: REQUESTS, query: { priority: "high" } },
  ];
}

const fold = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Items matching the text (accent- and case-insensitive), best matches first. Empty text returns everything. */
export function searchItems(items: SearchItem[], query: string): SearchItem[] {
  const q = fold(query.trim());
  if (!q) return items;
  const scored: { item: SearchItem; rank: number }[] = [];
  for (const item of items) {
    const label = fold(item.label);
    const at = label.indexOf(q);
    let rank: number;
    if (at === 0) rank = 0;
    else if (at > 0 && label[at - 1] === " ") rank = 1;
    else if (at > 0) rank = 2;
    else if (fold(`${item.keywords ?? ""} ${item.hint}`).includes(q)) rank = 3;
    else continue;
    scored.push({ item, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).map((s) => s.item);
}
