import { useEffect } from "react";
import type { Elite100TextureAsset } from "./lib/elite100TextureAssets";

type Elite100TextureLightboxProps = {
  colorName: string;
  priceGroup: string | null;
  texture: Elite100TextureAsset;
  onClose: () => void;
  onViewInventory?: () => void;
};

export function Elite100TextureLightbox({
  colorName,
  priceGroup,
  texture,
  onClose,
  onViewInventory,
}: Elite100TextureLightboxProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="etl-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${colorName} material texture`}
      onClick={onClose}
    >
      <div className="etl" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="etl-close" onClick={onClose} aria-label="Close texture preview">
          ×
        </button>
        <header className="etl-head">
          <h2 className="etl-title">{colorName}</h2>
          {priceGroup ? (
            <p className="etl-pg">
              <span className={`e100-group-badge${priceGroup === "Promo" ? " promo" : ""}`} aria-hidden>
                {priceGroup === "Promo" ? "P" : priceGroup}
              </span>
              <span>{priceGroup === "Promo" ? "Group Promo" : `Group ${priceGroup}`}</span>
            </p>
          ) : null}
        </header>
        <div className="etl-img-frame">
          <img
            src={texture.fullUrl}
            alt={`${colorName} Elite 100 material texture`}
            className="etl-img"
          />
        </div>
        <footer className="etl-actions">
          <a
            href={texture.fullUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="etl-open-full"
          >
            Open full image
          </a>
          {onViewInventory ? (
            <button type="button" className="etl-view-inv" onClick={onViewInventory}>
              View slab inventory
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
