# eliteOS Slabsmith Image Upload — Task Scheduler example (DISABLED by default)
#
# REVIEW BEFORE ENABLING:
#   1. Inventory sync already succeeding (XML --send)
#   2. Manual: node sync-images.mjs --config config.json --plan-upload
#   3. Manual: node sync-images.mjs --config config.json --upload --limit 5
#   4. Full upload once, then schedule
#
# Task: eliteOS Slabsmith Image Upload — every 6 hours

$TaskName = "eliteOS Slabsmith Image Upload"
$ConnectorDir = "C:\eliteos-slabsmith-sync"
$NodeExe = (Get-Command node).Source
$Action = New-ScheduledTaskAction `
  -Execute $NodeExe `
  -Argument "sync-images.mjs --config config.json --upload" `
  -WorkingDirectory $ConnectorDir
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Hours 6) `
  -RepetitionDuration ([TimeSpan]::MaxValue)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Write-Host "Scheduled task example (NOT registered by default)."
Write-Host "Task name: $TaskName"
Write-Host "Working directory: $ConnectorDir"
Write-Host "Command: node sync-images.mjs --config config.json --upload"
Write-Host ""
Write-Host "To register after review, run as Administrator:"
Write-Host @"
Register-ScheduledTask -TaskName '$TaskName' -Action `$Action -Trigger `$Trigger -Settings `$Settings -Description 'Slabsmith local JPG upload to eliteOS' -User `$env:USERNAME
Disable-ScheduledTask -TaskName '$TaskName'   # keep disabled until operator enables
"@

# Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Slabsmith local JPG upload to eliteOS"
# Disable-ScheduledTask -TaskName $TaskName
