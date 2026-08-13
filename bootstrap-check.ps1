<#
.SYNOPSIS
  MAVAN Phase A environment bootstrap check.

.DESCRIPTION
  Runs BEFORE any project folder exists. Verifies (and self-heals, where
  possible) the machine-level prerequisites every MAVAN Astro site build
  depends on: Node.js, npm, and Git (with a configured identity).

  This script intentionally does NOT check against a specific project's
  version requirements — it just keeps the toolchain current via winget.
  Per-project version floors are re-verified by that project's own
  generated `scripts/preflight-check.js` (Phase B) once it exists.

  Self-healing covers missing/outdated SOFTWARE only. It will never invent
  a Git identity — that always requires a human to supply real values.

.NOTES
  Windows + winget only for now. Non-Windows machines get a clear manual
  fallback message instead of a silent failure.
#>

$ErrorActionPreference = "Stop"
$script:failures = 0

function Write-Ok($label, $detail) {
    Write-Host "  [OK] $label" -ForegroundColor Green -NoNewline
    Write-Host " - $detail"
}

function Write-Fail($label, $detail) {
    Write-Host "  [X] $label" -ForegroundColor Red -NoNewline
    Write-Host " - $detail"
    $script:failures++
}

function Write-Info($msg) {
    Write-Host "      $msg" -ForegroundColor DarkGray
}

# Runs a winget command with a hard timeout so a stalled UAC prompt or dead
# network connection fails loudly instead of hanging the whole bootstrap.
# Uses async event-based output capture (not Start-Process -PassThru, whose
# .ExitCode is unreliable here) and returns the captured text so callers can
# check for winget's known status phrases instead of trusting its exit code
# (winget's own exit codes are large HRESULT-style values that vary and
# don't map to a stable, documented convention we can rely on).
function Invoke-WingetCommand($argumentList, $timeoutSeconds = 180) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "winget"
    $psi.Arguments = ($argumentList -join " ")
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi

    $stdout = New-Object System.Text.StringBuilder
    $outEvent = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action {
        if ($EventArgs.Data) { $Event.MessageData.AppendLine($EventArgs.Data) | Out-Null }
    } -MessageData $stdout

    $proc.Start() | Out-Null
    $proc.BeginOutputReadLine()
    $finished = $proc.WaitForExit($timeoutSeconds * 1000)
    Unregister-Event -SourceIdentifier $outEvent.Name -ErrorAction SilentlyContinue

    if (-not $finished) {
        try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
        return @{ TimedOut = $true; Output = $stdout.ToString() }
    }
    return @{ TimedOut = $false; Output = $stdout.ToString() }
}

Write-Host "`nMAVAN environment bootstrap check`n"

# --- OS gate -----------------------------------------------------------
$isWindowsOS = ($env:OS -eq "Windows_NT")
if (-not $isWindowsOS) {
    Write-Fail "Operating system" "non-Windows detected"
    Write-Info "This script only automates Windows (winget) right now."
    Write-Info "Manual setup required: install Node 22+, npm, and Git via"
    Write-Info "your OS package manager (Homebrew on macOS, apt/dnf on"
    Write-Info "Linux), then run:"
    Write-Info '  git config --global user.name "Your Name"'
    Write-Info '  git config --global user.email "you@example.com"'
    Write-Host "`nBootstrap FAILED — unsupported OS, manual setup required.`n" -ForegroundColor Red
    exit 1
}

# --- winget itself -------------------------------------------------------
$wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
if (-not $wingetCmd) {
    Write-Fail "winget" "not found on PATH"
    Write-Info "Install 'App Installer' from the Microsoft Store, or update"
    Write-Info "Windows, then re-run this script."
    Write-Host "`nBootstrap FAILED — winget unavailable.`n" -ForegroundColor Red
    exit 1
}
Write-Ok "winget" (winget --version)

# --- Helper: find the winget package Id actually backing an installed tool.
# winget's table columns are NOT reliably separated by 2+ spaces (padding
# can shrink to a single space for long values), so this parses by the
# header's actual character offsets instead of splitting on whitespace.
function Get-InstalledWingetId($nameFilter) {
    $raw = winget list --name $nameFilter 2>$null
    if (-not $raw -or $raw.Count -lt 3) { return $null }

    $header = $raw[0]
    $idStart = $header.IndexOf("Id")
    $versionStart = $header.IndexOf("Version")
    if ($idStart -lt 0 -or $versionStart -lt 0 -or $versionStart -le $idStart) { return $null }

    $sepLineIndex = 0..($raw.Count - 1) | Where-Object { $raw[$_] -match '^-+$' } | Select-Object -First 1
    if ($null -eq $sepLineIndex) { return $null }

    $dataLine = $raw[$sepLineIndex + 1]
    if (-not $dataLine -or $dataLine.Length -le $idStart) { return $null }

    $endIndex = [Math]::Min($versionStart, $dataLine.Length)
    return $dataLine.Substring($idStart, $endIndex - $idStart).Trim()
}

