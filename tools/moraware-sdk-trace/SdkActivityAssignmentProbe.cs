using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Moraware.JobTrackerAPI5;
using Moraware.JobTrackerAPI5.DevelopmentAssistance;

namespace MorawareSdkTrace;

/// <summary>
/// Read-only live probe: connect, reflect <see cref="Connection"/>, optionally invoke safe getters for a job id.
/// Never invokes methods whose names suggest mutation.
/// </summary>
internal static class SdkActivityAssignmentProbe
{
    private static readonly Regex s_mutating = new Regex(
        @"^(Set|Delete|Update|Save|Create|Remove|Add|Clear|Insert|Post|Put|Commit|Disconnect|Convert|Import)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex s_forbiddenName = new Regex(
        @"\b(Create|Update|Delete|Add|Remove|Convert|Import)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex s_interesting = new Regex(
        @"Job|Activity|Calendar|Schedule|Resource|Assigned|Assignee|Employee|Machine|Crew|View|Appointment",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static ActivityProbeResult Run(string url, string user, string pass, int jobId, int maxActivitySample)
    {
        var result = new ActivityProbeResult { JobId = jobId };
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
        {
            result.SkippedReason = "Missing MORAWARE_URL or MORAWARE_API_URL, or missing USERNAME/PASSWORD.";
            return result;
        }

        var tracer = new SimpleConsoleCommandTracer(false, false);
        var conn = new Connection(url, user, pass, tracer);
        try
        {
            conn.Connect();
            result.Connected = true;

            var connType = conn.GetType();
            result.ConnectionTypeName = connType.FullName;

            var methods = connType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => !m.IsSpecialName && m.DeclaringType == connType)
                .ToList();

            result.ConnectionMethodsMatchingInterest = methods
                .Where(m => s_interesting.IsMatch(m.Name))
                .Select(m => FormatMethod(m))
                .Distinct()
                .OrderBy(s => s)
                .Take(200)
                .ToList();

            result.ConnectionMethodsSample = methods
                .Select(m => m.Name)
                .Distinct()
                .OrderBy(s => s)
                .Take(120)
                .ToList();

            TryInvokeJobGetters(conn, jobId, result, maxActivitySample);
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
        }
        finally
        {
            try
            {
                if (result.Connected)
                {
                    conn.Disconnect();
                }
            }
            catch
            {
                // ignore
            }
        }

        return result;
    }

