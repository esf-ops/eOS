#Requires -Version 5.1
<#
.SYNOPSIS
  Windows-only Moraware SDK read-only probe: GetAssignees() catalog (sanitized).

  Env: MORAWARE_URL or MORAWARE_API_URL; MORAWARE_USERNAME; MORAWARE_PASSWORD (never logged).
#>

$ErrorActionPreference = "Stop"

function Write-Utf8NoBomFile {
    param([string]$Path, [string]$Content)
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Test-WindowsFormsBlocker {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $false }
    return $Text.IndexOf("System.Windows.Forms", [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-ConnMethodOverloadSignatures {
    param([type]$ConnType, [string]$MethodName)
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    $all = $ConnType.GetMethods($flags)
    $sigs = New-Object System.Collections.Generic.List[string]
    foreach ($m in $all) {
        if ($m.Name -ne $MethodName) { continue }
        if ($m.IsGenericMethod) { continue }
        $ps = $m.GetParameters()
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($p in $ps) {
            [void]$parts.Add($p.ParameterType.FullName + " " + $p.Name)
        }
        $retName = ""
        if ($m.ReturnType) { $retName = $m.ReturnType.FullName }
        [void]$sigs.Add($m.Name + "(" + ($parts -join ", ") + ") -> " + $retName)
    }
    return @($sigs)
}

function Find-ParameterlessMethod {
    param([type]$ConnType, [string]$MethodName)
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    foreach ($m in $ConnType.GetMethods($flags)) {
        if ($m.Name -ne $MethodName) { continue }
        if ($m.IsGenericMethod) { continue }
        if ($m.GetParameters().Length -eq 0) { return $m }
    }
    return $null
}

function New-TypedTypeArray {
    param([type[]]$Types)
    if ($null -eq $Types -or $Types.Length -eq 0) { return [System.Type]::EmptyTypes }
    $good = New-Object System.Collections.ArrayList
    foreach ($x in $Types) {
        if ($null -ne $x) { [void]$good.Add($x) }
    }
    if ($good.Count -eq 0) { return [System.Type]::EmptyTypes }
    return [type[]]$good.ToArray()
}

function New-TypedObjectArray {
    param([object[]]$Values, [type[]]$Types)
    $len = 0
    if ($null -ne $Values) { $len = $Values.Length }
    if ($len -eq 0) { return (New-Object object[] 0) }
    $arr = New-Object 'object[]' $len
    for ($i = 0; $i -lt $len; $i++) {
        $v = $Values[$i]
        if ($null -ne $Types -and $i -lt $Types.Length -and $null -ne $Types[$i]) {
            $t = $Types[$i]
            if ($t -eq [bool]) { $arr[$i] = [bool]$v }
            elseif ($t -eq [int32]) { $arr[$i] = [int32]$v }
            elseif ($t -eq [int64]) { $arr[$i] = [int64]$v }
            elseif ($t -eq [string]) {
                if ($null -eq $v) { $arr[$i] = $null } else { $arr[$i] = [string]$v }
            }
            elseif ($null -eq $v) { $arr[$i] = $null }
            else {
                try { $arr[$i] = [Convert]::ChangeType($v, $t) } catch { $arr[$i] = $v }
            }
        }
        else {
            $arr[$i] = $v
        }
    }
    return ,$arr
}

function Invoke-ConnMethod {
    param($Connection, [string]$MethodName, [object[]]$ArgValues, [type[]]$ArgTypes)
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    if ($null -eq $ArgValues) { $ArgValues = New-Object object[] 0 }
    $types = New-TypedTypeArray $ArgTypes
    if ($null -eq $types) { $types = [System.Type]::EmptyTypes }
    $m = $Connection.GetType().GetMethod($MethodName, $flags, $null, $types, $null)
    if (-not $m) {
        $overloads = @(Get-ConnMethodOverloadSignatures $Connection.GetType() $MethodName)
        $sigDesc = "()"
        if ($types.Length -gt 0) {
            $tparts = @()
            foreach ($t in $types) { $tparts += $t.FullName }
            $sigDesc = "(" + ($tparts -join ", ") + ")"
        }
        $msg = "method_not_found_with_signature: " + $MethodName + $sigDesc
        if ($overloads.Count -gt 0) {
            $msg = $msg + " | available_overloads: " + ($overloads -join " | ")
        }
        throw $msg
    }
    $invokeArgs = New-TypedObjectArray $ArgValues $ArgTypes
    if ($null -eq $invokeArgs) { $invokeArgs = New-Object object[] 0 }
    return $m.Invoke($Connection, $invokeArgs)
}

function Get-PropValue {
    param($Target, [string[]]$Names)
    if ($null -eq $Target) { return $null }
    foreach ($n in $Names) {
        $p = $Target.GetType().GetProperty($n, [System.Reflection.BindingFlags]"Public,Instance")
        if ($p -and $p.CanRead) {
            try { return $p.GetValue($Target) } catch { }
        }
    }
    return $null
}

function Format-Scalar {
    param($v)
    if ($null -eq $v) { return "" }
    if ($v -is [DateTime]) { return $v.ToString("o", [System.Globalization.CultureInfo]::InvariantCulture) }
    if ($v -is [System.IFormattable]) { return $v.ToString($null, [System.Globalization.CultureInfo]::InvariantCulture) }
    return [string]$v
}

function New-SanitizedAssigneeRow {
    param($Obj)
    if ($null -eq $Obj) { return $null }
    $id = Format-Scalar (Get-PropValue $Obj @("AssigneeId", "AssigneeID", "Id", "ResourceId", "EmployeeId", "UserId"))
    $nm = Format-Scalar (Get-PropValue $Obj @("Name", "AssigneeName", "DisplayName", "FullName", "Title"))
    $active = Format-Scalar (Get-PropValue $Obj @("IsActive", "Active", "IsEnabled", "Enabled"))
    $status = Format-Scalar (Get-PropValue $Obj @("Status", "StatusName", "AssigneeStatus", "State"))
    $descLen = 0
    $dv = Get-PropValue $Obj @("Description", "Notes", "Comment")
    if ($null -ne $dv -and $dv -is [string]) { $descLen = $dv.Length }
    elseif ($null -ne $dv) { $descLen = ([string]$dv).Length }
    $propMeta = New-Object System.Collections.ArrayList
    foreach ($p in $Obj.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if (-not $p.CanRead) { continue }
        [void]$propMeta.Add([ordered]@{ name = $p.Name; type = $p.PropertyType.FullName })
    }
    return [ordered]@{
        assignee_id          = $id
        assignee_name        = $nm
        active_or_enabled    = $active
        status_like          = $status
        description_length   = $descLen
        public_properties    = @($propMeta.ToArray())
    }
}

function Convert-ToObjectArray {
    param($Value)
    if ($null -eq $Value) {
        return New-Object object[] 0
    }
    if ($Value -is [string]) {
        return ,$Value
    }
    if ($Value -is [System.Collections.IList]) {
        $list = New-Object System.Collections.ArrayList
        for ($i = 0; $i -lt $Value.Count; $i++) {
            [void]$list.Add($Value[$i])
        }
        return $list.ToArray()
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $list = New-Object System.Collections.ArrayList
        foreach ($item in $Value) {
            [void]$list.Add($item)
        }
        return $list.ToArray()
    }
    return ,$Value
}

function Test-SubstringHit {
    param([string]$Haystack, [string]$Needle)
    if ([string]::IsNullOrEmpty($Haystack)) { return $false }
    if ([string]::IsNullOrEmpty($Needle)) { return $false }
    return $Haystack.IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Escape-CsvField {
    param($Value)
    if ($null -eq $Value) { return '""' }
    $s = Format-Scalar $Value
    if ($null -eq $s) { $s = "" }
    $s = [string]$s
    $s = $s -replace "`r`n", " "
    $s = $s -replace "`n", " "
    $s = $s -replace "`r", " "
    $s = $s -replace '"', '""'
    return '"' + $s + '"'
}

if ($PSVersionTable.PSEdition -eq "Core") {
    Write-Host "ERROR: Use Windows PowerShell 5.1 (powershell.exe)." -ForegroundColor Red
    exit 2
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DllPath = Join-Path $ScriptDir "lib\JobTrackerAPI5.dll"
$OutJson = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-assignees.json"
$OutTxt  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-assignees.txt"
$OutCsv  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-assignees.csv"

$url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_URL")).Trim()
if (-not $url) { $url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_API_URL")).Trim() }
$user = [string]([Environment]::GetEnvironmentVariable("MORAWARE_USERNAME")).Trim()
$pass = [string]([Environment]::GetEnvironmentVariable("MORAWARE_PASSWORD")).Trim()

$apiHost = $null
try { if ($url) { $apiHost = ([Uri]$url).Host } } catch { $apiHost = $null }

$keywords = @("Titan", "Saber", "Robot", "Saw", "Polish", "Machine")

$report = [ordered]@{
    generated_at         = [DateTime]::UtcNow.ToString("o")
    source               = "MorawareSdkAssigneeCatalogProbe.ps1"
    classification       = $null
    top_level_error      = $null
    top_level_error_type = $null
    credentials          = @{
        api_url_configured  = (-not [string]::IsNullOrWhiteSpace($url))
        api_host            = $apiHost
        username_configured = (-not [string]::IsNullOrWhiteSpace($user))
        password_configured = (-not [string]::IsNullOrWhiteSpace($pass))
    }
    get_assignees_signatures = @()
    get_assignees_paramless_signature_used = $null
    total_assignees_returned = 0
    rows_serialized          = 0
    keyword_hit_counts       = @{
        Titan   = 0
        Saber   = 0
        Robot   = 0
        Saw     = 0
        Polish  = 0
        Machine = 0
    }
    keyword_matching_rows    = (New-Object System.Collections.Generic.List[object])
    assignees                = (New-Object System.Collections.Generic.List[object])
}

$connected = $false
$conn = $null

try {
    if (-not $report["credentials"]["api_url_configured"] -or -not $report["credentials"]["username_configured"] -or -not $report["credentials"]["password_configured"]) {
        $report["classification"] = "missing_credentials"
        $report["top_level_error"] = "Missing MORAWARE_URL or MORAWARE_API_URL, and/or MORAWARE_USERNAME / MORAWARE_PASSWORD."
        throw "missing_credentials"
    }

    if (-not (Test-Path -LiteralPath $DllPath)) {
        $report["classification"] = "dll_missing"
        $report["top_level_error"] = "JobTrackerAPI5.dll not found."
        throw "dll_missing"
    }

    try {
        Add-Type -AssemblyName System.Windows.Forms
    } catch {
        $report["classification"] = "system_windows_forms_load_failed"
        $report["top_level_error"] = $_.Exception.Message
        throw
    }

    $asm = [System.Reflection.Assembly]::LoadFrom($DllPath)
    $connType = $asm.GetType("Moraware.JobTrackerAPI5.Connection", $false, $false)
    if (-not $connType) {
        $report["classification"] = "connection_type_not_found"
        $report["top_level_error"] = "Moraware.JobTrackerAPI5.Connection not found."
        throw
    }

    $tracerType = $asm.GetType("Moraware.JobTrackerAPI5.DevelopmentAssistance.SimpleConsoleCommandTracer", $false, $false)
    if (-not $tracerType) {
        $report["classification"] = "command_tracer_type_not_found"
        $report["top_level_error"] = "SimpleConsoleCommandTracer not found."
        throw
    }

    $tracer = [Activator]::CreateInstance($tracerType, @($false, $false))
    $ctor = $null
    foreach ($c in $connType.GetConstructors()) {
        $ps = $c.GetParameters()
        if ($ps.Length -ne 7) { continue }
        if ($ps[0].ParameterType -ne [string] -or $ps[1].ParameterType -ne [string] -or $ps[2].ParameterType -ne [string]) { continue }
        if (-not $ps[3].ParameterType.IsAssignableFrom($tracerType)) { continue }
        if ($ps[4].ParameterType -ne [bool] -or $ps[5].ParameterType -ne [bool]) { continue }
        if ($ps[6].ParameterType -ne [string]) { continue }
        $ctor = $c
        break
    }
    if (-not $ctor) {
        $report["classification"] = "connection_constructor_not_found"
        $report["top_level_error"] = "Expected 7-argument Connection constructor not found."
        throw
    }

    $appName = "eOS Moraware Assignee Catalog Probe"
    $conn = $ctor.Invoke(@($url, $user, $pass, $tracer, [bool]$false, [bool]$false, $appName))

    [void](Invoke-ConnMethod $conn "Connect" ([object[]]@()) ([type[]]@()))
    $connected = $true

    $report["get_assignees_signatures"] = @(Get-ConnMethodOverloadSignatures $connType "GetAssignees")
    $gm = Find-ParameterlessMethod $connType "GetAssignees"
    if (-not $gm) {
        $report["classification"] = "get_assignees_paramless_not_found"
        $report["top_level_error"] = "No parameterless GetAssignees overload on Connection."
        throw "get_assignees_paramless_not_found"
    }
    try {
        $sigLine = ""
        $psm = $gm.GetParameters()
        $partsM = New-Object System.Collections.Generic.List[string]
        foreach ($p in $psm) {
            [void]$partsM.Add($p.ParameterType.FullName + " " + $p.Name)
        }
        $retM = ""
        if ($gm.ReturnType) { $retM = $gm.ReturnType.FullName }
        $sigLine = $gm.Name + "(" + ($partsM -join ", ") + ") -> " + $retM
        $report["get_assignees_paramless_signature_used"] = $sigLine
    } catch { }

    $rawList = Invoke-ConnMethod $conn "GetAssignees" ([object[]]@()) ([type[]]@())
    $arr = Convert-ToObjectArray $rawList
    $report["total_assignees_returned"] = $arr.Length

    foreach ($a in $arr) {
        if ($null -eq $a) { continue }
        $row = New-SanitizedAssigneeRow $a
        if ($null -eq $row) { continue }
        $nm = [string]$row["assignee_name"]
        foreach ($kw in $keywords) {
            if (Test-SubstringHit $nm $kw) {
                $report["keyword_hit_counts"][$kw] = [int]$report["keyword_hit_counts"][$kw] + 1
            }
        }
        $hitsForRow = New-Object System.Collections.ArrayList
        foreach ($kw in $keywords) {
            if (Test-SubstringHit $nm $kw) { [void]$hitsForRow.Add($kw) }
        }
        if ($hitsForRow.Count -gt 0) {
            [void]$report["keyword_matching_rows"].Add([ordered]@{
                assignee_id   = $row["assignee_id"]
                assignee_name = $nm
                keywords_hit  = @($hitsForRow.ToArray())
            })
        }
        [void]$report["assignees"].Add($row)
        $report["rows_serialized"] = [int]$report["rows_serialized"] + 1
    }

    if (-not $report["classification"]) {
        $report["classification"] = "ok"
    }
}
catch {
    if (-not $report["top_level_error"]) {
        $report["top_level_error"] = $_.Exception.Message
        $report["top_level_error_type"] = $_.Exception.GetType().FullName
    }
    if (-not $report["classification"]) {
        if (Test-WindowsFormsBlocker $report["top_level_error"]) {
            $report["classification"] = "windows_dependency_blocker"
        }
        else {
            $report["classification"] = "probe_error"
        }
    }
}
finally {
    if ($connected -and $null -ne $conn) {
        try { [void](Invoke-ConnMethod $conn "Disconnect" ([object[]]@()) ([type[]]@())) } catch { }
    }

    $report["assignees"] = Convert-ToObjectArray $report["assignees"]
    $report["keyword_matching_rows"] = Convert-ToObjectArray $report["keyword_matching_rows"]

    $finalizeErrors = New-Object System.Collections.ArrayList

    try {
        Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 24)
    } catch {
        [void]$finalizeErrors.Add("json: " + $_.Exception.Message)
        try {
            Write-Utf8NoBomFile $OutJson '{"classification":"json_write_failed","source":"MorawareSdkAssigneeCatalogProbe.ps1"}'
        } catch { }
    }

    $txt = New-Object System.Collections.Generic.List[string]
    [void]$txt.Add("Moraware SDK - assignee catalog probe")
    [void]$txt.Add("classification: $($report['classification'])")
    if ($report["top_level_error"]) {
        [void]$txt.Add("top_level_error: $($report['top_level_error'])")
    }
    [void]$txt.Add(("total_assignees_returned: {0}" -f $report["total_assignees_returned"]))
    [void]$txt.Add(("rows_serialized: {0}" -f $report["rows_serialized"]))
    $khc = $report["keyword_hit_counts"]
    [void]$txt.Add(("keyword_hit_Titan: {0}" -f $khc["Titan"]))
    [void]$txt.Add(("keyword_hit_Saber: {0}" -f $khc["Saber"]))
    [void]$txt.Add(("keyword_hit_Robot: {0}" -f $khc["Robot"]))
    [void]$txt.Add(("keyword_hit_Saw: {0}" -f $khc["Saw"]))
    [void]$txt.Add(("keyword_hit_Polish: {0}" -f $khc["Polish"]))
    [void]$txt.Add(("keyword_hit_Machine: {0}" -f $khc["Machine"]))
    [void]$txt.Add("GetAssignees overload signatures (all):")
    foreach ($s in $report["get_assignees_signatures"]) {
        [void]$txt.Add("  " + $s)
    }
    [void]$txt.Add("GetAssignees parameterless signature used:")
    [void]$txt.Add("  " + (Format-Scalar $report["get_assignees_paramless_signature_used"]))
    [void]$txt.Add("Matching assignee rows (keyword hits on name):")
    $km = Convert-ToObjectArray $report["keyword_matching_rows"]
    if ($km.Length -eq 0) {
        [void]$txt.Add("  (none)")
    }
    else {
        foreach ($mr in $km) {
            $kid = Format-Scalar $mr["assignee_id"]
            $knm = Format-Scalar $mr["assignee_name"]
            $kws = ""
            if ($null -ne $mr["keywords_hit"]) { $kws = $mr["keywords_hit"] -join "," }
            [void]$txt.Add(("  id={0} name={1} keywords={2}" -f $kid, $knm, $kws))
        }
    }
    [void]$txt.Add("")
    [void]$txt.Add("Full JSON: $OutJson")

    try {
        Write-Utf8NoBomFile $OutTxt ($txt -join "`n")
    } catch {
        [void]$finalizeErrors.Add("txt: " + $_.Exception.Message)
    }

    try {
        $csvLines = New-Object System.Collections.Generic.List[string]
        [void]$csvLines.Add("assignee_id,assignee_name,active_or_enabled,status_like,description_length,keywords_hit_in_name")
        $rowsForCsv = Convert-ToObjectArray $report["assignees"]
        foreach ($rw in $rowsForCsv) {
            if ($null -eq $rw) { continue }
            $cnm = [string]$rw["assignee_name"]
            $hitParts = New-Object System.Collections.ArrayList
            foreach ($kw in $keywords) {
                if (Test-SubstringHit $cnm $kw) { [void]$hitParts.Add($kw) }
            }
            $hitStr = ""
            if ($hitParts.Count -gt 0) { $hitStr = $hitParts -join "|" }
            $line = @(
                (Escape-CsvField $rw["assignee_id"])
                (Escape-CsvField $rw["assignee_name"])
                (Escape-CsvField $rw["active_or_enabled"])
                (Escape-CsvField $rw["status_like"])
                (Escape-CsvField $rw["description_length"])
                (Escape-CsvField $hitStr)
            ) -join ","
            [void]$csvLines.Add($line)
        }
        Write-Utf8NoBomFile $OutCsv ($csvLines -join "`n")
    } catch {
        [void]$finalizeErrors.Add("csv: " + $_.Exception.Message)
        try {
            $hdrCsv = "assignee_id,assignee_name,error"
            $lnCsv = (Escape-CsvField "csv_write_failed") + "," + (Escape-CsvField $_.Exception.Message)
            Write-Utf8NoBomFile $OutCsv ($hdrCsv + "`n" + $lnCsv + "`n")
        } catch { }
    }

    if ($finalizeErrors.Count -gt 0) {
        $report["finalization_errors"] = @($finalizeErrors.ToArray())
        if ($report["classification"] -eq "ok") {
            $report["classification"] = "report_finalize_partial"
        }
        if (-not $report["top_level_error"]) {
            $report["top_level_error"] = [string]$finalizeErrors[0]
        }
        try {
            Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 24)
        } catch { }
    }

    try {
        Write-Host "Wrote: $OutJson"
        Write-Host "Wrote: $OutTxt"
        Write-Host "Wrote: $OutCsv"
    } catch { }
}

exit 0
