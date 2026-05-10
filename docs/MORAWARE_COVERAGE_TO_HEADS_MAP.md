# Moraware Brain coverage → future eOS heads

Maps **Moraware UI data categories** (see `docs/MORAWARE_UI_COVERAGE_MAP.md`) to **heads** that consume them. Status values mirror the audit: **yes / partial / no / unknown**.

> Moraware records the work. eOS explains the work. The heads move the work.

---

## Legend

| Status | Meaning |
| --- | --- |
| **yes** | Available in Brain today for typical jobs (with operational ingest on). |
| **partial** | Some signal in Brain; may need joins, heuristics, or richer ingest. |
| **no** | Not persisted to Brain in production path today. |
| **unknown** | Needs payload proof. |

---

## Head matrix

| Head | Required Moraware categories | Current coverage | Gaps | Next ingestion step |
| --- | --- | --- | --- | --- |
| **Executive** | job_info, job_activities, job_worksheet_forms, account_jobs_history, calendar_schedule_views | **partial** | Addresses, daily scheduled Sq.Ft., machine rows | Activity-based capacity view spec; optional address denorm for maps |
| **Brain Health** | job_activities, phases, sync metadata, failed jobs | **yes** / **partial** | Files, reminders | Expand operational probes; alert on ingest gaps |
| **Sales** | job_info, account_contacts, job_worksheet_forms, files_attachments | **partial** | Account contacts, files | Account + file metadata phase |
| **Account Performance** | account_info, account_jobs_history, job_activities | **partial** | Deep account attributes | `brain_accounts` additive |
| **Production** | job_activities, fabrication_schedule, job_worksheet_forms | **partial** | Machine assignment, daily Sq.Ft. | P1 assignment extraction |
| **Titans Flowing** | job_activities, calendar_schedule_views | **partial** | Unscheduled bucket, assignee | Harden `/api/titans/today` inputs vs `raw_json` audit |
| **Shop Floor TV** | calendar_schedule_views, fabrication_schedule, shop reconstruction | **partial** | Truck rows, view colors | Large-format queries on activities + worksheet Sq.Ft. join rules |
| **Machine Schedule** | machine_schedule, job_activities | **unknown** | Structured machine | Sample `raw_json` for Titan/Saber/Robot strings |
| **Programming / CAD readiness** | programming_schedule, job_activities | **partial** | Person rows | Parse programmer assignments |
| **30 Day Fabrication Schedule** | fabrication_schedule, daily_scheduled_sqft | **partial** | Pre-aggregates | Priority 2 materialized metrics |
| **Install** | install_schedule, install_inspection_checklist, job_address, job_contacts, delivery_truck_schedule | **partial** | Addresses, trucks, checklist semantics | Address table + checklist template map |
| **Template** | template_schedule, job_worksheet_forms | **partial** | Unscheduled template flag | Rule for template w/o `start_date` |
| **Purchasing / Material readiness** | job_worksheet_forms, job_info | **partial** | Slab signals vs inventory bridge | Moraware + future SlabSmith join |
| **Customer Service** | customer_service_schedule, job_activities, job_issues | **partial** | Issues table | Issues discovery |
| **Quality / Rework** | job_issues, job_activities, install_inspection_checklist | **unknown** | Issues | Same as issues discovery |
| **Quote / Partner quoting** | job_worksheet_forms, files_attachments, account_contacts | **partial** | Files + account rolodex | Metadata-only files; partner ACL |
| **Internal staging / Moraware Gateway** | job_worksheet_forms, accounting_form, job_info | **partial** | Field completeness scoring | Template completeness rules |
| **Finance / Job costing** | accounting_form, job_info | **partial** | Invoice columns | Template map + finance ACL |
| **HR / Safety** | (Moraware relevance low) | **no** | — | Only if ESF stores HR in Moraware custom fields—revisit later |
| **AI Takeoff readiness** | files_attachments, job_worksheet_forms | **no** | File catalog | Priority 5 file metadata |

---

## Sensitivity reminder

- **customer_contact**, **financial**, and **file** payloads require **`requireHeadAccess`**-compatible head design and dealer/internal separation.
- **Do not** expose Moraware file download URLs to browsers without threat modeling.

---

## Artifacts

- `npm run eos:audit:moraware-ui-coverage` → `debug/moraware/latest/moraware-ui-coverage-matrix.json`
