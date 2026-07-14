import type { QuoteIntakeCase } from "../domain/types";
import {
  caseTitle,
  formatReceived,
  formatSf,
  labelPriority,
  labelStatus,
  missingFieldLabel
} from "../utils/format";

type Props = {
  cases: QuoteIntakeCase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function QueueTable({ cases, selectedId, onSelect }: Props) {
  if (!cases.length) {
    return (
      <div className="qil-empty">
        <h2>No cases match</h2>
        <p>Adjust filters or clear the summary bucket selection.</p>
      </div>
    );
  }

  return (
    <div className="qil-table-wrap">
      <table className="qil-table">
        <thead>
          <tr>
            <th>Customer / project</th>
            <th>Sender</th>
            <th>Salesperson</th>
            <th>Received / age</th>
            <th>Color / group</th>
            <th>SF*</th>
            <th>Status</th>
            <th>Missing</th>
            <th>Priority</th>
            <th>Estimator</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const selected = c.id === selectedId;
            const missing = c.missingInformation.slice(0, 2).map(missingFieldLabel);
            const more = c.missingInformation.length - missing.length;
            return (
              <tr
                key={c.id}
                className={selected ? "is-selected" : undefined}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(c.id);
                  }
                }}
                tabIndex={0}
                aria-selected={selected}
              >
                <td>
                  <div className="qil-cell-primary">{caseTitle(c)}</div>
                  <div className="qil-cell-meta">{c.id}</div>
                </td>
                <td>
                  <div className="qil-cell-primary">{c.senderName}</div>
                  <div className="qil-cell-meta">{c.senderEmail}</div>
                </td>
                <td>{c.assignedSalesperson}</td>
                <td>
                  <div className="qil-cell-primary">{formatReceived(c.receivedAt)}</div>
                  <div className="qil-cell-meta">{c.elapsedTurnaroundLabel ?? "—"}</div>
                </td>
                <td>
                  <div className="qil-cell-primary">{c.requestedColor ?? "—"}</div>
                  <div className="qil-cell-meta">{c.resolvedPriceGroup ?? "Unresolved"}</div>
                </td>
                <td>{formatSf(c.proposedSquareFootage)}</td>
                <td>
                  <span className={`qil-pill qil-pill-status status-${c.status}`}>{labelStatus(c.status)}</span>
                </td>
                <td>
                  {missing.length ? (
                    <span className="qil-missing">
                      {missing.join(", ")}
                      {more > 0 ? ` +${more}` : ""}
                    </span>
                  ) : (
                    <span className="qil-cell-meta">None</span>
                  )}
                </td>
                <td>
                  <span className={`qil-pill qil-pill-priority priority-${c.priority}`}>
                    {labelPriority(c.priority)}
                  </span>
                </td>
                <td>{c.assignedEstimator ?? "Unassigned"}</td>
                <td className="qil-cell-meta">{c.nextAction ?? "Inspect case"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="qil-footnote">* Simulated fixture values — not production takeoff or pricing.</p>
    </div>
  );
}
