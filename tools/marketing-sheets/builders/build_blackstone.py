"""Blackstone Installations partner documents: Elite 100 and Shower, with and without pricing. Priced Elite 100 uses the ESF logo; priced Shower and both no-pricing sheets use the Blackstone logo (per Marshal, 10.27.26)."""
import base64, html, re, sys
import openpyxl

SRC, OUTROOT = sys.argv[1:3]
import os
esc = html.escape

def clean(name):
    n = name.strip()
    n = re.sub(r"\s*Polished \(Printed\)$", "", n)
    n = re.sub(r"^(ASMI|Pacific|Epic|Stratus)\s+", "", n)
    return {"Honey Dew": "Honeydew"}.get(n, n)

def sup(s):
    return s.strip().title() if s.strip().lower() != "asmi" else "ASMI"

def size(s):
    return str(s).replace(" ", "").replace("x", "×")

ORDER = ["Promo", "A", "B", "C", "D", "E", "F"]

# ---------- data ----------
main, p100 = {}, {}
for _, g, s, name, fin, sz, sh, price in openpyxl.load_workbook(
        f"{SRC}/2027 ESF 100 Program Blackstone with Pricing 10.23.26.xlsx").active.iter_rows(min_row=5, max_row=110, values_only=True):
    if g:
        main.setdefault(g.strip(), []).append({"name": clean(name), "sup": sup(s), "fin": "Matte" if clean(name) == "Delgatie" else fin.strip(), "size": size(sz)})
        p100[g.strip()] = price
for v in main.values():
    v.sort(key=lambda i: i["name"].lower())

# the no-pricing partner list must carry the same colors
nop = {}
for g, s, name, fin, sz in openpyxl.load_workbook(f"{SRC}/2027 Elite 100 Program Partner No Pricing.xlsx").active.iter_rows(min_row=3, values_only=True):
    if g:
        nop.setdefault(g.strip(), set()).add(clean(name))
assert nop == {g: {i["name"] for i in v} for g, v in main.items()}, "partner no-pricing list differs from Fox pricing list"

shower, p_sh = {}, {}
for g, s, name, repl, th, sz, cost, price in openpyxl.load_workbook(
        f"{SRC}/10.21.26 2027 ESF Shower Program Partner Edition.xlsx").active.iter_rows(min_row=9, max_row=27, values_only=True):
    if g and g != "Price Group":
        shower.setdefault(g.strip(), []).append({"name": clean(name), "sup": sup(s), "size": size(sz)})
        p_sh[g.strip()] = price
for v in shower.values():
    v.sort(key=lambda i: i["name"].lower())
shower_names = {i["name"] for v in shower.values() for i in v}
SH_BASES = [("36″ × 36″ Mid Height Single Curb", 500), ("42″ × 36″ Mid Height Single Curb", 550),
            ("42″ × 42″ Mid Height Dual Curb", 650), ("60″ × 32″ Mid Height Single Curb (Drain Left or Right)", 650)]
SH_DRAIN = [("Round Brass", 50), ("Round PVC", 35)]
SH_OPTS = [("12″ Corner Shelf", 75), ("Underside Polish", 50), ("12″ × 10″ Recessed Niche", 250)]

