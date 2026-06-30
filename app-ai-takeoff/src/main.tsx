import React from "react";
import ReactDOM from "react-dom/client";
import TakeoffLabApp from "./TakeoffLabApp";
import "../../shared/eliteos-ui/tokens.css";
import "../../shared/eliteos-ui/primitives.css";
import "../../shared/eliteos-ui/takeoffWorkflow.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TakeoffLabApp />
  </React.StrictMode>
);
