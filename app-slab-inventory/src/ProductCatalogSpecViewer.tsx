import { useCallback, useEffect, useMemo, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import {
  normalizeProductCatalogDocumentUrl,
  productCatalogDocPageUrls,
  productCatalogInfoPath,
  productIdFromDocumentPdfUrl,
} from "./lib/productCatalogDocuments";

type ProductCatalogSpecViewerProps = {
  productName: string;
  /** Catalog PDF asset path — used only for blob download, never as a navigation target. */
  pdfUrl: string;
  /** Optional explicit product id; derived from pdfUrl when omitted. */
  productId?: string;
  onClose: () => void;
  /** Compact overlay stacked above the product modal (default). */
  variant?: "overlay" | "page";
};

type DownloadPhase = "idle" | "preparing" | "error";

function buildInfoViewerUrl(productId: string): string {
  const path = productCatalogInfoPath(productId);
  if (typeof window === "undefined") return path;
  const url = new URL(path, window.location.origin);
  const current = new URLSearchParams(window.location.search);
  for (const key of ["kiosk", "arreya"]) {
    const value = current.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

async function triggerBlobDownload(blob: Blob, filename: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * In-app document viewer for Product Catalog specs.
 * Renders pre-converted page PNGs — never embeds or navigates to a PDF.
 */
export function ProductCatalogSpecViewer({
  productName,
  pdfUrl,
  productId: productIdProp,
  onClose,
  variant = "overlay",
}: ProductCatalogSpecViewerProps) {
  const pdfAssetUrl = normalizeProductCatalogDocumentUrl(pdfUrl) ?? pdfUrl;
  const productId = productIdProp || productIdFromDocumentPdfUrl(pdfAssetUrl) || "";
  const pageUrls = useMemo(() => productCatalogDocPageUrls(productId), [productId]);
  const infoViewerUrl = useMemo(
    () => (productId ? buildInfoViewerUrl(productId) : ""),
    [productId]
  );

  const [failedPages, setFailedPages] = useState<Record<string, boolean>>({});
  const [loadedCount, setLoadedCount] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState<DownloadPhase>("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showImageDownload, setShowImageDownload] = useState(false);

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
    setDownloadPhase("idle");
    setDownloadError(null);
    setShowImageDownload(false);
  }, [productId, pdfAssetUrl]);

  const openInNewTab = useCallback(() => {
    if (!infoViewerUrl) {
      setDownloadError("Viewer link is unavailable for this product.");
      return;
    }
    window.open(infoViewerUrl, "_blank", "noopener,noreferrer");
  }, [infoViewerUrl]);

  const downloadImages = useCallback(async () => {
    const usable = pageUrls.filter((url) => !failedPages[url]);
    if (!usable.length) {
      setDownloadError("Spec sheet images are unavailable on this device.");
      return;
    }
    setDownloadPhase("preparing");
    setDownloadError(null);
    try {
      // Save each page; kiosks that block multi-file prompts still get page 1 first.
      for (let i = 0; i < usable.length; i += 1) {
        const url = usable[i];
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const suffix = usable.length > 1 ? `-page-${i + 1}` : "";
        await triggerBlobDownload(blob, `${productId || "spec-sheet"}${suffix}.png`);
      }
      setDownloadPhase("idle");
    } catch {
      setDownloadPhase("error");
      setDownloadError("Download could not be started on this device.");
    }
  }, [failedPages, pageUrls, productId]);

  const downloadPdf = useCallback(async () => {
    if (!pdfAssetUrl || !productId) {
      setDownloadPhase("error");
      setDownloadError("Download could not be started on this device.");
      setShowImageDownload(pageUrls.length > 0);
      return;
    }
    setDownloadPhase("preparing");
    setDownloadError(null);
    try {
      const response = await fetch(pdfAssetUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await triggerBlobDownload(blob, `${productId}.pdf`);
      setDownloadPhase("idle");
      setShowImageDownload(false);
    } catch {
      setDownloadPhase("error");
      setDownloadError("Download could not be started on this device.");
      setShowImageDownload(pageUrls.length > 0);
    }
  }, [pageUrls.length, pdfAssetUrl, productId]);

  const visibleCount = pageUrls.filter((url) => !failedPages[url]).length;
  const missingPages = pageUrls.length === 0;
  const allFailed = pageUrls.length > 0 && visibleCount === 0;
  const showFallback = missingPages || allFailed;
  const stillLoading = pageUrls.length > 0 && !showFallback && loadedCount < visibleCount;
  const downloadLabel = downloadPhase === "preparing" ? "Preparing…" : "Download PDF";

  const actionButtons = (
    <>
      <button
        type="button"
        className="pc-doc-viewer-btn pc-doc-viewer-btn--ghost"
        onClick={() => void downloadPdf()}
        disabled={downloadPhase === "preparing"}
      >
        {downloadLabel}
      </button>
      {showImageDownload ? (
        <button
          type="button"
          className="pc-doc-viewer-btn pc-doc-viewer-btn--ghost"
          onClick={() => void downloadImages()}
          disabled={downloadPhase === "preparing"}
        >
          Download images
        </button>
      ) : null}
      {variant === "overlay" && infoViewerUrl ? (
        <button type="button" className="pc-doc-viewer-btn pc-doc-viewer-btn--ghost" onClick={openInNewTab}>
          Open in new tab
        </button>
      ) : null}
      <button type="button" className="pc-doc-viewer-btn pc-doc-viewer-btn--solid" onClick={onClose}>
        Close
      </button>
    </>
  );

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
          {actionButtons}
        </div>
        {downloadError ? (
          <p className="pc-doc-viewer-action-error" role="alert">
            {downloadError}
          </p>
        ) : null}
      </header>

      <div className="pc-doc-viewer-body pc-doc-viewer-body--pages">
        {showFallback ? (
          <div className="pc-doc-viewer-fallback" role="alert">
            <p>Spec sheet could not be displayed.</p>
            <div className="pc-doc-viewer-fallback-actions">{actionButtons}</div>
            {downloadError ? (
              <p className="pc-doc-viewer-action-error" role="alert">
                {downloadError}
              </p>
            ) : null}
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
