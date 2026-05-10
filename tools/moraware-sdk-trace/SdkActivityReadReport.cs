using System;
using System.IO;
using System.Text;
using System.Text.Json;

namespace MorawareSdkTrace;

internal static class SdkActivityReadReport
{
    public static int Run()
    {
        var repoRoot = SdkAssignmentReport.FindRepoRoot();
        var relJson = Environment.GetEnvironmentVariable("MORAWARE_SDK_ACTIVITY_READ_PROBE_OUT_JSON")
                      ?? Path.Combine("debug", "moraware", "latest", "moraware-sdk-activity-read-probe.json");
        var relTxt = Environment.GetEnvironmentVariable("MORAWARE_SDK_ACTIVITY_READ_PROBE_OUT_TXT")
                     ?? Path.Combine("debug", "moraware", "latest", "moraware-sdk-activity-read-probe.txt");
        var outJson = Path.IsPathRooted(relJson) ? relJson : Path.Combine(repoRoot, relJson);
        var outTxt = Path.IsPathRooted(relTxt) ? relTxt : Path.Combine(repoRoot, relTxt);
        Directory.CreateDirectory(Path.GetDirectoryName(outJson) ?? ".");

        if (!MorawareProbeCredentials.TryResolve(out var url, out var user, out var pass, out var credErr))
        {
            var stub = new
            {
                generatedAt = DateTime.UtcNow.ToString("o"),
                skipped = true,
                reason = credErr,
                connected = false,
                attempts = Array.Empty<object>(),
                note = "Set MORAWARE_URL or MORAWARE_API_URL, MORAWARE_USERNAME, MORAWARE_PASSWORD."
            };
            var json = JsonSerializer.Serialize(stub, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(outJson, json, Encoding.UTF8);
            File.WriteAllText(outTxt, BuildTxtStub(credErr, outJson), Encoding.UTF8);
            Console.WriteLine("Wrote: " + outJson);
            return 0;
        }

        var jobId = ParseIntEnv("MORAWARE_SDK_PROBE_JOB_ID", 38837);
        var maxActivities = ParseIntEnv("MORAWARE_SDK_PROBE_MAX_ACTIVITIES", 50);
        int? explicitActivityId = null;
        var rawJa = Environment.GetEnvironmentVariable("MORAWARE_SDK_PROBE_JOB_ACTIVITY_ID");
        if (!string.IsNullOrWhiteSpace(rawJa) && int.TryParse(rawJa.Trim(), out var eja))
        {
            explicitActivityId = eja;
        }

        var report = SdkActivityReadProbe.Run(url, user, pass, jobId, explicitActivityId, maxActivities);

        var payload = new
        {
            generatedAt = DateTime.UtcNow.ToString("o"),
            repoHint = "Read-only SDK probe (allowlisted Get* only). Password never serialized.",
            credentials_ok = true,
            assignees_populated_on_any_activity = report.AssigneesPopulatedOnAnyActivity,
            windows_dependency_blocker = report.WindowsDependencyBlocker,
            probe = report
        };

        var jsonOut = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(outJson, jsonOut, Encoding.UTF8);
        File.WriteAllText(outTxt, BuildTxtReport(report, outJson), Encoding.UTF8);
        Console.WriteLine("Wrote: " + outJson);
        Console.WriteLine("Wrote: " + outTxt);
        return 0;
    }

    private static string BuildTxtStub(string reason, string outJson)
    {
        return string.Join("\n", new[]
        {
            "Moraware SDK — activity read probe (skipped)",
            "reason: " + reason,
            "",
            "Full JSON: " + outJson
        });
    }

    private static string BuildTxtReport(ActivityReadProbeReport r, string outJson)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Moraware SDK — activity read probe (allowlisted Get* only)");
        sb.AppendLine("generatedAt: " + r.GeneratedAt);
        sb.AppendLine("jobId: " + r.JobId + " maxActivities: " + r.MaxActivities);
        if (r.WindowsDependencyBlocker || !string.IsNullOrEmpty(r.TopLevelClassification))
        {
            sb.AppendLine("classification: " + (r.TopLevelClassification ?? (r.WindowsDependencyBlocker ? "windows_dependency_blocker" : "")));
        }

        if (!string.IsNullOrEmpty(r.TopLevelError))
        {
            sb.AppendLine("top_level_error: " + r.TopLevelError);
        }

        sb.AppendLine("assignees_populated_anywhere: " + r.AssigneesPopulatedOnAnyActivity);
        sb.AppendLine();
        foreach (var a in r.Attempts ?? new System.Collections.Generic.List<ActivityAttemptDto>())
        {
            sb.AppendLine(a.MethodName + " attempted=" + a.Attempted + " success=" + a.Success);
            sb.AppendLine("  " + a.Signature);
            if (!string.IsNullOrEmpty(a.SkipReason))
            {
                sb.AppendLine("  skip: " + a.SkipReason);
            }

            if (!string.IsNullOrEmpty(a.ErrorMessage))
            {
                sb.AppendLine("  error: " + a.ErrorMessage);
                if (a.WindowsDependencyBlocker)
                {
                    sb.AppendLine("  windows_dependency_blocker: true");
                }
            }

            if (a.ActivitySamples != null)
            {
                foreach (var s in a.ActivitySamples)
                {
                    sb.AppendLine($"    activity id={s.JobActivityId} type={s.JobActivityTypeName} assignees={s.AssigneesCount} notesLen={s.NotesLength}");
                }
            }

            sb.AppendLine();
        }

        sb.AppendLine("Full JSON: " + outJson);
        return sb.ToString();
    }

    private static int ParseIntEnv(string name, int defaultValue)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return defaultValue;
        }

        return int.TryParse(raw.Trim(), out var n) ? n : defaultValue;
    }
}
