import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface KioskQrPanelProps {
  /** The public URL to encode + display. */
  url: string;
  heading: string;
  caption: string;
}

/**
 * Phone-handoff panel. Renders a locally-generated QR code (no third-party QR
 * API — the `qrcode` lib encodes entirely in-browser) plus the plain URL so a
 * customer can scan to continue on their own phone.
 */
export function KioskQrPanel({ url, heading, caption }: KioskQrPanelProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);

    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 460,
      color: { dark: "#14181f", light: "#ffffff" },
    })
      .then((out) => {
        if (!cancelled) setDataUrl(out);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="kiosk-qr">
      <div className="kiosk-qr-code">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR code linking to ${url}`} draggable={false} />
        ) : failed ? (
          <div className="kiosk-qr-fallback" role="img" aria-label={`Link: ${url}`}>
            <span>Scan the address below</span>
          </div>
        ) : (
          <div className="kiosk-qr-skeleton" aria-hidden />
        )}
      </div>
      <div className="kiosk-qr-copy">
        <p className="kiosk-qr-heading">{heading}</p>
        <p className="kiosk-qr-caption">{caption}</p>
        <p className="kiosk-qr-url">{url.replace(/^https?:\/\//, "")}</p>
      </div>
    </div>
  );
}
