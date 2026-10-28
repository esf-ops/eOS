"""Build the 2027 Elite 100 color collection page (HTML) from Marshal's 2027 workbook."""
import base64, json, re, sys
import openpyxl

SRC, LOGO, OUT_HTML, OUT_JSON = sys.argv[1:5]

# Marshal's supplier column -> label printed on the collection page.
# Pacific = ESF private label; Epic = Q Quartz; Pacific "Dual" slabs are the granites.
def label(supplier, finish):
    s = supplier.strip().lower()
    if s == "pacific":
        return "GRANITE" if finish.strip().lower() == "dual" else "ESF"
    return {"asmi": "ASMI", "cambria": "CAMBRIA", "stratus": "STRATUS",
            "trends": "TRENDS", "epic": "Q QUARTZ"}[s]

def clean(name):
    n = name.strip()
    n = re.sub(r"\s*Polished \(Printed\)$", "", n)
    n = re.sub(r"^(ASMI|Pacific)\s+", "", n)
    n = {"Honey Dew": "Honeydew"}.get(n, n)
    return n

groups = {}
ws = openpyxl.load_workbook(SRC).active
for grp, sup, name, finish, size in ws.iter_rows(min_row=3, values_only=True):
    if not grp:
        continue
    groups.setdefault(str(grp).strip(), []).append(
        {"name": clean(name), "supplier": label(sup, finish)})
for items in groups.values():
    items.sort(key=lambda i: i["name"].lower())

order = ["Promo", "A", "B", "C", "D", "E", "F"]
total = sum(len(groups[g]) for g in order)
json.dump({g: groups[g] for g in order}, open(OUT_JSON, "w"), indent=1)

columns = [["Promo", "A", "B"], ["C", "D"], ["E", "F"]]

def card(g):
    items = groups[g]
    title = "GROUP PROMO" if g == "Promo" else f"GROUP {g}"
    rows = "".join(
        f'<li><span class="n">{i["name"].replace("&", "&amp;")}</span><span class="s">{i["supplier"]}</span></li>'
        for i in items)
    return (f'<section class="card"><div class="gh"><span class="gt">{title}</span>'
            f'<span class="gc">{len(items)} COLORS</span></div><ul>{rows}</ul></section>')

cols = "".join(f'<div class="col">{"".join(card(g) for g in c)}</div>' for c in columns)
logo = base64.b64encode(open(LOGO, "rb").read()).decode()

html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>The 100 Color Collection | Elite Stone Fabrication</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Playfair+Display:wght@800;900&display=swap" rel="stylesheet">
<style>
@page {{ size: 8.5in 11in; margin: 0 }}
* {{ box-sizing: border-box; margin: 0; padding: 0 }}
html, body {{ width: 612pt; height: 792pt; background: #fff; overflow: hidden }}
body {{ font-family: Montserrat, sans-serif; color: #111; position: relative;
  -webkit-print-color-adjust: exact; print-color-adjust: exact }}
.ring {{ position: absolute; right: -150pt; top: -190pt; width: 330pt; height: 330pt; border-radius: 50%;
  border: 17pt solid #f3e5e5 }}
.sheet {{ position: absolute; left: 0; top: 0; width: 612pt; height: 792pt; overflow: hidden }}
.page {{ position: absolute; inset: 0; padding: 22pt 33pt 0 33pt }}
header {{ display: flex; justify-content: space-between; align-items: flex-start; height: 72pt;
  border-bottom: 2.2pt solid #8b0000; position: relative }}
.eyebrow {{ font-weight: 800; font-size: 6.6pt; letter-spacing: .2em; color: #8b0000; text-transform: uppercase }}
h1 {{ font-family: "Playfair Display", serif; font-weight: 800; font-size: 25.5pt; line-height: 1.05;
  letter-spacing: -.01em; margin-top: 1pt }}
.sub {{ font-size: 7.4pt; line-height: 1.45; color: #555; margin-top: 4pt; max-width: 360pt }}
.right {{ display: flex; flex-direction: column; align-items: flex-end; gap: 9pt; margin-top: 3pt }}
.right img {{ width: 126pt; height: auto; display: block }}
.pill {{ background: #111; color: #fff; font-weight: 800; font-size: 5.8pt; letter-spacing: .16em;
  padding: 4pt 8pt; text-transform: uppercase }}
main {{ display: flex; gap: 14pt; margin-top: 12pt; align-items: flex-start }}
.col {{ flex: 1; display: flex; flex-direction: column; gap: 11pt }}
.card {{ border: .7pt solid #ddd; background: #fff }}
.gh {{ display: flex; justify-content: space-between; align-items: center; background: #f5f5f5;
  border-left: 3pt solid #8b0000; padding: 0 9pt 0 12pt; height: 23pt; border-bottom: .7pt solid #ddd }}
.gt {{ font-weight: 800; font-size: 7.6pt; letter-spacing: .13em; color: #8b0000 }}
.gc {{ font-weight: 700; font-size: 5.2pt; letter-spacing: .1em; color: #666 }}
ul {{ list-style: none; padding: 2pt 9pt 3pt 12pt }}
li {{ display: flex; justify-content: space-between; align-items: center; height: 12.9pt;
  border-bottom: .5pt dotted #e2e2e2; font-size: 7.3pt; font-weight: 500 }}
li:last-child {{ border-bottom: 0 }}
.s {{ font-weight: 800; font-size: 4.9pt; letter-spacing: .1em; color: #666 }}
footer {{ position: absolute; left: 33pt; right: 33pt; bottom: 22pt; border-top: .7pt solid #ddd; padding-top: 8pt;
  display: flex; justify-content: space-between; font-weight: 700; font-size: 5.9pt; letter-spacing: .1em;
  color: #555; text-transform: uppercase }}
footer b {{ color: #8b0000; font-weight: 800 }}
</style></head><body>
<div class="sheet"><div class="ring"></div>
<div class="page">
<header>
  <div>
    <div class="eyebrow">Elite Stone Fabrication</div>
    <h1>The 100 Color Collection</h1>
    <p class="sub">A curated ESF stock collection organized by price group for fast selections, consistent quoting,
    and a simple customer experience.</p>
  </div>
  <div class="right"><img src="data:image/png;base64,{logo}" alt="Elite Stone Fabrications"><div class="pill">2027 Collection</div></div>
</header>
<main>{cols}</main>
<footer><span><b>Elite Stone Fabrication</b> · The Elite 100 Color Program</span><span>www.elitestonefabrication.com</span></footer>
</div></div></body></html>"""
open(OUT_HTML, "w").write(html)
print("total colors:", total, {g: len(groups[g]) for g in order})
