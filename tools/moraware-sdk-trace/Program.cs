using System;
using System.Collections;
using System.Reflection;
using Moraware.JobTrackerAPI5;
using Moraware.JobTrackerAPI5.DevelopmentAssistance;

namespace MorawareSdkTrace;

internal static class Program
{
    private static void Main()
    {
        var url = Environment.GetEnvironmentVariable("MORAWARE_URL") ?? string.Empty;
        var user = Environment.GetEnvironmentVariable("MORAWARE_USERNAME") ?? string.Empty;
        var pass = Environment.GetEnvironmentVariable("MORAWARE_PASSWORD") ?? string.Empty;

        var jobId = ParseIntEnv("MORAWARE_JOB_ID", 37565);
        var jobFormId = ParseIntEnv("MORAWARE_JOB_FORM_ID", 140265);

        if (string.IsNullOrWhiteSpace(url) ||
            string.IsNullOrWhiteSpace(user) ||
            string.IsNullOrWhiteSpace(pass))
        {
            Console.Error.WriteLine("Missing MORAWARE_URL, MORAWARE_USERNAME, and/or MORAWARE_PASSWORD.");
            Environment.ExitCode = 1;
            return;
        }

        Console.WriteLine("=== Moraware SDK trace harness ===");
        Console.WriteLine("Tracer prints raw command/response XML below (may include sessionId). Do not commit captured logs.");
        Console.WriteLine($"jobId={jobId} jobFormId={jobFormId}");
        Console.WriteLine();

        var tracer = new SimpleConsoleCommandTracer(true, true);
        var conn = new Connection(url, user, pass, tracer);

        var connected = false;
        try
        {
            conn.Connect();
            connected = true;

            RunLabeled("1. GetJobForm NoFields", () =>
            {
                var form = conn.GetJobForm(
                    jobFormId,
                    true,
                    Connection.GetJobForm_FieldInclusionType_Enum.NoFields);
                DumpJobFormSummary("NoFields result", form);
            });

            RunLabeled("2. GetJobForm ExcludeEmptyFields", () =>
            {
                var form = conn.GetJobForm(
                    jobFormId,
                    true,
                    Connection.GetJobForm_FieldInclusionType_Enum.ExcludeEmptyFields);
                DumpJobFormSummary("ExcludeEmptyFields result", form);
            });

            RunLabeled("3. GetJobForm AllFields", () =>
            {
                var form = conn.GetJobForm(
                    jobFormId,
                    true,
                    Connection.GetJobForm_FieldInclusionType_Enum.AllFields);
                DumpJobFormSummary("AllFields result", form);
            });

            RunLabeled("4. GetJobForms AllFields", () =>
            {
                var forms = conn.GetJobForms(
                    jobId,
                    true,
                    Connection.GetJobForm_FieldInclusionType_Enum.AllFields);

                var idx = 0;
                foreach (var form in AsEnumerableJobForms(forms))
                {
                    idx++;
                    DumpJobFormSummary($"GetJobForms item [{idx}]", form);
                }

                if (idx == 0)
                {
                    Console.WriteLine("(GetJobForms returned no forms to enumerate.)");
                }
            });
        }
        finally
        {
            if (connected)
            {
                try
                {
                    conn.Disconnect();
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"Disconnect warning: {ex.Message}");
                }
            }
        }
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

    private static void RunLabeled(string title, Action action)
    {
        Console.WriteLine();
        Console.WriteLine(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
        Console.WriteLine(title);
        Console.WriteLine("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
        try
        {
            action();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[{title}] FAILED: {ex.Message}");
            Console.Error.WriteLine(ex);
        }
    }

    /// <summary>
    /// Reflection-based summary so minor SDK surface/name differences still produce useful output.
    /// </summary>
    private static void DumpJobFormSummary(string context, object form)
    {
        Console.WriteLine();
        Console.WriteLine($"--- {context} ---");

        if (form == null)
        {
            Console.WriteLine("(null JobForm)");
            return;
        }

        Console.WriteLine($"type: {form.GetType().FullName}");

        PrintProp(form, "JobFormId", "JobFormId", "Id", "jobFormId");
        PrintProp(form, "JobFormName", "JobFormName", "Name", "jobFormName");
        PrintProp(form, "FormTemplateName", "FormTemplateName", "formTemplateName");

        var fieldValues = GetProp(form, "FieldValues", "fieldValues");
        if (fieldValues == null)
        {
            Console.WriteLine("FieldValues: (not found or null)");
            return;
        }

        var count = TryCount(fieldValues);
        Console.WriteLine($"FieldValues: enumerable, count≈{count}");

        var idx = 0;
        foreach (var item in AsEnumerable(fieldValues))
        {
            idx++;
            Console.WriteLine($"  [{idx}] type={item?.GetType().FullName ?? "null"}");
            if (item == null)
            {
                continue;
            }

            PrintProp(item, "  JobFormFieldName", "JobFormFieldName", "jobFormFieldName");
            PrintProp(item, "  FieldValue", "FieldValue", "fieldValue");
            PrintProp(item, "  FieldValueId", "FieldValueId", "fieldValueId");
            PrintProp(item, "  FormFieldDataType", "FormFieldDataType", "formFieldDataType");
        }

        if (idx == 0)
        {
            Console.WriteLine("  (no FieldValues items enumerated)");
        }
    }

    private static object GetProp(object target, params string[] names)
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

    private static void PrintProp(object target, string label, params string[] names)
    {
        var v = GetProp(target, names);
        Console.WriteLine($"{label}: {FormatValue(v)}");
    }

    private static string FormatValue(object v)
    {
        if (v == null)
        {
            return "(null)";
        }

        if (v is string s)
        {
            return s;
        }

        if (v is ValueType)
        {
            return v.ToString();
        }

        return v.ToString();
    }

    private static int TryCount(object maybeCollection)
    {
        if (maybeCollection is ICollection col)
        {
            return col.Count;
        }

        var n = 0;
        foreach (var _ in AsEnumerable(maybeCollection))
        {
            n++;
        }

        return n;
    }

    private static IEnumerable AsEnumerable(object maybeEnumerable)
    {
        if (maybeEnumerable == null)
        {
            yield break;
        }

        if (maybeEnumerable is IEnumerable e)
        {
            foreach (var x in e)
            {
                yield return x;
            }
        }
    }

    private static IEnumerable AsEnumerableJobForms(object maybeForms)
    {
        if (maybeForms == null)
        {
            yield break;
        }

        // Common shapes: JobForm[], IList<JobForm>, IEnumerable
        foreach (var x in AsEnumerable(maybeForms))
        {
            yield return x;
        }
    }
}
