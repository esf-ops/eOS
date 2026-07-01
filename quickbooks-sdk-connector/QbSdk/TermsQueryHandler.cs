using System;
using System.Collections.Generic;
using System.Linq;
using EliteOS.QuickBooksSdkConnector.Export;
using EliteOS.QuickBooksSdkConnector.Logging;

namespace EliteOS.QuickBooksSdkConnector.QbSdk;

internal sealed class TermsQueryHandler
{
    private readonly IteratorQueryRunner _runner;
    private readonly FileLogger _logger;

    public TermsQueryHandler(IteratorQueryRunner runner, FileLogger logger)
    {
        _runner = runner;
        _logger = logger;
    }

    public EntityExtractResult Run(EntityExtractDefinition definition, string outputDirectory)
    {
        var startedAt = DateTime.UtcNow;
        var errors = new List<string>();
        var attempts = new List<string>();
        var batchCount = 0;
        var recordCount = 0;

        _logger.Info("[terms] Using StandardTermsQueryRq and DateDrivenTermsQueryRq (TermsQueryRq is not valid QBXML)");

        batchCount += RunSubQuery(
            "standard-terms",
            "StandardTermsQueryRq",
            outputDirectory,
            errors,
            attempts,
            ref recordCount);

        batchCount += RunSubQuery(
            "date-driven-terms",
            "DateDrivenTermsQueryRq",
            outputDirectory,
            errors,
            attempts,
            ref recordCount);

        return new EntityExtractResult
        {
            EntityType = definition.EntityType,
            StartedAt = startedAt,
            CompletedAt = DateTime.UtcNow,
            BatchCount = batchCount,
            RecordCount = recordCount,
            Errors = errors,
            Attempts = attempts
        };
    }

    private int RunSubQuery(
        string label,
        string requestTag,
        string outputDirectory,
        IList<string> errors,
        IList<string> attempts,
        ref int recordCount)
    {
        attempts.Add(label);

        var subDefinition = new EntityExtractDefinition
        {
            EntityType = "terms",
            RequestTag = requestTag,
            ResponseTagSuffix = "QueryRs",
            OutputFolder = "terms",
            InnerElements = string.Empty,
            QueryStrategy = EntityQueryStrategy.TermsSplit
        };

        var subDirectory = outputDirectory;
        var result = _runner.RunSingleQuery(subDefinition, subDirectory, label);

        foreach (var error in result.Errors)
        {
            errors.Add($"[{label}] {error}");
        }

        recordCount += result.RecordCount;
        return result.BatchCount;
    }
}
