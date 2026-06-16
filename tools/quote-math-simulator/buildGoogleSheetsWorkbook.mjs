#!/usr/bin/env node
/**
 * Generates Google Sheets-compatible Internal Estimate Quote Math Simulator workbook.
 * Run: node tools/quote-math-simulator/buildGoogleSheetsWorkbook.mjs
 */
import { buildWorkbook } from "./workbookBuilder.mjs";

await buildWorkbook("google");
