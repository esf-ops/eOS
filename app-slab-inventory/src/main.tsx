import React from "react";
import ReactDOM from "react-dom/client";
import SlabInventoryApp from "./SlabInventoryApp";
import PublicProductCatalogPage from "./PublicProductCatalogPage";
import { isPublicProductCatalogPath } from "./lib/publicProductCatalogRoute";
import "./styles.css";

function AppRoot() {
  if (isPublicProductCatalogPath()) {
    return <PublicProductCatalogPage />;
  }
  return <SlabInventoryApp />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
