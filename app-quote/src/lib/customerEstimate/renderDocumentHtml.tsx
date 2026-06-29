import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerEstimateDocument from "./CustomerEstimateDocument";
import documentCss from "./customerEstimateDocument.css?inline";
import { snapshotToDocumentProps } from "./documentProps";

export function renderCustomerEstimateDocumentMarkup(printSnapshot: unknown): string {
  const props = snapshotToDocumentProps(printSnapshot);
  if (!props) return "";
  return renderToStaticMarkup(<CustomerEstimateDocument {...props} />);
}

/**
 * Full HTML document for Chromium PDF rendering (quote delivery email attachment).
 */
export function buildCustomerEstimatePrintHtml(printSnapshot: unknown): string {
  const body = renderCustomerEstimateDocumentMarkup(printSnapshot);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Elite Stone Fabrication Estimate</title>
  <style>
    @page { margin: 0.45in; size: letter; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .customer-estimate-print {
      display: block !important;
      color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 8pt;
      line-height: 1.28;
    }
    ${documentCss}
  </style>
</head>
<body>${body}</body>
</html>`;
}
