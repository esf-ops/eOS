/**
 * Phase 1 uses an explicit local fixture identity.
 *
 * Optional read-only Supabase session display was deferred: wiring
 * `shared/eliteos-supabase` requires VITE_SUPABASE_* env plus tsconfig
 * accommodation for that package's `vite/client` triple-slash reference, and
 * Brain `/api/me` is unavailable while Express remains unmounted.
 *
 * This does not weaken production authentication — the lab never calls
 * protected Brain routes in Phase 1.
 */

export type LabIdentity = {
  mode: "fixture";
  displayName: string;
  email: string;
  initials: string;
  subtitle: string;
};

export const FIXTURE_IDENTITY: LabIdentity = {
  mode: "fixture",
  displayName: "Lab Estimator",
  email: "lab.estimator@example.com",
  initials: "LE",
  subtitle: "Fixture identity · local lab"
};

export async function resolveLabIdentity(): Promise<LabIdentity> {
  return FIXTURE_IDENTITY;
}
