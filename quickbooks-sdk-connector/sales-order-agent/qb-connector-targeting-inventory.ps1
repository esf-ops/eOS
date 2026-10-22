# eliteOS - READ-ONLY inventory of how QuickBooks connectors on this machine choose a company file.
#
# Purpose: before anyone opens a different company file, record which processes, scheduled tasks,
# ODBC DSNs, Remote Connector configs, Web Connector logs and eliteOS env files point at which
# .QBW, so a coordinated maintenance window can be planned.
#
# Strictly read-only:
#   - no SDK/COM session, no QuickBooks requests, no ODBC connections;
#   - no service, process, task, registry or file changes;
#   - never stops or reconfigures CData Remote Connector (Thryve), Web Connector or QuickBooks.
# Secrets: config files and logs are scanned in memory and ONLY company-file values (.QBW paths)
# are emitted. DSN values are emitted only for non-credential keys. Env files: only allowlisted
# QuickBooks targeting keys have values printed; other key names are counted, never shown.
#
# Usage (from an elevated "Run as administrator" Windows PowerShell; still read-only):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\qb-connector-targeting-inventory.ps1
# Output: console summary + JSON in -OutDir.

param(
    [string]$OutDir = "C:\eliteOS\logs\qb-so-test",
    [string[]]$EnvSearchRoots = @("C:\eliteOS"),
    [int]$LogTailLines = 4000
)

$ErrorActionPreference = "Continue"
$Version = "1.2.1-readonly"
$Started = Get-Date
$IsElevated = $false
$RunUser = $null
try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $RunUser = $id.Name
    $IsElevated = ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { }
$QbwPattern = '(?i)[A-Za-z]:\\[^"<>|\r\n]*?\.qbw\b|\\\\[^"<>|\r\n]*?\.qbw\b'
$SecretName = '(?i)pass|pwd|secret|token|key|auth|ticket|cred|cookie|session|user|uid|login|signature'
$EnvAllow = '^(QB_COMPANY_FILE|QB_SDK_[A-Z0-9_]+|QB_CONNECTOR_MODE|QB_SALES_ORDER_WRITE_ENABLED|QB_SALES_ORDER_WRITE_ENVIRONMENT|QB_SALES_ORDER_COMPANY_ALLOWLIST|[A-Z0-9_]*_DSN|[A-Z0-9_]*QBXML_VERSION)$'
$TaskPattern = '(?i)eliteos|slabos|quickbooks|\bqb|finance|cdata|thryve|intuit|remote ?connector|web ?connector'

function Redact-Text {
    param([string]$s)
    if (-not $s) { return $s }
    $s = [regex]::Replace($s, '(?i)(-(?:[A-Za-z]*)(?:token|key|secret|password|pwd|cred)[A-Za-z]*\s+)("[^"]*"|\S+)', '$1***')
    $s = [regex]::Replace($s, '(?i)((?:token|key|secret|password|pwd)\s*[=:]\s*)("[^"]*"|[^;\s]+)', '$1***')
    $s = [regex]::Replace($s, '\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}?', '{GUID}')
    $s = [regex]::Replace($s, '[A-Za-z0-9+/=_-]{32,}', '***')
    return $s
}
function Qbw-Paths { param([string]$text) if (-not $text) { return @() }; return @([regex]::Matches($text, $QbwPattern) | ForEach-Object { $_.Value.Trim() } | Sort-Object -Unique) }
function Safe { param([scriptblock]$b, $default = $null) try { & $b } catch { $default } }

$inv = [ordered]@{
    version = $Version; ranAt = $Started.ToUniversalTime().ToString("o"); host = $env:COMPUTERNAME; readOnly = $true
    runContext = [ordered]@{ user = $RunUser; sessionId = (Get-Process -Id $PID).SessionId; elevated = $IsElevated }
    notes = @("No SDK session, no ODBC connection, no process/service/task/registry/file changes.", "Only .QBW paths are extracted from Remote Connector configs and Web Connector logs.")
}

