using System;
using System.Collections.Generic;
using System.Globalization;
using EliteOS.QuickBooksSdkConnector.Configuration;
using EliteOS.QuickBooksSdkConnector.Export;
using EliteOS.QuickBooksSdkConnector.Logging;

namespace EliteOS.QuickBooksSdkConnector.QbSdk;

internal sealed class EstimateQueryHandler
{
    private readonly IteratorQueryRunner _runner;
    private readonly FileLogger _logger;
    private readonly ConnectorSettings _settings;

    public EstimateQueryHandler(IteratorQueryRunner runner, FileLogger logger, ConnectorSettings settings)
    {
        _runner = runner;
        _logger = logger;
        _settings = settings;
    }

    public EntityExtractResult Run(EntityExtractDefinition definition, string outputDirectory)
    {
        var startedAt = DateTime.UtcNow;
        var errors = new List<string>();
        var attempts = new List<string>();

        var withLineItems = CloneDefinition(definition, "<IncludeLineItems>true</IncludeLineItems>");
        attempts.Add("iterator-include-line-items-true");
        _logger.Info("[estimates] Attempt 1: iterator with IncludeLineItems=true");
        var result = _runner.RunPaginatedQuery(withLineItems, outputDirectory);
        if (IsSuccessful(result))
        {
            result.Attempts = attempts;
            return result;
        }

        errors.AddRange(result.Errors);
        IteratorQueryRunner.ClearOutputDirectory(outputDirectory);

        var withoutLineItems = CloneDefinition(definition, "<IncludeLineItems>false</IncludeLineItems>");
        attempts.Add("iterator-include-line-items-false");
        _logger.Info("[estimates] Attempt 2: iterator with IncludeLineItems=false");
        result = _runner.RunPaginatedQuery(withoutLineItems, outputDirectory);
        if (IsSuccessful(result))
        {
            result.Attempts = attempts;
            return result;
        }

        errors.AddRange(result.Errors);
        IteratorQueryRunner.ClearOutputDirectory(outputDirectory);

        attempts.Add("monthly-txn-date-chunks-include-line-items-false");
        _logger.Info("[estimates] Attempt 3: monthly TxnDateRangeFilter chunks with IncludeLineItems=false");
        var chunked = RunMonthlyChunks(definition, outputDirectory, errors);
        chunked.StartedAt = startedAt;
        chunked.Attempts = attempts;
        if (!IsSuccessful(chunked))
        {
            chunked.Errors = MergeDistinctErrors(errors, chunked.Errors);
        }

        return chunked;
    }

    private EntityExtractResult RunMonthlyChunks(
        EntityExtractDefinition definition,
        string outputDirectory,
        IList<string> errors)
    {
        var startedAt = DateTime.UtcNow;
        var batchCount = 0;
        var recordCount = 0;
        var chunkErrors = new List<string>();

        var start = new DateTime(_settings.EstimateChunkStartYear, 1, 1);
        var end = DateTime.UtcNow.Date;
        if (start > end)
        {
            start = new DateTime(end.Year, 1, 1);
        }

        foreach (var month in EnumerateMonths(start, end))
        {
            var label = month.ToString("yyyy-MM", CultureInfo.InvariantCulture);
            var innerElements =
                "<TxnDateRangeFilter>" +
                "<FromTxnDate>" + month.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "</FromTxnDate>" +
                "<ToTxnDate>" + EndOfMonth(month).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "</ToTxnDate>" +
                "</TxnDateRangeFilter>" +
                "<IncludeLineItems>false</IncludeLineItems>";

            var chunkDefinition = CloneDefinition(definition, innerElements);
            _logger.Info($"[estimates] Monthly chunk {label}");

            var chunkResult = _runner.RunPaginatedQuery(
                chunkDefinition,
                outputDirectory,
                startingBatchNumber: batchCount,
                includeOwnerId: true);

            batchCount += chunkResult.BatchCount;
            recordCount += chunkResult.RecordCount;

            if (chunkResult.Errors.Count > 0)
            {
                foreach (var chunkError in chunkResult.Errors)
                {
                    chunkErrors.Add($"[{label}] {chunkError}");
                }
            }
        }

        return new EntityExtractResult
        {
            EntityType = definition.EntityType,
            StartedAt = startedAt,
            CompletedAt = DateTime.UtcNow,
            BatchCount = batchCount,
            RecordCount = recordCount,
            Errors = MergeDistinctErrors(errors, chunkErrors)
        };
    }

    private static bool IsSuccessful(EntityExtractResult result)
    {
        return result != null && (result.Errors == null || result.Errors.Count == 0);
    }

    private static EntityExtractDefinition CloneDefinition(EntityExtractDefinition source, string innerElements)
    {
        return new EntityExtractDefinition
        {
            EntityType = source.EntityType,
            RequestTag = source.RequestTag,
            ResponseTagSuffix = source.ResponseTagSuffix,
            OutputFolder = source.OutputFolder,
            InnerElements = innerElements,
            ExtractLineItems = source.ExtractLineItems,
            QueryStrategy = source.QueryStrategy
        };
    }

    private static IEnumerable<DateTime> EnumerateMonths(DateTime start, DateTime end)
    {
        var cursor = new DateTime(start.Year, start.Month, 1);
        var last = new DateTime(end.Year, end.Month, 1);
        while (cursor <= last)
        {
            yield return cursor;
            cursor = cursor.AddMonths(1);
        }
    }

    private static DateTime EndOfMonth(DateTime monthStart)
    {
        return new DateTime(
            monthStart.Year,
            monthStart.Month,
            DateTime.DaysInMonth(monthStart.Year, monthStart.Month));
    }

    private static IList<string> MergeDistinctErrors(params IList<string>[] groups)
    {
        var merged = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var group in groups)
        {
            if (group == null)
            {
                continue;
            }

            foreach (var error in group)
            {
                if (string.IsNullOrWhiteSpace(error) || !seen.Add(error))
                {
                    continue;
                }

                merged.Add(error);
            }
        }

        return merged;
    }
}
