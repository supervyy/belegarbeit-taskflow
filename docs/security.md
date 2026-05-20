# TaskFlow – Sicherheitskonzept

> **Projekttyp:** Universitätsprojekt – Multi-Service Docker-Compose-Infrastruktur  
> **Letzte Aktualisierung:** Mai 2026

---

## Inhaltsverzeichnis

1. [Netzwerkisolation](#1-netzwerkisolation)
2. [SSL/TLS – Zertifikate und Cipher Suites](#2-ssltls--zertifikate-und-cipher-suites)
3. [Docker Secrets](#3-docker-secrets)
4. [Exponierte Ports](#4-exponierte-ports)
5. [WAF – Web Application Firewall (Phase 2)](#5-waf--web-application-firewall-phase-2)
6. [Container-Hardening (Phase 2)](#6-container-hardening-phase-2)
7. [Trivy Image-Scan (Phase 2)](#7-trivy-image-scan-phase-2)

---

## 1. Netzwerkisolation

### Fünf-Netzwerk-Modell

TaskFlow verwendet **5 strikt getrennte Docker-Netzwerke** nach dem Prinzip der minimalen Konnektivität. Kein Container erhält mehr Netzwerkzugang als für seine Aufgabe notwendig ist.

```
Internet
    │
    ▼
┌─────────────────────┐
│     public-net       │  ← Einziger Einstiegspunkt
│  reverse-proxy       │
└────────┬─────────────┘
         │
    frontend-net (internal)
    ├── load-balancer
    ├── frontend-1
    └── frontend-2
         │
    backend-net (internal)
    ├── load-balancer
    ├── backend-api-1/2/3
    └── notification-service
         │
    db-net (internal, streng isoliert)
    ├── backend-api-1/2/3
    ├── database
    └── db-backup

    monitoring-net (internal, separat)
    ├── cadvisor
    ├── prometheus
    ├── alertmanager
    ├── grafana
    └── backend-api-1/2/3 (Metriken-Scraping)
```

### Was jedes Netzwerk isoliert

| Netzwerk | Isoliertes Risiko | Schutzwirkung |
|---|---|---|
| `public-net` | Direkter Internetzugang der internen Dienste | Nur `reverse-proxy` hat eine öffentliche IP; alle anderen Container sind physisch nicht erreichbar |
| `frontend-net` | Umgehung des Proxys | Frontend-Container können nicht direkt aus dem Internet angesprochen werden |
| `backend-net` | Direkte DB-Verbindung aus dem Frontend | Frontend ist nicht in `backend-net` → kein Pfad zur Datenbank |
| `db-net` | Unautorisierter Datenbankzugriff | Nur Backend-APIs und `db-backup` dürfen SQL sprechen |
| `monitoring-net` | Vermischung von Nutzlast- und Monitoring-Traffic | Prometheus-Scraping stört den API-Traffic nicht und ist nicht öffentlich erreichbar |

> [!IMPORTANT]
> Docker-interne Netzwerke mit `internal: true` haben **keinen Standard-Gateway**. Container können keine ausgehenden TCP-Verbindungen ins Internet aufbauen, was Datenexfiltration erheblich erschwert.

---

## 2. SSL/TLS – Zertifikate und Cipher Suites

### 2.1 Selbst-signiertes Zertifikat

Das Zertifikat befindet sich unter `reverse-proxy/certs/localhost.crt` (mit dazugehörigem `localhost.key`).

**Eigenschaften des aktuellen Zertifikats:**

| Parameter | Wert |
|---|---|
| Typ | Self-signed X.509 |
| CN (Common Name) | `localhost` |
| Algorithmus | RSA 2048-bit (empfohlen: ECDSA P-256) |
| Gültigkeit | 365 Tage (ab Erstellungsdatum) |
| SAN | `localhost`, `127.0.0.1` |

> [!WARNING]
> Self-signed Zertifikate werden von Browsern als nicht vertrauenswürdig markiert. Für Produktivumgebungen muss ein Zertifikat von einer anerkannten CA (z. B. Let's Encrypt via Certbot) verwendet werden.

### 2.2 Zertifikat neu generieren

```bash
# Neues RSA-2048-Zertifikat (gültig 1 Jahr)
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout reverse-proxy/certs/localhost.key \
  -out   reverse-proxy/certs/localhost.crt \
  -subj  "/C=DE/ST=Bayern/L=München/O=TaskFlow/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# Alternativ: ECDSA P-256 (schneller, gleiche Sicherheit)
openssl req -x509 -nodes -days 365 \
  -newkey ec \
  -pkeyopt ec_paramgen_curve:P-256 \
  -keyout reverse-proxy/certs/localhost.key \
  -out   reverse-proxy/certs/localhost.crt \
  -subj  "/C=DE/ST=Bayern/L=München/O=TaskFlow/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# Reverse-Proxy neu starten, damit das neue Zertifikat geladen wird
docker compose restart reverse-proxy
```

### 2.3 Empfohlene Nginx-Cipher-Konfiguration

Die folgende Konfiguration aktiviert ausschließlich TLS 1.2/1.3 und verbietet schwache Cipher Suites:

```nginx
ssl_protocols              TLSv1.2 TLSv1.3;
ssl_ciphers                ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:
                           ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:
                           ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers  off;   # TLS 1.3 wählt selbst
ssl_session_cache          shared:SSL:10m;
ssl_session_timeout        1d;
ssl_session_tickets        off;
add_header Strict-Transport-Security "max-age=63072000" always;
```

> [!NOTE]
> TLS 1.0 und 1.1 sind seit 2020 durch RFC 8996 als veraltet markiert und müssen deaktiviert bleiben.

---

## 3. Docker Secrets

### 3.1 Funktionsprinzip

Docker Secrets speichern sensible Informationen (Passwörter, API-Keys) als Dateien im Container-Dateisystem unter `/run/secrets/<name>`. Sie werden **nicht** als Umgebungsvariablen gesetzt und sind daher **nicht** in `docker inspect` sichtbar.

```
.secrets/
├── db_password        ← PostgreSQL-Passwort (z. B. "supersecret123")
└── grafana_password   ← Grafana-Admin-Passwort
```

### 3.2 Einrichtung

```bash
# Verzeichnis erstellen (falls nicht vorhanden)
mkdir -p .secrets

# Passwörter setzen (Beispiel – verwende sichere Passwörter!)
echo "mein_sicheres_db_passwort" > .secrets/db_password
echo "mein_sicheres_grafana_passwort" > .secrets/grafana_password

# Berechtigungen einschränken
chmod 600 .secrets/db_password .secrets/grafana_password
```

> [!CAUTION]
> Füge `.secrets/` unbedingt zur `.gitignore` hinzu! Passwörter dürfen **niemals** in das Git-Repository eingecheckt werden.

```bash
echo ".secrets/" >> .gitignore
```

### 3.3 Warum Passwörter nicht in `docker inspect` sichtbar sind

Würde man `environment: POSTGRES_PASSWORD=xxx` in `docker-compose.yml` verwenden, wäre das Passwort:
- In der YAML-Datei im Klartext sichtbar
- Mit `docker inspect <container>` im JSON-Output sichtbar
- In `docker compose config` sichtbar

Mit **Docker Secrets** dagegen:
- Wird der Inhalt als tmpfs-Datei in `/run/secrets/` gemountet
- Ist **nicht** als Umgebungsvariable gesetzt
- Erscheint in `docker inspect` nur als gemounteter Secret-Name, nicht als Inhalt
- Wird nach Container-Stop automatisch aus dem RAM gelöscht

```bash
# Demonstration: Secret ist NICHT als ENV sichtbar
docker inspect taskflow-database | grep -i password
# Ausgabe: (leer)

# Der Container liest das Passwort so:
# POSTGRES_PASSWORD_FILE=/run/secrets/db_password
```

---

## 4. Exponierte Ports

Nur die unbedingt notwendigen Ports werden auf dem Host-System exponiert:

| Port | Protokoll | Dienst | Zweck |
|---|---|---|---|
| **80** | TCP | `reverse-proxy` | HTTP → HTTPS Redirect |
| **443** | TCP | `reverse-proxy` | HTTPS (TLS-Terminierung) |

**Alle anderen Ports** (3000 Grafana, 9090 Prometheus, 5432 PostgreSQL, 8080 Backend, etc.) sind **nur intern** über Docker-Netzwerke erreichbar.

> [!CAUTION]
> Öffne **niemals** Port 5432 (PostgreSQL) oder 9090 (Prometheus) auf dem Host-System ohne Firewall-Schutz. Diese Dienste haben keine eigene Authentifizierung für alle Anfragen.

### Firewall-Empfehlungen (Linux-Host)

```bash
# Nur HTTP und HTTPS erlauben
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw enable
```

---

## 5. WAF – Web Application Firewall (Phase 2)

> [!NOTE]
> Die WAF-Integration (ModSecurity) ist für **Phase 2** des Projekts geplant und noch nicht aktiv.

### Geplante Konfiguration: ModSecurity im DetectionOnly-Modus

**DetectionOnly** bedeutet: ModSecurity analysiert alle Anfragen gegen die OWASP Core Rule Set (CRS)-Regeln, blockiert aber noch nichts. Stattdessen werden Verstöße in das Nginx-Error-Log geschrieben.

```nginx
# In nginx.conf des reverse-proxy (Phase 2):
modsecurity on;
modsecurity_rules_file /etc/nginx/modsec/modsecurity.conf;
```

```apache
# modsecurity.conf (Phase 2):
SecRuleEngine DetectionOnly   # Erst erkennen, dann (Phase 3) blockieren
SecRequestBodyAccess On
SecResponseBodyAccess Off
SecAuditEngine RelevantOnly
SecAuditLog /var/log/nginx/modsec_audit.log

# OWASP CRS einbinden
Include /etc/nginx/modsec/crs/crs-setup.conf
Include /etc/nginx/modsec/crs/rules/*.conf
```

**Erkannte Angriffsmuster (OWASP Top 10):**

| Regel-ID | Kategorie | Beispiel |
|---|---|---|
| 941xxx | XSS | `<script>alert(1)</script>` im Request |
| 942xxx | SQL Injection | `' OR 1=1 --` |
| 930xxx | LFI | `../../etc/passwd` im Pfad |
| 932xxx | RCE | Shell-Metacharaktere im Body |
| 913xxx | Scanner | Erkannte Scan-Tools (sqlmap, nikto) |

**Übergang zu Phase 3:** Nach Analyse der DetectionOnly-Logs werden Ausnahmen (Whitelist-Regeln) definiert, bevor `SecRuleEngine On` aktiviert wird.

---

## 6. Container-Hardening (Phase 2)

> [!NOTE]
> Container-Hardening ist für **Phase 2** des Projekts geplant.

### Geplante Maßnahmen in `docker-compose.yml`

```yaml
# Beispiel für backend-api-1 (Phase 2):
backend-api-1:
  image: taskflow/backend-api:latest
  read_only: true                    # Dateisystem read-only
  tmpfs:
    - /tmp:size=64m,noexec           # Schreibbarer Temp-Bereich (kein exec)
  security_opt:
    - no-new-privileges:true         # Kein sudo / setuid
  cap_drop:
    - ALL                            # Alle Linux-Capabilities entfernen
  cap_add:
    - NET_BIND_SERVICE               # Nur benötigte Capability hinzufügen
  user: "1000:1000"                  # Kein root-User
```

| Maßnahme | Schutzwirkung |
|---|---|
| `read_only: true` | Verhindert, dass ein Angreifer Dateien im Container schreibt (z. B. Backdoors) |
| `no-new-privileges` | Verhindert Privilege-Escalation via setuid-Binaries |
| `cap_drop: ALL` | Entfernt alle Linux-Kernel-Capabilities; nur explizit benötigte werden hinzugefügt |
| Nicht-root-User | Minimiert den Schaden bei Container-Escape |
| `tmpfs` für `/tmp` | Schreibzugriff nur im RAM, kein Exec → erschwert Malware-Ausführung |

### Aktuell bereits umgesetzt

- Alle Dienste laufen in isolierten internen Netzwerken (kein Standard-Gateway)
- Passwörter via Docker Secrets (kein Klartext in ENV)
- Nur Port 80/443 exponiert

---

## 7. Trivy Image-Scan (Phase 2)

> [!NOTE]
> Automatisierte Image-Scans mit Trivy sind für **Phase 2** geplant.

### Manueller Scan (bereits möglich)

```bash
# Trivy installieren
# Linux: sudo apt-get install trivy
# macOS: brew install trivy
# Windows: winget install AquaSecurity.Trivy

# Einzelnes Image scannen
trivy image taskflow/backend-api:latest

# Alle verwendeten Images scannen
docker compose images --quiet | xargs -I{} trivy image {}

# Nur kritische und hohe Schwachstellen anzeigen
trivy image --severity HIGH,CRITICAL taskflow/backend-api:latest

# SARIF-Report für GitHub Security (Phase 2 CI/CD)
trivy image --format sarif --output trivy-results.sarif taskflow/backend-api:latest
```

### Geplante CI/CD-Integration (Phase 2)

```yaml
# GitHub Actions Workflow (Phase 2):
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'taskflow/backend-api:${{ github.sha }}'
    format: 'sarif'
    exit-code: '1'            # Build schlägt fehl bei CRITICAL
    severity: 'CRITICAL,HIGH'
```

**Ziel:** Kein Image mit bekannten kritischen CVEs darf produktiv deployed werden.
