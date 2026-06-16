/**
 * Shared workbook builder — Excel (default) and Google Sheets-compatible variants.
 */
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADDON_CATALOG,
  DEFAULT_TARGET_MATERIAL_MULTIPLIER,
  DIRECT_RATES,
  DROPDOWN_LISTS,
  GOOGLE_SHEETS_OUTPUT_PATH,
  OUTPUT_PATH,
  PRICE_GROUPS,
  ROOM_COUNT,
  VANITY_PROGRAM_2026,
  VANITY_TIER_THRESHOLD_SQFT,
  WHOLESALE_RATES
} from "./constants.mjs";
import { constantsRows, createVariantConfig, registerNamedRanges } from "./workbookRefs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

// ── Styles ───────────────────────────────────────────────────────────────────
const COLORS = {
  input: "FFF2CC",
  output: "D9E1F2",
  ref: "F2F2F2",
  header: "D9D9D9",
  green: "C6EFCE",
  orange: "FFEB9C",
  red: "FFC7CE",
  white: "FFFFFF"
};

const fontTitle = { bold: true, size: 14 };
const fontHeader = { bold: true, size: 11 };
const fontNote = { italic: true, size: 10, color: { argb: "FF666666" } };

function fill(cell, argb) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleInput(cell) {
  fill(cell, COLORS.input);
  if (cfg.protectSheets) cell.protection = { locked: false };
}

function styleOutput(cell) {
  fill(cell, COLORS.output);
  if (cfg.protectSheets) cell.protection = { locked: true };
}

function styleRef(cell) {
  fill(cell, COLORS.ref);
  if (cfg.protectSheets) cell.protection = { locked: true };
}

function styleHeader(cell) {
  fill(cell, COLORS.header);
  cell.font = fontHeader;
  if (cfg.protectSheets) cell.protection = { locked: true };
}

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function mtRow(roomIndex) {
  return ROOM_FIRST_ROW + roomIndex;
}

function addListValidation(ws, cellRef, listRange) {
  if (!cfg.dataValidation) return;
  ws.dataValidations.add(cellRef, {
    type: "list",
    allowBlank: true,
    formulae: [listRange]
  });
}

function protectSheet(ws) {
  if (!cfg.protectSheets) return;
  ws.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    deleteColumns: false,
    deleteRows: false
  });
}

// ── Layout anchors (Marshal Testing) ───────────────────────────────────────
const MT = "Marshal Testing";
const RC = "Room Calculations";
const RB = "Rate Book";
const ADD = "Add-ons";
const VAN = "Vanity Program";
const OOC = "Out-of-Collection";
const CS = "Customer Summary";

const SETTINGS = { pricingMode: "B5", materialProgram: "B6", notes: "B7" };
const ROOM_HEADER_ROW = 11;
const ROOM_FIRST_ROW = 12;
const ROOM_LAST_ROW = ROOM_FIRST_ROW + ROOM_COUNT - 1;

/** Marshal Testing room input columns */
const R = {
  num: "A",
  name: "B",
  type: "C",
  override: "D",
  resolved: "E",
  group: "F",
  color: "G",
  counter: "H",
  backsplash: "I",
  fhb: "J",
  sinkQty: "K",
  cookQty: "L",
  outletQty: "M",
  tearout: "N",
  vanityProg: "O"
};

const CALC_HEADER_ROW = ROOM_LAST_ROW + 3;
const CALC_FIRST_ROW = CALC_HEADER_ROW + 1;
const CALC_LAST_ROW = CALC_FIRST_ROW + ROOM_COUNT - 1;

const CUSTOM_HEADER_ROW = CALC_LAST_ROW + 3;
const CUSTOM_FIRST_ROW = CUSTOM_HEADER_ROW + 1;
const CUSTOM_LAST_ROW = CUSTOM_FIRST_ROW + 2;

const SUMMARY_HEADER_ROW = CUSTOM_LAST_ROW + 3;
const COVERAGE_HEADER_ROW = SUMMARY_HEADER_ROW + 12;

/** @param {'excel' | 'google'} variant */
export async function buildWorkbook(variant = "excel") {
  cfg = createVariantConfig(variant);
  const OUT_FILE = join(REPO_ROOT, cfg.isGoogle ? GOOGLE_SHEETS_OUTPUT_PATH : OUTPUT_PATH);

  wb = new ExcelJS.Workbook();
  wb.creator = "eliteOS quote-math-simulator";
  wb.created = new Date();

  buildStartHereSheet();
  buildMarshalTestingSheet();
  buildRateBookSheet();
  if (cfg.includeRoomInputs) buildRoomInputsSheet();
  buildRoomCalculationsSheet();
  buildAddonsSheet();
  buildVanityProgramSheet();
  buildOutOfCollectionSheet();
  buildCustomerSummarySheet();
  buildScenarioTestingSheet();
  buildAuditMapSheet();
  buildListsSheet();
  buildConstantsSheet();
  if (cfg.useNamedRanges) registerNamedRanges(wb, cfg);

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  const label = cfg.isGoogle ? "Google Sheets-compatible" : "Excel";
  console.log(`Wrote ${OUT_FILE} (${label}, ${ROOM_COUNT} rooms)`);
}

/** @type {ReturnType<typeof createVariantConfig>} */
let cfg;
/** @type {ExcelJS.Workbook} */
let wb;

// ═══════════════════════════════════════════════════════════════════════════
function buildListsSheet() {
  const sheetOpts = cfg.hiddenSupportSheets ? { state: "veryHidden" } : {};
  const ws = wb.addWorksheet(cfg.listsSheetName, sheetOpts);
  const dataStartRow = cfg.hiddenSupportSheets ? 1 : 4;

  if (!cfg.hiddenSupportSheets) {
    ws.getCell("A1").value = "Dropdown Lists — allowed values (type exact text in yellow cells)";
    ws.getCell("A1").font = fontTitle;
    ws.mergeCells("A1:O1");
    ws.getCell("A2").value =
      "Google Sheets version: no dropdown validation. Copy values from the rows below.";
    ws.getCell("A2").font = fontNote;
    ws.mergeCells("A2:O2");
  }

  let row = dataStartRow;
  for (const [key, values] of Object.entries(DROPDOWN_LISTS)) {
    ws.getCell(row, 1).value = key;
    const tierValues =
      key === "vanityTier" ? ["Auto", cfg.tierOver35, cfg.tierUnder35] : values;
    tierValues.forEach((v, i) => {
      ws.getCell(row, i + 2).value = v;
    });
    row++;
  }
  ws.getCell(row, 1).value = "priceGroup";
  PRICE_GROUPS.forEach((g, i) => {
    ws.getCell(row, i + 2).value = g;
  });
  row++;
  ws.getCell(row, 1).value = "vanitySize";
  VANITY_PROGRAM_2026.forEach((v, i) => {
    ws.getCell(row, i + 2).value = v.code;
  });
}

