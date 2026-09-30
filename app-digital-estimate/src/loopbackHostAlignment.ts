const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The customer session cookie is set by the API host. On a local machine "localhost" and
 * "127.0.0.1" are different sites, so a page on one cannot send the cookie to an API on the
 * other and every save fails. Returns the URL to open instead, or null when no change is
 * needed. Only applies when both hosts are loopback, so deployed hosts are never affected.
 */
export function loopbackAlignedUrl(pageHref: string, apiBase: string): string | null {
  if (!apiBase) return null;
  let page: URL;
  let api: URL;
  try {
    page = new URL(pageHref);
    api = new URL(apiBase);
  } catch {
    return null;
  }
  if (!LOOPBACK.has(page.hostname) || !LOOPBACK.has(api.hostname)) return null;
  if (page.hostname === api.hostname) return null;
  page.hostname = api.hostname;
  return page.toString();
}
