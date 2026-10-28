"""ESF stock sink sell sheet (Kansas page + Blanco page), with and without pricing."""
import base64, glob, html, io, json, os, sys
from PIL import Image

ASSETS = os.path.expanduser("~/Desktop/Digital Assets")
OUT = sys.argv[1]
LOGO = sys.argv[2]
IMG = f"{OUT}/img"
os.makedirs(IMG, exist_ok=True)
esc = html.escape
REV = "Rev. 10.28.26"

# ---------- image prep ----------
def prep(src, dst, maxw, png=False, trim=False):
    im = Image.open(src)
    if png:
        im = im.convert("RGBA")
        if trim and im.getchannel("A").getbbox():
            im = im.crop(im.getchannel("A").getbbox())
    else:
        im = im.convert("RGB")
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    if png:
        im.save(dst, optimize=True)
    else:
        im.save(dst, quality=88)
    return os.path.basename(dst)

def k_img(folder, key):
    src = glob.glob(f"{ASSETS}/Kansas Sinks/{folder}/hero.*")[0]
    png = src.endswith(".png")
    return "img/" + prep(src, f"{IMG}/{key}.{'png' if png else 'jpg'}", 640, png=png)

def b_img(folder, key):
    src = f"{ASSETS}/Blanco Sinks/{folder}/anthracite.png"
    return "img/" + prep(src, f"{IMG}/{key}.png", 560, png=True, trim=True)

# ---------- data ----------
# (sku, name, spec line 1, spec line 2, price, image)
STEEL = [
    ("1512UM18", "Small Single Bowl", 'Bar / prep', '14-15/16" × 12-5/8" · 9" deep', 90, k_img("1512UM18", "k1512")),
    ("1518UM18", "Small Single, Vertical", 'Kitchen / prep', '18 ga. undermount', 90, k_img("1512UM18 Vertical", "k1518")),
    ("2317UM18", "Medium Single Bowl", 'Kitchen', '23-3/8" × 17-3/4" · 9" deep', 120, k_img("2317UM18", "k2317")),
    ("3018UM18", "Super Single Large Bowl", 'Kitchen', '29-7/8" × 18-1/16" · 9" deep', 160, k_img("3018UM16", "k3018")),
    ("3218UM18SS", "Super Single Bowl", 'Kitchen · center drain', '29-3/4" × 18" · 9" deep', 160, k_img("3218UM18 SS", "k3218ss")),
    ("3218UM18", "50/50 Double Bowl", 'Kitchen', '32-1/4" × 18-1/2" · 9" deep', 160, k_img("3218UM18 50:50", "k3218")),
    ("3221UM18", "60/40 Double Bowl", 'Kitchen', '31-1/2" × 20-1/2" · 9" & 7-1/2" deep', 160, k_img("3221UM18 60:40", "k3221")),
    ("WS32", "Workstation Single Bowl", 'Includes cutting board, rack, colander, grid & strainer', '32" × 19" · 10" deep', 450, k_img("WS32", "kws32")),
]
CHINA = [
    ("VC1512", "Oval", 'White', '17" × 14" · 6" deep', 35, k_img("VC1512WH", "kvc1512")),
    ("VC1613", "Oval", 'White or Biscuit', '18" × 15" · 6" deep', 35, k_img("VC1613WH", "kvc1613")),
    ("VC1638", "Small Rectangular", 'White', '17" × 13-3/4" · 5-1/2" deep', 55, k_img("VC1638WH", "kvc1638")),
    ("VC1912", "Rectangle", 'White or Biscuit', '21" × 14-1/2" · 6-1/4" deep', 55, k_img("VC1912WH", "kvc1912")),
]

BC = json.load(open(f"{os.path.dirname(os.path.abspath(__file__))}/blanco_colors.json"))
ALL = ["White", "Soft White", "Anthracite", "Cinder", "Truffle", "Cafe", "Coal Black", "Volcano Gray"]
SW = {"White": "#f6f6f2", "Soft White": "#ece6d4", "Anthracite": "#47494b", "Cinder": "#5f5c59", "Truffle": "#8c7c6c",
      "Cafe": "#523f33", "Coal Black": "#1e1e20", "Volcano Gray": "#7b7e82"}
LABEL = {"Cafe": "Café Brown"}

def cols(pid):
    have = {("Volcano Gray" if c == "Concrete Gray" else c) for c in BC[pid]["colors"]}
    return [c for c in ALL if c in have]