function buildConstantsSheet() {
  const sheetOpts = cfg.hiddenSupportSheets ? { state: "veryHidden" } : {};
  const ws = wb.addWorksheet(cfg.constantsSheetName, sheetOpts);

  if (!cfg.hiddenSupportSheets) {
    ws.getCell("D1").value = "Constants — referenced by formulas (column B, rows 1–6)";
    ws.getCell("D1").font = fontTitle;
    ws.getCell("D2").value = "Do not change unless intentionally testing math.";
    ws.getCell("D2").font = fontNote;
  }

  constantsRows().forEach(([label, val], i) => {
    const r = i + 1;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 2).value = val;
    styleRef(ws.getCell(r, 1));
    styleRef(ws.getCell(r, 2));
  });
}

function buildRateBookSheet() {
  const ws = wb.addWorksheet(RB);
  ws.getCell("A1").value = "Internal Estimate Rate Book (reference — do not edit)";
  ws.getCell("A1").font = fontTitle;
  ws.mergeCells("A1:D1");

  ["Material Group", "Wholesale $/sf", "Direct/Retail $/sf", "Notes"].forEach((h, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = h;
    styleHeader(c);
  });

  PRICE_GROUPS.forEach((g, i) => {
    const r = 4 + i;
    ws.getCell(r, 1).value = g;
    ws.getCell(r, 2).value = WHOLESALE_RATES[g];
    ws.getCell(r, 3).value = DIRECT_RATES[g];
    styleRef(ws.getCell(r, 1));
    styleRef(ws.getCell(r, 2));
    styleRef(ws.getCell(r, 3));
    ws.getCell(r, 4).value =
      g === "Remnant" ? "Not valid as sole OOC comparable group" : "Elite 100 / OOC pricing";
    styleRef(ws.getCell(r, 4));
  });

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 36;

  protectSheet(ws);
}

