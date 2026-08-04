import React from "react";

/**
 * Inbox — quote request messages and attachments.
 * Slice 1A: shell placeholder only (no attachment selection / start-takeoff yet).
 */
export default function InboxPage() {
  return (
    <section className="qf-page" data-testid="qf-inbox-page">
      <header className="qf-page__header">
        <h1>Inbox</h1>
        <p className="qf-muted">
          Quote request messages and plan attachments land here. Select the correct plan to start AI
          Takeoff — no pricing or locked scope yet.
        </p>
      </header>
      <div className="qf-placeholder" data-testid="qf-inbox-placeholder">
        <p>
          Inbox list and attachment selection will appear in the next slice. AI Takeoff starts only
          after you choose the plan file.
        </p>
      </div>
    </section>
  );
}