# 1. Processes (QuickBooks, connectors)
$inv.processes = @(Safe { Get-CimInstance Win32_Process | Where-Object { $_.Name -match '(?i)^(QBW(32)?|QBDBMgrN|QBWebConnector|RemoteConnector(Service)?|QBCFMonitorService|QBUpdate|QBIDPService|node|powershell|pwsh)\.exe$' } | ForEach-Object {
    $cmd = [string]$_.CommandLine
    if ($_.Name -match '(?i)^(node|powershell|pwsh)\.exe$' -and $cmd -notmatch '(?i)qb|quickbooks|eliteos|slabos|sales-order') { return }
    $owner = Safe { $o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner -ErrorAction Stop; if ($o.User) { "{0}\{1}" -f $o.Domain, $o.User } } $null
    [ordered]@{
        name = $_.Name; processId = $_.ProcessId; sessionId = $_.SessionId; owner = $owner; commandLineVisible = [bool]$cmd
        started = $(Safe { $_.CreationDate.ToString("o") })
        qbwInCommandLine = (Qbw-Paths $cmd)
        commandLine = (Redact-Text $cmd)
    }
} } @())

# 2. Services
$inv.services = @(Safe { Get-CimInstance Win32_Service | Where-Object { $_.Name -match '(?i)QuickBooksDB|QBCF|QBIDP|RemoteConnector|CData|WebConnector' -or $_.DisplayName -match '(?i)QuickBooks|CData|Remote Connector|Web Connector' } | ForEach-Object {
    [ordered]@{ name = $_.Name; displayName = $_.DisplayName; state = $_.State; startMode = $_.StartMode; account = $_.StartName; processId = $_.ProcessId; path = (Redact-Text ([string]$_.PathName)) }
} } @())

