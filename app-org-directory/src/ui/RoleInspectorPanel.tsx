import type { ChartData, RelationshipType, Seat, SeatStatus } from "../lib/chartTypes";
import { RECOMMENDED_HEAD_OPTIONS } from "../lib/chartTypes";
import {
  directManagerId,
  displayName,
  isStructuralSeat,
  newId,
  seatListLabel,
  setDirectManager,
  setDirectRelationshipType
} from "../lib/chartUtils";
import {
  formatSecondaryRelationshipLine,
  humanRelationshipNote,
  PERSON_SEAT_STATUS_OPTIONS,
  relationshipTypeLabel,
  RELATIONSHIP_TYPE_OPTIONS,
  seatStatusLabel
} from "../lib/displayLabels";

type Props = {
  seat: Seat;
  chartData: ChartData;
  canEdit: boolean;
  onChartChange: (fn: (prev: ChartData) => ChartData) => void;
  onRemove: () => void;
  onClose?: () => void;
  onManageDepartments?: () => void;
};

export default function RoleInspectorPanel({
  seat,
  chartData,
  canEdit,
  onChartChange,
  onRemove,
  onClose,
  onManageDepartments
}: Props) {
  const { departments, seats, relationships } = chartData;
  const structural = isStructuralSeat(seat);
  const mgrId = directManagerId(seat.id, relationships);
  const mgr = mgrId ? seats.find((s) => s.id === mgrId) : null;
  const lineRel = mgrId ? relationships.find((r) => r.fromSeatId === seat.id && r.toSeatId === mgrId) : null;

  const secondaryForSeat = relationships.filter(
    (r) => r.type !== "direct" && (r.fromSeatId === seat.id || r.toSeatId === seat.id)
  );

  const updateSeat = (patch: Partial<Seat>) => {
    onChartChange((prev) => ({
      ...prev,
      seats: prev.seats.map((x) => (x.id === seat.id ? { ...x, ...patch } : x))
    }));
  };

  const quickAddDepartment = () => {
    if (!canEdit) return;
    const name = window.prompt("New department name");
    if (!name?.trim()) return;
    const id = newId("dept");
    onChartChange((prev) => ({
      ...prev,
      departments: [
        ...prev.departments,
        { id, name: name.trim(), color: "#64748b", sortOrder: prev.departments.length + 1 }
      ],
      seats: prev.seats.map((x) => (x.id === seat.id ? { ...x, departmentId: id } : x))
    }));
  };

  return (
    <div className="od-inspector">
      <div className="od-inspector-head">
        <h3 className="od-inspector-title">{structural ? "Group card" : "Role details"}</h3>
        {onClose ? (
          <button type="button" className="od-btn od-btn-quiet od-inspector-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        ) : null}
      </div>

      {structural ? (
        <p className="od-muted od-inspector-hint">Structural group — not an employee or user seat.</p>
      ) : seat.status === "advisor" ? (
        <p className="od-muted od-inspector-hint">Advisor context — not a separate employee record.</p>
      ) : null}

      <p className="od-muted" style={{ marginTop: 0, marginBottom: 12 }}>
        {mgr
          ? `Reports to ${displayName(mgr)} (${mgr.title}).`
          : "Top-level on the chart — no direct manager."}
        {lineRel && lineRel.type !== "direct" ? ` Line: ${relationshipTypeLabel(lineRel.type)}.` : null}
      </p>

      <div className="od-form-grid">
        {!structural ? (
          <label>
            Person name
            <input
              disabled={!canEdit}
              value={seat.personName}
              onChange={(e) => updateSeat({ personName: e.target.value })}
            />
          </label>
        ) : null}
        <label style={structural ? { gridColumn: "1 / -1" } : undefined}>
          {structural ? "Group name" : "Title / role"}
          <input disabled={!canEdit} value={seat.title} onChange={(e) => updateSeat({ title: e.target.value })} />
        </label>
        <label>
          Department
          <select
            disabled={!canEdit}
            value={seat.departmentId ?? ""}
            onChange={(e) => updateSeat({ departmentId: e.target.value || null })}
          >
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {canEdit ? (
          <div className="od-inspector-dept-actions">
            <button type="button" className="od-btn od-btn-quiet" onClick={quickAddDepartment}>
              Add department
            </button>
            {onManageDepartments ? (
              <button type="button" className="od-btn od-btn-quiet" onClick={onManageDepartments}>
                Manage departments
              </button>
            ) : null}
          </div>
        ) : null}
        {!structural ? (
          <label>
            Branch / location
            <input disabled={!canEdit} value={seat.branch} onChange={(e) => updateSeat({ branch: e.target.value })} />
          </label>
        ) : null}
        {!structural ? (
          <label>
            Status
            <select
              disabled={!canEdit}
              value={seat.status}
              onChange={(e) => updateSeat({ status: e.target.value as SeatStatus })}
            >
              {PERSON_SEAT_STATUS_OPTIONS.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Card type
            <input disabled value={seatStatusLabel("structural")} />
          </label>
        )}
        <label>
          Reports to
          <select
            disabled={!canEdit}
            value={mgrId ?? ""}
            onChange={(e) => {
              const nextMgr = e.target.value || null;
              onChartChange((prev) => ({
                ...prev,
                relationships: setDirectManager(seat.id, nextMgr, prev.relationships)
              }));
            }}
          >
            <option value="">— (top level) —</option>
            {seats
              .filter((s) => s.id !== seat.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {seatListLabel(s)}
                </option>
              ))}
          </select>
        </label>
        {mgrId ? (
          <label>
            Relationship type
            <select
              disabled={!canEdit}
              value={lineRel?.type ?? "direct"}
              onChange={(e) => {
                const t = e.target.value as RelationshipType;
                onChartChange((prev) => ({
                  ...prev,
                  relationships: setDirectRelationshipType(seat.id, t, prev.relationships)
                }));
              }}
            >
              {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label style={{ gridColumn: "1 / -1" }}>
          Notes
          <textarea
            disabled={!canEdit}
            rows={3}
            value={seat.notes}
            onChange={(e) => updateSeat({ notes: e.target.value })}
          />
        </label>
        {!structural ? (
          <label style={{ gridColumn: "1 / -1" }}>
            Recommended tools / heads
            <select
              multiple
              disabled={!canEdit}
              value={seat.recommendedHeads}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                updateSeat({ recommendedHeads: opts });
              }}
              style={{ minHeight: 88 }}
            >
              {RECOMMENDED_HEAD_OPTIONS.map((h) => (
                <option key={h.slug} value={h.slug}>
                  {h.label}
                </option>
              ))}
            </select>
            <span className="od-muted" style={{ fontSize: "0.8rem" }}>
              Planning only — does not grant access.
            </span>
          </label>
        ) : null}
      </div>

      {secondaryForSeat.length > 0 ? (
        <div className="od-inspector-secondary">
          <h4>Other relationships</h4>
          <ul>
            {secondaryForSeat.map((r) => {
              const from = seats.find((s) => s.id === r.fromSeatId);
              const to = seats.find((s) => s.id === r.toSeatId);
              if (!from || !to) return null;
              const note = humanRelationshipNote(r.label);
              return (
                <li key={r.id}>
                  {formatSecondaryRelationshipLine(displayName(from), displayName(to), r.type, note ?? undefined)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {canEdit ? (
        <button type="button" className="od-btn od-inspector-remove" onClick={onRemove}>
          {structural ? "Remove group card" : "Remove role"}
        </button>
      ) : null}
    </div>
  );
}
