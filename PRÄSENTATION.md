# TaskFlow – IT-Infrastruktur
### Belegarbeit | HTW Dresden

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

```bash
docker compose up -d
```

✅ Alle Container starten automatisch in der richtigen Reihenfolge  
✅ Datenbank-Schema wird automatisch initialisiert  
✅ Anwendung erreichbar unter **https://localhost**

| URL | Funktion |
|---|---|
| `https://localhost` | Webanwendung |
| `https://localhost/api/tasks` | Daten-Endpunkt (POST) |
| `https://localhost/api/health` | Health-Check |
| `http://localhost:3000` | Grafana Monitoring |
| `http://localhost:9090` | Prometheus |

---

## ⚡ Lasttests – k6

**Tool:** [Grafana k6](https://k6.io) · **Ausführung:** via Docker

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
| D7 | 1.000 | 5 MB | ✅ (Graceful Degradation) |

> **D6/D7:** Bei 1.000 VUs × 5 MB greift der Rate-Limiter im Reverse Proxy.  
> HTTP 429 ist eine **ordnungsgemäße Antwort** – das System crasht nicht, sondern degradiert kontrolliert.

---

## 🔌 Verfügbarkeit – Live-Demo

### Szenario 1: Frontend-Ausfall

```bash
docker compose stop frontend-1
```
→ Seite bleibt erreichbar (Load Balancer → frontend-2)  
→ **Kein Einfluss auf Verfügbarkeit** ✅

---

### Szenario 2a: Backend-Redundanz (nur 1 Instanz stoppen)

```bash
docker compose stop backend-api-1
```

| Was passiert | Wo sichtbar |
|---|---|
| `backend-api-1` → **DOWN** (rot) | Grafana |
| `backend-api-2` + `backend-api-3` laufen weiter | Grafana |
| Seite funktioniert **weiterhin normal** | Browser |

> Der Load Balancer erkennt den Ausfall und leitet alle Anfragen an die anderen 2 Instanzen weiter. **Kein Nutzer merkt etwas.** ✅

```bash
docker compose start backend-api-1   # wieder anschalten
```

---

### Szenario 2b: Backend-Fehlermeldung (alle 3 stoppen)

```bash
docker compose stop backend-api-1 backend-api-2 backend-api-3
```

| Was passiert | Wo sichtbar |
|---|---|
| Alle Instance Status → **DOWN** (rot) | Grafana |
| Targets → **DOWN** | Prometheus `/targets` |
| Banner: „Backend nicht erreichbar" | Frontend |

```bash
docker compose start backend-api-1 backend-api-2 backend-api-3
```

---

### Szenario 3: Datenbank-Ausfall

```bash
docker compose stop database
```

| Was passiert | Wo sichtbar |
|---|---|
| Database Status → **DOWN** (rot) | Grafana |
| Backend: ✅ UP / Datenbank: ❌ DOWN | Frontend |
| Banner: „Datenbankverbindung verloren" | Frontend |

> Das Frontend unterscheidet klar zwischen **Backend-Ausfall** und **Datenbank-Ausfall**.

---

### Szenario 4: Horizontale Skalierung

```bash
Invoke-RestMethod https://localhost/api/health -SkipCertificateCheck
# → instance: "backend-api-1" / "backend-api-2" / "backend-api-3"
```

Antworten wechseln zwischen den 3 Instanzen → **Round-Robin Load Balancing** ✅

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

```bash
docker compose ps   # → alle Container: (healthy)
```

Backend startet erst wenn DB `healthy` ist → `depends_on: condition: service_healthy`

### Auto-Restart

```bash
docker compose exec backend-api-2 kill 1
# → Container startet nach Crash automatisch neu (restart: unless-stopped)
# → docker compose ps zeigt: "Up 2 seconds"
```

### Alerting

- **Prometheus** feuert Alert wenn Container DOWN
- **AlertManager** leitet weiter an **Notification Service** (Python/Flask)
- `docker compose logs notification-service --tail 30`

---

## 🔒 Security

| Maßnahme | Umsetzung |
|---|---|
| Netzwerk-Isolation | 5 getrennte Docker-Netzwerke |
| SSL/HTTPS | Selbstsigniertes Zertifikat, HTTP → HTTPS Redirect |
| Secrets | Docker Secrets / `.secrets/`-Dateien, nicht in `docker inspect` sichtbar |
| Minimale Ports | Nur 80, 443, 3000, 9090 nach außen |
| Container-Hardening | `read_only: true`, `cap_drop: ALL`, `no-new-privileges: true` |

```bash
# Kein Passwort sichtbar:
docker inspect belegarbeit-taskflow-backend-api-1-1 | Select-String "DB_PASSWORD"
```

---

## 🛡️ Sonstiges

### Web Application Firewall (WAF)

**Image:** `owasp/modsecurity-crs:nginx-alpine`

- Schützt gegen SQL-Injection, XSS, OWASP Top 10
- Sitzt vor der gesamten Anwendung
- Blockt Angriffe mit **HTTP 403**

```bash
# SQL-Injection → wird geblockt:
Invoke-WebRequest -Uri "https://localhost/api/tasks?id=1' OR '1'='1" -SkipCertificateCheck
# → 403 Forbidden
```

---

### Sicherheitsscan – Trivy

**Tool:** [Aqua Trivy](https://trivy.dev) · Scannt OS-Pakete + Java/Python-Libraries

| Image | Vorher | Fix | Nachher |
|---|---|---|---|
| Frontend (nginx) | ❌ 2 CRITICAL (OpenSSL) | `apk upgrade` in Dockerfile | ✅ **0** |
| Backend (Spring Boot) | ❌ 4 CRITICAL (Tomcat 10.1.33) | Tomcat → `10.1.55` in pom.xml | ✅ **0** |
| Notification (Python) | ✅ 0 | – | ✅ **0** |

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image --severity CRITICAL \
  belegarbeit-taskflow-backend-api-1:latest
# → Total: 0 (CRITICAL: 0) ✅
```

---

### Automatisiertes Datenbank-Backup

- Separater `db-backup`-Container
- Führt stündlich `pg_dump` aus
- Speichert `.dump`-Dateien mit Zeitstempel in Docker Volume

```bash
docker compose exec db-backup ls -la /backups/
# → mehrere .dump Dateien mit Zeitstempel sichtbar
```

---

