import { useEffect, useMemo } from "react";
import { getProductCatalogItemsWithAssets } from "./lib/productCatalogAssets";
import { filterCatalogReadyItems } from "./lib/productCatalogReady";
import { parseProductCatalogInfoPath } from "./lib/productCatalogDocuments";
import { ProductCatalogSpecViewer } from "./ProductCatalogSpecViewer";

/**
 * Standalone public document viewer:
 *   /public/product-catalog/info/:productId
 *
 * Loads the product by id and embeds its PDF without using a raw .pdf click target.
 */
export default function PublicProductCatalogInfoPage() {
  const productId = useMemo(() => parseProductCatalogInfoPath() ?? "", []);
  const item = useMemo(() => {
    if (!productId) return null;
    const items = filterCatalogReadyItems(getProductCatalogItemsWithAssets());
    return (
      items.find((p) => p.id === productId) ??
      getProductCatalogItemsWithAssets().find((p) => p.id === productId) ??
      null
    );
  }, [productId]);

  useEffect(() => {
    document.title = item
      ? `${item.name} · Spec sheet · Elite Stone Fabrication`
      : "Spec sheet · Elite Stone Fabrication";
  }, [item]);

  const goBackToCatalog = () => {
    const url = new URL(window.location.href);
    url.pathname = "/public/product-catalog";
    // keep kiosk/arreya flags
    window.location.assign(url.toString());
  };

  if (!productId || !item?.specSheetUrl) {
    return (
      <div className="pc-doc-viewer-page">
        <div className="pc-doc-viewer pc-doc-viewer--page">
          <header className="pc-doc-viewer-header">
            <div className="pc-doc-viewer-brand">
              <div>
                <p className="pc-doc-viewer-eyebrow">Product Catalog</p>
                <h2 className="pc-doc-viewer-title">Spec sheet unavailable</h2>
              </div>
            </div>
            <div className="pc-doc-viewer-actions">
              <button type="button" className="pc-doc-viewer-btn pc-doc-viewer-btn--solid" onClick={goBackToCatalog}>
                Back to catalog
              </button>
            </div>
          </header>
          <div className="pc-doc-viewer-body">
            <div className="pc-doc-viewer-fallback" role="alert">
              <p>This product does not have a published spec sheet.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProductCatalogSpecViewer
      productName={item.name}
      pdfUrl={item.specSheetUrl}
      onClose={goBackToCatalog}
      variant="page"
    />
  );
}
