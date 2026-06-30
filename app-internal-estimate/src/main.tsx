import React from "react";
import ReactDOM from "react-dom/client";
import InternalEstimateApp from "./InternalEstimateApp";
import "@quote-lib/customerEstimate/customerEstimateDocument.css";
import "@quote-lib/customerEstimate/customerEstimateDocumentPrint.css";
import "../../shared/eliteos-ui/tokens.css";
import "../../shared/eliteos-ui/primitives.css";
import "../../shared/eliteos-ui/takeoffWorkflow.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <InternalEstimateApp />
  </React.StrictMode>
);
