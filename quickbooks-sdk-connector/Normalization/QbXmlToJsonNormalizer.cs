using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml.Linq;

namespace EliteOS.QuickBooksSdkConnector.Normalization;

internal static class QbXmlToJsonNormalizer
{
    public static Dictionary<string, object> ToDictionary(XElement element)
    {
        if (element == null)
        {
            return new Dictionary<string, object>();
        }

        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
        {
            ["@elementName"] = element.Name.LocalName
        };

        foreach (var attribute in element.Attributes())
        {
            result["@" + attribute.Name.LocalName] = attribute.Value;
        }

        var groupedChildren = element.Elements().GroupBy(child => child.Name.LocalName);
        foreach (var group in groupedChildren)
        {
            var values = group.Select(ToDictionary).ToList();
            if (values.Count == 1)
            {
                result[group.Key] = values[0];
            }
            else
            {
                result[group.Key] = values;
            }
        }

        if (!element.HasElements)
        {
            var text = (element.Value ?? string.Empty).Trim();
            if (text.Length > 0)
            {
                result["#text"] = text;
            }
        }

        return result;
    }
}