# 3. Scheduled tasks
$inv.scheduledTasks = @(Safe { Get-ScheduledTask | Where-Object { $_.TaskName -match $TaskPattern -or $_.TaskPath -match $TaskPattern -or (@($_.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join " ") -match $TaskPattern } | ForEach-Object {
    $info = Safe { $_ | Get-ScheduledTaskInfo }
    $actions = @($_.Actions | ForEach-Object { [ordered]@{ execute = (Redact-Text ([string]$_.Execute)); arguments = (Redact-Text ([string]$_.Arguments)); workingDirectory = [string]$_.WorkingDirectory; qbwInArguments = (Qbw-Paths "$($_.Execute) $($_.Arguments)") } })
    [ordered]@{
        name = $_.TaskName; path = $_.TaskPath; state = [string]$_.State; runAs = [string]$_.Principal.UserId; logonType = [string]$_.Principal.LogonType; runLevel = [string]$_.Principal.RunLevel
        sessionBinding = $(if ([string]$_.Principal.LogonType -match '^(Interactive|InteractiveOrPassword)$') { "runs inside the run-as user's own logon session, whichever session that is" } else { "runs whether or not anyone is logged on (non-interactive, machine-wide)" })
        lastRun = $(Safe { $info.LastRunTime.ToString("o") }); nextRun = $(Safe { $info.NextRunTime.ToString("o") }); lastResult = $(Safe { "0x{0:X8}" -f $info.LastTaskResult })
        triggers = @($_.Triggers | ForEach-Object { [ordered]@{ type = $_.CimClass.CimClassName; start = [string]$_.StartBoundary; repetition = [string]$_.Repetition.Interval; repetitionDuration = [string]$_.Repetition.Duration; daysInterval = [string]$_.DaysInterval; enabled = [bool]$_.Enabled } })
        executionTimeLimit = [string]$_.Settings.ExecutionTimeLimit; multipleInstances = [string]$_.Settings.MultipleInstances
        actions = $actions
    }
} } @())

# 4. ODBC DSNs (non-credential values only)
$dsnRoots = @("HKLM:\SOFTWARE\ODBC\ODBC.INI", "HKLM:\SOFTWARE\WOW6432Node\ODBC\ODBC.INI", "HKCU:\SOFTWARE\ODBC\ODBC.INI")
$inv.odbcDsns = @(foreach ($root in $dsnRoots) {
    if (-not (Test-Path $root)) { continue }
    foreach ($k in @(Get-ChildItem $root -ErrorAction SilentlyContinue)) {
        if ($k.PSChildName -eq "ODBC Data Sources") { continue }
        $props = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
        $values = [ordered]@{}; $hidden = @()
        foreach ($p in @($props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) {
            if ($p.Name -match $SecretName) { $hidden += $p.Name; continue }
            $v = [string]$p.Value
            if ($v -match '(?i)(password|pwd|token|secret)\s*=') { $hidden += $p.Name; continue }
            $values[$p.Name] = (Redact-Text $v)
        }
        $all = (@($props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { [string]$_.Value }) -join " ")
        [ordered]@{ hive = $root; dsn = $k.PSChildName; driver = [string]$props.Driver; values = $values; credentialKeysHidden = $hidden; qbwPaths = (Qbw-Paths $all) }
    }
})

# 5. Remote Connector configs: .QBW paths and company-file setting names only
$rcFiles = @()
$rcDirs = @("$env:ProgramFiles\Remote Connector", "${env:ProgramFiles(x86)}\Remote Connector", "$env:ProgramData\Remote Connector", "$env:ProgramData\CData\*Remote*Connector*",
    "C:\Users\*\AppData\Roaming\Remote Connector", "C:\Users\*\AppData\Local\Remote Connector", "C:\Users\*\AppData\Roaming\CData\*Remote*Connector*", "C:\Users\*\AppData\Local\CData\*Remote*Connector*",
    "$env:SystemRoot\System32\config\systemprofile\AppData\Roaming\Remote Connector", "$env:SystemRoot\System32\config\systemprofile\AppData\Local\Remote Connector",
    "$env:SystemRoot\System32\config\systemprofile\AppData\Roaming\CData\*Remote*Connector*", "$env:SystemRoot\System32\config\systemprofile\AppData\Local\CData\*Remote*Connector*")
foreach ($dir in $rcDirs) {
    if (-not (Test-Path -Path $dir)) { continue }
    $rcFiles += @(Get-ChildItem -Path $dir -Recurse -File -Include *.xml, *.config, *.json, *.ini, *.cfg, *.conf, *.settings, *.properties -ErrorAction SilentlyContinue | Where-Object { $_.Length -lt 5MB -and $_.FullName -notmatch '(?i)\\(help|docs?|lib\\font)\\' })
}
$inv.remoteConnectorSearch = [ordered]@{ directories = @($rcDirs | ForEach-Object { [ordered]@{ path = $_; exists = [bool](Test-Path -Path $_) } }); filesFound = $rcFiles.Count }
foreach ($p in @($inv.processes | Where-Object { $_.name -match '(?i)RemoteConnector' })) {
    $m = [regex]::Match([string]$p.commandLine, '(?i)/configfile\s+"?([^"]+?\.(?:xml|config|json|ini|cfg|conf))"?')
    if ($m.Success -and (Test-Path -LiteralPath $m.Groups[1].Value)) { $rcFiles += Get-Item -LiteralPath $m.Groups[1].Value }
}
$inv.remoteConnectorConfigs = @($rcFiles | Sort-Object FullName -Unique | ForEach-Object {
    $text = Safe { [IO.File]::ReadAllText($_.FullName) } ""
    $paths = Qbw-Paths $text
    $companySettingNames = @([regex]::Matches($text, '(?i)["<]?\b([A-Za-z_]*company_?file[A-Za-z_]*)\b') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $text = $null
    [ordered]@{ file = $_.FullName; lastWrite = $_.LastWriteTime.ToString("o"); qbwPaths = $paths; companyFileSettingNames = $companySettingNames; contentsOtherwiseNotRead = $true }
})

# 6. Web Connector: logs and app registrations (.QBW paths and app names only)
$wcLogs = @(foreach ($d in @("$env:ProgramData\Intuit\QBWebConnector\log", "C:\Users\*\AppData\Local\Intuit\QBWebConnector\log")) { if (Test-Path -Path $d) { Get-ChildItem -Path $d -File -Filter *.txt -ErrorAction SilentlyContinue } })
$inv.webConnector = [ordered]@{
    logs = @($wcLogs | ForEach-Object {
        $tail = @(Safe { Get-Content -LiteralPath $_.FullName -Tail $LogTailLines } @())
        $apps = @($tail | ForEach-Object { [regex]::Match($_, '(?i)(?:AppName|Application)\s*[=:]\s*([^,;\]\r\n]{1,80})') } | Where-Object { $_.Success } | ForEach-Object { $_.Groups[1].Value.Trim() } | Sort-Object -Unique)
        [ordered]@{ file = $_.FullName; lastWrite = $_.LastWriteTime.ToString("o"); qbwPaths = (Qbw-Paths ($tail -join "`n")); appNames = $apps }
    })
    registrations = @(Get-ChildItem -Path "HKCU:\Software\Intuit\QBWebConnector", "HKLM:\SOFTWARE\WOW6432Node\Intuit\QBWebConnector", "HKLM:\SOFTWARE\Intuit\QBWebConnector" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
        $all = (@($props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' -and $_.Name -notmatch $SecretName } | ForEach-Object { [string]$_.Value }) -join " ")
        $paths = Qbw-Paths $all
        if ($paths.Count) { [ordered]@{ key = ($_.Name -replace '\{[0-9A-Fa-f-]{36}\}', '{GUID}'); qbwPaths = $paths } }
    })
}

# 7. eliteOS env/config files: allowlisted QuickBooks targeting keys only
$inv.eliteosEnv = @(foreach ($root in $EnvSearchRoots) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem -Path $root -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)^\.env(\..+)?$|\.env$|^brain\.flags\.env$' -and $_.Length -lt 1MB } | ForEach-Object {
        $vals = [ordered]@{}; $other = 0
        foreach ($line in @(Safe { Get-Content -LiteralPath $_.FullName } @())) {
            $m = [regex]::Match($line, '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$')
            if (-not $m.Success) { continue }
            if ($m.Groups[1].Value -match $EnvAllow -and $m.Groups[1].Value -notmatch '(?i)token|secret|password|key') { $vals[$m.Groups[1].Value] = $m.Groups[2].Value.Trim().Trim('"') } else { $other++ }
        }
        [ordered]@{ file = $_.FullName; qbTargeting = $vals; otherKeysNotShown = $other }
    }
})
$inv.machineEnv = [ordered]@{}
foreach ($scope in @("Machine", "User")) {
    $vars = [Environment]::GetEnvironmentVariables($scope)
    $vals = [ordered]@{}
    foreach ($k in @($vars.Keys)) { if ([string]$k -match $EnvAllow -and [string]$k -notmatch '(?i)token|secret|password|key') { $vals[[string]$k] = [string]$vars[$k] } }
    $inv.machineEnv[$scope] = $vals
}

# 8. QuickBooks recent files and hosted company folders
$inv.quickbooks = [ordered]@{
    qbwIniRecentFiles = @(Get-ChildItem -Path "$env:ProgramData\Intuit\QuickBooks*" -Recurse -File -Filter qbw.ini -ErrorAction SilentlyContinue | ForEach-Object { [ordered]@{ file = $_.FullName; qbwPaths = (Qbw-Paths (Safe { [IO.File]::ReadAllText($_.FullName) } "")) } })
    companyFolders = @()
    smbOpenQbw = $(Safe { @(Get-SmbOpenFile -ErrorAction Stop | Where-Object { $_.Path -match '(?i)\.qbw$' } | Group-Object Path | ForEach-Object { [ordered]@{ path = $_.Name; openHandles = $_.Count; clients = @($_.Group | ForEach-Object { $_.ClientComputerName } | Sort-Object -Unique) } }) } "unavailable (needs elevation or SMB not used)")
}
$knownQbw = @()
$knownQbw += @($inv.processes | ForEach-Object { $_.qbwInCommandLine })
$knownQbw += @($inv.odbcDsns | ForEach-Object { $_.qbwPaths })
$knownQbw += @($inv.remoteConnectorConfigs | ForEach-Object { $_.qbwPaths })
$knownQbw += @($inv.webConnector.logs | ForEach-Object { $_.qbwPaths })
$knownQbw += @($inv.quickbooks.qbwIniRecentFiles | ForEach-Object { $_.qbwPaths })
$knownQbw += @($inv.eliteosEnv | ForEach-Object { $_.qbTargeting.QB_COMPANY_FILE })
$knownQbw += @($inv.machineEnv.Values | ForEach-Object { $_.QB_COMPANY_FILE })
$folders = @($knownQbw | Where-Object { $_ } | ForEach-Object { Split-Path -Parent $_ } | Sort-Object -Unique)
$inv.quickbooks.companyFolders = @($folders | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
    [ordered]@{ folder = $_; files = @(Get-ChildItem -LiteralPath $_ -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '(?i)^\.(qbw|nd|tlg|dsn)$' -or $_.Name -match '(?i)\.qbw\.' } | ForEach-Object { [ordered]@{ name = $_.Name; sizeMB = [math]::Round($_.Length / 1MB, 1); lastWrite = $_.LastWriteTime.ToString("o") } }) }
})