# (collection, name, spec1, spec2, product id, folder)
DIAMOND = [
    ("Diamond", "50/50 Double Bowl", "Regular & low divide", 'Min. cabinet 36"', "blanco:diamond-50-50", "DIAMOND Equal Double Regular Divide"),
    ("Diamond", "60/40 Double Bowl", "Regular, low & rev. low divide", 'Min. cabinet 36"', "blanco:diamond-60-40", "DIAMOND 60:40 Regular Divide"),
    ("Diamond", "Super Single", "Single bowl", 'Min. cabinet 36"', "blanco:super-single", "DIAMOND Super Single"),
    ("Diamond", "Small Bar", "Dual mount bar sink", 'Min. cabinet 15"', "blanco:diamond-small-bar", "DIAMOND Small Bar"),
]
PRECIS = [
    ("Precis", "50/50 Double Bowl", "Equal double bowl", 'Min. cabinet 33"', "blanco:precis-50-50", "PRECIS 50:50"),
    ("Precis", "60/40 Double Bowl", "Regular & low divide", 'Min. cabinet 36"', "blanco:precis-60-40", "PRECIS 60:40 Regular Divide"),
    ("Precis", "Super Single", "Single bowl", 'Min. cabinet 36"', "blanco:precis-super-single", "PRECIS Super Single"),
    ("Precis", '30" Single Bowl', "Single bowl", 'Min. cabinet 33"', "blanco:precis-30-single-bowl", 'PRECIS 30"'),
    ("Precis", '27" Single Bowl', "Single bowl", 'Min. cabinet 30"', "blanco:precis-27", 'PRECIS 27"'),
    ("Precis", '24" Single Bowl', "Single bowl", 'Min. cabinet 27"', "blanco:precis-24", 'PRECIS 24"'),
    ("Precis", '21" Single Bowl', "Single bowl", 'Min. cabinet 24"', "blanco:precis-21", 'PRECIS 21"'),
    ("Precis", "Bar", "Bar / prep sink", 'Min. cabinet 18"', "blanco:precis-bar", "PRECIS Bar"),
]
SPECIALTY = [
    ("Liven", 'Laundry 12" Deep', "Undermount or drop-in", 'Min. cabinet 27"', "blanco:liven-laundry-12-depth", 'LIVEN Laundry 12" Depth'),
    ("Inteos", '33" Workstation', "Accessories included", 'Min. cabinet 36"', "blanco:inteos-33-workstation", 'INTEOS 33" Workstation'),
    ("Ikon", "Apron Front", 'Single bowl · 10" apron', 'Min. cabinet 36"', "blanco:ikon-apron-front-single-bowl", "IKON Apron Front Single"),
]
for lst in (DIAMOND, PRECIS, SPECIALTY):
    for i, r in enumerate(lst):
        lst[i] = r + (b_img(r[5], "b" + r[4].split(":")[1]),)


def a_img(folder, key):
    return "img/" + prep(f"{ASSETS}/Accessories/{folder}/hero.png", f"{IMG}/{key}.png", 420, png=True, trim=True)

STRIP = [
    ("Diamond 50/50 Grid", "Left or right bowl", 150, a_img("Diamond 50:50 Grid Left", "a5050")),
    ("Diamond 60/40 Grid", "Large bowl", 150, a_img("Diamond 60:40 Grid Large Bowl", "a6040l")),
    ("Diamond 60/40 Grid", "Small bowl", 150, a_img("Diamond 60:40 Grid Small Bowl", "a6040s")),
    ("Diamond 60/40 Dish Rack", "", 150, a_img("Diamond 60:40 Dish Rack", "arack")),
    ("Diamond Super Single Grid", "", 180, a_img("Super Single Grid", "assingle")),
    ("Precis Bar Grid", "", 150, a_img("Precis Bar Grid", "abar")),
]
KANSAS_ACC = [
    ("2317UM18 Medium Single", "Stainless grid", 70),
    ("3018UM18 Super Single Large", "Stainless grid", 70),
    ("3218UM18SS Super Single", "Stainless grid", 70),
    ("3218UM18 50/50", "Stainless grid", 70),
    ("3221UM18 60/40", "Stainless grid, large or small bowl", 70),
]
# (sink, accessory, price)
BLANCO_ACC = [
    ("Diamond", [("50/50", "Grid, left or right bowl", 150), ("60/40", "Grid, large bowl, small bowl or reverse", 150),
                 ("60/40", "Dish rack", 150), ("60/40", "Wood cutting board", 150), ("Super Single", "Grid", 180)]),
    ("Precis", [("50/50", "Grid", 155), ("60/40", "Grid, large or small side (regular or low divide)", 155),
                ("Super Single", "Grid", 180), ('30" Single Bowl', "Grid", 180), ('24" Single Bowl', "Grid", 165),
                ('21" Single Bowl', "Grid", 165), ("Bar", "Grid", 150)]),
    ("Inteos / Ikon", [('Inteos 33" Workstation', "Grid", 169), ("Ikon Apron Front", "Grid", 189), ("Ikon Apron Front", "Wood cutting board", 249)]),
]
BLANCO_DRAINS = [("Stainless basket strainer", 80), ("Stainless basket flange", 90), ("Basket strainer, 3-in-1", 110),
                 ("Color-matched metal strainer or flange", 125)]

