using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using EliteOS.QuickBooksSdkConnector.Configuration;
using EliteOS.QuickBooksSdkConnector.Logging;
using EliteOS.QuickBooksSdkConnector.QbSdk;

namespace EliteOS.QuickBooksSdkConnector.Export;

internal sealed class ExportCoordinator
{
    private readonly ConnectorSettings _settings;
    private readonly FileLogger _logger;
    private readonly QbRequestProcessor _processor;

    public ExportCoordinator(ConnectorSettings settings, FileLogger logger, QbRequestProcessor processor)
    {
        _settings = settings;
        _logger = logger;
        _processor = processor;
    }

    public SyncRunManifest Execute(string runId)
    {
        var startedAt = DateTime.UtcNow;
        var exportDirectory = Path.Combine(
            _settings.ExportsRoot,
            startedAt.ToString("yyyy-MM-dd-HHmmss"));

        Directory.CreateDirectory(exportDirectory);
        _logger.Info($"Export directory: {exportDirectory}");

        var runner = new IteratorQueryRunner(
            _processor,
            _logger,
            _settings.QbXmlVersion,
            _settings.MaxReturned);

        var entityResults = new List<EntityExtractResult>();
        foreach (var definition in EntityCatalog.All)
        {
            try
            {
                var outputDirectory = Path.Combine(exportDirectory, definition.OutputFolder);
                EntityExtractResult result;

                if (definition.UseIterator)
                {
                    result = runner.RunPaginatedQuery(definition, outputDirectory);
                }
                else
                {
                    result = runner.RunSingleQuery(definition, exportDirectory, "company");
                }

                entityResults.Add(result);
            }
            catch (Exception ex)
            {
                var message = $"[{definition.EntityType}] unhandled error: {ex.Message}";
                _logger.Error(message, ex);
                entityResults.Add(new EntityExtractResult
                {
                    EntityType = definition.EntityType,
                    StartedAt = DateTime.UtcNow,
                    CompletedAt = DateTime.UtcNow,
                    BatchCount = 0,
                    RecordCount = 0,
                    Errors = new List<string> { message }
                });
            }
        }

        var completedAt = DateTime.UtcNow;
        var manifest = new SyncRunManifest
        {
            RunId = runId,
            StartedAt = startedAt,
            CompletedAt = completedAt,
            QbXmlVersion = _settings.QbXmlVersion,
            CompanyFile = string.IsNullOrWhiteSpace(_settings.CompanyFile) ? "(currently open company file)" : _settings.CompanyFile,
            MaxReturned = _settings.MaxReturned,
            ExportDirectory = exportDirectory,
            Entities = entityResults,
            Errors = CollectTopLevelErrors(entityResults)
        };

        var manifestPath = Path.Combine(exportDirectory, "manifest.json");
        var json = JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(manifestPath, json, System.Text.Encoding.UTF8);
        _logger.Info($"Manifest written: {manifestPath}");

        return manifest;
    }

    private static IList<string> CollectTopLevelErrors(IEnumerable<EntityExtractResult> entityResults)
    {
        return entityResults
            .SelectMany(result => result.Errors ?? Array.Empty<string>())
            .ToList();
    }
}

internal sealed class SyncRunManifest
{
    public string RunId { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime CompletedAt { get; set; }
    public string QbXmlVersion { get; set; }
    public string CompanyFile { get; set; }
    public int MaxReturned { get; set; }
    public string ExportDirectory { get; set; }
    public IList<EntityExtractResult> Entities { get; set; } = new List<EntityExtractResult>();
    public IList<string> Errors { get; set; } = new List<string>();
}

internal static class EntityCatalog
{
    public static IReadOnlyList<EntityExtractDefinition> All { get; } = new List<EntityExtractDefinition>
    {
        new EntityExtractDefinition
        {
            EntityType = "company",
            RequestTag = "CompanyQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = ".",
            UseIterator = false
        },
        new EntityExtractDefinition
        {
            EntityType = "customers",
            RequestTag = "CustomerQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "customers",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "invoices",
            RequestTag = "InvoiceQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "invoices",
            InnerElements = "<IncludeLineItems>true</IncludeLineItems>",
            ExtractLineItems = true,
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "items",
            RequestTag = "ItemQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "items",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "payments",
            RequestTag = "ReceivePaymentQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "payments",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "vendors",
            RequestTag = "VendorQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "vendors",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "bills",
            RequestTag = "BillQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "bills",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "purchase-orders",
            RequestTag = "PurchaseOrderQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "purchase-orders",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "accounts",
            RequestTag = "AccountQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "accounts",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "classes",
            RequestTag = "ClassQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "classes",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "sales-reps",
            RequestTag = "SalesRepQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "sales-reps",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "terms",
            RequestTag = "TermsQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "terms",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "estimates",
            RequestTag = "EstimateQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "estimates",
            InnerElements = "<IncludeLineItems>true</IncludeLineItems>",
            UseIterator = true
        },
        new EntityExtractDefinition
        {
            EntityType = "sales-orders",
            RequestTag = "SalesOrderQueryRq",
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "sales-orders",
            InnerElements = "<IncludeLineItems>true</IncludeLineItems>",
            UseIterator = true
        }
    };
}
