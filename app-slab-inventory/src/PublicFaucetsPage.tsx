import PublicProductCatalogPage from "./PublicProductCatalogPage";

/** Arreya / kiosk faucets-only showroom — reuses Product Catalog cards, modal, and styles. */
export default function PublicFaucetsPage() {
  return (
    <PublicProductCatalogPage
      lockedCategory="faucet"
      hideCategoryTabs
      pageTitle="Elite Stone Fabrication Faucets"
      pageSubtitle="Delta & Moen showroom collection"
      metaDescription="Elite Stone Fabrication faucet showroom — Delta and Moen kitchen and bath faucets."
      rootClassName="pc-public-faucets-only"
    />
  );
}
