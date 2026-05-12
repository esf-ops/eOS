#Requires -Version 5.1
<#
.SYNOPSIS
  Windows-only Moraware SDK read-only probe: Connection public method surface map and safe-read classification.

  Env: MORAWARE_URL or MORAWARE_API_URL; MORAWARE_USERNAME; MORAWARE_PASSWORD (only if optional calls enabled).
  Optional: MORAWARE_SDK_SURFACE_ALLOW_SAFE_PARAMETERLESS_CALLS=1 (default off) to invoke allowlisted parameterless Get* catalogs after Connect.
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

function Read-BoolEnvOne([string]$Name, [bool]$DefaultFalse) {
    $raw = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $DefaultFalse }
    $t = $raw.Trim()
    $tl = $t.ToLowerInvariant()
    if ($tl -eq "0" -or $tl -eq "false" -or $tl -eq "no" -or $tl -eq "off" -or $tl -eq "n") { return $false }
    if ($tl -eq "1" -or $tl -eq "true" -or $tl -eq "yes" -or $tl -eq "on" -or $tl -eq "y") { return $true }
    $iv = 0
    if ([int32]::TryParse($t, [ref]$iv)) {
        if ($iv -eq 0) { return $false }
        return $true
    }
    return $DefaultFalse
}

function Format-Scalar {
    param($v)
    if ($null -eq $v) { return "" }
    if ($v -is [DateTime]) { return $v.ToString("o", [System.Globalization.CultureInfo]::InvariantCulture) }
    if ($v -is [System.IFormattable]) { return $v.ToString($null, [System.Globalization.CultureInfo]::InvariantCulture) }
    return [string]$v
}

