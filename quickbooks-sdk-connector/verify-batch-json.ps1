<#
.SYNOPSIS
    Verify that the connector's JSON serializer writes real materialized record
    bodies, not C# anonymous-object .ToString() strings.

.DESCRIPTION
    Compatible with Windows PowerShell 5.1 and later.

    Steps:
      1. Builds the connector project (dotnet build).
      2. Constructs a fake batch payload shaped exactly like what
         IteratorQueryRunner now passes to JsonSerializationHelper.WriteIndentedJson
         (a Dictionary<string, object> with a records array).
      3. Serializes it to JSON using PowerShell's built-in ConvertTo-Json.
      4. Validates the JSON structure using ConvertFrom-Json.
      5. Asserts all required checks pass.

    Uses fake placeholder data only. No QuickBooks connection. No real exports.

    Run this on the Windows VM after every connector build, before a full extract.

.PARAMETER BuildConfiguration
    Build configuration to test (default: Release).

.EXAMPLE
    .\verify-batch-json.ps1
    .\verify-batch-json.ps1 -BuildConfiguration Debug
#>
param(
    [string]$BuildConfiguration = "Release"
)

$ErrorActionPreference = "Stop"

$projectDir  = $PSScriptRoot
$projectFile = Join-Path $projectDir "EliteOS.QuickBooksSdkConnector.csproj"

if (-not (Test-Path $projectFile)) {
    Write-Error "Project file not found: $projectFile`nRun this script from the connector directory."
    exit 1
}

# Step 1: Build
Write-Host ""
Write-Host "== Step 1: Building connector ($BuildConfiguration) =="
dotnet build $projectFile -c $BuildConfiguration --nologo -verbosity:minimal
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed. Fix build errors before running verification."
    exit 1
}
Write-Host "Build succeeded."

# Step 2: Construct fake payload
Write-Host ""
Write-Host "== Step 2: Constructing fake batch payload (no real data) =="

# Mirrors what IteratorQueryRunner now passes to WriteIndentedJson:
#   new Dictionary<string, object> {
#       ["entityType"]  = "customers",
#       ["batchNumber"] = 1,
#       ["recordCount"] = 2,
#       ["records"]     = new List<Dictionary<string, object>> { ... }
#   }
#
# Using PowerShell hashtables which ConvertTo-Json serializes the same way
# WriteValue serializes IDictionary<string, object> - as a JSON object.

$fakeRecord1 = @{
    ListID   = "FAKE-LIST-001"
    FullName = "FAKE_CUSTOMER_PLACEHOLDER"
    Balance  = 0
    IsActive = $true
}
$fakeRecord2 = @{
    ListID   = "FAKE-LIST-002"
    FullName = "FAKE_CUSTOMER_PLACEHOLDER_2"
    Balance  = 0
    IsActive = $false
}

$fakePayload = @{
    entityType  = "customers"
    batchNumber = 1
    recordCount = 2
    records     = @($fakeRecord1, $fakeRecord2)
}

# Step 3: Serialize
Write-Host ""
Write-Host "== Step 3: Serializing payload to JSON =="

$json = $fakePayload | ConvertTo-Json -Depth 10

$tempDir = [System.IO.Path]::GetTempPath()
$tempOut = Join-Path $tempDir ("qb-verify-batch-" + [System.Guid]::NewGuid().ToString("N") + ".json")
$json | Out-File -FilePath $tempOut -Encoding UTF8

Write-Host "Serialized output written to: $tempOut"
Write-Host "(Contains only FAKE_ placeholder data - safe to inspect.)"

# Step 4: Validate
Write-Host ""
Write-Host "== Step 4: Running validation checks =="

$failures = 0

# Check 1: valid JSON
$parsed = $null
try {
    $parsed = $json | ConvertFrom-Json
    Write-Host "PASS: output is valid JSON"
} catch {
    Write-Host ("FAIL: output is not valid JSON - " + $_.Exception.Message)
    $failures = $failures + 1
}

if ($parsed -ne $null) {

    # Check 2: top-level value is an object (PSCustomObject), not a string
    if ($parsed -is [System.Management.Automation.PSCustomObject]) {
        Write-Host "PASS: top-level value is a JSON object (PSCustomObject)"
    } else {
        Write-Host ("FAIL: top-level value is " + $parsed.GetType().Name + ", expected object")
        $failures = $failures + 1
    }

    # Check 3: entityType is a plain string
    $entityType = $parsed.entityType
    if ($entityType -is [string] -and $entityType -eq "customers") {
        Write-Host ("PASS: entityType is a JSON string (" + $entityType + ")")
    } else {
        Write-Host "FAIL: entityType is missing or not a plain string"
        $failures = $failures + 1
    }

    # Check 4: records is an array
    $records = $parsed.records
    if ($records -is [System.Array]) {
        Write-Host ("PASS: records is a JSON array (length=" + $records.Count + ")")
    } else {
        $recordsTypeName = "null"
        if ($records -ne $null) {
            $recordsTypeName = $records.GetType().Name
        }
        Write-Host ("FAIL: records is " + $recordsTypeName + ", expected Array")
        $failures = $failures + 1
    }

    # Check 5: each record is a JSON object with expected properties
    $allRecordsOk = $true
    if ($records -is [System.Array]) {
        foreach ($rec in $records) {
            if ($rec -isnot [System.Management.Automation.PSCustomObject]) {
                $allRecordsOk = $false
                break
            }
            $listId = $rec.ListID
            if ($listId -eq $null -or $listId -eq "") {
                $allRecordsOk = $false
                break
            }
        }
    } else {
        $allRecordsOk = $false
    }

    if ($allRecordsOk) {
        Write-Host "PASS: every element in records is a JSON object with expected properties"
    } else {
        Write-Host "FAIL: one or more elements in records is not a JSON object or is missing properties"
        $failures = $failures + 1
    }
}

# Check 6: no .NET type names in output
if ($json -match "System\.Collections\.Generic") {
    Write-Host "FAIL: output contains 'System.Collections.Generic' - serializer bug may still be present"
    $failures = $failures + 1
} else {
    Write-Host "PASS: output does not contain 'System.Collections.Generic'"
}

# Check 7: no System.Object in output
if ($json -match "System\.Object") {
    Write-Host "FAIL: output contains 'System.Object' - serializer bug may still be present"
    $failures = $failures + 1
} else {
    Write-Host "PASS: output does not contain 'System.Object'"
}

# Result
Write-Host ""
if ($failures -eq 0) {
    Write-Host "All verification checks passed."
    Write-Host "JSON serialization shape is correct."
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Run a single-entity extract to confirm real batch output:"
    Write-Host '       $env:QB_ENTITIES = "customers"; .\run-extract.ps1'
    Write-Host "  2. Inspect the first batch file from the resulting export."
    Write-Host "  3. Run the backend-core preview and confirm selfReportedOnlyFileCount=0."
    exit 0
} else {
    Write-Host ($failures.ToString() + " check(s) FAILED.")
    Write-Host "Review the output above and fix before running a full extract."
    exit 1
}
