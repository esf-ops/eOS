import React from "react";
import ReactDOM from "react-dom/client";
import QuoteIntakeLabApp from "./QuoteIntakeLabApp";
import "../../shared/eliteos-ui/tokens.css";
import "../../shared/eliteos-ui/primitives.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QuoteIntakeLabApp />
  </React.StrictMode>
);
