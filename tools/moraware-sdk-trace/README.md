# Moraware SDK trace harness

This tiny **.NET** console app uses Moraware’s official **`JobTrackerAPI5.dll`** and **`SimpleConsoleCommandTracer`** so you can:

- **`MORAWARE_SDK_TRACE_MODE=forms` (default)** — see the **exact raw XML** the SDK sends for `GetJobForm` / `GetJobForms` with different field-inclusion modes.  
- **`MORAWARE_SDK_TRACE_MODE=assignment`** — **read-only** reflection over the DLL (public type/member names related to Activity/Calendar/Resource/Assigned/…) plus an **optional** live `Connection` probe (sanitized activity/assignee fields; see below). Writes `debug/moraware/latest/moraware-sdk-activity-assignment-surface.{json,txt}` and **always** also writes the **full namespace inventory**: `debug/moraware/latest/moraware-sdk-full-surface.{json,txt}`.  
- **`MORAWARE_SDK_TRACE_MODE=full-surface`** — reflection-only: writes **only** `moraware-sdk-full-surface.{json,txt}` (entire `Moraware.JobTrackerAPI5` public surface + filtered sections + full `Connection` method list). From repo: `npm run eos:inspect:moraware-sdk-full`.  
- **`MORAWARE_SDK_TRACE_MODE=activity-read-probe`** — live **allowlisted** **`Connection`** **`GetJob*` / `GetJobActivity*`** calls only; writes `debug/moraware/latest/moraware-sdk-activity-read-probe.{json,txt}`. From repo: `npm run eos:probe:moraware-sdk-activity-read`. Env: `MORAWARE_URL` or `MORAWARE_API_URL`, `MORAWARE_USERNAME`, `MORAWARE_PASSWORD`; `MORAWARE_SDK_PROBE_JOB_ID`, optional `MORAWARE_SDK_PROBE_JOB_ACTIVITY_ID`, `MORAWARE_SDK_PROBE_MAX_ACTIVITIES`.

## Prerequisites

1. Copy **`JobTrackerAPI5.dll`** (and any companion assemblies Moraware ships alongside it, if required at runtime) into:

   `tools/moraware-sdk-trace/lib/`

2. Run on a machine where **`net48`** builds and runs (typically **Windows** with the **.NET Framework 4.8 Developer Pack**). If `net48` does not compile on your Mac, use Windows—or try the optional **`MorawareSdkTrace.net8.csproj`** (`net8.0`) **only if** your Moraware DLL is compatible with modern .NET.

## Credentials (environment variables)

| Variable | Description |
|----------|-------------|
| `MORAWARE_URL` | API URL (e.g. `https://YOUR_INSTANCE.moraware.com/api.aspx`). For the **assignment live probe** only, **`MORAWARE_API_URL`** is used as a fallback when `MORAWARE_URL` is unset (matches common Node sync env). |
| `MORAWARE_USERNAME` | Username |
| `MORAWARE_PASSWORD` | Password |
| `MORAWARE_JOB_ID` | Job id for `GetJobForms` (default: **37565**) |
| `MORAWARE_JOB_FORM_ID` | Job form id for `GetJobForm` (default: **140265**) |

## Run (forms trace — raw XML)

Recommended (captures output to `debug/moraware/sdk-trace-output.txt`):

```bash
cd tools/moraware-sdk-trace
./run.sh
```

## Run (assignment / SDK surface — no raw XML trace)

Requires `lib/JobTrackerAPI5.dll`. From repository root:

```bash
./tools/moraware-sdk-trace/run-assignment-surface.sh
```

Or:

```bash
export MORAWARE_SDK_TRACE_MODE=assignment
dotnet run --project tools/moraware-sdk-trace/MorawareSdkTrace.net8.csproj
```

**Optional live read-only probe** (still no job mutations; uses `Connection` + reflection):

```bash
export MORAWARE_SDK_ASSIGNMENT_INCLUDE_LIVE_PROBE=1
export MORAWARE_URL="https://YOUR_INSTANCE.moraware.com/api.aspx"
# or: export MORAWARE_API_URL="https://YOUR_INSTANCE.moraware.com/api.aspx"
export MORAWARE_USERNAME="..."
export MORAWARE_PASSWORD="..."
export MORAWARE_SDK_PROBE_JOB_ID=38837   # optional
./tools/moraware-sdk-trace/run-assignment-surface.sh
```

From Node (writes a **stub** if `dotnet` or the DLL is missing):

```bash
npm run eos:inspect:moraware-sdk-assignment
npm run eos:inspect:moraware-sdk-full
```

**Full surface env (optional):**

| Variable | Description |
|----------|-------------|
| `MORAWARE_SDK_FULL_SURFACE_OUT_JSON` / `MORAWARE_SDK_FULL_SURFACE_OUT_TXT` | Override output paths for full-surface reports. |
| `MORAWARE_SDK_SURFACE_MAX_METHODS` | Cap `Connection` method rows in JSON/TXT; **`0` or unset = no cap**. |

Manual build/run (primary **net48** project; required when multiple `.csproj` files exist in this folder):

```bash
cd tools/moraware-sdk-trace
dotnet run --project MorawareSdkTrace.csproj
```

## Output

`run.sh` captures stdout/stderr to the repo path:

`debug/moraware/sdk-trace-output.txt`

That file may contain **session IDs** and **credentials-related material** in traced XML. **Do not commit** credentials, live URLs with embedded secrets, or trace files that contain session identifiers.

## Optional: .NET 8 project file

If the Moraware DLL works on modern .NET on your platform:

```bash
dotnet run --project MorawareSdkTrace.net8.csproj
```
