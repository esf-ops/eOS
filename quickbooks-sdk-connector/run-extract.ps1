$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not $env:QB_CONNECTOR_ROOT) {
    $env:QB_CONNECTOR_ROOT = $ScriptDir
}

if (-not $env:QBXML_VERSION) {
    $env:QBXML_VERSION = "13.0"
}

if (-not $env:QB_MAX_RETURNED) {
    $env:QB_MAX_RETURNED = "100"
}

Write-Host "EliteOS QuickBooks SDK Connector - read-only extract"
Write-Host "Root: $($env:QB_CONNECTOR_ROOT)"
Write-Host ""

dotnet run --project (Join-Path $ScriptDir "EliteOS.QuickBooksSdkConnector.csproj") -c Release
exit $LASTEXITCODE
