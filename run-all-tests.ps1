# =============================================================================
# TaskFlow - Load Test Runner (Windows PowerShell)
# =============================================================================

$ErrorActionPreference = "Stop"

# Create results folder
$ResultsDir = "load-tests\results"
if (!(Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

$Scenarios = @(
    @{ Id="F1"; Script="load-tests/frontend-tests.js";      Key="scenario1"; VUs="10";       Body="-";      Desc="Baseline (0s Ramp)" }
    @{ Id="F2"; Script="load-tests/frontend-tests.js";      Key="scenario2"; VUs="100";      Body="-";      Desc="Normallast (1s Ramp)" }
    @{ Id="F3"; Script="load-tests/frontend-tests.js";      Key="scenario3"; VUs="1000";     Body="-";      Desc="High Load (5s Ramp)" }
    @{ Id="F4"; Script="load-tests/frontend-tests.js";      Key="scenario4"; VUs="1000";     Body="-";      Desc="Stress (1s Ramp)" }
    @{ Id="F5"; Script="load-tests/frontend-tests.js";      Key="scenario5"; VUs="max.200";  Body="-";      Desc="Sustained (10 Min)" }
    @{ Id="D1"; Script="load-tests/data-endpoint-tests.js"; Key="scenario1"; VUs="10";       Body="normal"; Desc="Baseline (0s Ramp)" }
    @{ Id="D2"; Script="load-tests/data-endpoint-tests.js"; Key="scenario2"; VUs="100";      Body="normal"; Desc="Normallast (1s Ramp)" }
    @{ Id="D3"; Script="load-tests/data-endpoint-tests.js"; Key="scenario3"; VUs="1000";     Body="normal"; Desc="High Load (5s Ramp)" }
    @{ Id="D4"; Script="load-tests/data-endpoint-tests.js"; Key="scenario4"; VUs="10";       Body="5 MB";   Desc="Payload (0s Ramp)" }
    @{ Id="D5"; Script="load-tests/data-endpoint-tests.js"; Key="scenario5"; VUs="100";      Body="5 MB";   Desc="Payload-Last (1s Ramp)" }
    @{ Id="D6"; Script="load-tests/data-endpoint-tests.js"; Key="scenario6"; VUs="1000";     Body="5 MB";   Desc="Rate-Limit (5s Ramp)" }
    @{ Id="D7"; Script="load-tests/data-endpoint-tests.js"; Key="scenario7"; VUs="1000";     Body="5 MB";   Desc="Graceful Degradation" }
)

Write-Host "=== TaskFlow Load Test Runner ===" -ForegroundColor Cyan
Write-Host "Es werden 12 Szenarien ausgefuehrt. Die Ausgabe von k6 wird live angezeigt."

$Results = @()

foreach ($s in $Scenarios) {
    $ExportFile = "$ResultsDir\${Timestamp}_$($s.Id).json"
    
    Write-Host ""
    Write-Host "--- Running $($s.Id): $($s.Desc) ---" -ForegroundColor Yellow
    
    # Run k6 and let output flow to terminal
    $env:SCENARIO = $s.Key
    k6 run --insecure-skip-tls-verify --summary-export="$ExportFile" $s.Script
    
    if (Test-Path $ExportFile) {
        $JsonRaw = Get-Content $ExportFile -Raw | ConvertFrom-Json
        $cr = 0
        if ($null -ne $JsonRaw.metrics.checks) { $cr = $JsonRaw.metrics.checks.rate }
        
        $reqs = 0
        if ($null -ne $JsonRaw.metrics.http_reqs) { $reqs = $JsonRaw.metrics.http_reqs.count }
        
        $avg = 0
        if ($null -ne $JsonRaw.metrics.http_req_duration) { $avg = [math]::Round($JsonRaw.metrics.http_req_duration.avg) }
        
        $p95Ms = 0
        if ($null -ne $JsonRaw.metrics.http_req_duration) { $p95Ms = [math]::Round($JsonRaw.metrics.http_req_duration."p(95)") }
        
        $sentBytes = 0
        if ($null -ne $JsonRaw.metrics.data_sent) { $sentBytes = $JsonRaw.metrics.data_sent.count }
        
        $recvBytes = 0
        if ($null -ne $JsonRaw.metrics.data_received) { $recvBytes = $JsonRaw.metrics.data_received.count }
        
        $sentStr = "$sentBytes B"
        if ($sentBytes -gt 1048576) { $sentStr = "$([math]::Round($sentBytes/1048576, 1)) MB" }
        elseif ($sentBytes -gt 1024) { $sentStr = "$([math]::Round($sentBytes/1024, 1)) KB" }
        
        $recvStr = "$recvBytes B"
        if ($recvBytes -gt 1048576) { $recvStr = "$([math]::Round($recvBytes/1048576, 1)) MB" }
        elseif ($recvBytes -gt 1024) { $recvStr = "$([math]::Round($recvBytes/1024, 1)) KB" }
        
        $errorRate = [math]::Round((1 - $cr) * 100, 1)
        $checkPct = [math]::Round($cr * 100, 1)
        
        $resultMark = if ($cr -ge 1.0) { "OK" } else { "FAIL" }
        
        $Results += [PSCustomObject]@{
            Id = $s.Id
            VUs = $s.VUs
            Body = $s.Body
            Desc = $s.Desc
            Reqs = $reqs
            CheckPct = "$checkPct%"
            ErrPct = "$errorRate%"
            Avg = "$avg ms"
            P95 = "$p95Ms ms"
            Sent = $sentStr
            Recv = $recvStr
            Result = $resultMark
        }
    }
}

Write-Host "`n=== Alle Tests abgeschlossen! Erstelle Tabelle... ===" -ForegroundColor Cyan

$MdFile = "$ResultsDir\ergebnisse.md"
"# TaskFlow - Lasttest-Ergebnisse`n" | Out-File $MdFile -Encoding utf8
"## Frontend-Endpunkt GET /`n" | Out-File $MdFile -Encoding utf8 -Append
"| Sz. | VUs | Body | Beschreibung | Anfragen | Checks OK | Fehlerquote | Avg | p95 | Gesendet | Empfangen | Ergebnis |" | Out-File $MdFile -Encoding utf8 -Append
"|---|---|---|---|---|---|---|---|---|---|---|---|" | Out-File $MdFile -Encoding utf8 -Append

foreach ($r in $Results) {
    if ($r.Id -match "^F") {
        "| $($r.Id) | $($r.VUs) | $($r.Body) | $($r.Desc) | $($r.Reqs) | $($r.CheckPct) | $($r.ErrPct) | $($r.Avg) | $($r.P95) | $($r.Sent) | $($r.Recv) | $($r.Result) |" | Out-File $MdFile -Encoding utf8 -Append
    }
}

"`n## Daten-Endpunkt POST /api/data`n" | Out-File $MdFile -Encoding utf8 -Append
"| Sz. | VUs | Body | Beschreibung | Anfragen | Checks OK | Fehlerquote | Avg | p95 | Gesendet | Empfangen | Ergebnis |" | Out-File $MdFile -Encoding utf8 -Append
"|---|---|---|---|---|---|---|---|---|---|---|---|" | Out-File $MdFile -Encoding utf8 -Append

foreach ($r in $Results) {
    if ($r.Id -match "^D") {
        "| $($r.Id) | $($r.VUs) | $($r.Body) | $($r.Desc) | $($r.Reqs) | $($r.CheckPct) | $($r.ErrPct) | $($r.Avg) | $($r.P95) | $($r.Sent) | $($r.Recv) | $($r.Result) |" | Out-File $MdFile -Encoding utf8 -Append
    }
}

Write-Host "Die fertige Markdown-Tabelle liegt in: $MdFile" -ForegroundColor Green
