using System;
using System.Collections.Generic;

namespace EliteOS.QuickBooksSdkConnector.Export;

internal enum EntityQueryStrategy
{
    SingleRequest,
    IteratorPaginated,
    SimpleList,
    TermsSplit,
    EstimatesWithFallback
}

internal sealed class EntityExtractDefinition
{
    public string EntityType { get; set; }
    public string RequestTag { get; set; }
    public string ResponseTagSuffix { get; set; }
    public string OutputFolder { get; set; }
    public string InnerElements { get; set; }
    public bool ExtractLineItems { get; set; }
    public EntityQueryStrategy QueryStrategy { get; set; }
}

internal sealed class EntityExtractResult
{
    public string EntityType { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime CompletedAt { get; set; }
    public int BatchCount { get; set; }
    public int RecordCount { get; set; }
    public IList<string> Errors { get; set; } = new List<string>();
    public IList<string> Attempts { get; set; } = new List<string>();
}
