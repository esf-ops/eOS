# Internal Estimate Quote Math Simulator

Generates an Excel workbook for **Marshal** to test and audit Internal Estimate quote math without using the production quoting tool.

**This workbook is not the source of truth.** Internal Estimate (`app-internal-estimate`) and the backend calculator remain authoritative.

## Quick start

```bash
cd tools/quote-math-simulator
npm install
node buildQuoteMathWorkbook.mjs
```

**Excel version (preferred):**

```text
debug/quote-math-simulator/Internal-Estimate-Quote-Math-Simulator.xlsx
```

**Google Sheets–compatible version** (use when sharing via Google Drive):

```bash
node buildGoogleSheetsWorkbook.mjs
```

```text
debug/quote-math-simulator/Internal-Estimate-Quote-Math-Simulator-Google-Sheets-Compatible.xlsx
```

The `debug/` folder is gitignored — regenerate workbooks after pulling math changes.

### Excel vs Google Sheets

| | Excel version | Google Sheets version |
|---|---------------|----------------------|
| **When to use** | Local Excel, full features | Upload to Google Drive / open in Google Sheets |
| **Dropdowns** | Data validation lists | Type values manually (see **Dropdown Lists** tab) |
| **Named ranges** | Yes (`Const_TaxRate`, etc.) | No — direct `'Constants'!$B$1` refs |
| **Hidden tabs** | `_Lists`, `_Constants` | Visible **Dropdown Lists**, **Constants** |
| **Sheet protection** | Yellow inputs unlocked | No protection |
| **Room Inputs tab** | Included (linked mirror) | Omitted (use Marshal Testing) |
| **Vanity tier labels** | `Kitchen ≥35 sf` / `<35 sf` | ASCII: `Kitchen over 35 sf` / `under 35 sf` |

The Google Sheets version is intentionally simplified for reliable conversion. Math and tab layout match the Excel workbook; polish features (protection, dropdowns, hidden helpers) are removed.

## Main tab: Marshal Testing

1. Open **START HERE** for color legend and instructions.
2. Go to **Marshal Testing**.
3. Edit **yellow cells only** (dropdowns and numbers).
4. Review **blue** calculated room results, customer summary, and OOC coverage check.

## Workbook tabs

| Tab | Purpose |
|-----|---------|
| START HERE | Instructions |
| Marshal Testing | Primary input + results (12 rooms) |
| Rate Book | Wholesale / Direct $/sf reference |
| Room Inputs | Linked mirror of Marshal Testing |
| Room Calculations | Formula engine |
| Add-ons | Full add-on catalog per room |
| Vanity Program | 2026 vanity fixed pricing |
| Out-of-Collection | Per-room OOC detail |
| Customer Summary | Exact vs customer display ($5 rounding) |
| Scenario Testing | Starter examples |
| Audit Map | Workbook ↔ code crosswalk |
| Dropdown Lists | Allowed input values (Google Sheets version only) |
| Constants | Shared formula constants (Google Sheets version only) |
| _Lists / _Constants | Hidden support sheets (Excel version only) |

## Configuration

Edit `constants.mjs`:

- `ROOM_COUNT` — default **12**
- Rate tables, tax %, OOC %, vanity sheet (must match `app-quote/src/lib/prototypeQuoteMath.ts`)

## v1 simplifications

- Manual square footage entry only (no guided-shape geometry).
- One price group per room.
- Custom lines: 3 optional rows; internal-only fold is simplified vs production.
- OOC material cost coverage is **warning-only** — does not change quote totals.

## Parity

Constants align with:

- `app-quote/src/lib/prototypeQuoteMath.ts`
- `app-quote/src/lib/vanityProgram2026.ts`
- `app-quote/src/lib/internalEstimateMaterialTaxPolicy.ts`
- `app-quote/src/lib/internalEstimateOutOfCollectionPolicy.ts`

Regression scripts: `scripts/verify-internal-estimate-beta-fixes.ts`, `backend-core/src/scripts/verifyInternalEstimateMath.mjs`
