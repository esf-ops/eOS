"""Build the 2027 ESF Direct pricing sheet and the Shower Program sheets (Direct + Wholesale)."""
import base64, html, re, sys
import openpyxl

ZIP, LOGO, OUTDIR = sys.argv[1:4]
esc = html.escape

def label(supplier, finish=""):
    s = supplier.strip().lower()
    if s == "pacific":
        return "GRANITE" if finish.strip().lower() == "dual" else "ESF"
    return {"asmi": "ASMI", "cambria": "CAMBRIA", "stratus": "STRATUS",
            "trends": "TRENDS", "epic": "Q QUARTZ"}[s]

def clean(name):
    n = name.strip()
    n = re.sub(r"\s*Polished \(Printed\)$", "", n)
    n = re.sub(r"^(ASMI|Pacific)\s+", "", n)
    return {"Honey Dew": "Honeydew"}.get(n, n)

def size(s):
    return str(s).replace(" ", "").replace("x", "×")

# ---------- data ----------
ORDER = ["Promo", "A", "B", "C", "D", "E", "F"]
PRICE_DIRECT = {"Promo": 70, "A": 77, "B": 85, "C": 95, "D": 105, "E": 120, "F": 135}
PRICE_WHOLESALE = {"Promo": 45, "A": 57, "B": 65, "C": 75}

main = {}
for g, sup, name, fin, sz in openpyxl.load_workbook(f"{ZIP}/2027 ESF 100 Program Blank.xlsx").active.iter_rows(min_row=3, values_only=True):
    if g:
        main.setdefault(g.strip(), []).append(
            {"name": clean(name), "sup": label(sup, fin), "fin": "Matte" if clean(name) == "Delgatie" else fin.strip(), "size": size(sz)})
for v in main.values():
    v.sort(key=lambda i: i["name"].lower())

shower = {}
ws = openpyxl.load_workbook(f"{ZIP}/2027 ESF Shower Program Blank.xlsx").active
for g, sup, name, thick, sz in ws.iter_rows(min_row=9, max_row=28, values_only=True):
    if g and g != "Price Group" and clean(name) != "Classic Grey":
        shower.setdefault(g.strip(), []).append(
            {"name": clean(name), "sup": label(sup), "size": size(sz)})
for v in shower.values():
    v.sort(key=lambda i: i["name"].lower())
shower_names = {i["name"] for v in shower.values() for i in v}

# ---------- shared page chrome ----------
logo = base64.b64encode(open(LOGO, "rb").read()).decode()
CSS = """
@page { size: 8.5in 11in; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { width: 612pt; height: 792pt; background: #fff; overflow: hidden }
body { font-family: Montserrat, sans-serif; color: #111; position: relative;
  -webkit-print-color-adjust: exact; print-color-adjust: exact }
.sheet { position: absolute; left: 0; top: 0; width: 612pt; height: 792pt; overflow: hidden }
.ring { position: absolute; right: -150pt; top: -190pt; width: 330pt; height: 330pt; border-radius: 50%; border: 17pt solid #f3e5e5 }
.page { position: absolute; inset: 0; padding: 22pt 33pt 0 33pt }
header { display: flex; justify-content: space-between; align-items: flex-start; height: 72pt; border-bottom: 2.2pt solid #8b0000 }
.eyebrow { font-weight: 800; font-size: 6.6pt; letter-spacing: .2em; color: #8b0000; text-transform: uppercase }
h1 { font-family: "Playfair Display", serif; font-weight: 800; font-size: 25.5pt; line-height: 1.05; letter-spacing: -.01em; margin-top: 1pt }
.sub { font-size: 7.4pt; line-height: 1.45; color: #555; margin-top: 4pt; max-width: 360pt }
.right { display: flex; flex-direction: column; align-items: flex-end; gap: 9pt; margin-top: 3pt }
.right img { width: 126pt; height: auto; display: block }
.pill { background: #111; color: #fff; font-weight: 800; font-size: 5.8pt; letter-spacing: .16em; padding: 4pt 8pt; text-transform: uppercase }
main { display: flex; gap: 10pt; margin-top: 12pt; align-items: flex-start }
.col { flex: 1; display: flex; flex-direction: column; gap: 11pt; min-width: 0 }
.card { border: .7pt solid #ddd; background: #fff }
.gh { display: flex; justify-content: space-between; align-items: center; background: #f5f5f5; border-left: 3pt solid #8b0000;
  padding: 0 9pt 0 12pt; height: 23pt; border-bottom: .7pt solid #ddd }
.gt { font-weight: 800; font-size: 7.6pt; letter-spacing: .13em; color: #8b0000 }
.gc { font-weight: 700; font-size: 5.2pt; letter-spacing: .1em; color: #666 }
.gp { font-weight: 800; font-size: 8.4pt; color: #111 }
.gp small { font-weight: 700; font-size: 5pt; letter-spacing: .08em; color: #666; margin-left: 2pt }
ul { list-style: none; padding: 2pt 7pt 3pt 11pt }
li { display: flex; align-items: center; height: 12.9pt; border-bottom: .5pt dotted #e2e2e2; font-size: 7.1pt; font-weight: 500 }
li:last-child { border-bottom: 0 }
li.f { height: 18pt }
li .n { flex: 1; white-space: nowrap; line-height: 1.05 }
li .n i { display: block; font-style: normal; font-weight: 700; font-size: 4.4pt; letter-spacing: .1em; text-transform: uppercase; color: #8b0000; line-height: 1; margin-top: .6pt }
li .z { width: 32pt; text-align: right; font-size: 6.3pt; font-weight: 600; color: #444; font-variant-numeric: tabular-nums }
li .s { width: 33pt; text-align: right; font-weight: 800; font-size: 4.9pt; letter-spacing: .1em; color: #666 }
li .d { width: 6pt; margin-left: -2pt; margin-right: 1pt; text-align: center; color: #8b0000; font-size: 6pt; line-height: 1 }
.opt { font-size: 7.3pt; font-weight: 500 }
.opt li .p { font-weight: 700; font-variant-numeric: tabular-nums }
.note { padding: 5pt 9pt 7pt 12pt; font-size: 6.2pt; line-height: 1.5; color: #555; border-top: .5pt dotted #ccc }
.note b { color: #111; font-weight: 700 }
main.z { zoom: 1.22 }
.gt, .gp, li .s, li .z { white-space: nowrap }
.opt li { height: auto; min-height: 12.9pt; padding: 2pt 0 }
.opt li .n { white-space: normal; padding-right: 6pt }
ol { padding: 6pt 10pt 8pt 26pt; font-size: 6.9pt; line-height: 1.55; color: #333 }
ol li { display: list-item; height: auto; border: 0; padding: 1.5pt 0; font-size: 6.9pt }
.legend { position: absolute; left: 33pt; right: 33pt; bottom: 40pt; font-size: 5.9pt; color: #555; font-weight: 600; letter-spacing: .04em }
.legend span { color: #8b0000 }
footer { position: absolute; left: 33pt; right: 33pt; bottom: 22pt; border-top: .7pt solid #ddd; padding-top: 8pt; display: flex;
  justify-content: space-between; font-weight: 700; font-size: 5.9pt; letter-spacing: .1em; color: #555; text-transform: uppercase }
footer b { color: #8b0000; font-weight: 800 }
"""

