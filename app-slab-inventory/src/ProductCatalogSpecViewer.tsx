import { useEffect, useMemo, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import {
  normalizeProductCatalogDocumentUrl,
  productCatalogDocPageUrls,
  productIdFromDocumentPdfUrl,
} from "./lib/productCatalogDocuments";

type ProductCatalogSpecViewerProps = {
  productName: string;
  /** Raw or legacy catalog PDF path (normalized internally). */
  pdfUrl: string;
  /** Optional explicit product id; derived from pdfUrl when omitted. */
  productId?: string;
  onClose: () => void;
  /** Compact overlay stacked above the product modal (default). */
  variant?: "overlay" | "page";
};

/**
 * In-app document viewer for Product Catalog specs.
 * Renders pre-converted page PNGs — never embeds a PDF (Chrome/extensions often block those).
 */
export function ProductCatalogSpecViewer({
  productName,
  pdfUrl,
  productId: productIdProp,
  onClose,
  variant = "overlay",
}: ProductCatalogSpecViewerProps) {
  const normalizedUrl = normalizeProductCatalogDocumentUrl(pdfUrl) ?? pdfUrl;
  const productId = productIdProp || productIdFromDocumentPdfUrl(normalizedUrl) || "";
  const pageUrls = useMemo(() => productCatalogDocPageUrls(productId), [productId]);

  const [failedPages, setFailedPages] = useState<Record<string, boolean>>({});
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    setFailedPages({});
    setLoadedCount(0);
  }, [productId, normalizedUrl]);

  const visibleCount = pageUrls.filter((url) => !failedPages[url]).length;
  const missingPages = pageUrls.length === 0;
  const allFailed = pageUrls.length > 0 && visibleCount === 0;
  const showFallback = missingPages || allFailed;
  const stillLoading = pageUrls.length > 0 && !showFallback && loadedCount < visibleCount;

  const body = (
    <div
      className={`pc-doc-viewer${variant === "page" ? " pc-doc-viewer--page" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Spec sheet for ${productName}`}
    >
      <header className="pc-doc-viewer-header">
        <div className="pc-doc-viewer-brand">
          <img src={EOS_LOGO_URL} alt="Elite Stone Fabrication" className="pc-doc-viewer-logo" />
          <div>
            <p className="pc-doc-viewer-eyebrow">Product Catalog</p>
            <h2 className="pc-doc-viewer-title">{productName}</h2>
          </div>
        </div>
        <div className="pc-doc-viewer-actions">
          <a className="pc-doc-viewer-btn pc-doc-viewer-btn--ghost" href={normalizedUrl} download>
            Download PDF
          </a>
          <a
            className="pc-doc-viewer-btn pc-doc-viewer-btn--ghost"
            href={normalizedUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open in new tab
          </a>
          <button type="button" className="pc-doc-viewer-btn pc-doc-viewer-btn--solid" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      <div className="pc-doc-viewer-body pc-doc-viewer-body--pages">
        {showFallback ? (
          <div className="pc-doc-viewer-fallback" role="alert">
            <p>Spec sheet could not be displayed.</p>
            <div className="pc-doc-viewer-fallback-actions">
              <a className="pc-doc-viewer-btn pc-doc-viewer-btn--solid" href={normalizedUrl} download>
                Download PDF
              </a>
              <a
                className="pc-doc-viewer-btn pc-doc-viewer-btn--ghost"
                href={normalizedUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open in new tab
              </a>
            </div>
          </div>
        ) : (
          <>
            {stillLoading ? (
              <p className="pc-doc-viewer-loading" aria-live="polite">
                Loading spec sheet…
              </p>
            ) : null}
            <div className="pc-doc-pages">
              {pageUrls.map((url, index) =>
                failedPages[url] ? null : (
                  <figure key={url} className="pc-doc-page">
                    <img
                      src={url}
                      alt={`${productName} — page ${index + 1}`}
                      className="pc-doc-page-img"
                      loading={index === 0 ? "eager" : "lazy"}
                      onLoad={() => setLoadedCount((n) => n + 1)}
                      onError={() =>
                        setFailedPages((prev) => ({
                          ...prev,
                          [url]: true,
                        }))
                      }
                    />
                    {pageUrls.length > 1 ? (
                      <figcaption className="pc-doc-page-caption">
                        Page {index + 1} of {pageUrls.length}
                      </figcaption>
                    ) : null}
                  </figure>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (variant === "page") {
    return <div className="pc-doc-viewer-page">{body}</div>;
  }

  return (
    <div
      className="pc-doc-viewer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {body}
    </div>
  );
}
