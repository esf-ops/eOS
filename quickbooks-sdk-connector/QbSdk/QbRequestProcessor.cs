using System;
using System.Reflection;

namespace EliteOS.QuickBooksSdkConnector.QbSdk;

internal sealed class QbRequestProcessor : IDisposable
{
    private const string RequestProcessorProgId = "QBXMLRP2.RequestProcessor";
    private const int OpenConnectionTypeLocalQbd = 1;
    private const int OpenModeDontCare = 2;

    private object _processor;
    private string _ticket;
    private bool _connected;
    private bool _sessionOpen;

    public void OpenSession(string appId, string appName, string companyFile)
    {
        if (_connected)
        {
            return;
        }

        _processor = CreateRequestProcessor();
        OpenConnection(appId, appName);

        var qbFile = string.IsNullOrWhiteSpace(companyFile) ? string.Empty : companyFile;
        _ticket = InvokeString("BeginSession", qbFile, OpenModeDontCare);
        _sessionOpen = true;
    }

    public string ProcessRequest(string requestXml)
    {
        EnsureSession();
        return InvokeString("ProcessRequest", _ticket, requestXml);
    }

    public void CloseSession()
    {
        if (_sessionOpen)
        {
            InvokeVoid("EndSession", _ticket);
            _sessionOpen = false;
            _ticket = null;
        }

        if (_connected)
        {
            InvokeVoid("CloseConnection");
            _connected = false;
        }
    }

    private void OpenConnection(string appId, string appName)
    {
        try
        {
            InvokeVoid("OpenConnection2", appId, appName, OpenConnectionTypeLocalQbd);
            _connected = true;
            return;
        }
        catch (TargetInvocationException ex) when (IsMissingMember(ex))
        {
            // Older request processor builds may not expose OpenConnection2.
        }

        try
        {
            InvokeVoid("OpenConnection", appId, appName);
            _connected = true;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "Failed to open a QuickBooks connection via the Request Processor. " +
                "Confirm QuickBooks Desktop is available on this VM, the Desktop SDK is installed, " +
                "and SDKTestPlus3 connects successfully.",
                ex);
        }
    }

    private static object CreateRequestProcessor()
    {
        var type = Type.GetTypeFromProgID(RequestProcessorProgId);
        if (type == null)
        {
            throw new InvalidOperationException(
                "QuickBooks Request Processor COM object was not found (ProgID: " +
                RequestProcessorProgId + "). Confirm QuickBooks Desktop SDK is installed on this " +
                "Windows VM and SDKTestPlus3 can connect with statusCode=\"0\" before running this extractor.");
        }

        try
        {
            return Activator.CreateInstance(type);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "Failed to create QuickBooks Request Processor COM object (ProgID: " +
                RequestProcessorProgId + "). Confirm QuickBooks Desktop SDK is installed and " +
                "SDKTestPlus3 works on this VM.",
                ex);
        }
    }

    private void EnsureSession()
    {
        if (!_sessionOpen)
        {
            throw new InvalidOperationException("QuickBooks session is not open.");
        }
    }

    private void InvokeVoid(string methodName, params object[] args)
    {
        Invoke(methodName, args);
    }

    private string InvokeString(string methodName, params object[] args)
    {
        var result = Invoke(methodName, args);
        return result as string ?? Convert.ToString(result) ?? string.Empty;
    }

    private object Invoke(string methodName, params object[] args)
    {
        if (_processor == null)
        {
            throw new InvalidOperationException("QuickBooks Request Processor is not initialized.");
        }

        try
        {
            return _processor.GetType().InvokeMember(
                methodName,
                BindingFlags.InvokeMethod | BindingFlags.Public | BindingFlags.Instance,
                binder: null,
                _processor,
                args);
        }
        catch (TargetInvocationException ex)
        {
            throw ex.InnerException ?? ex;
        }
    }

    private static bool IsMissingMember(Exception ex)
    {
        for (var current = ex; current != null; current = current.InnerException)
        {
            if (current is MissingMethodException || current is MissingMemberException)
            {
                return true;
            }
        }

        return false;
    }

    public void Dispose()
    {
        CloseSession();
        _processor = null;
    }
}
