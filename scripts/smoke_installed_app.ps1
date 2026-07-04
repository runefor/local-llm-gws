param(
  [string]$InstallerPath = "",
  [int]$TimeoutSeconds = 90,
  [switch]$SkipUninstall
)

$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSEdition -eq "Desktop" -and $env:LOCAL_LLM_GWS_SMOKE_PWSH_RERUN -ne "1") {
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) {
    $env:LOCAL_LLM_GWS_SMOKE_PWSH_RERUN = "1"
    $rerunArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath)
    if ($InstallerPath) {
      $rerunArgs += @("-InstallerPath", $InstallerPath)
    }
    $rerunArgs += @("-TimeoutSeconds", $TimeoutSeconds)
    if ($SkipUninstall) {
      $rerunArgs += "-SkipUninstall"
    }
    & $pwsh.Source @rerunArgs
    exit $LASTEXITCODE
  }
}

. (Join-Path $PSScriptRoot "lib\smoke_common.ps1")

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installerPattern = Join-Path $repo "src-tauri\target\release\bundle\nsis\*-setup.exe"
$defaultInstallLocation = Join-Path $env:LOCALAPPDATA "Local LLM GWS"
$errors = @()
$app = $null
$installLocation = $null
$registryKeyPath = $null
$uninstallCommand = $null

$result = [ordered]@{
  powershellHost = [ordered]@{
    edition = $PSVersionTable.PSEdition
    version = $PSVersionTable.PSVersion.ToString()
    rerunFromWindowsPowerShell = ($env:LOCAL_LLM_GWS_SMOKE_PWSH_RERUN -eq "1")
  }
  installer = $null
  installerPattern = $installerPattern
  installExitCode = $null
  installRegistryHive = $null
  registryKeyPath = $null
  installLocation = $null
  installedExe = $null
  appPid = $null
  appWindowTitle = ""
  backendProcesses = @()
  root = $null
  rag = $null
  settingsKeys = @()
  uninstallCommand = $null
  uninstallExitCode = $null
  checks = [ordered]@{
    installOk = $false
    launchOk = $false
    rootOk = $false
    ragOk = $false
    settingsOk = $false
    windowOk = $false
    gracefulCloseOk = $false
    noZombieBackend = $false
    portReleased = $false
    uninstallOk = if ($SkipUninstall) { $null } else { $false }
    installDirRemoved = if ($SkipUninstall) { $null } else { $false }
  }
  errors = $errors
}

function Add-SmokeError {
  param([string]$Message)
  $script:errors += $Message
  $script:result["errors"] = $script:errors
}

function Split-CommandLine {
  param([string]$CommandLine)

  $trimmed = $CommandLine.Trim()
  if ($trimmed.StartsWith('"') -and $trimmed -match '^"([^"]+)"\s*(.*)$') {
    return [pscustomobject]@{ FilePath = $matches[1]; Arguments = $matches[2] }
  }

  $parts = $trimmed -split '\s+', 2
  return [pscustomobject]@{
    FilePath = $parts[0]
    Arguments = if ($parts.Count -gt 1) { $parts[1] } else { "" }
  }
}

function Remove-RegistryPathQuotes {
  param([string]$Path)

  if (-not $Path) {
    return $Path
  }

  return $Path.Trim().Trim('"')
}

function Get-LocalLlmGwsInstallEntry {
  $roots = @(
    @{ Hive = "HKCU"; Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" },
    @{ Hive = "HKLM"; Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall" },
    @{ Hive = "HKCU-WOW6432Node"; Path = "HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" },
    @{ Hive = "HKLM-WOW6432Node"; Path = "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" }
  )

  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root.Path)) {
      continue
    }

    foreach ($key in Get-ChildItem -LiteralPath $root.Path -ErrorAction SilentlyContinue) {
      $props = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction SilentlyContinue
      if ($props.DisplayName -like "*Local LLM GWS*") {
        [pscustomobject]@{
          Hive = $root.Hive
          KeyPath = $key.PSPath
          DisplayName = $props.DisplayName
          InstallLocation = $props.InstallLocation
          QuietUninstallString = $props.QuietUninstallString
          UninstallString = $props.UninstallString
        }
      }
    }
  }
}

