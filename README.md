# TaskFlow – Multi-Service Docker Compose Infrastructure

> Belegarbeit IT-Infrastrukturen – HTW Berlin
> Einheit 6: Virtualisierung und Cloud Computing

---

## Architektur-Überblick

```
Browser
  │  HTTPS 443 / HTTP 80 (→ redirect)
  ▼
reverse-proxy  (Nginx + SSL)          ← public-net
  │  /          → frontend pool
  │  /api/      → load-balancer
  │  /grafana/  → grafana
  │  /prometheus/ → prometheus
  ├──────────────────────────────────── frontend-net
  │         frontend-1   frontend-2
  │
  ├──────────────────────────────────── backend-net
  │    load-balancer
  │         ├── backend-api-1
  │         ├── backend-api-2          ─── db-net (internal)
  │         └── backend-api-3               └── database (PostgreSQL)
  │    notification-service
  │    alertmanager
  │
  └──────────────────────────────────── monitoring-net
       prometheus ← cadvisor
       grafana    ← prometheus
```

---

## Schnellstart

### Voraussetzungen
- Docker Desktop >= 24.x
- OpenSSL (für Zertifikat-Generierung)
- k6 (für Lasttests, optional): https://k6.io/docs/get-started/installation/

### 1. TLS-Zertifikat generieren (einmalig)

```bash
# Linux/macOS
chmod +x reverse-proxy/certs/generate-cert.sh
./reverse-proxy/certs/generate-cert.sh

# Windows (PowerShell)
# Da Windows standardmäßig kein OpenSSL hat, generieren wir das Zertifikat über Docker:
docker run --rm -v "${PWD}/reverse-proxy/certs:/certs" alpine sh -c "apk add --no-cache openssl -q && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /certs/localhost.key -out /certs/localhost.crt -subj '/C=DE/ST=Berlin/L=Berlin/O=HTW/OU=IT-Infrastrukturen/CN=localhost'"
```

Das Skript erzeugt:
- `reverse-proxy/certs/localhost.crt`
- `reverse-proxy/certs/localhost.key`

> ℹ️ Zertifikat ist selbst-signiert. Browser zeigen eine Sicherheitswarnung – das ist erwartet.
> Einfach „Erweitert → Trotzdem fortfahren" klicken.
> `curl` mit `-k` / `--insecure` verwenden.

### 2. Docker Secrets prüfen

Die Datei `.secrets/db_password` und `.secrets/grafana_password` sind bereits angelegt.
Zum Ändern:

```bash
echo "mein-neues-passwort" > .secrets/db_password
echo "grafana-passwort"   > .secrets/grafana_password
```

> ⚠️ Die `.secrets/`-Ordner wird **nicht** in Git eingecheckt (`.gitignore`).

### 3. Stack starten

```bash
docker compose up -d --build
```

Beim ersten Start wird der Maven-Build des Backends ca. **2–4 Minuten** dauern.

### 4. Status prüfen

```bash
docker compose ps
```

Alle Services sollten nach ca. 90 Sekunden `healthy` sein.

---

## Erreichbare Endpunkte

| URL | Beschreibung |
|-----|-------------|
| `https://localhost/` | Frontend (TaskFlow UI) |
| `https://localhost/api/health` | Health-Status inkl. DB-Check |
| `https://localhost/api/tasks` | Task-Liste (GET) |
| `https://localhost/api/tasks` | Task anlegen (POST, JSON) |
| `https://localhost/api/notify` | Notification senden (POST, JSON) |
| `https://localhost/api/data` | Großer Payload-Test (POST, bis 10 MB) |
| `http://localhost:3000` | Grafana (admin / Passwort aus `.secrets/grafana_password`) |
| `http://localhost:9090` | Prometheus |

### Curl-Beispiele

```bash
# Health (mit DB-Status)
curl -k https://localhost/api/health

# Tasks abrufen
curl -k https://localhost/api/tasks

# Task anlegen
curl -k -X POST https://localhost/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Mein neuer Task","status":"todo"}'

# Notification testen
curl -k -X POST https://localhost/api/notify \
  -H "Content-Type: application/json" \
  -d '{"message":"Test von curl"}'

# 5-MB-Payload testen
curl -k -X POST https://localhost/api/data \
  -H "Content-Type: application/octet-stream" \
  --data-binary @<(dd if=/dev/urandom bs=1M count=5 2>/dev/null)
```

---

## Monitoring

### Grafana
- URL: `http://localhost:3000`
- Login: `admin` / Passwort aus `.secrets/grafana_password` (Standard: `admin123`)
- Das Dashboard **TaskFlow Infrastructure** wird automatisch geladen (Grafana-Provisioning).

### Prometheus
- URL: `http://localhost:9090`
- Targets: Status → Targets → alle sollten `UP` sein.

### Alertmanager
- Sendet Webhook-Alerts an `notification-service:5000/notify` bei:
  - `ContainerDown` – ein Container ist > 30s nicht erreichbar
  - `HighMemoryUsage` – ein Container verbraucht > 85 % des Memory-Limits

---

