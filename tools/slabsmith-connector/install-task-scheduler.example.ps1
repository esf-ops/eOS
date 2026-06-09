# eliteOS Slabsmith Inventory Sync — Task Scheduler example (DISABLED by default)
#
# REVIEW BEFORE ENABLING:
#   1. Copy connector to C:\eliteos-slabsmith-sync
#   2. Create config.json with syncToken + writeEnabled: true (or use --send in action)
#   3. Test manual send once
#   4. Uncomment Register-ScheduledTask below
#
# Task: eliteOS Slabsmith Inventory Sync — every 60 minutes

$TaskName = "eliteOS Slabsmith Inventory Sync"
$ConnectorDir = "C:\eliteos-slabsmith-sync"
$NodeExe = (Get-Command node).Source
$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "sync-slabs.mjs --config config.json --send" -WorkingDirectory $ConnectorDir
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 60) -RepetitionDuration ([TimeSpan]::MaxValue)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Write-Host "Scheduled task example (NOT registered by default)."
Write-Host "Task name: $TaskName"
Write-Host "Working directory: $ConnectorDir"
Write-Host "Command: node sync-slabs.mjs --config config.json --send"
Write-Host ""
Write-Host "To register after review, run as Administrator:"
Write-Host @"
Register-ScheduledTask -TaskName '$TaskName' -Action `$Action -Trigger `$Trigger -Settings `$Settings -Description 'Hourly Slabsmith XML ingest to eliteOS backend' -User `$env:USERNAME
Disable-ScheduledTask -TaskName '$TaskName'   # keep disabled until operator enables
"@

# Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Hourly Slabsmith XML ingest to eliteOS backend"
# Disable-ScheduledTask -TaskName $TaskName
