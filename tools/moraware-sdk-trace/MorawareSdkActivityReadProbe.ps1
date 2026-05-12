#Requires -Version 5.1
<#
.SYNOPSIS
  Windows-only Moraware SDK activity read probe under full .NET Framework (Windows PowerShell 5.1).

  Read-only: Connect / Disconnect and allowlisted Connection Get* methods aligned with SdkActivityReadProbe.cs.
  Optional env: MORAWARE_SDK_PROBE_JOB_ACTIVITY_ID (int), MORAWARE_SDK_PROBE_MAX_ASSIGNEES_SERIALIZE (default 300).
  Does not print or persist passwords, usernames, session IDs, auth tokens, cookies, or raw sensitive XML.
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

function Get-MachineTermHits {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) {
        return @{ titan = 0; saber = 0; robot = 0; saw = 0; polish = 0 }
    }
    return @{
        titan   = ([regex]::Matches($Text, "Titan", "IgnoreCase")).Count
        saber   = ([regex]::Matches($Text, "Saber", "IgnoreCase")).Count
        robot   = ([regex]::Matches($Text, "Robot", "IgnoreCase")).Count
        saw     = ([regex]::Matches($Text, "Saw", "IgnoreCase")).Count
        polish  = ([regex]::Matches($Text, "Polish", "IgnoreCase")).Count
    }
}