def val(p, priced):
    return f'<span class="v">${p:,}</span>' if priced else ""

def acc_page(priced):
    strip = "".join(
        f'<div class="ac"><div class="im"><img src="{img}"></div><div class="nm"><b>{esc(n)}</b>'
        + (f'<br>{esc(sub)}' if sub else "") + f'</div>' + (f'<div class="pp">${pr:,}</div>' if priced else "") + '</div>'
        for n, sub, pr, img in STRIP)
    def box(title, count, inner):
        return f'<div class="box"><div class="grp"><span class="gt">{esc(title)}</span><span class="gn">{esc(count)}</span></div><div class="rows">{inner}</div></div>'
    def row(l, sub, p):
        return f'<div class="row"><span class="l"><b>{esc(l)}</b>' + (f'<small>{esc(sub)}</small>' if sub else "") + f'</span>{val(p, priced)}</div>'
    kansas = box("Kansas Sinks · Grids", "Stainless steel",
                 "".join(row(a, b, c) for a, b, c in KANSAS_ACC))
    kstr = box("Strainers & Flanges", "All sinks",
               '<h5>Kansas</h5>' + row("Standard strainer", "", 30) + row("3-in-1 strainer", "", 50)
               + '<h5>Blanco</h5>' + "".join(row(a, "", b) for a, b in BLANCO_DRAINS))
    brows = ""
    for coll, items in BLANCO_ACC:
        brows += f'<h5>{esc(coll)}</h5>' + "".join(row(f"{coll if coll != 'Inteos / Ikon' else ''} {n}".strip(), a, p) for n, a, p in items)
    blanco = box("Blanco · Grids, Racks & Boards", "Silgranit sinks", brows)
    body = (f'<div class="grp" style="margin-top:11pt"><span class="gt">Featured Accessories</span><span class="gn">Blanco stainless steel</span></div>'
            f'<div class="strip">{strip}</div>'
            f'<div class="cols2"><div class="col">{kansas}{kstr}</div><div class="col">{blanco}</div></div>')
    note = ('<p class="note">Accessories are special order and sold separately. Kansas WS32 workstation includes cutting board, drying rack, colander, grid and strainer; '
            'Blanco Inteos includes cutting board, colander and accessory holder. No grids listed for Diamond Small Bar, Precis 27" or Liven.'
            + (' Prices shown are per item.' if priced else '') + '</p>')
    return page("Sink Accessories", "Matching grids, racks, boards and drains for the Kansas and Blanco sinks.", "Special Order · Accessories", body, note)

logo64 = base64.b64encode(open(LOGO, "rb").read()).decode()