# ---------- chrome ----------
CSS_T = """
:root { --o: __O__; --od: __OD__; --tint: __TINT__ }
@page { size: 8.5in 11in; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { width: 612pt; height: 792pt; background: #fff; overflow: hidden }
body { font-family: Montserrat, sans-serif; color: #111; position: relative; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.sheet { position: absolute; left: 0; top: 0; width: 612pt; height: 792pt; overflow: hidden }
.ring { position: absolute; right: -150pt; top: -190pt; width: 330pt; height: 330pt; border-radius: 50%; border: 17pt solid var(--tint) }
.page { position: absolute; inset: 0; padding: 22pt 33pt 0 33pt }
header { display: flex; justify-content: space-between; align-items: flex-start; height: __HH__; border-bottom: 2.2pt solid var(--o) }
.eyebrow { font-weight: 800; font-size: 6.6pt; letter-spacing: .2em; color: var(--od); text-transform: uppercase }
h1 { font-family: "Playfair Display", serif; font-weight: 800; font-size: 25.5pt; line-height: 1.05; letter-spacing: -.01em; margin-top: 1pt }
.sub { font-size: 7.4pt; line-height: 1.45; color: #555; margin-top: 4pt; max-width: 330pt }
.right { display: flex; flex-direction: column; align-items: flex-end; gap: 6pt }
.right img { width: __LW__; height: auto; display: block }
.pill { background: #111; color: #fff; font-weight: 800; font-size: 5.8pt; letter-spacing: .16em; padding: 4pt 8pt; text-transform: uppercase }
main { display: flex; gap: 10pt; margin-top: 12pt; align-items: flex-start }
.col { flex: 1; display: flex; flex-direction: column; gap: 11pt; min-width: 0 }
.card { border: .7pt solid #ddd; background: #fff }
.gh { display: flex; justify-content: space-between; align-items: center; background: #f5f5f5; border-left: 3pt solid var(--o); padding: 0 9pt 0 12pt; height: 23pt; border-bottom: .7pt solid #ddd }
.gt { font-weight: 800; font-size: 7.6pt; letter-spacing: .13em; color: var(--od); white-space: nowrap }
.gc { font-weight: 700; font-size: 5.2pt; letter-spacing: .1em; color: #666; white-space: nowrap }
.gp { font-weight: 800; font-size: 8.4pt; color: #111; white-space: nowrap }
.gp small { font-weight: 700; font-size: 5pt; letter-spacing: .08em; color: #666; margin-left: 2pt }
ul { list-style: none; padding: 2pt 7pt 3pt 11pt }
li { display: flex; align-items: center; height: 12.5pt; border-bottom: .5pt dotted #e2e2e2; font-size: 7.1pt; font-weight: 500 }
li:last-child { border-bottom: 0 }
li.f { height: 18pt }
li .n { flex: 1; white-space: nowrap; line-height: 1.05 }
li .n i { display: block; font-style: normal; font-weight: 700; font-size: 4.4pt; letter-spacing: .1em; text-transform: uppercase; color: var(--od); line-height: 1; margin-top: .6pt }
li .z { width: 32pt; text-align: right; font-size: 6.3pt; font-weight: 600; color: #444; white-space: nowrap }
li .s { width: 33pt; text-align: right; font-weight: 800; font-size: 4.9pt; letter-spacing: .1em; color: #666; text-transform: uppercase; white-space: nowrap }
li .d { width: 6pt; text-align: center; color: var(--o); font-size: 6pt; line-height: 1; margin-left: -2pt; margin-right: 1pt }
main.z { zoom: 1.22 }
.opt li { height: auto; min-height: 12.9pt; padding: 2pt 0 }
.opt li .n { white-space: normal; padding-right: 6pt }
.opt li .p { font-weight: 700 }
.note { padding: 5pt 9pt 7pt 12pt; font-size: 6.2pt; line-height: 1.5; color: #555; border-top: .5pt dotted #ccc }
.note b { color: #111; font-weight: 700 }
ol { padding: 6pt 10pt 8pt 26pt; font-size: 6.9pt; line-height: 1.55; color: #333 }
ol li { display: list-item; height: auto; border: 0; padding: 1.5pt 0; font-size: 6.9pt }
.plain li .n { white-space: normal }
.plain li { height: auto; min-height: 13pt; padding: 2pt 0 }
.legend { position: absolute; left: 33pt; right: 33pt; bottom: 40pt; font-size: 5.9pt; color: #555; font-weight: 600; letter-spacing: .04em }
.legend span { color: var(--od); font-weight: 800 }
footer { position: absolute; left: 33pt; right: 33pt; bottom: 22pt; border-top: .7pt solid #ddd; padding-top: 8pt; display: flex; justify-content: space-between;
  font-weight: 700; font-size: 5.9pt; letter-spacing: .1em; color: #555; text-transform: uppercase }
footer b { color: var(--od); font-weight: 800 }
"""

