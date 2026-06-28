param (
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$BinDir = Join-Path -Path $PSScriptRoot -ChildPath "..\src-tauri\bin"
$TempDir = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath "llama_cpp_temp"

# Ensure bin directory exists
if (-not (Test-Path -Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
    Write-Host "Created directory: $BinDir"
}

# Required files
$RequiredFiles = @(
    "llama-server.exe",
    "ggml-vulkan.dll",
    "ggml-base.dll"
)

# Check if files already exist
$AllExist = $true
foreach ($file in $RequiredFiles) {
    if (-not (Test-Path -Path (Join-Path -Path $BinDir -ChildPath $file))) {
        $AllExist = $false
        break
    }
}

if ($AllExist -and -not $Force) {
    Write-Host "llama-server and required DLLs already exist in $BinDir."
    Write-Host "Use -Force to redownload and overwrite."
    exit 0
}

Write-Host "Fetching latest release information from GitHub..."
$ApiUrl = "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest"
try {
    $ReleaseInfo = Invoke-RestMethod -Uri $ApiUrl -UseBasicParsing
} catch {
    Write-Error "Failed to fetch release info: $_"
    exit 1
}

$DownloadUrl = $null
$AssetName = $null

foreach ($asset in $ReleaseInfo.assets) {
    if ($asset.name -match "llama-.*-bin-win-vulkan-x64\.zip") {
        $DownloadUrl = $asset.browser_download_url
        $AssetName = $asset.name
        break
    }
}

if (-not $DownloadUrl) {
    Write-Error "Could not find Vulkan Windows x64 build in the latest release."
    exit 1
}

Write-Host "Found asset: $AssetName"

if (Test-Path -Path $TempDir) {
    Remove-Item -Path $TempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TempDir | Out-Null

$ZipPath = Join-Path -Path $TempDir -ChildPath $AssetName

Write-Host "Downloading $DownloadUrl ..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing

Write-Host "Extracting archive..."
Expand-Archive -Path $ZipPath -DestinationPath $TempDir -Force

$BuildDirPath = $null
$SubDirs = Get-ChildItem -Path $TempDir -Directory
foreach ($dir in $SubDirs) {
    if ($dir.Name -match "llama-.*-bin-win-vulkan-x64") {
        $BuildDirPath = $dir.FullName
        break
    }
}

if (-not $BuildDirPath) {
    # If it extracted directly to TempDir without a subfolder
    $BuildDirPath = $TempDir
}

Write-Host "Copying required files to $BinDir..."
foreach ($file in $RequiredFiles) {
    $SourceFile = Join-Path -Path $BuildDirPath -ChildPath $file
    $DestFile = Join-Path -Path $BinDir -ChildPath $file

    if (Test-Path -Path $SourceFile) {
        Copy-Item -Path $SourceFile -Destination $DestFile -Force
        Write-Host "Copied $file"
    } else {
        Write-Warning "Could not find $file in the extracted archive."
    }
}

Write-Host "Cleaning up temporary files..."
Remove-Item -Path $TempDir -Recurse -Force

Write-Host "Done! llama-server is ready."
exit 0
