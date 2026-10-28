# eliteOS Marketing Sheets

Branded one-page (Letter, 8.5 x 11 in) price and color sheets for Elite Stone Fabrication: the 2027 Elite 100 program, the shower program, partner editions, and the stock sink collection. Everything here is generated from a spreadsheet or asset folder plus a Python builder, then printed to PDF with headless Chrome. Nothing here talks to the eliteOS app or database.

Finished PDFs are written to `marketing-exports/` (untracked). Source spreadsheets from Marshal Tolly and the `Digital Assets` folder are inputs, not stored here.

## The ESF look (brand spec)

Every ESF sheet shares this template. The partner sheets reuse it and swap only the accent colors and logo.

| Element | Spec |
|---|---|
| Page | 612 x 792 pt (Letter), `@page` margin 0, content padding 22pt top / 33pt sides |
| Fonts | Montserrat 500-800 (body, labels) and Playfair Display 800 (titles), loaded from Google Fonts |
| ESF red | `#8b0000` (accent, rules, group titles, bullets) |
| Ring tint | `#f3e5e5` |
| Ink / grays | text `#111`, secondary `#555` / `#666`, rules `#ddd`, dotted row lines `#e2e2e2`, card header fill `#f5f5f5` |
| Header | 72pt tall, 2.2pt red bottom rule. Left: red eyebrow (6.6pt, caps, .2em tracking), Playfair title (25.5pt), gray subtitle (7.4pt). Right: logo (126pt wide) over a black pill (5.8pt caps, white text) |
| Decoration | Pale ring top right: 330pt circle, 17pt border in the tint, offset `right:-150pt; top:-190pt`, clipped by an overflow-hidden `.sheet` wrapper |
| Cards | 0.7pt `#ddd` border; group header 21-23pt tall with a 3pt red left border, red caps title (7.4-7.6pt, .13em tracking) and a gray count or price on the right |
| Rows | 12.5-12.9pt tall, 0.5pt dotted divider, name at 7.1-7.3pt, small caps supplier tag at 4.9pt |
| Footer | 22pt from the bottom, 0.7pt rule, 5.9pt caps gray, red bold brand name on the left, web address (and revision date on ESF sheets) on the right |

The canonical, current CSS is in `builders/build_sinks.py` (the `CSS` string) and `builders/build_color_collection.py`. Partner builders define the accent through the variables `--o` (accent), `--od` (dark accent) and `--tint` (ring).

Logo: `brand/esf-logo.png` (500 x 150 PNG, trimmed). Partner logos are supplied by the partner and are not stored here.

### Partner accent colors

| Partner | `--o` | `--od` | `--tint` |
|---|---|---|---|
| ESF | `#8b0000` | `#8b0000` | `#f3e5e5` |
| Fox Countertops | `#ff6600` | `#c94f00` | `#fdeee2` |
| Aceno Countertops | `#2c4f8f` | `#1f3f78` | `#e6edf8` |
| Cambrian Granite and Stone | `#9b0f1f` | `#9b0f1f` | `#f5ece0` |
| Blackstone Installations | `#e0a21a` | `#8a5f00` | `#fbf1dc` |
| Sterling Woodworks | uses the ESF look and ESF logo | | |

## Builders

All run with the project virtualenv's Python (needs `openpyxl`, `Pillow`, and `pymupdf` for previews). Each builder writes HTML; run `./render_pdf.sh in.html out.pdf` to print it.

