/**
 * Audit helpers for takeoff → Internal Estimate import events (v6.1).
 *
 * @module internalQuoteTakeoffAudit
 */

import { isActiveTakeoffImport } from "./internalQuoteTakeoffImportChecklist.mjs";

/**
 * @param {object|null|undefined} snapshotOrBody
 */
export function takeoffImportContextFromSnapshot(snapshotOrBody) {
  const snap = snapshotOrBody?.calculation_snapshot ?? snapshotOrBody?.snapshot ?? snapshotOrBody;
  const iu = snap?.internal_ui;
  const ti = iu?.takeoff_import;
  if (!isActiveTakeoffImport(ti)) return null;
  return {
    takeoffJobId: ti.takeoffJobId ?? null,
    takeoffSnapshotId: ti.takeoffSnapshotId ?? null,
    schemaVersion: ti.schemaVersion ?? null,
  };
}

/**
 * @param {object|null|undefined} body
 */
export function takeoffImportContextFromSaveBody(body) {
  const ti = body?.takeoff_import ?? body?.takeoffImport;
  if (!isActiveTakeoffImport(ti)) return null;
  return {
    takeoffJobId: ti.takeoffJobId ?? null,
    takeoffSnapshotId: ti.takeoffSnapshotId ?? null,
    schemaVersion: ti.schemaVersion ?? null,
  };
}

/**
 * Append an audit event to takeoff_import.auditEvents (immutable history).
 *
 * @param {Record<string, unknown>} takeoffImport
 * @param {{ type: string, at?: string, userId?: string|null, userEmail?: string|null, metadata?: Record<string, unknown> }} event
 */
export function appendTakeoffImportAuditEvent(takeoffImport, event) {
  const existing = Array.isArray(takeoffImport.auditEvents) ? takeoffImport.auditEvents : [];
  return {
    ...takeoffImport,
    auditEvents: [
      ...existing,
      {
        type: event.type,
        at: event.at ?? new Date().toISOString(),
        userId: event.userId ?? null,
        userEmail: event.userEmail ?? null,
        ...(event.metadata ? { metadata: event.metadata } : {}),
      },
    ],
  };
}