    private static string FormatMethod(MethodInfo m)
    {
        var ps = string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name));
        return m.Name + "(" + ps + ")";
    }

    private static bool IsSafeJobGetter(MethodInfo m)
    {
        if (m.IsSpecialName || !m.IsPublic)
        {
            return false;
        }

        if (s_mutating.IsMatch(m.Name) || s_forbiddenName.IsMatch(m.Name))
        {
            return false;
        }

        return true;
    }

    private static void TryInvokeJobGetters(object conn, int jobId, ActivityProbeResult result, int maxActivitySample)
    {
        var connType = conn.GetType();
        var candidateNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "GetJob",
            "GetJobDetail",
            "LoadJob",
            "QueryJob",
            "FetchJob"
        };

        var methods = connType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .Where(m => candidateNames.Contains(m.Name))
            .Where(IsSafeJobGetter)
            .OrderBy(m => m.Name, StringComparer.Ordinal)
            .ThenBy(m => m.GetParameters().Length)
            .ToList();

        foreach (var m in methods)
        {
            var ps = m.GetParameters();
            object[] args;
            string sigLabel;

            if (ps.Length == 1 && ps[0].ParameterType == typeof(int))
            {
                args = new object[] { jobId };
                sigLabel = m.Name + "(int)";
            }
            else if (ps.Length == 2 && ps[0].ParameterType == typeof(int) && ps[1].ParameterType == typeof(bool))
            {
                args = new object[] { jobId, true };
                sigLabel = m.Name + "(int,bool)";
            }
            else
            {
                continue;
            }

            try
            {
                var jobObj = m.Invoke(conn, args);
                result.InvokedMethod = sigLabel;
                result.JobObjectTypeName = jobObj?.GetType().FullName;
                if (jobObj == null)
                {
                    return;
                }

                SummarizeJobObject(jobObj, result, maxActivitySample);
                return;
            }
            catch (Exception ex)
            {
                result.InvokeAttempts.Add(sigLabel + ": " + ex.Message);
            }
        }
    }

    private static PropertyInfo PickActivityCollectionProperty(Type t)
    {
        var props = t.GetProperties(BindingFlags.Public | BindingFlags.Instance).ToList();
        var orderedNames = new[]
        {
            "JobActivities",
            "Activities",
            "JobActivityList",
            "CalendarActivities",
            "ScheduledActivities"
        };

        foreach (var name in orderedNames)
        {
            var p = props.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.Ordinal));
            if (p != null)
            {
                return p;
            }
        }

        foreach (var p in props)
        {
            if (p.Name.IndexOf("JobActivity", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return p;
            }
        }

        foreach (var p in props)
        {
            if (p.Name.IndexOf("activ", StringComparison.OrdinalIgnoreCase) >= 0 ||
                p.Name.IndexOf("calendar", StringComparison.OrdinalIgnoreCase) >= 0 ||
                p.Name.IndexOf("schedule", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return p;
            }
        }

        return null;
    }

    private static void SummarizeJobObject(object jobObj, ActivityProbeResult result, int maxActivitySample)
    {
        var t = jobObj.GetType();
        result.JobPropertyNames = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .OrderBy(n => n)
            .ToList();

        var activitiesProp = PickActivityCollectionProperty(t);

        if (activitiesProp == null)
        {
            return;
        }

        object collection;
        try
        {
            collection = activitiesProp.GetValue(jobObj);
        }
        catch (Exception ex)
        {
            result.ActivityCollectionNote = "get_" + activitiesProp.Name + ": " + ex.Message;
            return;
        }

        result.ActivityCollectionPropertyName = activitiesProp.Name;
        result.ActivityCollectionTypeName = collection?.GetType().FullName;

        if (collection is System.Collections.IEnumerable en)
        {
            var idx = 0;
            foreach (var item in en)
            {
                idx++;
                if (idx > maxActivitySample)
                {
                    break;
                }

                if (item == null)
                {
                    continue;
                }

                var it = item.GetType();
                var names = it.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Select(p => p.Name)
                    .OrderBy(n => n)
                    .ToList();
                result.ActivityPropertyNameSamples.Add(new ActivityShapeSample
                {
                    Index = idx,
                    ClrType = it.FullName,
                    PropertyNames = names
                });

                var detail = BuildActivityDetailSample(idx, item);
                if (detail != null)
                {
                    result.ActivityDetails.Add(detail);
                }
            }
        }
    }

    private static ActivityDetailSample BuildActivityDetailSample(int index, object activity)
    {
        var d = new ActivityDetailSample { Index = index };
        var t = activity.GetType();

        d.JobActivityId = FormatProp(activity, "JobActivityId", "Id", "JobActivityID");
        d.JobActivityTypeName = FormatProp(activity, "JobActivityTypeName", "ActivityTypeName", "TypeName");
        d.JobActivityStatusName = FormatProp(activity, "JobActivityStatusName", "StatusName", "ActivityStatusName");
        d.StartDate = FormatProp(activity, "StartDate", "ActivityStartDate");
        d.ScheduledTime = FormatProp(activity, "ScheduledTime", "ScheduleTime");
        d.ScheduledDuration = FormatProp(activity, "ScheduledDuration", "Duration");

        var notes = GetPropValue(activity, "Notes", "Note", "Description");
        if (notes is string ns)
        {
            d.NotesLength = ns.Length;
        }
        else if (notes != null)
        {
            d.NotesLength = notes.ToString()?.Length ?? 0;
        }

        var assigneesObj = GetPropValue(activity, "Assignees", "AssigneeList", "AssignedResources");
        if (assigneesObj is System.Collections.IEnumerable ae)
        {
            var list = new List<AssigneeDetailSample>();
            foreach (var a in ae)
            {
                if (a == null)
                {
                    continue;
                }

                var idStr = FormatProp(a, "AssigneeId", "Id", "ResourceId");
                var nameStr = FormatProp(a, "AssigneeName", "Name", "ResourceName");
                var desc = GetPropValue(a, "Description", "AssigneeDescription", "Details");
                var descLen = 0;
                if (desc is string ds)
                {
                    descLen = ds.Length;
                }
                else if (desc != null)
                {
                    descLen = desc.ToString()?.Length ?? 0;
                }

                list.Add(new AssigneeDetailSample
                {
                    AssigneeId = idStr,
                    AssigneeName = nameStr ?? "",
                    DescriptionLength = descLen
                });
            }

            d.Assignees = list;
            d.AssigneesCount = list.Count;
        }
        else
        {
            d.AssigneesCount = 0;
        }

        return d;
    }

    private static object GetPropValue(object target, params string[] names)
    {
        foreach (var name in names)
        {
            var p = target.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            if (p?.CanRead != true)
            {
                continue;
            }

            try
            {
                return p.GetValue(target);
            }
            catch
            {
                // ignore
            }
        }

        return null;
    }

    private static string FormatProp(object target, params string[] names)
    {
        var v = GetPropValue(target, names);
        return FormatScalar(v);
    }

    private static string FormatScalar(object v)
    {
        if (v == null)
        {
            return "";
        }

        if (v is DateTime dt)
        {
            return dt.ToString("o", CultureInfo.InvariantCulture);
        }

        if (v is IFormattable fmt)
        {
            return fmt.ToString(null, CultureInfo.InvariantCulture);
        }

        return v.ToString() ?? "";
    }
}

