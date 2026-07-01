using System;
using System.IO;
using System.Text;

namespace EliteOS.QuickBooksSdkConnector.Logging;

internal sealed class FileLogger : IDisposable
{
    private readonly object _sync = new object();
    private readonly StreamWriter _writer;

    public FileLogger(string logsRoot, string runId)
    {
        Directory.CreateDirectory(logsRoot);
        var path = Path.Combine(logsRoot, $"{runId}.log");
        _writer = new StreamWriter(path, append: false, Encoding.UTF8) { AutoFlush = true };
        Info($"Log file: {path}");
    }

    public void Info(string message) => Write("INFO", message);

    public void Warn(string message) => Write("WARN", message);

    public void Error(string message) => Write("ERROR", message);

    public void Error(string message, Exception ex)
    {
        Write("ERROR", message);
        Write("ERROR", ex.ToString());
    }

    private void Write(string level, string message)
    {
        var line = $"{DateTime.UtcNow:O} [{level}] {message}";
        lock (_sync)
        {
            _writer.WriteLine(line);
        }

        Console.WriteLine(line);
    }

    public void Dispose()
    {
        _writer.Dispose();
    }
}
