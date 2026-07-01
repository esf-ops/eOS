using System;
using System.Text;

namespace EliteOS.QuickBooksSdkConnector.QbSdk;

internal static class QbXmlBuilder
{
    public static string WrapRequest(string qbXmlVersion, string innerRequest)
    {
        var builder = new StringBuilder();
        builder.Append("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
        builder.Append("<?qbxml version=\"");
        builder.Append(EscapeAttribute(qbXmlVersion));
        builder.Append("\"?>");
        builder.Append("<QBXML><QBXMLMsgsRq onError=\"continueOnError\">");
        builder.Append(innerRequest);
        builder.Append("</QBXMLMsgsRq></QBXML>");
        return builder.ToString();
    }

    public static string BuildIteratorQuery(
        string requestTag,
        string qbXmlVersion,
        int maxReturned,
        string requestId,
        string iteratorMode,
        string iteratorId,
        string innerElements,
        bool includeOwnerId = true)
    {
        var request = new StringBuilder();
        request.Append("<");
        request.Append(requestTag);
        request.Append(" requestID=\"");
        request.Append(EscapeAttribute(requestId));
        request.Append("\" iterator=\"");
        request.Append(EscapeAttribute(iteratorMode));
        if (!string.IsNullOrWhiteSpace(iteratorId))
        {
            request.Append("\" iteratorID=\"");
            request.Append(EscapeAttribute(iteratorId));
        }

        request.Append("\">");
        request.Append("<MaxReturned>");
        request.Append(maxReturned);
        request.Append("</MaxReturned>");
        request.Append(innerElements ?? string.Empty);
        if (includeOwnerId)
        {
            request.Append("<OwnerID>0</OwnerID>");
        }

        request.Append("</");
        request.Append(requestTag);
        request.Append(">");

        return WrapRequest(qbXmlVersion, request.ToString());
    }

    public static string BuildSingleQuery(
        string requestTag,
        string qbXmlVersion,
        string requestId,
        string innerElements)
    {
        var request = new StringBuilder();
        request.Append("<");
        request.Append(requestTag);
        request.Append(" requestID=\"");
        request.Append(EscapeAttribute(requestId));
        request.Append("\">");
        request.Append(innerElements ?? string.Empty);
        request.Append("</");
        request.Append(requestTag);
        request.Append(">");

        return WrapRequest(qbXmlVersion, request.ToString());
    }

    private static string EscapeAttribute(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value
            .Replace("&", "&amp;")
            .Replace("\"", "&quot;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;");
    }
}