CSS = """
@page { size: 8.5in 11in; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { background: #fff }
body { font-family: Montserrat, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.sheet { position: relative; width: 612pt; height: 792pt; overflow: hidden; page-break-after: always; break-after: page }
.sheet:last-child { page-break-after: auto; break-after: auto }
.ring { position: absolute; right: -150pt; top: -190pt; width: 330pt; height: 330pt; border-radius: 50%; border: 17pt solid #f3e5e5 }
.page { position: absolute; inset: 0; padding: 22pt 33pt 0 33pt }
header { display: flex; justify-content: space-between; align-items: flex-start; height: 72pt; border-bottom: 2.2pt solid #8b0000; position: relative }
.eyebrow { font-weight: 800; font-size: 6.6pt; letter-spacing: .2em; color: #8b0000; text-transform: uppercase }
h1 { font-family: "Playfair Display", serif; font-weight: 800; font-size: 25.5pt; line-height: 1.05; letter-spacing: -.01em; margin-top: 1pt }
.sub { font-size: 7.4pt; line-height: 1.45; color: #555; margin-top: 4pt; max-width: 360pt }
.right { display: flex; flex-direction: column; align-items: flex-end; gap: 9pt; margin-top: 3pt }
.right img { width: 126pt; height: auto; display: block }
.pill { background: #111; color: #fff; font-weight: 800; font-size: 5.8pt; letter-spacing: .16em; padding: 4pt 8pt; text-transform: uppercase }
.grp { display: flex; justify-content: space-between; align-items: center; background: #f5f5f5; border-left: 3pt solid #8b0000;
  padding: 0 9pt 0 12pt; height: 21pt; border: .7pt solid #ddd; border-left: 3pt solid #8b0000; margin: 9pt 0 7pt }
.gt { font-weight: 800; font-size: 7.4pt; letter-spacing: .13em; color: #8b0000; text-transform: uppercase }
.gn { font-weight: 700; font-size: 5.4pt; letter-spacing: .1em; color: #666; text-transform: uppercase }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9pt }
.card { border: .7pt solid #ddd; background: #fff; display: flex; flex-direction: column; padding: 8pt 9pt 7pt; position: relative }
.card .im { display: flex; align-items: center; justify-content: center; margin-bottom: 7pt; border-bottom: .5pt dotted #e2e2e2; padding-bottom: 7pt }
.card .im img { max-width: 100%; max-height: 100%; object-fit: contain; mix-blend-mode: multiply }
.k .im { height: 86pt }
.b .im { height: 48pt }
.sku { font-weight: 800; font-size: 5.6pt; letter-spacing: .14em; color: #8b0000; text-transform: uppercase }
.nm { font-weight: 700; font-size: 8pt; line-height: 1.2; margin-top: 2pt }
.sp { font-weight: 500; font-size: 5.9pt; line-height: 1.4; color: #666; margin-top: 3pt }
.foot { margin-top: auto; padding-top: 6pt; display: flex; justify-content: space-between; align-items: flex-end }
.dots { display: flex; gap: 2pt; flex-wrap: nowrap }
.dots i { width: 6pt; height: 6pt; border-radius: 50%; border: .6pt solid rgba(0,0,0,.25); display: block }
.pr { font-weight: 800; font-size: 13pt; color: #111; line-height: 1; margin-left: auto }
.pr small { font-weight: 700; font-size: 5pt; letter-spacing: .1em; color: #666; margin-left: 2pt }
.k .card { height: 176pt }
.np .k .im { height: 104pt }
.np .k .card { height: 168pt }
.b .card { height: 124pt }
.b .card { padding: 6pt 9pt 6pt }
.b .pr { font-size: 10.5pt }
.legend { border: .7pt solid #ddd; background: #f9f9f9; padding: 8pt 10pt; display: flex; flex-direction: column; gap: 3.4pt; justify-content: center }
.legend h4 { font-weight: 800; font-size: 5.6pt; letter-spacing: .14em; color: #8b0000; text-transform: uppercase; margin-bottom: 1pt }
.legend div { display: flex; align-items: center; gap: 5pt; font-weight: 600; font-size: 6.2pt }
.legend i { width: 8pt; height: 8pt; border-radius: 50%; border: .6pt solid rgba(0,0,0,.25); display: block }
.note { font-size: 5.8pt; line-height: 1.5; color: #666; margin-top: 9pt }

.strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9pt }
.ac { border: .7pt solid #ddd; padding: 7pt 7pt 6pt; display: flex; flex-direction: column; align-items: center; text-align: center }
.ac .im { height: 62pt; width: 100%; display: flex; align-items: center; justify-content: center; border-bottom: .5pt dotted #e2e2e2; padding-bottom: 6pt; margin-bottom: 5pt }
.ac .im img { max-width: 100%; max-height: 100%; object-fit: contain; mix-blend-mode: multiply }
.ac .nm { font-size: 6.6pt; line-height: 1.25; margin-top: 0 }
.ac .pp { font-weight: 800; font-size: 9pt; margin-top: 3pt }
.cols2 { display: grid; grid-template-columns: 1fr 1.25fr; gap: 12pt; align-items: start; margin-top: 11pt }
.cols2 .col { display: flex; flex-direction: column; gap: 11pt }
.box { border: .7pt solid #ddd }
.box .grp { margin: 0; border: 0; border-bottom: .7pt solid #ddd; border-left: 3pt solid #8b0000 }
.rows { padding: 2pt 10pt 3pt 12pt }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; padding: 3.6pt 0; border-bottom: .5pt dotted #e2e2e2; font-size: 6.9pt; font-weight: 500; line-height: 1.3 }
.row:last-child { border-bottom: 0 }
.row .l b { font-weight: 700 }
.row .l small { display: block; font-size: 5.8pt; color: #666; font-weight: 500 }
.row .v { font-weight: 800; font-size: 7.6pt; white-space: nowrap }
.rows h5 { font-weight: 800; font-size: 5.6pt; letter-spacing: .14em; color: #8b0000; text-transform: uppercase; padding: 5pt 0 1pt }
footer { position: absolute; left: 33pt; right: 33pt; bottom: 22pt; border-top: .7pt solid #ddd; padding-top: 8pt; display: flex; justify-content: space-between;
  font-weight: 700; font-size: 5.9pt; letter-spacing: .1em; color: #555; text-transform: uppercase }
footer b { color: #8b0000; font-weight: 800 }
"""