# 9. Session isolation evidence. A separate Windows session is never assumed to isolate anything.
$qbProcPattern = '(?i)^(QBW(32)?|QBDBMgrN|QBWebConnector|RemoteConnector(Service)?|QBCFMonitorService)\.exe$'
$machineWide = New-Object System.Collections.Generic.List[string]
foreach ($s in @($inv.services | Where-Object { $_.state -eq "Running" })) { $machineWide.Add(("service {0} ({1}) running as {2}, start {3}" -f $s.name, $s.displayName, $s.account, $s.startMode)) }
foreach ($s in @($inv.services | Where-Object { $_.state -ne "Running" -and $_.startMode -eq "Auto" })) { $machineWide.Add(("service {0} ({1}) is Auto-start but {2}" -f $s.name, $s.displayName, $s.state)) }
foreach ($t in @($inv.scheduledTasks | Where-Object { $_.state -ne "Disabled" -and $_.path -notmatch '^\\Microsoft\\' -and $_.logonType -notmatch '^(Interactive|InteractiveOrPassword)$' })) { $machineWide.Add(("task {0}{1} runs as {2} with logon type {3} (no user session needed)" -f $t.path, $t.name, $t.runAs, $t.logonType)) }
foreach ($p in @($inv.processes | Where-Object { $_.sessionId -eq 0 -and $_.name -match $qbProcPattern })) { $machineWide.Add(("process {0} pid {1} in session 0 (service context)" -f $p.name, $p.processId)) }
$sessionBound = @($inv.processes | Where-Object { $_.sessionId -ne 0 -and $_.name -match $qbProcPattern } | ForEach-Object { [ordered]@{ process = $_.name; processId = $_.processId; sessionId = $_.sessionId; owner = $_.owner } })
$interactiveTasks = @($inv.scheduledTasks | Where-Object { $_.state -ne "Disabled" -and $_.logonType -match '^(Interactive|InteractiveOrPassword)$' } | ForEach-Object { [ordered]@{ task = "$($_.path)$($_.name)"; runAs = $_.runAs; nextRun = $_.nextRun } })
$usersToAvoid = @(@($sessionBound | ForEach-Object { $_.owner }) + @($interactiveTasks | ForEach-Object { $_.runAs }) | Where-Object { $_ } | ForEach-Object { ($_ -split '\\')[-1] } | Sort-Object -Unique)
$hostingDb = @($inv.services | Where-Object { $_.name -match '(?i)^QuickBooksDB' -and $_.state -eq "Running" } | ForEach-Object { $_.name })
$verdict = if (-not $IsElevated) { "UNDETERMINED_NOT_ELEVATED" } elseif ($machineWide.Count) { "NOT_ISOLATED_MACHINE_WIDE_COMPONENTS_PRESENT" } else { "NO_MACHINE_WIDE_QB_COMPONENTS_FOUND" }
$inv.sessionIsolation = [ordered]@{
    verdict = $verdict
    currentSession = $inv.runContext
    loggedOnSessions = @(Safe { @(& quser 2>$null | ForEach-Object { ($_ -replace '\s{2,}', ' | ').Trim() }) } @("unavailable"))
    machineWideComponents = $machineWide.ToArray()
    sessionBoundQuickBooksProcesses = $sessionBound
    interactiveTasksFollowRunAsUser = $interactiveTasks
    secondSessionUserMustNotBe = $usersToAvoid
    quickBooksDatabaseServerRunning = $hostingDb
    caveats = @(
        "A second Windows session separates interactive desktops only. Services and tasks with non-interactive logon run machine-wide regardless of who is logged on.",
        "Interactive tasks run in their run-as user's session. If the second session uses that same user, those tasks and any SDK/ODBC client they start can land in the TEST session.",
        "SDK and Remote Connector clients attach to QuickBooks in their own session; with no QuickBooks there, the SDK may start QuickBooks in the background on the file it names or its default.",
        "A running QuickBooks Database Server hosts files for every session and workstation; the TEST copy must be a different .QBW in a different folder.",
        "Without elevation, other sessions' command lines, owners, some tasks and SMB handles are hidden, so the verdict is UNDETERMINED."
    )
}

