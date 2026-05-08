# Moraware SDK trace harness

This tiny **.NET Framework** console app uses Moraware’s official **`JobTrackerAPI5.dll`** and **`SimpleConsoleCommandTracer`** so you can see the **exact raw XML** the SDK sends for `GetJobForm` / `GetJobForms` with different field-inclusion modes.

## Prerequisites

1. Copy **`JobTrackerAPI5.dll`** (and any companion assemblies Moraware ships alongside it, if required at runtime) into:

   `tools/moraware-sdk-trace/lib/`

2. Run on a machine where **`net48`** builds and runs (typically **Windows** with the **.NET Framework 4.8 Developer Pack**). If `net48` does not compile on your Mac, use Windows—or try the optional **`MorawareSdkTrace.net8.csproj`** (`net8.0`) **only if** your Moraware DLL is compatible with modern .NET.

## Credentials (environment variables)

| Variable | Description |
|----------|-------------|
| `MORAWARE_URL` | API URL (e.g. `https://YOUR_INSTANCE.moraware.com/api.aspx`) |
| `MORAWARE_USERNAME` | Username |
| `MORAWARE_PASSWORD` | Password |
| `MORAWARE_JOB_ID` | Job id for `GetJobForms` (default: **37565**) |
| `MORAWARE_JOB_FORM_ID` | Job form id for `GetJobForm` (default: **140265**) |

## Run

Recommended (captures output to `debug/moraware/sdk-trace-output.txt`):

```bash
cd tools/moraware-sdk-trace
./run.sh
```

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
