import React, { useState } from "react";
import type { TakeoffResult } from "@takeoff-core/takeoffContract.mjs";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";

interface Props {
  fixture: TakeoffResult;
  computed: TakeoffComputedMeasurements;
}

function sf(n: number) {
  return `${n.toFixed(2)} sf`;
}

export default function TakeoffRoomsReview({ fixture, computed }: Props) {
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    fixture.rooms.forEach((r) => { init[r.id] = true; });
    return init;
  });

  const toggleRoom = (id: string) =>
    setExpandedRooms((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="lab-rooms">
      {fixture.rooms.map((room, ri) => {
        const roomComputed = computed.roomBreakdown[ri];
        const isOpen = expandedRooms[room.id] ?? true;

        return (
          <div key={room.id} className="room-block">
            {/* Room header */}
            <button
              className="room-header"
              onClick={() => toggleRoom(room.id)}
              aria-expanded={isOpen}
            >
              <span className="room-header-name">
                <span className="room-header-icon">{isOpen ? "▾" : "▸"}</span>
                {room.name}
                {room.roomType && (
                  <span className="room-type-tag">{room.roomType}</span>
                )}
              </span>
              <span className="room-header-totals">
                <span className="room-total-chip">
                  CT: {sf(roomComputed?.countertopSf ?? 0)}
                </span>
                <span className="room-total-chip">
                  BS: {sf(roomComputed?.backsplashSf ?? 0)}
                </span>
                {(room.sourcePages?.length ?? 0) > 0 && (
                  <span className="room-page-chip">p. {room.sourcePages!.join(", ")}</span>
                )}
              </span>
            </button>

            {/* Room body */}
            {isOpen && (
              <div className="room-body">
                {/* Assumptions */}
                {(room.assumptions?.length ?? 0) > 0 && (
                  <div className="room-assumptions">
                    <span className="room-assumptions-label">Assumptions:</span>
                    {room.assumptions!.map((a, i) => (
                      <span key={i} className="room-assumption-tag">{a}</span>
                    ))}
                  </div>
                )}

                {/* Areas */}
                {room.areas.map((area, ai) => {
                  const areaComputed = roomComputed?.areaBreakdown[ai];

                  return (
                    <div key={area.id} className="area-block">
                      <div className="area-header">
                        <span className="area-label">{area.label}</span>
                        {area.areaType && (
                          <span className="area-type-tag">{area.areaType}</span>
                        )}
                        <span className="area-totals">
                          {areaComputed && (
                            <>
                              {areaComputed.countertopSf > 0 && (
                                <span className="area-sf-chip">
                                  CT {sf(areaComputed.countertopSf)}
                                </span>
                              )}
                              {areaComputed.backsplashSf > 0 && (
                                <span className="area-sf-chip area-sf-chip--bs">
                                  BS {sf(areaComputed.backsplashSf)}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        {(area.sourcePages?.length ?? 0) > 0 && (
                          <span className="area-page-chip">p. {area.sourcePages!.join(", ")}</span>
                        )}
                      </div>

                      {/* Backsplash from linear inches */}
                      {(area.backsplashLinearIn ?? 0) > 0 && (
                        <div className="backsplash-row">
                          <span className="backsplash-row-icon">◌</span>
                          <span className="backsplash-row-label">Backsplash</span>
                          <span className="backsplash-row-dim">
                            {area.backsplashLinearIn}" linear × {area.backsplashHeightIn ?? 4}"
                          </span>
                          {areaComputed && areaComputed.backsplashSf > 0 && (
                            <span className="backsplash-row-sf">{sf(areaComputed.backsplashSf)}</span>
                          )}
                        </div>
                      )}

                      {/* Runs */}
                      {area.runs.length > 0 && (
                        <table className="runs-table">
                          <thead>
                            <tr>
                              <th>Run</th>
                              <th>Length</th>
                              <th>Depth</th>
                              <th>Type</th>
                              <th>Exact sf</th>
                              <th>Page</th>
                            </tr>
                          </thead>
                          <tbody>
                            {area.runs.map((run) => {
                              const runSf = run.lengthIn > 0 && run.depthIn > 0
                                ? (run.lengthIn * run.depthIn) / 144
                                : 0;
                              const displaySf = Math.round(runSf * 100) / 100;

                              return (
                                <tr key={run.id}>
                                  <td className="run-label">{run.label}</td>
                                  <td className="run-dim">{run.lengthIn}"</td>
                                  <td className="run-dim">{run.depthIn}"</td>
                                  <td>
                                    <span className={`run-type-chip run-type--${run.pieceType ?? "counter"}`}>
                                      {run.pieceType ?? "counter"}
                                    </span>
                                  </td>
                                  <td className="run-sf">{displaySf.toFixed(2)}</td>
                                  <td className="run-page">
                                    {(run.sourcePages?.length ?? 0) > 0
                                      ? `p. ${run.sourcePages!.join(", ")}`
                                      : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                      {/* Area assumptions */}
                      {(area.assumptions?.length ?? 0) > 0 && (
                        <div className="area-assumptions">
                          {area.assumptions!.map((a, i) => (
                            <span key={i} className="area-assumption-tag">✦ {a}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
