# Run in PowerShell as Administrator:
#   Right-click Start > Terminal (Admin), then:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
# Starts Household Finances in the background whenever the PC boots (no window),
# and lets other devices on your home (Private) network reach port 8080.
$ErrorActionPreference = 'Stop'
$dir  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = (Get-Command node).Source
$port = 8080

$action    = New-ScheduledTaskAction -Execute $node -Argument '--disable-warning=ExperimentalWarning server.js' -WorkingDirectory $dir
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
               -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Household Finances' -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'Self-hosted household budget dashboard' -Force | Out-Null

if (-not (Get-NetFirewallRule -DisplayName 'Household Finances' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'Household Finances' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Private | Out-Null
}
Start-ScheduledTask -TaskName 'Household Finances'
Write-Host "Installed. It is running now and will start with Windows. Open http://localhost:$port"
Write-Host "To remove: Unregister-ScheduledTask -TaskName 'Household Finances'; Remove-NetFirewallRule -DisplayName 'Household Finances'"
