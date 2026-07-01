using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml.Linq;

namespace EliteOS.QuickBooksSdkConnector.QbSdk;

internal sealed class QbQueryResponse
{
    public string RawXml { get; set; }
    public string StatusCode { get; set; }
    public string StatusSeverity { get; set; }
    public string StatusMessage { get; set; }
    public string IteratorId { get; set; }
    public int IteratorRemainingCount { get; set; }
    public IList<XElement> RetElements { get; set; } = new List<XElement>();
    public bool IsSuccess => StatusCode == "0";
}

internal static class QbXmlResponseParser
{
    public static QbQueryResponse Parse(string rawXml, string responseTagSuffix)
    {
        var doc = XDocument.Parse(rawXml, LoadOptions.PreserveWhitespace);
        var responseElement = doc
            .Descendants()
            .FirstOrDefault(el => el.Name.LocalName.EndsWith(responseTagSuffix, StringComparison.OrdinalIgnoreCase));

        if (responseElement == null)
        {
            return new QbQueryResponse
            {
                RawXml = rawXml,
                StatusCode = "999",
                StatusSeverity = "Error",
                StatusMessage = $"Response element ending with '{responseTagSuffix}' was not found."
            };
        }

        var retElements = responseElement
            .Elements()
            .Where(el => el.Name.LocalName.EndsWith("Ret", StringComparison.OrdinalIgnoreCase))
            .ToList();

        return new QbQueryResponse
        {
            RawXml = rawXml,
            StatusCode = Attr(responseElement, "statusCode") ?? "999",
            StatusSeverity = Attr(responseElement, "statusSeverity"),
            StatusMessage = Attr(responseElement, "statusMessage"),
            IteratorId = Attr(responseElement, "iteratorID"),
            IteratorRemainingCount = ParseInt(Attr(responseElement, "iteratorRemainingCount")),
            RetElements = retElements
        };
    }

    public static IEnumerable<XElement> ExtractLineItems(IEnumerable<XElement> retElements)
    {
        foreach (var ret in retElements)
        {
            foreach (var child in ret.Elements())
            {
                if (child.Name.LocalName.EndsWith("LineRet", StringComparison.OrdinalIgnoreCase))
                {
                    yield return child;
                }
            }
        }
    }

    private static string Attr(XElement element, string name)
    {
        return element.Attribute(name)?.Value;
    }

    private static int ParseInt(string value)
    {
        return int.TryParse(value, out var parsed) ? parsed : 0;
    }
}
