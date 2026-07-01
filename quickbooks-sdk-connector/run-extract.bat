@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if not defined QB_CONNECTOR_ROOT set "QB_CONNECTOR_ROOT=%SCRIPT_DIR%"
if not defined QBXML_VERSION set "QBXML_VERSION=13.0"
if not defined QB_MAX_RETURNED set "QB_MAX_RETURNED=100"

echo EliteOS QuickBooks SDK Connector - read-only extract
echo Root: %QB_CONNECTOR_ROOT%
echo.

dotnet run --project "%SCRIPT_DIR%EliteOS.QuickBooksSdkConnector.csproj" -c Release
exit /b %ERRORLEVEL%