def page(title, sub, pill, body, notes=""):
    return f"""<div class="sheet"><div class="ring"></div><div class="page">
<header><div><div class="eyebrow">Elite Stone Fabrication · Sink Collection</div><h1>{esc(title)}</h1><p class="sub">{esc(sub)}</p></div>
<div class="right"><img src="data:image/png;base64,{logo64}" alt="Elite Stone Fabrications"><div class="pill">{esc(pill)}</div></div></header>
{body}{notes}
<footer><span><b>Elite Stone Fabrication</b> · Sink Collection</span><span>www.elitestonefabrication.com · {REV}</span></footer>
</div></div>"""

def price(p, priced):
    return f'<span class="pr">${p:,}</span>' if priced else ""

def kcard(r, priced):
    sku, name, s1, s2, p, img = r
    return (f'<div class="card"><div class="im"><img src="{img}"></div><div class="sku">{esc(sku)}</div><div class="nm">{esc(name)}</div>'
            f'<div class="sp">{esc(s1)}<br>{esc(s2)}</div><div class="foot">{price(p, priced)}</div></div>')

def bcard(r, priced):
    coll, name, s1, s2, pid, folder, img = r
    dots = "".join(f'<i style="background:{SW[c]}" title="{LABEL.get(c, c)}"></i>' for c in cols(pid))
    return (f'<div class="card"><div class="im"><img src="{img}"></div><div class="nm">{esc(coll + " " + name if coll in ("Liven","Inteos","Ikon") else name)}</div>'
            f'<div class="sp">{esc(s1)}<br>{esc(s2)}</div><div class="foot"><div class="dots">{dots}</div>{price(BC[pid]["price"], priced)}</div></div>')

def group(title, count, cards, extra=""):
    return (f'<div class="grp"><span class="gt">{esc(title)}</span><span class="gn">{esc(count)}</span></div>'
            f'<div class="grid">{"".join(cards)}{extra}</div>')

def legend():
    rows = "".join(f'<div><i style="background:{SW[c]}"></i>{LABEL.get(c, c)}</div>' for c in ALL)
    return f'<div class="legend"><h4>Silgranit Colors</h4>{rows}</div>'

def build(priced):
    k = ('<div class="k">'
         + group("Stainless Steel · 18 Gauge Undermount", "8 models", [kcard(r, priced) for r in STEEL])
         + group("Vitreous China · Undermount", "4 models · 6 sinks", [kcard(r, priced) for r in CHINA])
         + '</div>')
    knote = '<p class="note">Kansas stainless sinks are 304 series stainless steel with sound-deadening pads. Dimensions are nominal.' + (' Prices shown are per sink.' if priced else '') + '</p>'
    b = ('<div class="b">'
         + group("Diamond Collection", "4 models", [bcard(r, priced) for r in DIAMOND])
         + group("Precis Collection", "8 models", [bcard(r, priced) for r in PRECIS])
         + group("Liven · Inteos · Ikon", "3 models", [bcard(r, priced) for r in SPECIALTY], legend())
         + '</div>')
    bnote = ('<p class="note">All Blanco sinks are SILGRANIT granite composite, special order. Not every model is offered in every color. '
             'Colors shown are representative.' + (' Prices shown are per sink.' if priced else '') + ' Matching grids, dish racks and cutting boards available.</p>')
    p1 = page("Kansas Stock Sinks", "Stainless steel and vitreous china undermount sinks we keep in stock.", "In Stock · Kansas Sinks", k, knote)
    p2 = page("Blanco Silgranit Sinks", "Our promoted Blanco program, ordered to your color and configuration.", "Special Order · Blanco", b, bnote)
    p3 = acc_page(priced)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Elite Stone Fabrication Sink Collection</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Playfair+Display:wght@800;900&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body class="{'' if priced else 'np'}">{p1}{p2}{p3}</body></html>"""

for priced, name in ((True, "sinks_priced"), (False, "sinks_nopricing")):
    open(f"{OUT}/{name}.html", "w").write(build(priced))
print("ok")
