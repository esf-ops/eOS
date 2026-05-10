using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace MorawareSdkTrace;

/// <summary>
/// Full read-only reflection inventory for Moraware.JobTrackerAPI5 (no API calls).
/// </summary>
internal static class SdkFullSurfaceCollector
{
    private const string TargetNs = "Moraware.JobTrackerAPI5";

    private static readonly Regex s_read = new Regex(
        @"\b(Get|List|Find|Query|Search|Download|Load|Fetch)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex s_write = new Regex(
        @"\b(Create|Update|Delete|Add|Remove|Convert|Import)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex s_assignment = new Regex(
        @"Activity|JobActivity|Assignee|Assigned|Resource|Calendar|Schedule|Machine|Employee|Crew|View|PageView",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static FullSurfaceReport Build(string assemblyPath)
    {
        var rpt = new FullSurfaceReport
        {
            GeneratedAt = DateTime.UtcNow.ToString("o"),
            DllPath = assemblyPath,
            AssemblyExists = File.Exists(assemblyPath)
        };

        if (!rpt.AssemblyExists)
        {
            rpt.Note = "DLL not found.";
            return rpt;
        }

        var asm = Assembly.LoadFrom(assemblyPath);
        rpt.AssemblyName = asm.GetName()?.Name;
        rpt.AssemblyVersion = asm.GetName()?.Version?.ToString();
        rpt.AssemblyFullName = asm.FullName;

        Type[] types;
        try
        {
            types = asm.GetExportedTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            rpt.Note = "GetExportedTypes had loader errors; using partial type list.";
            types = ex.Types.Where(t => t != null).ToArray();
        }

        var nsTypes = types
            .Where(t => t != null && string.Equals(t.Namespace, TargetNs, StringComparison.Ordinal))
            .OrderBy(t => t.FullName)
            .ToList();

        var typeSummaries = new List<FullTypeSummary>();
        var readMethods = new List<MethodRef>();
        var writeMethods = new List<MethodRef>();
        var assignmentHits = new List<MethodRef>();
        var assignmentTypes = new List<string>();

        foreach (var t in nsTypes)
        {
            var kind = InferKind(t);
            var fts = new FullTypeSummary
            {
                FullName = t.FullName,
                Kind = kind,
                IsPublic = t.IsPublic,
                BaseTypeName = t.BaseType?.FullName
            };

            try
            {
                fts.NestedPublicTypes = t.GetNestedTypes(BindingFlags.Public)
                    .Select(n => n.FullName)
                    .OrderBy(x => x)
                    .ToList();

                foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                {
                    if (!p.CanRead && !p.CanWrite)
                    {
                        continue;
                    }

                    fts.Properties.Add(new PropertyRef
                    {
                        Name = p.Name,
                        TypeName = p.PropertyType.FullName ?? p.PropertyType.Name,
                        CanRead = p.CanRead,
                        CanWrite = p.CanWrite
                    });
                }

                foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                {
                    if (m.IsSpecialName)
                    {
                        continue;
                    }

                    var mr = MethodRef.FromMethod(m);
                    fts.Methods.Add(mr);

                    if (s_read.IsMatch(m.Name))
                    {
                        readMethods.Add(mr);
                    }

                    if (s_write.IsMatch(m.Name))
                    {
                        writeMethods.Add(mr);
                    }

                    if (s_assignment.IsMatch(m.Name) || s_assignment.IsMatch(t.FullName ?? ""))
                    {
                        assignmentHits.Add(mr);
                    }
                }

                if (s_assignment.IsMatch(t.FullName ?? "") || s_assignment.IsMatch(t.Name))
                {
                    assignmentTypes.Add(t.FullName);
                }
            }
            catch (Exception ex)
            {
                fts.ReflectionNote = ex.Message;
            }

            typeSummaries.Add(fts);
        }

        rpt.Types = typeSummaries;
        rpt.LikelyReadMethods = readMethods
            .OrderBy(m => m.DeclaringType + "." + m.Name + m.ParameterSignature)
            .ToList();
        rpt.LikelyWriteMethods = writeMethods
            .OrderBy(m => m.DeclaringType + "." + m.Name + m.ParameterSignature)
            .ToList();
        rpt.LikelyAssignmentOrCalendarMethods = assignmentHits
            .OrderBy(m => m.DeclaringType + "." + m.Name + m.ParameterSignature)
            .Distinct(new MethodRefComparer())
            .ToList();
        rpt.LikelyAssignmentOrCalendarTypes = assignmentTypes.Distinct().OrderBy(x => x).ToList();

        var connType = asm.GetType(TargetNs + ".Connection", throwOnError: false);
        if (connType != null)
        {
            var max = ParseMaxMethods();
            var all = CollectConnectionMethods(connType, max);
            rpt.ConnectionMethodsFull = all;
        }

        return rpt;
    }

    private static int ParseMaxMethods()
    {
        var raw = Environment.GetEnvironmentVariable("MORAWARE_SDK_SURFACE_MAX_METHODS");
        if (string.IsNullOrWhiteSpace(raw))
        {
            return 0;
        }

        return int.TryParse(raw.Trim(), out var n) ? n : 0;
    }

    /// <summary>maxMethods &lt;= 0 means no cap.</summary>
    public static List<ConnectionMethodSignature> CollectConnectionMethods(Type connType, int maxMethods)
    {
        var list = connType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .Where(m => !m.IsSpecialName && m.DeclaringType != typeof(object))
            .OrderBy(m => m.Name, StringComparer.Ordinal)
            .ThenBy(m => m.GetParameters().Length)
            .ThenBy(m => string.Join(",", m.GetParameters().Select(p => p.ParameterType.Name)), StringComparer.Ordinal)
            .Select(m => new ConnectionMethodSignature
            {
                Name = m.Name,
                DeclaringType = m.DeclaringType?.FullName,
                ReturnType = m.ReturnType.FullName ?? m.ReturnType.Name,
                ParameterSignature = "(" + string.Join(", ", m.GetParameters().Select(p => (p.ParameterType.FullName ?? p.ParameterType.Name) + " " + p.Name)) + ")"
            })
            .ToList();

        if (maxMethods > 0 && list.Count > maxMethods)
        {
            return list.Take(maxMethods).ToList();
        }

        return list;
    }

    private static string InferKind(Type t)
    {
        if (t.IsEnum)
        {
            return "enum";
        }

        if (t.IsInterface)
        {
            return "interface";
        }

        if (t.IsValueType)
        {
            return "struct";
        }

        return "class";
    }

    public static void WriteReports(string repoRoot, string assemblyPath)
    {
        var relJson = Environment.GetEnvironmentVariable("MORAWARE_SDK_FULL_SURFACE_OUT_JSON")
                      ?? Path.Combine("debug", "moraware", "latest", "moraware-sdk-full-surface.json");
        var relTxt = Environment.GetEnvironmentVariable("MORAWARE_SDK_FULL_SURFACE_OUT_TXT")
                     ?? Path.Combine("debug", "moraware", "latest", "moraware-sdk-full-surface.txt");
        var outJson = Path.IsPathRooted(relJson) ? relJson : Path.Combine(repoRoot, relJson);
        var outTxt = Path.IsPathRooted(relTxt) ? relTxt : Path.Combine(repoRoot, relTxt);
        Directory.CreateDirectory(Path.GetDirectoryName(outJson) ?? ".");

        var report = Build(assemblyPath);
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        });
        File.WriteAllText(outJson, json, Encoding.UTF8);