function Find-InstalledExe {
  param([string]$Directory)

  $candidates = @(
    (Join-Path $Directory "local-llm-gws.exe"),
    (Join-Path $Directory "Local LLM GWS.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $exe = Get-ChildItem -LiteralPath $Directory -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*uninst*" -and $_.Name -notlike "*uninstall*" } |
    Select-Object -First 1
  if ($exe) {
    return $exe.FullName
  }

  return $null
}

function Test-DirectoryGoneOrEmpty {
  param([string]$Directory)

  if (-not (Test-Path -LiteralPath $Directory)) {
    return $true
  }

  return $null -eq (Get-ChildItem -LiteralPath $Directory -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
}

try {
  if (-not $InstallerPath) {
    $installer = Get-ChildItem -Path $installerPattern -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if (-not $installer) {
      throw "Installer not found by pattern: $installerPattern"
    }
    $InstallerPath = $installer.FullName
  }

  $InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
  $result["installer"] = $InstallerPath

  $existingInstallEntries = @(Get-LocalLlmGwsInstallEntry |
    Where-Object { $null -ne $_ -and $_.DisplayName -like "*Local LLM GWS*" })
  $existingInstallEntryFound = ($existingInstallEntries.Count -gt 0)
  $defaultInstallLocationExists = [bool](Test-Path -LiteralPath $defaultInstallLocation)
  if ($existingInstallEntryFound -or $defaultInstallLocationExists) {
    $existingInstallSummary = ($existingInstallEntries | ForEach-Object { "$($_.Hive):$($_.KeyPath)" }) -join "; "
    throw "Preflight failed: Local LLM GWS is already installed or has a stale uninstall entry. Uninstall it before running this smoke test. registryEntry=$existingInstallEntryFound installDir=$defaultInstallLocationExists path=$defaultInstallLocation registryMatches=$existingInstallSummary"
  }
  if (-not (Test-PortFree 18731)) {
    throw "Preflight failed: http://127.0.0.1:18731/ is already responding."
  }
  if ((Get-GwsBackendProcesses).Count -gt 0) {
    throw "Preflight failed: gws-backend process is already running."
  }
  if (@(Get-Process local-llm-gws -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "Preflight failed: local-llm-gws process is already running."
  }

  try {
    $installProcess = Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait -PassThru
    $result["installExitCode"] = $installProcess.ExitCode
  } catch {
    Add-SmokeError "Install failed to start or wait: $($_.Exception.Message)"
  }

  if ($result.installExitCode -eq 0) {
    $entry = @()
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
      $entry = @(Get-LocalLlmGwsInstallEntry | Where-Object { $_.InstallLocation } | Select-Object -First 1)
      if ($entry.Count -gt 0) {
        $candidateLocation = Remove-RegistryPathQuotes -Path $entry[0].InstallLocation
        if (Test-Path -LiteralPath $candidateLocation) {
          break
        }
      }
      Start-Sleep -Milliseconds 500
    }
    if ($entry.Count -eq 0) {
      Add-SmokeError "Install registry entry not found for DisplayName '*Local LLM GWS*'."
    } else {
      $entry = $entry[0]
      $installLocation = Remove-RegistryPathQuotes -Path $entry.InstallLocation
      $registryKeyPath = $entry.KeyPath
      $uninstallCommand = if ($entry.QuietUninstallString) {
        $entry.QuietUninstallString
      } elseif ($entry.UninstallString) {
        "$($entry.UninstallString) /S"
      } else {
        $null
      }
      $result["installRegistryHive"] = $entry.Hive
      $result["registryKeyPath"] = $registryKeyPath
      $result["installLocation"] = $installLocation
      $result["uninstallCommand"] = $uninstallCommand
      $result.checks["installOk"] = (Test-Path -LiteralPath $installLocation)
    }
  } else {
    Add-SmokeError "Silent install returned exit code $($result.installExitCode)."
  }

  if ($result.checks.installOk) {
    $installedExe = Find-InstalledExe -Directory $installLocation
    $result["installedExe"] = $installedExe
    if (-not $installedExe) {
      Add-SmokeError "Installed executable not found under InstallLocation: $installLocation"
    } else {
      try {
        $app = Start-Process -FilePath $installedExe -PassThru
        $result["appPid"] = $app.Id
        $result.checks["launchOk"] = [bool](Get-Process -Id $app.Id -ErrorAction SilentlyContinue)
      } catch {
        Add-SmokeError "Installed app launch failed: $($_.Exception.Message)"
      }
    }
  }

  if ($result.checks.launchOk) {
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

    $finalWindowTitle = if ($appProc -and $appProc.MainWindowTitle) {
      $appProc.MainWindowTitle
    } else {
      $windowTitle
    }

    $result["appWindowTitle"] = $finalWindowTitle
    $result["backendProcesses"] = @(Get-GwsBackendProcesses | Select-Object Id, ProcessName, MainWindowTitle)
    $result["root"] = $root
    $result["rag"] = $rag
    $result["settingsKeys"] = if ($settings) { @($settings.PSObject.Properties.Name) } else { @() }
    $result.checks["rootOk"] = ($root.status -eq "ok")
    $result.checks["ragOk"] = ($rag.status -eq "success")
    $result.checks["settingsOk"] = ($null -ne $settings)
    $result.checks["windowOk"] = $windowShown

    if ($appProc) {
      $result.checks["gracefulCloseOk"] = Stop-AppGracefully -Process $appProc
    }

    Start-Sleep -Seconds 3
    $result.checks["noZombieBackend"] = ((Get-GwsBackendProcesses).Count -eq 0)
    $result.checks["portReleased"] = Test-PortFree 18731
  }

  if (-not $SkipUninstall -and $uninstallCommand) {
    try {
      $uninstall = Split-CommandLine -CommandLine $uninstallCommand
      $uninstallProcess = Start-Process -FilePath $uninstall.FilePath -ArgumentList $uninstall.Arguments -Wait -PassThru
      $result["uninstallExitCode"] = $uninstallProcess.ExitCode
    } catch {
      Add-SmokeError "Uninstall failed to start or wait: $($_.Exception.Message)"
    }

    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
      if (Test-DirectoryGoneOrEmpty -Directory $installLocation) {
        $result.checks["installDirRemoved"] = $true
        break
      }
      Start-Sleep -Milliseconds 500
    }

    $result.checks["uninstallOk"] = if ($registryKeyPath) { -not (Test-Path -LiteralPath $registryKeyPath) } else { $false }
  } elseif (-not $SkipUninstall) {
    Add-SmokeError "Uninstall command not found in registry entry."
  }
} catch {
  Add-SmokeError $_.Exception.Message
} finally {
  if ($app) {
    $remainingApp = Get-Process -Id $app.Id -ErrorAction SilentlyContinue
    if ($remainingApp) {
      Stop-AppGracefully -Process $remainingApp | Out-Null
    }
  }

  if (-not $SkipUninstall -and $result.checks.installOk -and $result.checks.uninstallOk -ne $true -and $uninstallCommand) {
    try {
      $uninstall = Split-CommandLine -CommandLine $uninstallCommand
      Start-Process -FilePath $uninstall.FilePath -ArgumentList $uninstall.Arguments -Wait -PassThru | Out-Null
      $deadline = (Get-Date).AddSeconds(30)
      while ((Get-Date) -lt $deadline) {
        if (Test-DirectoryGoneOrEmpty -Directory $installLocation) {
          $result.checks["installDirRemoved"] = $true
          break
        }
        Start-Sleep -Milliseconds 500
      }
      $result.checks["uninstallOk"] = if ($registryKeyPath) { -not (Test-Path -LiteralPath $registryKeyPath) } else { $false }
    } catch {
      Add-SmokeError "Final cleanup uninstall failed: $($_.Exception.Message)"
    }
  }

  $result | ConvertTo-Json -Depth 6

  $failed = $false
  foreach ($check in $result.checks.GetEnumerator()) {
    if ($null -ne $check.Value -and $check.Value -eq $false) {
      $failed = $true
      break
    }
  }

  if ($failed) {
    exit 1
  }
  exit 0
}
