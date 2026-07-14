import { useState } from "react";

type Props = {
  importedCount: number;
  onClearImported: () => Promise<void>;
};

export default function LabDataControls({ importedCount, onClearImported }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    try {
      await onClearImported();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qil-lab-data" aria-label="Local lab data controls">
      <div className="qil-lab-data-copy">
        <strong>Local imports</strong>
        <span>
          {importedCount} case{importedCount === 1 ? "" : "s"} in this browser · fixtures untouched
        </span>
      </div>
      {!confirming ? (
        <button
          type="button"
          className="qil-btn-ghost"
          disabled={importedCount === 0}
          onClick={() => setConfirming(true)}
        >
          Clear imported…
        </button>
      ) : (
        <div className="qil-lab-data-confirm">
          <span>Remove all locally imported cases and attachment blobs?</span>
          <button type="button" className="qil-btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className="qil-btn-danger" disabled={busy} onClick={() => void clear()}>
            {busy ? "Clearing…" : "Clear imports"}
          </button>
        </div>
      )}
    </div>
  );
}
