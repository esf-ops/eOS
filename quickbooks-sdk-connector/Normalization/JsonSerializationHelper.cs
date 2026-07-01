using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;

namespace EliteOS.QuickBooksSdkConnector.Normalization;

internal static class JsonSerializationHelper
{
    public static void WriteIndentedJson(string path, object payload)
    {
        var json = SerializeIndented(payload);
        File.WriteAllText(path, json, Encoding.UTF8);
    }

    private static string SerializeIndented(object payload)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true }))
        {
            WriteValue(writer, payload);
        }

        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static void WriteValue(Utf8JsonWriter writer, object value)
    {
        switch (value)
        {
            case null:
                writer.WriteNullValue();
                break;
            case string s:
                writer.WriteStringValue(s);
                break;
            case bool b:
                writer.WriteBooleanValue(b);
                break;
            case int i:
                writer.WriteNumberValue(i);
                break;
            case long l:
                writer.WriteNumberValue(l);
                break;
            case double d:
                writer.WriteNumberValue(d);
                break;
            case decimal m:
                writer.WriteNumberValue(m);
                break;
            case DateTime dt:
                writer.WriteStringValue(dt.ToString("O"));
                break;
            case IDictionary<string, object> map:
                writer.WriteStartObject();
                foreach (var pair in map)
                {
                    writer.WritePropertyName(pair.Key);
                    WriteValue(writer, pair.Value);
                }

                writer.WriteEndObject();
                break;
            case IDictionary dict:
                writer.WriteStartObject();
                foreach (DictionaryEntry entry in dict)
                {
                    writer.WritePropertyName(Convert.ToString(entry.Key));
                    WriteValue(writer, entry.Value);
                }

                writer.WriteEndObject();
                break;
            case IEnumerable list when value is not string:
                writer.WriteStartArray();
                foreach (var item in list)
                {
                    WriteValue(writer, item);
                }

                writer.WriteEndArray();
                break;
            default:
                writer.WriteStringValue(Convert.ToString(value));
                break;
        }
    }
}
