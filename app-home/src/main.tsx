import React from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/App";
import "./ui/styles.css";
/* Home command-center experiment — delete this line + ui/homeCommandCenter.css to revert */
import "./ui/homeCommandCenter.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