function buildMarshalTestingSheet() {
  const ws = wb.addWorksheet(MT);
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 14;
  ws.getColumn(7).width = 14;
  for (let c = 8; c <= 15; c++) ws.getColumn(c).width = 12;

  ws.getCell("A1").value = "Marshal Testing — Internal Estimate Quote Simulator";
  ws.getCell("A1").font = fontTitle;
  ws.mergeCells("A1:O1");
  ws.getCell("A2").value = "Edit yellow cells only. Blue = calculated. See START HERE for instructions.";
  ws.getCell("A2").font = fontNote;
  ws.mergeCells("A2:O2");

  // Quote settings
  ws.getCell("A4").value = "1. Quote Settings";
  ws.getCell("A4").font = fontHeader;
  labelInput(ws, "A5", "Pricing Mode");
  labelInput(ws, "A6", "Material Program Default");
  labelInput(ws, "A7", "Notes (optional)");
  styleInput(ws.getCell(SETTINGS.pricingMode));
  ws.getCell(SETTINGS.pricingMode).value = "Wholesale";
  styleInput(ws.getCell(SETTINGS.materialProgram));
  ws.getCell(SETTINGS.materialProgram).value = "Elite 100";
  styleInput(ws.getCell(SETTINGS.notes));

  addListValidation(ws, SETTINGS.pricingMode, "List_PricingMode");
  addListValidation(ws, SETTINGS.materialProgram, "List_MaterialProgram");
  if (!cfg.dataValidation) {
    ws.getCell("D5").value = "Allowed: Wholesale, Direct-Retail (see Dropdown Lists tab)";
    ws.getCell("D6").value = "Allowed: Elite 100, Out-of-Collection";
    ws.getCell("D5").font = fontNote;
    ws.getCell("D6").font = fontNote;
  }

  // Room inputs header
  ws.getCell(`A${ROOM_HEADER_ROW}`).value = "2. Room Inputs";
  ws.getCell(`A${ROOM_HEADER_ROW}`).font = fontHeader;

  const headers = [
    "#",
    "Room Name",
    "Room Type",
    "Program Override",
    "Resolved Program",
    "Price Group",
    "Color",
    "Countertop exact sf",
    "Backsplash exact sf",
    "FHB exact sf",
    "Sink cutouts",
    "Cooktop cutouts",
    "FHB outlets",
    "Tear-out?",
    "Vanity Program?"
  ];
  headers.forEach((h, i) => {
    const c = ws.getCell(ROOM_HEADER_ROW + 1, i + 1);
    c.value = h;
    styleHeader(c);
  });

  for (let i = 0; i < ROOM_COUNT; i++) {
    const row = mtRow(i);
    ws.getCell(`${R.num}${row}`).value = i + 1;
    styleRef(ws.getCell(`${R.num}${row}`));

    styleInput(ws.getCell(`${R.name}${row}`));
    styleInput(ws.getCell(`${R.type}${row}`));
    ws.getCell(`${R.type}${row}`).value = i === 0 ? "Kitchen" : "";
    styleInput(ws.getCell(`${R.override}${row}`));
    ws.getCell(`${R.override}${row}`).value = "Inherit";
    styleOutput(ws.getCell(`${R.resolved}${row}`));
    ws.getCell(`${R.resolved}${row}`).value = resolvedProgramFormula(row);
    styleInput(ws.getCell(`${R.group}${row}`));
    ws.getCell(`${R.group}${row}`).value = "Group Promo";
    styleInput(ws.getCell(`${R.color}${row}`));
    styleInput(ws.getCell(`${R.counter}${row}`));
    ws.getCell(`${R.counter}${row}`).value = i === 0 ? 10 : 0;
    styleInput(ws.getCell(`${R.backsplash}${row}`));
    styleInput(ws.getCell(`${R.fhb}${row}`));
    styleInput(ws.getCell(`${R.sinkQty}${row}`));
    styleInput(ws.getCell(`${R.cookQty}${row}`));
    styleInput(ws.getCell(`${R.outletQty}${row}`));
    styleInput(ws.getCell(`${R.tearout}${row}`));
    ws.getCell(`${R.tearout}${row}`).value = "No";
    styleInput(ws.getCell(`${R.vanityProg}${row}`));
    ws.getCell(`${R.vanityProg}${row}`).value = "No";

    addListValidation(ws, `${R.type}${row}`, "List_RoomType");
    addListValidation(ws, `${R.override}${row}`, "List_ProgramOverride");
    addListValidation(ws, `${R.group}${row}`, "List_PriceGroup");
    addListValidation(ws, `${R.tearout}${row}`, "List_YesNo");
    addListValidation(ws, `${R.vanityProg}${row}`, "List_YesNo");
  }

  // Calculated results mirror
  ws.getCell(`A${CALC_HEADER_ROW}`).value = "3. Calculated Room Results (from Room Calculations tab)";
  ws.getCell(`A${CALC_HEADER_ROW}`).font = fontHeader;

  const calcHeaders = [
    "#",
    "Room",
    "Chargeable counter sf",
    "Chargeable splash+FHB sf",
    "Rate $/sf",
    "Countertop material $",
    "Backsplash material $",
    "Material use tax $",
    "OOC adjustment $",
    "Add-ons $",
    "Vanity program $",
    "Room total $",
    "OOC group OK?"
  ];
  calcHeaders.forEach((h, i) => {
    styleHeader(ws.getCell(CALC_HEADER_ROW + 1, i + 1));
    ws.getCell(CALC_HEADER_ROW + 1, i + 1).value = h;
  });

  const rcCols = ["B", "G", "J", "E", "K", "L", "O", "Q", "S", "T", "U", "V"];
  for (let i = 0; i < ROOM_COUNT; i++) {
    const dst = CALC_FIRST_ROW + i;
    const src = mtRow(i);
    ws.getCell(`A${dst}`).value = i + 1;
    styleRef(ws.getCell(`A${dst}`));
    for (let c = 1; c < rcCols.length; c++) {
      const cell = ws.getCell(dst, c + 1);
      cell.value = { formula: `='${RC}'!${rcCols[c]}${src}` };
      styleOutput(cell);
    }
  }

  // Custom lines
  ws.getCell(`A${CUSTOM_HEADER_ROW}`).value = "Custom Lines (optional — up to 3)";
  ws.getCell(`A${CUSTOM_HEADER_ROW}`).font = fontHeader;
  ["Description", "Amount ($)", "Customer-facing?"].forEach((h, i) => {
    styleHeader(ws.getCell(CUSTOM_HEADER_ROW + 1, i + 2));
    ws.getCell(CUSTOM_HEADER_ROW + 1, i + 2).value = h;
  });
  for (let i = 0; i < 3; i++) {
    const row = CUSTOM_FIRST_ROW + i;
    styleInput(ws.getCell(`B${row}`));
    styleInput(ws.getCell(`C${row}`));
    styleInput(ws.getCell(`D${row}`));
    ws.getCell(`D${row}`).value = "No";
    addListValidation(ws, `D${row}`, "List_YesNo");
  }

  // Customer summary block
  ws.getCell(`A${SUMMARY_HEADER_ROW}`).value = "4. Customer Summary";
  ws.getCell(`A${SUMMARY_HEADER_ROW}`).font = fontHeader;
  const summaryLabels = [
    ["Countertop material (exact)", `'${CS}'!B5`],
    ["Countertop material (customer display)", `'${CS}'!C5`],
    ["Backsplash material (exact)", `'${CS}'!B6`],
    ["Backsplash material (customer display)", `'${CS}'!C6`],
    ["Add-ons (exact)", `'${CS}'!B7`],
    ["Add-ons (customer display)", `'${CS}'!C7`],
    ["Customer-facing custom lines (display)", `'${CS}'!C8`],
    ["Project total (exact)", `'${CS}'!B9`],
    ["Customer display total", `'${CS}'!C10`],
    ["Rounding delta (display − exact)", `'${CS}'!B11`]
  ];
  summaryLabels.forEach(([label, ref], i) => {
    const row = SUMMARY_HEADER_ROW + 1 + i;
    ws.getCell(`A${row}`).value = label;
    const c = ws.getCell(`B${row}`);
    c.value = { formula: `=${ref}` };
    styleOutput(c);
    if (label.includes("display total")) c.font = { bold: true, size: 12 };
  });

  // OOC coverage
  ws.getCell(`A${COVERAGE_HEADER_ROW}`).value = "5. Out-of-Collection Material Cost Coverage (internal — does not change quote total)";
  ws.getCell(`A${COVERAGE_HEADER_ROW}`).font = fontHeader;
  ws.mergeCells(`A${COVERAGE_HEADER_ROW}:F${COVERAGE_HEADER_ROW}`);

  const covLabels = [
    ["OOC material / color (label)", null, true],
    ["Slab width (inches)", null, true],
    ["Slab height (inches)", null, true],
    ["Usable sqft per slab", null, true],
    ["Cost per sqft ($)", null, true],
    ["Slabs needed", null, true],
    ["Assigned project sqft", null, true],
    ["Target material multiplier", DEFAULT_TARGET_MATERIAL_MULTIPLIER, true],
    ["Purchased sqft", `=IF(B${COVERAGE_HEADER_ROW + 9}>0,B${COVERAGE_HEADER_ROW + 5}*B${COVERAGE_HEADER_ROW + 9},0)`, false],
    ["Estimated material cost ($)", `=IF(B${COVERAGE_HEADER_ROW + 10}>0,B${COVERAGE_HEADER_ROW + 10}*B${COVERAGE_HEADER_ROW + 6},0)`, false],
    ["Quoted OOC material revenue ($)", `='${OOC}'!B3`, false],
    ["Coverage dollars (revenue − cost)", `=B${COVERAGE_HEADER_ROW + 12}-B${COVERAGE_HEADER_ROW + 11}`, false],
    ["Coverage multiplier (revenue ÷ cost)", `=IF(B${COVERAGE_HEADER_ROW + 11}>0,B${COVERAGE_HEADER_ROW + 12}/B${COVERAGE_HEADER_ROW + 11},"")`, false],
    ["Raw material cost covered?", null, false],
    ["Target multiplier met?", null, false]
  ];

  let covRow = COVERAGE_HEADER_ROW + 1;
  for (const [label, defaultOrFormula, isInput] of covLabels) {
    ws.getCell(`A${covRow}`).value = label;
    const b = ws.getCell(`B${covRow}`);
    if (isInput) {
      styleInput(b);
      if (defaultOrFormula != null && typeof defaultOrFormula === "number") b.value = defaultOrFormula;
    } else {
      styleOutput(b);
      if (typeof defaultOrFormula === "string") b.value = { formula: defaultOrFormula };
    }
    covRow++;
  }

  // Status formulas (last two rows)
  const statusRawRow = covRow - 2;
  const statusTargetRow = covRow - 1;
  ws.getCell(`B${statusRawRow}`).value = {
    formula: `=IF(B${COVERAGE_HEADER_ROW + 13}="","",IF(B${COVERAGE_HEADER_ROW + 13}>=1,"Covered","Short"))`
  };
  ws.getCell(`B${statusTargetRow}`).value = {
    formula: `=IF(B${COVERAGE_HEADER_ROW + 13}="","",IF(B${COVERAGE_HEADER_ROW + 13}>=B${COVERAGE_HEADER_ROW + 8},"Good",IF(B${COVERAGE_HEADER_ROW + 13}>=1,"Tight","Review Needed")))`
  };
  styleOutput(ws.getCell(`B${statusRawRow}`));
  styleOutput(ws.getCell(`B${statusTargetRow}`));

  // Conditional formatting via comments — ExcelJS CF is limited; color status in generator with note
  ws.getCell(`C${statusRawRow}`).value = "(Green=Covered, Red=Short)";
  ws.getCell(`C${statusTargetRow}`).value = "(Green=Good, Orange=Tight, Red=Review Needed)";
  ws.getCell(`C${statusRawRow}`).font = fontNote;
  ws.getCell(`C${statusTargetRow}`).font = fontNote;

  protectSheet(ws);
}

