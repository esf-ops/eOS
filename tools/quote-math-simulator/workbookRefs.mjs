/**
 * Formula reference strings for workbook variants.
 * Excel uses workbook defined names; Google Sheets uses direct A1 cross-sheet refs.
 */
import {
  DEFAULT_TARGET_MATERIAL_MULTIPLIER,
  MATERIAL_USE_TAX_PERCENT,
  OOC_DIRECT_PERCENT,
  OOC_WHOLESALE_PERCENT,
  TEAROUT_PRICE,
  VANITY_EXTRA_TRIP_PRICE,
  VANITY_TIER_THRESHOLD_SQFT
} from "./constants.mjs";

export function createVariantConfig(variant) {
  const isGoogle = variant === "google";
  const RB = "Rate Book";
  const CONST = isGoogle ? "Constants" : "_Constants";

  const taxRate = isGoogle ? `'${CONST}'!$B$1` : "Const_TaxRate";
  const oocWholesale = isGoogle ? `'${CONST}'!$B$2` : "Const_OocWholesale";
  const oocDirect = isGoogle ? `'${CONST}'!$B$3` : "Const_OocDirect";
  const tearout = isGoogle ? `'${CONST}'!$B$4` : "Const_Tearout";
  const vanityThreshold = isGoogle ? `'${CONST}'!$B$5` : "Const_VanityThreshold";
  const vanityTrip = isGoogle ? `'${CONST}'!$B$6` : "Const_VanityTrip";
  const rateBookGroups = isGoogle ? `'${RB}'!$A$4:$A$11` : "RateBook_Groups";
  const rateBookWholesale = isGoogle ? `'${RB}'!$B$4:$B$11` : "RateBook_Wholesale";
  const rateBookDirect = isGoogle ? `'${RB}'!$C$4:$C$11` : "RateBook_Direct";

  return {
    variant,
    isGoogle,
    protectSheets: !isGoogle,
    useNamedRanges: !isGoogle,
    dataValidation: !isGoogle,
    hiddenSupportSheets: !isGoogle,
    hiddenHelperColumns: !isGoogle,
    hiddenAddonPriceRow: !isGoogle,
    includeRoomInputs: !isGoogle,
    constantsSheetName: CONST,
    listsSheetName: isGoogle ? "Dropdown Lists" : "_Lists",
    tierOver35: isGoogle ? "Kitchen over 35 sf" : "Kitchen ≥35 sf",
    tierUnder35: isGoogle ? "Kitchen under 35 sf" : "Kitchen <35 sf",
    taxRate,
    oocWholesale,
    oocDirect,
    tearout,
    vanityThreshold,
    vanityTrip,
    rateBookGroups,
    rateBookWholesale,
    rateBookDirect,
    indexMatch(groupRef, rateRange) {
      const inner = `INDEX(${rateRange},MATCH(${groupRef},${rateBookGroups},0))`;
      return isGoogle ? `IFERROR(${inner},0)` : inner;
    }
  };
}

export function registerNamedRanges(wb, cfg) {
  if (!cfg.useNamedRanges) return;
  const RB = "Rate Book";
  const L = cfg.listsSheetName;
  const C = cfg.constantsSheetName;
  wb.definedNames.add(`'${L}'!$B$1:$C$1`, "List_PricingMode");
  wb.definedNames.add(`'${L}'!$B$2:$C$2`, "List_MaterialProgram");
  wb.definedNames.add(`'${L}'!$B$3:$D$3`, "List_ProgramOverride");
  wb.definedNames.add(`'${L}'!$B$4:$H$4`, "List_RoomType");
  wb.definedNames.add(`'${L}'!$B$5:$C$5`, "List_YesNo");
  wb.definedNames.add(`'${L}'!$B$6:$D$6`, "List_VanityTier");
  wb.definedNames.add(`'${L}'!$B$7:$E$7`, "List_SinkType");
  wb.definedNames.add(`'${L}'!$B$8:$I$8`, "List_PriceGroup");
  wb.definedNames.add(`'${L}'!$B$9:$O$9`, "List_VanitySize");
  wb.definedNames.add(`'${C}'!$B$1`, "Const_TaxRate");
  wb.definedNames.add(`'${C}'!$B$2`, "Const_OocWholesale");
  wb.definedNames.add(`'${C}'!$B$3`, "Const_OocDirect");
  wb.definedNames.add(`'${C}'!$B$4`, "Const_Tearout");
  wb.definedNames.add(`'${C}'!$B$5`, "Const_VanityThreshold");
  wb.definedNames.add(`'${C}'!$B$6`, "Const_VanityTrip");
  wb.definedNames.add(`'${RB}'!$A$4:$A$11`, "RateBook_Groups");
  wb.definedNames.add(`'${RB}'!$B$4:$B$11`, "RateBook_Wholesale");
  wb.definedNames.add(`'${RB}'!$C$4:$C$11`, "RateBook_Direct");
}

export function constantsRows() {
  return [
    ["Material use tax % (decimal)", MATERIAL_USE_TAX_PERCENT / 100],
    ["OOC wholesale % (decimal)", OOC_WHOLESALE_PERCENT / 100],
    ["OOC direct % (decimal)", OOC_DIRECT_PERCENT / 100],
    ["Tear-out $", TEAROUT_PRICE],
    ["Vanity tier threshold sf", VANITY_TIER_THRESHOLD_SQFT],
    ["Vanity extra trip $", VANITY_EXTRA_TRIP_PRICE],
    ["Default target multiplier", DEFAULT_TARGET_MATERIAL_MULTIPLIER]
  ];
}
