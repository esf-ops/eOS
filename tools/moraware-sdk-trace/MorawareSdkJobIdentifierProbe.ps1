#Requires -Version 5.1
<#
.SYNOPSIS
  Windows-only Moraware SDK read-only probe: discover Connection job-listing APIs and export sanitized job identifiers.

  Env: MORAWARE_URL or MORAWARE_API_URL; MORAWARE_USERNAME; MORAWARE_PASSWORD (never logged).
  Optional: MORAWARE_SDK_JOBS_PAGE_SIZE (default 100), MORAWARE_SDK_JOBS_MAX_PAGES (default 5),
  MORAWARE_SDK_JOBS_MAX_TOTAL (default 500), MORAWARE_SDK_JOBS_EXPORT_ALL=1 to relax default caps.
  Optional: MORAWARE_SDK_PROCESS_IDS (comma-separated int process ids; if unset, first N processes are used).
  Optional: MORAWARE_SDK_MAX_PROCESSES (default 5; larger when MORAWARE_SDK_JOBS_EXPORT_ALL=1).
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

function Test-ExportAllJobs {
    $v = [Environment]::GetEnvironmentVariable("MORAWARE_SDK_JOBS_EXPORT_ALL")
    return (-not [string]::IsNullOrWhiteSpace($v)) -and ($v.Trim() -eq "1")
}

function Read-OptionalProcessIdsFromEnv {
    $raw = [Environment]::GetEnvironmentVariable("MORAWARE_SDK_PROCESS_IDS")
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    $ids = New-Object System.Collections.ArrayList
    foreach ($part in $raw.Split(@(','), [StringSplitOptions]::RemoveEmptyEntries)) {
        $t = $part.Trim()
        if ([string]::IsNullOrWhiteSpace($t)) { continue }
        $iv = 0
        if ([int32]::TryParse($t, [ref]$iv)) { [void]$ids.Add($iv) }
    }
    if ($ids.Count -eq 0) { return $null }
    $arr = New-Object 'int32[]' $ids.Count
    for ($i = 0; $i -lt $ids.Count; $i++) {
        $arr[$i] = [int32]$ids[$i]
    }
    return ,$arr
}

