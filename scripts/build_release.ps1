param(
    [switch]$SkipNpmCi
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$InstallerDir = Join-Path $RepoRoot "src-tauri\target\release\bundle\nsis"
$TauriBinDir = Join-Path $RepoRoot "src-tauri\bin"
$ReleaseExe = Join-Path $RepoRoot "src-tauri\target\release\local-llm-gws.exe"
$LlamaManifestPath = Join-Path $TauriBinDir "llama-manifest.json"
$PwshExe = Join-Path $PSHOME "pwsh.exe"

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

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required for the Windows release build."
    }
}

function Assert-GoogleOAuthClientConfig {
    param([string]$Path)

    if (-not $Path -or $Path.Trim().Length -eq 0) {
        throw "GOOGLE_OAUTH_CLIENT_CONFIG_PATH is required for release builds."
    }

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "GOOGLE_OAUTH_CLIENT_CONFIG_PATH does not point to a file."
    }

    try {
        $json = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    } catch {
        throw "GOOGLE_OAUTH_CLIENT_CONFIG_PATH must contain valid JSON."
    }

    if ($null -eq $json.installed) {
        throw "Google OAuth JSON is missing field: installed"
    }

    foreach ($field in @("client_id", "client_secret", "auth_uri", "token_uri", "redirect_uris")) {
        if (-not $json.installed.$field) {
            throw "Google OAuth JSON is missing field: installed.$field"
        }
    }

    $redirects = @($json.installed.redirect_uris)
    if (-not ($redirects | Where-Object { $_ -match '^http://(localhost|127\.0\.0\.1)(:\d+)?(/|$)' })) {
        throw "Google OAuth JSON is missing loopback redirect metadata."
    }
}

function Resolve-TargetTriple {
    $hostLine = (& rustc -vV) | Where-Object { $_ -like "host:*" } | Select-Object -First 1
    if ($null -eq $hostLine) {
        throw "rustc -vV output did not include a host target triple."
    }
    return $hostLine.Substring("host:".Length).Trim()
}

function Assert-ReleaseArtifacts {
    $targetTriple = Resolve-TargetTriple
    $sidecar = Join-Path $TauriBinDir "gws-backend-$targetTriple.exe"

    foreach ($path in @($sidecar, $ReleaseExe)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Expected release artifact was not created: $path"
        }
    }

    Write-Host "Sidecar: $sidecar"
    Write-Host "Release executable: $ReleaseExe"
}

function Assert-LlamaRuntime {
    if (-not (Test-Path -LiteralPath $LlamaManifestPath -PathType Leaf)) {
        throw "Pinned llama.cpp manifest was not created."
    }

    $manifest = Get-Content -Raw -LiteralPath $LlamaManifestPath | ConvertFrom-Json
    if ($manifest.tag -ne "b10088" -or
        $manifest.expectedSha256 -ne "ced37906bfa57dca6079b0e66163edc4f319b43ba8260bda5427fbd20a08324b" -or
        $manifest.actualSha256 -ne $manifest.expectedSha256) {
        throw "Pinned llama.cpp manifest does not match the release contract."
    }

    foreach ($file in @($manifest.files)) {
        $path = Join-Path $TauriBinDir $file
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Expected llama.cpp artifact was not created: $path"
        }
    }

    Invoke-CheckedNative { & (Join-Path $TauriBinDir "llama-server.exe") --version } "llama-server --version"
}

function Assert-SingleInstaller {
    if (-not (Test-Path -LiteralPath $InstallerDir)) {
        throw "NSIS installer directory was not created."
    }

    $installers = @(Get-ChildItem -LiteralPath $InstallerDir -Filter "*-setup.exe" -File)
    if ($installers.Count -ne 1) {
        throw "Expected exactly one NSIS installer, found $($installers.Count)."
    }

    $hash = (Get-FileHash -LiteralPath $installers[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "Installer: $($installers[0].FullName)"
    Write-Host "Installer size: $($installers[0].Length) bytes"
    Write-Host "Installer SHA256: $hash"
}

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "PowerShell 7+ is required. Run this script with pwsh."
}
if (-not $IsWindows) {
    throw "release:windows must run on Windows."
}

Set-Location $RepoRoot

Write-Host "[release:windows] stage=preflight"
Assert-Command "node"
Assert-Command "npm"
Assert-Command "rustc"
Assert-Command "cargo"
Assert-Command "uv"
Assert-GoogleOAuthClientConfig -Path $env:GOOGLE_OAUTH_CLIENT_CONFIG_PATH

Write-Host "[release:windows] stage=npm-ci"
if (-not $SkipNpmCi) {
    Invoke-CheckedNative { npm ci } "npm ci"
}

Write-Host "[release:windows] stage=llama"
Invoke-CheckedNative {
    & $PwshExe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "prepare_llama_server.ps1") -Force
} "prepare_llama_server"
Assert-LlamaRuntime

Write-Host "[release:windows] stage=tauri-build"
Invoke-CheckedNative { npm run build:desktop } "npm run build:desktop"
Assert-ReleaseArtifacts
Write-Host "[release:windows] stage=nsis"
Assert-SingleInstaller
