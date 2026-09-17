"""
Generates synthetic, realistically-fragmented municipal source files for the
Track D "data fusion" demo. Four systems, same underlying kind of record
(a citizen infrastructure/service request), each with different field names,
languages, status vocabulary, date formats and structure -- on purpose.

Zones match the 6 zones already defined in public/data/areas.geojson
(Zona 1..Zona 6) so this connects to the existing Cesium map. Record volume
per zone loosely tracks the existing severity scores in public/data/values.json
(Zona 5 "Kritike" gets the most requests, Zona 4 "Normale" the fewest) purely
so early dev/demo runs look coherent -- this is placeholder data, replaced by
the real Track D data package at the event.

Re-run with: python3 fixtures/generate_fixtures.py
"""
import csv
import random
from datetime import date, timedelta

from fpdf import FPDF
from openpyxl import Workbook
from openpyxl.styles import Font

random.seed(42)

OUT = "fixtures/raw-sources"

ZONES = [1, 2, 3, 4, 5, 6]
# relative request volume per zone, loosely tracking values.json severity
ZONE_WEIGHTS = {1: 5, 2: 9, 3: 6, 4: 4, 5: 11, 6: 7}

CATEGORIES = {
    "road": dict(al="Rrugë", en="Roads", code="RD"),
    "lighting": dict(al="Ndriçim publik", en="Public Lighting", code="LGT"),
    "water": dict(al="Ujësjellës/Kanalizime", en="Water/Sewage", code="WTR"),
    "waste": dict(al="Mbeturina", en="Waste Collection", code="WST"),
    "green": dict(al="Hapësira të gjelbra", en="Green Spaces", code="GRN"),
    "other": dict(al="Tjetër", en="Other", code="OTH"),
}

# status buckets, with an extra Albanian synonym ("Përfunduar") only used in
# the PDF report, to force the matching engine to learn more than one AL
# string per canonical status
STATUSES = {
    "resolved": dict(al="Zgjidhur", al_alt="Përfunduar", en="Resolved", code="R"),
    "in_progress": dict(al="Në proces", al_alt="Në vazhdim", en="In Progress", code="P"),
    "open": dict(al="Në pritje", al_alt="Pa filluar", en="Open", code="O"),
}

PRIORITIES = {
    "low": dict(al="Normale", en="Low", num=1),
    "medium": dict(al="Mesatare", en="Medium", num=2),
    "high": dict(al="Urgjente", en="High", num=3),
}

DESCRIPTIONS = {
    "road": [
        ("Gropë e madhe në rrugë", "Large pothole on the street"),
        ("Asfalt i dëmtuar", "Damaged asphalt surface"),
        ("Rrugë e bllokuar nga rrëshqitje dheu", "Road blocked by landslide debris"),
        ("Sinjalistika rrugore mungon", "Missing road signage"),
    ],
    "lighting": [
        ("Ndriçim publik jofunksional", "Streetlight not working"),
        ("Llamba e djegur në shesh", "Burnt-out lamp in the square"),
        ("Errësirë e plotë në rrugë", "Street completely dark at night"),
    ],
    "water": [
        ("Rrjedhje uji nga tubacioni", "Water leak from pipeline"),
        ("Problem me kanalizimet", "Sewage system blockage"),
        ("Presion i ulët i ujit", "Low water pressure"),
    ],
    "waste": [
        ("Kontejner i mbushur me mbeturina", "Overflowing waste container"),
        ("Mbeturina të papastruara", "Uncollected garbage"),
        ("Erë e keqe nga plehrat", "Bad odor from waste"),
    ],
    "green": [
        ("Pemë e rrëzuar në park", "Fallen tree in the park"),
        ("Bar i pakositur në hapësirën publike", "Uncut grass in public space"),
        ("Dëmtim i lulishtes", "Damage to the flower garden"),
    ],
    "other": [
        ("Kërkesë për leje ndërtimi", "Building permit request"),
        ("Ankesë për zhurmë", "Noise complaint"),
        ("Problem me sinjalistikën", "Signage issue"),
    ],
}

FIRST_NAMES = ["Arben", "Elira", "Gentian", "Blerina", "Ardit", "Silva", "Flamur",
               "Miranda", "Besnik", "Anila", "Ilir", "Klodiana", "Vjollca", "Dritan",
               "Enkelejda", "Shpëtim", "Manjola", "Fatos", "Lorena", "Skender",
               "Ermira", "Besart", "Donika", "Genti"]
LAST_NAMES = ["Hoxha", "Shehu", "Meta", "Kola", "Beqiri", "Prifti", "Duka", "Marku",
              "Leka", "Gjini", "Cara", "Basha", "Zeneli", "Toska", "Bushati",
              "Kastrati", "Dema"]

DEPTS = {
    "road": "Punë Publike", "lighting": "Punë Publike", "water": "Ujësjellës Kanalizime",
    "waste": "Higjiena Publike", "green": "Mjedis", "other": "Shërbime të Përgjithshme",
}

TODAY = date(2026, 6, 15)  # dataset's reference "today" -- spans the last two quarters


def gen_records(n, start_id=1):
    records = []
    zone_pool = [z for z, w in ZONE_WEIGHTS.items() for _ in range(w)]
    for i in range(n):
        zone = random.choice(zone_pool)
        cat = random.choice(list(CATEGORIES))
        al_desc, en_desc = random.choice(DESCRIPTIONS[cat])
        status = random.choices(
            list(STATUSES), weights=[0.45, 0.30, 0.25]
        )[0]
        priority = random.choices(list(PRIORITIES), weights=[0.5, 0.35, 0.15])[0]
        days_ago = random.randint(0, 180)
        records.append(dict(
            id=start_id + i,
            name=f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            zone=zone,
            category=cat,
            al_desc=al_desc,
            en_desc=en_desc,
            date=TODAY - timedelta(days=days_ago),
            status=status,
            priority=priority,
            cost=random.randint(15, 480) * 1000,  # Lekë
            dept=DEPTS[cat],
        ))
    return records


