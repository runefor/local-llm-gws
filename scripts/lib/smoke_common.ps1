function Wait-JsonEndpoint {
  param(
    [string]$Uri,
    [datetime]$Deadline
  )

  while ((Get-Date) -lt $Deadline) {
    try {
      # -NoProxy: 로컬 백엔드(127.0.0.1) 요청이 시스템 프록시로 새어 타임아웃되는 것을 막는다.
      # TimeoutSec 10: /api/rag/status 등은 첫 호출에서 chromadb 초기화로 수 초 걸리고,
      # uvicorn 단일 워커라 그동안 다른 요청도 블로킹되므로 콜드스타트를 넉넉히 기다린다.
      return Invoke-RestMethod -Uri $Uri -TimeoutSec 10 -NoProxy
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  return $null
}

function Test-PortFree {
  param(
    [int]$Port
  )

  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$Port/" -TimeoutSec 1 -NoProxy | Out-Null
    return $false
  } catch {
    return $true
  }
}

function Get-GwsBackendProcesses {
  return @(Get-Process gws-backend* -ErrorAction SilentlyContinue)
}

function Stop-AppGracefully {
  param(
    [System.Diagnostics.Process]$Process
  )

  # Returns true only when CloseMainWindow requested shutdown and the process exited without a force kill.
  if ($null -eq $Process) {
    return $false
  }

  $closedByWindow = $false
  try {
    $closedByWindow = $Process.CloseMainWindow()
  } catch {
    $closedByWindow = $false
  }

  if ($closedByWindow) {
    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $deadline) {
      if (-not (Get-Process -Id $Process.Id -ErrorAction SilentlyContinue)) {
        return $true
      }
      Start-Sleep -Milliseconds 250
    }
  }

  Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  return $false
}