function labelInput(ws, addr, text) {
  ws.getCell(addr).value = text;
}

function resolvedProgramFormula(row) {
  return {
    formula: `=IF(${R.vanityProg}${row}="Yes","Elite 100",IF(${R.override}${row}="Inherit",${SETTINGS.materialProgram},${R.override}${row}))`
  };
}

function buildRoomInputsSheet() {
  const ws = wb.addWorksheet("Room Inputs");
  ws.getCell("A1").value = "Room Inputs — mirrors Marshal Testing (linked)";
  ws.getCell("A1").font = fontTitle;
  ws.getCell("A2").value = "Edit inputs on Marshal Testing tab. This tab is for review/export.";
  ws.getCell("A2").font = fontNote;

  const headers = [
    "#", "Room Name", "Type", "Override", "Resolved", "Group", "Color",
    "Counter sf", "Backsplash sf", "FHB sf", "Sink", "Cook", "Outlets", "Tear-out", "Vanity Prog?"
  ];
  headers.forEach((h, i) => {
    styleHeader(ws.getCell(4, i + 1));
    ws.getCell(4, i + 1).value = h;
  });

  for (let i = 0; i < ROOM_COUNT; i++) {
    const row = ROOM_FIRST_ROW + i;
    ws.getCell(`A${row}`).value = i + 1;
    styleRef(ws.getCell(`A${row}`));
    const cols = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
    cols.forEach((col) => {
      const cell = ws.getCell(`${col}${row}`);
      cell.value = { formula: `='${MT}'!${col}${row}` };
      styleOutput(cell);
    });
  }
  protectSheet(ws);
}

function buildRoomCalculationsSheet() {
  const ws = wb.addWorksheet(RC);
  ws.getCell("A1").value = "Room Calculations — formula engine (do not edit blue cells)";
  ws.getCell("A1").font = fontTitle;

  const headers = [
    "#", "Room", "Resolved", "Group", "Rate", "Exact counter", "Chargeable counter",
    "Exact splash", "Exact FHB", "Chargeable splash+FHB",
    "CT material $", "BS material $", "CT tax $", "BS tax $", "Total tax $",
    "Post-tax material $", "OOC $", "Room material $", "Add-ons $", "Vanity $", "Room total $", "OOC group OK?"
  ];
  headers.forEach((h, i) => {
    styleHeader(ws.getCell(3, i + 1));
    ws.getCell(3, i + 1).value = h;
  });

  for (let i = 0; i < ROOM_COUNT; i++) {
    const row = mtRow(i);
    const m = `'${MT}'!`;

    ws.getCell(`A${row}`).value = i + 1;
    styleRef(ws.getCell(`A${row}`));

    setFormula(ws, `B${row}`, `=${m}${R.name}${row}`, true);
    setFormula(ws, `C${row}`, `=${m}${R.resolved}${row}`, true);
    setFormula(ws, `D${row}`, `=${m}${R.group}${row}`, true);
    setFormula(ws, `E${row}`, rateFormula(row), true);
    setFormula(ws, `F${row}`, `=${m}${R.counter}${row}`, true);
    setFormula(ws, `G${row}`, chargeableFormula(`${m}${R.counter}${row}`), true);
    setFormula(ws, `H${row}`, `=${m}${R.backsplash}${row}`, true);
    setFormula(ws, `I${row}`, `=${m}${R.fhb}${row}`, true);
    setFormula(ws, `J${row}`, chargeableFormula(`(${m}${R.backsplash}${row}+${m}${R.fhb}${row})`), true);

    // Material $ — zero when vanity program
    setFormula(
      ws,
      `K${row}`,
      `=IF(${m}${R.vanityProg}${row}="Yes",0,ROUND(G${row}*E${row},2))`,
      true
    );
    setFormula(
      ws,
      `L${row}`,
      `=IF(${m}${R.vanityProg}${row}="Yes",0,ROUND(J${row}*E${row},2))`,
      true
    );
    setFormula(ws, `M${row}`, `=IF(${m}${R.vanityProg}${row}="Yes",0,ROUND(K${row}*${cfg.taxRate},2))`, true);
    setFormula(ws, `N${row}`, `=IF(${m}${R.vanityProg}${row}="Yes",0,ROUND(L${row}*${cfg.taxRate},2))`, true);
    setFormula(ws, `O${row}`, `=M${row}+N${row}`, true);
    setFormula(ws, `P${row}`, `=K${row}+L${row}+O${row}`, true);
    setFormula(ws, `Q${row}`, oocPremiumFormula(row), true);
    setFormula(ws, `R${row}`, `=IF(${m}${R.vanityProg}${row}="Yes",0,P${row}+Q${row})`, true);
    setFormula(ws, `S${row}`, `='${ADD}'!${colLetter(ADDON_CATALOG.length + 2)}${row}`, true);
    setFormula(ws, `T${row}`, `=IF(${m}${R.vanityProg}${row}="Yes",'${VAN}'!L${row},0)`, true);
    setFormula(ws, `U${row}`, `=R${row}+S${row}+T${row}`, true);
    setFormula(ws, `V${row}`, oocValidFormula(row), true);
  }

  ws.getCell(`A${ROOM_LAST_ROW + 2}`).value = "Project live total (exact)";
  setFormula(
    ws,
    `B${ROOM_LAST_ROW + 2}`,
    `=SUM(U${ROOM_FIRST_ROW}:U${ROOM_LAST_ROW})+SUM('${MT}'!C${CUSTOM_FIRST_ROW}:C${CUSTOM_LAST_ROW})`,
    true
  );
  ws.getCell(`B${ROOM_LAST_ROW + 2}`).font = { bold: true };

  protectSheet(ws);
}

