#Requires -Version 5.1
<#
.SYNOPSIS
  Windows-only Moraware SDK read-only probe: batch job detail discovery from job identifier CSV.

  Env: MORAWARE_URL or MORAWARE_API_URL; MORAWARE_USERNAME; MORAWARE_PASSWORD (never logged).
  Optional: MORAWARE_SDK_JOB_DETAIL_INPUT_CSV, MORAWARE_SDK_JOB_DETAIL_MAX_JOBS (default 25),
  MORAWARE_SDK_JOB_DETAIL_START_INDEX (default 0), MORAWARE_SDK_JOB_DETAIL_IDS (comma-separated),
  MORAWARE_SDK_JOB_DETAIL_INCLUDE_FORMS|FILES|MATERIAL|ACTIVITIES (default 1 each).
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

function Read-BoolEnvOne([string]$Name, [bool]$DefaultTrue) {
    $raw = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $DefaultTrue }
    $t = $raw.Trim()
    $tl = $t.ToLowerInvariant()
    if ($tl -eq "0" -or $tl -eq "false" -or $tl -eq "no" -or $tl -eq "off" -or $tl -eq "n") { return $false }
    if ($tl -eq "1" -or $tl -eq "true" -or $tl -eq "yes" -or $tl -eq "on" -or $tl -eq "y") { return $true }
    $iv = 0
    if ([int32]::TryParse($t, [ref]$iv)) {
        if ($iv -eq 0) { return $false }
        return $true
    }
    return $DefaultTrue
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

