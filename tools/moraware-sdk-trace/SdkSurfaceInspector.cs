using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;

namespace MorawareSdkTrace;

/// <summary>
/// Read-only reflection over JobTrackerAPI5.dll: public type/member names only (no live API calls).
/// </summary>
internal static class SdkSurfaceInspector
{
    private static readonly Regex s_keyword = new Regex(
        @"Activity|JobActivity|Calendar|Schedule|Resource|Assigned|Assignee|Employee|Machine|User|View|Crew|WorkCenter|Appointment",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static SdkSurfaceResult Collect(string assemblyPath)
    {
        var result = new SdkSurfaceResult
        {
            AssemblyPath = assemblyPath,
            AssemblyExists = File.Exists(assemblyPath)
        };

        if (!result.AssemblyExists)
        {
            result.Note = "JobTrackerAPI5.dll not found at expected path. Copy Moraware SDK DLL into tools/moraware-sdk-trace/lib/ and build.";
            return result;
        }

        var asm = Assembly.LoadFrom(assemblyPath);
        result.AssemblyFullName = asm.FullName;

        Type[] types;
        try
        {
            types = asm.GetExportedTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            result.Note = "GetExportedTypes failed (loader exceptions). Falling back to GetTypes.";
            types = ex.Types.Where(t => t != null).ToArray();
        }

        var matching = new List<TypeMemberSummary>();
        foreach (var t in types.OrderBy(t => t.FullName))
        {
            if (t == null)
            {
                continue;
            }

            if (!s_keyword.IsMatch(t.FullName ?? "") && !s_keyword.IsMatch(t.Name))
            {
                continue;
            }

            var entry = new TypeMemberSummary
            {
                TypeFullName = t.FullName,
                IsPublic = t.IsPublic,
                BaseTypeName = t.BaseType?.FullName
            };

            try
            {
                entry.PublicProperties = t.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                    .Select(p => p.Name)
                    .Distinct()
                    .OrderBy(n => n)
                    .Take(120)
                    .ToList();

                entry.PublicMethods = t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                    .Where(m => !m.IsSpecialName)
                    .Select(m => m.Name + "(" + string.Join(",", m.GetParameters().Select(p => p.ParameterType.Name)) + ")")
                    .Distinct()
                    .OrderBy(n => n)
                    .Take(160)
                    .ToList();
            }
            catch
            {
                entry.ReflectionNote = "partial_failure";
            }

            matching.Add(entry);
            if (matching.Count >= 400)
            {
                result.TypesTruncated = true;
                break;
            }
        }

        result.MatchingTypes = matching;

        // Connection type is the primary entry — always summarize if present.
        var connType = asm.GetType("Moraware.JobTrackerAPI5.Connection", throwOnError: false);
        if (connType != null)
        {
            var cm = new TypeMemberSummary
            {
                TypeFullName = connType.FullName,
                IsPublic = connType.IsPublic,
                BaseTypeName = connType.BaseType?.FullName
            };
            cm.PublicMethods = connType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => !m.IsSpecialName && s_keyword.IsMatch(m.Name))
                .Select(m => m.Name + "(" + string.Join(",", m.GetParameters().Select(p => p.ParameterType.Name)) + ")")
                .Distinct()
                .OrderBy(n => n)
                .Take(200)
                .ToList();
            cm.PublicProperties = connType.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => s_keyword.IsMatch(p.Name))
                .Select(p => p.Name)
                .Distinct()
                .OrderBy(n => n)
                .Take(120)
                .ToList();
            result.ConnectionKeywordMembers = cm;

            result.ConnectionAllPublicMethodNames = connType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => !m.IsSpecialName && m.DeclaringType == connType)
                .Select(m => m.Name)
                .Distinct()
                .OrderBy(n => n)
                .Take(220)
                .ToList();
        }

        return result;
    }

    public static string ResolveAssemblyPath()
    {
        var baseDir = AppDomain.CurrentDomain.BaseDirectory ?? "";
        var candidates = new[]
        {
            Path.Combine(baseDir, "JobTrackerAPI5.dll"),
            Path.Combine(baseDir, "..", "..", "..", "lib", "JobTrackerAPI5.dll"),
            Path.Combine(baseDir, "..", "..", "..", "..", "lib", "JobTrackerAPI5.dll"),
            Path.Combine(AppContext.BaseDirectory, "lib", "JobTrackerAPI5.dll")
        };
        foreach (var c in candidates)
        {
            var full = Path.GetFullPath(c);
            if (File.Exists(full))
            {
                return full;
            }
        }

        return Path.Combine(baseDir, "JobTrackerAPI5.dll");
    }
}

internal sealed class SdkSurfaceResult
{
    public string AssemblyPath { get; set; }
    public bool AssemblyExists { get; set; }
    public string AssemblyFullName { get; set; }
    public string Note { get; set; }
    public bool TypesTruncated { get; set; }
    public List<TypeMemberSummary> MatchingTypes { get; set; } = new List<TypeMemberSummary>();
    public TypeMemberSummary ConnectionKeywordMembers { get; set; }

    /// <summary>Declared-only public method names on Connection (names only).</summary>
    public List<string> ConnectionAllPublicMethodNames { get; set; } = new List<string>();
}

internal sealed class TypeMemberSummary
{
    public string TypeFullName { get; set; }
    public bool IsPublic { get; set; }
    public string BaseTypeName { get; set; }
    public string ReflectionNote { get; set; }
    public List<string> PublicProperties { get; set; } = new List<string>();
    public List<string> PublicMethods { get; set; } = new List<string>();
}