def page(title, sub, pill, body, foot, legend=""):
    CSS = (CSS_T.replace('__O__', P['o']).replace('__OD__', P['od']).replace('__TINT__', P['tint'])
           .replace('__HH__', P['hh']).replace('__LW__', P['lw']))
    logo = P['logo64']
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Playfair+Display:wght@800;900&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class="sheet"><div class="ring"></div><div class="page">
<header><div><div class="eyebrow">{esc(P["eyebrow"])}</div><h1>{esc(title)}</h1><p class="sub">{sub}</p></div>
<div class="right"><img src="data:image/png;base64,{logo}" alt="{esc(P["name"])}"><div class="pill">{esc(pill)}</div></div></header>
{body}{legend}
<footer><span><b>{esc(P['name'])}</b> · {foot}</span><span>{esc(P['foot_right'])}</span></footer>
</div></div></body></html>"""

def gtitle(g):
    return "GROUP PROMO" if g == "Promo" else f"GROUP {g}"

def price_html(p):
    return f'<span class="gp">${p}<small>/ SQ FT</small></span>'

# ---------- Elite 100 ----------
def card100(g, priced):
    rows = ""
    for i in main[g]:
        mark = f'<i>{i["fin"]}</i>' if i["fin"] in ("Satin", "Matte") and i["fin"].lower() not in i["name"].lower() else ""
        dot = '<span class="d">●</span>' if i["name"] in shower_names else '<span class="d"></span>'
        rows += f'<li{" class=f" if mark else ""}>{dot}<span class="n">{esc(i["name"])}{mark}</span><span class="z">{i["size"]}</span><span class="s">{i["sup"]}</span></li>'
    right = price_html(p100[g]) if priced else f'<span class="gc">{len(main[g])} COLORS</span>'
    return f'<section class="card"><div class="gh"><span class="gt">{gtitle(g)}</span>{right}</div><ul>{rows}</ul></section>'

def doc100(priced):
    cols = [["Promo", "A", "B"], ["C", "D"], ["E", "F"]]
    body = "<main>" + "".join(f'<div class="col">{"".join(card100(g, priced) for g in c)}</div>' for c in cols) + "</main>"
    legend = ('<div class="legend"><span>●</span> Also available in the 2cm Shower Program. Slab sizes in inches; Variable = granite, varies by slab.</div>')
    sub = ("Blackstone Installations 2027 pricing by price group, per square foot, material and fabricated." if priced
           else "Every color in the 2027 program by price group, with slab size and supplier.")
    html_ = page("Elite 100 Program", sub, "2027 Partner Pricing" if priced else "2027 Partner Program", body, "Elite 100 Program", legend)
    open(f"{OUT}/{'elite100_priced' if priced else 'elite100_nopricing'}.html", "w").write(html_)

# ---------- Shower ----------
def cardsh(g, priced):
    rows = "".join(f'<li><span class="n">{esc(i["name"])}</span><span class="z">{i["size"]}</span><span class="s">{i["sup"]}</span></li>' for i in shower[g])
    right = price_html(p_sh[g]) if priced else f'<span class="gc">{len(shower[g])} COLORS</span>'
    return f'<section class="card"><div class="gh"><span class="gt">{gtitle(g)}</span>{right}</div><ul>{rows}</ul></section>'

def opt_card(title, items, priced, note=""):
    rows = "".join(f'<li><span class="n">{esc(n)}</span>' + (f'<span class="p">${p}.00</span>' if priced else "") + "</li>" for n, p in items)
    n = f'<div class="note">{note}</div>' if note else ""
    return f'<section class="card opt"><div class="gh"><span class="gt">{title}</span></div><ul>{rows}</ul>{n}</section>'

def docshower(priced):
    guide = ["Shower program is for shower projects only.",
             "If awarded the shower, all additional 2cm pieces in the same room can be included in the same color at the same price.",
             "Edge profiles are limited on 2cm projects."]
    if not priced:
        guide.append("Shower program is 16 colors only. All shower options outside of these colors are to be custom quoted.")
    g = ('<section class="card"><div class="gh"><span class="gt">PROGRAM GUIDELINES</span></div><ol>'
         + "".join(f"<li>{esc(x)}</li>" for x in guide) + "</ol></section>")
    top = (f'<main class="z"><div class="col">{cardsh("Promo", priced)}{cardsh("A", priced)}</div>'
           f'<div class="col">{cardsh("B", priced)}{cardsh("C", priced)}</div><div class="col">{g}</div></main>')
    bot = ('<main class="z" style="margin-top:11pt"><div class="col">'
           + opt_card("SHOWER BASE OPTIONS", SH_BASES, priced, "<b>Base colors:</b> White, Glacier, Tiramisu, Alabaster")
           + '</div><div class="col">'
           + opt_card("SHOWER DRAIN BODY", SH_DRAIN, priced, "<b>Drain finishes:</b> Nickel, Satin Brass, Oil Rubbed Bronze, Chrome, White, Matte Black")
           + '</div><div class="col">' + opt_card("SHOWER OPTIONS", SH_OPTS, priced) + "</div></main>")
    sub = ("Blackstone Installations 2027 pricing. 2cm slabs for shower projects, priced per square foot material and fabricated, with base, drain and option pricing." if priced
           else "2cm slabs for shower projects, with base, drain and option choices.")
    open(f"{OUT}/{'shower_priced' if priced else 'shower_nopricing'}.html", "w").write(
        page("Elite Shower Program", sub, "2027 Partner Pricing" if priced else "2027 Partner Program", top + bot, "Elite Shower Program"))


# ---------- run: Blackstone ----------
# Marshal: no-pricing copies carry the partner logo (sent to customers); priced copies use the ESF logo (internal only).
ESF = dict(name="Elite Stone Fabrication", eyebrow="Elite Stone Fabrication", logo="ESF", o="#8b0000", od="#8b0000", tint="#f3e5e5",
           hh="72pt", lw="126pt", foot_right="www.elitestonefabrication.com")
BS = dict(name="Blackstone Installations", eyebrow="Blackstone Installations", logo="Blackstone", o="#e0a21a", od="#8a5f00", tint="#fbf1dc",
          hh="72pt", lw="112pt", foot_right="2027 Program")
OUT = f"{OUTROOT}/Blackstone Installations"
os.makedirs(OUT, exist_ok=True)
ESF["logo64"] = base64.b64encode(open(sys.argv[3], "rb").read()).decode()
BS["logo64"] = base64.b64encode(open(sys.argv[4], "rb").read()).decode()
P = ESF; doc100(True)
P = BS; docshower(True)
P = BS; doc100(False); docshower(False)
print({g: len(v) for g, v in main.items()}, p100, p_sh)