ALL = gen_records(48)
# split across the 4 "systems" -- not evenly, and with different category
# skews per system, the way real departmental exports would differ
SRC1 = ALL[0:14]   # Excel -- Infrastructure Directorate
SRC2 = ALL[14:28]  # CSV -- Citizen Portal
SRC3 = ALL[28:38]  # PDF -- Monthly services report
SRC4 = ALL[38:48]  # Legacy system export


def write_excel(records, path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Kërkesa"
    headers = ["Nr.", "Emri i qytetarit", "Zona", "Kategoria", "Përshkrimi",
               "Data e paraqitjes", "Statusi", "Përparësia", "Kosto e vlerësuar (Lekë)"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in records:
        ws.append([
            r["id"],
            r["name"],
            f"Zona {r['zone']}",
            CATEGORIES[r["category"]]["al"],
            r["al_desc"],
            r["date"].strftime("%d.%m.%Y"),
            STATUSES[r["status"]]["al"],
            PRIORITIES[r["priority"]]["al"],
            r["cost"],
        ])
    wb.save(path)


def write_csv(records, path):
    headers = ["request_id", "full_name", "neighborhood", "issue_type", "notes",
               "submitted_on", "current_status", "urgency", "dept"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for r in records:
            w.writerow([
                f"CP-{r['id']:04d}",
                r["name"],
                f"District {r['zone']}",
                CATEGORIES[r["category"]]["en"],
                r["en_desc"],
                r["date"].isoformat(),
                STATUSES[r["status"]]["en"],
                PRIORITIES[r["priority"]]["en"],
                r["dept"],
            ])


def write_pdf(records, path):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Raport Mujor - Sherbime Komunale", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6,
        "Bashkia Elbasan - Drejtoria e Sherbimeve Komunale. Ky raport permbledh "
        "kerkesat dhe ankesat e qytetareve te regjistruara gjate periudhes raportuese, "
        "sipas zones dhe departamentit pergjegjes.")
    pdf.ln(4)

    headers = ["Emer i plote", "Vendndodhja", "Lloji i problemit", "Data", "Gjendja", "Departamenti"]
    widths = [32, 20, 32, 22, 26, 38]
    pdf.set_font("Helvetica", "B", 9)
    for h, w in zip(headers, widths):
        pdf.cell(w, 8, h, border=1)
    pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    for r in records:
        status_word = STATUSES[r["status"]]["al_alt"]
        row = [
            r["name"],
            f"Zona {r['zone']}",
            CATEGORIES[r["category"]]["al"],
            r["date"].strftime("%d/%m/%Y"),
            status_word,
            r["dept"],
        ]
        for val, w in zip(row, widths):
            text = val.encode("latin-1", "replace").decode("latin-1")
            pdf.cell(w, 7, text, border=1)
        pdf.ln()
    pdf.output(path)


def write_legacy(records, path):
    lines = [
        "* MUNSYS EXPORT v2.3 - GENERATED 2026-06-15 06:02 - DO NOT EDIT *",
        "* FIELDS: REQ_ID|CTZ_NM|ZN|CAT_CD|DESC|DT_SUB|STS|PRI|COST_LEK *",
    ]
    for r in records:
        desc = r["al_desc"].replace("|", "-")
        lines.append("|".join([
            f"L{r['id']:05d}",
            r["name"].upper(),
            f"Z{r['zone']}",
            CATEGORIES[r["category"]]["code"],
            desc,
            r["date"].strftime("%d%m%Y"),
            STATUSES[r["status"]]["code"],
            str(PRIORITIES[r["priority"]]["num"]),
            str(r["cost"]),
        ]))
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def write_budget_csv(path):
    # different zone-naming convention again, on purpose
    zone_names = {
        1: "Lagjja Nr. 1", 2: "Lagjja Nr. 2", 3: "Lagjja Nr. 3",
        4: "Lagjja Nr. 4", 5: "Lagjja Nr. 5", 6: "Lagjja Nr. 6",
    }
    # population + budget loosely tracking values.json severity again
    pop_budget = {
        1: (8200, 4_200_000), 2: (11500, 5_100_000), 3: (7600, 3_900_000),
        4: (6100, 3_100_000), 5: (13800, 4_400_000), 6: (9700, 4_000_000),
    }
    headers = ["zone_ref", "population", "annual_budget_leke", "spent_ytd_leke"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for z in ZONES:
            pop, budget = pop_budget[z]
            spent = int(budget * random.uniform(0.35, 0.75))
            w.writerow([zone_names[z], pop, budget, spent])


write_excel(SRC1, f"{OUT}/1_excel_drejtoria_infrastruktures.xlsx")
write_csv(SRC2, f"{OUT}/2_csv_citizen_portal.csv")
write_pdf(SRC3, f"{OUT}/3_pdf_raport_mujor_sherbime.pdf")
write_legacy(SRC4, f"{OUT}/4_legacy_munsys_export.txt")
write_budget_csv(f"{OUT}/5_budget_allocation.csv")

print("Generated 5 fixture files in", OUT)
print(f"  Source 1 (Excel/AL):   {len(SRC1)} records")
print(f"  Source 2 (CSV/EN):     {len(SRC2)} records")
print(f"  Source 3 (PDF/AL):     {len(SRC3)} records")
print(f"  Source 4 (Legacy/AL):  {len(SRC4)} records")
print(f"  Total request records: {len(ALL)}")
