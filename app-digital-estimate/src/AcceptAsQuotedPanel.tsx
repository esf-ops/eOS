import { useEffect, useState } from "react";
import {
  exchangeFragmentToken,
  fetchCurrentFinalAcceptance,
  submitFinalAcceptance,
  type ConfigurationSaveError,
  type CustomerFinalAcceptance,
} from "./publicConfigApi";

function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Accepting the exact published quote on a view-only estimate (online changes
 * unavailable). The server validates the frozen quote; nothing is priced here.
 */
export function AcceptAsQuotedPanel({
  publishedTotal,
  rowVersion,
  sessionId,
  accessToken,
}: {
  publishedTotal: number | null;
  rowVersion: number | null;
  sessionId: string | null;
  accessToken: string | null;
}) {
  const [acceptance, setAcceptance] = useState<CustomerFinalAcceptance | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boundSession, setBoundSession] = useState<{ id: string | null; rowVersion: number | null }>({
    id: sessionId,
    rowVersion,
  });

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentFinalAcceptance(sessionId).then((r) => {
      if (!cancelled && r.acceptance) setAcceptance(r.acceptance);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await submitFinalAcceptance({
        confirm: true,
        confirmation: "accept_final_estimate",
        ...(boundSession.rowVersion != null ? { expectedRowVersion: boundSession.rowVersion } : {}),
        expectedSessionId: boundSession.id || "",
      });
      setAcceptance(res.acceptance);
    } catch (e) {
      const err = e as ConfigurationSaveError;
      if (err?.code === "session_mismatch" && accessToken) {
        // Another estimate link took over this browser's session; re-bind to this estimate and
        // let the customer confirm again rather than accepting silently.
        try {
          const state = await exchangeFragmentToken(accessToken);
          setBoundSession({ id: state.session?.id ?? null, rowVersion: state.session?.rowVersion ?? null });
          setConfirmed(false);
          setError("This page was reconnected to your estimate. Please confirm and accept again.");
          return;
        } catch {
          /* fall through to the server message */
        }
      }
      setError(e instanceof Error ? e.message : "We couldn’t record your acceptance. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (acceptance) {
    return (
      <section className="accept-as-quoted no-print" data-testid="de-accept-as-quoted-accepted" role="status">
        <h2 className="accept-as-quoted__title">Estimate accepted</h2>
        <p>
          You accepted this estimate as quoted for {money(acceptance.customerDisplayTotal)}.{" "}
          {acceptance.notice || "Elite has received your acceptance. This is not a scheduling confirmation."}
        </p>
      </section>
    );
  }

  return (
    <section className="accept-as-quoted no-print" data-testid="de-accept-as-quoted">
      <h2 className="accept-as-quoted__title">Accept this estimate as quoted</h2>
      <p>
        You can accept the estimate exactly as shown for {money(publishedTotal)}. To change anything,
        contact Elite Stone Fabrication and we’ll review it and send you a revised estimate.
      </p>
      <label className="accept-as-quoted__confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          data-testid="de-accept-as-quoted-confirm"
        />{" "}
        I accept this estimate as quoted, including its terms.
      </label>
      {error ? (
        <p className="accept-as-quoted__error" role="alert" data-testid="de-accept-as-quoted-error">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="accept-as-quoted__button"
        disabled={!confirmed || busy}
        onClick={() => void accept()}
        data-testid="de-accept-as-quoted-button"
      >
        {busy ? "Accepting…" : "Accept as quoted"}
      </button>
    </section>
  );
}