function Convert-ToObjectArray {
    param($Value)
    if ($null -eq $Value) {
        return New-Object object[] 0
    }
    if ($Value -is [string]) {
        return ,$Value
    }
    if ($Value -is [System.Collections.IDictionary]) {
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

function Convert-ToSortedObjectArray {
    param($Items)
    if ($null -eq $Items) {
        return New-Object object[] 0
    }
    return Convert-ToObjectArray ($Items | Sort-Object)
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
    if (-not $m) { throw "method_not_found: " + $MethodName }
    $invokeArgs = New-TypedObjectArray $ArgValues $ArgTypes
    if ($null -eq $invokeArgs) { $invokeArgs = New-Object object[] 0 }
    return $m.Invoke($Connection, $invokeArgs)
}

function Get-MethodSignatureLine {
    param([System.Reflection.MethodInfo]$Method)
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($p in $Method.GetParameters()) {
        [void]$parts.Add($p.ParameterType.FullName + " " + $p.Name)
    }
    $retName = ""
    if ($Method.ReturnType) { $retName = $Method.ReturnType.FullName }
    return $Method.Name + "(" + ($parts -join ", ") + ") -> " + $retName
}

function Test-IsBlockedMutationName {
    param([string]$Name)
    if ([string]::IsNullOrEmpty($Name)) { return $false }
    $rx = [regex]::new("^(Create|Update|Delete|Add|Remove|Convert|Import|Set|Save|Submit|Upload|Download|Attach|Detach|Assign|Unassign|Post|Put|Patch)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    return $rx.IsMatch($Name)
}

function Test-FocusKeywordText {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $false }
    return $Text -match "(?i)(Calendar|Schedule|Scheduled|Assignee|Assignment|Resource|Machine|WorkCenter|Station|Activity|Series|View|Process|Job|Form|File|Account|Contact|Phase|Purchase|Order|Material|Slab|Inventory)"
}

function Test-TypeIsBoolOrIntegral {
    param([type]$T)
    if ($null -eq $T) { return $false }
    if ($T -eq [bool] -or $T -eq [int32] -or $T -eq [int64] -or $T -eq [uint32] -or $T -eq [uint16] -or $T -eq [int16] -or $T -eq [byte] -or $T -eq [sbyte]) { return $true }
    return $false
}

function Test-ParamListLooksInt32TwoBools {
    param([System.Reflection.ParameterInfo[]]$Ps)
    if ($null -eq $Ps -or $Ps.Length -ne 3) { return $false }
    if ($Ps[0].ParameterType -ne [int32]) { return $false }
    if ($Ps[1].ParameterType -ne [bool]) { return $false }
    if ($Ps[2].ParameterType -ne [bool]) { return $false }
    return $true
}

function Test-HasFilterOrPagingParam {
    param([System.Reflection.ParameterInfo[]]$Ps)
    if ($null -eq $Ps) { return $false }
    foreach ($p in $Ps) {
        $fn = $p.ParameterType.FullName
        if ([string]::IsNullOrEmpty($fn)) { continue }
        if ($fn -match "(?i)(Filter|Paging)") { return $true }
    }
    return $false
}

function Test-HasEnumerableIntLikeFirstParam {
    param([System.Reflection.ParameterInfo[]]$Ps)
    if ($null -eq $Ps -or $Ps.Length -eq 0) { return $false }
    $t = $Ps[0].ParameterType
    if ($t.IsArray) {
        $et = $t.GetElementType()
        if ($null -ne $et -and ($et -eq [int32] -or $et -eq [int64])) { return $true }
    }
    if ($t.IsGenericType) {
        $gas = $t.GetGenericArguments()
        if ($gas.Length -eq 1 -and ($gas[0] -eq [int32] -or $gas[0] -eq [int64])) {
            foreach ($ifc in $t.GetInterfaces()) {
                if ($ifc.FullName -match "IEnumerable") { return $true }
            }
        }
    }
    return $false
}

function Test-HasNonBoolEnumParam {
    param([System.Reflection.ParameterInfo[]]$Ps)
    if ($null -eq $Ps) { return $false }
    foreach ($p in $Ps) {
        $pt = $p.ParameterType
        if ($pt -eq [bool]) { continue }
        if ($pt.IsEnum) { return $true }
    }
    return $false
}

function Test-IsLeafReflectionType {
    param([type]$T)
    if ($null -eq $T) { return $true }
    if ($T.IsPrimitive) { return $true }
    if ($T -eq [string] -or $T -eq [void] -or $T -eq [decimal] -or $T -eq [DateTime] -or $T -eq [TimeSpan]) { return $true }
    if ($T.FullName -eq "System.Void") { return $true }
    return $false
}

function Get-TypeSurfaceSummary {
    param([type]$T, [int]$MaxEnumValues, [int]$MaxProps)
    if ((Test-IsLeafReflectionType $T)) {
        return [ordered]@{ type = $T.FullName; kind = "leaf" }
    }
    $row = [ordered]@{
        type                = $T.FullName
        kind                = "complex"
        constructors        = (New-Object System.Collections.ArrayList)
        public_properties   = (New-Object System.Collections.ArrayList)
        settable_properties = (New-Object System.Collections.ArrayList)
        enum_values_sample    = @()
        element_type_hint   = $null
    }
    if ($T.IsEnum) {
        $row["kind"] = "enum"
        $names = [System.Enum]::GetNames($T)
        $n = 0
        $ev = New-Object System.Collections.ArrayList
        foreach ($en in $names) {
            if ($n -ge $MaxEnumValues) { break }
            try {
                $vv = [System.Enum]::Parse($T, $en)
                $iv = [Convert]::ChangeType($vv, [int64])
                [void]$ev.Add([ordered]@{ name = $en; value = [string]$iv })
            } catch {
                [void]$ev.Add([ordered]@{ name = $en; value = "" })
            }
            $n++
        }
        $row["enum_values_sample"] = @($ev.ToArray())
        return $row
    }
    if ($T.IsGenericType) {
        $ga = $T.GetGenericArguments()
        if ($ga.Length -eq 1) {
            $row["element_type_hint"] = $ga[0].FullName
        }
    }
    elseif ($T.IsArray) {
        $et = $T.GetElementType()
        if ($null -ne $et) { $row["element_type_hint"] = $et.FullName }
    }
    foreach ($c in $T.GetConstructors([System.Reflection.BindingFlags]"Public,Instance")) {
        $pp = $c.GetParameters()
        $parts = New-Object System.Collections.ArrayList
        foreach ($q in $pp) {
            [void]$parts.Add($q.ParameterType.Name)
        }
        [void]$row["constructors"].Add("ctor(" + ([string]::Join(",", @($parts.ToArray()))) + ")")
        if ($row["constructors"].Count -ge 6) { break }
    }
    $pi = 0
    foreach ($prop in $T.GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if ($pi -ge $MaxProps) { break }
        $entry = [ordered]@{ name = $prop.Name; type = $prop.PropertyType.FullName; can_write = $prop.CanWrite }
        [void]$row["public_properties"].Add($entry)
        if ($prop.CanWrite) {
            [void]$row["settable_properties"].Add($prop.Name + ":" + $prop.PropertyType.Name)
        }
        $pi++
    }
    return $row
}

function Build-MethodSurfaceRow {
    param([System.Reflection.MethodInfo]$Method, [hashtable]$TypeCache)
    $name = $Method.Name
    $sig = Get-MethodSignatureLine $Method
    $ps = $Method.GetParameters()
    $ret = $Method.ReturnType
    $retName = ""
    if ($ret) { $retName = $ret.FullName }
    $paramParts = New-Object System.Collections.ArrayList
    foreach ($p in $ps) {
        [void]$paramParts.Add([ordered]@{ name = $p.Name; type = $p.ParameterType.FullName })
    }
    $blocked = Test-IsBlockedMutationName $name
    $isGet = $name.StartsWith("Get", [StringComparison]::OrdinalIgnoreCase)
    $focus = (Test-FocusKeywordText $name) -or (Test-FocusKeywordText $retName)
    foreach ($p in $ps) {
        if (Test-FocusKeywordText $p.ParameterType.FullName) { $focus = $true; break }
    }
    $classification = "non_get_unknown"
    $safetyReason = ""
    $priority = "low"
    $why = ""
    $strategy = ""
    if ($blocked) {
        $classification = "blocked_write_or_mutation"
        $safetyReason = "Name matches blocked mutation verb prefix list."
        $priority = "low"
        $why = "Mutation or side-effect risk; do not auto-invoke."
        $strategy = "Skip unless product owner approves explicit write-mode tooling."
    }
    elseif (-not $isGet) {
        $safetyReason = "Not a Get* instance method; treat as unknown behavior."
        $why = "May be utility or non-REST-shaped API."
        $strategy = "Manual review only; do not auto-invoke."
    }
    elseif ($focus) {
        $classification = "schedule_calendar_resource_candidate"
        $safetyReason = "Get-shaped and name/types suggest schedule/resource/activity domain."
        $priority = "high"
        $why = "Likely door for calendar, assignment, machine, or activity graph."
        $strategy = "Prioritize read-only probe with known ids; log Inventory Edition errors separately."
    }
    elseif (Test-HasFilterOrPagingParam $ps) {
        $classification = "safe_get_by_filter_paging"
        $safetyReason = "Read-shaped Get with filter/paging parameter types."
        $priority = "medium"
        $why = "Bulk list access; useful for exports and correlation."
        $strategy = "Probe with known JobFilter/PagingOptions from job identifier probes."
    }
    elseif (Test-HasEnumerableIntLikeFirstParam $ps) {
        $classification = "safe_get_by_ienumerable_ids"
        $safetyReason = "Get with IEnumerable or array of int-like ids."
        $priority = "medium"
        $why = "Batch read by ids; may reduce round-trips."
        $strategy = "Call with small id batches; compare to per-id Get overloads."
    }
    elseif ($null -ne $ps -and $ps.Length -eq 1 -and $ps[0].ParameterType -eq [int32]) {
        $classification = "safe_get_by_single_int_id"
        $safetyReason = "Single int32 key; read-only shape."
        $priority = "medium"
        $why = "Direct entity fetch by id."
        $strategy = "Probe with known job/activity/series ids from prior probes."
    }
    elseif (Test-ParamListLooksInt32TwoBools $ps) {
        $classification = "safe_get_by_int_id_plus_bools"
        $safetyReason = "Matches common GetJobActivity(jobId,bool,bool) pattern."
        $priority = "medium"
        $why = "Detail fetch toggling nested graphs."
        $strategy = "Mirror job detail probe flags for include phases/series members."
    }
    elseif ($null -eq $ps -or $ps.Length -eq 0) {
        $classification = "safe_get_parameterless_catalog"
        $safetyReason = "No parameters; catalog-style read."
        $priority = "low"
        $why = "Global reference data."
        $strategy = "Optional env allowlist can invoke known-safe catalogs."
    }
    elseif (Test-HasNonBoolEnumParam $ps) {
        $classification = "safe_get_requires_enum"
        $safetyReason = "Non-boolean enum parameter requires valid enum value."
        $priority = "low"
        $why = "Needs enum discovery before call."
        $strategy = "Reflect enum values; construct minimal read probe script."
    }
    else {
        $classification = "unknown_get_requires_manual_probe"
        $safetyReason = "Get overload with uncommon parameter shape."
        $priority = "low"
        $why = "Manual signature review required."
        $strategy = "Design one-off read probe with typed args; no auto-invoke."
    }
    if ($name -match "(?i)Material|Inventory" -and $isGet -and -not $blocked) {
        $strategy = $strategy + " Prior probes: Moraware error 1000 may require JobTracker Inventory Edition."
    }
    $related = New-Object System.Collections.ArrayList
    $relSeen = @{}
    if (-not (Test-IsLeafReflectionType $ret)) {
        $rk = $ret.FullName
        if (-not $TypeCache.ContainsKey($rk)) {
            $TypeCache[$rk] = Get-TypeSurfaceSummary $ret 40 25
        }
        if (-not $relSeen.ContainsKey($rk)) {
            $relSeen[$rk] = $true
            [void]$related.Add($TypeCache[$rk])
        }
    }
    foreach ($p in $ps) {
        $pt = $p.ParameterType
        if (Test-IsLeafReflectionType $pt) { continue }
        $pk = $pt.FullName
        if ($TypeCache.ContainsKey($pk)) { continue }
        $TypeCache[$pk] = Get-TypeSurfaceSummary $pt 40 25
    }
    foreach ($p in $ps) {
        $pt = $p.ParameterType
        if (Test-IsLeafReflectionType $pt) { continue }
        $pk = $pt.FullName
        if ($relSeen.ContainsKey($pk)) { continue }
        $relSeen[$pk] = $true
        [void]$related.Add($TypeCache[$pk])
    }
    return [ordered]@{
        method_name               = $name
        signature                 = $sig
        return_type               = $retName
        parameter_count           = $ps.Length
        parameters                = @($paramParts.ToArray())
        classification            = $classification
        safety_reason             = $safetyReason
        candidate_priority        = $priority
        why_interesting           = $why
        suggested_probe_strategy  = $strategy
        focus_keyword_match       = $focus
        related_types             = @($related.ToArray())
    }
}

function Get-EnumerableElementTypeName {
    param($Collection)
    if ($null -eq $Collection) { return $null }
    foreach ($x in $Collection) {
        if ($null -eq $x) { continue }
        return $x.GetType().FullName
    }
    return $null
}

if ($PSVersionTable.PSEdition -eq "Core") {
    Write-Host "ERROR: Use Windows PowerShell 5.1 (powershell.exe)." -ForegroundColor Red
    exit 2
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DllPath = Join-Path $ScriptDir "lib\JobTrackerAPI5.dll"
$OutJson = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-connection-surface-map.json"
$OutTxt  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-connection-surface-map.txt"
$OutCsv  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-connection-surface-map.csv"

$url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_URL")).Trim()
if (-not $url) { $url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_API_URL")).Trim() }
$user = [string]([Environment]::GetEnvironmentVariable("MORAWARE_USERNAME")).Trim()
$pass = [string]([Environment]::GetEnvironmentVariable("MORAWARE_PASSWORD")).Trim()
$apiHost = $null
try { if ($url) { $apiHost = ([Uri]$url).Host } } catch { $apiHost = $null }

$allowCalls = Read-BoolEnvOne "MORAWARE_SDK_SURFACE_ALLOW_SAFE_PARAMETERLESS_CALLS" $false
$paramlessAllow = @("GetProcesses", "GetAssignees", "GetJobActivityTypes", "GetJobActivityStatuses")

$report = [ordered]@{
    generated_at         = [DateTime]::UtcNow.ToString("o")
    source               = "MorawareSdkConnectionSurfaceMapProbe.ps1"
    classification        = $null
    top_level_error       = $null
    top_level_error_type  = $null
    finalization_errors   = $null
    options              = @{
        allow_safe_parameterless_calls = $allowCalls
        parameterless_allowlist        = @($paramlessAllow)
    }
    credentials          = @{
        api_url_configured  = (-not [string]::IsNullOrWhiteSpace($url))
        api_host            = $apiHost
        username_configured = (-not [string]::IsNullOrWhiteSpace($user))
        password_configured = (-not [string]::IsNullOrWhiteSpace($pass))
    }
    aggregates           = @{
        total_public_instance_methods = 0
        total_get_methods             = 0
        total_blocked_mutation        = 0
        schedule_resource_candidate_n = 0
        high_priority_candidates_n    = 0
        safe_parameterless_catalog_n = 0
        safe_single_int_id_n          = 0
        safe_int_plus_bools_n          = 0
        safe_filter_paging_n           = 0
        safe_ienumerable_ids_n         = 0
        safe_requires_enum_n           = 0
        unknown_get_manual_n           = 0
        non_get_unknown_n              = 0
    }
    methods              = (New-Object System.Collections.Generic.List[object])
    related_types_index  = [ordered]@{}
    optional_catalog_calls = @()
    next_probe_recommendations = [ordered]@{
        activity_assignee_resource_machine = (New-Object System.Collections.Generic.List[string])
        safe_catalog_next                  = (New-Object System.Collections.Generic.List[string])
        proven_job_related                 = (New-Object System.Collections.Generic.List[string])
        blocked_inventory_or_mutation_risk = (New-Object System.Collections.Generic.List[string])
    }
}

$connected = $false
$conn = $null

try {
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

    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    $methods = $connType.GetMethods($flags)
    $seenSig = @{}
    $typeCache = @{}
    foreach ($m in $methods) {
        if (-not $m.IsPublic) { continue }
        if ($m.IsSpecialName) { continue }
        if ($m.IsStatic) { continue }
        if ($m.IsGenericMethod) { continue }
        $sigKey = Get-MethodSignatureLine $m
        if ($seenSig.ContainsKey($sigKey)) { continue }
        $seenSig[$sigKey] = $true
        $row = Build-MethodSurfaceRow $m $typeCache
        [void]$report["methods"].Add($row)
        $report["aggregates"]["total_public_instance_methods"] = [int]$report["aggregates"]["total_public_instance_methods"] + 1
        $cl = [string]$row["classification"]
        if ($row["method_name"].StartsWith("Get", [StringComparison]::OrdinalIgnoreCase)) {
            $report["aggregates"]["total_get_methods"] = [int]$report["aggregates"]["total_get_methods"] + 1
        }
        switch ($cl) {
            "blocked_write_or_mutation" { $report["aggregates"]["total_blocked_mutation"] = [int]$report["aggregates"]["total_blocked_mutation"] + 1 }
            "schedule_calendar_resource_candidate" { $report["aggregates"]["schedule_resource_candidate_n"] = [int]$report["aggregates"]["schedule_resource_candidate_n"] + 1 }
            "safe_get_parameterless_catalog" { $report["aggregates"]["safe_parameterless_catalog_n"] = [int]$report["aggregates"]["safe_parameterless_catalog_n"] + 1 }
            "safe_get_by_single_int_id" { $report["aggregates"]["safe_single_int_id_n"] = [int]$report["aggregates"]["safe_single_int_id_n"] + 1 }
            "safe_get_by_int_id_plus_bools" { $report["aggregates"]["safe_int_plus_bools_n"] = [int]$report["aggregates"]["safe_int_plus_bools_n"] + 1 }
            "safe_get_by_filter_paging" { $report["aggregates"]["safe_filter_paging_n"] = [int]$report["aggregates"]["safe_filter_paging_n"] + 1 }
            "safe_get_by_ienumerable_ids" { $report["aggregates"]["safe_ienumerable_ids_n"] = [int]$report["aggregates"]["safe_ienumerable_ids_n"] + 1 }
            "safe_get_requires_enum" { $report["aggregates"]["safe_requires_enum_n"] = [int]$report["aggregates"]["safe_requires_enum_n"] + 1 }
            "unknown_get_requires_manual_probe" { $report["aggregates"]["unknown_get_manual_n"] = [int]$report["aggregates"]["unknown_get_manual_n"] + 1 }
            "non_get_unknown" { $report["aggregates"]["non_get_unknown_n"] = [int]$report["aggregates"]["non_get_unknown_n"] + 1 }
        }
        if ([string]$row["candidate_priority"] -eq "high") {
            $report["aggregates"]["high_priority_candidates_n"] = [int]$report["aggregates"]["high_priority_candidates_n"] + 1
        }
    }
    foreach ($k in $typeCache.Keys) {
        $report["related_types_index"][$k] = $typeCache[$k]
    }

    $methArr = Convert-ToObjectArray $report["methods"]
    $seenProven = @{}
    foreach ($rw in $methArr) {
        $mn = [string]$rw["method_name"]
        if ([string]$rw["classification"] -eq "schedule_calendar_resource_candidate") {
            [void]$report["next_probe_recommendations"]["activity_assignee_resource_machine"].Add($mn + " :: " + $rw["signature"])
        }
        if ($mn.StartsWith("Get", [StringComparison]::OrdinalIgnoreCase) -and [int]$rw["parameter_count"] -eq 0 -and ($paramlessAllow -notcontains $mn)) {
            if ([string]$rw["classification"] -eq "safe_get_parameterless_catalog") {
                [void]$report["next_probe_recommendations"]["safe_catalog_next"].Add($mn + " :: " + $rw["signature"])
            }
        }
        if ($mn -match "(?i)^Get(Job|Jobs|JobActivity|JobActivities|Process|Assignee)") {
            if (-not $seenProven.ContainsKey($mn)) {
                $seenProven[$mn] = $true
                [void]$report["next_probe_recommendations"]["proven_job_related"].Add($mn)
            }
        }
        if (([string]$rw["classification"] -eq "blocked_write_or_mutation") -or ($mn -match "(?i)Material|Inventory")) {
            [void]$report["next_probe_recommendations"]["blocked_inventory_or_mutation_risk"].Add($mn + " :: " + [string]$rw["classification"])
        }
    }

    if ($allowCalls) {
        if (-not $report["credentials"]["api_url_configured"] -or -not $report["credentials"]["username_configured"] -or -not $report["credentials"]["password_configured"]) {
            $report["optional_catalog_calls_note"] = "allow_calls_requested_but_missing_credentials"
        }
        else {
            $tracerType = $asm.GetType("Moraware.JobTrackerAPI5.DevelopmentAssistance.SimpleConsoleCommandTracer", $false, $false)
            if (-not $tracerType) { throw "command_tracer_type_not_found" }
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
            if (-not $ctor) { throw "connection_constructor_not_found" }
            $conn = $ctor.Invoke(@($url, $user, $pass, $tracer, [bool]$false, [bool]$false, "eOS Moraware Connection Surface Map Probe"))
            [void](Invoke-ConnMethod $conn "Connect" ([object[]]@()) ([type[]]@()))
            $connected = $true
            $callResults = New-Object System.Collections.Generic.List[object]
            foreach ($cn in $paramlessAllow) {
                $oneC = [ordered]@{ method = $cn; ok = $false; error = $null; observable_count = 0; first_element_type = $null }
                try {
                    $res = Invoke-ConnMethod $conn $cn ([object[]]@()) ([type[]]@())
                    $oneC["ok"] = $true
                    $cnt = Get-EnumerableCount $res
                    $oneC["observable_count"] = $cnt
                    $oneC["first_element_type"] = Get-EnumerableElementTypeName $res
                } catch {
                    $em = $_.Exception.Message
                    if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
                    $oneC["error"] = $em
                }
                [void]$callResults.Add($oneC)
            }
            $report["optional_catalog_calls"] = Convert-ToObjectArray $callResults
        }
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

    $preFinalizeClassification = $report["classification"]
    $finalizeErrors = New-Object System.Collections.ArrayList

    try {
        $report["methods"] = Convert-ToObjectArray $report["methods"]
        $npr = $report["next_probe_recommendations"]
        $report["next_probe_recommendations"] = [ordered]@{
            activity_assignee_resource_machine   = Convert-ToObjectArray $npr["activity_assignee_resource_machine"]
            safe_catalog_next                    = Convert-ToObjectArray $npr["safe_catalog_next"]
            proven_job_related                   = Convert-ToObjectArray $npr["proven_job_related"]
            blocked_inventory_or_mutation_risk   = Convert-ToObjectArray $npr["blocked_inventory_or_mutation_risk"]
        }
        $report["optional_catalog_calls"] = Convert-ToObjectArray $report["optional_catalog_calls"]

        $methodsArr = $report["methods"]
        $highPri = New-Object System.Collections.Generic.List[string]
        $plCat = New-Object System.Collections.Generic.List[string]
        $idOne = New-Object System.Collections.Generic.List[string]
        $idBool = New-Object System.Collections.Generic.List[string]
        $filtPg = New-Object System.Collections.Generic.List[string]
        $unkGet = New-Object System.Collections.Generic.List[string]
        $idEnum = New-Object System.Collections.Generic.List[string]
        $idIen = New-Object System.Collections.Generic.List[string]
        foreach ($mr in $methodsArr) {
            if ($null -eq $mr) { continue }
            $clt = [string]$mr["classification"]
            $mnt = [string]$mr["method_name"]
            if ([string]$mr["candidate_priority"] -eq "high") {
                [void]$highPri.Add($mnt + " :: " + [string]$mr["signature"])
            }
            if ($clt -eq "safe_get_parameterless_catalog") { [void]$plCat.Add($mnt + " :: " + [string]$mr["signature"]) }
            if ($clt -eq "safe_get_by_single_int_id") { [void]$idOne.Add($mnt + " :: " + [string]$mr["signature"]) }
            if ($clt -eq "safe_get_by_int_id_plus_bools") { [void]$idBool.Add($mnt + " :: " + [string]$mr["signature"]) }
            if ($clt -eq "safe_get_by_filter_paging") { [void]$filtPg.Add($mnt + " :: " + [string]$mr["signature"]) }
            if ($clt -eq "unknown_get_requires_manual_probe") { [void]$unkGet.Add($mnt + " :: " + [string]$mr["signature"]) }
            if ($clt -eq "safe_get_requires_enum") { [void]$idEnum.Add($mnt + " :: " + [string]$mr["signature"]) }
            if ($clt -eq "safe_get_by_ienumerable_ids") { [void]$idIen.Add($mnt + " :: " + [string]$mr["signature"]) }
        }
        $report["high_priority_candidates"] = Convert-ToObjectArray $highPri
        $report["safe_parameterless_catalogs"] = Convert-ToObjectArray $plCat
        $report["safe_single_int_id_methods"] = Convert-ToObjectArray $idOne
        $report["safe_int_plus_bools_methods"] = Convert-ToObjectArray $idBool
        $safeIdCombined = New-Object System.Collections.Generic.List[string]
        foreach ($x in $idOne) { [void]$safeIdCombined.Add([string]$x) }
        foreach ($x in $idBool) { [void]$safeIdCombined.Add([string]$x) }
        $report["safe_id_methods"] = Convert-ToObjectArray $safeIdCombined
        $report["filter_paging_methods"] = Convert-ToObjectArray $filtPg
        $report["enumerable_id_methods"] = Convert-ToObjectArray $idIen
        $report["enum_parameter_methods"] = Convert-ToObjectArray $idEnum
        $report["unknown_get_methods"] = Convert-ToObjectArray $unkGet

        $rtSnapshot = New-Object System.Collections.ArrayList
        foreach ($k in $report["related_types_index"].Keys) {
            [void]$rtSnapshot.Add($report["related_types_index"][$k])
        }
        $report["related_types"] = Convert-ToObjectArray $rtSnapshot
    }
    catch {
        [void]$finalizeErrors.Add("finalize_normalize: " + $_.Exception.Message)
    }

    try {
        Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 18)
    } catch {
        [void]$finalizeErrors.Add("json: " + $_.Exception.Message)
        try {
            Write-Utf8NoBomFile $OutJson '{"classification":"json_write_failed","source":"MorawareSdkConnectionSurfaceMapProbe.ps1"}'
        } catch {
            [void]$finalizeErrors.Add("json_fallback: " + $_.Exception.Message)
        }
    }

    $agg = $report["aggregates"]
    try {
        $txt = New-Object System.Collections.Generic.List[string]
        [void]$txt.Add("Moraware SDK - Connection surface map (read-only reflection)")
        [void]$txt.Add("classification: $($report['classification'])")
        if ($report["top_level_error"]) {
            [void]$txt.Add("top_level_error: $($report['top_level_error'])")
        }
        [void]$txt.Add(("total_public_methods: {0}" -f $agg["total_public_instance_methods"]))
        [void]$txt.Add(("total_get_methods: {0}" -f $agg["total_get_methods"]))
        [void]$txt.Add(("total_blocked_mutation_methods: {0}" -f $agg["total_blocked_mutation"]))
        [void]$txt.Add(("schedule_calendar_resource_candidate_count: {0}" -f $agg["schedule_resource_candidate_n"]))
        [void]$txt.Add(("high_priority_candidates: {0}" -f $agg["high_priority_candidates_n"]))
        [void]$txt.Add(("safe_parameterless_catalog_methods: {0}" -f $agg["safe_parameterless_catalog_n"]))
        [void]$txt.Add(("safe_single_int_id_methods: {0}" -f $agg["safe_single_int_id_n"]))
        [void]$txt.Add(("safe_int_plus_bools_methods: {0}" -f $agg["safe_int_plus_bools_n"]))
        [void]$txt.Add(("safe_filter_paging_methods: {0}" -f $agg["safe_filter_paging_n"]))
        [void]$txt.Add(("safe_ienumerable_ids_methods: {0}" -f $agg["safe_ienumerable_ids_n"]))
        [void]$txt.Add(("safe_requires_enum_methods: {0}" -f $agg["safe_requires_enum_n"]))
        [void]$txt.Add(("unknown_get_manual_probe_methods: {0}" -f $agg["unknown_get_manual_n"]))
        [void]$txt.Add(("non_get_unknown_methods: {0}" -f $agg["non_get_unknown_n"]))
        $hpSorted = Convert-ToSortedObjectArray $report["high_priority_candidates"]
        [void]$txt.Add("high_priority_candidate_methods (name :: signature):")
        if ($hpSorted.Length -eq 0) { [void]$txt.Add("  (none)") }
        else { foreach ($ln in $hpSorted) { [void]$txt.Add("  " + $ln) } }
        [void]$txt.Add("safe_parameterless_catalog_methods (detail):")
        $plSorted = Convert-ToSortedObjectArray $report["safe_parameterless_catalogs"]
        if ($plSorted.Length -eq 0) { [void]$txt.Add("  (none)") }
        else { foreach ($ln in $plSorted) { [void]$txt.Add("  " + $ln) } }
        [void]$txt.Add("safe_single_int_id_methods (detail):")
        $id1Sorted = Convert-ToSortedObjectArray $report["safe_single_int_id_methods"]
        if ($id1Sorted.Length -eq 0) { [void]$txt.Add("  (none)") }
        else { foreach ($ln in $id1Sorted) { [void]$txt.Add("  " + $ln) } }
        [void]$txt.Add("safe_int_plus_bools_methods (detail):")
        $idBSorted = Convert-ToSortedObjectArray $report["safe_int_plus_bools_methods"]
        if ($idBSorted.Length -eq 0) { [void]$txt.Add("  (none)") }
        else { foreach ($ln in $idBSorted) { [void]$txt.Add("  " + $ln) } }
        [void]$txt.Add("safe_filter_paging_methods (detail):")
        $fpSorted = Convert-ToSortedObjectArray $report["filter_paging_methods"]
        if ($fpSorted.Length -eq 0) { [void]$txt.Add("  (none)") }
        else { foreach ($ln in $fpSorted) { [void]$txt.Add("  " + $ln) } }
        [void]$txt.Add("safe_ienumerable_ids_methods (detail):")
        $ienSorted = Convert-ToSortedObjectArray $report["enumerable_id_methods"]
        if ($ienSorted.Length -eq 0) { [void]$txt.Add("  (none)") }
        else { foreach ($ln in $ienSorted) { [void]$txt.Add("  " + $ln) } }
        [void]$txt.Add("safe_requires_enum_methods (detail):")
        $enSorted = Convert-ToSortedObjectArray $report["enum_parameter_methods"]
        if ($enSorted.Length -eq 0) { [void]$txt.Add("  (none)") }
        else { foreach ($ln in $enSorted) { [void]$txt.Add("  " + $ln) } }
        [void]$txt.Add("unknown_get_manual_probe_methods (detail):")
        $ugSorted = Convert-ToSortedObjectArray $report["unknown_get_methods"]
        if ($ugSorted.Length -eq 0) { [void]$txt.Add("  (none)") }
        else { foreach ($ln in $ugSorted) { [void]$txt.Add("  " + $ln) } }
        [void]$txt.Add("next_probe_recommendations (activity/assignee/resource):")
        foreach ($ln in (Convert-ToObjectArray $report["next_probe_recommendations"]["activity_assignee_resource_machine"])) {
            [void]$txt.Add("  " + $ln)
        }
        if ((Get-EnumerableCount $report["next_probe_recommendations"]["activity_assignee_resource_machine"]) -eq 0) {
            [void]$txt.Add("  (none)")
        }
        [void]$txt.Add("next_probe_recommendations (safe_catalog_next):")
        foreach ($ln in (Convert-ToObjectArray $report["next_probe_recommendations"]["safe_catalog_next"])) {
            [void]$txt.Add("  " + $ln)
        }
        if ((Get-EnumerableCount $report["next_probe_recommendations"]["safe_catalog_next"]) -eq 0) {
            [void]$txt.Add("  (none)")
        }
        [void]$txt.Add("next_probe_recommendations (proven_job_related):")
        foreach ($ln in (Convert-ToObjectArray $report["next_probe_recommendations"]["proven_job_related"])) {
            [void]$txt.Add("  " + $ln)
        }
        if ((Get-EnumerableCount $report["next_probe_recommendations"]["proven_job_related"]) -eq 0) {
            [void]$txt.Add("  (none)")
        }
        [void]$txt.Add("next_probe_recommendations (blocked_inventory_or_mutation_risk):")
        foreach ($ln in (Convert-ToObjectArray $report["next_probe_recommendations"]["blocked_inventory_or_mutation_risk"])) {
            [void]$txt.Add("  " + $ln)
        }
        if ((Get-EnumerableCount $report["next_probe_recommendations"]["blocked_inventory_or_mutation_risk"]) -eq 0) {
            [void]$txt.Add("  (none)")
        }
        [void]$txt.Add("optional_catalog_calls: " + (Format-Scalar $report["options"]["allow_safe_parameterless_calls"]))
        Write-Utf8NoBomFile $OutTxt ($txt -join "`n")
    } catch {
        [void]$finalizeErrors.Add("txt: " + $_.Exception.Message)
    }

    try {
        $csv = New-Object System.Collections.Generic.List[string]
        [void]$csv.Add("method_name,classification,candidate_priority,parameter_count,return_type,signature,safety_reason,why_interesting,suggested_probe_strategy")
        foreach ($mr in (Convert-ToObjectArray $report["methods"])) {
            if ($null -eq $mr) { continue }
            $line = @(
                (Escape-CsvField $mr["method_name"])
                (Escape-CsvField $mr["classification"])
                (Escape-CsvField $mr["candidate_priority"])
                (Escape-CsvField $mr["parameter_count"])
                (Escape-CsvField $mr["return_type"])
                (Escape-CsvField $mr["signature"])
                (Escape-CsvField $mr["safety_reason"])
                (Escape-CsvField $mr["why_interesting"])
                (Escape-CsvField $mr["suggested_probe_strategy"])
            ) -join ","
            [void]$csv.Add($line)
        }
        Write-Utf8NoBomFile $OutCsv ($csv -join "`n")
    } catch {
        [void]$finalizeErrors.Add("csv: " + $_.Exception.Message)
    }

    if ($finalizeErrors.Count -gt 0) {
        $report["finalization_errors"] = Convert-ToObjectArray $finalizeErrors
        if ($preFinalizeClassification -eq "ok") {
            $report["classification"] = "report_finalize_partial"
        }
        try {
            Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 18)
        } catch { }
    }

    try {
        Write-Host "Wrote: $OutJson"
        Write-Host "Wrote: $OutTxt"
        Write-Host "Wrote: $OutCsv"
    } catch { }
}

exit 0
