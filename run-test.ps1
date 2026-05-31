param(
    [Parameter(Mandatory=$true, HelpMessage="Gib die Test-ID ein (z.B. F1, F2, F3, D1, D6)")]
    [string]$TestID
)

$ErrorActionPreference = "Stop"

$Scenarios = @{
    "F1" = @{ Script="load-tests/frontend-tests.js";      Key="scenario1"; Desc="Frontend: Baseline (0s Ramp)" }
    "F2" = @{ Script="load-tests/frontend-tests.js";      Key="scenario2"; Desc="Frontend: Normallast (1s Ramp)" }
    "F3" = @{ Script="load-tests/frontend-tests.js";      Key="scenario3"; Desc="Frontend: High Load (5s Ramp)" }
    "F4" = @{ Script="load-tests/frontend-tests.js";      Key="scenario4"; Desc="Frontend: Stress (1s Ramp)" }
    "F5" = @{ Script="load-tests/frontend-tests.js";      Key="scenario5"; Desc="Frontend: Sustained (10 Min)" }
    "D1" = @{ Script="load-tests/data-endpoint-tests.js"; Key="scenario1"; Desc="Daten: Baseline (0s Ramp)" }
    "D2" = @{ Script="load-tests/data-endpoint-tests.js"; Key="scenario2"; Desc="Daten: Normallast (1s Ramp)" }
    "D3" = @{ Script="load-tests/data-endpoint-tests.js"; Key="scenario3"; Desc="Daten: High Load (5s Ramp)" }
    "D4" = @{ Script="load-tests/data-endpoint-tests.js"; Key="scenario4"; Desc="Daten: Payload (0s Ramp)" }
    "D5" = @{ Script="load-tests/data-endpoint-tests.js"; Key="scenario5"; Desc="Daten: Payload-Last (1s Ramp)" }
    "D6" = @{ Script="load-tests/data-endpoint-tests.js"; Key="scenario6"; Desc="Daten: Rate-Limit (5s Ramp)" }
    "D7" = @{ Script="load-tests/data-endpoint-tests.js"; Key="scenario7"; Desc="Daten: Graceful Degradation" }
}

$TestID = $TestID.ToUpper()

if (-not $Scenarios.ContainsKey($TestID)) {
    Write-Host "Fehler: Unbekannte Test-ID '$TestID'." -ForegroundColor Red
    Write-Host "Gueltige IDs: F1, F2, F3, F4, F5, D1, D2, D3, D4, D5, D6, D7"
    exit
}

$s = $Scenarios[$TestID]

Write-Host "=== Starte Test ${TestID}: $($s.Desc) ===" -ForegroundColor Cyan
Write-Host "Skript: $($s.Script) | Szenario: $($s.Key)" -ForegroundColor Yellow
Write-Host ""

$env:SCENARIO = $s.Key
k6 run --insecure-skip-tls-verify $s.Script

Write-Host ""
Write-Host "=== Test $TestID abgeschlossen! ===" -ForegroundColor Green
