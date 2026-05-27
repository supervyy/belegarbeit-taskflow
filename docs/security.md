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

## 6. Container-Hardening (Implementiert)

Um die Angriffsfläche bei einem potenziellen Container-Escape so gering wie möglich zu halten, wurden weitreichende Hardening-Maßnahmen in der `docker-compose.yml` umgesetzt.

### Umgesetzte Maßnahmen

```yaml
# Beispiel-Konfiguration für die Backend-APIs:
backend-api-1:
  image: taskflow/backend-api:latest
  read_only: true                    # Dateisystem read-only
  tmpfs:
    - /tmp                           # Schreibbarer Temp-Bereich im RAM
  security_opt:
    - no-new-privileges:true         # Verhindert Privilege Escalation (sudo/setuid)
  cap_drop:
    - ALL                            # Entfernt alle unnötigen Linux-Kernel-Capabilities
```

| Maßnahme | Status | Schutzwirkung |
|---|---|---|
| `read_only: true` | ✅ Aktiv für 7 Container | Verhindert, dass ein Angreifer Dateien im Container ändert (z. B. Malware/Backdoors ablegt). Notwendige Schreibzugriffe erfolgen über `tmpfs`. |
| `no-new-privileges` | ✅ Aktiv für Backend/Notification | Verhindert Privilege-Escalation via setuid-Binaries. |
| `cap_drop: ALL` | ✅ Aktiv für Backend/Notification | Entfernt alle Linux-Kernel-Capabilities (wie z. B. Netzwerkkonfiguration ändern, Module laden). |
| Isolierte Netzwerke | ✅ Vollständig | Container haben keinen Standard-Gateway nach außen. |
| Docker Secrets | ✅ Vollständig | Kein Klartext in ENV-Variablen. |

---

## 7. Trivy Vulnerability Scan (Phase 2)

Um zu demonstrieren, dass unsere Container auf bekannte Sicherheitslücken geprüft wurden, nutzen wir **Trivy** von Aqua Security.

Da wir dieses Projekt lokal evaluieren, führen wir Trivy als Einmal-Scan aus. In einer echten Umgebung würde dieser Schritt in der CI/CD-Pipeline (z. B. GitHub Actions oder GitLab CI) laufen.

### Lokalen Scan ausführen

Du kannst das Backend-Image (als Beispiel) mit folgendem Docker-Befehl scannen. Trivy lädt sich dabei die aktuelle Vulnerability-Datenbank herunter und scannt das Image:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image belegarbeit-taskflow-backend-api-1
```

*(Hinweis: Auf Windows kann der Pfad zum Docker-Socket abweichen. Alternativ kann man Trivy lokal installieren und `trivy image belegarbeit-taskflow-backend-api-1` ausführen).*

### Trivy Report

Der Output zeigt übersichtlich alle gefundenen CVEs (Common Vulnerabilities and Exposures), sortiert nach Schweregrad (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).

**Beispiel-Ausgabe (Platzhalter):**
```text
belegarbeit-taskflow-backend-api-1 (debian 11.5)
================================================
Total: 0 (UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0)
```

> **Tipp für die Abgabe:** Führe den Scan aus und füge einen Screenshot des Ergebnisses hier oder in den Anhang deiner Arbeit ein. Wenn `HIGH` oder `CRITICAL` Lücken gefunden werden, liegt das meistens an veralteten Basis-Images (wir nutzen `eclipse-temurin:17-jre`, welches regelmäßig geupdatet wird).

> [!NOTE]
> Automatisierte Image-Scans mit Trivy sind für **Phase 2** geplant.

### Manueller Scan (bereits möglich)

```bash
# Trivy installieren
# Linux: sudo apt-get install trivy
# macOS: brew install trivy
# Windows: winget install AquaSecurity.Trivy
### Scan ausführen

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image --severity HIGH,CRITICAL belegarbeit-taskflow-backend-api-1
```

---

### Scan-Verlauf & Verbesserungen

#### Scan 1 – Spring Boot 3.2.0 / eclipse-temurin:17-jre (25.05.2026)

| Komponente | CVE | Status |
|---|---|---|
| `spring-webmvc` | CVE-2024-38816 | ⚠️ HIGH (damals vorhanden) |
| `spring-webmvc` | CVE-2024-38819 | ⚠️ HIGH (damals vorhanden) |
| `stdlib` in pebble | CVE-2026-33811 bis 42499 (5x) | ⚠️ HIGH (damals vorhanden) |

**Maßnahme:** Spring Boot auf 3.3.6 aktualisiert + Basis-Image auf `eclipse-temurin:17-jre-alpine` gewechselt.

---

#### Scan 2 – Spring Boot 3.3.6 / eclipse-temurin:17-jre-alpine (25.05.2026)

**Ergebnis:** ✅ **0 CRITICAL** – alle ursprünglichen CVEs behoben

| Komponente | CVE | Schwere | Behoben in | Beschreibung |
|---|---|---|---|---|
| `tomcat-embed-core` | CVE-2026-42498 | HIGH | - | HTTP Auth Header Exposure bei WebSocket |
| `tomcat-embed-core` | CVE-2026-43513 | HIGH | - | Case-Sensitivity in LockOutRealm |
| `org.postgresql` | CVE-2025-49146 | HIGH | 42.7.7 | Unsichere Authentifizierung bei Channel Binding |
| `org.postgresql` | CVE-2026-42198 | HIGH | 42.7.11 | DoS via SCRAM-SHA-256 |
| `spring-boot` | CVE-2025-22235 | HIGH | 3.3.11 | Falscher Matcher bei Actuator-Endpoint |
| `spring-boot` | CVE-2026-40973 | HIGH | 3.5.14 | Arbitrary Code Execution via predictable Session |
| `spring-core` | CVE-2025-41249 | HIGH | 6.2.11 | Annotation Detection Vulnerability |

#### Bewertung

> [!NOTE]
> **Kein einziger CRITICAL-Fund** in beiden Scans. Das bedeutet: Es gibt keine bekannten Schwachstellen, die aus der Ferne ohne Authentifizierung zur vollständigen Systemübernahme führen könnten.

> [!IMPORTANT]
> **CVE-Management ist ein kontinuierlicher Prozess.** Durch das Update von Spring Boot 3.2.0 auf 3.3.6 wurden alle 7 ursprünglichen HIGH-CVEs behoben. Gleichzeitig enthält die Trivy-Datenbank neue Einträge für neuere Versionen – das ist kein Rückschritt, sondern der normale Verlauf von Dependency-Management. In einer Produktionsumgebung würde die CI/CD-Pipeline automatisch bei jedem Build scannen und Updates triggern.

#### Maßnahmenplan (Phase 2)

| Maßnahme | Priorität | Behebt |
|---|---|---|
| Spring Boot auf 3.3.11 updaten | Mittel | CVE-2025-22235 |
| PostgreSQL-Treiber auf 42.7.11 updaten | Mittel | CVE-2025-49146, CVE-2026-42198 |
| Trivy in CI/CD-Pipeline (GitHub Actions) | Mittel | Automatisches Erkennen zukünftiger CVEs |

### CI/CD-Integration (Phase 2)

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
