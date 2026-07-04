param(
  [string]$ExePath = "",
  [int]$TimeoutSeconds = 60,
  [switch]$KeepOpen
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "lib\smoke_common.ps1")

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
$windowShown = $false

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
    # tauri decorations:false 창은 OS 타이틀이 비어 있어 제목으로는 판정할 수 없다.
    # 창이 실제로 떴는지는 MainWindowHandle(0이 아님)로 확인한다.
    if ($appProc.MainWindowHandle -ne 0) {
      $windowShown = $true
    }
    if ($appProc.MainWindowTitle) {
      $windowTitle = $appProc.MainWindowTitle
    }
  }

  if ($root -and $rag -and $settings -and $windowShown) {
    break
  }

  Start-Sleep -Milliseconds 500
}

$appProc = Get-Process -Id $app.Id -ErrorAction SilentlyContinue
if ($appProc) {
  $appProc.Refresh()
  if ($appProc.MainWindowHandle -ne 0) {
    $windowShown = $true
  }
}

$backendProcesses = @(Get-GwsBackendProcesses |
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
    windowOk = $windowShown
  }
}

if (-not $KeepOpen) {
  if ($appProc) {
    Stop-Process -Id $appProc.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 800
  Get-GwsBackendProcesses |
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
