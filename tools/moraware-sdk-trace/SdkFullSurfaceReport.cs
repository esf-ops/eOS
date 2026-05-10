namespace MorawareSdkTrace;

/// <summary>
/// Writes only moraware-sdk-full-surface.* (for MORAWARE_SDK_TRACE_MODE=full-surface).
/// </summary>
internal static class SdkFullSurfaceReport
{
    public static int Run()
    {
        var repoRoot = SdkAssignmentReport.FindRepoRoot();
        var asmPath = SdkSurfaceInspector.ResolveAssemblyPath();
        SdkFullSurfaceCollector.WriteReports(repoRoot, asmPath);
        return 0;
    }
}