function setFormula(ws, addr, formula, isOutput) {
  const cell = ws.getCell(addr);
  cell.value = { formula };
  if (isOutput) styleOutput(cell);
}

function chargeableFormula(exactRef) {
  return `=IF(${exactRef}<=0,0,IF(ABS(${exactRef}-ROUND(${exactRef},0))<0.005,ROUND(${exactRef},0),CEILING(${exactRef},1)))`;
}

function rateFormula(row) {
  const m = `'${MT}'!`;
  const direct = cfg.indexMatch(`${m}${R.group}${row}`, cfg.rateBookDirect);
  const wholesale = cfg.indexMatch(`${m}${R.group}${row}`, cfg.rateBookWholesale);
  return `=IF(${m}${R.vanityProg}${row}="Yes",0,IF(${m}${SETTINGS.pricingMode}="Direct-Retail",${direct},${wholesale}))`;
}

function oocPremiumFormula(row) {
  const m = `'${MT}'!`;
  return `=IF(${m}${R.vanityProg}${row}="Yes",0,IF(C${row}="Out-of-Collection",ROUND(P${row}*IF(${m}${SETTINGS.pricingMode}="Direct-Retail",${cfg.oocDirect},${cfg.oocWholesale}),2),0))`;
}

function oocValidFormula(row) {
  const m = `'${MT}'!`;
  return `=IF(C${row}<>"Out-of-Collection","OK",IF(OR(${m}${R.group}${row}="Group Promo",${m}${R.group}${row}="Group A",${m}${R.group}${row}="Group B",${m}${R.group}${row}="Group C",${m}${R.group}${row}="Group D",${m}${R.group}${row}="Group E",${m}${R.group}${row}="Group F"),"OK","Review"))`;
}

function vanityLookup(row, range) {
  const inner = `INDEX(${range},MATCH(D${row},N$7:N$20,0))`;
  return cfg.isGoogle ? `IFERROR(${inner},0)` : inner;
}

function buildAddonsSheet() {
  const ws = wb.addWorksheet(ADD);
  ws.getCell("A1").value = "Add-ons — per-room quantities (yellow = edit)";
  ws.getCell("A1").font = fontTitle;

  // Unit price row
  ws.getCell("A2").value = cfg.hiddenAddonPriceRow ? "" : "Unit price $";
  if (!cfg.hiddenAddonPriceRow) styleHeader(ws.getCell("A2"));
  ADDON_CATALOG.forEach((a, i) => {
    const c = ws.getCell(2, i + 2);
    c.value = a.price;
    if (!cfg.hiddenAddonPriceRow) styleRef(c);
  });
  if (cfg.hiddenAddonPriceRow) ws.getRow(2).hidden = true;

  ws.getCell("A3").value = "Room";
  styleHeader(ws.getCell("A3"));
  ADDON_CATALOG.forEach((a, i) => {
    const c = ws.getCell(3, i + 2);
    c.value = `${a.label} ($${a.price})`;
    styleHeader(c);
  });
  const totalCol = ADDON_CATALOG.length + 2;
  ws.getCell(3, totalCol).value = "Room add-ons total $";
  styleHeader(ws.getCell(3, totalCol));

  for (let i = 0; i < ROOM_COUNT; i++) {
    const row = mtRow(i);
    const m = `'${MT}'!`;
    ws.getCell(`A${row}`).value = { formula: `=${m}${R.name}${row}` };
    styleOutput(ws.getCell(`A${row}`));

    ADDON_CATALOG.forEach((a, j) => {
      const col = j + 2;
      const cell = ws.getCell(row, col);
      // Pre-link Marshal Testing sink/cook/outlet for first items
      if (a.id === "qty-sink") {
        cell.value = { formula: `=${m}${R.sinkQty}${row}` };
        styleOutput(cell);
      } else if (a.id === "qty-cook") {
        cell.value = { formula: `=${m}${R.cookQty}${row}` };
        styleOutput(cell);
      } else if (a.id === "qty-outlet") {
        cell.value = { formula: `=IF(${m}${R.fhb}${row}>0,${m}${R.outletQty}${row},0)` };
        styleOutput(cell);
      } else {
        styleInput(cell);
        cell.value = 0;
      }
    });

    // Tear-out handled separately in total formula
    const startCol = colLetter(2);
    const endCol = colLetter(ADDON_CATALOG.length + 1);
    const totalCell = ws.getCell(row, totalCol);
    totalCell.value = {
      formula: `=SUMPRODUCT(${startCol}${row}:${endCol}${row},${startCol}$2:${endCol}$2)+IF(${m}${R.tearout}${row}="Yes",${cfg.tearout},0)`
    };
    styleOutput(totalCell);
  }

  protectSheet(ws);
}

