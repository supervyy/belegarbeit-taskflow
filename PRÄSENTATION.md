# TaskFlow – IT-Infrastruktur
### Belegarbeit | HTW Berlin

---

## 🏗️ Was ist TaskFlow?

Eine **produktionsnahe, containerisierte IT-Infrastruktur**  
zur Aufgabenverwaltung – gebaut für Ausfallsicherheit, Last und Observability.

> Ziel: Verlässlich auf hohe Auslastung und Ausfälle reagieren.

---

## 🧩 Architektur

```
Internet
    │
    ▼
[Reverse Proxy + WAF]     ← OWASP ModSecurity
    │
    ▼
[Load Balancer]           ← Nginx
   / \
  /   \
[FE 1] [FE 2]            ← Nginx (Alpine)
    │
    ▼
[BE 1] [BE 2] [BE 3]     ← Java Spring Boot
    │
    ▼
[PostgreSQL DB]           ← Postgres 16

    +── [Prometheus]
    +── [Grafana]
    +── [AlertManager]
    +── [cAdvisor]
    +── [Notification Service]
    +── [DB Backup]
```

**5 isolierte Docker-Netzwerke:**  
`public-net` → `frontend-net` → `backend-net` → `db-net` · `monitoring-net`

---

## ▶️ Start & Grundfunktion

```powershell
docker compose up -d

# Prüfen ob alle Container (healthy) sind
docker compose ps
```

✅ Alle Container starten automatisch in der richtigen Reihenfolge  
✅ Datenbank-Schema wird automatisch initialisiert  
✅ Anwendung erreichbar unter **https://localhost**

| URL | Funktion |
|---|---|
| `https://localhost` | Webanwendung (Frontend) |
| `https://localhost/api/health` | Health-Check inkl. DB-Status |
| `https://localhost/api/tasks` | Task-Liste abrufen (GET) |
| `https://localhost/api/tasks` | Task anlegen (POST, JSON) |
| `https://localhost/api/notify` | Notification senden (POST) |
| `http://localhost:3000` | Grafana Monitoring |
| `http://localhost:9090` | Prometheus |

### Endpunkte testen (curl)

```powershell
# Health-Check – zeigt Status des Backends und der Datenbank
curl.exe -k https://localhost/api/health

# Task-Liste abrufen
curl.exe -k https://localhost/api/tasks

# Neuen Task anlegen
curl.exe -k -X POST https://localhost/api/tasks -H "Content-Type: application/json" -d "{\"title\":\"Demo Task\",\"status\":\"todo\"}"
```

---

## ⚡ Lasttests – k6

