using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace MorawareSdkTrace;

/// <summary>
/// Writes moraware-sdk-activity-assignment-surface.{json,txt} — read-only surface + optional live probe.
/// </summary>
internal static class SdkAssignmentReport
{
    public static int Run()
    {
        var repoRoot = FindRepoRoot();
        var asmPath = SdkSurfaceInspector.ResolveAssemblyPath();
        SdkFullSurfaceCollector.WriteReports(repoRoot, asmPath);

        var relJson = Environment.GetEnvironmentVariable("MORAWARE_SDK_SURFACE_OUT_JSON")
                      ?? Path.Combine("debug", "moraware", "latest", "moraware-sdk-activity-assignment-surface.json");
        var relTxt = Environment.GetEnvironmentVariable("MORAWARE_SDK_SURFACE_OUT_TXT")
                     ?? Path.Combine("debug", "moraware", "latest", "moraware-sdk-activity-assignment-surface.txt");
        var outJson = Path.IsPathRooted(relJson) ? relJson : Path.Combine(repoRoot, relJson);
        var outTxt = Path.IsPathRooted(relTxt) ? relTxt : Path.Combine(repoRoot, relTxt);

        Directory.CreateDirectory(Path.GetDirectoryName(outJson) ?? ".");

        var surface = SdkSurfaceInspector.Collect(asmPath);

        ActivityProbeResult probe = null;
        var includeLive = string.Equals(
            Environment.GetEnvironmentVariable("MORAWARE_SDK_ASSIGNMENT_INCLUDE_LIVE_PROBE"),
            "1",
            StringComparison.OrdinalIgnoreCase);

        if (includeLive)
        {
            if (!MorawareProbeCredentials.TryResolve(out var url, out var user, out var pass, out var credErr))
            {
                probe = new ActivityProbeResult { SkippedReason = credErr };
            }
            else
            {
                var jobId = ParseIntEnv("MORAWARE_SDK_PROBE_JOB_ID", 38837);
                var maxAct = ParseIntEnv("MORAWARE_SDK_PROBE_MAX_ACTIVITIES", 12);
                probe = SdkActivityAssignmentProbe.Run(url, user, pass, jobId, maxAct);
            }
        }
        else
        {
            probe = new ActivityProbeResult
            {
                SkippedReason =
                    "Set MORAWARE_SDK_ASSIGNMENT_INCLUDE_LIVE_PROBE=1 with MORAWARE_URL or MORAWARE_API_URL plus USERNAME/PASSWORD to run read-only Connection probe (default off)."
            };
        }

        var report = new Dictionary<string, object>
        {
            ["generatedAt"] = DateTime.UtcNow.ToString("o"),
            ["repoHint"] = "No credentials serialized. Tracer disabled for assignment mode.",
            ["sdk_surface"] = surface,
            ["read_only_activity_probe"] = probe,
            ["xml_api_comparison_note"] =
                "eOS Node path uses jobQuery/jobActivityQuery XML; this report reflects .NET JobTrackerAPI5.dll surface. Align names with Moraware official docs."
        };

        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(outJson, json, Encoding.UTF8);

        var txt = new StringBuilder();
        txt.AppendLine("Moraware SDK — activity assignment / resource surface (read-only)");
        txt.AppendLine("generatedAt: " + report["generatedAt"]);
        txt.AppendLine();
        txt.AppendLine("Assembly: " + asmPath);
        txt.AppendLine("Assembly exists: " + surface.AssemblyExists);
        if (!string.IsNullOrEmpty(surface.Note))
        {
            txt.AppendLine("Surface note: " + surface.Note);
        }

        txt.AppendLine();
        txt.AppendLine("--- Types matching Activity/Calendar/Resource/Assigned/... (sample) ---");
        foreach (var t in surface.MatchingTypes.Take(40))
        {
            txt.AppendLine("TYPE " + t.TypeFullName);
            foreach (var p in t.PublicProperties.Take(25))
            {
                txt.AppendLine("  prop: " + p);
            }

            foreach (var m in t.PublicMethods.Take(25))
            {
                txt.AppendLine("  method: " + m);
            }
        }

        if (surface.TypesTruncated == true)
        {
            txt.AppendLine("(types list truncated — see JSON)");
        }

        txt.AppendLine();
        txt.AppendLine("--- Connection public methods (concise; full alphabetical list in moraware-sdk-full-surface.txt) ---");
        foreach (var m in surface.ConnectionAllPublicMethodNames.Take(80))
        {
            txt.AppendLine(m);
        }

        txt.AppendLine();
        txt.AppendLine("--- Live probe ---");
        txt.AppendLine(probe.SkippedReason ?? (probe.Error ?? "ok"));
        if (!string.IsNullOrEmpty(probe.InvokedMethod))
        {
            txt.AppendLine("Invoked: " + probe.InvokedMethod);
            txt.AppendLine("Job CLR type: " + probe.JobObjectTypeName);
            txt.AppendLine("Activity collection property: " + probe.ActivityCollectionPropertyName);
            foreach (var d in probe.ActivityDetails.Take(20))
            {
                txt.AppendLine(
                    $"  activity idx={d.Index} id={d.JobActivityId} type={d.JobActivityTypeName} status={d.JobActivityStatusName} start={d.StartDate} sched={d.ScheduledTime} dur={d.ScheduledDuration} notesLen={d.NotesLength} assignees={d.AssigneesCount}");
                foreach (var a in d.Assignees.Take(12))
                {
                    txt.AppendLine($"    assignee id={a.AssigneeId} name={a.AssigneeName} descLen={a.DescriptionLength}");
                }
            }

            foreach (var s in probe.ActivityPropertyNameSamples)
            {
                txt.AppendLine("  activity[" + s.Index + "] type=" + s.ClrType);
                txt.AppendLine("    props: " + string.Join(", ", s.PropertyNames.Take(40)));
            }
        }

        File.WriteAllText(outTxt, txt.ToString(), Encoding.UTF8);

        Console.WriteLine("Wrote: " + outJson);
        Console.WriteLine("Wrote: " + outTxt);
        return 0;
    }

    internal static string FindRepoRoot()
    {
        var env = Environment.GetEnvironmentVariable("MORAWARE_SDK_REPORT_REPO_ROOT");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return Path.GetFullPath(env.Trim());
        }

        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        for (var i = 0; i < 12 && dir != null; i++)
        {
            if (File.Exists(Path.Combine(dir.FullName, "package.json")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        return Directory.GetCurrentDirectory();
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
