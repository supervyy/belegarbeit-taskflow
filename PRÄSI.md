# Sprechvorlage Präsentation – TaskFlow Infrastruktur

## 1. Einleitung / Projektvorstellung

Hallo, wir stellen heute unsere Belegarbeit **TaskFlow** vor.  
TaskFlow ist eine containerisierte Multi-Service-Anwendung zur Aufgabenverwaltung und zum Infrastruktur-Monitoring.

Unsere Anwendung besteht aus mehreren logisch getrennten Diensten:
- einem **Reverse Proxy**
- zwei **Frontend-Instanzen**
- drei **Backend-Instanzen**
- einer **PostgreSQL-Datenbank**
- einem **Load Balancer**
- sowie **Monitoring- und Backup-Komponenten**.

Ziel der Belegarbeit war es, eine IT-Infrastruktur zu entwickeln, die auf Ausfälle und Last robust reagiert und Probleme zuverlässig erkennt.

---

## 2. Anforderungen

### 2.1 README beschreibt, wie die Anwendung bedient wird

**Live zeigen:**
- `README.md`

**Sprechtext:**
In unserer README beschreiben wir, wie die Anwendung gestartet und bedient wird.  
Darin sind die wichtigsten URLs, API-Endpunkte und Testschritte dokumentiert.

---

### 2.2 Alle notwendigen Dateien, Dockerfiles und Container-Images sind enthalten

**Live zeigen:**
- Projektstruktur im Explorer oder Terminal
- optional `Get-ChildItem`

**Sprechtext:**
Alle notwendigen Dateien für die Anwendung sind im Projekt enthalten.  
Dazu gehören insbesondere:
- `docker-compose.yml`
- die Dockerfiles der Services
- Konfigurationsdateien für Nginx, Monitoring und Backup
- sowie der Quellcode der einzelnen Komponenten.

---

### 2.3 Infrastruktur kann mit Docker Compose gestartet werden

**Live zeigen:**
- `docker compose ps`

**Sprechtext:**
Die gesamte Infrastruktur kann zentral mit Docker Compose gestartet werden.  
Hier sehen wir, dass alle relevanten Container laufen und mehrere Services bereits den Status `healthy` besitzen.

---

### 2.4 Initialisierungsschritte werden automatisch ausgeführt

**Live zeigen:**
- `db/init.sql`
- optional README oder Projektstruktur

**Sprechtext:**
Notwendige Initialisierungsschritte werden automatisch ausgeführt.  
Dazu gehören insbesondere das Datenbankschema und die Seed-Daten.  
Manuelle SQL-Schritte sind nicht notwendig.

---

### 2.5 Webanwendung ist über die URL aus der README erreichbar

**Live zeigen:**
- Browser: `https://localhost`

**Sprechtext:**
Die Webanwendung ist über die in der README dokumentierte URL erreichbar, in unserem Fall über `https://localhost`.

---

### 2.6 Endpunkt zum Senden von Daten ist vorhanden

**Live zeigen:**
- Postman: `POST https://localhost/api/tasks`
- Body:
```json
{
  "title": "Demo Task",
  "status": "todo"
}
```
- danach `GET https://localhost/api/tasks`

**Sprechtext:**
Die Anwendung besitzt einen Endpunkt, an den Daten gesendet werden können.
Hier legen wir per POST /api/tasks einen neuen Task an und prüfen anschließend per GET, dass dieser gespeichert wurde.

---

### 2.7 Health-URL ist vorhanden

**Live zeigen:**
- Postman: `GET https://localhost/api/health`

**Sprechtext:**
Zusätzlich gibt es eine eigene Health-URL, über die der technische Zustand der Anwendung überprüft werden kann.
Dabei wird auch der Datenbankstatus ausgegeben.

---

### 2.8 Persistente Daten bleiben nach Neustart erhalten

**Live zeigen:**
- optional Screenshot oder kurzer Verweis auf den durchgeführten Persistenztest
- optional `GET https://localhost/api/tasks`

**Sprechtext:**
Die Daten werden in Docker Volumes gespeichert und bleiben nach einem Neustart der Infrastruktur erhalten.
Das haben wir mit einem Neustart des Stacks überprüft.

## 3. Lasttests

### 3.1 Web-Endpunkt unter Last

**Live zeigen:**
- [OFFEN]

**Sprechtext:**
- [OFFEN]

### 3.2 Datenverarbeitender Endpunkt unter Last

**Live zeigen:**
- [OFFEN]

**Sprechtext:**
- [OFFEN]

## 4. Verfügbarkeit

### 4.1 Ausfall eines Frontend-Webservers beeinflusst die Verfügbarkeit nicht

**Live zeigen:**
- `docker compose stop frontend-1`
- Browser neu laden
- `docker compose start frontend-1`

**Sprechtext:**
Unsere Frontend-Schicht besteht aus zwei Instanzen.
Wenn eine Frontend-Instanz ausfällt, bleibt die Anwendung weiterhin erreichbar.

