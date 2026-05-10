using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Moraware.JobTrackerAPI5;
using Moraware.JobTrackerAPI5.DevelopmentAssistance;

namespace MorawareSdkTrace;

/// <summary>
/// Allowlisted read-only Connection calls to inspect whether JobActivity.Assignees is populated.
/// </summary>
internal static class SdkActivityReadProbe
{
    public static ActivityReadProbeReport Run(string url, string user, string pass, int jobId, int? explicitJobActivityId, int maxActivities)
    {
        var report = new ActivityReadProbeReport
        {
            GeneratedAt = DateTime.UtcNow.ToString("o"),
            JobId = jobId,
            ExplicitJobActivityId = explicitJobActivityId,
            MaxActivities = maxActivities
        };

        var tracer = new SimpleConsoleCommandTracer(false, false);
        var conn = new Connection(url, user, pass, tracer);
        try
        {
            conn.Connect();
            report.Connected = true;

            int? resolvedSeriesId = null;
            var resolvedActivityIds = new List<int>();

            // Dependency order: populate ids before single-activity / series calls.
            TryGetJobActivities(report, conn, jobId, maxActivities, resolvedActivityIds, ref resolvedSeriesId);
            TryGetJob(report, conn, jobId, maxActivities, resolvedActivityIds, ref resolvedSeriesId);

            int? activityIdForSingle = explicitJobActivityId;
            if ((!activityIdForSingle.HasValue || activityIdForSingle.Value <= 0) && resolvedActivityIds.Count > 0)
            {
                activityIdForSingle = resolvedActivityIds[0];
            }

            TryGetJobActivity(report, conn, activityIdForSingle, explicitJobActivityId.HasValue && explicitJobActivityId.Value > 0, resolvedActivityIds.Count > 0);

            if (resolvedSeriesId.HasValue)
            {
                TryGetJobActivitiesForSeries(report, conn, resolvedSeriesId.Value, maxActivities);
            }
            else
            {
                report.Attempts.Add(Skipped(
                    "GetJobActivitiesForSeries",
                    "(System.Int32 jobActivitySeriesId_, System.Boolean includeJobPhases_, System.Boolean includeJobActivitySeriesMember_)",
                    false,
                    "missing_job_activity_series_id",
                    "No JobActivitySeriesId found on sampled activities and no series query performed."));
            }

            TryGetJobActivityTypes(report, conn, jobId);
            TryGetJobActivityStatuses(report, conn);

            report.AssigneesPopulatedOnAnyActivity = report.Attempts.Any(a =>
                a.ActivitySamples?.Any(s => s.AssigneesCount > 0) == true);
        }
        catch (Exception ex)
        {
            ClassifyTopLevel(report, ex);
        }
        finally
        {
            try
            {
                if (report.Connected)
                {
                    conn.Disconnect();
                }
            }
            catch
            {
                // ignore
            }
        }

        return report;
    }

    private static void ClassifyTopLevel(ActivityReadProbeReport report, Exception ex)
    {
        report.TopLevelError = ex.Message;
        report.TopLevelErrorType = ex.GetType().FullName;
        if (IsWindowsFormsBlocker(ex))
        {
            report.WindowsDependencyBlocker = true;
            report.TopLevelClassification = "windows_dependency_blocker";
        }
    }

