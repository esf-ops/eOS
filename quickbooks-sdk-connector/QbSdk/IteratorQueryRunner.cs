using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using EliteOS.QuickBooksSdkConnector.Logging;
using EliteOS.QuickBooksSdkConnector.Normalization;

namespace EliteOS.QuickBooksSdkConnector.QbSdk;

internal sealed class IteratorQueryRunner
{
    private readonly QbRequestProcessor _processor;
    private readonly FileLogger _logger;
    private readonly string _qbXmlVersion;
    private readonly int _maxReturned;

    public IteratorQueryRunner(
        QbRequestProcessor processor,
        FileLogger logger,
        string qbXmlVersion,
        int maxReturned)
    {
        _processor = processor;
        _logger = logger;
        _qbXmlVersion = qbXmlVersion;
        _maxReturned = maxReturned;
    }

    public EntityExtractResult RunPaginatedQuery(EntityExtractDefinition definition, string outputDirectory)
    {
        Directory.CreateDirectory(outputDirectory);

        var startedAt = DateTime.UtcNow;
        var errors = new List<string>();
        var batchCount = 0;
        var recordCount = 0;
        var requestCounter = 0;
        var iteratorId = string.Empty;
        var iteratorMode = "Start";

        while (true)
        {
            requestCounter++;
            var requestId = $"{definition.EntityType}-{requestCounter}";
            var requestXml = QbXmlBuilder.BuildIteratorQuery(
                definition.RequestTag,
                _qbXmlVersion,
                _maxReturned,
                requestId,
                iteratorMode,
                iteratorMode == "Continue" ? iteratorId : null,
                definition.InnerElements);

            _logger.Info(
                $"[{definition.EntityType}] Sending batch {requestCounter} ({iteratorMode}, MaxReturned={_maxReturned})");

            string responseXml;
            try
            {
                responseXml = _processor.ProcessRequest(requestXml);
            }
            catch (Exception ex)
            {
                var message = $"[{definition.EntityType}] ProcessRequest failed on batch {requestCounter}: {ex.Message}";
                _logger.Error(message, ex);
                errors.Add(message);
                break;
            }

            var parsed = QbXmlResponseParser.Parse(responseXml, definition.ResponseTagSuffix);
            batchCount++;

            var batchStem = $"batch-{batchCount:D3}";
            var rawPath = Path.Combine(outputDirectory, $"{batchStem}.xml");
            File.WriteAllText(rawPath, parsed.RawXml, System.Text.Encoding.UTF8);

            if (!parsed.IsSuccess)
            {
                var message =
                    $"[{definition.EntityType}] batch {batchCount} statusCode={parsed.StatusCode} message={parsed.StatusMessage}";
                _logger.Warn(message);
                errors.Add(message);
                break;
            }

            var normalizedRecords = parsed.RetElements
                .Select(QbXmlToJsonNormalizer.ToDictionary)
                .ToList();
            recordCount += normalizedRecords.Count;

            var jsonPath = Path.Combine(outputDirectory, $"{batchStem}.json");
            WriteJson(jsonPath, new
            {
                entityType = definition.EntityType,
                batchNumber = batchCount,
                recordCount = normalizedRecords.Count,
                records = normalizedRecords
            });

            if (definition.ExtractLineItems)
            {
                WriteInvoiceLines(outputDirectory, batchCount, parsed.RetElements);
            }

            _logger.Info(
                $"[{definition.EntityType}] batch {batchCount}: {normalizedRecords.Count} records, remaining={parsed.IteratorRemainingCount}");

            if (parsed.IteratorRemainingCount <= 0)
            {
                break;
            }

            if (string.IsNullOrWhiteSpace(parsed.IteratorId))
            {
                errors.Add($"[{definition.EntityType}] iteratorRemainingCount={parsed.IteratorRemainingCount} but iteratorID was missing.");
                break;
            }

            iteratorId = parsed.IteratorId;
            iteratorMode = "Continue";
        }

        return new EntityExtractResult
        {
            EntityType = definition.EntityType,
            StartedAt = startedAt,
            CompletedAt = DateTime.UtcNow,
            BatchCount = batchCount,
            RecordCount = recordCount,
            Errors = errors
        };
    }

