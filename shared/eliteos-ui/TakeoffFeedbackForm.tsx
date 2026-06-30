import React, { useState } from "react";
import type { TakeoffFeedbackPayload } from "./takeoffBetaCopy";

interface Props {
  onSubmit: (payload: TakeoffFeedbackPayload) => Promise<void>;
  quoteId?: string | null;
  busy?: boolean;
  submitted?: boolean;
  title?: string;
}

function YesNoRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="eos-feedback-row takeoff-feedback-row ie-takeoff-feedback-row">
      <span>{label}</span>
      <div className="eos-feedback-yesno takeoff-feedback-yesno ie-takeoff-feedback-yesno">
        <button type="button" className={value === true ? "active" : ""} disabled={disabled} onClick={() => onChange(true)}>
          Yes
        </button>
        <button type="button" className={value === false ? "active" : ""} disabled={disabled} onClick={() => onChange(false)}>
          No
        </button>
      </div>
    </div>
  );
}

export default function TakeoffFeedbackForm({
  onSubmit,
  quoteId = null,
  busy = false,
  submitted = false,
  title = "How was this AI takeoff?",
}: Props) {
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [editedMeasurements, setEditedMeasurements] = useState<boolean | null>(null);
  const [missedRooms, setMissedRooms] = useState<boolean | null>(null);
  const [misreadBacksplash, setMisreadBacksplash] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [timeSaved, setTimeSaved] = useState("");
  const [error, setError] = useState<string | null>(null);

  const complete =
    helpful != null && editedMeasurements != null && missedRooms != null && misreadBacksplash != null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || busy || submitted) return;
    setError(null);
    try {
      await onSubmit({
        helpful,
        editedMeasurements,
        missedRooms,
        misreadBacksplash,
        note: note.trim() || undefined,
        estimatedTimeSavedMinutes: timeSaved.trim() ? Number(timeSaved) : null,
        quoteId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit feedback.");
    }
  }

  if (submitted) {
    return (
      <div className="eos-feedback-form takeoff-feedback takeoff-feedback--done ie-takeoff-feedback" role="status">
        <p className="muted small">Thanks — beta feedback recorded.</p>
      </div>
    );
  }

  return (
    <form className="eos-feedback-form takeoff-feedback ie-takeoff-feedback" onSubmit={handleSubmit}>
      <p className="eos-feedback-title takeoff-feedback-title ie-takeoff-feedback-title">{title}</p>
      <YesNoRow label="Was the AI takeoff helpful?" value={helpful} onChange={setHelpful} disabled={busy} />
      <YesNoRow label="Did you edit measurements?" value={editedMeasurements} onChange={setEditedMeasurements} disabled={busy} />
      <YesNoRow label="Did AI miss rooms or pieces?" value={missedRooms} onChange={setMissedRooms} disabled={busy} />
      <YesNoRow label="Did AI misread backsplash?" value={misreadBacksplash} onChange={setMisreadBacksplash} disabled={busy} />
      <label className="takeoff-feedback-note ie-takeoff-feedback-note">
        <span>Optional note</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} disabled={busy} />
      </label>
      <label className="takeoff-feedback-time ie-takeoff-feedback-time">
        <span>Estimated time saved (minutes)</span>
        <input type="number" min={0} step={1} value={timeSaved} onChange={(e) => setTimeSaved(e.target.value)} disabled={busy} />
      </label>
      {error ? <p className="error small">{error}</p> : null}
      <button type="submit" className="btn secondary btn-sm" disabled={!complete || busy}>
        {busy ? "Submitting…" : "Submit beta feedback"}
      </button>
    </form>
  );
}
