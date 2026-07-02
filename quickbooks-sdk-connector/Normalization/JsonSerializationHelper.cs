using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
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
                // Defensive fallback: use reflection to serialize any POCO or anonymous type
                // as a real JSON object rather than falling through to Convert.ToString(),
                // which produces a useless C# `.ToString()` string in the output.
                // Anonymous types always have at least one public instance property, so this
                // correctly handles `new { entityType = ..., records = ... }` shapes.
                // True primitives that didn't match the cases above (e.g. float, uint) are
                // serialized as strings via Convert.ToString as a safe last resort.
                var type = value.GetType();
                var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
                if (properties.Length > 0)
                {
                    writer.WriteStartObject();
                    foreach (var prop in properties)
                    {
                        writer.WritePropertyName(prop.Name);
                        WriteValue(writer, prop.GetValue(value));
                    }

                    writer.WriteEndObject();
                }
                else
                {
                    writer.WriteStringValue(Convert.ToString(value));
                }

                break;
        }
    }
}