### 4.2 Ausfall des Backend wird im Monitoring angezeigt

**Live zeigen:**
- `docker compose stop backend-api-1`
- Browser: `http://localhost:9090/targets`
- Browser: `http://localhost:3000`
- `docker compose start backend-api-1`

**Sprechtext:**
Der Ausfall einer Backend-Instanz wird im Monitoring sichtbar.
In Prometheus erscheint der betroffene Target als DOWN, und in Grafana ist der Status der Instanz ebenfalls erkennbar.

### 4.3 Frontend zeigt bei Backend-Ausfall eine passende Fehlermeldung

**Live zeigen:**
- `docker compose stop backend-api-1 backend-api-2 backend-api-3`
- Browser neu laden
- `docker compose start backend-api-1 backend-api-2 backend-api-3`

**Sprechtext:**
Wenn alle Backend-Instanzen ausfallen, bleibt das Frontend zwar erreichbar, zeigt aber einen klaren Fehlerzustand an.
Damit ist der Ausfall auch für Nutzer sichtbar.

### 4.4 Ausfall der Datenbank wird im Monitoring angezeigt

**Live zeigen:**
- optional Prometheus / Grafana offen lassen
- `docker compose stop database`
- Frontend / API prüfen
- `docker compose start database`

**Sprechtext:**
Der Datenbank-Ausfall war in unserem Test vor allem über das Verhalten der Anwendung sichtbar.
Im Frontend wurde ein klarer Fehlerzustand angezeigt, und die API reagierte nicht mehr normal.
Ein separater Datenbank-Target war im Monitoring nicht so deutlich visualisiert wie beim Backend-Ausfall, die Auswirkungen des Ausfalls waren aber klar erkennbar.

### 4.5 Frontend zeigt bei Datenbank-Ausfall eine passende Fehlermeldung

**Live zeigen:**
- `docker compose stop database`
- Browser: `https://localhost`
- `docker compose start database`

**Sprechtext:**
Beim Ausfall der Datenbank wird im Frontend ein eigener Fehlerzustand angezeigt.
Die Anwendung signalisiert dabei, dass das Backend noch erreichbar ist, die Datenbank aber nicht.

### 4.6 Bei Überlastung einzelner Dienste skaliert der Dienst horizontal

**Live zeigen:**
- mehrfach `GET https://localhost/api/tasks`

**Sprechtext:**
Die Anwendung ist horizontal skaliert, da mehrere Frontend- und Backend-Instanzen eingesetzt werden.
Am Backend erkennt man das daran, dass Antworten von unterschiedlichen Instanzen kommen.

## 5. Monitoring

### 5.1 Die Services besitzen Health-Checks

**Live zeigen:**
- `docker compose ps`

**Sprechtext:**
Alle wichtigen Services besitzen Health-Checks.
Damit lässt sich der Zustand einzelner Container automatisiert überwachen.

### 5.2 Die Services besitzen geeignete Abhängigkeiten für eine geordnete Start-Reihenfolge

**Live zeigen:**
- `docker compose config`
- oder `docker-compose.yml`

**Sprechtext:**
Die Services besitzen geeignete Abhängigkeiten, sodass eine sinnvolle Start-Reihenfolge eingehalten wird.
Beispielsweise starten Backend-Container erst, wenn die Datenbank verfügbar ist.

### 5.3 Stürzt ein Container unerwartet ab, wird dies erkannt und angezeigt

**Live zeigen:**
- Prometheus /targets
- Grafana Dashboard
- optional `docker compose kill backend-api-2`

**Sprechtext:**
Ein unerwarteter Ausfall eines Containers wird erkannt und im Monitoring angezeigt.

### 5.4 Stürzt ein Container unerwartet ab, wird dieser automatisch neu gestartet

**Live zeigen:**
- optional:
  - `docker compose exec backend-api-1 kill -9 1`
  - `docker compose ps`

**Sprechtext:**
Für die Container ist eine Restart-Policy konfiguriert.
Wichtig ist dabei: Ein administrativer Stop von außen gilt nicht als unerwarteter Crash.
Für den eigentlichen Nachweis muss ein interner Prozessabsturz simuliert werden, also das Beenden des Hauptprozesses PID 1 innerhalb des Containers.
Dieses Verhalten ist für unsere Konfiguration vorgesehen und kann entsprechend demonstriert werden.

### 5.5 Überwachungslimits für Container sind konfiguriert

**Live zeigen:**
- `docker compose config`
- auf `deploy.resources.limits` zeigen

**Sprechtext:**
Für die Container sind Überwachungslimits konfiguriert, insbesondere für CPU und Speicher.

### 5.6 Benachrichtigungen werden bei überschrittenen Limits versendet

**Live zeigen:**
- Browser: `http://localhost:9090/alerts`
- Terminal: `docker compose logs notification-service --tail 50`

**Sprechtext:**
Zusätzlich haben wir Alerting integriert.
Bei einem Ausfall eines Backend-Containers wurde ein ContainerDown-Alert ausgelöst und an den Notification-Service weitergeleitet.