function Read-MaxProcessesToProbe {
    param([bool]$ExportAll)
    if ($ExportAll) {
        return Read-IntEnv "MORAWARE_SDK_MAX_PROCESSES" 10000
    }
    return Read-IntEnv "MORAWARE_SDK_MAX_PROCESSES" 5
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

function Format-MethodSignatureFromMethod {
    param([System.Reflection.MethodInfo]$Method)
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($p in $Method.GetParameters()) {
        [void]$parts.Add($p.ParameterType.FullName + " " + $p.Name)
    }
    $retName = ""
    if ($Method.ReturnType) { $retName = $Method.ReturnType.FullName }
    return $Method.Name + "(" + ($parts -join ", ") + ") -> " + $retName
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

function Get-ConnectionMethodsMatchingDiscoveryFilter {
    param([type]$ConnType)
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    $rx = [regex]::new("GetJob|GetJobs|JobFilter|Paging|Process|Status", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $sigs = New-Object System.Collections.Generic.List[string]
    foreach ($m in $ConnType.GetMethods($flags)) {
        if (-not $m.IsPublic) { continue }
        if ($m.IsSpecialName) { continue }
        if (-not $rx.IsMatch($m.Name)) { continue }
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

function Test-PagingLikePropertyName {
    param([string]$PropName)
    if ([string]::IsNullOrEmpty($PropName)) { return $null }
    $pl = $PropName.ToLowerInvariant()
    if ($pl -match "pagesize|maxrows|maximumrows|rowcount|take|top") { return "page_size_like" }
    if ($pl -match "^(page|pagenumber|pageindex|currentpage)$") { return "page_number_like" }
    if ($pl -match "offset|skip|startrow|firstrow|rowoffset|startindex|start") { return "offset_like" }
    if ($pl -match "limit|maxresults|batch") { return "limit_like" }
    return $null
}

function New-SafeMorawareInstance {
    param([type]$TargetType)
    if (-not $TargetType) { return $null }
    $ctor0 = $TargetType.GetConstructor([System.Type]::EmptyTypes)
    if ($ctor0) {
        try { return $ctor0.Invoke(@()) } catch { return $null }
    }
    try { return [Activator]::CreateInstance($TargetType) } catch { return $null }
}

function Get-TypeDeepIntrospection {
    param($Assembly, [string]$TypeName, [bool]$IncludePagingHints)
    $empty = [ordered]@{
        type_name                         = $TypeName
        found                             = $false
        constructors                      = @()
        public_properties_summary         = @()
        settable_public_properties        = @()
        defaults_after_parameterless_ctor = @()
        instance_creation                 = @{ ok = $false; error = $null }
        paging_like_hints                 = $null
    }
    $t = $Assembly.GetType($TypeName, $false, $false)
    if (-not $t) { return $empty }

    $ctors = New-Object System.Collections.Generic.List[string]
    foreach ($c in $t.GetConstructors([System.Reflection.BindingFlags]"Public,Instance")) {
        $ps = $c.GetParameters()
        $parts = @()
        foreach ($p in $ps) { $parts += $p.ParameterType.FullName + " " + $p.Name }
        [void]$ctors.Add($t.Name + "(" + ($parts -join ", ") + ")")
    }

    $propsSummary = New-Object System.Collections.Generic.List[string]
    $settableDetail = New-Object System.Collections.ArrayList
    $pagingHints = [ordered]@{
        has_page_size_like     = $false
        has_page_number_like   = $false
        has_offset_like        = $false
        has_limit_like         = $false
    }

    foreach ($p in $t.GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        $rw = "get"
        if ($p.CanWrite) { $rw = "get,set" }
        [void]$propsSummary.Add($p.Name + " : " + $p.PropertyType.FullName + " (" + $rw + ")")
        if ($p.CanWrite) {
            [void]$settableDetail.Add([ordered]@{
                name             = $p.Name
                property_type    = $p.PropertyType.FullName
                has_public_setter = $true
            })
        }
        if ($IncludePagingHints) {
            $hint = Test-PagingLikePropertyName $p.Name
            if ($hint -eq "page_size_like") { $pagingHints["has_page_size_like"] = $true }
            elseif ($hint -eq "page_number_like") { $pagingHints["has_page_number_like"] = $true }
            elseif ($hint -eq "offset_like") { $pagingHints["has_offset_like"] = $true }
            elseif ($hint -eq "limit_like") { $pagingHints["has_limit_like"] = $true }
        }
    }

    $defaults = New-Object System.Collections.ArrayList
    $inst = New-SafeMorawareInstance $t
    if ($null -ne $inst) {
        $empty["instance_creation"]["ok"] = $true
        foreach ($p in $t.GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
            if (-not $p.CanRead) { continue }
            if (Test-BlockedPreviewName $p.Name) { continue }
            try {
                $val = $p.GetValue($inst, $null)
                $entry = [ordered]@{ name = $p.Name; property_type = $p.PropertyType.FullName }
                if ($null -eq $val) {
                    $entry.value_kind = "null"
                }
                elseif ($val -is [string]) {
                    $entry.value_kind = "string"
                    $entry.string_length = $val.Length
                }
                elseif ($val -is [ValueType] -or $val -is [DateTime]) {
                    $entry.value_kind = "scalar"
                    $entry.preview = (Format-Scalar $val)
                }
                else {
                    continue
                }
                [void]$defaults.Add($entry)
            } catch { }
        }
    }
    else {
        $empty["instance_creation"]["error"] = "parameterless_ctor_missing_or_invoke_failed"
    }

    $hintsOut = $null
    if ($IncludePagingHints) { $hintsOut = $pagingHints }

    return [ordered]@{
        type_name                         = $TypeName
        found                             = $true
        full_name                         = $t.FullName
        constructors                      = @($ctors)
        public_properties_summary         = @($propsSummary)
        settable_public_properties        = @($settableDetail.ToArray())
        defaults_after_parameterless_ctor = @($defaults.ToArray())
        instance_creation                 = $empty["instance_creation"]
        paging_like_hints                 = $hintsOut
    }
}

function Find-ConnectionGetJobsMethod {
    param([type]$ConnType, [type]$JobFilterType, [type]$PagingType)
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    if (-not $JobFilterType -or -not $PagingType) { return $null }
    foreach ($m in $ConnType.GetMethods($flags)) {
        if ($m.Name -ne "GetJobs") { continue }
        if ($m.IsGenericMethod) { continue }
        $ps = $m.GetParameters()
        if ($ps.Length -ne 4) { continue }
        if ($ps[0].ParameterType -ne $JobFilterType) { continue }
        if ($ps[1].ParameterType -ne $PagingType) { continue }
        if ($ps[2].ParameterType -ne [bool]) { continue }
        if ($ps[3].ParameterType -ne [bool]) { continue }
        return $m
    }
    return $null
}

function Find-PublicConstructorExactTypes {
    param([type]$TargetType, [type[]]$ParameterTypes)
    if (-not $TargetType) { return $null }
    $types = New-TypedTypeArray $ParameterTypes
    if ($null -eq $types) { $types = [System.Type]::EmptyTypes }
    try {
        return $TargetType.GetConstructor($types)
    }
    catch {
        return $null
    }
}

function New-MorawareJobFilterForProcessId {
    param([type]$JobFilterType, [int32]$ProcessId)
    $ctor = Find-PublicConstructorExactTypes $JobFilterType @([int32])
    if (-not $ctor) { return $null }
    try {
        return $ctor.Invoke(@([int32]$ProcessId))
    }
    catch {
        return $null
    }
}

function New-MorawarePagingOptionsThreeArg {
    param([type]$PagingType, [int32]$FirstRecord, [int32]$PageSizeArg, [bool]$CalculateTotalRecords)
    $ctor = Find-PublicConstructorExactTypes $PagingType @([int32], [int32], [bool])
    if (-not $ctor) { return $null }
    try {
        return $ctor.Invoke(@([int32]$FirstRecord, [int32]$PageSizeArg, [bool]$CalculateTotalRecords))
    }
    catch {
        return $null
    }
}

function Read-PagingTotalRecordsAfterCall {
    param($PagingObj)
    if ($null -eq $PagingObj) { return $null }
    foreach ($nm in @("TotalRecords", "TotalRowCount", "TotalCount", "RecordCount", "RowCount")) {
        $prop = $PagingObj.GetType().GetProperty($nm, [System.Reflection.BindingFlags]"Public,Instance")
        if (-not $prop -or -not $prop.CanRead) { continue }
        try {
            $v = $prop.GetValue($PagingObj, $null)
            if ($null -eq $v) { return "null" }
            return (Format-Scalar $v)
        }
        catch { }
    }
    return $null
}

function New-SanitizedProcessRow {
    param($Process)
    if ($null -eq $Process) { return $null }
    $rawId = Get-PropValue $Process @("ProcessId", "Id", "ProcessID")
    if ($null -eq $rawId) { return $null }
    $pidInt = [int32]0
    if (-not [int32]::TryParse([string]$rawId, [ref]$pidInt)) { return $null }
    return [ordered]@{
        process_id   = ([string][int32]$pidInt)
        process_name = (Format-Scalar (Get-PropValue $Process @("ProcessName", "Name", "Title")))
        active       = (Format-Scalar (Get-PropValue $Process @("IsActive", "Active", "Enabled")))
        status       = (Format-Scalar (Get-PropValue $Process @("Status", "State", "ProcessStatus")))
    }
}

function Get-ProcessIdIntFromSanitizedRow {
    param($Row)
    if ($null -eq $Row) { return $null }
    $pidInt = [int32]0
    if (-not [int32]::TryParse([string]$Row["process_id"], [ref]$pidInt)) { return $null }
    return $pidInt
}

function Apply-PagingHeuristics {
    param($PagingObj, [int]$PageZero, [int]$PageSize)
    if ($null -eq $PagingObj) { return $false }
    $t = $PagingObj.GetType()
    $anySet = $false
    foreach ($prop in $t.GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if (-not $prop.CanWrite) { continue }
        $pl = $prop.Name.ToLowerInvariant()
        try {
            if ($prop.PropertyType -eq [int32] -or $prop.PropertyType -eq [int64]) {
                $nv = 0
                if ($pl -match "pagesize|maxrows|maximumrows|rowcount|batchsize|take|top") {
                    if ($prop.PropertyType -eq [int64]) { $nv = [int64]$PageSize } else { $nv = [int32]$PageSize }
                    $prop.SetValue($PagingObj, $nv, $null)
                    $anySet = $true
                }
                elseif ($pl -match "offset|skip|startrow|firstrow|rowoffset|startindex|start") {
                    $off = [int64]$PageZero * [int64]$PageSize
                    if ($prop.PropertyType -eq [int64]) { $nv = $off } else { $nv = [int32][Math]::Min([int32]::MaxValue, $off) }
                    $prop.SetValue($PagingObj, $nv, $null)
                    $anySet = $true
                }
                elseif ($pl -match "^(pagenumber|page|pageindex|currentpage)$") {
                    if ($prop.PropertyType -eq [int64]) { $nv = [int64]$PageZero } else { $nv = [int32]$PageZero }
                    $prop.SetValue($PagingObj, $nv, $null)
                    $anySet = $true
                }
            }
        } catch { }
    }
    return $anySet
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
            if ($n -gt 2000000) { break }
        }
    }
    return $n
}

function New-SanitizedJobRow {
    param($Job, [int]$MaxScalarFields, $ProcessContext = $null)
    if ($null -eq $Job) { return $null }
    $jobId = Format-Scalar (Get-PropValue $Job @("JobId", "Id", "JobID"))
    $jobName = Format-Scalar (Get-PropValue $Job @("JobName", "Name", "Title"))
    $statusVal = Format-Scalar (Get-PropValue $Job @("Status", "JobStatus"))
    $statusNameVal = Format-Scalar (Get-PropValue $Job @("StatusName", "DisplayStatus", "JobStatusName"))
    $snOut = $statusNameVal
    if ([string]::IsNullOrEmpty($snOut)) { $snOut = $statusVal }
    $row = [ordered]@{
        job_id                = $jobId
        job_name              = $jobName
        account_id            = Format-Scalar (Get-PropValue $Job @("AccountId", "AccountID", "accountId"))
        account_name          = Format-Scalar (Get-PropValue $Job @("AccountName", "CustomerName", "Account"))
        process_id            = Format-Scalar (Get-PropValue $Job @("ProcessId", "ProcessID"))
        process_name          = Format-Scalar (Get-PropValue $Job @("ProcessName", "Process"))
        status                = $statusVal
        status_name           = $snOut
        created               = Format-Scalar (Get-PropValue $Job @("CreationDate", "CreatedDate", "DateCreated", "Created"))
        modified              = Format-Scalar (Get-PropValue $Job @("ModifiedDate", "LastModified", "Updated"))
        start_date            = Format-Scalar (Get-PropValue $Job @("StartDate", "JobStartDate"))
        install_date          = Format-Scalar (Get-PropValue $Job @("InstallDate", "InstallationDate"))
        scheduled_date        = Format-Scalar (Get-PropValue $Job @("ScheduledDate", "ScheduleDate"))
        completed_date        = Format-Scalar (Get-PropValue $Job @("CompletedDate", "CompletionDate"))
        operational_scalars   = @()
    }
    if ($null -ne $ProcessContext) {
        $cpid = [string]$ProcessContext["process_id"]
        $cpnm = [string]$ProcessContext["process_name"]
        if (-not [string]::IsNullOrWhiteSpace($cpid)) {
            if ([string]::IsNullOrWhiteSpace([string]$row["process_id"])) { $row["process_id"] = $cpid }
        }
        if (-not [string]::IsNullOrWhiteSpace($cpnm)) {
            if ([string]::IsNullOrWhiteSpace([string]$row["process_name"])) { $row["process_name"] = $cpnm }
        }
    }
    $n = 0
    $os = New-Object System.Collections.ArrayList
    foreach ($prop in $Job.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if (-not $prop.CanRead) { continue }
        if ($n -ge $MaxScalarFields) { break }
        $nm = $prop.Name
        if (Test-BlockedPreviewName $nm) { continue }
        $pt = $prop.PropertyType
        if ($pt.IsClass -and $pt -ne [string]) { continue }
        if ($pt.IsInterface) { continue }
        if ($pt.IsGenericType) { continue }
        try {
            $val = $prop.GetValue($Job, $null)
            $entry = @{ name = $nm; property_type = $pt.FullName }
            if ($null -eq $val) {
                $entry.value_kind = "null"
            }
            elseif ($val -is [string]) {
                $entry.value_kind = "string"
                $entry.string_length = $val.Length
                if ($val.Length -le 80) {
                    $entry.preview = $val
                }
            }
            elseif ($val -is [ValueType] -or $val -is [DateTime]) {
                $entry.value_kind = "scalar"
                $entry.preview = (Format-Scalar $val)
            }
            else {
                continue
            }
            [void]$os.Add($entry)
            $n++
        } catch { }
    }
    $row["operational_scalars"] = @($os.ToArray())
    return $row
}

function Escape-CsvField {
    param($Value)
    if ($null -eq $Value) { return '""' }
    $s = ""
    if ($Value -is [string]) {
        $s = $Value
    }
    else {
        $s = Format-Scalar $Value
    }
    if ($null -eq $s) { $s = "" }
    $s = [string]$s
    $s = $s -replace "`r`n", " "
    $s = $s -replace "`n", " "
    $s = $s -replace "`r", " "
    $s = $s -replace '"', '""'
    return '"' + $s + '"'
}

function Get-JobIdentifierProbeCsvExportColumnDefs {
    return @(
        @{ header = "job_id";          source = "job_id" }
        @{ header = "job_name";        source = "job_name" }
        @{ header = "account_id";    source = "account_id" }
        @{ header = "account_name";  source = "account_name" }
        @{ header = "process_id";    source = "process_id" }
        @{ header = "process_name";  source = "process_name" }
        @{ header = "status";        source = "status" }
        @{ header = "status_name";   source = "status_name" }
        @{ header = "created_at";    source = "created" }
        @{ header = "modified_at";   source = "modified" }
        @{ header = "scheduled_at";  source = "scheduled_date" }
        @{ header = "completed_at";  source = "completed_date" }
        @{ header = "install_at";    source = "install_date" }
    )
}

function Get-JobIdentifierProbeCsvHeaderLine {
    $defs = Get-JobIdentifierProbeCsvExportColumnDefs
    $names = New-Object System.Collections.ArrayList
    foreach ($d in $defs) {
        [void]$names.Add($d.header)
    }
    return ($names.ToArray() -join ",")
}

function Get-JobRowDictionaryValueSafe {
    param($Row, [string]$Key)
    if ($null -eq $Row -or [string]::IsNullOrEmpty($Key)) { return $null }
    try {
        if ($Row -is [System.Collections.IDictionary]) {
            if ($Row.Keys -contains $Key) { return $Row[$Key] }
            return $null
        }
        $prop = $Row.PSObject.Properties[$Key]
        if ($null -ne $prop) {
            return $prop.Value
        }
    }
    catch { }
    return $null
}

function Build-JobsExportCsv {
    param($JobRows)
    $defs = Get-JobIdentifierProbeCsvExportColumnDefs
    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add((Get-JobIdentifierProbeCsvHeaderLine))
    $dataRows = 0
    foreach ($r in $JobRows) {
        if ($null -eq $r) { continue }
        $cells = New-Object System.Collections.ArrayList
        foreach ($d in $defs) {
            $raw = Get-JobRowDictionaryValueSafe $r $d.source
            [void]$cells.Add((Escape-CsvField $raw))
        }
        [void]$lines.Add(($cells.ToArray() -join ","))
        $dataRows++
    }
    return @{ text = ($lines -join "`n"); data_rows = $dataRows }
}

function Add-DeepTypeTxtSection {
    param($LinesList, [string]$Title, $DeepInfo)
    [void]$LinesList.Add($Title)
    if ($null -eq $DeepInfo -or -not $DeepInfo["found"]) {
        [void]$LinesList.Add("  (type not found)")
        [void]$LinesList.Add("")
        return
    }
    [void]$LinesList.Add(("  full_name: {0}" -f $DeepInfo["full_name"]))
    $ic = $DeepInfo["instance_creation"]
    [void]$LinesList.Add(("  instance_creation_ok: {0}" -f $ic["ok"]))
    if ($ic["error"]) {
        [void]$LinesList.Add(("  instance_creation_error: {0}" -f $ic["error"]))
    }
    [void]$LinesList.Add("  constructors:")
    foreach ($c in @($DeepInfo["constructors"])) {
        [void]$LinesList.Add("    " + $c)
    }
    [void]$LinesList.Add("  settable_public_properties (name : type):")
    foreach ($s in @($DeepInfo["settable_public_properties"])) {
        [void]$LinesList.Add(("    {0} : {1}" -f $s["name"], $s["property_type"]))
    }
    $ph = $DeepInfo["paging_like_hints"]
    if ($ph) {
        [void]$LinesList.Add(("  paging_like_hints: page_size_like={0} page_number_like={1} offset_like={2} limit_like={3}" -f
                $ph["has_page_size_like"], $ph["has_page_number_like"], $ph["has_offset_like"], $ph["has_limit_like"]))
    }
    [void]$LinesList.Add("  defaults_after_parameterless_ctor (sample up to 15):")
    $defs = @($DeepInfo["defaults_after_parameterless_ctor"])
    $nD = [Math]::Min(15, $defs.Length)
    for ($d = 0; $d -lt $nD; $d++) {
        $e = $defs[$d]
        $line = "    " + $e["name"] + " kind=" + $e["value_kind"]
        if ($null -ne $e["string_length"]) { $line = $line + " len=" + $e["string_length"] }
        if ($e["preview"]) { $line = $line + " preview=" + $e["preview"] }
        [void]$LinesList.Add($line)
    }
    [void]$LinesList.Add("")
}

# --- start ---
$diag = @{
    ps_edition  = $PSVersionTable.PSEdition
    ps_version  = $PSVersionTable.PSVersion.ToString()
    clr_version = [Environment]::Version.ToString()
}

if ($PSVersionTable.PSEdition -eq "Core") {
    Write-Host "ERROR: Use Windows PowerShell 5.1 (powershell.exe)." -ForegroundColor Red
    exit 2
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DllPath = Join-Path $ScriptDir "lib\JobTrackerAPI5.dll"
$OutJson = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-job-identifiers.json"
$OutTxt  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-job-identifiers.txt"
$OutCsv  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-job-identifiers.csv"

$url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_URL")).Trim()
if (-not $url) { $url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_API_URL")).Trim() }
$user = [string]([Environment]::GetEnvironmentVariable("MORAWARE_USERNAME")).Trim()
$pass = [string]([Environment]::GetEnvironmentVariable("MORAWARE_PASSWORD")).Trim()

$apiHost = $null
try { if ($url) { $apiHost = ([Uri]$url).Host } } catch { $apiHost = $null }

$pageSize = Read-IntEnv "MORAWARE_SDK_JOBS_PAGE_SIZE" 100
$exportAll = Test-ExportAllJobs
$maxPages = if ($exportAll) { Read-IntEnv "MORAWARE_SDK_JOBS_MAX_PAGES" 10000 } else { Read-IntEnv "MORAWARE_SDK_JOBS_MAX_PAGES" 5 }
$maxTotal = if ($exportAll) { Read-IntEnv "MORAWARE_SDK_JOBS_MAX_TOTAL" 100000 } else { Read-IntEnv "MORAWARE_SDK_JOBS_MAX_TOTAL" 500 }

$report = [ordered]@{
    generated_at                              = [DateTime]::UtcNow.ToString("o")
    source                                    = "MorawareSdkJobIdentifierProbe.ps1"
    classification                            = $null
    top_level_error                           = $null
    top_level_error_type                      = $null
    diagnostics                               = $diag
    credentials                               = @{
        api_url_configured  = (-not [string]::IsNullOrWhiteSpace($url))
        api_host            = $apiHost
        username_configured = (-not [string]::IsNullOrWhiteSpace($user))
        password_configured = (-not [string]::IsNullOrWhiteSpace($pass))
    }
    paging                                    = @{
        page_size              = $pageSize
        max_pages              = $maxPages
        max_total_jobs         = $maxTotal
        export_all_flag        = $exportAll
    }
    get_processes_method_signatures           = @()
    connection_methods_matching_discovery_filter = @()
    get_jobs_method_signatures                = @()
    get_job_method_signatures                 = @()
    type_introspection                        = @{
        JobFilter      = $null
        PagingOptions  = $null
        Job            = $null
    }
    processes                                 = @()
    process_count                             = 0
    processes_attempted                       = 0
    max_processes_config                      = 0
    process_ids_env                           = $null
    process_ids_env_not_found                 = @()
    job_listing_method_used                   = $null
    get_jobs_invoke_parameter_count           = $null
    first_record_base_used                    = $null
    listing_attempts                          = @()
    pages_attempted                           = 0
    jobs_returned_total                       = 0
    paging_stop_reason                        = $null
    paging_appears_reliable                   = $false
    jobs                                      = @()
    recommended_next_probe                    = $null
}

if (-not $report["credentials"]["api_url_configured"] -or -not $report["credentials"]["username_configured"] -or -not $report["credentials"]["password_configured"]) {
    $report["classification"] = "missing_credentials"
    $report["top_level_error"] = "Missing MORAWARE_URL or MORAWARE_API_URL, and/or MORAWARE_USERNAME / MORAWARE_PASSWORD."
    $report["recommended_next_probe"] = "Set credentials in the environment and re-run from the repository root."
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 18)
    $txt = @(
        "Moraware SDK - job identifier probe",
        "classification: missing_credentials",
        "Full JSON: $OutJson"
    ) -join "`n"
    Write-Utf8NoBomFile $OutTxt $txt
    Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
    Write-Host "Wrote: $OutJson"
    exit 0
}

if (-not (Test-Path -LiteralPath $DllPath)) {
    $report["classification"] = "dll_missing"
    $report["top_level_error"] = "JobTrackerAPI5.dll not found."
    $report["recommended_next_probe"] = "Copy JobTrackerAPI5.dll into tools/moraware-sdk-trace/lib/ and re-run."
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 12)
    Write-Utf8NoBomFile $OutTxt ("classification: dll_missing`nFull JSON: $OutJson")
    Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
    Write-Host "Wrote: $OutJson"
    exit 0
}

try {
    Add-Type -AssemblyName System.Windows.Forms
} catch {
    $report["classification"] = "system_windows_forms_load_failed"
    $report["top_level_error"] = $_.Exception.Message
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 12)
    Write-Utf8NoBomFile $OutTxt ("classification: system_windows_forms_load_failed`nFull JSON: $OutJson")
    Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$asm = $null
try {
    $asm = [System.Reflection.Assembly]::LoadFrom($DllPath)
} catch {
    $report["classification"] = "job_tracker_load_failed"
    $report["top_level_error"] = $_.Exception.Message
    if (Test-WindowsFormsBlocker $report["top_level_error"]) { $report["classification"] = "windows_dependency_blocker" }
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 12)
    Write-Utf8NoBomFile $OutTxt ("classification: $($report['classification'])`nFull JSON: $OutJson")
    Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$connType = $asm.GetType("Moraware.JobTrackerAPI5.Connection", $false, $false)
if (-not $connType) {
    $report["classification"] = "connection_type_not_found"
    $report["top_level_error"] = "Moraware.JobTrackerAPI5.Connection not found."
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 12)
    Write-Utf8NoBomFile $OutTxt ("classification: connection_type_not_found`nFull JSON: $OutJson")
    Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$tracerType = $asm.GetType("Moraware.JobTrackerAPI5.DevelopmentAssistance.SimpleConsoleCommandTracer", $false, $false)
if (-not $tracerType) {
    $report["classification"] = "command_tracer_type_not_found"
    $report["top_level_error"] = "SimpleConsoleCommandTracer not found."
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("classification: command_tracer_type_not_found`nFull JSON: $OutJson")
    Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
    Write-Host "Wrote: $OutJson"
    exit 0
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
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("classification: connection_constructor_not_found`nFull JSON: $OutJson")
    Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$appName = "eOS Moraware Job Identifier Probe"
$conn = $null
try {
    $conn = $ctor.Invoke(@($url, $user, $pass, $tracer, [bool]$false, [bool]$false, $appName))
} catch {
    $report["classification"] = "connection_constructor_invoke_failed"
    $report["top_level_error"] = $_.Exception.Message
    if (Test-WindowsFormsBlocker $report["top_level_error"]) { $report["classification"] = "windows_dependency_blocker" }
    Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 14)
    Write-Utf8NoBomFile $OutTxt ("classification: $($report['classification'])`nFull JSON: $OutJson")
    Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
    Write-Host "Wrote: $OutJson"
    exit 0
}

$connected = $false
$allJobs = New-Object System.Collections.Generic.List[object]
$listingOk = $false
$listingAttemptsList = New-Object System.Collections.ArrayList

try {
    $report["connection_methods_matching_discovery_filter"] = @(Get-ConnectionMethodsMatchingDiscoveryFilter $connType)
    $report["get_processes_method_signatures"] = @(Get-ConnMethodOverloadSignatures $connType "GetProcesses")
    $report["get_jobs_method_signatures"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobs")
    $report["get_job_method_signatures"] = @(Get-ConnMethodOverloadSignatures $connType "GetJob")

    $ti = $report["type_introspection"]
    $ti["JobFilter"] = Get-TypeDeepIntrospection $asm "Moraware.JobTrackerAPI5.JobFilter" $true
    $ti["PagingOptions"] = Get-TypeDeepIntrospection $asm "Moraware.JobTrackerAPI5.PagingOptions" $true
    $ti["Job"] = Get-TypeDeepIntrospection $asm "Moraware.JobTrackerAPI5.Job" $false

    try {
        [void](Invoke-ConnMethod $conn "Connect" ([object[]]@()) ([type[]]@()))
        $connected = $true

        $jobFilterType = $asm.GetType("Moraware.JobTrackerAPI5.JobFilter", $false, $false)
        $pagingType = $asm.GetType("Moraware.JobTrackerAPI5.PagingOptions", $false, $false)

        $procRaw = Invoke-ConnMethod $conn "GetProcesses" ([object[]]@()) ([type[]]@())
        $sanitizedProcesses = New-Object System.Collections.ArrayList
        if ($null -ne $procRaw) {
            foreach ($p in $procRaw) {
                $sr = New-SanitizedProcessRow $p
                if ($null -ne $sr) { [void]$sanitizedProcesses.Add($sr) }
            }
        }
        $report["processes"] = @($sanitizedProcesses.ToArray())
        $report["process_count"] = $sanitizedProcesses.Count

        $maxProcProbe = Read-MaxProcessesToProbe $exportAll
        $report["max_processes_config"] = $maxProcProbe

        $envPidFilter = Read-OptionalProcessIdsFromEnv
        $selectedList = New-Object System.Collections.ArrayList
        $notFoundEnv = New-Object System.Collections.ArrayList

        if ($null -ne $envPidFilter -and $envPidFilter.Length -gt 0) {
            $pidStrList = New-Object System.Collections.ArrayList
            foreach ($ev in $envPidFilter) {
                [void]$pidStrList.Add([string][int32]$ev)
            }
            $report["process_ids_env"] = @($pidStrList.ToArray())

            $byEnvId = @{}
            foreach ($sp in $sanitizedProcesses) {
                $ik = Get-ProcessIdIntFromSanitizedRow $sp
                if ($null -ne $ik) { $byEnvId[[int32]$ik] = $sp }
            }
            foreach ($want in $envPidFilter) {
                $wk = [int32]$want
                if ($byEnvId.ContainsKey($wk)) {
                    [void]$selectedList.Add($byEnvId[$wk])
                }
                else {
                    [void]$notFoundEnv.Add($wk)
                }
            }
        }
        else {
            $nTake = [Math]::Min([int]$maxProcProbe, [int]$sanitizedProcesses.Count)
            for ($sx = 0; $sx -lt $nTake; $sx++) {
                [void]$selectedList.Add($sanitizedProcesses[$sx])
            }
        }

        $nfArr = New-Object System.Collections.ArrayList
        foreach ($nf in $notFoundEnv) {
            [void]$nfArr.Add([string][int32]$nf)
        }
        $report["process_ids_env_not_found"] = @($nfArr.ToArray())
        $report["processes_attempted"] = $selectedList.Count

        $getJobsMethod = Find-ConnectionGetJobsMethod $connType $jobFilterType $pagingType
        $jfCtor = Find-PublicConstructorExactTypes $jobFilterType @([int32])
        $pgCtor = Find-PublicConstructorExactTypes $pagingType @([int32], [int32], [bool])

        if (-not $getJobsMethod -or -not $jobFilterType -or -not $pagingType) {
            $report["classification"] = "getjobs_four_arg_overload_not_found"
            $report["paging_stop_reason"] = "getjobs_four_arg_overload_not_found"
            $report["recommended_next_probe"] = "Need Connection.GetJobs(JobFilter, PagingOptions, bool, bool) for this probe."
        }
        elseif ($sanitizedProcesses.Count -eq 0) {
            $report["classification"] = "get_processes_empty"
            $report["paging_stop_reason"] = "get_processes_returned_empty"
            $report["recommended_next_probe"] = "GetProcesses returned no rows; confirm credentials and API access."
        }
        elseif ($selectedList.Count -eq 0) {
            $report["classification"] = "no_processes_selected"
            $report["paging_stop_reason"] = "no_processes_selected"
            $report["recommended_next_probe"] = "Adjust MORAWARE_SDK_PROCESS_IDS or MORAWARE_SDK_MAX_PROCESSES; selection yielded no processes."
        }
        elseif (-not $jfCtor) {
            throw "job_filter_ctor_int32_not_found"
        }
        elseif (-not $pgCtor) {
            throw "paging_options_ctor_int_int_bool_not_found"
        }
        else {
            $report["job_listing_method_used"] = (Format-MethodSignatureFromMethod $getJobsMethod)
            $report["get_jobs_invoke_parameter_count"] = 4

            $firstRecordBaseUsed = $null
            $pagingStopReason = $null
            $pagingReliable = $false

            :recBaseOuter foreach ($recBase in @(0, 1)) {
                if ($recBase -eq 1 -and $allJobs.Count -gt 0) { break recBaseOuter }

                $roundPageBudget = 0

                foreach ($procRow in $selectedList) {
                    if ($allJobs.Count -ge $maxTotal) { break }
                    if ($roundPageBudget -ge $maxPages) { break }

                    $pidVal = Get-ProcessIdIntFromSanitizedRow $procRow
                    if ($null -eq $pidVal) { continue }

                    $procCtx = [ordered]@{
                        process_id = [string]$procRow["process_id"]
                        process_name = [string]$procRow["process_name"]
                    }

                    $jobFilterObj = New-MorawareJobFilterForProcessId $jobFilterType $pidVal
                    if ($null -eq $jobFilterObj) {
                        [void]$listingAttemptsList.Add(@{
                            first_record_base = $recBase
                            process_id        = [string]$procRow["process_id"]
                            page_index        = -1
                            first_record      = -1
                            success           = $false
                            rows_this_page    = 0
                            total_records_after_call = $null
                            error             = "job_filter_ctor_invoke_failed"
                        })
                        continue
                    }

                    $pageIdx = 0
                    while ($roundPageBudget -lt $maxPages -and $allJobs.Count -lt $maxTotal) {
                        $firstRec = [int32]($recBase + ($pageIdx * $pageSize))
                        $pagingObj = New-MorawarePagingOptionsThreeArg $pagingType $firstRec $pageSize $true
                        if ($null -eq $pagingObj) {
                            [void]$listingAttemptsList.Add(@{
                                first_record_base = $recBase
                                process_id        = [string]$procRow["process_id"]
                                page_index        = $pageIdx
                                first_record      = $firstRec
                                success           = $false
                                rows_this_page    = 0
                                total_records_after_call = $null
                                error             = "paging_options_ctor_invoke_failed"
                            })
                            break
                        }

                        $pageReturned = 0
                        $totRecStr = $null
                        try {
                            $list = Invoke-ConnMethod $conn "GetJobs" ([object[]]@($jobFilterObj, $pagingObj, [bool]$false, [bool]$false)) ([type[]]@($jobFilterType, $pagingType, [bool], [bool]))
                            $pageReturned = Get-EnumerableCount $list
                            $totRecStr = Read-PagingTotalRecordsAfterCall $pagingObj
                            foreach ($job in $list) {
                                if ($allJobs.Count -ge $maxTotal) { break }
                                if ($null -eq $job) { continue }
                                $row = New-SanitizedJobRow $job 30 $procCtx
                                if ($null -ne $row) { [void]$allJobs.Add($row) }
                            }
                        }
                        catch {
                            $em = $_.Exception.Message
                            if ($null -ne $_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
                            [void]$listingAttemptsList.Add(@{
                                first_record_base = $recBase
                                process_id        = [string]$procRow["process_id"]
                                page_index        = $pageIdx
                                first_record      = $firstRec
                                success           = $false
                                rows_this_page    = 0
                                total_records_after_call = $null
                                error             = $em
                            })
                            $pagingStopReason = "getjobs_exception"
                            $pagingReliable = $false
                            break recBaseOuter
                        }

                        [void]$listingAttemptsList.Add(@{
                            first_record_base = $recBase
                            process_id        = [string]$procRow["process_id"]
                            page_index        = $pageIdx
                            first_record      = $firstRec
                            success           = $true
                            rows_this_page    = $pageReturned
                            total_records_after_call = $totRecStr
                            error             = $null
                        })
                        $roundPageBudget++
                        $report["pages_attempted"] = [int]$report["pages_attempted"] + 1

                        if ($pageReturned -eq 0) {
                            $pagingStopReason = "empty_page"
                            $pagingReliable = $true
                            break
                        }
                        if ($pageReturned -lt $pageSize) {
                            $pagingStopReason = "partial_last_page"
                            $pagingReliable = $true
                            break
                        }

                        $pageIdx++
                    }

                    if ($roundPageBudget -ge $maxPages) { break }
                    if ($allJobs.Count -ge $maxTotal) { break }
                }

                if ($allJobs.Count -gt 0) {
                    $firstRecordBaseUsed = $recBase
                    break recBaseOuter
                }
            }

            $report["first_record_base_used"] = $firstRecordBaseUsed
            if (-not $pagingStopReason) {
                if ($allJobs.Count -gt 0) {
                    $pagingStopReason = "hit_max_pages_or_max_total_cap"
                    $pagingReliable = $false
                }
                else {
                    $pagingStopReason = "no_jobs_across_selected_processes"
                    $pagingReliable = $false
                }
            }
            $report["paging_stop_reason"] = $pagingStopReason
            $report["paging_appears_reliable"] = $pagingReliable

            $listingOk = ($allJobs.Count -gt 0)
        }

        $report["listing_attempts"] = @($listingAttemptsList.ToArray())

        $nJobs = $allJobs.Count
        $report["jobs_returned_total"] = $nJobs
        if ($nJobs -eq 0) {
            $report["jobs"] = New-Object object[] 0
        }
        else {
            $jobArray = New-Object 'object[]' $nJobs
            $allJobs.CopyTo($jobArray, 0)
            $report["jobs"] = $jobArray
        }

        if ($listingOk) {
            $report["classification"] = "ok"
            $report["recommended_next_probe"] = "Optionally narrow JobFilter (dates/status) via a follow-up probe once required filter properties are confirmed from type_introspection.JobFilter."
        }
        else {
            if (-not $report["classification"]) {
                $report["classification"] = "job_listing_method_unresolved"
            }
            if (-not $report["recommended_next_probe"]) {
                $report["recommended_next_probe"] = "Compare get_processes output, process selection env vars, and get_jobs_method_signatures; confirm paging/firstRecord convention for this SDK build."
            }
        }
    }
    catch {
        $report["top_level_error"] = $_.Exception.Message
        $report["top_level_error_type"] = $_.Exception.GetType().FullName
        if (Test-WindowsFormsBlocker $report["top_level_error"]) {
            $report["classification"] = "windows_dependency_blocker"
        }
        else {
            $report["classification"] = "probe_error"
        }
    }
    finally {
        if ($connected -and $conn) {
            try { [void](Invoke-ConnMethod $conn "Disconnect" ([object[]]@()) ([type[]]@())) } catch { }
        }
    }
}
catch {
    $report["top_level_error"] = $_.Exception.Message
    $report["top_level_error_type"] = $_.Exception.GetType().FullName
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
    try {
        Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 22)
    } catch {
        $fallback = '{"classification":"json_write_failed","source":"MorawareSdkJobIdentifierProbe.ps1"}'
        Write-Utf8NoBomFile $OutJson $fallback
    }

    $txtLines = New-Object System.Collections.Generic.List[string]
    [void]$txtLines.Add("Moraware SDK - job identifier probe")
    [void]$txtLines.Add("classification: $($report['classification'])")
    if ($report["top_level_error"]) {
        [void]$txtLines.Add("top_level_error: $($report['top_level_error'])")
    }
    if ($report["top_level_error_type"]) {
        [void]$txtLines.Add("top_level_error_type: $($report['top_level_error_type'])")
    }
    [void]$txtLines.Add("job_listing_method_used: $($report['job_listing_method_used'])")
    if ($null -ne $report["get_jobs_invoke_parameter_count"]) {
        [void]$txtLines.Add(("get_jobs_invoke_parameter_count: {0}" -f $report["get_jobs_invoke_parameter_count"]))
    }
    [void]$txtLines.Add(("process_count: {0}" -f $report["process_count"]))
    [void]$txtLines.Add(("processes_attempted: {0}" -f $report["processes_attempted"]))
    if ($report["process_ids_env"]) {
        [void]$txtLines.Add(("process_ids_env: {0}" -f ($report["process_ids_env"] -join ",")))
    }
    if ($report["process_ids_env_not_found"] -and @($report["process_ids_env_not_found"]).Count -gt 0) {
        [void]$txtLines.Add(("process_ids_env_not_found: {0}" -f (@($report["process_ids_env_not_found"]) -join ",")))
    }
    $frb = $report["first_record_base_used"]
    if ($null -eq $frb) {
        [void]$txtLines.Add("first_record_base_used: none")
    }
    else {
        [void]$txtLines.Add(("first_record_base_used: {0}" -f $frb))
    }
    [void]$txtLines.Add(("page_size={0} pages_attempted={1} jobs_returned_total={2}" -f $pageSize, $report["pages_attempted"], $report["jobs_returned_total"]))
    [void]$txtLines.Add("paging_stop_reason: $($report['paging_stop_reason'])")
    [void]$txtLines.Add("paging_appears_reliable: $($report['paging_appears_reliable'])")
    [void]$txtLines.Add("")
    [void]$txtLines.Add("Processes (up to 10):")
    $procs = @($report["processes"])
    $nProcShow = [Math]::Min(10, $procs.Length)
    for ($pi = 0; $pi -lt $nProcShow; $pi++) {
        $pr = $procs[$pi]
        [void]$txtLines.Add(("  id={0} name={1} active={2} status={3}" -f $pr["process_id"], $pr["process_name"], $pr["active"], $pr["status"]))
    }
    [void]$txtLines.Add("")
    $tiOut = $report["type_introspection"]
    Add-DeepTypeTxtSection $txtLines "Moraware.JobTrackerAPI5.JobFilter" $tiOut["JobFilter"]
    Add-DeepTypeTxtSection $txtLines "Moraware.JobTrackerAPI5.PagingOptions" $tiOut["PagingOptions"]
    [void]$txtLines.Add("First up to 20 job id / name / process:")
    $nShow = [Math]::Min(20, $allJobs.Count)
    for ($i = 0; $i -lt $nShow; $i++) {
        $jr = $allJobs[$i]
        [void]$txtLines.Add(("  id={0} name={1} proc_id={2} proc_name={3}" -f $jr["job_id"], $jr["job_name"], $jr["process_id"], $jr["process_name"]))
    }
    [void]$txtLines.Add("")
    [void]$txtLines.Add("Connection methods (discovery filter):")
    foreach ($s in @($report["connection_methods_matching_discovery_filter"])) {
        [void]$txtLines.Add("  " + $s)
    }
    [void]$txtLines.Add("")
    [void]$txtLines.Add("GetProcesses overloads:")
    foreach ($s in @($report["get_processes_method_signatures"])) {
        [void]$txtLines.Add("  " + $s)
    }
    [void]$txtLines.Add("")
    [void]$txtLines.Add("GetJobs overloads:")
    foreach ($s in @($report["get_jobs_method_signatures"])) {
        [void]$txtLines.Add("  " + $s)
    }
    [void]$txtLines.Add("")
    [void]$txtLines.Add("GetJob overloads:")
    foreach ($s in @($report["get_job_method_signatures"])) {
        [void]$txtLines.Add("  " + $s)
    }
    [void]$txtLines.Add("")
    [void]$txtLines.Add("recommended_next_probe: $($report['recommended_next_probe'])")
    [void]$txtLines.Add("Full JSON: $OutJson")
    [void]$txtLines.Add("CSV: $OutCsv")

    $csvRowsWritten = 0
    try {
        $jobRowsForCsv = @()
        if ($null -ne $report["jobs"]) {
            $jobRowsForCsv = @($report["jobs"])
        }
        if ($jobRowsForCsv.Count -gt 0) {
            $csvPack = Build-JobsExportCsv $jobRowsForCsv
            Write-Utf8NoBomFile $OutCsv $csvPack.text
            $csvRowsWritten = [int]$csvPack.data_rows
        }
        else {
            Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
        }
    }
    catch {
        try {
            Write-Utf8NoBomFile $OutCsv ((Get-JobIdentifierProbeCsvHeaderLine) + "`n")
        }
        catch { }
        $csvRowsWritten = 0
    }
    [void]$txtLines.Add(("csv_rows_written: {0}" -f $csvRowsWritten))

    try {
        Write-Utf8NoBomFile $OutTxt ($txtLines -join "`n")
    } catch { }

    Write-Host "Wrote: $OutJson"
    Write-Host "Wrote: $OutTxt"
    Write-Host "Wrote: $OutCsv"
}

exit 0
