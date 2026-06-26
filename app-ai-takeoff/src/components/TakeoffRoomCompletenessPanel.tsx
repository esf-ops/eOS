import React from "react";
import type { TakeoffResult, TakeoffRoom } from "@takeoff-core/takeoffContract.mjs";

interface Props {
  editDraft: TakeoffResult;
  roomCompleteness: Record<string, boolean>;
  onSetRoomComplete: (roomId: string, complete: boolean) => void;
  onPatchRoom: (roomId: string, patch: Partial<TakeoffRoom>) => void;
  onAddRoom: (name: string) => void;
}

export default function TakeoffRoomCompletenessPanel({
  editDraft,
  roomCompleteness,
  onSetRoomComplete,
  onPatchRoom,
  onAddRoom,
}: Props) {
  const [newRoomName, setNewRoomName] = React.useState("");

  const rooms = editDraft.rooms ?? [];
  const completeCount = rooms.filter((r) => roomCompleteness[r.id]).length;

  return (
    <div className="room-completeness lab-card">
      <div className="room-completeness-header">
        <h3 className="room-completeness-title">Room checklist</h3>
        <span className="room-completeness-count">
          {completeCount} / {rooms.length} complete
        </span>
      </div>
      <p className="room-completeness-desc muted small">
        Mark each room complete after verifying dimensions and assigning all pieces. Unassigned or incomplete rooms block approval.
      </p>

      <ul className="room-completeness-list">
        {rooms.map((room) => {
          const complete = Boolean(roomCompleteness[room.id]);
          const runCount = (room.areas ?? []).reduce((n, a) => n + (a.runs?.length ?? 0), 0);
          return (
            <li key={room.id} className={`room-completeness-item${complete ? " room-completeness-item--done" : ""}`}>
              <label className="room-completeness-check">
                <input
                  type="checkbox"
                  checked={complete}
                  onChange={(e) => onSetRoomComplete(room.id, e.target.checked)}
                />
                <span className="room-completeness-name">{room.name}</span>
              </label>
              <div className="room-completeness-meta">
                <span>{runCount} piece{runCount !== 1 ? "s" : ""}</span>
                <input
                  className="room-completeness-type-input"
                  value={room.roomType ?? ""}
                  placeholder="Room type"
                  onChange={(e) => onPatchRoom(room.id, { roomType: e.target.value })}
                  aria-label={`Type for ${room.name}`}
                />
                <input
                  className="room-completeness-rename-input"
                  defaultValue={room.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== room.name) onPatchRoom(room.id, { name: v });
                  }}
                  aria-label={`Rename ${room.name}`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="room-completeness-add">
        <input
          type="text"
          value={newRoomName}
          placeholder="Add missing room…"
          onChange={(e) => setNewRoomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newRoomName.trim()) {
              onAddRoom(newRoomName.trim());
              setNewRoomName("");
            }
          }}
        />
        <button
          type="button"
          className="btn-edit-action"
          disabled={!newRoomName.trim()}
          onClick={() => {
            if (!newRoomName.trim()) return;
            onAddRoom(newRoomName.trim());
            setNewRoomName("");
          }}
        >
          Add room
        </button>
      </div>
    </div>
  );
}
