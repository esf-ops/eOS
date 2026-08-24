import { useEffect, useMemo } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import {
  isKioskOrArreyaMode,
  publicProductCatalogFixturesUrl,
  publicProductsProgramsLandingUrl,
} from "./lib/publicProductCatalogRoute";
import { PUBLIC_SHOWER_PROGRAM_PATH } from "./lib/publicShowerProgramRoute";

const FIXTURE_SINK_IMAGES = [
  "/product-catalog/sinks/blanco-blanco-precis-24-sink/hero.jpg",
  "/product-catalog/sinks/blanco-blanco-diamond-60-40-sinks/hero.jpg",
  "/product-catalog/sinks/blanco-blanco-precis-30-single-bowl/hero.jpg",
];

const FIXTURE_FAUCET_IMAGES = [
  "/product-catalog/faucets/faucet-delta-559lf-blmpu/matte-black.png",
  "/product-catalog/faucets/faucet-delta-9113-ar-dst/stainless.png",
];

const SHOWER_CARD_IMAGE = "/shower-program/inspiration/pro-veMrdtPQ.jpeg";

export default function PublicProductsProgramsPage() {
  const kiosk = useMemo(() => isKioskOrArreyaMode(), []);

  useEffect(() => {
    document.title = "Products & Programs · Elite Stone Fabrication";

    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex, nofollow");

    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement("meta");
      desc.setAttribute("name", "description");
      document.head.appendChild(desc);
    }
    desc.setAttribute(
      "content",
      "Elite Stone Fabrication Products & Programs — fixtures, accessories, and the Groutless Stone Shower Program.",
    );
  }, []);

  const fixturesHref = publicProductCatalogFixturesUrl(kiosk);
  const showerHref = `${PUBLIC_SHOWER_PROGRAM_PATH}${kiosk ? "?kiosk=1" : ""}`;

  const rootClass = ["pc-public-page", "pp-landing-page", kiosk ? "pc-public-kiosk pp-landing-kiosk" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <header className="pc-public-header">
        <div className="pc-public-brand">
          {EOS_LOGO_URL ? (
            <img src={EOS_LOGO_URL} alt="" className="pc-public-logo" />
          ) : (
            <span className="pc-public-logo-mark" aria-hidden>ESF</span>
          )}
          <div className="pc-public-brand-text">
            <h1 className="pc-public-title">Products & Programs</h1>
            <p className="pc-public-subtitle">Choose a showroom experience to explore.</p>
          </div>
        </div>
      </header>

      <main className="pc-public-main pp-landing-main">
        <div className="pp-landing-grid" role="list">
          <a href={fixturesHref} className="pp-landing-card" role="listitem">
            <div className="pp-landing-card-media pp-landing-card-media--fixtures" aria-hidden>
              <div className="pp-fixtures-panel pp-fixtures-panel--sinks">
                <img src={FIXTURE_SINK_IMAGES[0]} alt="" className="pp-fixtures-img" loading="eager" />
              </div>
              <div className="pp-fixtures-divider" />
              <div className="pp-fixtures-panel pp-fixtures-panel--faucets">
                <img src={FIXTURE_FAUCET_IMAGES[0]} alt="" className="pp-fixtures-img" loading="eager" />
              </div>
            </div>
            <div className="pp-landing-card-body">
              <h2 className="pp-landing-card-title">Fixtures & Accessories</h2>
              <p className="pp-landing-card-copy">Browse sinks, faucets, and specialty items.</p>
              <span className="pp-landing-card-cta">Explore →</span>
            </div>
          </a>

          <a href={showerHref} className="pp-landing-card" role="listitem">
            <div className="pp-landing-card-media pp-landing-card-media--shower" aria-hidden>
              <img src={SHOWER_CARD_IMAGE} alt="" className="pp-landing-shower-img" loading="eager" />
            </div>
            <div className="pp-landing-card-body">
              <h2 className="pp-landing-card-title">The Groutless Stone Shower</h2>
              <p className="pp-landing-card-copy">
                Explore stocked shower bases, curated wall surfaces, inspiration, and program options.
              </p>
              <span className="pp-landing-card-cta">Explore →</span>
            </div>
          </a>
        </div>
      </main>

      <footer className="pc-public-footer">
        <p>Elite Stone Fabrication · Products & Programs · Display only</p>
      </footer>
    </div>
  );
}