**Tool:** [Grafana k6](https://k6.io) · **Ausführung:** lokal installiert

### Frontend-Endpunkt `GET /`

| Szenario | VUs | Ramp-up | Ergebnis |
|---|---|---|---|
| F1 | 10 | 0s | ✅ |
| F2 | 100 | 1s | ✅ |
| F3 | 1.000 | 5s | ✅ |
| F4 | 1.000 | 1s | ✅ |
| F5 | 1.000 Req/Min | 10 Min | ✅ |

### Daten-Endpunkt `POST /api/data`

| Szenario | VUs | Body | Ergebnis |
|---|---|---|---|
| D1 | 10 | normal | ✅ |
| D2 | 100 | normal | ✅ |
| D3 | 1.000 | normal | ✅ |
| D4 | 10 | 5 MB | ✅ |
| D5 | 100 | 5 MB | ✅ |
| D6 | 1.000 | 5 MB | ✅ (Rate-Limit: HTTP 429) |
| D7 | 1.000 | 5 MB | ❌ (Fehlgeschlagen) |

> **D6:** Bei 1.000 VUs × 5 MB greift der Rate-Limiter im Reverse Proxy.  
> HTTP 429 ist eine **ordnungsgemäße Antwort** – das System crasht nicht.

```powershell
# Beispiel: Szenario 6 live ausführen
k6 run --insecure-skip-tls-verify -e SCENARIO=scenario6 load-tests/data-endpoint-tests.js
```

### Thresholds (Erfolgskriterien)

Grenzwerte, die den Lasttest auf "Fehlgeschlagen" setzen, wenn sie überschritten werden:
- `rate>=0.90` → 90% der Anfragen müssen erfolgreich sein.
- `p(95)<30000` → 95% der Antworten müssen in unter 30s da sein.

---

## 🔌 Verfügbarkeit – Live-Demo

### Szenario 1: Frontend-Ausfall

```powershell
docker compose stop frontend-1
```
→ Seite bleibt erreichbar (Load Balancer → frontend-2)  
→ **Kein Einfluss auf Verfügbarkeit** ✅

```powershell
docker compose start frontend-1
```

---

### Szenario 2a: Backend-Redundanz (nur 1 Instanz stoppen)

```powershell
docker compose stop backend-api-1
```

| Was passiert | Wo sichtbar |
|---|---|
| `backend-api-1` → **DOWN** (rot) | Grafana |
| `backend-api-2` + `backend-api-3` laufen weiter | Grafana |
| Seite funktioniert **weiterhin normal** | Browser |

> Der Load Balancer erkennt den Ausfall und leitet alle Anfragen an die anderen 2 Instanzen weiter. **Kein Nutzer merkt etwas.** ✅

```powershell
docker compose start backend-api-1
```

---

### Szenario 2b: Backend-Fehlermeldung (alle 3 stoppen)

```powershell
docker compose stop backend-api-1 backend-api-2 backend-api-3
```

| Was passiert | Wo sichtbar |
|---|---|
| Alle Instance Status → **DOWN** (rot) | Grafana |
| Targets → **DOWN** | Prometheus `/targets` |
| Banner: „Backend nicht erreichbar" | Frontend |

```powershell
docker compose start backend-api-1 backend-api-2 backend-api-3
```

---

### Szenario 3: Datenbank-Ausfall

```powershell
docker compose stop database
```

| Was passiert | Wo sichtbar |
|---|---|
| Database Status → **DOWN** (rot) | Grafana |
| Backend: ✅ UP / Datenbank: ❌ DOWN | Frontend |
| Banner: „Datenbankverbindung verloren" | Frontend |

> Das Frontend unterscheidet klar zwischen **Backend-Ausfall** und **Datenbank-Ausfall**.

```powershell
docker compose start database
```

---

### Szenario 4: Horizontale Skalierung (Round-Robin beweisen)

```powershell
# 3-4x ausführen → das Feld "instance" wechselt jedes Mal!
curl.exe -k https://localhost/api/health
```

→ Antworten wechseln zwischen `backend-api-1`, `backend-api-2`, `backend-api-3`  
→ **Round-Robin Load Balancing** ✅

---

## 📊 Monitoring – Grafana Dashboard

| Panel | Zeigt |
|---|---|
| Container CPU Usage | CPU aller Container (Zeitreihe) |
| Container Memory Usage | RAM aller Container (Zeitreihe) |
| Backend HTTP Requests/sec | Anfragen pro Instanz |
| Backend Response Time (p99) | 99. Perzentil Antwortzeit |
| Instance Status | UP/DOWN für alle 3 Backends |
| **Database Status** | UP/DOWN für die Datenbank |

### Health-Checks & Abhängigkeiten

```powershell
docker compose ps   # → alle Container: (healthy)
```

Backend startet erst wenn DB `healthy` ist → `depends_on: condition: service_healthy`

---

### Auto-Restart

```powershell
# Status prüfen (z.B. "Up 2 hours")
docker compose ps backend-api-2

# Hauptprozess abschießen (simulierter Container-Crash)
docker compose exec backend-api-2 kill 1

# Sofort nochmal prüfen → "Up 2 seconds"
docker compose ps backend-api-2
```

→ Docker erkennt den Absturz und startet den Container **automatisch neu** (`restart: unless-stopped`) ✅

---

### Alerting

- **Prometheus** feuert Alert wenn Container > 30s DOWN
- **AlertManager** leitet weiter an **Notification Service** (Python/Flask)

```powershell
# Logs des Notification-Service prüfen (nach 30s Wartezeit nach einem Ausfall)
docker compose logs notification-service --tail 20
```

---

## 🔒 Security

| Maßnahme | Umsetzung |
|---|---|
| Netzwerk-Isolation | 5 getrennte Docker-Netzwerke |
| SSL/HTTPS | Selbstsigniertes Zertifikat, HTTP → HTTPS Redirect |
| Secrets | Docker Secrets / `.secrets/`-Dateien |
| Minimale Ports | Nur 80 & 443 nach außen (Grafana/Prometheus nur intern) |
| Container-Hardening | `read_only: true`, `cap_drop: ALL`, `no-new-privileges: true` |
| WAF | OWASP ModSecurity CRS – blockt SQL-Injection, XSS |

### Docker Secrets – Passwort nicht sichtbar

```powershell
# Beweis: DB-Passwort ist NICHT als Umgebungsvariable gesetzt
docker inspect belegarbeit-taskflow-database-1 | Select-String "password"
# → Keine Ausgabe = Passwort ist sicher versteckt ✅
```

---

## 🛡️ Web Application Firewall (WAF)

**Image:** `owasp/modsecurity-crs:nginx-alpine`

- Schützt gegen SQL-Injection, XSS, OWASP Top 10
- Sitzt vor der gesamten Anwendung
- Blockt Angriffe mit **HTTP 403 Forbidden**

```powershell
# SQL-Injection → wird geblockt (HTTP 403):
curl.exe -k -I "https://localhost/api/tasks?id=1%27%20OR%201=1--"
# → HTTP/1.1 403 Forbidden ✅
```

---

### Sicherheitsscan – Trivy

**Tool:** [Aqua Trivy](https://trivy.dev) · Scannt OS-Pakete + Java/Python-Libraries

| Image | Vorher | Fix | Nachher |
|---|---|---|---|
| Frontend (nginx) | ❌ 2 CRITICAL (OpenSSL) | `apk upgrade` in Dockerfile | ✅ **0** |
| Backend (Spring Boot) | ❌ 4 CRITICAL (Tomcat 10.1.33) | Tomcat → `10.1.55` in pom.xml | ✅ **0** |
| Notification (Python) | ✅ 0 | – | ✅ **0** |

```powershell
docker run --rm -v //var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity CRITICAL belegarbeit-taskflow-frontend-1:latest
# → Total: 0 (CRITICAL: 0) ✅
```

---

### Automatisiertes Datenbank-Backup

- Separater `db-backup`-Container
- Führt stündlich `pg_dump` aus
- Speichert `.dump`-Dateien mit Zeitstempel in Docker Volume

```powershell
docker compose exec db-backup ls -la /backups/
# → mehrere .dump Dateien mit Zeitstempel sichtbar ✅
```

---
