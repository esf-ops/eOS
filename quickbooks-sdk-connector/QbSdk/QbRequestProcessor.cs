using System;
using QBXMLRP2Lib;

namespace EliteOS.QuickBooksSdkConnector.QbSdk;

internal sealed class QbRequestProcessor : IDisposable
{
    private readonly RequestProcessor2 _processor = new RequestProcessor2();
    private string _ticket;
    private bool _connected;
    private bool _sessionOpen;

    public void OpenSession(string appId, string appName, string companyFile)
    {
        if (_connected)
        {
            return;
        }

        _processor.OpenConnection2(appId, appName, ENOpenConnectionType.ocLocalQBD);
        _connected = true;

        _ticket = _processor.BeginSession(
            string.IsNullOrWhiteSpace(companyFile) ? string.Empty : companyFile,
            ENOpenMode.omDontCare);
        _sessionOpen = true;
    }

    public string ProcessRequest(string requestXml)
    {
        EnsureSession();
        return _processor.ProcessRequest(_ticket, requestXml);
    }

    public void CloseSession()
    {
        if (_sessionOpen)
        {
            _processor.EndSession(_ticket);
            _sessionOpen = false;
            _ticket = null;
        }

        if (_connected)
        {
            _processor.CloseConnection();
            _connected = false;
        }
    }

    private void EnsureSession()
    {
        if (!_sessionOpen)
        {
            throw new InvalidOperationException("QuickBooks session is not open.");
        }
    }

    public void Dispose()
    {
        CloseSession();
    }
}
