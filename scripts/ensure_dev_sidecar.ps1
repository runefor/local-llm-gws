param(
    [string]$TargetTriple = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$TauriBinDir = Join-Path $RepoRoot "src-tauri\bin"

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
    if ($IsWindows -or $env:OS -eq "Windows_NT") {
        return ".exe"
    }

    return ""
}

$target = Resolve-TargetTriple
$sidecarPath = Join-Path $TauriBinDir "gws-backend-$target$(Resolve-ExecutableSuffix)"

if (Test-Path -LiteralPath $sidecarPath) {
    Write-Host "Tauri dev sidecar already exists: $sidecarPath"
    exit 0
}

New-Item -ItemType Directory -Force -Path $TauriBinDir | Out-Null
# ponytail: debug builds launch python-backend/main.py directly; this file only satisfies Tauri's externalBin existence check.
Set-Content -LiteralPath $sidecarPath -Value "dev-placeholder: run npm run build:backend before release packaging" -Encoding ASCII
Write-Host "Created Tauri dev sidecar placeholder: $sidecarPath"