function buildVanityProgramSheet() {
  const ws = wb.addWorksheet(VAN);
  ws.getCell("A1").value = "Vanity Program 2026 — fixed pricing (excluded from 2% tax & OOC)";
  ws.getCell("A1").font = fontTitle;
  ws.getCell("A2").value = `Kitchen qualifying sf threshold: ${VANITY_TIER_THRESHOLD_SQFT} sf (auto-sum non-vanity counter sf)`;
  ws.getCell("A2").font = fontNote;

  ws.getCell("A4").value = "Qualifying kitchen counter sf (project)";
  setFormula(
    ws,
    "B4",
    `=SUMIF('${MT}'!${R.vanityProg}${ROOM_FIRST_ROW}:${R.vanityProg}${ROOM_LAST_ROW},"No",'${MT}'!${R.counter}${ROOM_FIRST_ROW}:${R.counter}${ROOM_LAST_ROW})`,
    true
  );

  const headers = [
    "#", "Room", "Vanity Program?", "Size Code", "Qty", "Tier Mode", "Sink Type", "Extra Trips",
    "Base Unit $", "Sink Upgrade $", "Extra Trips $", "Vanity Exact $", "Vanity Display $ (nearest $5)"
  ];
  headers.forEach((h, i) => {
    styleHeader(ws.getCell(6, i + 1));
    ws.getCell(6, i + 1).value = h;
  });

  // Rate lookup table on sheet (cols N-O)
  ws.getCell("N6").value = "Code";
  ws.getCell("O6").value = "Over35";
  ws.getCell("P6").value = "Under35";
  ws.getCell("Q6").value = "Bowls";
  styleHeader(ws.getCell("N6"));
  styleHeader(ws.getCell("O6"));
  styleHeader(ws.getCell("P6"));
  styleHeader(ws.getCell("Q6"));
  VANITY_PROGRAM_2026.forEach((v, i) => {
    const r = 7 + i;
    ws.getCell(`N${r}`).value = v.code;
    ws.getCell(`O${r}`).value = v.over35;
    ws.getCell(`P${r}`).value = v.under35;
    ws.getCell(`Q${r}`).value = v.bowls;
    styleRef(ws.getCell(`N${r}`));
    styleRef(ws.getCell(`O${r}`));
    styleRef(ws.getCell(`P${r}`));
    styleRef(ws.getCell(`Q${r}`));
  });

  for (let i = 0; i < ROOM_COUNT; i++) {
    const row = mtRow(i);
    const m = `'${MT}'!`;
    ws.getCell(`A${row}`).value = i + 1;
    styleRef(ws.getCell(`A${row}`));
    setFormula(ws, `B${row}`, `=${m}${R.name}${row}`, true);
    setFormula(ws, `C${row}`, `=${m}${R.vanityProg}${row}`, true);

    styleInput(ws.getCell(`D${row}`));
    ws.getCell(`D${row}`).value = "37_S";
    addListValidation(ws, `D${row}`, "List_VanitySize");

    styleInput(ws.getCell(`E${row}`));
    ws.getCell(`E${row}`).value = 1;
    styleInput(ws.getCell(`F${row}`));
    ws.getCell(`F${row}`).value = "Auto";
    addListValidation(ws, `F${row}`, "List_VanityTier");
    styleInput(ws.getCell(`G${row}`));
    ws.getCell(`G${row}`).value = "Oval White";
    addListValidation(ws, `G${row}`, "List_SinkType");
    styleInput(ws.getCell(`H${row}`));
    ws.getCell(`H${row}`).value = 0;

    // Base unit from table + tier
    const overIdx = vanityLookup(row, "O$7:O$20");
    const underIdx = vanityLookup(row, "P$7:P$20");
    setFormula(
      ws,
      `I${row}`,
      `=IF(C${row}<>"Yes",0,IF(F${row}="${cfg.tierOver35}",${overIdx},IF(F${row}="${cfg.tierUnder35}",${underIdx},IF($B$4>=${cfg.vanityThreshold},${overIdx},${underIdx}))))`,
      true
    );
    setFormula(
      ws,
      `J${row}`,
      `=IF(C${row}<>"Yes",0,IF(G${row}="Oval White",0,IF(G${row}="Oval Bisque",10,25))*${vanityLookup(row, "Q$7:Q$20")})`,
      true
    );
    setFormula(ws, `K${row}`, `=IF(C${row}<>"Yes",0,H${row}*${cfg.vanityTrip})`, true);
    setFormula(ws, `L${row}`, `=IF(C${row}<>"Yes",0,ROUND((I${row}+J${row})*E${row}+K${row},2))`, true);
    setFormula(ws, `M${row}`, `=IF(L${row}<=0,0,ROUND(L${row}/5,0)*5)`, true);
  }

  protectSheet(ws);
}

function buildOutOfCollectionSheet() {
  const ws = wb.addWorksheet(OOC);
  ws.getCell("A1").value = "Out-of-Collection — per-room detail (internal)";
  ws.getCell("A1").font = fontTitle;

  ws.getCell("A3").value = "Total quoted OOC material revenue ($)";
  setFormula(
    ws,
    "B3",
    `=SUMIF('${RC}'!C${ROOM_FIRST_ROW}:C${ROOM_LAST_ROW},"Out-of-Collection",'${RC}'!R${ROOM_FIRST_ROW}:R${ROOM_LAST_ROW})`,
    true
  );

  const headers = [
    "#", "Room", "Resolved", "Group", "Eligible post-tax $", "OOC %", "OOC premium $", "Group valid?"
  ];
  headers.forEach((h, i) => {
    styleHeader(ws.getCell(5, i + 1));
    ws.getCell(5, i + 1).value = h;
  });

  for (let i = 0; i < ROOM_COUNT; i++) {
    const row = mtRow(i);
    ws.getCell(`A${row}`).value = i + 1;
    styleRef(ws.getCell(`A${row}`));
    setFormula(ws, `B${row}`, `='${MT}'!${R.name}${row}`, true);
    setFormula(ws, `C${row}`, `='${RC}'!C${row}`, true);
    setFormula(ws, `D${row}`, `='${RC}'!D${row}`, true);
    setFormula(ws, `E${row}`, `=IF('${RC}'!C${row}="Out-of-Collection",'${RC}'!P${row},0)`, true);
    setFormula(
      ws,
      `F${row}`,
      `=IF('${RC}'!C${row}="Out-of-Collection",IF('${MT}'!${SETTINGS.pricingMode}="Direct-Retail",${cfg.oocDirect},${cfg.oocWholesale}),0)`,
      true
    );
    setFormula(ws, `G${row}`, `=IF('${RC}'!C${row}="Out-of-Collection",'${RC}'!Q${row},0)`, true);
    setFormula(ws, `H${row}`, `='${RC}'!V${row}`, true);
  }

  protectSheet(ws);
}

