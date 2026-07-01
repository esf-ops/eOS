import React from "react";
import ReactDOM from "react-dom/client";
import SlabInventoryApp from "./SlabInventoryApp";
import PublicProductCatalogPage from "./PublicProductCatalogPage";
import PublicElite100Page from "./PublicElite100Page";
import { isPublicProductCatalogPath } from "./lib/publicProductCatalogRoute";
import { isPublicElite100Path } from "./lib/publicElite100Route";
import "./styles.css";

function AppRoot() {
  if (isPublicProductCatalogPath()) {
    return <PublicProductCatalogPage />;
  }
  if (isPublicElite100Path()) {
    return <PublicElite100Page />;
  }
  return <SlabInventoryApp />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