        var sb = new StringBuilder();
        sb.AppendLine("Moraware SDK — FULL surface (Moraware.JobTrackerAPI5, reflection only)");
        sb.AppendLine("generatedAt: " + report.GeneratedAt);
        sb.AppendLine("dll: " + report.DllPath);
        sb.AppendLine("assembly: " + report.AssemblyFullName);
        sb.AppendLine("types_in_namespace_count: " + report.Types.Count);
        sb.AppendLine();
        sb.AppendLine("--- Connection public methods (all, alphabetical) ---");
        foreach (var m in report.ConnectionMethodsFull ?? new List<ConnectionMethodSignature>())
        {
            sb.AppendLine(m.Name + m.ParameterSignature + " -> " + m.ReturnType + " [" + m.DeclaringType + "]");
        }

        sb.AppendLine();
        sb.AppendLine("--- Likely read/query methods count=" + report.LikelyReadMethods.Count + " ---");
        foreach (var m in report.LikelyReadMethods)
        {
            sb.AppendLine(m.DeclaringType + "." + m.Name + m.ParameterSignature);
        }

        sb.AppendLine();
        sb.AppendLine("--- Likely write/mutation methods count=" + report.LikelyWriteMethods.Count + " ---");
        foreach (var m in report.LikelyWriteMethods)
        {
            sb.AppendLine(m.DeclaringType + "." + m.Name + m.ParameterSignature);
        }

        sb.AppendLine();
        sb.AppendLine("--- Assignment/calendar-related types count=" + report.LikelyAssignmentOrCalendarTypes.Count + " ---");
        foreach (var tn in report.LikelyAssignmentOrCalendarTypes)
        {
            sb.AppendLine(tn);
        }

