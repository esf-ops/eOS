using System;
using System.IO;
using System.Text;

namespace EliteOS.QuickBooksSdkConnector.QbSdk;

internal static class FailedRequestDiagnostics
{
    public static void Write(string debugRoot, string entityType, string requestLabel, string requestXml)
    {
        if (string.IsNullOrWhiteSpace(debugRoot) || string.IsNullOrWhiteSpace(requestXml))
        {
            return;
        }

        var directory = Path.Combine(debugRoot, "failed-requests");
        Directory.CreateDirectory(directory);

        var safeEntity = SanitizeFilePart(entityType);
        var safeLabel = SanitizeFilePart(requestLabel);
        var path = Path.Combine(
            directory,
            $"{safeEntity}-{safeLabel}-{DateTime.UtcNow:yyyyMMdd-HHmmss-fff}.xml");

        File.WriteAllText(path, requestXml, Encoding.UTF8);
    }

    private static string SanitizeFilePart(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "unknown";
        }

        var chars = value
            .Trim()
            .ToLowerInvariant()
            .ToCharArray();

        for (var i = 0; i < chars.Length; i++)
        {
            if (!char.IsLetterOrDigit(chars[i]) && chars[i] != '-')
            {
                chars[i] = '-';
            }
        }

        return new string(chars);
    }
}
