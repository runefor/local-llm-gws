param(
    [string]$TargetTriple = "",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $RepoRoot "python-backend"
$TauriBinDir = Join-Path $RepoRoot "src-tauri\bin"
$SidecarBaseName = "gws-backend"
$ReleaseRequirements = Join-Path $BackendDir "requirements-release.txt"

if (-not $env:UV_CACHE_DIR) {
    $env:UV_CACHE_DIR = Join-Path $RepoRoot ".uv-cache"
}

function Invoke-CheckedNative {
    param(
        [scriptblock]$Command,
        [string]$Label
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

function Resolve-TargetTriple {
    if ($TargetTriple.Trim().Length -gt 0) {
        return $TargetTriple.Trim()
    }

    $rustVersion = & rustc -vV
    $hostLine = $rustVersion | Where-Object { $_ -like "host:*" } | Select-Object -First 1
    if ($null -eq $hostLine) {
        throw "rustc -vV output did not include a host target triple."
    }

    return $hostLine.Substring("host:".Length).Trim()
}

function Resolve-ExecutableSuffix {
    if ($env:OS -eq "Windows_NT" -or [System.Environment]::OSVersion.Platform -eq "Win32NT") {
        return ".exe"
    }

    return ""
}

if (-not (Test-Path -LiteralPath $BackendDir)) {
    throw "Backend directory not found: $BackendDir"
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required to build the Python sidecar. Install uv first, then rerun this script."
}

if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
    throw "rustc is required to infer the Tauri target triple. Pass -TargetTriple to override."
}

$resolvedTarget = Resolve-TargetTriple
$exeSuffix = Resolve-ExecutableSuffix
$distBinary = Join-Path $BackendDir "dist\$SidecarBaseName$exeSuffix"
$sidecarBinary = Join-Path $TauriBinDir "$SidecarBaseName-$resolvedTarget$exeSuffix"

New-Item -ItemType Directory -Force -Path $TauriBinDir | Out-Null

Push-Location $BackendDir
try {
    if (-not $SkipInstall) {
        if (-not (Test-Path -LiteralPath ".venv")) {
            Invoke-CheckedNative { uv venv } "uv venv"
        }

        Invoke-CheckedNative { uv pip install -r $ReleaseRequirements } "uv pip install release requirements"
    }

    Invoke-CheckedNative { uv run pyinstaller --noconfirm --clean gws-backend.spec } "PyInstaller"
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $distBinary)) {
    throw "PyInstaller did not create expected binary: $distBinary"
}

Copy-Item -LiteralPath $distBinary -Destination $sidecarBinary -Force
Write-Host "Built Tauri sidecar: $sidecarBinary"
