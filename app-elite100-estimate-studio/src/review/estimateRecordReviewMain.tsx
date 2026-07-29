import React from "react";
import ReactDOM from "react-dom/client";
import "../../../shared/eliteos-ui/tokens.css";
import "../../../shared/eliteos-ui/primitives.css";
import "../../../shared/eliteos-ui/eliteosTopbar.css";
import "../styles.css";
import "./reviewHarness.css";
import EstimateRecordReviewApp from "./EstimateRecordReviewApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EstimateRecordReviewApp />
  </React.StrictMode>
);