internal sealed class ActivityProbeResult
{
    public int JobId { get; set; }
    public string SkippedReason { get; set; }
    public bool Connected { get; set; }
    public string Error { get; set; }
    public string ConnectionTypeName { get; set; }
    public List<string> ConnectionMethodsMatchingInterest { get; set; } = new List<string>();
    public List<string> ConnectionMethodsSample { get; set; } = new List<string>();
    public List<string> InvokeAttempts { get; set; } = new List<string>();
    public string InvokedMethod { get; set; }
    public string JobObjectTypeName { get; set; }
    public List<string> JobPropertyNames { get; set; } = new List<string>();
    public string ActivityCollectionPropertyName { get; set; }
    public string ActivityCollectionTypeName { get; set; }
    public string ActivityCollectionNote { get; set; }
    public List<ActivityShapeSample> ActivityPropertyNameSamples { get; set; } = new List<ActivityShapeSample>();
    public List<ActivityDetailSample> ActivityDetails { get; set; } = new List<ActivityDetailSample>();
}

internal sealed class ActivityShapeSample
{
    public int Index { get; set; }
    public string ClrType { get; set; }
    public List<string> PropertyNames { get; set; } = new List<string>();
}

internal sealed class ActivityDetailSample
{
    public int Index { get; set; }
    public string JobActivityId { get; set; }
    public string JobActivityTypeName { get; set; }
    public string JobActivityStatusName { get; set; }
    public string StartDate { get; set; }
    public string ScheduledTime { get; set; }
    public string ScheduledDuration { get; set; }
    public int NotesLength { get; set; }
    public int AssigneesCount { get; set; }
    public List<AssigneeDetailSample> Assignees { get; set; } = new List<AssigneeDetailSample>();
}

internal sealed class AssigneeDetailSample
{
    public string AssigneeId { get; set; }
    public string AssigneeName { get; set; }
    public int DescriptionLength { get; set; }
}
