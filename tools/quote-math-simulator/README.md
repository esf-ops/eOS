# Internal Estimate Quote Math Simulator

Generates an Excel workbook for **Marshal** to test and audit Internal Estimate quote math without using the production quoting tool.

**This workbook is not the source of truth.** Internal Estimate (`app-internal-estimate`) and the backend calculator remain authoritative.

## Quick start

```bash
cd tools/quote-math-simulator
npm install
node buildQuoteMathWorkbook.mjs
```

Output:

```text
debug/quote-math-simulator/Internal-Estimate-Quote-Math-Simulator.xlsx
```

The `debug/` folder is gitignored — regenerate the workbook after pulling math changes.

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
