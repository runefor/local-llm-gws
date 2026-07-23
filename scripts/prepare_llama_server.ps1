param (
    [switch]$Force,
    [string]$ArchivePath = ""
)

$ErrorActionPreference = "Stop"

$LlamaTag = "b10088"
$AssetName = "llama-b10088-bin-win-vulkan-x64.zip"
$ArchiveSha256 = "ced37906bfa57dca6079b0e66163edc4f319b43ba8260bda5427fbd20a08324b"
$DownloadUrl = "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaTag/$AssetName"
$RequiredFiles = @(
    "llama-server.exe",
    "ggml.dll",
    "ggml-base.dll",
    "ggml-cpu-alderlake.dll",
    "ggml-cpu-cannonlake.dll",
    "ggml-cpu-cascadelake.dll",
    "ggml-cpu-cooperlake.dll",
    "ggml-cpu-haswell.dll",
    "ggml-cpu-icelake.dll",
    "ggml-cpu-ivybridge.dll",
    "ggml-cpu-piledriver.dll",
    "ggml-cpu-sandybridge.dll",
    "ggml-cpu-sapphirerapids.dll",
    "ggml-cpu-skylakex.dll",
    "ggml-cpu-sse42.dll",
    "ggml-cpu-x64.dll",
    "ggml-cpu-zen4.dll",
    "ggml-rpc.dll",
    "ggml-vulkan.dll",
    "libomp140.x86_64.dll",
    "llama.dll",
    "llama-common.dll",
    "llama-server-impl.dll",
    "mtmd.dll"
)

$BinDir = Join-Path -Path $PSScriptRoot -ChildPath "..\src-tauri\bin"
$ManifestPath = Join-Path -Path $BinDir -ChildPath "llama-manifest.json"
$TempDir = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath "llama_cpp_$([System.Guid]::NewGuid().ToString('N'))"

function Assert-LlamaArchiveHash {
    param([string]$Path)

    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "llama.cpp tag: $LlamaTag"
    Write-Host "llama.cpp asset: $AssetName"
    Write-Host "Expected SHA256: $ArchiveSha256"
    Write-Host "Actual SHA256:   $actual"
    if ($actual -ne $ArchiveSha256) {
        throw "llama.cpp archive SHA256 mismatch."
    }
    return $actual
}

function Test-PreparedInventory {
    if (-not (Test-Path -LiteralPath $ManifestPath)) {
        return $false
    }

    try {
        $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
    } catch {
        return $false
    }

    if ($manifest.tag -ne $LlamaTag -or
        $manifest.asset -ne $AssetName -or
        $manifest.expectedSha256 -ne $ArchiveSha256 -or
        $manifest.actualSha256 -ne $ArchiveSha256) {
        return $false
    }

    foreach ($file in $RequiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path -Path $BinDir -ChildPath $file))) {
            return $false
        }
    }

    return $true
}

if ((-not $Force) -and (Test-PreparedInventory)) {
    Write-Host "Pinned llama.cpp $LlamaTag inventory already exists in $BinDir."
    exit 0
}

try {
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
    $zipPath = Join-Path -Path $TempDir -ChildPath $AssetName

    if ($ArchivePath.Trim().Length -gt 0) {
        $resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
        Copy-Item -LiteralPath $resolvedArchive -Destination $zipPath -Force
        Write-Host "Using supplied llama.cpp archive."
    } else {
        Write-Host "Downloading pinned llama.cpp archive: $DownloadUrl"
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $zipPath -UseBasicParsing
    }

    $actualHash = Assert-LlamaArchiveHash -Path $zipPath

    $ExtractDir = Join-Path -Path $TempDir -ChildPath "extract"
    New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
    Expand-Archive -LiteralPath $zipPath -DestinationPath $ExtractDir -Force

    $server = Get-ChildItem -LiteralPath $ExtractDir -Recurse -File -Filter "llama-server.exe" |
        Select-Object -First 1
    if ($null -eq $server) {
        throw "llama-server.exe was not found in $AssetName."
    }

    $BuildDirPath = $server.Directory.FullName
    foreach ($file in $RequiredFiles) {
        $source = Join-Path -Path $BuildDirPath -ChildPath $file
        if (-not (Test-Path -LiteralPath $source)) {
            throw "Required llama.cpp file missing from archive: $file"
        }
    }

    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    foreach ($file in $RequiredFiles) {
        Copy-Item -LiteralPath (Join-Path -Path $BuildDirPath -ChildPath $file) `
            -Destination (Join-Path -Path $BinDir -ChildPath $file) -Force
        Write-Host "Copied $file"
    }

    $manifest = [ordered]@{
        tag = $LlamaTag
        asset = $AssetName
        expectedSha256 = $ArchiveSha256
        actualSha256 = $actualHash
        files = $RequiredFiles
    }
    $manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
    Write-Host "Wrote llama.cpp manifest: $ManifestPath"
    Write-Host "Done. Pinned llama.cpp $LlamaTag is ready."
}
finally {
    if (Test-Path -LiteralPath $TempDir) {
        Remove-Item -LiteralPath $TempDir -Recurse -Force
    }
}