function Test-AssignmentRelatedPropertyName {
    param([string]$PropName)
    if ([string]::IsNullOrEmpty($PropName)) { return $false }
    $pn = $PropName
    return $pn -match "Assignee|Assigned|Resource|Machine|Employee|User|Calendar|Schedule|WorkCenter|Station"
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

function Read-OptionalJobIdsFromEnv {
    $raw = [Environment]::GetEnvironmentVariable("MORAWARE_SDK_JOB_DETAIL_IDS")
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
    for ($i = 0; $i -lt $ids.Count; $i++) { $arr[$i] = [int32]$ids[$i] }
    return ,$arr
}

function Read-JobIdsFromCsv {
    param([string]$CsvPath, [int[]]$ExplicitIdsOrNull)
    if (-not (Test-Path -LiteralPath $CsvPath)) {
        throw "input_csv_not_found: " + $CsvPath
    }
    $list = New-Object System.Collections.Generic.List[int]
    if ($null -ne $ExplicitIdsOrNull -and $ExplicitIdsOrNull.Length -gt 0) {
        foreach ($id in $ExplicitIdsOrNull) { [void]$list.Add($id) }
        return ,$list.ToArray()
    }
    $rows = Import-Csv -LiteralPath $CsvPath
    foreach ($row in $rows) {
        $raw = $row.job_id
        if ([string]::IsNullOrWhiteSpace($raw)) { continue }
        $v = 0
        if ([int32]::TryParse([string]$raw.Trim(), [ref]$v)) { [void]$list.Add($v) }
    }
    return ,$list.ToArray()
}

function Slice-JobIds {
    param([int[]]$AllIds, [int]$StartIndex, [int]$MaxJobs)
    if ($null -eq $AllIds -or $AllIds.Length -eq 0) { return ,@() }
    if ($StartIndex -lt 0) { $StartIndex = 0 }
    if ($StartIndex -ge $AllIds.Length) { return ,@() }
    $end = [Math]::Min($AllIds.Length - 1, $StartIndex + $MaxJobs - 1)
    $n = $end - $StartIndex + 1
    $out = New-Object 'int32[]' $n
    for ($i = 0; $i -lt $n; $i++) {
        $out[$i] = $AllIds[$StartIndex + $i]
    }
    return ,$out
}

function Get-PublicInstancePropertySummaries {
    param($Target, [int]$MaxProps)
    if ($null -eq $Target) { return @() }
    $list = New-Object System.Collections.ArrayList
    foreach ($p in $Target.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if ($list.Count -ge $MaxProps) { break }
        if (-not $p.CanRead) { continue }
        [void]$list.Add($p.Name + ":" + $p.PropertyType.Name)
    }
    return @($list.ToArray())
}

function Scan-ObjectPropertyNamesForKeywords {
    param($Target, [string]$Pattern)
    if ($null -eq $Target) { return $false }
    foreach ($p in $Target.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if ($p.Name -match $Pattern) { return $true }
    }
    return $false
}

function New-SanitizedJobCoreSummary {
    param($Job, [int]$MaxPropSummaries)
    if ($null -eq $Job) { return $null }
    $row = [ordered]@{
        job_id       = (Format-Scalar (Get-PropValue $Job @("JobId", "Id", "JobID")))
        job_name     = (Format-Scalar (Get-PropValue $Job @("JobName", "Name", "Title")))
        account_id   = (Format-Scalar (Get-PropValue $Job @("AccountId", "AccountID")))
        account_name = (Format-Scalar (Get-PropValue $Job @("AccountName", "CustomerName", "Account")))
        process_id   = (Format-Scalar (Get-PropValue $Job @("ProcessId", "ProcessID")))
        process_name = (Format-Scalar (Get-PropValue $Job @("ProcessName", "Process")))
        status       = (Format-Scalar (Get-PropValue $Job @("Status", "JobStatus")))
        status_name  = (Format-Scalar (Get-PropValue $Job @("StatusName", "DisplayStatus", "JobStatusName")))
        created      = (Format-Scalar (Get-PropValue $Job @("CreationDate", "CreatedDate", "DateCreated", "Created")))
        modified     = (Format-Scalar (Get-PropValue $Job @("ModifiedDate", "LastModified", "Updated")))
        scheduled    = (Format-Scalar (Get-PropValue $Job @("ScheduledDate", "ScheduleDate")))
        completed    = (Format-Scalar (Get-PropValue $Job @("CompletedDate", "CompletionDate")))
        install      = (Format-Scalar (Get-PropValue $Job @("InstallDate", "InstallationDate")))
        property_type_summaries = @(Get-PublicInstancePropertySummaries $Job $MaxPropSummaries)
    }
    return $row
}

function Get-CollectionCountHint {
    param($Target, [string[]]$Names)
    foreach ($n in $Names) {
        $p = $Target.GetType().GetProperty($n, [System.Reflection.BindingFlags]"Public,Instance")
        if (-not $p -or -not $p.CanRead) { continue }
        try {
            $v = $p.GetValue($Target, $null)
            $c = Get-EnumerableCount $v
            if ($c -gt 0) { return $c }
        } catch { }
    }
    return 0
}

function New-SanitizedActivitySummary {
    param($Activity, [int]$MaxScalarProps)
    if ($null -eq $Activity) { return $null }
    $aid = Format-Scalar (Get-PropValue $Activity @("JobActivityId", "ActivityId", "Id"))
    $row = [ordered]@{
        activity_id   = $aid
        activity_type = (Format-Scalar (Get-PropValue $Activity @("ActivityTypeName", "ActivityType", "TypeName", "Type")))
        status        = (Format-Scalar (Get-PropValue $Activity @("Status", "ActivityStatus")))
        status_name   = (Format-Scalar (Get-PropValue $Activity @("StatusName", "DisplayStatus")))
        start_time    = (Format-Scalar (Get-PropValue $Activity @("StartTime", "StartDateTime", "Start")))
        end_time      = (Format-Scalar (Get-PropValue $Activity @("EndTime", "EndDateTime", "End")))
        duration      = (Format-Scalar (Get-PropValue $Activity @("Duration", "DurationMinutes")))
        assignees_count = (Get-CollectionCountHint $Activity @("Assignees", "AssigneeList", "AssignedUsers", "Resources"))
        assignment_related_property_names = @()
        scalar_hints = @()
    }
    $arn = New-Object System.Collections.ArrayList
    foreach ($p in $Activity.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if (Test-AssignmentRelatedPropertyName $p.Name) {
            [void]$arn.Add($p.Name)
        }
    }
    $row["assignment_related_property_names"] = @($arn.ToArray())
    $n = 0
    $hints = New-Object System.Collections.ArrayList
    foreach ($p in $Activity.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if ($n -ge $MaxScalarProps) { break }
        if (-not $p.CanRead) { continue }
        if (Test-BlockedPreviewName $p.Name) { continue }
        $pt = $p.PropertyType
        if ($pt.IsClass -and $pt -ne [string]) { continue }
        if ($pt.IsInterface) { continue }
        if ($pt.IsGenericType) { continue }
        try {
            $val = $p.GetValue($Activity, $null)
            $entry = [ordered]@{ name = $p.Name; type = $pt.Name }
            if ($null -eq $val) { $entry.value_kind = "null" }
            elseif ($val -is [string]) {
                $entry.value_kind = "string"
                $entry.length = $val.Length
                if ($val.Length -le 48) { $entry.preview = $val }
            }
            elseif ($val -is [ValueType] -or $val -is [DateTime]) {
                $entry.value_kind = "scalar"
                $entry.preview = (Format-Scalar $val)
            }
            else { continue }
            [void]$hints.Add($entry)
            $n++
        } catch { }
    }
    $row["scalar_hints"] = @($hints.ToArray())
    return $row
}

function New-SanitizedFormSummary {
    param($Form, [int]$MaxFields)
    if ($null -eq $Form) { return $null }
    $row = [ordered]@{
        form_id   = (Format-Scalar (Get-PropValue $Form @("JobFormId", "FormId", "Id")))
        form_name = (Format-Scalar (Get-PropValue $Form @("Name", "FormName", "Title")))
        form_type = (Format-Scalar (Get-PropValue $Form @("FormType", "TypeName", "Type")))
        status    = (Format-Scalar (Get-PropValue $Form @("Status", "FormStatus")))
        fields    = @()
        field_count = 0
    }
    $fieldsCol = Get-PropValue $Form @("Fields", "JobFormFields", "FormFields")
    $fc = Get-EnumerableCount $fieldsCol
    $row["field_count"] = $fc
    if ($fc -gt 0 -and $null -ne $fieldsCol) {
        $fi = 0
        $fieldList = New-Object System.Collections.ArrayList
        foreach ($f in $fieldsCol) {
            if ($fi -ge $MaxFields) { break }
            if ($null -eq $f) { continue }
            $fn = Format-Scalar (Get-PropValue $f @("FieldName", "Name", "Label", "Key"))
            $fv = Get-PropValue $f @("Value", "FieldValue", "Text", "DisplayValue")
            $fe = [ordered]@{ name = $fn; value_kind = "null"; length = 0; preview = "" }
            if ($null -eq $fv) { $fe.value_kind = "null" }
            elseif ($fv -is [string]) {
                $fe.value_kind = "string"
                $fe.length = $fv.Length
                if ($fv.Length -le 40) { $fe.preview = $fv }
            }
            else {
                $fe.value_kind = "scalar"
                $fe.preview = (Format-Scalar $fv)
                if ($fe.preview.Length -gt 40) { $fe.preview = $fe.preview.Substring(0, 40) }
            }
            [void]$fieldList.Add($fe)
            $fi++
        }
        $row["fields"] = @($fieldList.ToArray())
    }
    return $row
}

function New-SanitizedFileSummary {
    param($FileObj)
    if ($null -eq $FileObj) { return $null }
    $name = Format-Scalar (Get-PropValue $FileObj @("FileName", "Name", "OriginalFileName"))
    $ext = ""
    if (-not [string]::IsNullOrEmpty($name)) {
        try { $ext = [System.IO.Path]::GetExtension($name) } catch { $ext = "" }
    }
    return [ordered]@{
        file_id   = (Format-Scalar (Get-PropValue $FileObj @("JobFileId", "FileId", "Id")))
        file_name = $name
        extension = $ext
        size      = (Format-Scalar (Get-PropValue $FileObj @("FileSize", "Size", "Length")))
        modified  = (Format-Scalar (Get-PropValue $FileObj @("ModifiedDate", "LastModified", "Updated")))
    }
}

function New-SanitizedMaterialRow {
    param($Mat, [int]$MaxScalars)
    if ($null -eq $Mat) { return $null }
    $row = [ordered]@{ material_like = @() }
    $ml = New-Object System.Collections.ArrayList
    foreach ($p in $Mat.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if (-not $p.CanRead) { continue }
        $pn = $p.Name
        if ($pn -notmatch "Material|Color|Serial|Slab|Sku|Product|Item|Quantity|Qty|Width|Length") { continue }
        if (Test-BlockedPreviewName $pn) { continue }
        $pt = $p.PropertyType
        if ($pt.IsClass -and $pt -ne [string]) { continue }
        try {
            $val = $p.GetValue($Mat, $null)
            $e = [ordered]@{ name = $pn; type = $pt.Name }
            if ($null -eq $val) { $e.value_kind = "null" }
            elseif ($val -is [string]) {
                $e.value_kind = "string"
                $e.length = $val.Length
                if ($val.Length -le 48) { $e.preview = $val }
            }
            else {
                $e.value_kind = "scalar"
                $e.preview = (Format-Scalar $val)
                if ($e.preview.Length -gt 48) { $e.preview = $e.preview.Substring(0, 48) }
            }
            [void]$ml.Add($e)
            if ($ml.Count -ge $MaxScalars) { break }
        } catch { }
    }
    $row["material_like"] = @($ml.ToArray())
    return $row
}

function Find-GetJobFormsMethod {
    param([type]$ConnType)
    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    foreach ($m in $ConnType.GetMethods($flags)) {
        if ($m.Name -ne "GetJobForms") { continue }
        if ($m.IsGenericMethod) { continue }
        $ps = $m.GetParameters()
        if ($ps.Length -ne 3) { continue }
        if ($ps[0].ParameterType -eq [int32] -and $ps[1].ParameterType -eq [bool]) {
            return $m
        }
    }
    return $null
}

function Build-GetJobFormsInvokeArgs {
    param([System.Reflection.MethodInfo]$Method, [int32]$JobId, [bool]$IncludePhases)
    $ps = $Method.GetParameters()
    $t2 = $ps[2].ParameterType
    $third = $null
    if ($t2.IsEnum) {
        $third = [System.Enum]::ToObject($t2, 0)
    }
    elseif ($t2 -eq [int32] -or $t2 -eq [int64]) {
        $third = [Convert]::ChangeType(0, $t2)
    }
    elseif ($t2 -eq [bool]) {
        $third = $false
    }
    else {
        try {
            $third = [Activator]::CreateInstance($t2)
        }
        catch {
            $third = $null
        }
    }
    return @{
        types = [type[]]@([int32], [bool], $t2)
        args  = [object[]]@([int32]$JobId, [bool]$IncludePhases, $third)
    }
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

function Build-SummaryCsvLines {
    param($JobResults)
    $cols = @("job_id", "job_name", "ok", "activities_n", "forms_n", "files_n", "materials_n", "error")
    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add(($cols -join ","))
    foreach ($jr in $JobResults) {
        if ($null -eq $jr) { continue }
        $cells = @(
            (Escape-CsvField $jr["job_id"])
            (Escape-CsvField $jr["job_name"])
            (Escape-CsvField $jr["ok"])
            (Escape-CsvField $jr["activities_n"])
            (Escape-CsvField $jr["forms_n"])
            (Escape-CsvField $jr["files_n"])
            (Escape-CsvField $jr["materials_n"])
            (Escape-CsvField $jr["error"])
        )
        [void]$lines.Add(($cells -join ","))
    }
    return ($lines -join "`n")
}

# --- main ---
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
$OutJson = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-job-detail-probe.json"
$OutTxt  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-job-detail-probe.txt"
$OutCsv  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-job-detail-summary.csv"

$url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_URL")).Trim()
if (-not $url) { $url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_API_URL")).Trim() }
$user = [string]([Environment]::GetEnvironmentVariable("MORAWARE_USERNAME")).Trim()
$pass = [string]([Environment]::GetEnvironmentVariable("MORAWARE_PASSWORD")).Trim()

$apiHost = $null
try { if ($url) { $apiHost = ([Uri]$url).Host } } catch { $apiHost = $null }

$defaultCsv = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-job-identifiers.csv"
$inputCsvRaw = [Environment]::GetEnvironmentVariable("MORAWARE_SDK_JOB_DETAIL_INPUT_CSV")
$inputCsv = $defaultCsv
if (-not [string]::IsNullOrWhiteSpace($inputCsvRaw)) {
    $inputCsv = $inputCsvRaw.Trim()
}
$startIndex = Read-IntEnv "MORAWARE_SDK_JOB_DETAIL_START_INDEX" 0
$maxJobs = Read-IntEnv "MORAWARE_SDK_JOB_DETAIL_MAX_JOBS" 25
$includeForms = Read-BoolEnvOne "MORAWARE_SDK_JOB_DETAIL_INCLUDE_FORMS" $true
$includeFiles = Read-BoolEnvOne "MORAWARE_SDK_JOB_DETAIL_INCLUDE_FILES" $true
$includeMaterial = Read-BoolEnvOne "MORAWARE_SDK_JOB_DETAIL_INCLUDE_MATERIAL" $true
$includeActivities = Read-BoolEnvOne "MORAWARE_SDK_JOB_DETAIL_INCLUDE_ACTIVITIES" $true

$includeMaterialEnvRaw = [Environment]::GetEnvironmentVariable("MORAWARE_SDK_JOB_DETAIL_INCLUDE_MATERIAL")
$includeMaterialEnvSet = -not [string]::IsNullOrWhiteSpace($includeMaterialEnvRaw)
$includeMaterialEnvTrimmed = ""
if ($includeMaterialEnvSet) { $includeMaterialEnvTrimmed = $includeMaterialEnvRaw.Trim() }

$report = [ordered]@{
    generated_at   = [DateTime]::UtcNow.ToString("o")
    source         = "MorawareSdkBatchJobDetailProbe.ps1"
    classification = $null
    top_level_error = $null
    top_level_error_type = $null
    diagnostics    = $diag
    credentials    = @{
        api_url_configured  = (-not [string]::IsNullOrWhiteSpace($url))
        api_host            = $apiHost
        username_configured = (-not [string]::IsNullOrWhiteSpace($user))
        password_configured = (-not [string]::IsNullOrWhiteSpace($pass))
    }
    input_csv_resolved = $inputCsv
    options = @{
        start_index         = $startIndex
        max_jobs            = $maxJobs
        include_forms       = $includeForms
        include_files       = $includeFiles
        include_material    = $includeMaterial
        include_activities  = $includeActivities
        include_material_env_set = $includeMaterialEnvSet
        include_material_env_trimmed = $includeMaterialEnvTrimmed
    }
    method_signatures = @{
        GetJob                        = @()
        GetJobs                       = @()
        GetJobActivities              = @()
        GetJobForms                   = @()
        GetJobFiles                   = @()
        GetJobActivityMaterialForJob  = @()
    }
    aggregate = @{
        activities_total                          = 0
        forms_total                               = 0
        files_total                               = 0
        material_rows_total                       = 0
        assignment_related_property_seen_anywhere = $false
        assignees_populated_anywhere              = $false
    }
    jobs_attempted  = 0
    jobs_succeeded  = 0
    jobs_failed     = 0
    methods_attempted = @()
    methods_succeeded = @()
    jobs_detail     = (New-Object System.Collections.Generic.List[object])
}

$summaryRowsForCsv = New-Object System.Collections.ArrayList
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

    $appName = "eOS Moraware Job Detail Probe"
    $conn = $ctor.Invoke(@($url, $user, $pass, $tracer, [bool]$false, [bool]$false, $appName))

    $explicitIds = Read-OptionalJobIdsFromEnv
    $allIds = Read-JobIdsFromCsv $inputCsv $explicitIds
    $jobIds = Slice-JobIds $allIds $startIndex $maxJobs
    $report["job_ids_total_in_input"] = $allIds.Length
    $report["job_ids_selected"] = @($jobIds)

    [void](Invoke-ConnMethod $conn "Connect" ([object[]]@()) ([type[]]@()))
    $connected = $true

    $report["method_signatures"]["GetJob"] = @(Get-ConnMethodOverloadSignatures $connType "GetJob")
    $report["method_signatures"]["GetJobs"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobs")
    $report["method_signatures"]["GetJobActivities"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobActivities")
    $report["method_signatures"]["GetJobForms"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobForms")
    $report["method_signatures"]["GetJobFiles"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobFiles")
    $report["method_signatures"]["GetJobActivityMaterialForJob"] = @(Get-ConnMethodOverloadSignatures $connType "GetJobActivityMaterialForJob")

    $attempted = New-Object System.Collections.ArrayList
    $succeeded = New-Object System.Collections.ArrayList

    $gjFormsMi = Find-GetJobFormsMethod $connType

    if ($null -eq $jobIds -or $jobIds.Length -eq 0) {
        $report["classification"] = "no_job_ids_selected"
        $report["top_level_error"] = "No job IDs after CSV read, optional MORAWARE_SDK_JOB_DETAIL_IDS filter, start_index, and max_jobs."
    }
    else {
        foreach ($jid in $jobIds) {
            $report["jobs_attempted"] = [int]$report["jobs_attempted"] + 1
            $one = [ordered]@{
                job_id = ([string][int32]$jid)
                ok     = $false
                error  = $null
                job_summary = $null
                counts = @{
                    contacts_n = 0
                    phases_n   = 0
                    activities_n = 0
                    forms_n    = 0
                    files_n    = 0
                    materials_n = 0
                }
                activities_sample = (New-Object System.Collections.ArrayList)
                forms_sample      = (New-Object System.Collections.ArrayList)
                files_sample      = (New-Object System.Collections.ArrayList)
                materials_sample  = (New-Object System.Collections.ArrayList)
            }
            $csvRow = [ordered]@{
                job_id = ([string][int32]$jid)
                job_name = ""
                ok = "false"
                activities_n = 0
                forms_n = 0
                files_n = 0
                materials_n = 0
                error = ""
            }
            try {
                $job = Invoke-ConnMethod $conn "GetJob" ([object[]]@([int32]$jid, [bool]$false, [bool]$true)) ([type[]]@([int32], [bool], [bool]))
                [void]$attempted.Add("GetJob")
                if ($succeeded -notcontains "GetJob") { [void]$succeeded.Add("GetJob") }
                $one["job_summary"] = New-SanitizedJobCoreSummary $job 80
                $csvRow["job_name"] = [string]$one["job_summary"]["job_name"]
                $one["counts"]["contacts_n"] = (Get-CollectionCountHint $job @("Contacts", "ContactList", "JobContacts"))
                $one["counts"]["phases_n"] = (Get-CollectionCountHint $job @("JobPhases", "Phases", "PhasesList"))
                if (Scan-ObjectPropertyNamesForKeywords $job "Assignee|Assigned|Resource|Machine|Employee|User|Calendar|Schedule|WorkCenter|Station") {
                    $report["aggregate"]["assignment_related_property_seen_anywhere"] = $true
                }

                if ($includeActivities) {
                    try {
                        $acts = Invoke-ConnMethod $conn "GetJobActivities" ([object[]]@([int32]$jid, [bool]$true, [bool]$true)) ([type[]]@([int32], [bool], [bool]))
                        [void]$attempted.Add("GetJobActivities")
                        if ($succeeded -notcontains "GetJobActivities") { [void]$succeeded.Add("GetJobActivities") }
                        $ac = Get-EnumerableCount $acts
                        $one["counts"]["activities_n"] = $ac
                        $report["aggregate"]["activities_total"] = [int]$report["aggregate"]["activities_total"] + $ac
                        $si = 0
                        foreach ($a in $acts) {
                            if ($si -ge 40) { break }
                            if ($null -eq $a) { continue }
                            if (Scan-ObjectPropertyNamesForKeywords $a "Assignee|Assigned|Resource|Machine|Employee|User|Calendar|Schedule|WorkCenter|Station") {
                                $report["aggregate"]["assignment_related_property_seen_anywhere"] = $true
                            }
                            $asum = New-SanitizedActivitySummary $a 12
                            if ($null -ne $asum) {
                                if ([int]$asum["assignees_count"] -gt 0) {
                                    $report["aggregate"]["assignees_populated_anywhere"] = $true
                                }
                                [void]$one["activities_sample"].Add($asum)
                            }
                            $si++
                        }
                    }
                    catch {
                        $one["activities_error"] = $_.Exception.Message
                    }
                }

                if ($includeForms -and $null -ne $gjFormsMi) {
                    try {
                        $pack = Build-GetJobFormsInvokeArgs $gjFormsMi $jid $true
                        $forms = Invoke-ConnMethod $conn "GetJobForms" $pack.args $pack.types
                        [void]$attempted.Add("GetJobForms")
                        if ($succeeded -notcontains "GetJobForms") { [void]$succeeded.Add("GetJobForms") }
                        $fc = Get-EnumerableCount $forms
                        $one["counts"]["forms_n"] = $fc
                        $report["aggregate"]["forms_total"] = [int]$report["aggregate"]["forms_total"] + $fc
                        $fi = 0
                        foreach ($fm in $forms) {
                            if ($fi -ge 15) { break }
                            $fs = New-SanitizedFormSummary $fm 25
                            if ($null -ne $fs) { [void]$one["forms_sample"].Add($fs) }
                            $fi++
                        }
                    }
                    catch {
                        $one["forms_error"] = $_.Exception.Message
                    }
                }

                if ($includeFiles) {
                    try {
                        $files = Invoke-ConnMethod $conn "GetJobFiles" ([object[]]@([int32]$jid, [bool]$true)) ([type[]]@([int32], [bool]))
                        [void]$attempted.Add("GetJobFiles")
                        if ($succeeded -notcontains "GetJobFiles") { [void]$succeeded.Add("GetJobFiles") }
                        $nfc = Get-EnumerableCount $files
                        $one["counts"]["files_n"] = $nfc
                        $report["aggregate"]["files_total"] = [int]$report["aggregate"]["files_total"] + $nfc
                        $fi2 = 0
                        foreach ($fl in $files) {
                            if ($fi2 -ge 20) { break }
                            $fs2 = New-SanitizedFileSummary $fl
                            if ($null -ne $fs2) { [void]$one["files_sample"].Add($fs2) }
                            $fi2++
                        }
                    }
                    catch {
                        $one["files_error"] = $_.Exception.Message
                    }
                }

                if ($includeMaterial) {
                    [void]$attempted.Add("GetJobActivityMaterialForJob")
                    try {
                        $mats = Invoke-ConnMethod $conn "GetJobActivityMaterialForJob" ([object[]]@([int32]$jid)) ([type[]]@([int32]))
                        if ($succeeded -notcontains "GetJobActivityMaterialForJob") { [void]$succeeded.Add("GetJobActivityMaterialForJob") }
                        $mc = Get-EnumerableCount $mats
                        $one["counts"]["materials_n"] = $mc
                        $report["aggregate"]["material_rows_total"] = [int]$report["aggregate"]["material_rows_total"] + $mc
                        $mi = 0
                        foreach ($m in $mats) {
                            if ($mi -ge 20) { break }
                            $mr = New-SanitizedMaterialRow $m 8
                            if ($null -ne $mr) { [void]$one["materials_sample"].Add($mr) }
                            $mi++
                        }
                    }
                    catch {
                        $emMat = $_.Exception.Message
                        if ($_.Exception.InnerException) { $emMat = $_.Exception.InnerException.Message }
                        $one["materials_error"] = $emMat
                    }
                }

                $one["ok"] = $true
                $report["jobs_succeeded"] = [int]$report["jobs_succeeded"] + 1
                $csvRow["ok"] = "true"
                $csvRow["activities_n"] = $one["counts"]["activities_n"]
                $csvRow["forms_n"] = $one["counts"]["forms_n"]
                $csvRow["files_n"] = $one["counts"]["files_n"]
                $csvRow["materials_n"] = $one["counts"]["materials_n"]
            }
            catch {
                $em = $_.Exception.Message
                if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
                $one["error"] = $em
                $csvRow["error"] = $em
                $report["jobs_failed"] = [int]$report["jobs_failed"] + 1
            }
            $one["activities_sample"] = @($one["activities_sample"].ToArray())
            $one["forms_sample"] = @($one["forms_sample"].ToArray())
            $one["files_sample"] = @($one["files_sample"].ToArray())
            $one["materials_sample"] = @($one["materials_sample"].ToArray())
            [void]$report["jobs_detail"].Add($one)
            [void]$summaryRowsForCsv.Add($csvRow)
        }
    }

    $report["methods_attempted"] = @($attempted | Select-Object -Unique)
    $report["methods_succeeded"] = @($succeeded | Select-Object -Unique)
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

    $finalizationErrors = New-Object System.Collections.ArrayList

    try {
        $report["jobs_detail"] = Convert-ToObjectArray $report["jobs_detail"]
    } catch {
        [void]$finalizationErrors.Add("jobs_detail_normalize: " + $_.Exception.Message)
        $report["jobs_detail"] = New-Object object[] 0
    }
    try {
        $report["methods_attempted"] = Convert-ToObjectArray $report["methods_attempted"]
    } catch {
        [void]$finalizationErrors.Add("methods_attempted_normalize: " + $_.Exception.Message)
        $report["methods_attempted"] = New-Object object[] 0
    }
    try {
        $report["methods_succeeded"] = Convert-ToObjectArray $report["methods_succeeded"]
    } catch {
        [void]$finalizationErrors.Add("methods_succeeded_normalize: " + $_.Exception.Message)
        $report["methods_succeeded"] = New-Object object[] 0
    }
    try {
        $report["job_ids_selected"] = Convert-ToObjectArray $report["job_ids_selected"]
    } catch {
        [void]$finalizationErrors.Add("job_ids_selected_normalize: " + $_.Exception.Message)
        $report["job_ids_selected"] = New-Object object[] 0
    }

    $jsonWritten = $false
    try {
        Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 20)
        $jsonWritten = $true
    } catch {
        [void]$finalizationErrors.Add("json_write_primary: " + $_.Exception.Message)
        try {
            Write-Utf8NoBomFile $OutJson '{"classification":"json_write_failed","source":"MorawareSdkBatchJobDetailProbe.ps1"}'
            $jsonWritten = $true
        } catch {
            [void]$finalizationErrors.Add("json_write_fallback: " + $_.Exception.Message)
        }
    }

    $txtLines = $null
    try {
        $txt = New-Object System.Collections.Generic.List[string]
        [void]$txt.Add("Moraware SDK - batch job detail probe")
        [void]$txt.Add("classification: $($report['classification'])")
        if ($report["top_level_error"]) {
            [void]$txt.Add("top_level_error: $($report['top_level_error'])")
        }
        [void]$txt.Add("input_csv: $($report['input_csv_resolved'])")
        [void]$txt.Add(("start_index: {0}" -f $report["options"]["start_index"]))
        [void]$txt.Add(("max_jobs: {0}" -f $report["options"]["max_jobs"]))
        $opts = $report["options"]
        if ($null -ne $opts) {
            [void]$txt.Add(("include_activities: {0}" -f $opts["include_activities"]))
            [void]$txt.Add(("include_forms: {0}" -f $opts["include_forms"]))
            [void]$txt.Add(("include_files: {0}" -f $opts["include_files"]))
            [void]$txt.Add(("include_material: {0}" -f $opts["include_material"]))
        }
        [void]$txt.Add(("jobs_attempted: {0}" -f $report["jobs_attempted"]))
        [void]$txt.Add(("jobs_succeeded: {0}" -f $report["jobs_succeeded"]))
        [void]$txt.Add(("jobs_failed: {0}" -f $report["jobs_failed"]))
        $ma = Convert-ToObjectArray $report["methods_attempted"]
        $ms = Convert-ToObjectArray $report["methods_succeeded"]
        [void]$txt.Add("methods_attempted: " + ($ma -join ", "))
        [void]$txt.Add("methods_succeeded: " + ($ms -join ", "))
        $agg = $report["aggregate"]
        if ($null -ne $agg) {
            [void]$txt.Add(("activities_total: {0}" -f $agg["activities_total"]))
            [void]$txt.Add(("forms_total: {0}" -f $agg["forms_total"]))
            [void]$txt.Add(("files_total: {0}" -f $agg["files_total"]))
            [void]$txt.Add(("material_rows_total: {0}" -f $agg["material_rows_total"]))
            [void]$txt.Add(("assignment_related_property_seen_anywhere: {0}" -f $agg["assignment_related_property_seen_anywhere"]))
            [void]$txt.Add(("assignees_populated_anywhere: {0}" -f $agg["assignees_populated_anywhere"]))
        }
        [void]$txt.Add("")
        [void]$txt.Add("First 10 job summaries:")
        $jd = Convert-ToObjectArray $report["jobs_detail"]
        $n10 = [Math]::Min(10, $jd.Length)
        for ($ti = 0; $ti -lt $n10; $ti++) {
            $j = $jd[$ti]
            if ($null -eq $j) { continue }
            $nm = ""
            if ($j["job_summary"]) { $nm = [string]$j["job_summary"]["job_name"] }
            $actN = 0
            $formN = 0
            $fileN = 0
            $matN = 0
            if ($null -ne $j["counts"]) {
                $actN = $j["counts"]["activities_n"]
                $formN = $j["counts"]["forms_n"]
                $fileN = $j["counts"]["files_n"]
                $matN = $j["counts"]["materials_n"]
            }
            [void]$txt.Add(("  job_id={0} ok={1} name={2} act={3} forms={4} files={5} mat={6}" -f $j["job_id"], $j["ok"], $nm, $actN, $formN, $fileN, $matN))
        }
        [void]$txt.Add("")
        [void]$txt.Add("Full JSON: $OutJson")
        [void]$txt.Add("Summary CSV: $OutCsv")
        $txtLines = $txt -join "`n"
    } catch {
        [void]$finalizationErrors.Add("txt_build: " + $_.Exception.Message)
        $txtLines = "Moraware SDK - batch job detail probe`nclassification: $($report['classification'])`n(txt_build_failed; see JSON if present)`n"
    }

    try {
        if ($null -ne $txtLines) {
            Write-Utf8NoBomFile $OutTxt $txtLines
        }
    } catch {
        [void]$finalizationErrors.Add("txt_write: " + $_.Exception.Message)
    }

    try {
        $csvRows = Convert-ToObjectArray $summaryRowsForCsv
        Write-Utf8NoBomFile $OutCsv (Build-SummaryCsvLines $csvRows)
    } catch {
        [void]$finalizationErrors.Add("csv_primary: " + $_.Exception.Message)
        try {
            $hdr = "job_id,job_name,ok,activities_n,forms_n,files_n,materials_n,error"
            Write-Utf8NoBomFile $OutCsv ($hdr + "`n")
        } catch {
            [void]$finalizationErrors.Add("csv_fallback: " + $_.Exception.Message)
        }
    }

    if ($finalizationErrors.Count -gt 0) {
        $report["finalization_errors"] = @($finalizationErrors.ToArray())
        if ($report["classification"] -eq "ok") {
            $report["classification"] = "report_finalize_partial"
        }
        if (-not $report["top_level_error"]) {
            $report["top_level_error"] = [string]$finalizationErrors[0]
        }
        if ($jsonWritten) {
            try {
                Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 20)
            } catch {
                try {
                    Write-Utf8NoBomFile $OutJson '{"classification":"json_rewrite_failed","source":"MorawareSdkBatchJobDetailProbe.ps1"}'
                } catch { }
            }
        }
    }

    try {
        Write-Host "Wrote: $OutJson"
        Write-Host "Wrote: $OutTxt"
        Write-Host "Wrote: $OutCsv"
    } catch { }
}

exit 0
