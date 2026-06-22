param(
  [string]$ExePath = "",
  [int]$TimeoutSeconds = 60,
  [switch]$KeepOpen
)

$ErrorActionPreference = "Stop"

function Wait-JsonEndpoint {
  param(
    [string]$Uri,
    [datetime]$Deadline
  )

  while ((Get-Date) -lt $Deadline) {
    try {
      return Invoke-RestMethod -Uri $Uri -TimeoutSec 2
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  return $null
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $ExePath) {
  $ExePath = Join-Path $repo "src-tauri\target\release\local-llm-gws.exe"
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Release exe not found: $ExePath"
}

$app = Start-Process -FilePath $ExePath -PassThru
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$root = $null
$rag = $null
$settings = $null
$windowTitle = ""

while ((Get-Date) -lt $deadline) {
  if ($null -eq $root) {
    $root = Wait-JsonEndpoint -Uri "http://127.0.0.1:18731/" -Deadline (Get-Date).AddSeconds(2)
  }
  if ($null -eq $rag) {
    $rag = Wait-JsonEndpoint -Uri "http://127.0.0.1:18731/api/rag/status" -Deadline (Get-Date).AddSeconds(2)
  }
  if ($null -eq $settings) {
    $settings = Wait-JsonEndpoint -Uri "http://127.0.0.1:18731/api/settings" -Deadline (Get-Date).AddSeconds(2)
  }

  $appProc = Get-Process -Id $app.Id -ErrorAction SilentlyContinue
  if ($appProc) {
    $appProc.Refresh()
    if ($appProc.MainWindowTitle) {
      $windowTitle = $appProc.MainWindowTitle
    }
  }

  if ($root -and $rag -and $settings -and $windowTitle) {
    break
  }

  Start-Sleep -Milliseconds 500
}

$appProc = Get-Process -Id $app.Id -ErrorAction SilentlyContinue
if ($appProc) {
  $appProc.Refresh()
}

$backendProcesses = @(Get-Process gws-backend* -ErrorAction SilentlyContinue |
  Select-Object Id, ProcessName, MainWindowTitle)
$finalWindowTitle = if ($appProc -and $appProc.MainWindowTitle) {
  $appProc.MainWindowTitle
} else {
  $windowTitle
}

$result = [ordered]@{
  releaseExe = $ExePath
  appStarted = [bool]$appProc
  appPid = if ($appProc) { $appProc.Id } else { $null }
  appWindowTitle = $finalWindowTitle
  backendProcesses = $backendProcesses
  root = $root
  rag = $rag
  settingsKeys = if ($settings) { @($settings.PSObject.Properties.Name) } else { @() }
  checks = [ordered]@{
    rootOk = ($root.status -eq "ok")
    ragOk = ($rag.status -eq "success")
    settingsOk = ($null -ne $settings)
    windowOk = [bool]$finalWindowTitle
  }
}

if (-not $KeepOpen) {
  if ($appProc) {
    Stop-Process -Id $appProc.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 800
  Get-Process gws-backend* -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

  Start-Sleep -Milliseconds 500
  $portClean = $true
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:18731/" -TimeoutSec 1 | Out-Null
    $portClean = $false
  } catch {
    $portClean = $true
  }
  $result["portCleanAfterClose"] = $portClean
}

$result | ConvertTo-Json -Depth 6
