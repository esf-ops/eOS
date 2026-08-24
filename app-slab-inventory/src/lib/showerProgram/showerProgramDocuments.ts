/**
 * Shower Program documents — kiosk-safe viewing (no PDF iframe/embed).
 *
 * Same rule as Product Catalog spec sheets: render page images in-app; keep the
 * source PDF as optional download/open reference. Multi-page documents should
 * use pre-rendered page PNGs (see scripts/build-shower-program-doc-pages.mjs)
 * or PDF.js — never Chrome's native PDF viewer in an iframe.
 */

export const SHOWER_PROGRAM_FLYER_PDF_URL = "/shower-program/docs/esf-shower-program-flyer.pdf";

/** Pre-rendered page 1 of the program flyer (generated from PDF). */
export const SHOWER_PROGRAM_FLYER_PAGE_IMAGE_URL =
  "/shower-program/docs/esf-shower-program-flyer-page-1.png";

export const SHOWER_PROGRAM_FLYER_PAGE_IMAGES: readonly string[] = [
  SHOWER_PROGRAM_FLYER_PAGE_IMAGE_URL,
];
