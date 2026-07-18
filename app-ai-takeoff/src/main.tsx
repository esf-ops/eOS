import React from "react";
import ReactDOM from "react-dom/client";
import TakeoffLabApp from "./TakeoffLabApp";
import ConsolidatedTakeoffReview from "./components/ConsolidatedTakeoffReview";
import "../../shared/eliteos-ui/tokens.css";
import "../../shared/eliteos-ui/primitives.css";
import "../../shared/eliteos-ui/takeoffWorkflow.css";
import "./styles.css";

function useConsolidatedReview(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("consolidated") === "1";
  } catch {
    return false;
  }
}

const Root = useConsolidatedReview() ? <ConsolidatedTakeoffReview /> : <TakeoffLabApp />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{Root}</React.StrictMode>
);