    private static bool IsWindowsFormsBlocker(Exception ex)
    {
        var s = ex.ToString();
        return s.IndexOf("System.Windows.Forms", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static void TryGetJobActivities(
        ActivityReadProbeReport report,
        Connection conn,
        int jobId,
        int maxActivities,
        List<int> resolvedActivityIds,
        ref int? resolvedSeriesId)
    {
        const string sig = "(System.Int32 jobId_, System.Boolean includeJobPhases_, System.Boolean includeJobActivitySeriesMember_)";
        try
        {
            var list = conn.GetJobActivities(jobId, false, false);
            var samples = CollectActivitySamples(list, maxActivities, ref resolvedSeriesId, resolvedActivityIds);
            report.Attempts.Add(SuccessAttempt("GetJobActivities", sig, list?.GetType().FullName, samples));
        }
        catch (Exception ex)
        {
            report.Attempts.Add(ErrorAttempt("GetJobActivities", sig, true, ex));
        }
    }

    private static void TryGetJob(
        ActivityReadProbeReport report,
        Connection conn,
        int jobId,
        int maxActivities,
        List<int> resolvedActivityIds,
        ref int? resolvedSeriesId)
    {
        const string sig = "(System.Int32 jobId_, System.Boolean includeContacts_, System.Boolean includeJobPhases_)";
        try
        {
            var job = conn.GetJob(jobId, false, true);
            var samples = TryEnumerateActivitiesFromJob(job, maxActivities, ref resolvedSeriesId, resolvedActivityIds);
            report.Attempts.Add(SuccessAttempt("GetJob", sig, job?.GetType().FullName, samples));
        }
        catch (Exception ex)
        {
            report.Attempts.Add(ErrorAttempt("GetJob", sig, true, ex));
        }
    }

    private static void TryGetJobActivity(ActivityReadProbeReport report, Connection conn, int? jobActivityId, bool explicitFromEnv, bool haveCollectedActivities)
    {
        const string sig = "(System.Int32 jobActivityId_, System.Boolean includeJobPhases_, System.Boolean includeJobActivitySeriesMember_)";
        if (!jobActivityId.HasValue || jobActivityId.Value <= 0)
        {
            report.Attempts.Add(Skipped(
                "GetJobActivity",
                sig,
                false,
                "missing_job_activity_id",
                explicitFromEnv ? "MORAWARE_SDK_PROBE_JOB_ACTIVITY_ID invalid or zero." :
                    haveCollectedActivities ? "Could not resolve a numeric JobActivityId from collected activities." :
                    "No job activity id from env and job lists returned no activities to sample."));
            return;
        }

        try
        {
            var act = conn.GetJobActivity(jobActivityId.Value, false, false);
            var samples = new List<ActivityDetailProbeDto>();
            if (act != null)
            {
                samples.Add(BuildActivityDetail(1, act));
            }

            report.Attempts.Add(SuccessAttempt("GetJobActivity", sig, act?.GetType().FullName, samples));
        }
        catch (Exception ex)
        {
            report.Attempts.Add(ErrorAttempt("GetJobActivity", sig, true, ex));
        }
    }

    private static void TryGetJobActivitiesForSeries(ActivityReadProbeReport report, Connection conn, int seriesId, int maxActivities)
    {
        const string sig = "(System.Int32 jobActivitySeriesId_, System.Boolean includeJobPhases_, System.Boolean includeJobActivitySeriesMember_)";
        try
        {
            var list = conn.GetJobActivitiesForSeries(seriesId, false, false);
            int? dummy = null;
            var ids = new List<int>();
            var samples = CollectActivitySamples(list, maxActivities, ref dummy, ids);
            report.Attempts.Add(SuccessAttempt("GetJobActivitiesForSeries", sig, list?.GetType().FullName, samples));
        }
        catch (Exception ex)
        {
            report.Attempts.Add(ErrorAttempt("GetJobActivitiesForSeries", sig, true, ex));
        }
    }

    private static void TryGetJobActivityTypes(ActivityReadProbeReport report, Connection conn, int jobId)
    {
        try
        {
            var typesNoArg = conn.GetJobActivityTypes();
            report.Attempts.Add(NonActivitySuccess(
                "GetJobActivityTypes",
                "()",
                typesNoArg?.GetType().FullName,
                TryCountEnumerable(typesNoArg)));
        }
        catch (Exception ex)
        {
            report.Attempts.Add(ErrorAttempt("GetJobActivityTypes", "()", true, ex));
        }

        int? pid = null;
        try
        {
            var job = conn.GetJob(jobId, false, false);
            pid = GetNullableIntProp(job, "ProcessId", "processId");
        }
        catch (Exception ex)
        {
            report.Attempts.Add(Skipped(
                "GetJobActivityTypes",
                "(System.Int32 processId_)",
                false,
                "could_not_load_job",
                ex.Message));
            return;
        }

        if (pid.HasValue)
        {
            try
            {
                var types = conn.GetJobActivityTypes(pid.Value);
                report.Attempts.Add(NonActivitySuccess(
                    "GetJobActivityTypes",
                    "(System.Int32 processId_)",
                    types?.GetType().FullName,
                    TryCountEnumerable(types)));
            }
            catch (Exception ex)
            {
                report.Attempts.Add(ErrorAttempt("GetJobActivityTypes", "(System.Int32 processId_)", true, ex));
            }
        }
        else
        {
            report.Attempts.Add(Skipped(
                "GetJobActivityTypes",
                "(System.Int32 processId_)",
                false,
                "missing_process_id",
                "Job.ProcessId not available on GetJob snapshot."));
        }
    }

    private static void TryGetJobActivityStatuses(ActivityReadProbeReport report, Connection conn)
    {
        const string sig = "()";
        try
        {
            var statuses = conn.GetJobActivityStatuses();
            report.Attempts.Add(NonActivitySuccess(
                "GetJobActivityStatuses",
                sig,
                statuses?.GetType().FullName,
                TryCountEnumerable(statuses)));
        }
        catch (Exception ex)
        {
            report.Attempts.Add(ErrorAttempt("GetJobActivityStatuses", sig, true, ex));
        }
    }

    private static List<ActivityDetailProbeDto> CollectActivitySamples(
        object list,
        int maxActivities,
        ref int? resolvedSeriesId,
        List<int> resolvedActivityIds)
    {
        var samples = new List<ActivityDetailProbeDto>();
        if (list is not IEnumerable en)
        {
            return samples;
        }

        var idx = 0;
        foreach (var item in en)
        {
            idx++;
            if (idx > maxActivities)
            {
                break;
            }

            if (item == null)
            {
                continue;
            }

            var id = GetNullableIntProp(item, "JobActivityId", "Id", "JobActivityID");
            if (id.HasValue && !resolvedActivityIds.Contains(id.Value))
            {
                resolvedActivityIds.Add(id.Value);
            }

            if (!resolvedSeriesId.HasValue)
            {
                resolvedSeriesId = GetNullableIntProp(item, "JobActivitySeriesId", "SeriesId");
            }

            samples.Add(BuildActivityDetail(idx, item));
        }

        return samples;
    }

    private static List<ActivityDetailProbeDto> TryEnumerateActivitiesFromJob(
        object job,
        int maxActivities,
        ref int? resolvedSeriesId,
        List<int> resolvedActivityIds)
    {
        var samples = new List<ActivityDetailProbeDto>();
        if (job == null)
        {
            return samples;
        }

        var prop = PickActivityCollectionProperty(job.GetType());
        if (prop == null)
        {
            return samples;
        }

        object collection;
        try
        {
            collection = prop.GetValue(job);
        }
        catch
        {
            return samples;
        }

        return CollectActivitySamples(collection, maxActivities, ref resolvedSeriesId, resolvedActivityIds);
    }

    private static PropertyInfo PickActivityCollectionProperty(Type t)
    {
        var props = t.GetProperties(BindingFlags.Public | BindingFlags.Instance).ToList();
        foreach (var name in new[] { "JobActivities", "Activities", "JobActivityList" })
        {
            var p = props.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.Ordinal));
            if (p != null)
            {
                return p;
            }
        }

        return props.FirstOrDefault(p =>
            p.Name.IndexOf("JobActivity", StringComparison.OrdinalIgnoreCase) >= 0 ||
            p.Name.IndexOf("activ", StringComparison.OrdinalIgnoreCase) >= 0);
    }

