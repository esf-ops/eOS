# Studio state authority matrix

**Audited main:** `6712ec9e36d379fa6419f8ee74dbd98d5dd6c2ad`

Labels: **Canonical authority** · **Derived state** · **Frozen snapshot** · **Compatibility alias** · **Local draft state** · **Historical state** · **Legacy state** · **Not yet implemented**

---

## Identity

| Field | Label | Canonical write | Stored | Derived / frozen | Notes |
|-------|-------|-----------------|--------|------------------|-------|
| organization | Canonical | Auth / org context | JWT + row `organization_id` | — | Immutable on studio_estimates |
| intake case | Canonical | Quote Intake / manual create | `quote_intake_cases` | — | Family root |
| customer account (AD) | Canonical (live) | Account Directory | AD tables + estimate AD columns | Frozen on publication | Dual-track intentional |
| project name | Canonical (draft) | Project Details / create | `scope_json.projectName` | Frozen on publication | Metadata-only edit path |
| project address | Canonical (draft) | Project Details | `scope_json.projectAddress` | Frozen on publication | |
| partner pricing account | Canonical | Pricing Setup | `scope.partnerAccountId` | Trusted server resolve | |
| salesperson / assignee | Canonical / derived | Queue assign | intake case assignee fields | Command Center display | |

---

## Documents

| Field | Label | Canonical | Notes |
|-------|-------|-----------|-------|
| source email | Canonical (metadata) | Graph → intake hashes | Body not stored plaintext |
| attachment metadata | Canonical | `quote_intake_attachments` | Bytes later via Graph re-fetch |
| selected Takeoff plan | Canonical | takeoff link + job | Idempotent open-estimate |
| plan content | Canonical | `quote_files` / storage after open | |

---

## Physical scope

| Field | Label | Canonical write | Stored | Invalidation |
|-------|-------|-----------------|--------|--------------|
| rooms/pieces/dimensions | Canonical | Manual confirm or Takeoff seed | `scope_json` | Physical edits clear confirmation / may revise |
| backsplash | Canonical | Manual / Takeoff-derived | scope | |
| cutouts | Canonical | Manual / Takeoff-derived addOns | scope | |
| open-edge mode + confirmed LF | Canonical | Confirm Manual Scope stamp | `confirmedOpenEdgeLf` etc. | Room-authority tests |
| edge profile | Canonical | Pricing Setup | scope edge tokens | Pricing fingerprint |
| `physicalScopeSource` | Canonical (server) | Server only | scope | Client strip |
| `manualScopeConfirmed` | Canonical (server) | Confirm endpoint | scope | Client cannot forge |
| `manualScopeFingerprint` | Canonical | Confirm | scope | |

---

## Pricing / calculation / approval

| Field | Label | Canonical | Stored | Notes |
|-------|-------|-----------|--------|-------|
| commercial pricing fields | Canonical | updateScope | scope | |
| calculation totals | Frozen snapshot | calculate | `calculation_snapshot_json` + fingerprint | |
| approval | Frozen snapshot | approve | `approval_json` | Ties to calc fingerprint |
| staleReason | Derived/write | updateScope / gate / revise | column | |
| workflow currentStage | Derived | `buildStudioWorkspaceWorkflow` | response only | |
| nextRequiredAction | Derived | same | response only | |
| pricingDirty / manualDirty | Local draft | React state | browser | Fed into workflow client flags |

---

## Workflow (queue / CC)

| Field | Label | Authority | Notes |
|-------|-------|-----------|-------|
| intake status | Canonical | Quote Intake | `qil_*` |
| Takeoff job/review status | Canonical | Takeoff services | |
| queue `workflowStatus` | Derived | `deriveQueueWorkflowStatus` | Can disagree with Studio workflow until publication attached |
| needsAttention | Derived | `deriveNeedsAttention` | |
| openTarget | Derived | `deriveQueueOpenTarget` / CC view-model | |

---

## Publication

| Field | Label | Canonical | Notes |
|-------|-------|-----------|-------|
| active publication | Canonical | DE publish service | Family-scoped |
| customer URL | Derived recovery | Staff link recovery | Not raw token |
| publication summary.state | Derived | `buildSafeStudioPublicationSummary` | |
| historical publication | Historical | Prior revision / superseded | Intentional separation |
| customer viewed | Derived | Publication events | |
| review requested | Derived | Open review requests | |
| revoked / replaced / superseded / expired | Canonical status | Publication row | |

---

## Handoff

| Field | Label | Notes |
|-------|-------|-------|
| customer accepted | Not yet implemented / partial | Review ≠ sold |
| sold | Legacy / placeholder | Quote Library / queue vocabulary |
| QuickBooks-ready | Derived label | AD external links; no auto write |
| Moraware-ready | Legacy checklist | No Studio auto write |

---

## Revision sensitivity (summary)

| Change | New revision if approved? | Clears calc? | Affects active publication? |
|--------|---------------------------|--------------|----------------------------|
| Price-affecting scope | Yes (`createRevisionFrom`) | New row has none | Old pub remains until replace/revoke |
| Metadata-only project details | No | No | No |
| Confirm manual after draft save | No (same id) | May clear if priced path | No |
| Takeoff result change after approval | Yes | Via revise | No auto |

---

## Disagreement risks (authority)

1. **Queue workflowStatus vs Studio workspace workflow** — different derivations; publication awareness added to Studio workflow only (2026-07-24).  
2. **Superseded estimate id in a stale panel** — mitigated by `onActiveEstimateChange` but still a race window.  
3. **Active family publication vs new unapproved revision** — summary marks historical; stale revision takes workflow precedence.
