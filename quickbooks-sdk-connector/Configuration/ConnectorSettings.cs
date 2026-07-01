using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace EliteOS.QuickBooksSdkConnector.Configuration;

internal sealed class ConnectorSettings
{
    public string AppName { get; }
    public string AppId { get; }
    public string CompanyFile { get; }
    public string QbXmlVersion { get; }
    public int MaxReturned { get; }
    public int EstimateChunkStartYear { get; }
    public string ProjectRoot { get; }
    public string ExportsRoot { get; }
    public string LogsRoot { get; }
    public string DebugRoot { get; }
    public IReadOnlyList<string> SelectedEntities { get; }

    public ConnectorSettings()
    {
        ProjectRoot = ResolveProjectRoot();
        AppName = GetEnv("QB_APP_NAME", "EliteOS QuickBooks SDK Connector");
        AppId = GetEnv("QB_APP_ID", "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}");
        CompanyFile = GetEnv("QB_COMPANY_FILE", string.Empty);
        QbXmlVersion = GetEnv("QBXML_VERSION", "13.0");
        MaxReturned = ParseInt(GetEnv("QB_MAX_RETURNED", "100"), 100);
        EstimateChunkStartYear = ParseInt(GetEnv("QB_ESTIMATE_CHUNK_START_YEAR", "2000"), 2000);
        ExportsRoot = GetEnv("QB_EXPORTS_ROOT", Path.Combine(ProjectRoot, "exports"));
        LogsRoot = GetEnv("QB_LOGS_ROOT", Path.Combine(ProjectRoot, "logs"));
        DebugRoot = GetEnv("QB_DEBUG_ROOT", Path.Combine(ProjectRoot, "debug"));
        SelectedEntities = ParseEntityFilter(GetEnv("QB_ENTITIES", string.Empty));
    }

    public bool IncludesEntity(string entityType)
    {
        if (SelectedEntities == null || SelectedEntities.Count == 0)
        {
            return true;
        }

        return SelectedEntities.Contains(NormalizeEntityName(entityType));
    }

    public static string NormalizeEntityName(string entityType)
    {
        return (entityType ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static IReadOnlyList<string> ParseEntityFilter(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Array.Empty<string>();
        }

        return raw
            .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(NormalizeEntityName)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string ResolveProjectRoot()
    {
        var overrideRoot = Environment.GetEnvironmentVariable("QB_CONNECTOR_ROOT");
        if (!string.IsNullOrWhiteSpace(overrideRoot))
        {
            return Path.GetFullPath(overrideRoot);
        }

        var dir = AppDomain.CurrentDomain.BaseDirectory;
        for (var depth = 0; depth < 8; depth++)
        {
            if (File.Exists(Path.Combine(dir, "EliteOS.QuickBooksSdkConnector.csproj")))
            {
                return dir;
            }

            var parent = Directory.GetParent(dir);
            if (parent == null)
            {
                break;
            }

            dir = parent.FullName;
        }

        return Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
    }

    private static string GetEnv(string name, string fallback)
    {
        var value = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private static int ParseInt(string value, int fallback)
    {
        return int.TryParse(value, out var parsed) && parsed > 0 ? parsed : fallback;
    }
}