    private static ActivityAttemptDto SuccessAttempt(string name, string sig, string returnType, List<ActivityDetailProbeDto> samples)
    {
        return new ActivityAttemptDto
        {
            MethodName = name,
            Signature = name + sig,
            Attempted = true,
            SkipReason = null,
            Success = true,
            ErrorType = null,
            ErrorMessage = null,
            WindowsDependencyBlocker = false,
            ReturnedObjectType = returnType,
            ActivityCount = samples.Count,
            ActivitySamples = samples
        };
    }

    private static ActivityAttemptDto NonActivitySuccess(string name, string sig, string returnType, int? count)
    {
        return new ActivityAttemptDto
        {
            MethodName = name,
            Signature = name + sig,
            Attempted = true,
            SkipReason = null,
            Success = true,
            ErrorType = null,
            ErrorMessage = null,
            WindowsDependencyBlocker = false,
            ReturnedObjectType = returnType,
            ActivityCount = null,
            NonJobActivityItemCount = count,
            ActivitySamples = new List<ActivityDetailProbeDto>(),
            Note = "Returns metadata (types/statuses), not JobActivity rows."
        };
    }

    private static ActivityAttemptDto ErrorAttempt(string name, string sig, bool attempted, Exception ex)
    {
        var blocker = IsWindowsFormsBlocker(ex);
        return new ActivityAttemptDto
        {
            MethodName = name,
            Signature = name + sig,
            Attempted = attempted,
            SkipReason = null,
            Success = false,
            ErrorType = ex.GetType().FullName,
            ErrorMessage = ex.Message,
            WindowsDependencyBlocker = blocker,
            ReturnedObjectType = null,
            ActivityCount = 0,
            ActivitySamples = new List<ActivityDetailProbeDto>()
        };
    }