        sb.AppendLine();
        sb.AppendLine("--- Likely assignment/calendar-related methods count=" + report.LikelyAssignmentOrCalendarMethods.Count + " ---");
        foreach (var m in report.LikelyAssignmentOrCalendarMethods)
        {
            sb.AppendLine(m.DeclaringType + "." + m.Name + m.ParameterSignature + " -> " + m.ReturnType);
        }

        sb.AppendLine();
        sb.AppendLine("--- All public types in " + TargetNs + " (count=" + report.Types.Count + ") ---");
        foreach (var fts in report.Types)
        {
            sb.AppendLine();
            sb.AppendLine("TYPE " + fts.FullName + " [" + fts.Kind + "] public=" + fts.IsPublic + " base=" + fts.BaseTypeName);
            if (!string.IsNullOrEmpty(fts.ReflectionNote))
            {
                sb.AppendLine("  reflection_note: " + fts.ReflectionNote);
            }

            foreach (var n in fts.NestedPublicTypes)
            {
                sb.AppendLine("  nested: " + n);
            }

            foreach (var p in fts.Properties.OrderBy(x => x.Name))
            {
                sb.AppendLine("  prop " + p.Name + " : " + p.TypeName + " read=" + p.CanRead + " write=" + p.CanWrite);
            }

            foreach (var m in fts.Methods.OrderBy(x => x.Name).ThenBy(x => x.ParameterSignature))
            {
                sb.AppendLine("  method " + m.Name + m.ParameterSignature + " -> " + m.ReturnType);
            }
        }

        File.WriteAllText(outTxt, sb.ToString(), Encoding.UTF8);
        Console.WriteLine("Wrote: " + outJson);
        Console.WriteLine("Wrote: " + outTxt);
    }

    private sealed class MethodRefComparer : IEqualityComparer<MethodRef>
    {
        public bool Equals(MethodRef x, MethodRef y)
        {
            if (x == null || y == null)
            {
                return false;
            }

            return x.DeclaringType == y.DeclaringType && x.Name == y.Name && x.ParameterSignature == y.ParameterSignature;
        }

        public int GetHashCode(MethodRef obj)
        {
            return (obj.DeclaringType + obj.Name + obj.ParameterSignature).GetHashCode();
        }
    }
}

internal sealed class FullSurfaceReport
{
    public string GeneratedAt { get; set; }
    public string DllPath { get; set; }
    public bool AssemblyExists { get; set; }
    public string Note { get; set; }
    public string AssemblyName { get; set; }
    public string AssemblyVersion { get; set; }
    public string AssemblyFullName { get; set; }
    public List<FullTypeSummary> Types { get; set; } = new List<FullTypeSummary>();
    public List<ConnectionMethodSignature> ConnectionMethodsFull { get; set; } = new List<ConnectionMethodSignature>();
    public List<MethodRef> LikelyReadMethods { get; set; } = new List<MethodRef>();
    public List<MethodRef> LikelyWriteMethods { get; set; } = new List<MethodRef>();
    public List<MethodRef> LikelyAssignmentOrCalendarMethods { get; set; } = new List<MethodRef>();
    public List<string> LikelyAssignmentOrCalendarTypes { get; set; } = new List<string>();
}

internal sealed class FullTypeSummary
{
    public string FullName { get; set; }
    public string Kind { get; set; }
    public bool IsPublic { get; set; }
    public string BaseTypeName { get; set; }
    public string ReflectionNote { get; set; }
    public List<string> NestedPublicTypes { get; set; } = new List<string>();
    public List<PropertyRef> Properties { get; set; } = new List<PropertyRef>();
    public List<MethodRef> Methods { get; set; } = new List<MethodRef>();
}

internal sealed class PropertyRef
{
    public string Name { get; set; }
    public string TypeName { get; set; }
    public bool CanRead { get; set; }
    public bool CanWrite { get; set; }
}

internal sealed class MethodRef
{
    public string DeclaringType { get; set; }
    public string Name { get; set; }
    public string ReturnType { get; set; }
    public string ParameterSignature { get; set; }

    public static MethodRef FromMethod(MethodInfo m)
    {
        return new MethodRef
        {
            DeclaringType = m.DeclaringType?.FullName ?? "",
            Name = m.Name,
            ReturnType = m.ReturnType.FullName ?? m.ReturnType.Name,
            ParameterSignature = "(" + string.Join(", ", m.GetParameters().Select(p => (p.ParameterType.FullName ?? p.ParameterType.Name) + " " + p.Name)) + ")"
        };
    }
}

internal sealed class ConnectionMethodSignature
{
    public string Name { get; set; }
    public string DeclaringType { get; set; }
    public string ReturnType { get; set; }
    public string ParameterSignature { get; set; }
}