# 10. Summary: which connector targets what
$summary = New-Object System.Collections.Generic.List[string]
$summary.Add(("Run as {0} in session {1}, elevated={2}" -f $inv.runContext.user, $inv.runContext.sessionId, $IsElevated))
$summary.Add(("Session isolation verdict: {0} ({1} machine-wide item(s))" -f $verdict, $machineWide.Count))
foreach ($m in $machineWide) { $summary.Add("  machine-wide: $m") }
if ($usersToAvoid.Count) { $summary.Add(("A second session must not use: {0}" -f ($usersToAvoid -join ", "))) }
foreach ($d in @($inv.odbcDsns)) { $summary.Add(("ODBC DSN {0} ({1}): {2}" -f $d.dsn, $d.driver, $(if ($d.qbwPaths.Count) { $d.qbwPaths -join "; " } else { "no .QBW in this DSN (targeting not determined here)" }))) }
$summary.Add(("Remote Connector search: {0} config file(s) in {1} existing folder(s)" -f $rcFiles.Count, @($inv.remoteConnectorSearch.directories | Where-Object { $_.exists }).Count))
if (-not $rcFiles.Count) { $summary.Add("Remote Connector company-file setting not found on disk (it may be stored elsewhere); read it in the Remote Connector Users tab") }
foreach ($r in @($inv.remoteConnectorConfigs)) { $summary.Add(("Remote Connector config {0}: {1}; company-file setting names: {2}" -f $r.file, $(if ($r.qbwPaths.Count) { $r.qbwPaths -join "; " } else { "no .QBW path" }), $(if ($r.companyFileSettingNames.Count) { $r.companyFileSettingNames -join ", " } else { "none" }))) }
foreach ($l in @($inv.webConnector.logs)) { $summary.Add(("Web Connector log {0}: files seen {1}; apps {2}" -f $l.file, $(if ($l.qbwPaths.Count) { $l.qbwPaths -join "; " } else { "none" }), $(if ($l.appNames.Count) { $l.appNames -join ", " } else { "n/a" }))) }
foreach ($e in @($inv.eliteosEnv)) { $summary.Add(("eliteOS env {0}: {1}" -f $e.file, $(if ($e.qbTargeting.Count) { (@($e.qbTargeting.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value }) -join "; ") } else { "no QuickBooks targeting keys" }))) }
foreach ($t in @($inv.scheduledTasks | Where-Object { $_.path -notmatch '^\\Microsoft\\' })) { $summary.Add(("Task {0} [{1}] as {2}/{3} every {4} for {5} next {6} last {7} result {8}: {9}" -f $t.name, $t.state, $t.runAs, $t.logonType, (@($t.triggers | ForEach-Object { if ($_.repetition) { $_.repetition } else { "day" } }) -join ","), (@($t.triggers | ForEach-Object { if ($_.repetitionDuration) { $_.repetitionDuration } else { "-" } }) -join ","), $t.nextRun, $t.lastRun, $t.lastResult, ((@($t.actions | ForEach-Object { if ($_.qbwInArguments.Count) { $_.qbwInArguments -join ";" } else { "no .QBW in arguments" } }) | Sort-Object -Unique) -join " | "))) }
foreach ($p in @($inv.processes | Where-Object { $_.name -match '(?i)^QBW(32)?\.exe$' })) { $summary.Add(("QuickBooks process pid {0} session {1} owner {2} started {3}: {4}" -f $p.processId, $p.sessionId, $p.owner, $p.started, $(if ($p.qbwInCommandLine.Count) { $p.qbwInCommandLine -join "; " } else { "company not on command line (opened interactively)" }))) }
$inv.summary = $summary.ToArray()

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$outFile = Join-Path $OutDir ("qb-connector-targeting-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$inv.elapsedSeconds = [int]((Get-Date) - $Started).TotalSeconds
$inv | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outFile -Encoding UTF8
Write-Host ("eliteOS QuickBooks connector targeting inventory {0} (read-only)" -f $Version)
$inv.summary | ForEach-Object { Write-Host ("  - {0}" -f $_) }
Write-Host ("Report: {0}" -f $outFile)
exit 0