# --- Node.js -------------------------------------------------------------
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Info "Node.js not found - installing via winget (this can take a minute)..."
    $result = Invoke-WingetCommand @("install", "--id", "OpenJS.NodeJS.LTS", "-e", "--accept-source-agreements", "--accept-package-agreements")
    if ($result.TimedOut) {
        Write-Fail "Node.js" "install timed out - may be waiting on a permission prompt"
        Write-Info "Re-run this script from an elevated PowerShell (Run as Administrator),"
        Write-Info "or install manually: winget install --id OpenJS.NodeJS.LTS -e"
    } else {
        # Refresh PATH in this session so the new install is visible immediately
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
        if ($nodeCmd) {
            Write-Ok "Node.js" "installed ($(node -v))"
        } else {
            Write-Fail "Node.js" "winget reported success but 'node' still not on PATH - open a new terminal and re-run"
            Write-Info $result.Output.Trim()
        }
    }
} else {
    $nodeId = Get-InstalledWingetId "Node.js"
    if ($nodeId) {
        $result = Invoke-WingetCommand @("upgrade", "--id", $nodeId, "-e", "--accept-source-agreements", "--accept-package-agreements")
        if ($result.TimedOut) {
            Write-Fail "Node.js" "update check timed out - may be waiting on a permission prompt"
            Write-Info "Re-run this script from an elevated PowerShell (Run as Administrator)."
        } elseif ($result.Output -match "No available upgrade found" -or $result.Output -match "Successfully installed") {
            Write-Ok "Node.js" "$(node -v) (current)"
        } else {
            Write-Ok "Node.js" "$(node -v) (winget id: $nodeId - update check gave an unexpected result, verify manually)"
            Write-Info $result.Output.Trim()
        }
    } else {
        Write-Ok "Node.js" "$(node -v) (installed outside winget - not auto-managed; reinstall via winget for auto-updates)"
    }
}

# --- npm -------------------------------------------------------------------
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCmd) {
    Write-Ok "npm" (npm -v)
} else {
    Write-Fail "npm" "not found - Node install may be broken"
    Write-Info "Try: winget install --id OpenJS.NodeJS.LTS -e --force"
}

# --- Git -------------------------------------------------------------------
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    Write-Info "Git not found - installing via winget..."
    $result = Invoke-WingetCommand @("install", "--id", "Git.Git", "-e", "--accept-source-agreements", "--accept-package-agreements")
    if ($result.TimedOut) {
        Write-Fail "Git" "install timed out - may be waiting on a permission prompt"
        Write-Info "Re-run this script from an elevated PowerShell (Run as Administrator),"
        Write-Info "or install manually: winget install --id Git.Git -e"
    } else {
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $gitCmd = Get-Command git -ErrorAction SilentlyContinue
        if ($gitCmd) {
            Write-Ok "Git" "installed ($(git --version))"
        } else {
            Write-Fail "Git" "winget reported success but 'git' still not on PATH - open a new terminal and re-run"
            Write-Info $result.Output.Trim()
        }
    }
} else {
    $result = Invoke-WingetCommand @("upgrade", "--id", "Git.Git", "-e", "--accept-source-agreements", "--accept-package-agreements")
    if ($result.TimedOut) {
        Write-Fail "Git" "update check timed out - may be waiting on a permission prompt"
        Write-Info "Re-run this script from an elevated PowerShell (Run as Administrator)."
    } elseif ($result.Output -match "No available upgrade found" -or $result.Output -match "Successfully installed" -or $result.Output -match "No installed package found") {
        Write-Ok "Git" "$(git --version) (current)"
    } else {
        Write-Ok "Git" "$(git --version) (update check gave an unexpected result, verify manually)"
        Write-Info $result.Output.Trim()
    }
}

# --- Git identity (never auto-invented) -------------------------------------
if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitName = git config --global user.name 2>$null
    $gitEmail = git config --global user.email 2>$null
    if ($gitName -and $gitEmail) {
        Write-Ok "Git identity" "$gitName <$gitEmail>"
    } else {
        Write-Fail "Git identity" "not configured"
        Write-Info "This cannot be auto-set - it has to be your real identity. Run:"
        Write-Info '  git config --global user.name "Your Name"'
        Write-Info '  git config --global user.email "you@example.com"'
        Write-Info "then re-run this script."
    }
}

# --- Summary -----------------------------------------------------------
Write-Host ""
if ($script:failures -gt 0) {
    Write-Host "Bootstrap FAILED - $($script:failures) issue(s) above must be resolved before starting a new project.`n" -ForegroundColor Red
    exit 1
} else {
    Write-Host "Bootstrap PASSED - machine is ready for a new MAVAN project.`n" -ForegroundColor Green
    exit 0
}