def page(title, sub, pill, body, footer_right, legend=""):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Playfair+Display:wght@800;900&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class="sheet"><div class="ring"></div><div class="page">
<header><div><div class="eyebrow">Elite Stone Fabrication</div><h1>{esc(title)}</h1><p class="sub">{sub}</p></div>
<div class="right"><img src="data:image/png;base64,{logo}" alt="Elite Stone Fabrications"><div class="pill">{esc(pill)}</div></div></header>
{body}{legend}
<footer><span><b>Elite Stone Fabrication</b> · {footer_right[0]}</span><span>www.elitestonefabrication.com</span></footer>
</div></div></body></html>"""

def gtitle(g):
    return "GROUP PROMO" if g == "Promo" else f"GROUP {g}"

# ---------- 1. 100 program, direct pricing ----------
def card100(g, prices=None):
    prices = prices or PRICE_DIRECT
    rows = ""
    for i in main[g]:
        fin = f'<i>{i["fin"]}</i>' if i["fin"] in ("Satin", "Matte") and i["fin"].lower() not in i["name"].lower() else ""
        dot = '<span class="d">●</span>' if i["name"] in shower_names else '<span class="d"></span>'
        rows += (f'<li{" class=f" if fin else ""}>{dot}<span class="n">{esc(i["name"])}{fin}</span>'
                 f'<span class="z">{i["size"]}</span><span class="s">{i["sup"]}</span></li>')
    return (f'<section class="card"><div class="gh"><span class="gt">{gtitle(g)}</span>'
            f'<span class="gp">${prices[g]}<small>/ SQ FT</small></span></div><ul>{rows}</ul></section>')

cols = [["Promo", "A", "B"], ["C", "D"], ["E", "F"]]
body = "<main>" + "".join(f'<div class="col">{"".join(card100(g) for g in c)}</div>' for c in cols) + "</main>"
legend = '<div class="legend"><span>●</span> Also available in the 2cm Shower Program. Slab sizes in inches; Variable = granite, varies by slab.</div>'
open(f"{OUTDIR}/100_direct.html", "w").write(page(
    "The 100 Color Collection",
    "2027 direct pricing by price group. Every color listed with slab size and supplier.",
    "2027 Direct Pricing", body, ("The Elite 100 Color Program · Rev. 10.23.26",), legend))

# ---------- 2/3. shower program ----------
def cardsh(g, prices):
    nop = prices is None
    rows = "".join(f'<li><span class="n">{esc(i["name"])}</span>' + ('' if nop else f'<span class="z">{i["size"]}</span>') + f'<span class="s">{i["sup"]}</span></li>'
                   for i in shower[g])
    right = f'<span class="gc">{len(shower[g])} COLORS</span>' if nop else f'<span class="gp">${prices[g]}<small>/ SQ FT</small></span>'
    return (f'<section class="card"><div class="gh"><span class="gt">{gtitle(g)}</span>'
            f'{right}</div><ul>{rows}</ul></section>')

def opt_card(title, items, note="", nop=False):
    rows = "".join(f'<li><span class="n">{esc(n)}</span>' + ('' if nop else f'<span class="p">${p}</span>') + '</li>' for n, p in items)
    n = f'<div class="note">{note}</div>' if note else ""
    return f'<section class="card opt"><div class="gh"><span class="gt">{title}</span></div><ul>{rows}</ul>{n}</section>'

GUIDE = ["Shower program is for shower projects only.",
         "If awarded the shower, all additional 2cm pieces in the same room can be included in the same color at the same price.",
         "Edge profiles are limited on 2cm projects.",
         "Shower program is limited to the colors listed. All shower options outside of these colors are custom quoted."]
guide = ('<section class="card"><div class="gh"><span class="gt">PROGRAM GUIDELINES</span></div><ol>'
         + "".join(f"<li>{esc(g)}</li>" for g in GUIDE) + "</ol></section>")
def mk_cards(nop):
  global bases, drain, extras
  bases = opt_card("SHOWER BASE OPTIONS", [
    ("36″ × 36″ Mid Height Single Curb", "500.00"),
    ("42″ × 36″ Mid Height Single Curb", "550.00"),
    ("42″ × 42″ Mid Height Dual Curb", "650.00"),
    ("60″ × 32″ Mid Height Single Curb (Drain Left or Right)", "650.00")],
    "<b>Base colors:</b> White, Glacier, Tiramisu, Alabaster", nop)
  drain = opt_card("SHOWER DRAIN BODY", [("Round Brass", "50.00"), ("Round PVC", "35.00")],
    "<b>Drain finishes:</b> Nickel, Satin Brass, Oil Rubbed Bronze, Chrome, White, Matte Black", nop)
  extras = opt_card("SHOWER OPTIONS", [("12″ Corner Shelf", "75.00"), ("Underside Polish", "50.00"),
                                      ("12″ × 10″ Recessed Niche", "250.00")], nop=nop)

def shower_doc(prices, pill, sub, fname):
    mk_cards(prices is None)
    top = (f'<main class="z"><div class="col">{cardsh("Promo", prices)}{cardsh("A", prices)}</div>'
           f'<div class="col">{cardsh("B", prices)}{cardsh("C", prices)}</div>'
           f'<div class="col">{guide}</div></main>')
    bottom = f'<main class="z" style="margin-top:11pt"><div class="col">{bases}</div><div class="col">{drain}</div><div class="col">{extras}</div></main>'
    open(f"{OUTDIR}/{fname}", "w").write(page("2cm Shower Program", sub, pill, top + bottom,
        ("2cm Shower Program · Rev. 10.23.26",)))

shower_doc(PRICE_DIRECT_SH := {"Promo": 70, "A": 77, "B": 85, "C": 95}, "2027 Direct Pricing",
           "Shower projects only. 2cm slabs, priced per square foot, with base, drain and option pricing.", "shower_direct.html")
shower_doc(PRICE_WHOLESALE, "2027 Wholesale Pricing",
           "Shower projects only. 2cm slabs, priced per square foot material and fabricated, with base, drain and option pricing.",
           "shower_wholesale.html")
shower_doc(None, "2027 Shower Program",
           "Shower projects only. 2cm slabs with base, drain and option choices.", "shower_noprice.html")
print({g: len(v) for g, v in main.items()}, {g: len(v) for g, v in shower.items()}, "shower in 100 list:",
      sorted(shower_names & {i["name"] for v in main.values() for i in v}), "not in 100:",
      sorted(shower_names - {i["name"] for v in main.values() for i in v}))


# ---------- 4. 100 program, wholesale pricing ----------
wb_rows = list(openpyxl.load_workbook(f"{ZIP}/wholesale100.xlsx").active.iter_rows(min_row=5, values_only=True))
wprice, wcheck = {}, {}
for g, sup, name, fin, sz, sh, price in wb_rows:
    if g:
        wprice.setdefault(g.strip(), set()).add(price)
        wcheck.setdefault(g.strip(), set()).add(clean(name))
assert all(len(v) == 1 for v in wprice.values()), wprice
PRICE_W100 = {g: next(iter(v)) for g, v in wprice.items()}
assert {g: {i["name"] for i in v} for g, v in main.items()} == wcheck, "wholesale colors differ from direct workbook"
body = "<main>" + "".join(f'<div class="col">{"".join(card100(g, PRICE_W100) for g in c)}</div>' for c in cols) + "</main>"
open(f"{OUTDIR}/100_wholesale.html", "w").write(page(
    "The 100 Color Collection",
    "2027 wholesale pricing by price group, per square foot material and fabricated. Every color listed with slab size and supplier.",
    "2027 Wholesale Pricing", body, ("The Elite 100 Color Program \u00b7 Rev. 10.23.26",), legend))
print("wholesale 100 prices:", PRICE_W100)
