# Synthetic fragmented-source fixtures

Placeholder data for rehearsing the "Merge" pipeline before the real Track D
data package is handed over (Friday 16:15 at the event). Regenerate with:

```bash
python3 fixtures/generate_fixtures.py
```

Requires `openpyxl` and `fpdf2` (`pip3 install --user openpyxl fpdf2`).

## What each file represents

All five files describe the same underlying kind of record — a citizen
infrastructure/service request tied to one of the 6 zones already defined in
[`public/data/areas.geojson`](../public/data/areas.geojson) — as if exported
from four different, uncoordinated municipal systems, plus one budget
reference file.

| File | Simulates | Format |
|---|---|---|
| `1_excel_drejtoria_infrastruktures.xlsx` | Infrastructure Directorate's own tracking sheet | Excel, Albanian headers |
| `2_csv_citizen_portal.csv` | Online citizen-portal export | CSV, English headers |
| `3_pdf_raport_mujor_sherbime.pdf` | Monthly services report, narrative + table | PDF |
| `4_legacy_munsys_export.txt` | Old legacy system dump | Pipe-delimited, cryptic codes |
| `5_budget_allocation.csv` | Finance dept's per-zone budget | CSV |

## Inconsistencies baked in on purpose

These are the things the matching/fusion engine (step 3) needs to reconcile —
don't "clean" them here, that's the point of the demo:

- **Field names differ per source** for the same concept, e.g. citizen name is
  `Emri i qytetarit` (xlsx) / `full_name` (csv) / `Emer i plote` (pdf) /
  `CTZ_NM` (legacy).
- **Zone reference differs per source**: `Zona N` (xlsx, pdf) vs `District N`
  (csv) vs `ZN` (legacy) vs `Lagjja Nr. N` (budget file) — all four need to
  resolve to the same `area-N` used by the map.
- **Language differs**: xlsx/pdf/legacy are Albanian, csv is English.
- **Status vocabulary differs, including two Albanian synonyms for the same
  bucket**: resolved = `Zgjidhur` (xlsx) / `Resolved` (csv) / `Përfunduar`
  (pdf) / `R` (legacy). Same pattern for in-progress and open.
- **Date formats differ**: `DD.MM.YYYY` (xlsx), ISO `YYYY-MM-DD` (csv),
  `DD/MM/YYYY` (pdf), raw `DDMMYYYY` numeric (legacy).
- **Schema shape differs**: only xlsx and legacy carry a cost field; only csv
  carries urgency and department as separate columns; legacy uses coded
  categories (`RD`, `LGT`, `WTR`, `WST`, `GRN`, `OTH`) needing a lookup table.
- **PDF is a report, not a data export** — title + narrative paragraph before
  the table, tightly-packed columns — deliberately a harder extraction target
  than the other three.

## Scope note

This covers the P0 "Merge" demo (2-3+ fragmented sources → canonical schema).
Budget file feeds the What-if simulator (P1) directly and mostly doesn't need
NLP-level fusion, just zone-name resolution.

Data is entirely synthetic (randomly generated names/dates/costs, seeded for
reproducibility) — replace with the real Elbasan package once it's issued at
the event, and disclose that replacement + any reused non-core parsing code
in Annex E.