| Builder | Produces | Inputs |
|---|---|---|
| `build_color_collection.py SRC.xlsx LOGO OUT.html OUT.json` | The 100 Color Collection (no pricing) | Marshal's 2027 Elite 100 workbook |
| `build_esf_pricing_and_shower.py ZIP LOGO OUTDIR` | ESF Direct and Wholesale 100 pricing, Shower Direct, Wholesale and No Pricing | Marshal's 2027 zip |
| `build_fox.py SRC LOGO OUT` | Fox: Elite 100 and Shower (priced / no pricing) plus the Builder Program | Fox files from Marshal |
| `build_partners_aceno_cambrian_sterling.py SRC OUTROOT ESF_LOGO` | Aceno, Cambrian, Sterling sets (4 PDFs each) | Partner xlsx files plus partner logos in `SRC` |
| `build_blackstone.py SRC OUTROOT ESF_LOGO BLACKSTONE_LOGO` | Blackstone set (4 PDFs) | Blackstone xlsx files and logo |
| `build_sinks.py OUTDIR ESF_LOGO` | Stock Sink Collection, 3 pages (Kansas, Blanco, accessories), priced and no pricing | `~/Desktop/Digital Assets` plus `builders/blanco_colors.json` |

`blanco_colors.json` (Blanco model prices and color lists) is generated from the plumbing catalog seed:

```bash
node -e 'import("./backend-core/src/digitalEstimate/catalog/esfPlumbingCatalogSeed.mjs").then(m=>{const o={};for(const x of m.ESF_PLUMBING_CATALOG_SEED.products.filter(x=>x.subcategory==="blanco_sink"&&x.variants)){o[x.productId]={price:x.sellPrice,colors:[...new Set(x.variants.map(v=>(v.color||v.finish||"?").replace("Café Brown","Cafe").replace("Café","Cafe")))]}}require("fs").writeFileSync("tools/marketing-sheets/builders/blanco_colors.json",JSON.stringify(o,null,1))})'
```

Sink prices and availability come from `_local/catalog-source/esf-plumbing-specialty-program-2026-07-10.xlsx` (Kansas sheet Status column: Stock vs Non Stock). Re-pull when that program changes.

## Decisions baked into the sheets

- Partner documents say "Elite 100" / "Elite 100 Program". ESF's own sheets keep the current ESF wording.
- 100-sheet columns: Promo, A, B / C, D / E, F. Colors are alphabetical inside each group. A red dot marks colors also in the shower program (derived from the shower list).
- Finish is spelled out (SATIN or MATTE) under the color name, only when it is not already in the name. Delgatie is shown as Matte even though Marshal's source files say Satin.
- Supplier labels: ESF-branded sheets use ESF / GRANITE / Q QUARTZ. Partner sheets use Marshal's raw supplier names (Pacific, ASMI, Cambria, Stratus, Trends, Epic).
- Classic Grey is removed from the shower sheets; Grey Galaxy (ASMI) replaces it.
- Logo rules per Marshal: no-pricing partner copies carry the partner logo. Fox, Aceno and Cambrian priced sheets keep the partner logo. Blackstone: priced Elite 100 uses the ESF logo; priced Shower and both no-pricing sheets use the Blackstone logo. Sterling uses the ESF logo throughout.
- Partner sheets show "2027 Program" in the footer. ESF and Fox sheets carry the revision date.
- Cost and replacement-cost columns from Marshal's workbooks are never printed.
- Sink sheet: Kansas stock sinks are the 14 SKUs with Status "Stock". Blanco is included as the promoted program but labeled Special Order. Prices are per sink. Blanco colors follow the ESF program, not Blanco's spec sheets. Ikon's "Concrete Gray" is shown as Volcano Gray.

## Known open items

- Marshal's source xlsx files still list Delgatie as Satin.
- Blackstone price columns D-F are labeled "Fox Countertops" in the source file.
- Marshal's Fox builder guidelines 2-3 are missing from the source.
- The 1518UM18 sink has no spec sheet or distinct photo; it reuses the 1512UM18 image.
- Blanco Small Bar, Precis 21" and Inteos omit one color each versus Blanco's spec sheets.

## Making a new sheet

1. Copy the closest builder, keep the `CSS` block, change the data loading and the card markup.
2. Set the accent variables for the partner (or leave the ESF defaults).
3. Build the HTML, run `./render_pdf.sh`, then preview with PyMuPDF at about 110 dpi and check that nothing collides with the footer.
4. Save the PDF under `marketing-exports/` and flag any source-data inconsistencies instead of silently fixing them.
