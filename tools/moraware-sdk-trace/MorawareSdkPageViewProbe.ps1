#Requires -Version 5.1
<#
.SYNOPSIS
  Windows-only Moraware SDK read-only probe: PageView discovery (sanitized).

  Env: MORAWARE_URL or MORAWARE_API_URL; MORAWARE_USERNAME; MORAWARE_PASSWORD (never logged).
  Optional: MORAWARE_SDK_PAGEVIEW_IDS (comma-separated ints, default 146)
  Optional: MORAWARE_SDK_PAGEVIEW_LIST_ALL (1/0, default 1)
  Optional: MORAWARE_SDK_PAGEVIEW_ENUM_PAGES (1/0, default 1)
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

function Convert-ToInt32IdArray {
    param($Value)
    $out = New-Object System.Collections.Generic.List[int32]
    if ($null -eq $Value) {
        [void]$out.Add(146)
        return $out.ToArray()
    }
    if ($Value -is [string]) {
        $s = $Value.Trim()
        if ([string]::IsNullOrWhiteSpace($s)) {
            [void]$out.Add(146)
            return $out.ToArray()
        }
        $parts = $s.Split(@([char]','), [System.StringSplitOptions]::RemoveEmptyEntries)
        foreach ($p in $parts) {
            $t = $p.Trim()
            if ([string]::IsNullOrWhiteSpace($t)) { continue }
            $iv = 0
            if ([int32]::TryParse($t, [ref]$iv)) { [void]$out.Add($iv) }
        }
        if ($out.Count -eq 0) { [void]$out.Add(146) }
        return $out.ToArray()
    }
    if ($Value -is [byte] -or $Value -is [sbyte] -or $Value -is [int16] -or $Value -is [uint16] -or `
        $Value -is [int32] -or $Value -is [uint32] -or $Value -is [int64] -or $Value -is [uint64]) {
        [void]$out.Add([int32]([Convert]::ChangeType($Value, [int32])))
        return $out.ToArray()
    }
    if ($Value -is [int32[]]) {
        if ($Value.Length -eq 0) {
            [void]$out.Add(146)
            return $out.ToArray()
        }
        return $Value
    }
    if ($Value -is [System.Collections.IList]) {
        for ($i = 0; $i -lt $Value.Count; $i++) {
            $elem = $Value[$i]
            if ($null -eq $elem) { continue }
            try {
                [void]$out.Add([int32][Convert]::ChangeType($elem, [int32]))
            } catch { }
        }
        if ($out.Count -eq 0) { [void]$out.Add(146) }
        return $out.ToArray()
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        foreach ($item in $Value) {
            if ($null -eq $item) { continue }
            try {
                [void]$out.Add([int32][Convert]::ChangeType($item, [int32]))
            } catch { }
        }
        if ($out.Count -eq 0) { [void]$out.Add(146) }
        return $out.ToArray()
    }
    try {
        [void]$out.Add([int32][Convert]::ChangeType($Value, [int32]))
        return $out.ToArray()
    } catch {
        [void]$out.Clear()
        [void]$out.Add(146)
        return $out.ToArray()
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
    if ($Value -is [byte] -or $Value -is [sbyte] -or $Value -is [int16] -or $Value -is [uint16] -or `
        $Value -is [int32] -or $Value -is [uint32] -or $Value -is [int64] -or $Value -is [uint64]) {
        return ,([object]([Convert]::ChangeType($Value, [int32])))
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

function Format-Scalar {
    param($v)
    if ($null -eq $v) { return "" }
    if ($v -is [DateTime]) { return $v.ToString("o", [System.Globalization.CultureInfo]::InvariantCulture) }
    if ($v -is [System.IFormattable]) { return $v.ToString($null, [System.Globalization.CultureInfo]::InvariantCulture) }
    return [string]$v
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

function Test-KeywordHit {
    param([string]$Text, [string[]]$Keywords)
    if ([string]::IsNullOrEmpty($Text)) { return $false }
    foreach ($kw in $Keywords) {
        if ([string]::IsNullOrEmpty($kw)) { continue }
        if ($Text.IndexOf($kw, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
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
        foreach ($walkItem in $Collection) {
            $n++
            if ($n -gt 500000) { break }
        }
    }
    return $n
}

function Get-FirstElementTypeName {
    param($Collection)
    if ($null -eq $Collection) { return $null }
    foreach ($x in $Collection) {
        if ($null -eq $x) { continue }
        return $x.GetType().FullName
    }
    return $null
}

function Get-TypeReflectionSummary {
    param([type]$T, [int]$MaxProps)
    if ($null -eq $T) { return $null }
    $row = [ordered]@{
        type_full_name = $T.FullName
        kind           = "class"
        public_properties = (New-Object System.Collections.ArrayList)
        constructors      = (New-Object System.Collections.ArrayList)
    }
    if ($T.IsEnum) {
        $row["kind"] = "enum"
        $ev = New-Object System.Collections.ArrayList
        foreach ($en in [System.Enum]::GetNames($T)) {
            try {
                $vv = [System.Enum]::Parse($T, $en)
                $iv = [Convert]::ChangeType($vv, [int64])
                [void]$ev.Add([ordered]@{ name = $en; value = [string]$iv })
            } catch {
                [void]$ev.Add([ordered]@{ name = $en; value = "" })
            }
        }
        $row["enum_values"] = @($ev.ToArray())
        return $row
    }
    foreach ($c in $T.GetConstructors([System.Reflection.BindingFlags]"Public,Instance")) {
        $pp = $c.GetParameters()
        $parts = New-Object System.Collections.ArrayList
        foreach ($q in $pp) {
            [void]$parts.Add($q.ParameterType.Name)
        }
        [void]$row["constructors"].Add("ctor(" + ([string]::Join(",", @($parts.ToArray()))) + ")")
        if ($row["constructors"].Count -ge 12) { break }
    }
    $pi = 0
    foreach ($prop in $T.GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if ($pi -ge $MaxProps) { break }
        [void]$row["public_properties"].Add([ordered]@{
            name      = $prop.Name
            type      = $prop.PropertyType.FullName
            can_write = $prop.CanWrite
        })
        $pi++
    }
    return $row
}

function Get-PageViewFilterReflectionExtra {
    param([type]$FilterType)
    if ($null -eq $FilterType) { return $null }
    $settable = New-Object System.Collections.ArrayList
    foreach ($prop in $FilterType.GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
        if ($prop.CanWrite) {
            [void]$settable.Add($prop.Name + ":" + $prop.PropertyType.Name)
        }
    }
    $paramlessCtor = $null
    foreach ($c in $FilterType.GetConstructors([System.Reflection.BindingFlags]"Public,Instance")) {
        if ($c.GetParameters().Length -eq 0) {
            $paramlessCtor = $c
            break
        }
    }
    return [ordered]@{
        settable_properties = @($settable.ToArray())
        has_public_parameterless_ctor = ($null -ne $paramlessCtor)
    }
}

function New-StringPreview {
    param([string]$S, [int]$MaxLen)
    if ($null -eq $S) { return [ordered]@{ length = 0; preview = "" } }
    $len = $S.Length
    if ($len -le $MaxLen) { return [ordered]@{ length = $len; preview = $S } }
    return [ordered]@{ length = $len; preview = $S.Substring(0, $MaxLen) }
}

function New-PageViewSnapshot {
    param($PageViewObj, $RequestedId, [int]$StringPreviewMax)
    if ($null -eq $PageViewObj) { return $null }
    $snapErr = $null
    $propsOut = New-Object System.Collections.ArrayList
    $reqStr = ""
    if ($null -ne $RequestedId) {
        try { $reqStr = (Format-Scalar $RequestedId) } catch { $reqStr = "" }
    }
    $parsedIdStr = ""
    $parsedName = ""
    $parsedTitle = ""
    $parsedPage = ""
    $parsedPageEnum = ""
    $objType = ""
    try {
        $objType = $PageViewObj.GetType().FullName
        $rawId = Get-PropValue $PageViewObj @("PageViewId", "PageViewID", "Id", "ViewId", "Key")
        if ($null -ne $rawId) { $parsedIdStr = Format-Scalar $rawId }
        $parsedName = Format-Scalar (Get-PropValue $PageViewObj @("Name", "PageViewName"))
        $parsedTitle = Format-Scalar (Get-PropValue $PageViewObj @("Title", "Caption"))
        $pageEnumRaw = Get-PropValue $PageViewObj @("Page_Enum", "PageEnum")
        $pageRaw = Get-PropValue $PageViewObj @("Page", "PageType", "PageName")
        if ($null -ne $pageEnumRaw) {
            if ($pageEnumRaw.GetType().IsEnum) {
                $parsedPageEnum = [string]$pageEnumRaw
            }
            else {
                $parsedPageEnum = Format-Scalar $pageEnumRaw
            }
        }
        if ($null -ne $pageRaw) {
            if ($pageRaw.GetType().IsEnum) {
                if ([string]::IsNullOrEmpty($parsedPageEnum)) {
                    $parsedPageEnum = [string]$pageRaw
                }
                else {
                    $parsedPage = Format-Scalar $pageRaw
                }
            }
            else {
                $parsedPage = Format-Scalar $pageRaw
            }
        }
        foreach ($prop in $PageViewObj.GetType().GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
            if ($prop.GetIndexParameters().Length -gt 0) { continue }
            if (-not $prop.CanRead) { continue }
            $entry = [ordered]@{
                name                = $prop.Name
                type                = $prop.PropertyType.FullName
                value_kind          = "unknown"
                string_preview      = $null
                string_length       = $null
                scalar_preview      = $null
                collection_count    = $null
                first_item_type     = $null
                blocked_text_length = $null
            }
            try {
                $val = $prop.GetValue($PageViewObj)
                if ($null -eq $val) {
                    $entry["value_kind"] = "null"
                }
                elseif ($val -is [string]) {
                    $slen = $val.Length
                    if ($slen -le $StringPreviewMax) {
                        $entry["value_kind"] = "string"
                        $entry["string_preview"] = $val
                        $entry["string_length"] = $slen
                    }
                    else {
                        $entry["value_kind"] = "blocked_string"
                        $entry["blocked_text_length"] = $slen
                    }
                }
                elseif ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) {
                    $entry["value_kind"] = "collection"
                    $entry["collection_count"] = (Get-EnumerableCount $val)
                    $entry["first_item_type"] = (Get-FirstElementTypeName $val)
                }
                elseif ($val.GetType().IsEnum) {
                    $entry["value_kind"] = "enum"
                    $entry["scalar_preview"] = [string]$val
                }
                elseif ($val -is [bool] -or $val -is [byte] -or $val -is [sbyte] -or $val -is [int16] -or $val -is [uint16] -or `
                    $val -is [int32] -or $val -is [uint32] -or $val -is [int64] -or $val -is [uint64]) {
                    $entry["value_kind"] = "scalar_integral"
                    $entry["scalar_preview"] = (Format-Scalar $val)
                }
                elseif ($val -is [decimal] -or $val -is [single] -or $val -is [double]) {
                    $entry["value_kind"] = "scalar_float"
                    $entry["scalar_preview"] = (Format-Scalar $val)
                }
                elseif ($val -is [DateTime] -or $val -is [TimeSpan]) {
                    $entry["value_kind"] = "scalar_time"
                    $entry["scalar_preview"] = (Format-Scalar $val)
                }
                elseif ($val -is [ValueType]) {
                    $entry["value_kind"] = "scalar_other"
                    $entry["scalar_preview"] = (Format-Scalar $val)
                }
                else {
                    $entry["value_kind"] = "object"
                    $entry["scalar_preview"] = $val.GetType().FullName
                }
            } catch {
                $entry["value_kind"] = "error_read"
                $em = $_.Exception.Message
                if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
                if ($em.Length -gt 120) { $em = $em.Substring(0, 120) }
                $entry["scalar_preview"] = $em
            }
            [void]$propsOut.Add($entry)
        }
    } catch {
        $snapErr = $_.Exception.Message
        if ($_.Exception.InnerException) { $snapErr = $_.Exception.InnerException.Message }
        if ($null -eq $objType -or [string]::IsNullOrEmpty($objType)) {
            try { $objType = $PageViewObj.GetType().FullName } catch { $objType = "unknown_type" }
        }
    }
    return [ordered]@{
        requested_id               = $reqStr
        object_type                = $objType
        parsed_pageview_id         = $parsedIdStr
        parsed_name                = $parsedName
        parsed_title               = $parsedTitle
        parsed_page                = $parsedPage
        parsed_page_enum           = $parsedPageEnum
        public_properties_sample   = @($propsOut.ToArray())
        snapshot_error             = $snapErr
    }
}

function Find-PageViewIdFromObject {
    param($Pv)
    if ($null -eq $Pv) { return $null }
    $raw = Get-PropValue $Pv @("PageViewId", "PageViewID", "Id", "ViewId", "Key")
    if ($null -eq $raw) { return $null }
    try { return [int32][Convert]::ChangeType($raw, [int32]) } catch { return $null }
}

function Test-PageViewMatchesKeywords {
    param($Snap, [string[]]$NameKeywords, [string[]]$PageKeywords)
    if ($null -eq $Snap) { return [ordered]@{ name_hit = $false; page_hit = $false; property_string_hit = $false } }
    $nameBlob = ([string]$Snap["parsed_name"]) + " " + ([string]$Snap["parsed_title"])
    $nameHit = Test-KeywordHit $nameBlob $NameKeywords
    $pageBlob = ([string]$Snap["parsed_page"]) + " " + ([string]$Snap["parsed_page_enum"])
    $pageHit = Test-KeywordHit $pageBlob $PageKeywords
    $propHit = $false
    foreach ($pe in $Snap["public_properties_sample"]) {
        if ($null -eq $pe) { continue }
        if ([string]$pe["value_kind"] -eq "string" -and $null -ne $pe["string_preview"]) {
            if (Test-KeywordHit ([string]$pe["string_preview"]) $NameKeywords) { $propHit = $true; break }
        }
    }
    return [ordered]@{ name_hit = $nameHit; page_hit = $pageHit; property_string_hit = $propHit }
}

function Get-KeywordHitsForSnapshot {
    param($Snap, [string[]]$NameKeywords, [string[]]$PageKeywords)
    if ($null -eq $Snap) { return "" }
    $hits = New-Object System.Collections.Generic.List[string]
    $nameBlob = ([string]$Snap["parsed_name"]) + " " + ([string]$Snap["parsed_title"])
    foreach ($kw in $NameKeywords) {
        if ([string]::IsNullOrEmpty($kw)) { continue }
        if (Test-KeywordHit $nameBlob $kw) { [void]$hits.Add($kw) }
    }
    $pageBlob = ([string]$Snap["parsed_page"]) + " " + ([string]$Snap["parsed_page_enum"])
    foreach ($kw in $PageKeywords) {
        if ([string]::IsNullOrEmpty($kw)) { continue }
        if (Test-KeywordHit $pageBlob $kw) { [void]$hits.Add($kw) }
    }
    foreach ($pe in $Snap["public_properties_sample"]) {
        if ($null -eq $pe) { continue }
        if ([string]$pe["value_kind"] -eq "string" -and $null -ne $pe["string_preview"]) {
            foreach ($kw in $NameKeywords) {
                if ([string]::IsNullOrEmpty($kw)) { continue }
                if (Test-KeywordHit ([string]$pe["string_preview"]) $kw) {
                    $tag = "prop:" + $pe["name"] + ":" + $kw
                    [void]$hits.Add($tag)
                }
            }
        }
    }
    if ($hits.Count -eq 0) { return "" }
    return [string]::Join("|", @($hits.ToArray()))
}

function Format-PublicPropSampleOneLine {
    param($Pe)
    if ($null -eq $Pe) { return "(null)" }
    $vk = [string]$Pe["value_kind"]
    $nm = Format-Scalar $Pe["name"]
    $detail = ""
    if ($null -ne $Pe["string_preview"]) {
        $detail = "str=" + (Format-Scalar $Pe["string_preview"])
    }
    elseif ($null -ne $Pe["scalar_preview"]) {
        $detail = "val=" + (Format-Scalar $Pe["scalar_preview"])
    }
    elseif ($null -ne $Pe["collection_count"]) {
        $detail = "col_count=" + (Format-Scalar $Pe["collection_count"]) + " first_type=" + (Format-Scalar $Pe["first_item_type"])
    }
    elseif ($null -ne $Pe["blocked_text_length"]) {
        $detail = "blocked_len=" + (Format-Scalar $Pe["blocked_text_length"])
    }
    else {
        $detail = "type=" + (Format-Scalar $Pe["type"])
    }
    return ($nm + " kind=" + $vk + " " + $detail)
}

function Format-PageViewCsvLine {
    param([string]$Source, [string]$RequestedId, $Snap, [string]$RowSnapshotError, [string[]]$NameKeywords, [string[]]$PageKeywords)
    $kw = ""
    if ($null -ne $Snap) { $kw = Get-KeywordHitsForSnapshot $Snap $NameKeywords $PageKeywords }
    $snapErr = ""
    if (-not [string]::IsNullOrEmpty($RowSnapshotError)) {
        $snapErr = $RowSnapshotError
    }
    elseif ($null -ne $Snap -and $Snap["snapshot_error"]) {
        $snapErr = [string]$Snap["snapshot_error"]
    }
    $pvid = ""
    $nm = ""
    $ti = ""
    $pg = ""
    $pe = ""
    $ot = ""
    if ($null -ne $Snap) {
        $pvid = Format-Scalar $Snap["parsed_pageview_id"]
        $nm = Format-Scalar $Snap["parsed_name"]
        $ti = Format-Scalar $Snap["parsed_title"]
        $pg = Format-Scalar $Snap["parsed_page"]
        $pe = Format-Scalar $Snap["parsed_page_enum"]
        $ot = Format-Scalar $Snap["object_type"]
    }
    $reqIdStr = ""
    if ($null -ne $RequestedId) { $reqIdStr = [string]$RequestedId }
    return @(
        (Escape-CsvField $Source)
        (Escape-CsvField $reqIdStr)
        (Escape-CsvField $pvid)
        (Escape-CsvField $nm)
        (Escape-CsvField $ti)
        (Escape-CsvField $pg)
        (Escape-CsvField $pe)
        (Escape-CsvField $ot)
        (Escape-CsvField $kw)
        (Escape-CsvField $snapErr)
    ) -join ","
}

if ($PSVersionTable.PSEdition -eq "Core") {
    Write-Host "ERROR: Use Windows PowerShell 5.1 (powershell.exe)." -ForegroundColor Red
    exit 2
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DllPath = Join-Path $ScriptDir "lib\JobTrackerAPI5.dll"
$OutJson = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-pageviews.json"
$OutTxt  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-pageviews.txt"
$OutCsv  = Join-Path (Get-Location) "debug\moraware\latest\moraware-sdk-pageviews.csv"

$url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_URL")).Trim()
if (-not $url) { $url = [string]([Environment]::GetEnvironmentVariable("MORAWARE_API_URL")).Trim() }
$user = [string]([Environment]::GetEnvironmentVariable("MORAWARE_USERNAME")).Trim()
$pass = [string]([Environment]::GetEnvironmentVariable("MORAWARE_PASSWORD")).Trim()
$apiHost = $null
try { if ($url) { $apiHost = ([Uri]$url).Host } } catch { $apiHost = $null }

$rawIds = [Environment]::GetEnvironmentVariable("MORAWARE_SDK_PAGEVIEW_IDS")
$pageViewIds = [int32[]]@(146)
$idNormalizeError = $null
try {
    $pageViewIds = Convert-ToInt32IdArray $rawIds
} catch {
    $idNormalizeError = $_.Exception.Message
}

$doListAll = Read-BoolEnvOne "MORAWARE_SDK_PAGEVIEW_LIST_ALL" $true
$doEnumPages = Read-BoolEnvOne "MORAWARE_SDK_PAGEVIEW_ENUM_PAGES" $true

$nameKeywords = @("Machines", "Machine", "Calendar", "Saw", "Polish", "Titan", "Saber", "Robot")
$pageKeywords = @("Calendar", "Job", "Schedule")

$report = $null
try {
    $report = [ordered]@{
        generated_at         = [DateTime]::UtcNow.ToString("o")
        source               = "MorawareSdkPageViewProbe.ps1"
        classification       = $null
        top_level_error      = $null
        top_level_error_type = $null
        finalization_errors  = $null
        options              = [ordered]@{
            pageview_ids_requested = $pageViewIds
            id_normalize_error     = $idNormalizeError
            list_all_enabled       = $doListAll
            enum_pages_enabled     = $doEnumPages
        }
        credentials          = [ordered]@{
            api_url_configured  = (-not [string]::IsNullOrWhiteSpace($url))
            api_host            = $apiHost
            username_configured = (-not [string]::IsNullOrWhiteSpace($user))
            password_configured = (-not [string]::IsNullOrWhiteSpace($pass))
        }
        reflection           = [ordered]@{
            pageview_type_summary = $null
            page_enum_summary     = $null
            pageview_filter       = $null
        }
        sdk_calls            = [ordered]@{}
        get_pageview_by_id_results = (New-Object System.Collections.Generic.List[object])
        get_pageviews_by_ids_result  = $null
        get_pageviews_catalog        = $null
        get_pageviews_filter_result  = [ordered]@{
            skipped = $true
            reason  = "GetPageViews(PageViewFilter) excluded from this probe allowlist (Connect, Disconnect, GetPageView, GetPageViews, GetPageViewsOfPage, GetPageViewsOfPages only)."
        }
        get_pageviews_of_page_calls  = (New-Object System.Collections.Generic.List[object])
        get_pageviews_of_pages_probe = $null
        matching_pageviews           = (New-Object System.Collections.Generic.List[object])
        metadata_keyword_hit_any     = $false
        recommended_next_step        = ""
        get_pageview_146_success     = $false
    }
}
catch {
    $report = [ordered]@{
        generated_at         = [DateTime]::UtcNow.ToString("o")
        source               = "MorawareSdkPageViewProbe.ps1"
        classification       = "report_construct_failed"
        top_level_error      = $_.Exception.Message
        top_level_error_type = $_.Exception.GetType().FullName
        finalization_errors  = $null
        options              = [ordered]@{
            pageview_ids_requested = [int32[]]@(146)
            id_normalize_error     = $idNormalizeError
            list_all_enabled       = $doListAll
            enum_pages_enabled     = $doEnumPages
        }
        credentials          = [ordered]@{
            api_url_configured  = (-not [string]::IsNullOrWhiteSpace($url))
            api_host            = $apiHost
            username_configured = (-not [string]::IsNullOrWhiteSpace($user))
            password_configured = (-not [string]::IsNullOrWhiteSpace($pass))
        }
        reflection           = [ordered]@{ pageview_type_summary = $null; page_enum_summary = $null; pageview_filter = $null }
        sdk_calls            = [ordered]@{}
        get_pageview_by_id_results = (New-Object System.Collections.Generic.List[object])
        get_pageviews_by_ids_result  = $null
        get_pageviews_catalog        = $null
        get_pageviews_filter_result  = [ordered]@{ skipped = $true; reason = "report_construct_failed" }
        get_pageviews_of_page_calls  = (New-Object System.Collections.Generic.List[object])
        get_pageviews_of_pages_probe = $null
        matching_pageviews           = (New-Object System.Collections.Generic.List[object])
        metadata_keyword_hit_any     = $false
        recommended_next_step        = ""
        get_pageview_146_success     = $false
    }
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

    $pvType = $asm.GetType("Moraware.JobTrackerAPI5.PageView", $false, $false)
    if (-not $pvType) {
        $report["classification"] = "pageview_type_not_found"
        $report["top_level_error"] = "Moraware.JobTrackerAPI5.PageView not found."
        throw
    }

    $pageEnumType = $pvType.GetNestedType("Page_Enum", [System.Reflection.BindingFlags]"Public")
    $filterType = $asm.GetType("Moraware.JobTrackerAPI5.PageViewFilter", $false, $false)

    $report["reflection"]["pageview_type_summary"] = Get-TypeReflectionSummary $pvType 80
    if ($pageEnumType) {
        $report["reflection"]["page_enum_summary"] = Get-TypeReflectionSummary $pageEnumType 200
    }
    if ($filterType) {
        $base = Get-TypeReflectionSummary $filterType 60
        $extra = Get-PageViewFilterReflectionExtra $filterType
        $paramSamples = $null
        if ($extra["has_public_parameterless_ctor"]) {
            $defaults = New-Object System.Collections.Generic.List[object]
            try {
                $fv = [Activator]::CreateInstance($filterType)
                foreach ($prop in $filterType.GetProperties([System.Reflection.BindingFlags]"Public,Instance")) {
                    if (-not $prop.CanRead) { continue }
                    if (-not $prop.CanWrite) { continue }
                    try {
                        $dv = $prop.GetValue($fv)
                        $pvOut = ""
                        if ($null -eq $dv) { $pvOut = "<null>" }
                        elseif ($dv -is [string]) {
                            $sp = New-StringPreview $dv 48
                            $pvOut = "len=" + [string]$sp["length"] + " preview=" + $sp["preview"]
                        }
                        elseif ($dv -is [ValueType] -or $dv -is [decimal]) { $pvOut = Format-Scalar $dv }
                        else { $pvOut = $dv.GetType().FullName }
                        [void]$defaults.Add([ordered]@{ property = $prop.Name; default_like = $pvOut })
                    } catch { }
                }
                $paramSamples = @($defaults.ToArray())
            } catch {
                $paramSamples = @()
            }
        }
        $report["reflection"]["pageview_filter"] = [ordered]@{
            type_full_name = $base["type_full_name"]
            kind           = $base["kind"]
            constructors   = $base["constructors"]
            public_properties = $base["public_properties"]
            settable_properties = $extra["settable_properties"]
            has_public_parameterless_ctor = $extra["has_public_parameterless_ctor"]
            parameterless_instance_property_samples = $paramSamples
        }
    }

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

    $conn = $ctor.Invoke(@($url, $user, $pass, $tracer, [bool]$false, [bool]$false, "eOS Moraware PageView Probe"))
    [void](Invoke-ConnMethod $conn "Connect" ([object[]]@()) ([type[]]@()))
    $connected = $true

    $flags = [System.Reflection.BindingFlags]"Public,Instance"
    $mGetPageViewInt = $connType.GetMethod("GetPageView", $flags, $null, [type[]]@([int32]), $null)
    $mGetPageViews0 = $connType.GetMethod("GetPageViews", $flags, $null, [type[]]@(), $null)
    $mGetPageViewsIntArr = $connType.GetMethod("GetPageViews", $flags, $null, [type[]]@([int[]]), $null)
    $ieIntT = [System.Collections.Generic.IEnumerable[int]]
    $mGetPageViewsEnumInt = $connType.GetMethod("GetPageViews", $flags, $null, [type[]]@($ieIntT), $null)
    $mGetPageViewsOfPage = $null
    $mGetPageViewsOfPages = $null
    if ($pageEnumType) {
        $mGetPageViewsOfPage = $connType.GetMethod("GetPageViewsOfPage", $flags, $null, [type[]]@($pageEnumType), $null)
        $iePageEnumT = [System.Collections.Generic.IEnumerable`1].MakeGenericType(@($pageEnumType))
        $mGetPageViewsOfPages = $connType.GetMethod("GetPageViewsOfPages", $flags, $null, [type[]]@($iePageEnumT), $null)
    }

    $report["sdk_calls"] = [ordered]@{
        get_pageview_int32_resolved            = ($null -ne $mGetPageViewInt)
        get_pageviews_paramless_resolved       = ($null -ne $mGetPageViews0)
        get_pageviews_int_array_resolved       = ($null -ne $mGetPageViewsIntArr)
        get_pageviews_ienumerable_int_resolved = ($null -ne $mGetPageViewsEnumInt)
        get_pageviews_of_page_resolved         = ($null -ne $mGetPageViewsOfPage)
        get_pageviews_of_pages_resolved        = ($null -ne $mGetPageViewsOfPages)
    }

    foreach ($vid in $pageViewIds) {
        $one = [ordered]@{ page_view_id = [int]$vid; ok = $false; error = $null; snapshot = $null; snapshot_error = $null }
        if (-not $mGetPageViewInt) {
            $one["error"] = "GetPageView(int32) overload not found"
            [void]$report["get_pageview_by_id_results"].Add($one)
            continue
        }
        try {
            $pvObj = $mGetPageViewInt.Invoke($conn, @(([int32]$vid)))
            if ($null -eq $pvObj) {
                $one["error"] = "null_pageview_result"
                [void]$report["get_pageview_by_id_results"].Add($one)
                continue
            }
            $snap = New-PageViewSnapshot $pvObj $vid 96
            $one["snapshot"] = $snap
            if ($null -eq $snap) {
                $one["snapshot_error"] = "snapshot_builder_returned_null"
                $one["ok"] = $false
            }
            elseif ($snap["snapshot_error"]) {
                $one["snapshot_error"] = [string]$snap["snapshot_error"]
                $one["ok"] = $false
            }
            else {
                $one["ok"] = $true
            }
        } catch {
            $em = $_.Exception.Message
            if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
            $one["error"] = $em
            $one["snapshot_error"] = $em
            $one["ok"] = $false
        }
        [void]$report["get_pageview_by_id_results"].Add($one)
    }

    $idLen = $pageViewIds.Length
    $idArr = New-Object int32[] $idLen
    [Array]::Copy($pageViewIds, $idArr, $idLen)
    $batch = [ordered]@{ ok = $false; error = $null; count = 0; item_type = $null; snapshots = (New-Object System.Collections.Generic.List[object]) }
    try {
        $batchResult = $null
        if ($mGetPageViewsIntArr) {
            $invokeBatchArgs = New-Object object[] 1
            $invokeBatchArgs[0] = $idArr
            $batchResult = $mGetPageViewsIntArr.Invoke($conn, $invokeBatchArgs)
        }
        elseif ($mGetPageViewsEnumInt) {
            $listInt = New-Object "System.Collections.Generic.List[int32]"
            foreach ($x in $pageViewIds) { [void]$listInt.Add($x) }
            $batchResult = $mGetPageViewsEnumInt.Invoke($conn, @($listInt))
        }
        else {
            throw "no_get_pageviews_batch_overload"
        }
        $batch["ok"] = $true
        $ba = Convert-ToObjectArray $batchResult
        $batch["count"] = $ba.Length
        $batch["item_type"] = (Get-FirstElementTypeName $batchResult)
        foreach ($pvObj in $ba) {
            if ($null -eq $pvObj) { continue }
            $ridGuess = Find-PageViewIdFromObject $pvObj
            $reqForSnap = $null
            foreach ($cand in $pageViewIds) {
                if ($null -ne $ridGuess -and [int]$ridGuess -eq [int]$cand) { $reqForSnap = $cand; break }
            }
            if ($null -eq $reqForSnap -and $pageViewIds.Length -gt 0) { $reqForSnap = $pageViewIds[0] }
            [void]$batch["snapshots"].Add((New-PageViewSnapshot $pvObj $reqForSnap 96))
        }
    } catch {
        $em = $_.Exception.Message
        if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
        $batch["error"] = $em
    }
    $report["get_pageviews_by_ids_result"] = $batch

    if ($doListAll -and $mGetPageViews0) {
        $cat = [ordered]@{ ok = $false; error = $null; total_returned = 0; item_type = $null; rows = (New-Object System.Collections.Generic.List[object]) }
        try {
            $all = $mGetPageViews0.Invoke($conn, @())
            $cat["ok"] = $true
            $ca = Convert-ToObjectArray $all
            $cat["total_returned"] = $ca.Length
            $cat["item_type"] = (Get-FirstElementTypeName $all)
            $hits = New-Object System.Collections.Generic.List[object]
            foreach ($pvObj in $ca) {
                if ($null -eq $pvObj) { continue }
                $snap = New-PageViewSnapshot $pvObj $null 96
                $parsedViewIdFromObject = Find-PageViewIdFromObject $pvObj
                $mk = Test-PageViewMatchesKeywords $snap $nameKeywords $pageKeywords
                $idHit = $false
                foreach ($rid in $pageViewIds) {
                    if ($null -ne $parsedViewIdFromObject -and [int]$parsedViewIdFromObject -eq [int]$rid) { $idHit = $true; break }
                }
                $kwStr = Get-KeywordHitsForSnapshot $snap $nameKeywords $pageKeywords
                [void]$cat["rows"].Add([ordered]@{
                    source       = "GetPageViews"
                    snapshot     = $snap
                    keyword_hits = $kwStr
                })
                $anyHit = $idHit -or $mk["name_hit"] -or $mk["page_hit"] -or $mk["property_string_hit"]
                if ($anyHit) {
                    [void]$hits.Add([ordered]@{
                        page_view_id = (Format-Scalar $snap["parsed_pageview_id"])
                        page_view_name = (Format-Scalar $snap["parsed_name"])
                        page_like = ((Format-Scalar $snap["parsed_page"]) + "|" + (Format-Scalar $snap["parsed_page_enum"]))
                        requested_id_match = $idHit
                        name_keyword_hit = $mk["name_hit"]
                        page_keyword_hit = $mk["page_hit"]
                        property_string_keyword_hit = $mk["property_string_hit"]
                    })
                }
                if ($mk["name_hit"] -or $mk["page_hit"] -or $mk["property_string_hit"]) {
                    $report["metadata_keyword_hit_any"] = $true
                }
            }
            foreach ($h in $hits) {
                [void]$report["matching_pageviews"].Add($h)
            }
        } catch {
            $em = $_.Exception.Message
            if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
            $cat["error"] = $em
        }
        $report["get_pageviews_catalog"] = $cat
    }
    elseif (-not $doListAll) {
        $report["get_pageviews_catalog"] = [ordered]@{ skipped = $true; reason = "MORAWARE_SDK_PAGEVIEW_LIST_ALL disabled"; rows = @() }
    }
    else {
        $report["get_pageviews_catalog"] = [ordered]@{ skipped = $true; reason = "GetPageViews() overload not resolved"; rows = @() }
    }

    if ($doEnumPages -and $mGetPageViewsOfPage -and $pageEnumType) {
        $enumNames = [System.Enum]::GetNames($pageEnumType)
        $callCap = 0
        foreach ($en in $enumNames) {
            if ($en -match "(?i)Calendar|Schedule|Job") {
                try {
                    $ev = [System.Enum]::Parse($pageEnumType, $en)
                    $res = $mGetPageViewsOfPage.Invoke($conn, @($ev))
                    $entry = [ordered]@{ page_enum = $en; ok = $true; error = $null; count = 0; item_type = $null; rows = (New-Object System.Collections.Generic.List[object]) }
                    $ra = Convert-ToObjectArray $res
                    $entry["count"] = $ra.Length
                    $entry["item_type"] = (Get-FirstElementTypeName $res)
                    foreach ($pvObj in $ra) {
                        if ($null -eq $pvObj) { continue }
                        $snap = New-PageViewSnapshot $pvObj $null 96
                        [void]$entry["rows"].Add([ordered]@{
                            source   = ("GetPageViewsOfPage:" + $en)
                            snapshot = $snap
                        })
                    }
                    [void]$report["get_pageviews_of_page_calls"].Add($entry)
                } catch {
                    $em = $_.Exception.Message
                    if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
                    [void]$report["get_pageviews_of_page_calls"].Add([ordered]@{ page_enum = $en; ok = $false; error = $em; count = 0; item_type = $null; rows = @() })
                }
                $callCap++
                if ($callCap -ge 24) { break }
            }
        }
    }

    $ofPagesProbe = [ordered]@{ attempted = $false; ok = $false; error = $null; count = 0; item_type = $null; enums_sent = (New-Object System.Collections.Generic.List[string]); rows = (New-Object System.Collections.Generic.List[object]) }
    if ($doEnumPages -and $mGetPageViewsOfPages -and $pageEnumType) {
        $enumPick = New-Object System.Collections.ArrayList
        foreach ($en in [System.Enum]::GetNames($pageEnumType)) {
            if ($en -match "(?i)Calendar|Schedule|Job") {
                try {
                    [void]$enumPick.Add([System.Enum]::Parse($pageEnumType, $en))
                } catch { }
            }
            if ($enumPick.Count -ge 4) { break }
        }
        if ($enumPick.Count -ge 2) {
            $ofPagesProbe["attempted"] = $true
            try {
                $listType = [System.Collections.Generic.List`1].MakeGenericType(@($pageEnumType))
                $elist = [Activator]::CreateInstance($listType)
                $addM = $listType.GetMethod("Add")
                foreach ($ev in $enumPick) {
                    [void]$addM.Invoke($elist, @($ev))
                    [void]$ofPagesProbe["enums_sent"].Add([string]$ev)
                }
                $invokePagesArgs = New-Object object[] 1
                $invokePagesArgs[0] = $elist
                $pr = $mGetPageViewsOfPages.Invoke($conn, $invokePagesArgs)
                $ofPagesProbe["ok"] = $true
                $pa = Convert-ToObjectArray $pr
                $ofPagesProbe["count"] = $pa.Length
                $ofPagesProbe["item_type"] = (Get-FirstElementTypeName $pr)
                foreach ($pvObj in $pa) {
                    if ($null -eq $pvObj) { continue }
                    $snap = New-PageViewSnapshot $pvObj $null 96
                    [void]$ofPagesProbe["rows"].Add([ordered]@{
                        source   = "GetPageViewsOfPages"
                        snapshot = $snap
                    })
                }
            } catch {
                $em = $_.Exception.Message
                if ($_.Exception.InnerException) { $em = $_.Exception.InnerException.Message }
                $ofPagesProbe["error"] = $em
            }
        }
        else {
            $ofPagesProbe["skipped"] = $true
            $ofPagesProbe["reason"] = "Need at least two Page_Enum names matching Calendar|Schedule|Job for batch OfPages probe"
            $ofPagesProbe["rows"] = @()
        }
    }
    $report["get_pageviews_of_pages_probe"] = $ofPagesProbe

    $g146 = $false
    foreach ($r in $report["get_pageview_by_id_results"]) {
        if ($null -eq $r) { continue }
        if ([int]$r["page_view_id"] -ne 146) { continue }
        if (-not [bool]$r["ok"]) { continue }
        $sn = $r["snapshot"]
        if ($null -eq $sn) { continue }
        if ($sn["snapshot_error"]) { continue }
        $g146 = $true
        break
    }
    $report["get_pageview_146_success"] = $g146

    if (-not $report["metadata_keyword_hit_any"]) {
        foreach ($r in $report["get_pageview_by_id_results"]) {
            if ($null -eq $r -or -not $r["ok"]) { continue }
            $sn = $r["snapshot"]
            if ($null -eq $sn) { continue }
            $mk = Test-PageViewMatchesKeywords $sn $nameKeywords $pageKeywords
            if ($mk["name_hit"] -or $mk["page_hit"] -or $mk["property_string_hit"]) {
                $report["metadata_keyword_hit_any"] = $true
                break
            }
        }
    }

    if (-not $report["metadata_keyword_hit_any"]) {
        $br = $report["get_pageviews_by_ids_result"]
        if ($br -and $br["ok"]) {
            foreach ($sn in $br["snapshots"]) {
                $mk = Test-PageViewMatchesKeywords $sn $nameKeywords $pageKeywords
                if ($mk["name_hit"] -or $mk["page_hit"] -or $mk["property_string_hit"]) {
                    $report["metadata_keyword_hit_any"] = $true
                    break
                }
            }
        }
    }

    $report["recommended_next_step"] = "Correlate PageView id to /sys/calendar?view= via UI or further read-only property drill; if AssigneeId columns exist on PageView rows, join to GetAssignee."

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
    if ($null -eq $report) {
        $report = [ordered]@{
            generated_at    = [DateTime]::UtcNow.ToString("o")
            source          = "MorawareSdkPageViewProbe.ps1"
            classification  = "fatal_no_report"
            top_level_error = "Report object was never initialized."
            options         = [ordered]@{ pageview_ids_requested = [int32[]]@(146); id_normalize_error = $null; list_all_enabled = $true; enum_pages_enabled = $true }
            get_pageview_by_id_results = @()
            matching_pageviews = @()
            get_pageviews_of_page_calls = @()
            get_pageviews_of_pages_probe = $null
            get_pageviews_by_ids_result = $null
            get_pageviews_catalog = $null
            get_pageviews_filter_result = [ordered]@{ skipped = $true; reason = "fatal_no_report" }
            get_pageview_146_success = $false
            metadata_keyword_hit_any = $false
            recommended_next_step = ""
        }
    }

    if ($connected -and $null -ne $conn) {
        try { [void](Invoke-ConnMethod $conn "Disconnect" ([object[]]@()) ([type[]]@())) } catch { }
    }

    $preClass = $report["classification"]
    $finalizeErrors = New-Object System.Collections.ArrayList

    try {
        $report["get_pageview_by_id_results"] = Convert-ToObjectArray $report["get_pageview_by_id_results"]
        $report["matching_pageviews"] = Convert-ToObjectArray $report["matching_pageviews"]
        $ofCallsNorm = Convert-ToObjectArray $report["get_pageviews_of_page_calls"]
        foreach ($ofe in $ofCallsNorm) {
            if ($null -eq $ofe) { continue }
            if ($ofe["rows"]) { $ofe["rows"] = Convert-ToObjectArray $ofe["rows"] }
        }
        $report["get_pageviews_of_page_calls"] = $ofCallsNorm
        if ($report["get_pageviews_catalog"] -and $report["get_pageviews_catalog"]["rows"]) {
            $report["get_pageviews_catalog"]["rows"] = Convert-ToObjectArray $report["get_pageviews_catalog"]["rows"]
        }
        if ($report["get_pageviews_of_pages_probe"] -and $report["get_pageviews_of_pages_probe"]["enums_sent"]) {
            $report["get_pageviews_of_pages_probe"]["enums_sent"] = Convert-ToObjectArray $report["get_pageviews_of_pages_probe"]["enums_sent"]
        }
        if ($report["get_pageviews_of_pages_probe"] -and $report["get_pageviews_of_pages_probe"]["rows"]) {
            $report["get_pageviews_of_pages_probe"]["rows"] = Convert-ToObjectArray $report["get_pageviews_of_pages_probe"]["rows"]
        }
        if ($report["get_pageviews_by_ids_result"] -and $report["get_pageviews_by_ids_result"]["snapshots"]) {
            $report["get_pageviews_by_ids_result"]["snapshots"] = Convert-ToObjectArray $report["get_pageviews_by_ids_result"]["snapshots"]
        }
        if ($report["get_pageviews_filter_result"] -and $report["get_pageviews_filter_result"]["snapshots"]) {
            $report["get_pageviews_filter_result"]["snapshots"] = Convert-ToObjectArray $report["get_pageviews_filter_result"]["snapshots"]
        }
        if ($report["get_pageviews_filter_result"] -and $report["get_pageviews_filter_result"]["parameterless_instance_property_samples"]) {
            $report["get_pageviews_filter_result"]["parameterless_instance_property_samples"] = Convert-ToObjectArray $report["get_pageviews_filter_result"]["parameterless_instance_property_samples"]
        }
    } catch {
        [void]$finalizeErrors.Add("finalize_normalize: " + $_.Exception.Message)
    }

    try {
        Write-Utf8NoBomFile $OutJson ($report | ConvertTo-Json -Depth 28)
    } catch {
        [void]$finalizeErrors.Add("json: " + $_.Exception.Message)
        try {
            Write-Utf8NoBomFile $OutJson '{"classification":"json_write_failed","source":"MorawareSdkPageViewProbe.ps1"}'
        } catch { }
    }

    $txt = New-Object System.Collections.Generic.List[string]
    try {
        [void]$txt.Add("Moraware SDK - PageView probe (read-only)")
        [void]$txt.Add("classification: $($report['classification'])")
        if ($report["top_level_error"]) {
            [void]$txt.Add("top_level_error: $($report['top_level_error'])")
        }
        [void]$txt.Add("pageview_ids_requested: " + (($report["options"]["pageview_ids_requested"] | ForEach-Object { [string]$_ }) -join ","))
        if ($report["options"]["id_normalize_error"]) {
            [void]$txt.Add("id_normalize_error: $($report['options']['id_normalize_error'])")
        }
        [void]$txt.Add("get_pageview_146_success: $($report['get_pageview_146_success'])")
        $pv146snap = $null
        $pv146Row = $null
        foreach ($r in (Convert-ToObjectArray $report["get_pageview_by_id_results"])) {
            if ($null -eq $r) { continue }
            if ([int]$r["page_view_id"] -eq 146) {
                $pv146Row = $r
                $pv146snap = $r["snapshot"]
                break
            }
        }
        [void]$txt.Add("pageview_146 summary:")
        if ($null -eq $pv146Row) {
            [void]$txt.Add("  (no GetPageView result row for id 146)")
        }
        elseif ($null -eq $pv146snap) {
            [void]$txt.Add(("  ok={0} snapshot=null error={1} snapshot_error={2}" -f (Format-Scalar $pv146Row["ok"]), (Format-Scalar $pv146Row["error"]), (Format-Scalar $pv146Row["snapshot_error"])))
        }
        else {
            [void]$txt.Add(("  object_type={0} requested_id={1} parsed_id={2} name={3} title={4} page={5} page_enum={6} snapshot_error={7}" -f `
                (Format-Scalar $pv146snap["object_type"]), (Format-Scalar $pv146snap["requested_id"]), (Format-Scalar $pv146snap["parsed_pageview_id"]), `
                (Format-Scalar $pv146snap["parsed_name"]), (Format-Scalar $pv146snap["parsed_title"]), (Format-Scalar $pv146snap["parsed_page"]), `
                (Format-Scalar $pv146snap["parsed_page_enum"]), (Format-Scalar $pv146snap["snapshot_error"])))
            $props146 = Convert-ToObjectArray $pv146snap["public_properties_sample"]
            [void]$txt.Add("  first_20_public_properties:")
            $lim146 = 0
            foreach ($pe in $props146) {
                if ($lim146 -ge 20) { break }
                [void]$txt.Add(("    {0}" -f (Format-PublicPropSampleOneLine $pe)))
                $lim146++
            }
        }
        $tot = -2
        $gc = $report["get_pageviews_catalog"]
        $catRowCount = 0
        if ($null -ne $gc) {
            if ($gc["skipped"]) { $tot = -1 }
            elseif ($gc.Keys -contains "total_returned") { $tot = [int]$gc["total_returned"] }
            if ($gc["rows"]) { $catRowCount = (Convert-ToObjectArray $gc["rows"]).Length }
        }
        [void]$txt.Add(("total_pageviews_returned: {0}" -f $(if ($tot -eq -1) { "skipped" } elseif ($tot -eq -2) { "n/a" } else { [string]$tot })))
        [void]$txt.Add("catalog_rows: " + [string]$catRowCount)
        $ops = $report["get_pageviews_of_pages_probe"]
        if ($ops) {
            [void]$txt.Add(("get_pageviews_of_pages_probe: attempted={0} ok={1} count={2} error={3}" -f (Format-Scalar $ops["attempted"]), (Format-Scalar $ops["ok"]), (Format-Scalar $ops["count"]), (Format-Scalar $ops["error"])))
        }
        [void]$txt.Add("matching pageviews by name/id/keywords (subset):")
        $mp = Convert-ToObjectArray $report["matching_pageviews"]
        if ($mp.Length -eq 0) {
            [void]$txt.Add("  (none)")
        }
        else {
            foreach ($m in $mp) {
                [void]$txt.Add(("  id={0} name={1} page={2} id_match={3} name_kw={4} page_kw={5} prop_kw={6}" -f `
                    (Format-Scalar $m["page_view_id"]), (Format-Scalar $m["page_view_name"]), (Format-Scalar $m["page_like"]), `
                    (Format-Scalar $m["requested_id_match"]), (Format-Scalar $m["name_keyword_hit"]), (Format-Scalar $m["page_keyword_hit"]), (Format-Scalar $m["property_string_keyword_hit"])))
            }
        }
        [void]$txt.Add("Page_Enum values (reflection):")
        $pen = $report["reflection"]["page_enum_summary"]
        if ($pen -and $pen["enum_values"]) {
            foreach ($ev in $pen["enum_values"]) {
                [void]$txt.Add(("  {0}={1}" -f (Format-Scalar $ev["name"]), (Format-Scalar $ev["value"])))
            }
        }
        else {
            [void]$txt.Add("  (unavailable)")
        }
        [void]$txt.Add("PageViewFilter summary (reflection only; GetPageViews(PageViewFilter) not invoked):")
        $pf = $report["reflection"]["pageview_filter"]
        if ($pf) {
            [void]$txt.Add(("  type={0} parameterless_ctor={1}" -f (Format-Scalar $pf["type_full_name"]), (Format-Scalar $pf["has_public_parameterless_ctor"])))
            $ct = $report["get_pageviews_filter_result"]
            if ($ct -and $ct["reason"]) {
                [void]$txt.Add(("  sdk_filter_call: {0}" -f (Format-Scalar $ct["reason"])))
            }
        }
        else {
            [void]$txt.Add("  (unavailable)")
        }
        [void]$txt.Add(("metadata_keyword_hit_any (Machines/Machine/Calendar/Saw/Polish/Titan/Saber/Robot or page Calendar/Job/Schedule): {0}" -f (Format-Scalar $report["metadata_keyword_hit_any"])))
        [void]$txt.Add("recommended_next_step: " + (Format-Scalar $report["recommended_next_step"]))
        Write-Utf8NoBomFile $OutTxt ($txt -join "`n")
    } catch {
        [void]$finalizeErrors.Add("txt: " + $_.Exception.Message)
    }

    try {
        $csvLines = New-Object System.Collections.Generic.List[string]
        [void]$csvLines.Add("source,requested_id,parsed_pageview_id,name,title,page,page_enum,object_type,keyword_hits,snapshot_error")
        foreach ($r in (Convert-ToObjectArray $report["get_pageview_by_id_results"])) {
            if ($null -eq $r) { continue }
            $reqIdStr = [string]$r["page_view_id"]
            $sn = $r["snapshot"]
            $rowSnapErr = $null
            if ($null -ne $r["snapshot_error"]) { $rowSnapErr = [string]$r["snapshot_error"] }
            if ($null -eq $sn -and [bool]$r["ok"] -and $null -eq $r["error"]) {
                $rowSnapErr = "missing_snapshot_non_null_object_expected"
            }
            [void]$csvLines.Add((Format-PageViewCsvLine "GetPageView" $reqIdStr $sn $rowSnapErr $nameKeywords $pageKeywords))
        }
        $brCsv = $report["get_pageviews_by_ids_result"]
        if ($brCsv -and $brCsv["ok"] -and $brCsv["snapshots"]) {
            foreach ($snB in (Convert-ToObjectArray $brCsv["snapshots"])) {
                if ($null -eq $snB) { continue }
                $reqGuess = $snB["requested_id"]
                [void]$csvLines.Add((Format-PageViewCsvLine "GetPageViews(batch_ids)" $reqGuess $snB $null $nameKeywords $pageKeywords))
            }
        }
        $gcCsv = $report["get_pageviews_catalog"]
        if ($gcCsv -and $gcCsv["rows"]) {
            foreach ($row in (Convert-ToObjectArray $gcCsv["rows"])) {
                if ($null -eq $row) { continue }
                $src = [string]$row["source"]
                if ([string]::IsNullOrEmpty($src)) { $src = "GetPageViews" }
                $snC = $row["snapshot"]
                [void]$csvLines.Add((Format-PageViewCsvLine $src "" $snC $null $nameKeywords $pageKeywords))
            }
        }
        foreach ($ofe in (Convert-ToObjectArray $report["get_pageviews_of_page_calls"])) {
            if ($null -eq $ofe) { continue }
            foreach ($sub in (Convert-ToObjectArray $ofe["rows"])) {
                if ($null -eq $sub) { continue }
                $srcOf = [string]$sub["source"]
                if ([string]::IsNullOrEmpty($srcOf)) { $srcOf = "GetPageViewsOfPage" }
                [void]$csvLines.Add((Format-PageViewCsvLine $srcOf "" $sub["snapshot"] $null $nameKeywords $pageKeywords))
            }
        }
        $opsCsv = $report["get_pageviews_of_pages_probe"]
        if ($opsCsv -and $opsCsv["rows"]) {
            foreach ($sub in (Convert-ToObjectArray $opsCsv["rows"])) {
                if ($null -eq $sub) { continue }
                $srcOps = [string]$sub["source"]
                if ([string]::IsNullOrEmpty($srcOps)) { $srcOps = "GetPageViewsOfPages" }
                [void]$csvLines.Add((Format-PageViewCsvLine $srcOps "" $sub["snapshot"] $null $nameKeywords $pageKeywords))
            }
        }
        Write-Utf8NoBomFile $OutCsv ($csvLines -join "`n")
    } catch {
        [void]$finalizeErrors.Add("csv: " + $_.Exception.Message)
    }

    if ($finalizeErrors.Count -gt 0) {
        $report["finalization_errors"] = Convert-ToObjectArray $finalizeErrors
        if ($preClass -eq "ok") {
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