function buildCustomerSummarySheet() {
  const ws = wb.addWorksheet(CS);
  ws.getCell("A1").value = "Customer Summary — exact vs display (no forbidden OOC language on labels)";
  ws.getCell("A1").font = fontTitle;
  ws.getCell("A2").value = "Display rounding: positive amounts round UP to next $5. Credits stay exact.";
  ws.getCell("A2").font = fontNote;

  ws.getCell("A4").value = "Line";
  ws.getCell("B4").value = "Exact $";
  ws.getCell("C4").value = "Customer display $";
  styleHeader(ws.getCell("A4"));
  styleHeader(ws.getCell("B4"));
  styleHeader(ws.getCell("C4"));

  buildCustomerSummaryFormulas(ws);
  protectSheet(ws);
}

function buildCustomerSummaryFormulas(ws) {
  const rc = `'${RC}'!`;
  const mt = `'${MT}'!`;
  const van = `'${VAN}'!`;

  // Countertop exact: sum CT material + CT tax + proportional OOC counter share + vanity display + internal-only custom
  // Simplified v1: countertop exact = SUM(K+M) + vanity display sum + internal custom + OOC counter allocation
  // OOC counter allocation: for OOC rooms, premium split by K+M vs P ratio per row — use helper columns on CS sheet cols E-F

  ws.getCell("D4").value = "Helper: CT+tax per room";
  ws.getCell("E4").value = "Helper: OOC counter share";
  for (let i = 0; i < ROOM_COUNT; i++) {
    const row = mtRow(i);
    setFormula(ws, `D${row}`, `=${rc}K${row}+${rc}M${row}`, true);
    setFormula(
      ws,
      `E${row}`,
      `=IF(${rc}C${row}="Out-of-Collection",IF(${rc}P${row}>0,${rc}Q${row}*(${rc}K${row}+${rc}M${row})/${rc}P${row},${rc}Q${row}),0)`,
      true
    );
  }

  ws.getCell("A5").value = "Countertop material";
  setFormula(
    ws,
    "B5",
    `=SUM(D${ROOM_FIRST_ROW}:D${ROOM_LAST_ROW})+SUM(E${ROOM_FIRST_ROW}:E${ROOM_LAST_ROW})+SUMIF(${mt}${R.vanityProg}${ROOM_FIRST_ROW}:${R.vanityProg}${ROOM_LAST_ROW},"Yes",${van}M${ROOM_FIRST_ROW}:M${ROOM_LAST_ROW})+SUMIF(${mt}D${CUSTOM_FIRST_ROW}:D${CUSTOM_LAST_ROW},"No",${mt}C${CUSTOM_FIRST_ROW}:C${CUSTOM_LAST_ROW})`,
    true
  );
  setFormula(ws, "C5", displayRoundFormula("B5"), true);

  ws.getCell("G4").value = "Helper: BS+tax";
  ws.getCell("H4").value = "Helper: OOC BS share";
  for (let i = 0; i < ROOM_COUNT; i++) {
    const row = mtRow(i);
    setFormula(ws, `G${row}`, `=${rc}L${row}+${rc}N${row}`, true);
    setFormula(
      ws,
      `H${row}`,
      `=IF(${rc}C${row}="Out-of-Collection",IF(${rc}P${row}>0,${rc}Q${row}*(${rc}L${row}+${rc}N${row})/${rc}P${row},0),0)`,
      true
    );
  }

  ws.getCell("A6").value = "Backsplash material";
  setFormula(
    ws,
    "B6",
    `=SUM(G${ROOM_FIRST_ROW}:G${ROOM_LAST_ROW})+SUM(H${ROOM_FIRST_ROW}:H${ROOM_LAST_ROW})`,
    true
  );
  setFormula(ws, "C6", displayRoundFormula("B6"), true);

  ws.getCell("A7").value = "Add-ons";
  setFormula(ws, "B7", `=SUM('${ADD}'!${colLetter(ADDON_CATALOG.length + 2)}${ROOM_FIRST_ROW}:${colLetter(ADDON_CATALOG.length + 2)}${ROOM_LAST_ROW})`, true);
  setFormula(ws, "C7", displayRoundFormula("B7"), true);

  ws.getCell("A8").value = "Customer-facing custom lines";
  setFormula(
    ws,
    "B8",
    `=SUMIF(${mt}D${CUSTOM_FIRST_ROW}:D${CUSTOM_LAST_ROW},"Yes",${mt}C${CUSTOM_FIRST_ROW}:C${CUSTOM_LAST_ROW})`,
    true
  );
  setFormula(ws, "C8", displayRoundFormula("B8"), true);

  ws.getCell("A9").value = "Project total (exact)";
  setFormula(ws, "B9", `=B5+B6+B7+B8`, true);

  ws.getCell("A10").value = "Customer display total";
  setFormula(ws, "C10", `=C5+C6+C7+C8`, true);
  ws.getCell("C10").font = { bold: true, size: 12 };

  ws.getCell("A11").value = "Rounding delta (display − exact)";
  setFormula(ws, "B11", `=C10-B9`, true);

  if (cfg.hiddenHelperColumns) {
    ws.getColumn(4).hidden = true;
    ws.getColumn(5).hidden = true;
    ws.getColumn(7).hidden = true;
    ws.getColumn(8).hidden = true;
  } else {
    ws.getCell("D4").font = fontNote;
    ws.getCell("E4").font = fontNote;
    ws.getCell("G4").font = fontNote;
    ws.getCell("H4").font = fontNote;
  }
}

function displayRoundFormula(cellRef) {
  return `=IF(${cellRef}<=0,0,IF(${cellRef}<0,${cellRef},CEILING(${cellRef}/5,1)*5))`;
}