## 6. Security

### 6.1 Dienste sind sinnvoll in verschiedenen Netzen isoliert

**Live zeigen:**
- `docker compose config`
- oder Architekturdiagramm

**Sprechtext:**
Die Dienste sind in mehrere Docker-Netzwerke aufgeteilt:

public-net
frontend-net
backend-net
monitoring-net
db-net

Besonders wichtig ist das interne Datenbanknetz `db-net`, das nicht von außen erreichbar ist.

### 6.2 Kommunikation mit Endpunkten erfolgt SSL-verschlüsselt

**Live zeigen:**
- Browser: `https://localhost`
- optional `curl -I http://localhost`

**Sprechtext:**
Die Kommunikation mit der Anwendung erfolgt SSL-verschlüsselt über HTTPS.
Wir verwenden dafür ein selbstsigniertes Zertifikat.
HTTP wird automatisch auf HTTPS umgeleitet.

### 6.3 Passwörter und Geheimnisse sind nicht als Klartext sichtbar, sondern über Docker Secrets eingebunden

**Live zeigen:**
- `docker compose config`
- optional:
  - `docker inspect belegarbeit-taskflow-backend-api-1-1 | findstr DB_PASSWORD`
  - `docker inspect belegarbeit-taskflow-database-1 | findstr POSTGRES_PASSWORD`

**Sprechtext:**
Passwörter werden nicht als Klartext-Passwörter direkt in der Compose-Konfiguration verwendet, sondern als Secret-Dateien in die Container eingebunden.
So werden Datenbank- und Grafana-Passwörter sicherer bereitgestellt.

### 6.4 Es sind keine unnötigen Ports exponiert

**Live zeigen:**
- `docker compose ps`

**Sprechtext:**
Nach außen exponiert sind nur die wirklich benötigten Ports, insbesondere für Reverse Proxy, Grafana und Prometheus.
Backend und Datenbank sind nicht direkt öffentlich erreichbar.

### 6.5 Zusätzliche Maßnahmen wie Read Only-Dateisysteme oder Capabilities wurden umgesetzt

**Live zeigen:**
- `docker compose config`
- oder:
  - `Select-String -Path docker-compose.yml -Pattern "read_only|cap_drop|no-new-privileges"`

**Sprechtext:**
Zusätzlich haben wir mehrere Hardening-Maßnahmen umgesetzt.
Dazu gehören read_only-Dateisysteme, cap_drop: ALL, no-new-privileges sowie tmpfs für temporäre Verzeichnisse.
Damit werden Schreibrechte und Privilegien der Container bewusst eingeschränkt.

## 7. Sonstiges

### 7.1 Die Infrastruktur enthält eine Web-Application-Firewall

**Live zeigen:**
- `docker compose ps`

**Sprechtext:**
Unsere Infrastruktur enthält eine Web Application Firewall.
Der Reverse Proxy basiert auf dem Image `owasp/modsecurity-crs:nginx-alpine` und enthält damit eine integrierte WAF-Komponente.

### 7.2 Für eigene Docker-Images wurde ein Sicherheitsscan durchgeführt und dokumentiert

**Live zeigen:**
- Terminal mit Trivy-Scan
- `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image belegarbeit-taskflow-backend-api-1`

**Sprechtext:**
Für unsere eigenen Images haben wir einen Security Scan mit Trivy durchgeführt.
Dabei wurde das Backend-Image auf Betriebssystem- und Anwendungsbibliotheken geprüft.

### 7.3 Der Sicherheitsscan findet keine kritischen Schwachstellen

**Live zeigen:**
- Trivy-Scan-Zusammenfassung

**Sprechtext:**
Im Security Scan wurden auch kritische Schwachstellen gefunden, insbesondere in Java-Abhängigkeiten des Backend-Images.
Diesen Punkt würden wir daher nicht als vollständig erfüllt bewerten.
Die Ergebnisse zeigen aber gleichzeitig, an welchen Stellen Updates der verwendeten Bibliotheken notwendig sind.

### 7.4 Ein automatisiertes Datenbank-Backup ist eingerichtet

**Live zeigen:**
- `docker compose exec db-backup ls /backups/`

**Sprechtext:**
Zusätzlich ist ein automatisiertes Datenbank-Backup eingerichtet.
Dafür läuft ein separater `db-backup`-Service, der regelmäßig Sicherungen der PostgreSQL-Datenbank erzeugt.
Im Backup-Verzeichnis sieht man mehrere Dump-Dateien mit Zeitstempel, was den automatisierten Ablauf nachweist.

## 8. Abschluss

**Sprechtext:**
Zusammenfassend haben wir mit TaskFlow eine containerisierte Multi-Service-Infrastruktur umgesetzt, die:

mit Docker Compose gestartet werden kann
mehrere Dienste sauber trennt
Monitoring und Alerting integriert
horizontale Skalierung unterstützt
auf Ausfälle sichtbar reagiert
sowie HTTPS, Secrets, WAF und Backup-Funktionalität enthält.