## Lasttests

k6 muss installiert sein: https://k6.io/docs/get-started/installation/

```bash
# Frontend-Lasttests (alle 5 Szenarien)
k6 run --insecure-skip-tls-verify load-tests/frontend-tests.js

# Daten-Endpunkt-Tests (alle 7 Szenarien)
k6 run --insecure-skip-tls-verify load-tests/data-endpoint-tests.js

# Alle Tests nacheinander (Wrapper-Skript)
bash load-tests/run-tests.sh --scenario all
```

Ergebnisse werden in `load-tests/results/` gespeichert.
Protokoll-Template: `docs/loadtest-protokoll.md`

---

## Verfügbarkeitstests

Alle Szenarien sind in `docs/availability-tests.md` dokumentiert:

```bash
# Frontend-HA testen: frontend-1 stoppen, Seite bleibt erreichbar
docker compose stop frontend-1
curl -k https://localhost/  # → muss noch funktionieren
docker compose start frontend-1

# Backend-Ausfall: Fehlermeldung im Frontend
docker compose stop backend-api-1 backend-api-2 backend-api-3
# → Frontend zeigt: "⚠️ Backend nicht erreichbar"
docker compose start backend-api-1 backend-api-2 backend-api-3

# DB-Ausfall: DB-Fehlermeldung im Frontend
docker compose stop database
# → Frontend zeigt: "⚠️ Datenbankverbindung verloren"
docker compose start database
```

---

## Persistenz testen

```bash
# Stack stoppen und neu starten
docker compose down
docker compose up -d

# Tasks abrufen – Daten müssen erhalten sein
curl -k https://localhost/api/tasks

# Backup prüfen (DB-Backup-Container schreibt stündlich nach db-backups Volume)
docker compose exec db-backup ls /backups/
```

---

## Alert testen

```bash
# Einen Backend-Container stoppen → ContainerDown Alert nach 30s
docker compose stop backend-api-1

# In Prometheus prüfen: http://localhost:9090/alerts
# Im notification-service-Log prüfen:
docker compose logs notification-service
```

---

## Stack stoppen

```bash
# Stoppen (Volumes bleiben erhalten)
docker compose down

# Vollständig zurücksetzen inkl. Volumes
docker compose down -v
```

---

## Projektstruktur

```
belegarbeit-taskflow/
├── docker-compose.yml          # Haupt-Orchestrierung
├── .env                        # Nicht-sensitive Konfiguration
├── .secrets/                   # Docker Secrets (nicht in Git!)
│   ├── db_password
│   └── grafana_password
├── reverse-proxy/
│   ├── nginx.conf              # SSL, Routing, HA-Frontend
│   └── certs/
│       ├── generate-cert.sh    # Einmaliges Zertifikat erzeugen
│       ├── localhost.crt       # (nach Ausführen von generate-cert.sh)
│       └── localhost.key
├── load-balancer/
│   └── nginx.conf              # Backend-Pool round-robin
├── frontend/
│   ├── Dockerfile
│   └── index.html              # SPA: Task-Liste, Infra-Status, Fehleranzeige
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh           # Liest Docker Secret → DB_PASSWORD
│   ├── pom.xml
│   └── src/
├── notification-service/
│   ├── Dockerfile
│   └── app.py                  # Flask: /health, /notify
├── db/
│   └── init.sql                # Schema + Seed-Daten
├── monitoring/
│   ├── prometheus.yml
│   ├── alert.rules.yml         # ContainerDown, HighMemoryUsage
│   ├── alertmanager.yml        # Webhook → notification-service
│   └── grafana/
│       ├── provisioning/       # Automatische DS + Dashboard-Konfiguration
│       └── dashboards/         # taskflow.json Dashboard
├── load-tests/
│   ├── frontend-tests.js       # 5 k6-Szenarien für /
│   ├── data-endpoint-tests.js  # 7 k6-Szenarien für /api/data
│   └── run-tests.sh
└── docs/
    ├── architektur.md
    ├── loadtest-protokoll.md
    ├── availability-tests.md
    └── security.md
```

---

## Netzwerke

| Netzwerk | Services | Zweck |
|----------|----------|-------|
| `public-net` | reverse-proxy | Einziger öffentlicher Einstiegspunkt |
| `frontend-net` | reverse-proxy, frontend-1, frontend-2 | Statische Assets |
| `backend-net` | reverse-proxy, load-balancer, backend-api-*, notification-service, alertmanager | API-Kommunikation |
| `db-net` (internal) | backend-api-*, database | Datenbankzugriff – kein Internet-Routing |
| `monitoring-net` | prometheus, grafana, cadvisor, alertmanager, backend-api-* | Metriken-Scraping |

---

## Sicherheit

Siehe `docs/security.md` für Details zu:
- Netzwerktrennung & Portexposition
- TLS/SSL (selbst-signiertes Zertifikat)
- Docker Secrets (Passwörter nicht in `docker inspect` sichtbar)
- WAF (Phase 2: ModSecurity DetectionOnly)
- Container-Hardening (Phase 2: read_only, cap_drop)