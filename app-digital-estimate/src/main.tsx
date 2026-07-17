import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EstimateErrorBoundary } from "./EstimateErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EstimateErrorBoundary>
      <App />
    </EstimateErrorBoundary>
  </StrictMode>,
);
