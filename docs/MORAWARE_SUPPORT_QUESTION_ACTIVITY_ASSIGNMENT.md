# Moraware support — activity “Assigned To” / calendar resource for API consumers

**Draft message** (edit tenant-specific details before sending):

---

Subject: Which API or SDK surface exposes job activity “Assigned To” / calendar machine row?

Hello Moraware support,

We are integrating with the Moraware **read-only** API / **JobTrackerAPI5** SDK to reproduce our **Machines** calendar view inside our own system (Elite / eOS).

**UI reference**

- Web calendar: `/sys/calendar?view=146&effdate=2026-05-07`  
- View: **Machines**  
- Activity types shown: **Saw**, **Polish**  
- Rows are labeled with our equipment names (e.g. Robot 1, Saber 1–2, Titan 1–4, Titan 7–8).

**What we see today**

Using `jobQuery` / `jobActivityQuery`-style XML against the HTTP API, we reliably get per-job activities with **activity type**, **status**, **startDate**, **schedTime**, **duration**, **notes**, **description**, and **phase**-related fields — enough to reconstruct **schedule and completion** for Saw/Polish.

We **cannot** find a stable field on the activity payload that corresponds to the **calendar row / Assigned To / machine resource** shown in the Machines UI. Speculative includes (e.g. `assignedTo`, `resource`, `employee`, `machine`, `calendarResource`, …) have not surfaced that assignment in our samples.

**XML include probe (eOS `probeMorawareAssigneeXml`)**  
We tried read-only **`jobActivityQuery`** / **`jobQuery` → `jobActivity`** includes (baseline + one tag each), including at least: **`assignees`**, **`assignee`**, **`Assignees`**, **`Assignee`**, **`jobActivityAssignees`**, **`jobActivityAssignee`**, **`activityAssignees`**, **`activityAssignee`**, **`assignedTo`**, **`assigned`**, **`resources`**, **`resource`**, **`calendarResource`**, **`scheduleResource`**. In our run these did **not** expose assignee payloads (**Outcome C2** in `machines-assignee-xml-probe.json`).

**SDK reflection (JobTrackerAPI5.dll)**  
Read-only reflection of the .NET SDK shows **`JobActivity.Assignees`** and an **`Assignee`** shape with **`AssigneeName`** (and related ids/metadata). An offline scan of **`Connection`** methods (`npm run eos:analyze:moraware-sdk-activity` → `moraware-sdk-activity-method-analysis.*`) ranks top read candidates including **`GetJobActivity`**, **`GetJobActivities`**, **`GetJobActivitiesForSeries`**, **`GetJob`**, **`GetJobActivityTypes`**, **`GetJobActivityStatuses`**.

**SDK targeted read probe**  
We run an allowlisted live **`Connection`** probe (`npm run eos:probe:moraware-sdk-activity-read` → `moraware-sdk-activity-read-probe.*`) that invokes those **`Get*`** methods (with safe defaults for boolean parameters) and reports whether **`Assignees`** counts are non-zero on returned **`JobActivity`** instances.

**Question for Moraware:** Are **`GetJobActivity`**, **`GetJobActivities`**, **`GetJobActivitiesForSeries`**, and **`GetJob`** the **correct** supported ways to retrieve **`JobActivity`** graphs such that **`JobActivity.Assignees`** / **`Assignee.AssigneeName`** are populated? What **arguments** (e.g. **`includeJobPhases`**, **`includeJobActivitySeriesMember`**, **`includeContacts`**) are required for assignees to load?

**Question for Moraware (XML vs SDK):** Is **`JobActivity.Assignees` / `Assignee.AssigneeName`** the correct authoritative source for **Machines** calendar **row assignment** in the UI? What is the **exact XML `<include>`** for `jobActivityQuery` (or nested `jobQuery` activity) that returns those fields, **or** which **`Connection` read method** and overload (flags / includes) is supported to return **`JobActivity`** objects with **`Assignees`** populated?

**SDK live probe on Mac**  
A read-only **`Connection`** probe on macOS may fail loading **`System.Windows.Forms`** (Moraware dependency). Use **Windows / .NET Framework** for live SDK confirmation, or rely on the **XML assignee probe** (`npm run eos:probe:moraware-assignee-xml` → `machines-assignee-xml-probe.json`).

**Question**

For a **job-scoped activity** (especially Saw/Polish) scheduled on the Machines calendar:

1. **Specifically:** What **XML/API `<include>`** (on **`jobActivityQuery`** or nested **`jobQuery` → `jobActivity`**) exposes **`JobActivity.Assignees`** / **`AssigneeName`** (or the equivalent machine/calendar-row assignment) for API consumers?  
2. Which **API command** and **`<include>`** elements (or query shape) return the activity’s **assigned resource / calendar row / “Assigned To”** as shown in the UI?  
3. If that data is **not** on `jobActivity` in the XML API, which **SDK** type and property (e.g. on `Connection`, job, or activity) exposes it for read-only use?  
4. If the assignment exists only in **web calendar** rendering, is there a **supported** read-only way (other than scraping HTML) to obtain the same machine row mapping?

We only need **read** access; we are not writing back to Moraware from this path.

Thank you.

---

**Internal references**

- Discovery: `docs/MORAWARE_MACHINES_CALENDAR_DISCOVERY.md`  
- SDK surface tool: `tools/moraware-sdk-trace/README.md` (`MORAWARE_SDK_TRACE_MODE=assignment`; full inventory `moraware-sdk-full-surface.*` or `npm run eos:inspect:moraware-sdk-full`)  
- eOS XML discovery: `backend-core/src/scripts/discoverMorawareMachinesCalendar.js` → `machines-assignment-key-discovery.*`  
- SDK-aligned XML assignee probe: `npm run eos:probe:moraware-assignee-xml` → `machines-assignee-xml-probe.*`  
- Offline Connection read-method ranking: `npm run eos:analyze:moraware-sdk-activity` → `moraware-sdk-activity-method-analysis.*`  
- Live allowlisted SDK read probe: `npm run eos:probe:moraware-sdk-activity-read` → `moraware-sdk-activity-read-probe.*`
