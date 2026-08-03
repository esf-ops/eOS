import { useCallback, useEffect, useRef, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import { normalizeProductCatalogDocumentUrl } from "./lib/productCatalogDocuments";

type ProductCatalogSpecViewerProps = {
  productName: string;
  /** Raw or legacy catalog PDF path (normalized internally). */
  pdfUrl: string;
  onClose: () => void;
  /** Compact overlay stacked above the product modal (default). */
  variant?: "overlay" | "page";
};

/**
 * In-app PDF viewer for Product Catalog documents.
 * Avoids navigating directly to a raw PDF URL (often blocked by extensions).
 */
export function ProductCatalogSpecViewer({
  productName,
  pdfUrl,
  onClose,
  variant = "overlay",
}: ProductCatalogSpecViewerProps) {
  const normalizedUrl = normalizeProductCatalogDocumentUrl(pdfUrl) ?? pdfUrl;
  const [embedFailed, setEmbedFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const blobRef = useRef<string | null>(null);

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
    let cancelled = false;
    setEmbedFailed(false);
    setLoadError(null);
    setBlobUrl(null);

    (async () => {
      try {
        const res = await fetch(normalizedUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        const objectUrl = URL.createObjectURL(blob);
        blobRef.current = objectUrl;
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setLoadError("Spec sheet could not be displayed.");
          setEmbedFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [normalizedUrl]);

  const onIframeError = useCallback(() => {
    setEmbedFailed(true);
    setLoadError("Spec sheet could not be displayed.");
  }, []);

  const embedSrc = blobUrl ?? `${normalizedUrl}#view=FitH`;
  const showFallback = embedFailed || Boolean(loadError);

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
          <a
            className="pc-doc-viewer-btn pc-doc-viewer-btn--ghost"
            href={normalizedUrl}
            download
          >
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

      <div className="pc-doc-viewer-body">
        {showFallback ? (
          <div className="pc-doc-viewer-fallback" role="alert">
            <p>{loadError ?? "Spec sheet could not be displayed."}</p>
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
          <iframe
            className="pc-doc-viewer-frame"
            title={`${productName} spec sheet`}
            src={embedSrc}
            onError={onIframeError}
          />
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
