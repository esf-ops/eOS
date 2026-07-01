using System;
using EliteOS.QuickBooksSdkConnector.Configuration;
using EliteOS.QuickBooksSdkConnector.Export;
using EliteOS.QuickBooksSdkConnector.Logging;
using EliteOS.QuickBooksSdkConnector.QbSdk;

namespace EliteOS.QuickBooksSdkConnector;

internal static class Program
{
    private static int Main(string[] args)
    {
        var settings = new ConnectorSettings();
        var runId = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0, 8);

        using var logger = new FileLogger(settings.LogsRoot, runId);
        logger.Info("EliteOS QuickBooks SDK Connector — read-only extract starting");
        logger.Info($"Project root: {settings.ProjectRoot}");
        logger.Info($"QBXML version: {settings.QbXmlVersion}, MaxReturned: {settings.MaxReturned}");
        logger.Info("This tool performs query-only QBXML requests. It does not create, edit, or delete QuickBooks records.");

        if (settings.SelectedEntities != null && settings.SelectedEntities.Count > 0)
        {
            logger.Info("QB_ENTITIES filter: " + string.Join(", ", settings.SelectedEntities));
        }
        else
        {
            logger.Info("QB_ENTITIES filter: (all entities)");
        }

        if (!string.IsNullOrWhiteSpace(settings.CompanyFile))
        {
            logger.Info($"Company file: {settings.CompanyFile}");
        }
        else
        {
            logger.Info("Company file: (use currently open QuickBooks company file)");
        }

        try
        {
            using var processor = new QbRequestProcessor();
            processor.OpenSession(settings.AppId, settings.AppName, settings.CompanyFile);

            var coordinator = new ExportCoordinator(settings, logger, processor);
            var manifest = coordinator.Execute(runId);

            logger.Info("Extract complete.");
            logger.Info($"Export directory: {manifest.ExportDirectory}");
            logger.Info($"Total entity types: {manifest.Entities.Count}");
            logger.Info($"Total records: {SumRecords(manifest)}");
            logger.Info($"Total errors: {manifest.Errors.Count}");

            return manifest.Errors.Count > 0 ? 2 : 0;
        }
        catch (Exception ex)
        {
            logger.Error("Fatal error during extract.", ex);
            return 1;
        }
    }

    private static int SumRecords(SyncRunManifest manifest)
    {
        var total = 0;
        foreach (var entity in manifest.Entities)
        {
            total += entity.RecordCount;
        }

        return total;
    }
}
