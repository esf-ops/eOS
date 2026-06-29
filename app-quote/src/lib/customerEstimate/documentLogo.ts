/**
 * Bundled ESF horizontal logo for customer estimate documents.
 * Embedded as a data URI so browser print and backend Chromium PDF render identically
 * without relying on external image fetch timing/network.
 */
import logoDataUrl from "./assets/esf-horizontal-logo.png?inline";

export const CUSTOMER_ESTIMATE_DOCUMENT_LOGO_SRC = logoDataUrl;
