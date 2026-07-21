import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EstimateErrorBoundary } from "./EstimateErrorBoundary";
import "./lovable-theme.css";
import "./styles.css";
import "@quote-lib/customerEstimate/customerEstimateDocument.css";
import "@quote-lib/customerEstimate/customerEstimateDocumentPrint.css";
import "./digitalEstimatePrint.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EstimateErrorBoundary>
      <App />
    </EstimateErrorBoundary>
  </StrictMode>,
);