    private static ActivityAttemptDto Skipped(string name, string sig, bool attempted, string reason, string detail)
    {
        return new ActivityAttemptDto
        {
            MethodName = name,
            Signature = name + sig,
            Attempted = attempted,
            SkipReason = reason + ": " + detail,
            Success = false,
            ActivitySamples = new List<ActivityDetailProbeDto>()
        };
    }

    private static int? TryCountEnumerable(object o)
    {
        if (o == null)
        {
            return null;
        }

        if (o is ICollection c)
        {
            return c.Count;
        }

        var n = 0;
        if (o is IEnumerable e)
        {
            foreach (var _ in e)
            {
                n++;
                if (n > 100000)
                {
                    break;
                }
            }
        }

        return n;
    }

    private static int? GetNullableIntProp(object target, params string[] names)
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
                var v = p.GetValue(target);
                if (v == null)
                {
                    continue;
                }

                if (v is int i)
                {
                    return i;
                }

                if (int.TryParse(v.ToString(), out var j))
                {
                    return j;
                }
            }
            catch
            {
                // ignore
            }
        }

        return null;
    }

    private static ActivityDetailProbeDto BuildActivityDetail(int index, object activity)
    {
        var d = new ActivityDetailProbeDto { Index = index };
        d.JobActivityId = FormatProp(activity, "JobActivityId", "Id", "JobActivityID");
        d.JobActivityTypeName = FormatProp(activity, "JobActivityTypeName", "ActivityTypeName", "TypeName");
        d.JobActivityStatusName = FormatProp(activity, "JobActivityStatusName", "StatusName", "ActivityStatusName");
        d.StartDate = FormatProp(activity, "StartDate", "ActivityStartDate");
        d.ScheduledTime = FormatProp(activity, "ScheduledTime", "ScheduleTime");
        d.ScheduledDuration = FormatProp(activity, "ScheduledDuration", "Duration");

        var notes = GetPropValue(activity, "Notes", "Note");
        if (notes is string ns)
        {
            d.NotesLength = ns.Length;
        }
        else if (notes != null)
        {
            d.NotesLength = notes.ToString()?.Length ?? 0;
        }

        var assigneesObj = GetPropValue(activity, "Assignees", "AssigneeList", "AssignedResources");
        if (assigneesObj is IEnumerable ae)
        {
            var list = new List<AssigneeDetailProbeDto>();
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

                list.Add(new AssigneeDetailProbeDto
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

internal sealed class ActivityReadProbeReport
{
    public string GeneratedAt { get; set; }
    public int JobId { get; set; }
    public int? ExplicitJobActivityId { get; set; }
    public int MaxActivities { get; set; }
    public bool Connected { get; set; }
    public string TopLevelError { get; set; }
    public string TopLevelErrorType { get; set; }
    public string TopLevelClassification { get; set; }
    public bool WindowsDependencyBlocker { get; set; }
    public bool AssigneesPopulatedOnAnyActivity { get; set; }
    public List<ActivityAttemptDto> Attempts { get; set; } = new List<ActivityAttemptDto>();
}

internal sealed class ActivityAttemptDto
{
    public string MethodName { get; set; }
    public string Signature { get; set; }
    public bool Attempted { get; set; }
    public string SkipReason { get; set; }
    public bool Success { get; set; }
    public string ErrorType { get; set; }
    public string ErrorMessage { get; set; }
    public bool WindowsDependencyBlocker { get; set; }
    public string ReturnedObjectType { get; set; }
    public int? ActivityCount { get; set; }
    public int? NonJobActivityItemCount { get; set; }
    public string Note { get; set; }
    public List<ActivityDetailProbeDto> ActivitySamples { get; set; } = new List<ActivityDetailProbeDto>();
}

internal sealed class ActivityDetailProbeDto
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
    public List<AssigneeDetailProbeDto> Assignees { get; set; } = new List<AssigneeDetailProbeDto>();
}

internal sealed class AssigneeDetailProbeDto
{
    public string AssigneeId { get; set; }
    public string AssigneeName { get; set; }
    public int DescriptionLength { get; set; }
}
