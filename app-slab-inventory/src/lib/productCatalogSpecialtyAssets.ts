/**
 * Specialty Items — hero images (Digital Assets/Specialty, the same artwork used on the ESF specialty sell sheets).
 * One image per curated specialty product id: /product-catalog/specialty/<product id>/hero.jpg
 */
import type { ProductCatalogAssetOverride } from "./productCatalogAssets";

const SPECIALTY_IMAGE_IDS = [
  "specialty-point-pod-connect-silver-kitchen-counter-pop-up-outlet-15-w",
  "specialty-point-pod-connect-silver-kitchen-counter-pop-up-outlet-65w",
  "specialty-point-pod-connect-black-kitchen-counter-pop-up-outlet-15-w",
  "specialty-point-pod-connect-black-kitchen-counter-pop-up-outlet-65w",
  "specialty-hubbell-dual-sided-countertop-pop-up-receptacle-15amp",
  "specialty-hubbell-tri-power-countertop-pop-up-receptacle-15-amp",
  "specialty-hubbell-tri-power-countertop-pop-up-receptacle-20-amp",
  "specialty-free-power-3-device-charging-station-wholesale-and-partner-15-w",
  "specialty-glowback-led-panels-are-custom-made-for-each-project-to-fit-the-dimens",
  "specialty-invisacook-places-induction-technology-beneath-the-countertop-allowing",
] as const;

export const PRODUCT_CATALOG_SPECIALTY_OVERRIDES: ProductCatalogAssetOverride[] = SPECIALTY_IMAGE_IDS.map((productId) => ({
  productId,
  imageUrl: `/product-catalog/specialty/${productId}/hero.jpg`,
  sourceNotes: "Digital Assets/Specialty hero image.",
}));
