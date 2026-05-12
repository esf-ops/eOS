#Requires -Version 5.1
<#
.SYNOPSIS
  Windows-only Moraware SDK read-only probe: activity-to-assignee/resource link discovery.

  Env: MORAWARE_URL or MORAWARE_API_URL; MORAWARE_USERNAME; MORAWARE_PASSWORD (never logged).
  Optional: MORAWARE_SDK_PROBE_JOB_ID (default 38837), MORAWARE_SDK_PROBE_ACTIVITY_IDS (comma-separated int).
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

function Read-IntEnv([string]$Name, [int]$Default) {
    $raw = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
    $v = 0
    if ([int]::TryParse($raw.Trim(), [ref]$v)) { return $v }
    return $Default
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

function Test-BlockedPreviewName {
    param([string]$PropName)
    if ([string]::IsNullOrEmpty($PropName)) { return $true }
    $pn = $PropName.ToLowerInvariant()
    foreach ($frag in @("password", "token", "session", "secret", "credential", "cookie", "auth", "note", "xml", "comment", "description")) {
        if ($pn.IndexOf($frag, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
}

function Get-EnumerableCount {
    param($Collection)
    if ($null -eq $Collection) { return 0 }
    if ($Collection -is [System.Collections.ICollection]) {
        try { return [int]$Collection.Count } catch { }
    }
    $n = 0
    if ($Collection -is [System.Collections.IEnumerable] -and -not ($Collection -is [string])) {
        foreach ($_ in $Collection) {
            $n++
            if ($n -gt 500000) { break }
        }
    }
    return $n
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

function Get-ConnectionMethodSignaturesMatchingName {
    param([type]$ConnType, [string]$Pattern)
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    $rx = [regex]::new($Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $sigs = New-Object System.Collections.Generic.List[string]
    $seen = @{}
    foreach ($m in $ConnType.GetMethods($flags)) {
        if (-not $m.IsPublic) { continue }
        if ($m.IsSpecialName) { continue }
        if ($m.IsGenericMethod) { continue }
        if (-not $rx.IsMatch($m.Name)) { continue }
        $ps = $m.GetParameters()
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($p in $ps) {
            [void]$parts.Add($p.ParameterType.FullName + " " + $p.Name)
        }
        $retName = ""
        if ($m.ReturnType) { $retName = $m.ReturnType.FullName }
        $line = $m.Name + "(" + ($parts -join ", ") + ") -> " + $retName
        if (-not $seen.ContainsKey($line)) {
            $seen[$line] = $true
            [void]$sigs.Add($line)
        }
    }
    return @($sigs | Sort-Object)
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

function Get-ActivityIdFromObject {
    param($Activity)
    if ($null -eq $Activity) { return 0 }
    $raw = Get-PropValue $Activity @("JobActivityId", "ActivityId", "Id", "JobActivityID")
    if ($null -eq $raw) { return 0 }
    try { return [int32][Convert]::ChangeType($raw, [int32]) } catch { return 0 }
}

function Get-ActivityPickerLabel {
    param($Activity)
    if ($null -eq $Activity) { return "" }
    $parts = New-Object System.Collections.ArrayList
    foreach ($n in @("ActivityTypeName", "ActivityType", "TypeName", "Type", "Name", "Title", "DisplayName")) {
        $v = Get-PropValue $Activity @($n)
        if ($null -eq $v) { continue }
        $s = Format-Scalar $v
        if (-not [string]::IsNullOrWhiteSpace($s)) { [void]$parts.Add($s) }
    }
    if ($parts.Count -eq 0) { return "" }
    return [string]::Join(" | ", @($parts.ToArray()))
}

function Test-LabelBucket {
    param([string]$Label, [string]$Bucket)
    if ([string]::IsNullOrEmpty($Label)) { return $false }
    $l = $Label.ToLowerInvariant()
    switch ($Bucket) {
        "titan_program" { return $l.IndexOf("titan program", [StringComparison]::OrdinalIgnoreCase) -ge 0 }
        "saw_program" { return $l.IndexOf("saw program", [StringComparison]::OrdinalIgnoreCase) -ge 0 }
        "polish" {
            return ($l.IndexOf("polish", [StringComparison]::OrdinalIgnoreCase) -ge 0) -or ($l.IndexOf("polisher", [StringComparison]::OrdinalIgnoreCase) -ge 0)
        }
        "saw" { return $l.IndexOf("saw", [StringComparison]::OrdinalIgnoreCase) -ge 0 }
    }
    return $false
}

function Select-AutoActivityIds {
    param($ActivitiesArray, [int]$MaxPerBucket, [int]$MaxTotal)
    $arr = Convert-ToObjectArray $ActivitiesArray
    $picked = New-Object System.Collections.Generic.List[int]
    $have = @{}
    $buckets = @("titan_program", "saw_program", "polish", "saw")
    foreach ($bucket in $buckets) {
        $nB = 0
        foreach ($act in $arr) {
            if ($picked.Count -ge $MaxTotal) { break }
            $aid = Get-ActivityIdFromObject $act
            if ($aid -le 0) { continue }
            if ($have.ContainsKey($aid)) { continue }
            $lab = Get-ActivityPickerLabel $act
            if (-not (Test-LabelBucket $lab $bucket)) { continue }
            if ($bucket -eq "saw" -and (Test-LabelBucket $lab "saw_program")) { continue }
            [void]$picked.Add($aid)
            $have[$aid] = $true
            $nB++
            if ($nB -ge $MaxPerBucket) { break }
        }
    }
    if ($picked.Count -eq 0) {
        foreach ($act in $arr) {
            if ($picked.Count -ge 8) { break }
            $aid = Get-ActivityIdFromObject $act
            if ($aid -le 0) { continue }
            if ($have.ContainsKey($aid)) { continue }
            [void]$picked.Add($aid)
            $have[$aid] = $true
        }
        return @{
            ids          = $picked.ToArray()
            pick_strategy = "fallback_first_activities"
        }
    }
    return @{
        ids           = $picked.ToArray()
        pick_strategy = "saw_polish_titan_program_saw_program_buckets"
    }
}

function Read-OptionalActivityIdsFromEnv {
    $raw = [Environment]::GetEnvironmentVariable("MORAWARE_SDK_PROBE_ACTIVITY_IDS")
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    $list = New-Object System.Collections.Generic.List[int]
    foreach ($part in $raw.Split(@(','), [StringSplitOptions]::RemoveEmptyEntries)) {
        $t = $part.Trim()
        if ([string]::IsNullOrWhiteSpace($t)) { continue }
        $iv = 0
        if ([int32]::TryParse($t, [ref]$iv)) { [void]$list.Add($iv) }
    }
    if ($list.Count -eq 0) { return $null }
    return ,$list.ToArray()
}

function New-AssigneeRowSafe {
    param($Obj)
    if ($null -eq $Obj) { return $null }
    return [ordered]@{
        assignee_id   = (Format-Scalar (Get-PropValue $Obj @("AssigneeId", "AssigneeID", "Id", "ResourceId", "EmployeeId", "UserId")))
        assignee_name = (Format-Scalar (Get-PropValue $Obj @("Name", "AssigneeName", "DisplayName", "FullName", "Title")))
        active_like   = (Format-Scalar (Get-PropValue $Obj @("IsActive", "Active", "IsEnabled", "Enabled")))
        status_like   = (Format-Scalar (Get-PropValue $Obj @("Status", "StatusName", "AssigneeStatus", "State")))
    }
}

function Get-AssigneesCollectionInspection {
    param($Activity, [int]$MaxItems)
    $out = [ordered]@{
        assignees_property_name = $null
        assignees_count         = 0
        first_item_type         = $null
        rows                    = New-Object System.Collections.Generic.List[object]
        assignees_populated     = $false
    }
    if ($null -eq $Activity) { return $out }
    foreach ($pn in @("Assignees", "AssigneeList", "AssignedUsers", "Resources", "JobActivityAssignees")) {
        $p = $Activity.GetType().GetProperty($pn, [System.Reflection.BindingFlags]"Public,Instance")
        if (-not $p -or -not $p.CanRead) { continue }
        try {
            $col = $p.GetValue($Activity, $null)
        } catch {
            continue
        }
        $out["assignees_property_name"] = $pn
        $cnt = Get-EnumerableCount $col
        $out["assignees_count"] = $cnt
        if ($cnt -gt 0) { $out["assignees_populated"] = $true }
        if ($null -eq $col) { return $out }
        $fi = 0
        foreach ($item in $col) {
            if ($fi -ge $MaxItems) { break }
            if ($null -eq $item) { $fi++; continue }
            if ($null -eq $out["first_item_type"]) {
                $out["first_item_type"] = $item.GetType().FullName
            }
            $row = New-AssigneeRowSafe $item
            if ($null -ne $row) { [void]$out["rows"].Add($row) }
            $fi++
        }
        return $out
    }
    return $out
}

function New-ActivityLightSnapshot {
    param($Activity)
    if ($null -eq $Activity) { return $null }
    $asg = Get-AssigneesCollectionInspection $Activity 3
    return [ordered]@{
        activity_id              = (Format-Scalar (Get-ActivityIdFromObject $Activity))
        activity_label           = (Get-ActivityPickerLabel $Activity)
        assignees_count          = $asg["assignees_count"]
        assignees_property_used  = $asg["assignees_property_name"]
        assignees_first_item_type = $asg["first_item_type"]
        scheduled_time           = (Format-Scalar (Get-PropValue $Activity @("ScheduledTime", "ScheduledStart", "ScheduleTime", "ScheduledDateTime")))
        scheduled_duration       = (Format-Scalar (Get-PropValue $Activity @("ScheduledDuration", "Duration", "DurationMinutes")))
    }
}

function New-SanitizedActivityPropertyDigest {
    param($Activity, [int]$MaxProps, [int]$MaxAssigneeRows)
    if ($null -eq $Activity) { return $null }
    $props = New-Object System.Collections.Generic.List[object]
    $searchBlob = New-Object System.Collections.ArrayList
    foreach ($p in $Activity.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if ($props.Count -ge $MaxProps) { break }
        if (-not $p.CanRead) { continue }
        $entry = [ordered]@{ name = $p.Name; type = $p.PropertyType.FullName }
        if ($p.Name -eq "Assignees" -or $p.Name -eq "AssigneeList" -or $p.Name -eq "AssignedUsers" -or $p.Name -eq "Resources" -or $p.Name -eq "JobActivityAssignees") {
            $deep = Get-AssigneesCollectionInspection $Activity $MaxAssigneeRows
            $entry.value_kind = "assignees_collection"
            $entry.assignees_count = $deep["assignees_count"]
            $entry.first_item_type = $deep["first_item_type"]
            $entry.assignee_rows_sample = @($deep["rows"].ToArray())
            [void]$props.Add($entry)
            continue
        }
        if (Test-BlockedPreviewName $p.Name) {
            $entry.value_kind = "blocked_meta_only"
            [void]$props.Add($entry)
            continue
        }
        try {
            $val = $p.GetValue($Activity, $null)
            $pt = $p.PropertyType
            if ($val -eq $null) {
                $entry.value_kind = "null"
            }
            elseif ($val -is [string]) {
                $entry.value_kind = "string"
                $entry.length = $val.Length
                if ($val.Length -le 120) { $entry.preview = $val }
                [void]$searchBlob.Add($val)
            }
            elseif ($val -is [ValueType] -or $val -is [DateTime]) {
                $entry.value_kind = "scalar"
                $s = Format-Scalar $val
                $entry.preview = $s
                if ($s.Length -gt 120) { $entry.preview = $s.Substring(0, 120) }
                [void]$searchBlob.Add($s)
            }
            elseif ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) {
                $c = Get-EnumerableCount $val
                $entry.value_kind = "collection"
                $entry.count = $c
                $firstType = $null
                $ix = 0
                foreach ($it in $val) {
                    if ($null -ne $it) { $firstType = $it.GetType().FullName }
                    $ix++
                    if ($ix -ge 1) { break }
                }
                $entry.first_item_type = $firstType
            }
            else {
                $entry.value_kind = "object_ref"
                $entry.object_type = $val.GetType().FullName
            }
        } catch {
            $entry.value_kind = "read_error"
        }
        [void]$props.Add($entry)
    }
    $asgFull = Get-AssigneesCollectionInspection $Activity $MaxAssigneeRows
    return [ordered]@{
        activity_id            = (Format-Scalar (Get-ActivityIdFromObject $Activity))
        activity_label         = (Get-ActivityPickerLabel $Activity)
        scheduled_time         = (Format-Scalar (Get-PropValue $Activity @("ScheduledTime", "ScheduledStart", "ScheduleTime", "ScheduledDateTime")))
        scheduled_duration     = (Format-Scalar (Get-PropValue $Activity @("ScheduledDuration", "ScheduledDurationMinutes", "Duration", "DurationMinutes")))
        assignees_inspection   = [ordered]@{
            assignees_property_name = $asgFull["assignees_property_name"]
            assignees_count         = $asgFull["assignees_count"]
            first_item_type         = $asgFull["first_item_type"]
            assignees_populated     = $asgFull["assignees_populated"]
            rows                    = @($asgFull["rows"].ToArray())
        }
        public_properties_sample = @($props.ToArray())
        search_blob_joined       = ([string]::Join(" ", @($searchBlob.ToArray())))
    }
}

function Test-HitKnownResourceTokens {
    param([string]$Text, [int[]]$KnownIds, [string[]]$NameNeedles)
    $hits = New-Object System.Collections.Generic.List[string]
    if ([string]::IsNullOrEmpty($Text)) { return @($hits.ToArray()) }
    foreach ($nid in $KnownIds) {
        if ($nid -le 0) { continue }
        $s = [string]$nid
        if ($Text.IndexOf($s, [StringComparison]::Ordinal) -ge 0) {
            [void]$hits.Add("id:" + $s)
        }
    }
    foreach ($nd in $NameNeedles) {
        if ([string]::IsNullOrWhiteSpace($nd)) { continue }
        if ($Text.IndexOf($nd, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            [void]$hits.Add("name:" + $nd)
        }
    }
    return @($hits.ToArray())
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
$OutJson = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-activity-assignee-links.json"
$OutTxt  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-activity-assignee-links.txt"
$OutCsv  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-activity-assignee-links.csv"

$url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_URL")).Trim()
if (-not $url) { $url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_API_URL")).Trim() }
$user = [string]([Environment]::GetEnvironmentVariable("MORAWARE_USERNAME")).Trim()
$pass = [string]([Environment]::GetEnvironmentVariable("MORAWARE_PASSWORD")).Trim()

$apiHost = $null
try { if ($url) { $apiHost = ([Uri]$url).Host } } catch { $apiHost = $null }

$jobId = Read-IntEnv "MORAWARE_SDK_PROBE_JOB_ID" 38837
$explicitActIds = Read-OptionalActivityIdsFromEnv

$nameNeedles = @("Titan", "Saber", "Robot", "Polish", "Polisher")
$staticHintIds = @(25, 26, 40, 29, 30, 41, 42, 27, 28)

$report = [ordered]@{
    generated_at         = [DateTime]::UtcNow.ToString("o")
    source               = "MorawareSdkActivityAssigneeLinkProbe.ps1"
    classification       = $null
    top_level_error      = $null
    top_level_error_type = $null
    credentials          = @{
        api_url_configured  = (-not [string]::IsNullOrWhiteSpace($url))
        api_host            = $apiHost
        username_configured = (-not [string]::IsNullOrWhiteSpace($user))
        password_configured = (-not [string]::IsNullOrWhiteSpace($pass))
    }
    inputs = @{
        job_id                 = $jobId
        activity_ids_explicit  = @()
        activity_pick_strategy = $null
    }
    method_signatures = @{
        GetJobActivity                    = @()
        GetJobActivities                = @()
        GetJobActivitySeries            = @()
        GetAssignees                    = @()
        GetJobActivityMaterialForJobActivity = @()
    }
    connection_methods_name_match = @()
    known_resource_hints            = @{
        assignee_ids_from_catalog = @()
        static_id_hints           = $staticHintIds
        name_needles              = $nameNeedles
    }
    activities_tested = (New-Object System.Collections.Generic.List[object])
    aggregate = @{
        activities_tested_n          = 0
        get_job_activity_ok_n        = 0
        get_job_activity_fail_n      = 0
        assignees_populated_any      = $false
        known_resource_hit_any       = $false
        series_calls_attempted       = 0
        series_calls_ok              = 0
        material_per_activity_ok_any = $false
    }
    candidate_assignment_fields = (New-Object System.Collections.Generic.List[string])
    recommended_next_step         = ""
}

$connected = $false
$conn = $null
$connType = $null

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

    $appName = "eOS Moraware Activity Assignee Link Probe"
    $conn = $ctor.Invoke(@($url, $user, $pass, $tracer, [bool]$false, [bool]$false, $appName))

    $report["method_signatures"]["GetJobActivity"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobActivity")
    $report["method_signatures"]["GetJobActivities"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobActivities")
    $report["method_signatures"]["GetJobActivitySeries"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobActivitySeries")
    $report["method_signatures"]["GetAssignees"] = @(Get-ConnMethodOverloadSignatures $connType "GetAssignees")
    $report["method_signatures"]["GetJobActivityMaterialForJobActivity"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobActivityMaterialForJobActivity")

    $pat = "Assignee|Assignment|Resource|Calendar|Schedule"
    $report["connection_methods_name_match"] = @(Get-ConnectionMethodSignaturesMatchingName $connType $pat)

    [void](Invoke-ConnMethod $conn "Connect" ([object[]]@()) ([type[]]@()))
    $connected = $true

    $catalogIds = New-Object System.Collections.Generic.List[int]
    try {
        $allAssignees = Invoke-ConnMethod $conn "GetAssignees" ([object[]]@()) ([type[]]@())
        $arrA = Convert-ToObjectArray $allAssignees
        foreach ($ag in $arrA) {
            if ($null -eq $ag) { continue }
            $nm = Format-Scalar (Get-PropValue $ag @("Name", "AssigneeName", "DisplayName", "FullName", "Title"))
            $hitN = $false
            foreach ($nd in $nameNeedles) {
                if (-not [string]::IsNullOrWhiteSpace($nm) -and $nm.IndexOf($nd, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                    $hitN = $true
                    break
                }
            }
            if (-not $hitN) { continue }
            $rawId = Get-PropValue $ag @("AssigneeId", "AssigneeID", "Id", "ResourceId", "EmployeeId", "UserId")
            $iv = 0
            if ($null -ne $rawId -and [int32]::TryParse([string]$rawId, [ref]$iv)) {
                if ($iv -gt 0) { [void]$catalogIds.Add($iv) }
            }
        }
    } catch {
        $report["get_assignees_warning"] = $_.Exception.Message
    }
    $report["known_resource_hints"]["assignee_ids_from_catalog"] = @($catalogIds.ToArray())
    $knownIdUnion = New-Object System.Collections.Generic.List[int]
    foreach ($x in $staticHintIds) { [void]$knownIdUnion.Add($x) }
    foreach ($x in $catalogIds) { if (-not $knownIdUnion.Contains($x)) { [void]$knownIdUnion.Add($x) } }
    $knownIdArr = $knownIdUnion.ToArray()

    $actsRaw = Invoke-ConnMethod $conn "GetJobActivities" ([object[]]@([int32]$jobId, [bool]$true, [bool]$true)) ([type[]]@([int32], [bool], [bool]))
    $actsAll = Convert-ToObjectArray $actsRaw

    $byId = @{}
    foreach ($a in $actsAll) {
        $idk = Get-ActivityIdFromObject $a
        if ($idk -gt 0) { $byId[[string]$idk] = $a }
    }

    $targetIds = @()
    $pickStrategy = "explicit_env"
    if ($null -ne $explicitActIds -and $explicitActIds.Length -gt 0) {
        $targetIds = $explicitActIds
        $report["inputs"]["activity_ids_explicit"] = @($explicitActIds)
    }
    else {
        $pick = Select-AutoActivityIds $actsAll 2 12
        $targetIds = $pick["ids"]
        $pickStrategy = [string]$pick["pick_strategy"]
    }
    $report["inputs"]["activity_pick_strategy"] = $pickStrategy

    if ($null -eq $targetIds -or $targetIds.Length -eq 0) {
        $report["classification"] = "no_activities_selected"
        $report["top_level_error"] = "No activities to probe after GetJobActivities and selection rules."
        throw "no_activities_selected"
    }

    foreach ($aid in $targetIds) {
        $report["aggregate"]["activities_tested_n"] = [int]$report["aggregate"]["activities_tested_n"] + 1
        $one = [ordered]@{
            activity_id                = ([string][int32]$aid)
            bulk_snapshot              = $null
            get_job_activity           = [ordered]@{ ok = $false; error = $null; digest = $null }
            comparison                 = $null
            series_probe               = [ordered]@{ attempted = $false; series_id = $null; ok = $false; error = $null; signature_used = $null }
            material_per_activity      = [ordered]@{ attempted = $false; ok = $false; error = $null; row_count = 0 }
            known_resource_hits_detail = @()
            known_resource_hits_bulk     = @()
        }

        $bulkObj = $null
        if ($byId.ContainsKey([string][int32]$aid)) {
            $bulkObj = $byId[[string][int32]$aid]
        }
        if ($null -ne $bulkObj) {
            $one["bulk_snapshot"] = New-ActivityLightSnapshot $bulkObj
        }

        try {
            $detail = Invoke-ConnMethod $conn "GetJobActivity" ([object[]]@([int32]$aid, [bool]$true, [bool]$true)) ([type[]]@([int32], [bool], [bool]))
            $one["get_job_activity"]["ok"] = $true
            $report["aggregate"]["get_job_activity_ok_n"] = [int]$report["aggregate"]["get_job_activity_ok_n"] + 1
            $dig = New-SanitizedActivityPropertyDigest $detail 60 25
            $one["get_job_activity"]["digest"] = $dig
            $blobD = [string]$dig["search_blob_joined"]
            foreach ($pr in $dig["public_properties_sample"]) {
                if ($null -eq $pr) { continue }
                $pn = [string]$pr["name"]
                if ($pn -match "Assignee|Assignment|Resource|Calendar|Schedule|Employee|Machine|WorkCenter|Station") {
                    $line = $pn + ":" + [string]$pr["type"]
                    if (-not $report["candidate_assignment_fields"].Contains($line)) {
                        [void]$report["candidate_assignment_fields"].Add($line)
                    }
                }
            }
            $asgRows = $dig["assignees_inspection"]["rows"]
            foreach ($r in $asgRows) {
                if ($null -eq $r) { continue }
                $blobD = $blobD + " " + [string]$r["assignee_id"] + " " + [string]$r["assignee_name"]
            }
            $hitsD2 = Test-HitKnownResourceTokens $blobD $knownIdArr $nameNeedles
            $one["known_resource_hits_detail"] = @($hitsD2)
            if ($dig["assignees_inspection"]["assignees_populated"]) {
                $report["aggregate"]["assignees_populated_any"] = $true
            }
            if ($hitsD2.Length -gt 0) {
                $report["aggregate"]["known_resource_hit_any"] = $true
            }

            $sidRaw = Get-PropValue $detail @("JobActivitySeriesId", "ActivitySeriesId", "SeriesId", "JobActivitySeriesID", "JobActivitySeriesId")
            $sid = 0
            if ($null -ne $sidRaw) {
                try { $sid = [int32][Convert]::ChangeType($sidRaw, [int32]) } catch { $sid = 0 }
            }
            if ($sid -gt 0) {
                $one["series_probe"]["attempted"] = $true
                $one["series_probe"]["series_id"] = $sid
                $report["aggregate"]["series_calls_attempted"] = [int]$report["aggregate"]["series_calls_attempted"] + 1
                try {
                    $seriesObj = $null
                    try {
                        $seriesObj = Invoke-ConnMethod $conn "GetJobActivitySeries" ([object[]]@([int32]$sid)) ([type[]]@([int32]))
                        $one["series_probe"]["signature_used"] = "GetJobActivitySeries(int32)"
                    } catch {
                        $seriesObj = Invoke-ConnMethod $conn "GetJobActivitySeries" ([object[]]@([int64]$sid)) ([type[]]@([int64]))
                        $one["series_probe"]["signature_used"] = "GetJobActivitySeries(int64)"
                    }
                    $one["series_probe"]["ok"] = $true
                    $report["aggregate"]["series_calls_ok"] = [int]$report["aggregate"]["series_calls_ok"] + 1
                    if ($null -ne $seriesObj) {
                        $one["series_probe"]["type"] = $seriesObj.GetType().FullName
                    }
                } catch {
                    $em = $_.Exception.Message
                    if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
                    $one["series_probe"]["error"] = $em
                }
            }

            $one["material_per_activity"]["attempted"] = $true
            try {
                $mat = Invoke-ConnMethod $conn "GetJobActivityMaterialForJobActivity" ([object[]]@([int32]$aid)) ([type[]]@([int32]))
                $mc = Get-EnumerableCount $mat
                $one["material_per_activity"]["row_count"] = $mc
                $one["material_per_activity"]["ok"] = $true
                if ($mc -ge 0) { $report["aggregate"]["material_per_activity_ok_any"] = $true }
            } catch {
                $em2 = $_.Exception.Message
                if ($_.Exception.InnerException) { $em2 = $_.Exception.InnerException.Message }
                $one["material_per_activity"]["error"] = $em2
            }
        }
        catch {
            $em = $_.Exception.Message
            if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
            $one["get_job_activity"]["error"] = $em
            $report["aggregate"]["get_job_activity_fail_n"] = [int]$report["aggregate"]["get_job_activity_fail_n"] + 1
        }

        if ($null -ne $one["bulk_snapshot"] -and $null -ne $one["get_job_activity"]["digest"]) {
            $b = $one["bulk_snapshot"]
            $d = $one["get_job_activity"]["digest"]["assignees_inspection"]
            $cmp = [ordered]@{
                assignees_count_bulk_vs_detail = ([string]$b["assignees_count"] + " vs " + [string]$d["assignees_count"])
                scheduled_time_bulk            = $b["scheduled_time"]
                scheduled_time_detail          = $one["get_job_activity"]["digest"]["scheduled_time"]
                scheduled_time_equal           = ($b["scheduled_time"] -eq $one["get_job_activity"]["digest"]["scheduled_time"])
                scheduled_duration_bulk        = $b["scheduled_duration"]
                scheduled_duration_detail      = $one["get_job_activity"]["digest"]["scheduled_duration"]
                scheduled_duration_equal       = ($b["scheduled_duration"] -eq $one["get_job_activity"]["digest"]["scheduled_duration"])
            }
            $one["comparison"] = $cmp
        }

        if ($null -ne $bulkObj) {
            $bs = New-ActivityLightSnapshot $bulkObj
            $blobB = (Get-ActivityPickerLabel $bulkObj) + " " + $bs["scheduled_time"] + " " + $bs["scheduled_duration"]
            $one["known_resource_hits_bulk"] = @(Test-HitKnownResourceTokens $blobB $knownIdArr $nameNeedles)
        }

        [void]$report["activities_tested"].Add($one)
    }

    if (-not $report["classification"]) {
        $report["classification"] = "ok"
    }

    if ($report["aggregate"]["assignees_populated_any"] -and $report["aggregate"]["known_resource_hit_any"]) {
        $report["recommended_next_step"] = "Assignees populated with catalog/name hits: correlate activity_id to assignee_id in integration; confirm schedule APIs if calendar linkage needed."
    }
    elseif ($report["aggregate"]["assignees_populated_any"]) {
        $report["recommended_next_step"] = "Assignees populated but no Titan/Saber/Robot/Polish name hits in scalar blob: inspect nested objects or additional Get* overloads (series/material already probed)."
    }
    elseif ($report["aggregate"]["known_resource_hit_any"]) {
        $report["recommended_next_step"] = "Hits found in text fields without Assignees collection population: map fields exposing resource ids; avoid relying on Assignees alone."
    }
    else {
        $report["recommended_next_step"] = "No assignee rows and no string hits: probe JobActivitySeries payload fields, material rows, or assignment-related Connection methods listed in connection_methods_name_match."
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
    if ([string]::IsNullOrWhiteSpace([string]$report["recommended_next_step"])) {
        $report["recommended_next_step"] = "Fix top_level_error then rerun; verify job_id and activity IDs exist for this tenant."
    }
}
finally {
    if ($connected -and $null -ne $conn) {
        try { [void](Invoke-ConnMethod $conn "Disconnect" ([object[]]@()) ([type[]]@())) } catch { }
    }

    $report["activities_tested"] = Convert-ToObjectArray $report["activities_tested"]
    $report["candidate_assignment_fields"] = @($(Convert-ToObjectArray $report["candidate_assignment_fields"]) | Sort-Object -Unique)

    $finalizeErrors = New-Object System.Collections.ArrayList

    try {
        Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 28)
    } catch {
        [void]$finalizeErrors.Add("json: " + $_.Exception.Message)
        try {
            Write-Utf8NoBomFile $OutJson '{"classification":"json_write_failed","source":"MorawareSdkActivityAssigneeLinkProbe.ps1"}'
        } catch { }
    }

    $txt = New-Object System.Collections.Generic.List[string]
    [void]$txt.Add("Moraware SDK - activity assignee link probe")
    [void]$txt.Add("classification: $($report['classification'])")
    if ($report["top_level_error"]) {
        [void]$txt.Add("top_level_error: $($report['top_level_error'])")
    }
    [void]$txt.Add(("job_id: {0}" -f $report["inputs"]["job_id"]))
    [void]$txt.Add(("activities_tested: {0}" -f $report["aggregate"]["activities_tested_n"]))
    [void]$txt.Add(("get_job_activity_ok: {0}" -f $report["aggregate"]["get_job_activity_ok_n"]))
    [void]$txt.Add(("get_job_activity_fail: {0}" -f $report["aggregate"]["get_job_activity_fail_n"]))
    [void]$txt.Add(("assignees_populated_any: {0}" -f $report["aggregate"]["assignees_populated_any"]))
    [void]$txt.Add(("known_resource_hit_any: {0}" -f $report["aggregate"]["known_resource_hit_any"]))
    [void]$txt.Add("activity_pick_strategy: " + (Format-Scalar $report["inputs"]["activity_pick_strategy"]))
    $stBulk = ""
    $stDet = ""
    $sdBulk = ""
    $sdDet = ""
    $actsArr = Convert-ToObjectArray $report["activities_tested"]
    foreach ($x in $actsArr) {
        if ($null -eq $x) { continue }
        if ($null -ne $x["bulk_snapshot"]) {
            $stBulk = [string]$x["bulk_snapshot"]["scheduled_time"]
            $sdBulk = [string]$x["bulk_snapshot"]["scheduled_duration"]
        }
        if ($null -ne $x["get_job_activity"] -and $null -ne $x["get_job_activity"]["digest"]) {
            $stDet = [string]$x["get_job_activity"]["digest"]["scheduled_time"]
            $sdDet = [string]$x["get_job_activity"]["digest"]["scheduled_duration"]
        }
        if (-not [string]::IsNullOrWhiteSpace($stDet)) { break }
    }
    [void]$txt.Add(("sample_scheduled_time_bulk: {0}" -f $stBulk))
    [void]$txt.Add(("sample_scheduled_time_detail: {0}" -f $stDet))
    [void]$txt.Add(("sample_scheduled_duration_bulk: {0}" -f $sdBulk))
    [void]$txt.Add(("sample_scheduled_duration_detail: {0}" -f $sdDet))
    [void]$txt.Add("Per-activity scheduled fields (up to 10):")
    $ti = 0
    foreach ($x in $actsArr) {
        if ($ti -ge 10) { break }
        if ($null -eq $x) { continue }
        $idb = ""
        $stdb = ""
        $sddb = ""
        $stdd = ""
        $sddd = ""
        if ($null -ne $x["bulk_snapshot"]) {
            $idb = [string]$x["activity_id"]
            $stdb = [string]$x["bulk_snapshot"]["scheduled_time"]
            $sddb = [string]$x["bulk_snapshot"]["scheduled_duration"]
        }
        if ($null -ne $x["get_job_activity"]["digest"]) {
            $stdd = [string]$x["get_job_activity"]["digest"]["scheduled_time"]
            $sddd = [string]$x["get_job_activity"]["digest"]["scheduled_duration"]
        }
        [void]$txt.Add(("  activity_id={0} bulk_sched={1} bulk_dur={2} detail_sched={3} detail_dur={4}" -f $idb, $stdb, $sddb, $stdd, $sddd))
        $ti++
    }
    [void]$txt.Add("candidate_assignment_fields (name:type):")
    foreach ($cf in $report["candidate_assignment_fields"]) {
        [void]$txt.Add("  " + $cf)
    }
    if (($report["candidate_assignment_fields"] | Measure-Object).Count -eq 0) {
        [void]$txt.Add("  (none)")
    }
    [void]$txt.Add("GetJobActivity overload signatures:")
    foreach ($s in $report["method_signatures"]["GetJobActivity"]) {
        [void]$txt.Add("  " + $s)
    }
    [void]$txt.Add("recommended_next_step:")
    [void]$txt.Add("  " + (Format-Scalar $report["recommended_next_step"]))
    [void]$txt.Add("")
    [void]$txt.Add("Full JSON: $OutJson")

    try {
        Write-Utf8NoBomFile $OutTxt ($txt -join "`n")
    } catch {
        [void]$finalizeErrors.Add("txt: " + $_.Exception.Message)
    }

    try {
        $csvLines = New-Object System.Collections.Generic.List[string]
        [void]$csvLines.Add("activity_id,get_job_activity_ok,assignees_count_bulk,assignees_count_detail,assignees_populated_detail,known_hits_detail,known_hits_bulk,scheduled_time_detail,scheduled_duration_detail,comparison_assignees,gja_error")
        foreach ($row in $actsArr) {
            if ($null -eq $row) { continue }
            $acid = Format-Scalar $row["activity_id"]
            $ok = Format-Scalar $row["get_job_activity"]["ok"]
            $acb = ""
            $acd = ""
            $apop = ""
            $std = ""
            $sdd = ""
            $khD = ""
            $khB = ""
            $cmpA = ""
            if ($null -ne $row["bulk_snapshot"]) {
                $acb = Format-Scalar $row["bulk_snapshot"]["assignees_count"]
            }
            if ($null -ne $row["get_job_activity"]["digest"]) {
                $acd = Format-Scalar $row["get_job_activity"]["digest"]["assignees_inspection"]["assignees_count"]
                $apop = Format-Scalar $row["get_job_activity"]["digest"]["assignees_inspection"]["assignees_populated"]
                $std = Format-Scalar $row["get_job_activity"]["digest"]["scheduled_time"]
                $sdd = Format-Scalar $row["get_job_activity"]["digest"]["scheduled_duration"]
            }
            if ($null -ne $row["known_resource_hits_detail"]) { $khD = $row["known_resource_hits_detail"] -join "|" }
            if ($null -ne $row["known_resource_hits_bulk"]) { $khB = $row["known_resource_hits_bulk"] -join "|" }
            if ($null -ne $row["comparison"]) { $cmpA = Format-Scalar $row["comparison"]["assignees_count_bulk_vs_detail"] }
            $err = Format-Scalar $row["get_job_activity"]["error"]
            $ln = @(
                (Escape-CsvField $acid)
                (Escape-CsvField $ok)
                (Escape-CsvField $acb)
                (Escape-CsvField $acd)
                (Escape-CsvField $apop)
                (Escape-CsvField $khD)
                (Escape-CsvField $khB)
                (Escape-CsvField $std)
                (Escape-CsvField $sdd)
                (Escape-CsvField $cmpA)
                (Escape-CsvField $err)
            ) -join ","
            [void]$csvLines.Add($ln)
        }
        Write-Utf8NoBomFile $OutCsv ($csvLines -join "`n")
    } catch {
        [void]$finalizeErrors.Add("csv: " + $_.Exception.Message)
        try {
            $hdr = "activity_id,error"
            $ln2 = (Escape-CsvField "csv_failed") + "," + (Escape-CsvField $_.Exception.Message)
            Write-Utf8NoBomFile $OutCsv ($hdr + "`n" + $ln2 + "`n")
        } catch { }
    }

    if ($finalizeErrors.Count -gt 0) {
        $report["finalization_errors"] = @($finalizeErrors.ToArray())
        if ($report["classification"] -eq "ok") {
            $report["classification"] = "report_finalize_partial"
        }
        try {
            Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 28)
        } catch { }
    }

    try {
        Write-Host "Wrote: $OutJson"
        Write-Host "Wrote: $OutTxt"
        Write-Host "Wrote: $OutCsv"
    } catch { }
}

exit 0
