import React from "react";
import type { TakeoffImportPlan, ImportPlanRoom, ImportPlanGroup } from "@takeoff-core/takeoffImportPlanner.mjs";

interface Props {
  importPlan: TakeoffImportPlan;
}

function ShapeGroupRow({ group }: { group: ImportPlanGroup }) {
  return (
    <div className="import-group">
      <div className="import-group-header">
        <span className="import-group-name">{group.label}</span>
        <span className="import-shape-chip">{group.shapeType}</span>
        <span className="import-overlap-chip">overlap: {group.overlapMode}</span>
        <span className="import-bs-chip">backsplash: {group.backsplashMode}</span>
      </div>
      <div className="import-pieces">
        {group.pieces.map((p, i) => (
          <div key={i} className="import-piece">
            <span className={`import-piece-type import-piece-type--${p.pieceType}`}>{p.pieceType}</span>
            <span className="import-piece-label">{p.label}</span>
            <span className="import-piece-dim">{p.lengthIn}" × {p.depthIn}"</span>
            <span className="import-piece-sf">
              {((p.lengthIn * p.depthIn) / 144).toFixed(2)} sf
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomImportCard({ room }: { room: ImportPlanRoom }) {
  return (
    <div className="import-room">
      <div className="import-room-header">
        <span className="import-room-name">{room.name}</span>
        {room.roomType && <span className="import-room-type">{room.roomType}</span>}
        <span className="import-calc-mode">{room.calcMode}</span>
        {(room.sourcePages?.length ?? 0) > 0 && (
          <span className="import-page-chip">p. {room.sourcePages!.join(", ")}</span>
        )}
      </div>
      <div className="import-groups">
        {room.guidedShapeGroups.map((g, i) => <ShapeGroupRow key={i} group={g} />)}
      </div>
      {room.warnings.length > 0 && (
        <div className="import-room-warnings">
          {room.warnings.map((w, i) => (
            <div key={i} className="import-room-warning">
              <span className="import-warn-level">{w.level.toUpperCase()}</span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TakeoffImportPreview({ importPlan }: Props) {
  return (
    <div className="lab-card import-preview">
      {/* Status bar */}
      <div className={`import-status-bar ${importPlan.canImport ? "import-status--ready" : "import-status--blocked"}`}>
        <span className="import-status-icon">{importPlan.canImport ? "✓" : "✗"}</span>
        <span className="import-status-text">
          {importPlan.canImport
            ? `Import plan ready — ${importPlan.rooms.length} room${importPlan.rooms.length !== 1 ? "s" : ""} mapped to RoomScopeBuilder-compatible groups`
            : importPlan.blockedReason}
        </span>
      </div>

      {/* Rooms */}
      {importPlan.rooms.length > 0 && (
        <div className="import-rooms-list">
          {importPlan.rooms.map((room, i) => (
            <RoomImportCard key={i} room={room} />
          ))}
        </div>
      )}

      {/* Computed sf */}
      <div className="import-sf-summary">
        <span className="import-sf-item">
          Countertop: <strong>{importPlan.computedSf.countertopExactSf.toFixed(2)} sf</strong>
        </span>
        <span className="import-sf-sep" />
        <span className="import-sf-item">
          Backsplash: <strong>{importPlan.computedSf.backsplashExactSf.toFixed(2)} sf</strong>
        </span>
        <span className="import-sf-sep" />
        <span className="import-sf-item">
          Combined: <strong>{importPlan.computedSf.combinedExactSf.toFixed(2)} sf</strong>
        </span>
      </div>

      {/* Plan-level warnings */}
      {importPlan.warnings.length > 0 && (
        <div className="import-plan-warnings">
          <div className="import-plan-warnings-label">Import warnings</div>
          {importPlan.warnings.map((w, i) => (
            <div key={i} className="import-plan-warning-row">
              <span className={`import-warn-level import-warn--${w.level}`}>{w.level.toUpperCase()}</span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Disabled import button */}
      <div className="import-action-row">
        <button className="btn-import-disabled" disabled aria-disabled="true">
          Import to Internal Estimate — coming later
        </button>
        <span className="import-disabled-note">
          Import is intentionally disabled in the Lab. Approved takeoffs will be importable
          in a future slice — Internal Estimate import is not enabled yet.
        </span>
      </div>
    </div>
  );
}
