# TaskFlow – Lasttest-Protokoll

> **Projekttyp:** Universitätsprojekt – Multi-Service Docker-Compose-Infrastruktur  
> **Letzte Aktualisierung:** Mai 2026  
> **k6-Version:** ≥ 0.50.0  
> **Zielhost:** `https://localhost` (self-signed cert – `--insecure-skip-tls-verify` erforderlich)

---

## Inhaltsverzeichnis

1. [Ausführungsvoraussetzungen](#1-ausführungsvoraussetzungen)
2. [Erfolgskriterien (global)](#2-erfolgskriterien-global)
3. [Frontend-Tests (5 Szenarien)](#3-frontend-tests-5-szenarien)
4. [Data-Endpoint-Tests (7 Szenarien)](#4-data-endpoint-tests-7-szenarien)
5. [Zusammenfassung](#5-zusammenfassung)

---

## 1. Ausführungsvoraussetzungen

```bash
# Stack starten
docker compose up -d

# k6 installieren (falls nicht vorhanden)
# Linux: sudo apt-get install k6
# macOS: brew install k6
# Windows: winget install k6

# Alle Tests auf einmal starten
bash load-tests/run-tests.sh --scenario all

# Nur Frontend-Tests
bash load-tests/run-tests.sh --scenario frontend

# Nur Data-Endpoint-Tests
bash load-tests/run-tests.sh --scenario data
```

> [!NOTE]
> Ergebnisse werden als JSON- und Log-Dateien in `load-tests/results/` gespeichert.

---

## 2. Erfolgskriterien (global)

| Kriterium | Schwellwert | Hinweis |
|---|---|---|
| Erfolgsrate (`checks`) | ≥ 95 % | HTTP 200 **und** 429 zählen als Erfolg |
| p95-Antwortzeit | < 5 000 ms | Unter Überlast bis 10 000 ms akzeptabel |
| HTTP 429 (Rate Limit) | Akzeptiert | Schutzverhalten des Nginx-Rate-Limiters |
| HTTP 5xx | Nicht akzeptiert | Zeigt Backend-Ausfall an |

---

## 3. Frontend-Tests (5 Szenarien)

**Endpunkt:** `GET https://localhost/`  
**Skript:** `load-tests/frontend-tests.js`

| # | Szenario | VUs | Ramp-up | Dauer | Body | Befehl | Erwartetes Ergebnis | Tatsächliches Ergebnis | Status |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Baseline | 10 | 0 s | 30 s | – | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario1 load-tests/frontend-tests.js` | ≥95 % HTTP 200, p95 < 500 ms, keine Fehler | *(nach Test ausfüllen)* | ⬜ |
| F2 | Last | 100 | 1 s | 30 s | – | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario2 load-tests/frontend-tests.js` | ≥95 % HTTP 200, p95 < 1 000 ms, Round-Robin sichtbar | *(nach Test ausfüllen)* | ⬜ |
| F3 | Hohe Last | 1 000 | 5 s | 30 s | – | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario3 load-tests/frontend-tests.js` | ≥95 % Erfolg (200 oder 429), p95 < 5 000 ms | *(nach Test ausfüllen)* | ⬜ |
| F4 | Stress | 1 000 | 1 s | 30 s | – | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario4 load-tests/frontend-tests.js` | ≥95 % Erfolg (200 oder 429), p95 < 5 000 ms; 429 unter Spitze erwartet | *(nach Test ausfüllen)* | ⬜ |
| F5 | Konstante Rate | 50–200 | – | 10 min | – | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario5 load-tests/frontend-tests.js` | 1 000 req/min stabil, ≥95 % Erfolg, p95 < 5 000 ms | *(nach Test ausfüllen)* | ⬜ |

### Legende Statusspalte

| Symbol | Bedeutung |
|---|---|
| ⬜ | Noch nicht ausgeführt |
| ✅ | Bestanden (alle Thresholds erfüllt) |
| ❌ | Fehlgeschlagen (mindestens ein Threshold verletzt) |
| ⚠️ | Teilweise bestanden (429-Anteil > 10 %, aber ≥95 % Gesamterfolg) |

---

## 4. Data-Endpoint-Tests (7 Szenarien)

**Endpunkt:** `POST https://localhost/api/data`  
**Skript:** `load-tests/data-endpoint-tests.js`

| # | Szenario | VUs | Ramp-up | Dauer | Body | Befehl | Erwartetes Ergebnis | Tatsächliches Ergebnis | Status |
|---|---|---|---|---|---|---|---|---|---|
| D1 | Baseline normal | 10 | 0 s | 30 s | ~100 B (JSON) | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario1 load-tests/data-endpoint-tests.js` | ≥95 % HTTP 200, p95 < 500 ms | *(nach Test ausfüllen)* | ⬜ |
| D2 | Last normal | 100 | 1 s | 30 s | ~100 B (JSON) | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario2 load-tests/data-endpoint-tests.js` | ≥95 % HTTP 200, p95 < 1 000 ms | *(nach Test ausfüllen)* | ⬜ |
| D3 | Hohe Last normal | 1 000 | 5 s | 30 s | ~100 B (JSON) | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario3 load-tests/data-endpoint-tests.js` | ≥95 % Erfolg (200 oder 429), p95 < 5 000 ms | *(nach Test ausfüllen)* | ⬜ |
| D4 | Baseline 5 MB | 10 | 0 s | 30 s | 5 MB | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario4 load-tests/data-endpoint-tests.js` | ≥95 % HTTP 200, p95 < 2 000 ms; Netzwerk-Durchsatz dominiert | *(nach Test ausfüllen)* | ⬜ |
| D5 | Last 5 MB | 100 | 1 s | 30 s | 5 MB | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario5 load-tests/data-endpoint-tests.js` | ≥95 % Erfolg (200 oder 429), p95 < 5 000 ms | *(nach Test ausfüllen)* | ⬜ |
| D6 | Stress 5 MB | 1 000 | 5 s | 30 s | 5 MB | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario6 load-tests/data-endpoint-tests.js` | 429-Anteil hoch (Rate-Limiter aktiv), ≥95 % 200+429, p95 < 10 000 ms | *(nach Test ausfüllen)* | ⬜ |
| D7 | Stress 5 MB + Graceful Stop | 1 000 | 5 s | 30 s + 10 s Stop | 5 MB | `k6 run --insecure-skip-tls-verify -e SCENARIO=scenario7 load-tests/data-endpoint-tests.js` | Kein Request bleibt ohne Antwort (200 oder 429), graceful_stop=10 s schließt offene Verbindungen | *(nach Test ausfüllen)* | ⬜ |

---

## 5. Zusammenfassung

| Gruppe | Szenarien | Bestanden | Fehlgeschlagen | Ausstehend |
|---|---|---|---|---|
| Frontend | 5 | – | – | 5 |
| Data Endpoint | 7 | – | – | 7 |
| **Gesamt** | **12** | **–** | **–** | **12** |

> [!TIP]
> Nach dem Ausführen der Tests: Grafana unter `http://localhost:3000` öffnen und die k6-Metriken in den vorhandenen Dashboards prüfen. Die JSON-Ergebnis-Dateien in `load-tests/results/` können mit `k6 inspect` oder jedem JSON-Viewer analysiert werden.