function buildScenarioTestingSheet() {
  const ws = wb.addWorksheet("Scenario Testing");
  ws.getCell("A1").value = "Starter scenarios — enter values on Marshal Testing to match these examples";
  ws.getCell("A1").font = fontTitle;

  const scenarios = [
    ["1", "Elite 100 Wholesale basic kitchen", "Pricing=Wholesale, Program=Elite 100, Kitchen 10sf counter Group Promo"],
    ["2", "Elite 100 Direct/Retail basic kitchen", "Pricing=Direct-Retail, Program=Elite 100, Kitchen 10sf counter Group Promo"],
    ["3", "OOC Wholesale all rooms", "Pricing=Wholesale, Program=Out-of-Collection, 10sf Promo"],
    ["4", "OOC Direct/Retail all rooms", "Pricing=Direct-Retail, Program=Out-of-Collection, 10sf Promo"],
    ["5", "Mixed: kitchen Elite 100 + wet bar OOC", "Default Elite 100, Wet Bar override Out-of-Collection, 8sf Group C"],
    ["6", "Backsplash/FHB scenario", "10sf counter + 4sf backsplash + 2sf FHB, Group Promo"],
    ["7", "Add-ons/cutouts", "Kitchen 10sf + 2 sink cutouts + tear-out Yes"],
    ["8", "OOC coverage — extra slab needed", "OOC room 20sf, coverage: 1 slab × 45 usable sf, cost $18/sf, target mult 2.25"]
  ];

  ws.getCell("A3").value = "#";
  ws.getCell("B3").value = "Scenario";
  ws.getCell("C3").value = "Setup notes";
  styleHeader(ws.getCell("A3"));
  styleHeader(ws.getCell("B3"));
  styleHeader(ws.getCell("C3"));

  scenarios.forEach(([n, name, note], i) => {
    const r = 4 + i;
    ws.getCell(`A${r}`).value = n;
    ws.getCell(`B${r}`).value = name;
    ws.getCell(`C${r}`).value = note;
    styleRef(ws.getCell(`A${r}`));
    styleRef(ws.getCell(`B${r}`));
    styleRef(ws.getCell(`C${r}`));
  });

  ws.getCell("A13").value = "Expected wholesale 10sf Promo Elite (room only)";
  ws.getCell("B13").value = { formula: `=ROUND(10*45+10*45*${cfg.taxRate},2)` };
  styleOutput(ws.getCell("B13"));

  protectSheet(ws);
}

function buildStartHereSheet() {
  const ws = wb.addWorksheet("START HERE");
  ws.getColumn(1).width = 90;

  const regenCmd = cfg.isGoogle
    ? "node tools/quote-math-simulator/buildGoogleSheetsWorkbook.mjs"
    : "node tools/quote-math-simulator/buildQuoteMathWorkbook.mjs";

  const lines = [
    "Internal Estimate Quote Math Simulator",
    "",
    ...(cfg.isGoogle
      ? [
          "Google Sheets-compatible version",
          "• Simplified for Google Drive / Google Sheets — no sheet protection, no named ranges, no hidden tabs.",
          "• Type allowed values manually (see Dropdown Lists tab). Excel version is preferred for full features.",
          ""
        ]
      : []),
    "What this is",
    "• This workbook simulates Internal Estimate quote math for testing and understanding.",
    "• It is NOT the production quoting tool. Internal Estimate remains the source of truth.",
    "",
    "How to use",
    "• Go to the Marshal Testing tab.",
    "• Edit YELLOW cells only (dropdowns and numbers).",
    "• BLUE cells are calculated — do not overwrite.",
    "• GRAY tabs (Rate Book) are reference tables.",
    "",
    "Color legend",
    "• Yellow = your inputs",
    "• Blue = calculated outputs",
    "• Gray = reference / headers",
    "• Green / Orange / Red = coverage status (internal review only)",
    "",
    "Warnings",
    "• Coverage checks and OOC details are internal — never copy formula language to customers.",
    "• Do not use words like premium, markup, +10%, +15% on customer estimates.",
    "",
    "v1 simplifications",
    "• Enter manual square footage (not guided-shape geometry).",
    "• One price group per room.",
    "• Custom lines: 3 optional rows (internal fold is simplified).",
    "",
    `Room slots: ${ROOM_COUNT} (configurable in tools/quote-math-simulator/constants.mjs)`,
    "",
    `Regenerate workbook: ${regenCmd}`
  ];

  lines.forEach((line, i) => {
    const cell = ws.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = fontTitle;
  });

  protectSheet(ws);
}

function buildAuditMapSheet() {
  const ws = wb.addWorksheet("Audit Map");
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 50;
  ws.getColumn(3).width = 40;

  ws.getCell("A1").value = "Workbook ↔ Internal Estimate logic map";
  ws.getCell("A1").font = fontTitle;

  const rows = [
    ["Topic", "Workbook location", "Quote tool reference"],
    ["Pricing mode", "Marshal Testing B5", "internalMaterialBasis wholesale | direct"],
    ["Rate lookup", "Room Calculations col E", "materialRateForInternalBasis / PROTOTYPE_TIERS vs ESF_DIRECT"],
    ["Chargeable sqft", "Room Calculations G, J", "chargeableCounterSqftFromExact / chargeableSplashSqftFromExact"],
    ["Material use tax 2%", "Room Calculations M,N,O", "computeInternalEstimateMaterialUseTaxAmounts"],
    ["OOC premium", "Room Calculations Q", "computeOutOfCollectionPremiumAmounts on post-tax eligible $"],
    ["Resolved program", "Marshal Testing col E", "resolveRoomMaterialProgram"],
    ["Add-ons", "Add-ons tab", "ADDON_CATALOG + TEAROUT"],
    ["Vanity program", "Vanity Program tab", "priceVanityProgram2026 — excluded from tax/OOC"],
    ["Customer display rounding", "Customer Summary col C", "roundCustomerDisplay — ceil to $5"],
    ["Custom lines", "Marshal Testing rows 3 custom", "splitInternalEstimateCustomLines (simplified v1)"],
    ["OOC coverage check", "Marshal Testing section 5", "Internal only — NOT in production quote total"],
    ["Target multiplier default", "Coverage B cell = 2.25", "Marshal benchmark — configurable input"]
  ];

  rows.forEach((row, i) => {
    const r = 3 + i;
    row.forEach((val, j) => {
      const c = ws.getCell(r, j + 1);
      c.value = val;
      if (i === 0) styleHeader(c);
      else styleRef(c);
    });
  });

  protectSheet(ws);
}
