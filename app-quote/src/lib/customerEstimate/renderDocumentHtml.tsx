import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerEstimateDocument from "./CustomerEstimateDocument";
import documentCss from "./customerEstimateDocument.css?inline";
import documentPrintCss from "./customerEstimateDocumentPrint.css?inline";
import documentPdfCss from "./customerEstimateDocumentPdf.css?inline";
import { snapshotToDocumentProps } from "./documentProps";

export function renderCustomerEstimateDocumentMarkup(printSnapshot: unknown): string {
  const props = snapshotToDocumentProps(printSnapshot);
  if (!props) return "";
  return renderToStaticMarkup(<CustomerEstimateDocument {...props} />);
}

/**
 * Full HTML document for Chromium PDF rendering (quote delivery email attachment).
 * Print + PDF CSS mirrors Internal Estimate browser print (@media print) for one-page parity.
 */
export function buildCustomerEstimatePrintHtml(printSnapshot: unknown): string {
  const body = renderCustomerEstimateDocumentMarkup(printSnapshot);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Elite Stone Fabrication Estimate</title>
  <style>
    @page {
      size: letter portrait;
      margin: 0.32in 0.38in;
    }
    html, body {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .customer-estimate-print {
      display: block !important;
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0;
      color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 8pt;
      line-height: 1.28;
      box-sizing: border-box;
    }
    ${documentCss}
    ${documentPrintCss}
    ${documentPdfCss}
  </style>
</head>
<body>${body}</body>
</html>`;
}