    public EntityExtractResult RunSingleQuery(EntityExtractDefinition definition, string outputDirectory, string outputStem)
    {
        Directory.CreateDirectory(outputDirectory);

        var startedAt = DateTime.UtcNow;
        var errors = new List<string>();
        var requestXml = QbXmlBuilder.BuildSingleQuery(
            definition.RequestTag,
            _qbXmlVersion,
            $"{definition.EntityType}-1",
            definition.InnerElements);

        _logger.Info($"[{definition.EntityType}] Sending single query");

        string responseXml;
        try
        {
            responseXml = _processor.ProcessRequest(requestXml);
        }
        catch (Exception ex)
        {
            var message = $"[{definition.EntityType}] ProcessRequest failed: {ex.Message}";
            _logger.Error(message, ex);
            errors.Add(message);
            return new EntityExtractResult
            {
                EntityType = definition.EntityType,
                StartedAt = startedAt,
                CompletedAt = DateTime.UtcNow,
                BatchCount = 0,
                RecordCount = 0,
                Errors = errors
            };
        }

        var parsed = QbXmlResponseParser.Parse(responseXml, definition.ResponseTagSuffix);
        var rawPath = Path.Combine(outputDirectory, $"{outputStem}.xml");
        File.WriteAllText(rawPath, parsed.RawXml, System.Text.Encoding.UTF8);

        if (!parsed.IsSuccess)
        {
            var message =
                $"[{definition.EntityType}] statusCode={parsed.StatusCode} message={parsed.StatusMessage}";
            _logger.Warn(message);
            errors.Add(message);
        }

        var normalizedRecords = parsed.RetElements
            .Select(QbXmlToJsonNormalizer.ToDictionary)
            .ToList();

        var jsonPath = Path.Combine(outputDirectory, $"{outputStem}.json");
        WriteJson(jsonPath, new
        {
            entityType = definition.EntityType,
            recordCount = normalizedRecords.Count,
            records = normalizedRecords
        });

        return new EntityExtractResult
        {
            EntityType = definition.EntityType,
            StartedAt = startedAt,
            CompletedAt = DateTime.UtcNow,
            BatchCount = 1,
            RecordCount = normalizedRecords.Count,
            Errors = errors
        };
    }

    private static void WriteInvoiceLines(string outputDirectory, int batchNumber, IList<XElement> retElements)
    {
        var lineItems = QbXmlResponseParser
            .ExtractLineItems(retElements)
            .Select(QbXmlToJsonNormalizer.ToDictionary)
            .ToList();

        if (lineItems.Count == 0)
        {
            return;
        }

        var linesDirectory = Path.Combine(Path.GetDirectoryName(outputDirectory) ?? outputDirectory, "invoice-lines");
        Directory.CreateDirectory(linesDirectory);

        var jsonPath = Path.Combine(linesDirectory, $"batch-{batchNumber:D3}.json");
        WriteJson(jsonPath, new
        {
            entityType = "invoice-lines",
            batchNumber = batchNumber,
            recordCount = lineItems.Count,
            records = lineItems
        });
    }

    private static void WriteJson(string path, object payload)
    {
        JsonSerializationHelper.WriteIndentedJson(path, payload);
    }
}

internal sealed class EntityExtractDefinition
{
    public string EntityType { get; set; }
    public string RequestTag { get; set; }
    public string ResponseTagSuffix { get; set; }
    public string OutputFolder { get; set; }
    public string InnerElements { get; set; }
    public bool ExtractLineItems { get; set; }
    public bool UseIterator { get; set; }
}

internal sealed class EntityExtractResult
{
    public string EntityType { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime CompletedAt { get; set; }
    public int BatchCount { get; set; }
    public int RecordCount { get; set; }
    public IList<string> Errors { get; set; } = new List<string>();
}
