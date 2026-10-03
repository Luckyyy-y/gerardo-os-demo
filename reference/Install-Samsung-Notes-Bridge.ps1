[CmdletBinding()]
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$ProtocolRoot = "HKCU:\Software\Classes\gerardo-notes"
$BridgeDirectory = Join-Path $env:LOCALAPPDATA "GerardoOS"
$BridgePath = Join-Path $BridgeDirectory "Open-Samsung-Notes.ps1"

if ($Uninstall) {
    if (Test-Path $ProtocolRoot) {
        Remove-Item $ProtocolRoot -Recurse -Force
    }
    if (Test-Path $BridgeDirectory) {
        Remove-Item $BridgeDirectory -Recurse -Force
    }
    Write-Host "Gerardo OS Samsung Notes bridge removed." -ForegroundColor Green
    exit 0
}

New-Item -ItemType Directory -Path $BridgeDirectory -Force | Out-Null

$BridgeScript = @'
$ErrorActionPreference = "Stop"
$package = Get-AppxPackage -Name "*SamsungNotes*" | Sort-Object Version -Descending | Select-Object -First 1

if (-not $package) {
    Start-Process "ms-windows-store://pdp/?productid=9NBLGGH43VHV"
    exit 0
}

$manifest = Get-AppxPackageManifest -Package $package.PackageFullName
$application = $manifest.Package.Applications.Application | Select-Object -First 1
$aumid = "$($package.PackageFamilyName)!$($application.Id)"
Start-Process "explorer.exe" -ArgumentList "shell:AppsFolder\$aumid"
'@

Set-Content -Path $BridgePath -Value $BridgeScript -Encoding UTF8

New-Item -Path $ProtocolRoot -Force | Out-Null
Set-Item -Path $ProtocolRoot -Value "URL:Gerardo OS Samsung Notes Bridge"
New-ItemProperty -Path $ProtocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$ProtocolRoot\DefaultIcon" -Force | Out-Null
Set-Item -Path "$ProtocolRoot\DefaultIcon" -Value "shell32.dll,70"
New-Item -Path "$ProtocolRoot\shell\open\command" -Force | Out-Null
$Command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$BridgePath`" `"%1`""
Set-Item -Path "$ProtocolRoot\shell\open\command" -Value $Command

Write-Host "Samsung Notes is connected to Gerardo OS." -ForegroundColor Green
Write-Host "You can close this window and return to the dashboard."
