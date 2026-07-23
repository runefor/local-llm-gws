param()

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$script = Join-Path $repo "scripts\prepare_llama_server.ps1"
$source = Get-Content -LiteralPath $script -Raw
$sidecarSpec = Join-Path $repo "python-backend\gws-backend.spec"
$sidecarSpecSource = Get-Content -LiteralPath $sidecarSpec -Raw
$releaseRequirements = Join-Path $repo "python-backend\requirements-release.txt"
$releaseRequirementsSource = Get-Content -LiteralPath $releaseRequirements -Raw
$releaseScript = Join-Path $repo "scripts\build_release.ps1"
$releaseScriptSource = Get-Content -LiteralPath $releaseScript -Raw
$expectedHash = "ced37906bfa57dca6079b0e66163edc4f319b43ba8260bda5427fbd20a08324b"
$asset = "llama-b10088-bin-win-vulkan-x64.zip"

function Assert-True($Condition, $Message) {
    if (-not $Condition) {
        throw $Message
    }
}

Assert-True ($source -notmatch "/releases/latest") "prepare_llama_server.ps1 must not use the mutable latest release endpoint."
Assert-True ($source -match [regex]::Escape("b10088")) "prepare_llama_server.ps1 must pin llama.cpp tag b10088."
Assert-True ($source -match [regex]::Escape($asset)) "prepare_llama_server.ps1 must pin asset $asset."
Assert-True ($source -match $expectedHash) "prepare_llama_server.ps1 must pin the repository-owned SHA-256."
Assert-True ($source -match "Get-FileHash") "prepare_llama_server.ps1 must verify SHA-256 with Get-FileHash."
Assert-True ($source -match "Assert-LlamaArchiveHash") "prepare_llama_server.ps1 must route archive validation through Assert-LlamaArchiveHash."
Assert-True ($source -match "ArchivePath") "prepare_llama_server.ps1 must accept an offline -ArchivePath input."
Assert-True ($source -match "llama-server-impl\.dll") "prepare_llama_server.ps1 must include the server implementation DLL."
Assert-True ($source -match "ggml-cpu-x64\.dll") "prepare_llama_server.ps1 must include the portable CPU backend."
Assert-True ($source -notmatch "ExpectedHash") "prepare_llama_server.ps1 must not expose an expected-hash override."
Assert-True ($sidecarSpecSource -match '"tokenizers"') "gws-backend.spec must include ChromaDB's dynamic tokenizers import."
Assert-True ($releaseRequirementsSource -match '(?m)^tokenizers==0\.20\.3$') "Release dependencies must pin tokenizers 0.20.3."
Assert-True ($releaseScriptSource -match '\(Join-Path \$ScriptDir "prepare_llama_server\.ps1"\)\s+-Force') "release:windows must refresh llama.cpp from the pinned archive before packaging."
$hashCallIndex = $source.IndexOf('$actualHash = Assert-LlamaArchiveHash')
$extractIndex = $source.IndexOf('Expand-Archive')
Assert-True ($hashCallIndex -ge 0 -and $hashCallIndex -lt $extractIndex) "Archive hash verification must run before extraction."

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "local-llm-gws-release-contract-$([guid]::NewGuid().ToString('N'))"
$archive = Join-Path $tempRoot "llama-corrupt-contract.zip"
$stdout = Join-Path $tempRoot "stdout.log"
$stderr = Join-Path $tempRoot "stderr.log"
$pwsh = Join-Path $PSHOME "pwsh.exe"
$beforeInventory = @{}
$binDir = Join-Path $repo "src-tauri\bin"
if (Test-Path -LiteralPath $binDir) {
    Get-ChildItem -LiteralPath $binDir -File | ForEach-Object {
        $beforeInventory[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
}

try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    Set-Content -LiteralPath $archive -Value "not a valid pinned archive" -Encoding ASCII
    $process = Start-Process -FilePath $pwsh -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $script,
        "-ArchivePath", $archive,
        "-Force"
    ) -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -Wait

    Assert-True ($process.ExitCode -ne 0) "Corrupt -ArchivePath must fail before extraction or copy."
    $failureOutput = (Get-Content -LiteralPath $stdout -Raw) + (Get-Content -LiteralPath $stderr -Raw)
    Assert-True ($failureOutput -match "archive SHA256 mismatch") "Corrupt -ArchivePath must fail specifically at the SHA-256 gate."
    $afterInventory = @{}
    if (Test-Path -LiteralPath $binDir) {
        Get-ChildItem -LiteralPath $binDir -File | ForEach-Object {
            $afterInventory[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    }
    Assert-True ($afterInventory.Count -eq $beforeInventory.Count) "Corrupt archive changed the destination inventory."
    foreach ($name in $beforeInventory.Keys) {
        Assert-True ($afterInventory.ContainsKey($name)) "Corrupt archive removed destination file $name."
        Assert-True ($afterInventory[$name] -eq $beforeInventory[$name]) "Corrupt archive changed destination file $name."
    }
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "release contract checks passed"