function Test-AssigneeNameContainsTerm {
    param([string]$Name, [string]$Term)
    if ([string]::IsNullOrEmpty($Name) -or [string]::IsNullOrEmpty($Term)) { return $false }
    return $Name.IndexOf($Term, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function New-AssigneeCatalogNameTermHits {
    return @{ titan = 0; saber = 0; robot = 0; saw = 0; polish = 0 }
}

function Add-AssigneeCatalogNameHit {
    param($Hits, [string]$Name)
    if ([string]::IsNullOrEmpty($Name)) { return }
    if (Test-AssigneeNameContainsTerm $Name "Titan") { $Hits.titan++ }
    if (Test-AssigneeNameContainsTerm $Name "Saber") { $Hits.saber++ }
    if (Test-AssigneeNameContainsTerm $Name "Robot") { $Hits.robot++ }
    if (Test-AssigneeNameContainsTerm $Name "Saw") { $Hits.saw++ }
    if (Test-AssigneeNameContainsTerm $Name "Polish") { $Hits.polish++ }
}

function Get-SanitizedAssigneeRow {
    param($Item)
    if ($null -eq $Item) { return $null }
    $idStr = Format-Scalar (Get-PropValue $Item @("AssigneeId", "Id", "ResourceId"))
    $nameStr = Format-Scalar (Get-PropValue $Item @("AssigneeName", "Name", "ResourceName"))
    $desc = Get-PropValue $Item @("Description", "AssigneeDescription", "Details")
    $dlen = 0
    if ($desc -is [string]) { $dlen = $desc.Length }
    elseif ($null -ne $desc) { $dlen = ([string]$desc).Length }
    $activeVal = Get-PropValue $Item @("Active", "IsActive", "Enabled", "IsEnabled")
    $activePreview = ""
    if ($null -ne $activeVal) {
        if ($activeVal -is [bool]) { $activePreview = [string]$activeVal }
        else { $activePreview = (Format-Scalar $activeVal) }
    }
    $statusLike = Format-Scalar (Get-PropValue $Item @("Status", "StatusName", "AssigneeStatus", "State"))
    return @{
        assignee_id           = $idStr
        assignee_name         = $nameStr
        description_length    = $dlen
        active_or_flag_preview = $activePreview
        status_like           = $statusLike
    }
}

function Serialize-GlobalAssigneesCatalog {
    param($Collection, [int]$MaxSerialize)
    $hits = New-AssigneeCatalogNameTermHits
    $items = New-Object System.Collections.Generic.List[object]
    $total = 0
    if ($null -eq $Collection) {
        return @{
            total_count      = 0
            items_serialized = @()
            name_term_hits   = $hits
        }
    }
    if ($Collection -is [System.Collections.ICollection]) {
        try { $total = $Collection.Count } catch { $total = -1 }
    }
    if ($Collection -is [System.Collections.IEnumerable] -and -not ($Collection -is [string])) {
        $n = 0
        foreach ($it in $Collection) {
            $n++
            if ($total -lt 0 -and $n -eq 1) { $total = 0 }
            if ($total -lt 0) { }
            $row = Get-SanitizedAssigneeRow $it
            if ($row -and $row.assignee_name) {
                Add-AssigneeCatalogNameHit $hits $row.assignee_name
            }
            if ($row -and $items.Count -lt $MaxSerialize) {
                [void]$items.Add($row)
            }
        }
        if ($total -lt 0) { $total = $n }
    }
    return @{
        total_count     = [int]$total
        items_serialized = @($items)
        name_term_hits  = $hits
    }
}

function Format-MethodSignatureFromMethod {
    param([System.Reflection.MethodInfo]$Method)
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($p in $Method.GetParameters()) {
        [void]$parts.Add($p.ParameterType.FullName + " " + $p.Name)
    }
    return $Method.Name + "(" + ($parts -join ", ") + ")"
}

function Get-GetJobActivityMethodsSorted {
    param([type]$ConnType)
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    $all = $ConnType.GetMethods($flags)
    $list = @()
    foreach ($m in $all) {
        if ($m.Name -ne "GetJobActivity") { continue }
        if ($m.IsGenericMethod) { continue }
        $list += $m
    }
    return @($list | Sort-Object { @($_.GetParameters()).Length }, { $_.ToString() })
}

function Test-IntegralTypeCode {
    param([type]$T)
    if ($null -eq $T) { return $false }
    $tc = [TypeCode]::Empty
    try { $tc = [Type]::GetTypeCode($T) } catch { return $false }
    return ($tc -ge [TypeCode]::SByte -and $tc -le [TypeCode]::UInt64)
}

function Find-FirstIntegralParameterIndex {
    param([System.Reflection.ParameterInfo[]]$Params)
    for ($i = 0; $i -lt $Params.Length; $i++) {
        $t = $Params[$i].ParameterType
        if ($t -eq [bool]) { continue }
        if (Test-IntegralTypeCode $t) { return $i }
    }
    for ($i = 0; $i -lt $Params.Length; $i++) {
        $t = $Params[$i].ParameterType
        if ($t -eq [bool]) { continue }
        if ($t.IsEnum) { return $i }
    }
    return -1
}

function Get-BoolParameterIndices {
    param([System.Reflection.ParameterInfo[]]$Params)
    $idx = New-Object System.Collections.Generic.List[int]
    for ($i = 0; $i -lt $Params.Length; $i++) {
        if ($Params[$i].ParameterType -eq [bool]) {
            [void]$idx.Add($i)
        }
    }
    return $idx
}

function New-BoolCombosForLength {
    param([int]$BoolCount)
    if ($BoolCount -le 0) {
        return ,@([bool[]]@())
    }
    if ($BoolCount -eq 1) {
        return ,@(@($false), @($true))
    }
    if ($BoolCount -eq 2) {
        return ,@(@($false, $false), @($true, $false), @($false, $true), @($true, $true))
    }
    $rows = New-Object System.Collections.Generic.List[object]
    $max = [Math]::Pow(2, $BoolCount)
    if ($max -gt 16) { $max = 16 }
    for ($mask = 0; $mask -lt $max; $mask++) {
        $r = New-Object bool[] $BoolCount
        for ($b = 0; $b -lt $BoolCount; $b++) {
            $bit = 1 -shl $b
            $r[$b] = (($mask -band $bit) -ne 0)
        }
        [void]$rows.Add($r)
    }
    return ,$rows.ToArray()
}

function Invoke-GetJobActivityOverloadProbe {
    param($Connection, [type]$ConnType, [int]$ActivityId)
    $methods = @(Get-GetJobActivityMethodsSorted $ConnType)
    $overloadSignatures = New-Object System.Collections.Generic.List[string]
    foreach ($mm in $methods) {
        [void]$overloadSignatures.Add((Format-MethodSignatureFromMethod $mm))
    }
    $attemptRows = New-Object System.Collections.Generic.List[object]
    $firstWinningSig = $null
    $activityOut = $null
    $successSigs = New-Object System.Collections.Generic.List[string]
    foreach ($m in $methods) {
        $ps = $m.GetParameters()
        $integralIdx = Find-FirstIntegralParameterIndex $ps
        if ($integralIdx -lt 0) {
            [void]$attemptRows.Add(@{
                signature   = (Format-MethodSignatureFromMethod $m)
                attempted   = $false
                success     = $false
                skip_reason = "no_integral_job_activity_id_parameter"
            })
            continue
        }
        $boolIdx = @(Get-BoolParameterIndices $ps)
        $combos = @(New-BoolCombosForLength $boolIdx.Count)
        foreach ($combo in $combos) {
            $invokeArgs = New-Object 'object[]' $ps.Length
            $buildOk = $true
            for ($i = 0; $i -lt $ps.Length; $i++) {
                $pt = $ps[$i].ParameterType
                if ($i -eq $integralIdx) {
                    try {
                        $invokeArgs[$i] = [Convert]::ChangeType($ActivityId, $pt)
                    } catch {
                        $buildOk = $false
                        break
                    }
                }
                elseif ($pt -eq [bool]) {
                    $bi = [array]::IndexOf($boolIdx, $i)
                    if ($bi -ge 0 -and $bi -lt $combo.Length) {
                        $invokeArgs[$i] = [bool]$combo[$bi]
                    }
                    else {
                        $invokeArgs[$i] = [bool]$false
                    }
                }
                elseif ($pt.IsEnum) {
                    try {
                        $invokeArgs[$i] = [System.Enum]::ToObject($pt, 0)
                    } catch {
                        $buildOk = $false
                        break
                    }
                }
                else {
                    $buildOk = $false
                    break
                }
            }
            if (-not $buildOk) {
                [void]$attemptRows.Add(@{
                    signature   = (Format-MethodSignatureFromMethod $m)
                    attempted   = $false
                    success     = $false
                    skip_reason = "could_not_coerce_parameters"
                })
                break
            }
            $comboLabel = ""
            if ($boolIdx.Count -gt 0) {
                $comboLabel = "bools=" + (($combo | ForEach-Object { [string]$_ }) -join ",")
            }
            try {
                $res = $m.Invoke($Connection, $invokeArgs)
                $sigLine = (Format-MethodSignatureFromMethod $m)
                if ($comboLabel) { $sigLine = $sigLine + " [" + $comboLabel + "]" }
                [void]$attemptRows.Add(@{
                    signature   = (Format-MethodSignatureFromMethod $m)
                    attempted   = $true
                    success     = $true
                    bool_combo  = $comboLabel
                })
                [void]$successSigs.Add($sigLine)
                if ($null -eq $activityOut) {
                    $activityOut = $res
                    $firstWinningSig = $sigLine
                }
                break
            } catch {
                $em = $_.Exception.Message
                if ($_.Exception.InnerException) {
                    $em = $_.Exception.InnerException.Message
                }
                [void]$attemptRows.Add(@{
                    signature   = (Format-MethodSignatureFromMethod $m)
                    attempted   = $true
                    success     = $false
                    bool_combo  = $comboLabel
                    error       = $em
                })
            }
        }
    }
    return @{
        overload_signatures      = @($overloadSignatures)
        attempts                 = @($attemptRows)
        winning_signature        = $firstWinningSig
        all_success_signatures   = @($successSigs)
        activity                 = $activityOut
    }
}

function Test-PropertyNameBlockedForPreview {
    param([string]$PropName)
    if ([string]::IsNullOrEmpty($PropName)) { return $true }
    $pn = $PropName.ToLowerInvariant()
    foreach ($frag in @("password", "token", "session", "secret", "credential", "cookie", "auth")) {
        if ($pn.IndexOf($frag, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    if ($pn -eq "notes" -or $pn -eq "note") { return $true }
    return $false
}

function Test-AssignmentRelatedPropertyName {
    param([string]$PropName)
    if ([string]::IsNullOrEmpty($PropName)) { return $false }
    foreach ($kw in @("Assignee", "Assigned", "Resource", "Machine", "Employee", "User", "Calendar", "Schedule", "WorkCenter", "Station")) {
        if ($PropName.IndexOf($kw, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
}

function Build-PropertyDiscoverySummary {
    param($Target, [int]$MaxProperties = 120)
    $emptyHints = New-Object System.Collections.Generic.List[string]
    if ($null -eq $Target) {
        return @{
            properties                 = @()
            assignment_related_hints   = @()
        }
    }
    $t = $Target.GetType()
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    $props = $t.GetProperties($flags)
    $summary = New-Object System.Collections.Generic.List[object]
    $hints = New-Object System.Collections.Generic.List[string]
    $n = 0
    foreach ($prop in $props) {
        if (-not $prop.CanRead) { continue }
        $n++
        if ($n -gt $MaxProperties) { break }
        $nm = $prop.Name
        $related = Test-AssignmentRelatedPropertyName $nm
        $row = @{
            name                      = $nm
            property_type             = $prop.PropertyType.FullName
            assignment_related_name   = $related
        }
        try {
            $val = $prop.GetValue($Target, $null)
            if ($null -eq $val) {
                $row.value_kind = "null"
            }
            elseif ($val -is [string]) {
                $row.value_kind = "string"
                $row.string_length = $val.Length
                if (-not (Test-PropertyNameBlockedForPreview $nm)) {
                    $pv = $val
                    if ($pv.Length -gt 120) { $pv = $pv.Substring(0, 120) + "..." }
                    $row.scalar_preview = $pv
                }
            }
            elseif ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) {
                $row.value_kind = "collection"
                $cnt = 0
                $itemType = ""
                foreach ($it in $val) {
                    if ($cnt -eq 0 -and $null -ne $it) {
                        $itemType = $it.GetType().FullName
                    }
                    $cnt++
                    if ($cnt -ge 5000) { break }
                }
                if ($val -is [System.Collections.ICollection]) {
                    try { $cnt = $val.Count } catch { }
                }
                $row.collection_count = $cnt
                $row.collection_item_type_first = $itemType
            }
            elseif ($val -is [ValueType] -or $val -is [bool] -or $val -is [DateTime] -or $val -is [decimal]) {
                $row.value_kind = "scalar"
                if (-not (Test-PropertyNameBlockedForPreview $nm)) {
                    $row.scalar_preview = (Format-Scalar $val)
                }
            }
            else {
                $row.value_kind = "object_ref"
                $row.object_type = $val.GetType().FullName
            }
        } catch {
            $row.value_kind = "error_reading"
            $row.error = $_.Exception.Message
        }
        if ($related) {
            $hint = $nm + "=" + $row.value_kind
            if ($row.scalar_preview) { $hint = $hint + ":" + $row.scalar_preview }
            if ($null -ne $row.collection_count) { $hint = $hint + ":count=" + $row.collection_count }
            [void]$hints.Add($hint)
        }
        [void]$summary.Add($row)
    }
    return @{
        properties               = @($summary)
        assignment_related_hints = @($hints)
    }
}

function New-ActivitySample {
    param($Activity, [int]$Index)
    $id = Format-Scalar (Get-PropValue $Activity @("JobActivityId", "Id", "JobActivityID"))
    $typeName = Format-Scalar (Get-PropValue $Activity @("JobActivityTypeName", "ActivityTypeName", "TypeName"))
    $statusName = Format-Scalar (Get-PropValue $Activity @("JobActivityStatusName", "StatusName", "ActivityStatusName"))
    $start = Format-Scalar (Get-PropValue $Activity @("StartDate", "ActivityStartDate", "ScheduledDate", "CompletedDate"))
    $sched = Format-Scalar (Get-PropValue $Activity @("ScheduledTime", "ScheduleTime"))
    $dur = Format-Scalar (Get-PropValue $Activity @("ScheduledDuration", "Duration"))
    $notes = Get-PropValue $Activity @("Notes", "Note")
    $notesLen = 0
    if ($notes -is [string]) { $notesLen = $notes.Length }
    elseif ($null -ne $notes) { $notesLen = ([string]$notes).Length }

    $assigneesObj = Get-PropValue $Activity @("Assignees", "AssigneeList", "AssignedResources")
    $assigneeRows = @()
    if ($assigneesObj -is [System.Collections.IEnumerable] -and -not ($assigneesObj -is [string])) {
        foreach ($a in $assigneesObj) {
            if ($null -eq $a) { continue }
            $aid = Format-Scalar (Get-PropValue $a @("AssigneeId", "Id", "ResourceId"))
            $aname = Format-Scalar (Get-PropValue $a @("AssigneeName", "Name", "ResourceName"))
            $desc = Get-PropValue $a @("Description", "AssigneeDescription", "Details")
            $dlen = 0
            if ($desc -is [string]) { $dlen = $desc.Length }
            elseif ($null -ne $desc) { $dlen = ([string]$desc).Length }
            $assigneeRows += @{
                assignee_id          = $aid
                assignee_name        = $aname
                description_length   = $dlen
            }
        }
    }

    $scrub = (@($typeName, $statusName) + ($assigneeRows | ForEach-Object { $_.assignee_name })) -join " "
    $hits = Get-MachineTermHits $scrub
    $propDisc = Build-PropertyDiscoverySummary $Activity

    return @{
        index                                  = $Index
        job_activity_id                        = $id
        activity_type_name                     = $typeName
        activity_status_name                   = $statusName
        start_or_schedule_or_completed_hint    = $start
        scheduled_time                         = $sched
        scheduled_duration                     = $dur
        notes_length                           = $notesLen
        assignees_count                        = $assigneeRows.Count
        assignees                              = $assigneeRows
        machine_resource_term_hits             = $hits
        property_discovery                     = $propDisc
    }
}

function Collect-ActivitySamples {
    param($List, [int]$Max, [ref]$SeriesIdRef, [System.Collections.Generic.List[int]]$IdBag)
    $samples = New-Object System.Collections.Generic.List[object]
    if ($null -eq $List) { return $samples }
    if (-not ($List -is [System.Collections.IEnumerable])) { return $samples }
    $idx = 0
    foreach ($item in $List) {
        $idx++
        if ($idx -gt $Max) { break }
        if ($null -eq $item) { continue }
        $actId = Get-PropValue $item @("JobActivityId", "Id", "JobActivityID")
        if ($null -ne $actId) {
            $parsed = 0
            if ([int]::TryParse(([string]$actId).Trim(), [ref]$parsed)) {
                if (-not $IdBag.Contains($parsed)) { [void]$IdBag.Add($parsed) }
            }
        }
        if ($null -eq $SeriesIdRef.Value) {
            $sid = Get-PropValue $item @("JobActivitySeriesId", "SeriesId")
            if ($null -ne $sid) {
                $sp = 0
                if ([int]::TryParse(([string]$sid).Trim(), [ref]$sp)) { $SeriesIdRef.Value = $sp }
            }
        }
        [void]$samples.Add((New-ActivitySample $item $idx))
    }
    return $samples
}

function Get-ActivityCollectionProperty {
    param([type]$T)
    $props = $T.GetProperties([System.Reflection.BindingFlags]"Public,Instance")
    foreach ($name in @("JobActivities", "Activities", "JobActivityList")) {
        $p = @($props | Where-Object { $_.Name -ceq $name } | Select-Object -First 1)
        if ($p) { return $p }
    }
    return @($props | Where-Object {
            $_.Name -like "*JobActivity*" -or $_.Name -like "*activ*"
        } | Select-Object -First 1)[0]
}

function Get-ActivitiesFromJobObject {
    param($Job, [int]$Max, [ref]$SeriesIdRef, [System.Collections.Generic.List[int]]$IdBag)
    $samples = New-Object System.Collections.Generic.List[object]
    if ($null -eq $Job) { return $samples }
    $prop = Get-ActivityCollectionProperty $Job.GetType()
    if (-not $prop) { return $samples }
    try {
        $coll = $prop.GetValue($Job)
        return Collect-ActivitySamples $coll $Max $SeriesIdRef $IdBag
    } catch {
        return $samples
    }
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

function New-TypedTypeArray {
    param([type[]]$Types)
    if ($null -eq $Types -or $Types.Length -eq 0) { return [System.Type]::EmptyTypes }
    $arr = New-Object 'System.Type[]' $Types.Length
    for ($i = 0; $i -lt $Types.Length; $i++) {
        $arr[$i] = $Types[$i]
    }
    return $arr
}

function New-TypedObjectArray {
    param([object[]]$Values, [type[]]$Types)
    $len = 0
    if ($null -ne $Values) { $len = $Values.Length }
    $arr = New-Object 'object[]' $len
    for ($i = 0; $i -lt $len; $i++) {
        $v = $Values[$i]
        if ($null -ne $Types -and $i -lt $Types.Length -and $null -ne $Types[$i]) {
            $t = $Types[$i]
            if ($t -eq [bool]) {
                $arr[$i] = [bool]$v
            }
            elseif ($t -eq [int32]) {
                $arr[$i] = [int32]$v
            }
            elseif ($t -eq [int64]) {
                $arr[$i] = [int64]$v
            }
            elseif ($t -eq [string]) {
                if ($null -eq $v) { $arr[$i] = $null } else { $arr[$i] = [string]$v }
            }
            elseif ($null -eq $v) {
                $arr[$i] = $null
            }
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
    $types = New-TypedTypeArray $ArgTypes
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
    return $m.Invoke($Connection, $invokeArgs)
}

# --- Diagnostics ---
$diag = @{
    ps_edition     = $PSVersionTable.PSEdition
    ps_version     = $PSVersionTable.PSVersion.ToString()
    clr_version    = [Environment]::Version.ToString()
}

if ($PSVersionTable.PSEdition -eq "Core") {
    Write-Host "ERROR: Run with Windows PowerShell 5.1 (powershell.exe), not PowerShell 7 (pwsh)." -ForegroundColor Red
    exit 2
}

$winFormsPartial = $null
try {
    $winFormsPartial = [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms")
} catch {
    $winFormsPartial = $null
}
$diag["system_windows_forms_load_with_partial_name_ok"] = ($null -ne $winFormsPartial)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DllPath = Join-Path $ScriptDir "lib\JobTrackerAPI5.dll"
$diag["job_tracker_api5_dll_path"] = $DllPath
$diag["job_tracker_api5_dll_exists"] = (Test-Path -LiteralPath $DllPath)

$OutJson = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-activity-read-probe-windows-framework.json"
$OutTxt  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-activity-read-probe-windows-framework.txt"

$url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_URL")).Trim()
if (-not $url) { $url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_API_URL")).Trim() }
$user = [string]([Environment]::GetEnvironmentVariable("MORAWARE_USERNAME")).Trim()
$pass = [string]([Environment]::GetEnvironmentVariable("MORAWARE_PASSWORD")).Trim()

$apiHost = $null
try {
    if ($url) { $apiHost = ([Uri]$url).Host }
} catch { $apiHost = $null }

function Read-IntEnv([string]$n, [int]$def) {
    $raw = [Environment]::GetEnvironmentVariable($n)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $def }
    $v = 0
    if ([int]::TryParse($raw.Trim(), [ref]$v)) { return $v }
    return $def
}

$jobId = Read-IntEnv "MORAWARE_SDK_PROBE_JOB_ID" 38837
$maxActivities = Read-IntEnv "MORAWARE_SDK_PROBE_MAX_ACTIVITIES" 50
$maxAssigneesSerialize = Read-IntEnv "MORAWARE_SDK_PROBE_MAX_ASSIGNEES_SERIALIZE" 300
$explicitActivityId = $null
$rawJa = [Environment]::GetEnvironmentVariable("MORAWARE_SDK_PROBE_JOB_ACTIVITY_ID")
if (-not [string]::IsNullOrWhiteSpace($rawJa)) {
    $eja = 0
    if ([int]::TryParse($rawJa.Trim(), [ref]$eja)) { $explicitActivityId = $eja }
}

$attempts = New-Object System.Collections.Generic.List[object]
$aggregateHits = @{ titan = 0; saber = 0; robot = 0; saw = 0; polish = 0 }

function Add-ToAggregateHits {
    param($Samples)
    foreach ($s in $Samples) {
        $h = $s.machine_resource_term_hits
        if ($h) {
            $aggregateHits.titan += [int]$h.titan
            $aggregateHits.saber += [int]$h.saber
            $aggregateHits.robot += [int]$h.robot
            $aggregateHits.saw += [int]$h.saw
            $aggregateHits.polish += [int]$h.polish
        }
    }
}

$report = @{
    generated_at                              = [DateTime]::UtcNow.ToString("o")
    source                                    = "MorawareSdkActivityReadProbe.ps1"
    classification                            = $null
    top_level_error                           = $null
    top_level_error_type                      = $null
    diagnostics                               = $diag
    credentials                               = @{
        api_url_configured   = (-not [string]::IsNullOrWhiteSpace($url))
        api_host             = $apiHost
        username_configured  = (-not [string]::IsNullOrWhiteSpace($user))
        password_configured  = (-not [string]::IsNullOrWhiteSpace($pass))
    }
    loaded_runtime                            = @{
        framework_description = "Windows .NET Framework / CLR " + [Environment]::Version.ToString()
        powershell            = $PSVersionTable.PSVersion.ToString()
        ps_edition              = $PSVersionTable.PSEdition
    }
    system_windows_forms_loaded_before_jobtracker = $false
    job_tracker_api5_loaded                   = $false
    job_tracker_api5_location                 = $null
    connected                                 = $false
    assignees_populated_anywhere              = $false
    methods_attempted                         = $attempts
    aggregate_machine_resource_term_hits    = $aggregateHits
    job_id                                    = $jobId
    max_activities                            = $maxActivities
    max_assignees_serialize                  = $maxAssigneesSerialize
    explicit_job_activity_id                  = $explicitActivityId
    get_job_activity_probe                    = $null
    get_assignees_catalog                     = $null
    assignment_related_property_seen_anywhere = $false
    get_job_activities_method_signatures      = @()
    get_assignees_method_signatures           = @()
    get_job_activity_method_signatures        = @()
    get_job_activities_exact_signature_used   = $false
    get_assignees_parameterless_signature_used = $false
}

if (-not $report.credentials.api_url_configured -or -not $report.credentials.username_configured -or -not $report.credentials.password_configured) {
    $report.classification = "missing_credentials"
    $report.top_level_error = "Missing MORAWARE_URL or MORAWARE_API_URL, and/or MORAWARE_USERNAME / MORAWARE_PASSWORD."
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    $stubTxt = @(
        "Moraware SDK - activity read probe (Windows .NET Framework host)",
        "classification: missing_credentials",
        "top_level_error: $($report.top_level_error)",
        "Full JSON: $OutJson"
    ) -join "`n"
    Write-Utf8NoBomFile $OutTxt $stubTxt
    Write-Host "Wrote: $OutJson"
    exit 0
}

if (-not $diag["job_tracker_api5_dll_exists"]) {
    $report.classification = "dll_missing"
    $report.top_level_error = "JobTrackerAPI5.dll not found at expected path."
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("Moraware SDK - activity read probe`nclassification: dll_missing`nFull JSON: $OutJson")
    Write-Host "Wrote: $OutJson"
    exit 0
}

try {
    Add-Type -AssemblyName System.Windows.Forms
    $report.system_windows_forms_loaded_before_jobtracker = $true
} catch {
    $report.classification = "system_windows_forms_load_failed"
    $report.top_level_error = $_.Exception.Message
    $report.top_level_error_type = $_.Exception.GetType().FullName
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("classification: system_windows_forms_load_failed`nerror: $($report.top_level_error)`nFull JSON: $OutJson")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$asm = $null
try {
    $asm = [System.Reflection.Assembly]::LoadFrom($DllPath)
    $report.job_tracker_api5_loaded = $true
    $report.job_tracker_api5_location = $asm.Location
} catch {
    $report.top_level_error = $_.Exception.Message
    $report.top_level_error_type = $_.Exception.GetType().FullName
    if (Test-WindowsFormsBlocker $report.top_level_error) {
        $report.classification = "windows_dependency_blocker"
    } else {
        $report.classification = "job_tracker_load_failed"
    }
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("classification: $($report.classification)`ntop_level_error: $($report.top_level_error)`nFull JSON: $OutJson")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$conn = $null
$connType = $asm.GetType("Moraware.JobTrackerAPI5.Connection", $false, $false)
if (-not $connType) {
    $report.classification = "connection_type_not_found"
    $report.top_level_error = "Type Moraware.JobTrackerAPI5.Connection not found in assembly."
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("Moraware SDK - activity read probe`nclassification: connection_type_not_found`nFull JSON: $OutJson")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$tracerType = $asm.GetType("Moraware.JobTrackerAPI5.DevelopmentAssistance.SimpleConsoleCommandTracer", $false, $false)
if (-not $tracerType) {
    $report.classification = "command_tracer_type_not_found"
    $report.top_level_error = "Type Moraware.JobTrackerAPI5.DevelopmentAssistance.SimpleConsoleCommandTracer not found in assembly."
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("Moraware SDK - activity read probe`nclassification: command_tracer_type_not_found`nFull JSON: $OutJson")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$tracer = [Activator]::CreateInstance($tracerType, @($false, $false))

# Connection(url_, userName_, password_, commandTracer_, compressRequests_, compressResponses_, applicationName_)
$ctor = $null
foreach ($c in $connType.GetConstructors()) {
    $ps = $c.GetParameters()
    if ($ps.Length -ne 7) { continue }
    if ($ps[0].ParameterType -ne [string]) { continue }
    if ($ps[1].ParameterType -ne [string]) { continue }
    if ($ps[2].ParameterType -ne [string]) { continue }
    if (-not $ps[3].ParameterType.IsAssignableFrom($tracerType)) { continue }
    if ($ps[4].ParameterType -ne [bool]) { continue }
    if ($ps[5].ParameterType -ne [bool]) { continue }
    if ($ps[6].ParameterType -ne [string]) { continue }
    $ctor = $c
    break
}

if (-not $ctor) {
    $report.classification = "connection_constructor_not_found"
    $report.top_level_error = "Could not resolve Moraware.JobTrackerAPI5.Connection constructor with signature (string url_, string userName_, string password_, ICommandTracer commandTracer_, bool compressRequests_, bool compressResponses_, string applicationName_)."
    $report.connection_constructor_expected = "Connection(string, string, string, ICommandTracer, bool, bool, string)"
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("Moraware SDK - activity read probe`nclassification: connection_constructor_not_found`nFull JSON: $OutJson")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$probeApplicationName = "eOS Moraware SDK Probe"
try {
    $conn = $ctor.Invoke(@(
            $url,
            $user,
            $pass,
            $tracer,
            $false,
            $false,
            $probeApplicationName
        ))
} catch {
    $report.classification = "connection_constructor_invoke_failed"
    $report.top_level_error = $_.Exception.Message
    $report.top_level_error_type = $_.Exception.GetType().FullName
    if (Test-WindowsFormsBlocker $report.top_level_error) {
        $report.classification = "windows_dependency_blocker"
    }
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("Moraware SDK - activity read probe`nclassification: $($report.classification)`ntop_level_error: $($report.top_level_error)`nFull JSON: $OutJson")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$resolvedSeriesId = $null
$resolvedIds = New-Object "System.Collections.Generic.List[int]"

try {
    [void](Invoke-ConnMethod $conn "Connect" ([object[]]@()) ([type[]]@()))
    $report.connected = $true

    $report.get_job_activities_method_signatures = @(Get-ConnMethodOverloadSignatures $connType "GetJobActivities")
    $report.get_assignees_method_signatures      = @(Get-ConnMethodOverloadSignatures $connType "GetAssignees")
    $report.get_job_activity_method_signatures   = @(Get-ConnMethodOverloadSignatures $connType "GetJobActivity")

    try {
        $gjaTypes = [type[]]@([int32], [bool], [bool])
        $gjaArgs  = [object[]]@([int32]$jobId, [bool]$false, [bool]$false)
        $list = Invoke-ConnMethod $conn "GetJobActivities" $gjaArgs $gjaTypes
        $report.get_job_activities_exact_signature_used = $true
        $sr = [ref]$resolvedSeriesId
        $samples = Collect-ActivitySamples $list $maxActivities $sr $resolvedIds
        $resolvedSeriesId = $sr.Value
        Add-ToAggregateHits $samples
        [void]$attempts.Add(@{
            method                = "GetJobActivities"
            signature             = "(System.Int32 jobId_, System.Boolean includeJobPhases_, System.Boolean includeJobActivitySeriesMember_)"
            attempted             = $true
            success               = $true
            exact_signature_used  = $true
            overloads             = $report.get_job_activities_method_signatures
            returned_type         = $(if ($list) { $list.GetType().FullName } else { $null })
            activity_samples      = @($samples)
        })
    } catch {
        $em = $_.Exception.Message
        [void]$attempts.Add(@{
            method                     = "GetJobActivities"
            signature                  = "(System.Int32 jobId_, System.Boolean includeJobPhases_, System.Boolean includeJobActivitySeriesMember_)"
            attempted                  = $true
            success                    = $false
            exact_signature_used       = $false
            overloads                  = $report.get_job_activities_method_signatures
            error                      = $em
            error_type                 = $_.Exception.GetType().FullName
            windows_dependency_blocker = (Test-WindowsFormsBlocker $em)
        })
    }

    try {
        $job = Invoke-ConnMethod $conn "GetJob" ([object[]]@([int32]$jobId, [bool]$false, [bool]$true)) ([type[]]@([int32], [bool], [bool]))
        $sr = [ref]$resolvedSeriesId
        $samples = Get-ActivitiesFromJobObject $job $maxActivities $sr $resolvedIds
        $resolvedSeriesId = $sr.Value
        Add-ToAggregateHits $samples
        [void]$attempts.Add(@{
            method           = "GetJob"
            attempted        = $true
            success          = $true
            returned_type    = $(if ($job) { $job.GetType().FullName } else { $null })
            activity_samples = @($samples)
        })
    } catch {
        $em = $_.Exception.Message
        [void]$attempts.Add(@{
            method                     = "GetJob"
            attempted                  = $true
            success                    = $false
            error                      = $em
            error_type                 = $_.Exception.GetType().FullName
            windows_dependency_blocker = (Test-WindowsFormsBlocker $em)
        })
    }

    $activityIdForSingle = $explicitActivityId
    if ((-not $activityIdForSingle -or $activityIdForSingle -le 0) -and $resolvedIds.Count -gt 0) {
        $activityIdForSingle = $resolvedIds[0]
    }
    if ($activityIdForSingle -and $activityIdForSingle -gt 0) {
        try {
            $jaProbe = Invoke-GetJobActivityOverloadProbe $conn $connType $activityIdForSingle
            $report.get_job_activity_probe = $jaProbe
            $act = $jaProbe.activity
            $samples = New-Object System.Collections.Generic.List[object]
            if ($null -ne $act) {
                [void]$samples.Add((New-ActivitySample $act 1))
            }
            Add-ToAggregateHits $samples
            $jaOk = ($null -ne $jaProbe.winning_signature)
            [void]$attempts.Add(@{
                method                           = "GetJobActivity"
                attempted                        = $true
                success                          = $jaOk
                returned_type                    = $(if ($act) { $act.GetType().FullName } else { $null })
                get_job_activity_overloads       = $jaProbe.overload_signatures
                get_job_activity_overload_attempts = $jaProbe.attempts
                winning_signature                = $jaProbe.winning_signature
                all_success_signatures           = $jaProbe.all_success_signatures
                activity_samples                 = @($samples)
                error                            = $(if (-not $jaOk) { "all_get_job_activity_overload_invocations_failed" } else { $null })
            })
        } catch {
            $em = $_.Exception.Message
            [void]$attempts.Add(@{
                method                     = "GetJobActivity"
                attempted                  = $true
                success                    = $false
                error                      = $em
                error_type                 = $_.Exception.GetType().FullName
                windows_dependency_blocker = (Test-WindowsFormsBlocker $em)
            })
        }
    } else {
        [void]$attempts.Add(@{
            method       = "GetJobActivity"
            attempted    = $false
            success      = $false
            skip_reason  = "missing_job_activity_id"
        })
    }

    if ($resolvedSeriesId) {
        try {
            $list = Invoke-ConnMethod $conn "GetJobActivitiesForSeries" ([object[]]@([int32]$resolvedSeriesId, [bool]$false, [bool]$false)) ([type[]]@([int32], [bool], [bool]))
            $unusedSeries = $null
            $sr = [ref]$unusedSeries
            $ids = New-Object "System.Collections.Generic.List[int]"
            $samples = Collect-ActivitySamples $list $maxActivities $sr $ids
            Add-ToAggregateHits $samples
            [void]$attempts.Add(@{
                method           = "GetJobActivitiesForSeries"
                attempted        = $true
                success          = $true
                returned_type    = $(if ($list) { $list.GetType().FullName } else { $null })
                activity_samples = @($samples)
            })
        } catch {
            $em = $_.Exception.Message
            [void]$attempts.Add(@{
                method                     = "GetJobActivitiesForSeries"
                attempted                  = $true
                success                    = $false
                error                      = $em
                error_type                 = $_.Exception.GetType().FullName
                windows_dependency_blocker = (Test-WindowsFormsBlocker $em)
            })
        }
    } else {
        [void]$attempts.Add(@{
            method       = "GetJobActivitiesForSeries"
            attempted    = $false
            success      = $false
            skip_reason  = "missing_job_activity_series_id"
        })
    }

    try {
        $types0 = Invoke-ConnMethod $conn "GetJobActivityTypes" ([object[]]@()) ([type[]]@())
        [void]$attempts.Add(@{
            method        = "GetJobActivityTypes"
            signature     = "()"
            attempted     = $true
            success       = $true
            returned_type = $(if ($types0) { $types0.GetType().FullName } else { $null })
        })
    } catch {
        $em = $_.Exception.Message
        [void]$attempts.Add(@{
            method                     = "GetJobActivityTypes"
            signature                  = "()"
            attempted                  = $true
            success                    = $false
            error                      = $em
            windows_dependency_blocker = (Test-WindowsFormsBlocker $em)
        })
    }

    $processIdParsed = 0
    $haveProcessId = $false
    try {
        $jobLite = Invoke-ConnMethod $conn "GetJob" ([object[]]@([int32]$jobId, [bool]$false, [bool]$false)) ([type[]]@([int32], [bool], [bool]))
        $pidv = Get-PropValue $jobLite @("ProcessId", "processId")
        if ($null -ne $pidv) {
            $haveProcessId = [int]::TryParse(([string]$pidv).Trim(), [ref]$processIdParsed)
        }
    } catch { }

    if ($haveProcessId) {
        try {
            $types1 = Invoke-ConnMethod $conn "GetJobActivityTypes" ([object[]]@([int32]$processIdParsed)) ([type[]]@([int32]))
            [void]$attempts.Add(@{
                method        = "GetJobActivityTypes"
                signature     = "(int processId_)"
                attempted     = $true
                success       = $true
                returned_type = $(if ($types1) { $types1.GetType().FullName } else { $null })
            })
        } catch {
            $em = $_.Exception.Message
            [void]$attempts.Add(@{
                method                     = "GetJobActivityTypes"
                signature                  = "(int processId_)"
                attempted                  = $true
                success                    = $false
                error                      = $em
                windows_dependency_blocker = (Test-WindowsFormsBlocker $em)
            })
        }
    } else {
        [void]$attempts.Add(@{
            method       = "GetJobActivityTypes"
            signature    = "(int processId_)"
            attempted    = $false
            success      = $false
            skip_reason  = "missing_process_id"
        })
    }

    try {
        $st = Invoke-ConnMethod $conn "GetJobActivityStatuses" ([object[]]@()) ([type[]]@())
        [void]$attempts.Add(@{
            method        = "GetJobActivityStatuses"
            attempted     = $true
            success       = $true
            returned_type = $(if ($st) { $st.GetType().FullName } else { $null })
        })
    } catch {
        $em = $_.Exception.Message
        [void]$attempts.Add(@{
            method                     = "GetJobActivityStatuses"
            attempted                  = $true
            success                    = $false
            error                      = $em
            windows_dependency_blocker = (Test-WindowsFormsBlocker $em)
        })
    }

    $getAssigneesMI = $connType.GetMethod("GetAssignees", [System.Reflection.BindingFlags]"Public,Instance", $null, [System.Type]::EmptyTypes, $null)
    if ($getAssigneesMI) {
        try {
            $asg = Invoke-ConnMethod $conn "GetAssignees" ([object[]]@()) ([type[]]@())
            $report.get_assignees_parameterless_signature_used = $true
            $cat = Serialize-GlobalAssigneesCatalog $asg $maxAssigneesSerialize
            $report.get_assignees_catalog = $cat
            [void]$attempts.Add(@{
                method                        = "GetAssignees"
                signature                     = "()"
                attempted                     = $true
                success                       = $true
                parameterless_signature_used  = $true
                overloads                     = $report.get_assignees_method_signatures
                returned_type                 = $(if ($asg) { $asg.GetType().FullName } else { $null })
                get_assignees_total_count     = $cat.total_count
                get_assignees_items_sample    = $cat.items_serialized
                get_assignees_name_term_hits  = $cat.name_term_hits
            })
        } catch {
            $em = $_.Exception.Message
            [void]$attempts.Add(@{
                method                       = "GetAssignees"
                signature                    = "()"
                attempted                    = $true
                success                      = $false
                parameterless_signature_used = $false
                overloads                    = $report.get_assignees_method_signatures
                error                        = $em
                windows_dependency_blocker   = (Test-WindowsFormsBlocker $em)
            })
        }
    } else {
        [void]$attempts.Add(@{
            method       = "GetAssignees"
            signature    = "()"
            attempted    = $false
            success      = $false
            skip_reason  = "method_not_found_with_signature: GetAssignees()"
            overloads    = $report.get_assignees_method_signatures
        })
    }

    $anyAssignees = $false
    $arSeen = $false
    foreach ($m in $attempts) {
        if ($m.activity_samples) {
            foreach ($s in $m.activity_samples) {
                if ($s.assignees_count -gt 0) { $anyAssignees = $true }
                $pd = $s.property_discovery
                if ($pd) {
                    $hints = @($pd.assignment_related_hints)
                    if ($hints.Length -gt 0) { $arSeen = $true }
                    foreach ($pr in @($pd.properties)) {
                        if ($pr.assignment_related_name -and (($null -ne $pr.collection_count -and $pr.collection_count -gt 0) -or ($null -ne $pr.scalar_preview -and $pr.scalar_preview -ne ""))) {
                            $arSeen = $true
                        }
                    }
                }
            }
        }
    }
    $report.assignees_populated_anywhere = $anyAssignees
    $report.assignment_related_property_seen_anywhere = $arSeen

    $blockers = @($attempts | Where-Object { $_.windows_dependency_blocker -eq $true })
    if ($blockers.Count -gt 0) {
        $report.classification = "windows_dependency_blocker"
    } else {
        $report.classification = "ok"
    }
}
catch {
    $report.top_level_error = $_.Exception.Message
    $report.top_level_error_type = $_.Exception.GetType().FullName
    $full = $_.Exception.ToString()
    if ((Test-WindowsFormsBlocker $full) -or (Test-WindowsFormsBlocker $report.top_level_error)) {
        $report.classification = "windows_dependency_blocker"
    } else {
        $report.classification = "probe_error"
    }
}
finally {
    if ($report.connected -and $conn) {
        try { [void](Invoke-ConnMethod $conn "Disconnect" ([object[]]@()) ([type[]]@())) } catch { }
    }
}

Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 22)

$txtLines = New-Object System.Collections.Generic.List[string]
[void]$txtLines.Add("Moraware SDK - activity read probe (Windows .NET Framework host)")
[void]$txtLines.Add("generated_at: $($report.generated_at)")
[void]$txtLines.Add("classification: $($report.classification)")
if ($report.top_level_error) {
    [void]$txtLines.Add("top_level_error: $($report.top_level_error)")
}
[void]$txtLines.Add("system_windows_forms_loaded_before_jobtracker: $($report.system_windows_forms_loaded_before_jobtracker)")
[void]$txtLines.Add("job_tracker_api5_loaded: $($report.job_tracker_api5_loaded)")
[void]$txtLines.Add("assignees_populated_anywhere: $($report.assignees_populated_anywhere)")
[void]$txtLines.Add("assignment_related_property_seen_anywhere: $($report.assignment_related_property_seen_anywhere)")
[void]$txtLines.Add("get_job_activities_exact_signature_used: $($report.get_job_activities_exact_signature_used)")
[void]$txtLines.Add("get_assignees_parameterless_signature_used: $($report.get_assignees_parameterless_signature_used)")
[void]$txtLines.Add(("aggregate_machine_resource_term_hits: titan={0} saber={1} robot={2} saw={3} polish={4}" -f $aggregateHits.titan, $aggregateHits.saber, $aggregateHits.robot, $aggregateHits.saw, $aggregateHits.polish))
if (@($report.get_job_activities_method_signatures).Length -gt 0) {
    [void]$txtLines.Add("GetJobActivities overloads discovered:")
    foreach ($s in @($report.get_job_activities_method_signatures)) {
        [void]$txtLines.Add("  " + $s)
    }
}
if (@($report.get_assignees_method_signatures).Length -gt 0) {
    [void]$txtLines.Add("GetAssignees overloads discovered:")
    foreach ($s in @($report.get_assignees_method_signatures)) {
        [void]$txtLines.Add("  " + $s)
    }
}
if (@($report.get_job_activity_method_signatures).Length -gt 0) {
    [void]$txtLines.Add("GetJobActivity overloads discovered (Connection):")
    foreach ($s in @($report.get_job_activity_method_signatures)) {
        [void]$txtLines.Add("  " + $s)
    }
}
$gas = $report.get_assignees_catalog
if ($gas) {
    $nh = $gas.name_term_hits
    [void]$txtLines.Add(("GetAssignees total_count: {0}" -f $gas.total_count))
    if ($nh) {
        [void]$txtLines.Add(("GetAssignees assignee_name_hits: titan={0} saber={1} robot={2} saw={3} polish={4}" -f $nh.titan, $nh.saber, $nh.robot, $nh.saw, $nh.polish))
    }
}
$gja = $report.get_job_activity_probe
if ($gja) {
    [void]$txtLines.Add("GetJobActivity overloads discovered:")
    foreach ($sig in @($gja.overload_signatures)) {
        [void]$txtLines.Add("  " + $sig)
    }
    if ($gja.winning_signature) {
        [void]$txtLines.Add(("GetJobActivity first_success_signature: {0}" -f $gja.winning_signature))
    }
    $allOk = @($gja.all_success_signatures)
    if ($allOk.Length -gt 0) {
        [void]$txtLines.Add(("GetJobActivity all_success_signatures ({0}):" -f $allOk.Length))
        foreach ($s in $allOk) {
            [void]$txtLines.Add("  " + $s)
        }
    }
}
[void]$txtLines.Add("")
foreach ($m in $attempts) {
    $mn = $m.method
    if (-not $mn) { continue }
    [void]$txtLines.Add(("{0} attempted={1} success={2}" -f $mn, $m.attempted, $m.success))
    if ($m.error) { [void]$txtLines.Add("  error: $($m.error)") }
    if ($m.skip_reason) { [void]$txtLines.Add("  skip: $($m.skip_reason)") }
    if ($mn -eq "GetJobActivity") {
        if ($m.winning_signature) {
            [void]$txtLines.Add(("  winning_signature: {0}" -f $m.winning_signature))
        }
        if ($m.all_success_signatures) {
            $oks = @($m.all_success_signatures)
            if ($oks.Length -gt 0) {
                [void]$txtLines.Add(("  all_success_signatures: {0}" -f (($oks -join " | "))))
            }
        }
    }
    if ($m.activity_samples) {
        foreach ($s in $m.activity_samples) {
            [void]$txtLines.Add(("    activity id={0} type={1} status={2} assignees={3}" -f $s.job_activity_id, $s.activity_type_name, $s.activity_status_name, $s.assignees_count))
            $pd = $s.property_discovery
            if ($pd -and $pd.assignment_related_hints) {
                $hlist = @($pd.assignment_related_hints)
                if ($hlist.Length -gt 0) {
                    [void]$txtLines.Add(("      assignment_related_hints: {0}" -f (($hlist -join "; "))))
                }
            }
        }
    }
    [void]$txtLines.Add("")
}
[void]$txtLines.Add("Full JSON: $OutJson")
Write-Utf8NoBomFile $OutTxt ($txtLines -join "`n")

Write-Host "Wrote: $OutJson"
Write-Host "Wrote: $OutTxt"
exit 0
