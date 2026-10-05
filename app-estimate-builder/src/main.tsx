import React from "react";
import ReactDOM from "react-dom/client";
import "@quote-lib/customerEstimate/customerEstimateDocument.css";
import "@quote-lib/customerEstimate/customerEstimateDocumentPrint.css";
import App from "./ui/App";
import "./ui/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
