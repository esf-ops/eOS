using System;

namespace MorawareSdkTrace;

/// <summary>
/// Resolves Moraware URL/username/password for read-only SDK probes.
/// Never logs secrets.
/// </summary>
internal static class MorawareProbeCredentials
{
    public static bool TryResolve(out string url, out string user, out string pass, out string error)
    {
        url = (Environment.GetEnvironmentVariable("MORAWARE_URL") ?? "").Trim();
        if (string.IsNullOrEmpty(url))
        {
            url = (Environment.GetEnvironmentVariable("MORAWARE_API_URL") ?? "").Trim();
        }

        user = (Environment.GetEnvironmentVariable("MORAWARE_USERNAME") ?? "").Trim();
        pass = (Environment.GetEnvironmentVariable("MORAWARE_PASSWORD") ?? "").Trim();

        if (string.IsNullOrEmpty(url))
        {
            error = "Missing MORAWARE_URL or MORAWARE_API_URL.";
            return false;
        }

        if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
        {
            error = "Missing MORAWARE_USERNAME or MORAWARE_PASSWORD.";
            return false;
        }

        error = string.Empty;
        return true;
    }
}
