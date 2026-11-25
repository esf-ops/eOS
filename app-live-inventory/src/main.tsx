import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const shareMatch = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{20,})\/?$/);

if (shareMatch) {
  // Public share page: the token is in the URL, so never leak it via Referer; keep it out of search.
  for (const [name, content] of [
    ["referrer", "no-referrer"],
    ["robots", "noindex, nofollow"],
  ]) {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  }
}

const PublicShare = lazy(() => import("./components/PublicShare"));
const LiveInventoryApp = lazy(() => import("./LiveInventoryApp"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div className="li-boot">Loading…</div>}>
      {shareMatch ? <PublicShare token={shareMatch[1]} /> : <LiveInventoryApp />}
    </Suspense>
  </React.StrictMode>
);
