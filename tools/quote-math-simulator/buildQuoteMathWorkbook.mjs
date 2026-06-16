#!/usr/bin/env node
/**
 * Generates Internal-Estimate-Quote-Math-Simulator.xlsx for Marshal audit/testing.
 * Run: node tools/quote-math-simulator/buildQuoteMathWorkbook.mjs
 */
import { buildWorkbook } from "./workbookBuilder.mjs";

await buildWorkbook("excel");
