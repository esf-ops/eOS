import React from "react";
import ReactDOM from "react-dom/client";
import SlabInventoryApp from "./SlabInventoryApp";
import PublicProductCatalogPage from "./PublicProductCatalogPage";
import PublicProductCatalogInfoPage from "./PublicProductCatalogInfoPage";
import PublicElite100Page from "./PublicElite100Page";
import PublicCambriaPage from "./PublicCambriaPage";
import PublicFaucetsPage from "./PublicFaucetsPage";
import PublicShowerProgramPage from "./PublicShowerProgramPage";
import PublicProductsProgramsPage from "./PublicProductsProgramsPage";
import { isPublicProductCatalogPath, isPublicProductsProgramsLandingPath } from "./lib/publicProductCatalogRoute";
import { isPublicProductCatalogInfoPath } from "./lib/productCatalogDocuments";
import { isPublicElite100Path } from "./lib/publicElite100Route";
import { isPublicCambriaPath } from "./lib/publicCambriaRoute";
import { isPublicFaucetsPath } from "./lib/publicFaucetsRoute";
import { isPublicShowerProgramPath } from "./lib/publicShowerProgramRoute";
import "./styles.css";

function AppRoot() {
  if (isPublicProductCatalogInfoPath()) {
    return <PublicProductCatalogInfoPage />;
  }
  if (isPublicProductsProgramsLandingPath()) {
    return <PublicProductsProgramsPage />;
  }
  if (isPublicProductCatalogPath()) {
    return <PublicProductCatalogPage />;
  }
  if (isPublicFaucetsPath()) {
    return <PublicFaucetsPage />;
  }
  if (isPublicElite100Path()) {
    return <PublicElite100Page />;
  }
  if (isPublicShowerProgramPath()) {
    return <PublicShowerProgramPage />;
  }
  if (isPublicCambriaPath()) {
    return <PublicCambriaPage />;
  }
  return <SlabInventoryApp />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
