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

## 2. Architekturüberblick

**Live zeigen:**
- Architekturdiagramm oder README-Abschnitt „Architektur-Überblick“

**Sprechtext:**
Unsere Architektur ist in mehrere Services und Netzwerke aufgeteilt.

Von außen erfolgt der Zugriff nur über den **Reverse Proxy**.  
Dieser leitet Anfragen entweder an:
- den **Frontend-Pool**
- oder an den **Load Balancer** für die Backend-Services weiter.

Im Hintergrund greifen die Backend-Container auf:
- die **Datenbank**
- und den **Notification-Service**
zu.

Zusätzlich haben wir:
- **Prometheus**
- **Grafana**
- **cAdvisor**
- **Alertmanager**
- und einen **DB-Backup-Service**
integriert.

---

## 3. Anforderungen

### 3.1 Start mit Docker Compose

Unsere Infrastruktur kann vollständig mit **Docker Compose** gestartet werden.

**Live zeigen:**
- `docker compose ps`

**Sprechtext:**
Wir starten die gesamte Infrastruktur mit Docker Compose.  
Dabei werden alle Container automatisch erstellt und gestartet.

Zusätzlich sehen wir hier, dass:
- die Datenbank läuft
- die Backend-Container laufen
- die Frontend-Container laufen
- Load Balancer und Reverse Proxy aktiv sind
- und mehrere Services den Status `healthy` besitzen.

### 3.2 Automatische Initialisierung

**Live zeigen:**
- kurz auf `db/init.sql` oder README verweisen
Die Initialisierung der Anwendung erfolgt automatisch.

**Sprechtext:**
Beim Start werden notwendige Initialisierungsschritte automatisch ausgeführt.  
Dazu gehören insbesondere Datenbankschema und Seed-Daten.  
Es sind keine manuellen SQL-Schritte nötig.

### 3.3 Webanwendung über URL erreichbar

**Live zeigen:**
- Browser: `https://localhost`

**Sprechtext:**
Die Anwendung ist über die in der README angegebene URL `https://localhost` erreichbar.  
Der Zugriff erfolgt verschlüsselt über HTTPS.

### 3.4 Daten-Endpunkt vorhanden

**Live zeigen:**
- Postman oder Browser / Terminal: `GET /api/tasks`

**Sprechtext:**
Zusätzlich besitzt die Anwendung einen Daten-Endpunkt, über den Aufgaben verarbeitet werden können.  
Ein zentraler Endpunkt ist `https://localhost/api/tasks`.

### 3.5 Daten senden an Endpunkt

**Live zeigen:**
- Postman: `POST https://localhost/api/tasks`
- JSON-Body:
```json
{
  "title": "Demo Task",
  "status": "todo"
}

```

- danach `GET https://localhost/api/tasks`

**Sprechtext:**
Wir können nicht nur Daten lesen, sondern auch neue Daten an die Anwendung senden.
Hier legen wir per POST /api/tasks einen neuen Task an und prüfen danach per GET, dass dieser erfolgreich gespeichert wurde.

### 3.6 Health-Endpunkt vorhanden

**Live zeigen:**
- Postman: `GET https://localhost/api/health`

**Sprechtext:**
Außerdem gibt es einen Health-Endpunkt, über den der technische Zustand der Anwendung geprüft werden kann.
Dabei wird auch der Datenbankstatus mit ausgegeben.

### 3.7 Persistenz

**Live zeigen:**
- optional Screenshot oder kurzer Verweis auf bereits getesteten Neustart
- optional `GET /api/tasks`

**Sprechtext:**
Unsere Daten sind persistent in Docker Volumes gespeichert.
Wir haben geprüft, dass die gespeicherten Aufgaben auch nach einem Neustart der Infrastruktur erhalten bleiben.

## 4. Verfügbarkeit

### 4.1 Ausfall eines Frontend-Webservers

**Live zeigen:**
- `docker compose stop frontend-1`
- Browser neu laden
- `docker compose start frontend-1`

**Sprechtext:**
Unsere Frontend-Schicht besteht aus zwei Instanzen.
Wenn eine Frontend-Instanz ausfällt, bleibt die Anwendung trotzdem erreichbar.
Damit ist die Verfügbarkeit der Webanwendung weiterhin gegeben.

### 4.2 Ausfall eines Backend-Containers

**Live zeigen:**
- `docker compose stop backend-api-1`
- Postman: `GET https://localhost/api/tasks`
- optional mehrfach `GET /api/tasks`
- `docker compose start backend-api-1`

**Sprechtext:**
Auch das Backend ist redundant ausgelegt.
Wenn eine Backend-Instanz ausfällt, bleibt die API erreichbar, weil Anfragen weiterhin auf die verbleibenden Instanzen verteilt werden.

### 4.3 Ausfall des Backend wird im Monitoring angezeigt

**Live zeigen:**
- `docker compose stop backend-api-1`
- Browser: `http://localhost:9090/targets`
- Browser: `http://localhost:3000`
- `docker compose start backend-api-1`

**Sprechtext:**
Der Ausfall einer Backend-Instanz wird auch im Monitoring sichtbar.
In Prometheus erscheint der betroffene Target als DOWN, und in Grafana ist der Status der Instanz ebenfalls erkennbar.

### 4.4 Frontend zeigt bei Backend-Ausfall Fehlerzustand

**Live zeigen:**
- `docker compose stop backend-api-1 backend-api-2 backend-api-3`
- Browser neu laden
- Screenshot / Live-Ansicht
- `docker compose start backend-api-1 backend-api-2 backend-api-3`

**Sprechtext:**
Wenn alle Backend-Instanzen ausfallen, bleibt das Frontend zwar erreichbar, zeigt aber einen klaren Fehlerzustand an.
Dadurch ist der Ausfall auch für Nutzer sichtbar.

### 4.5 Datenbank-Ausfall

**Live zeigen:**
- `docker compose stop database`
- Postman: `GET https://localhost/api/health`
- Postman: `GET https://localhost/api/tasks`
- Frontend neu laden
- `docker compose start database`

**Sprechtext:**
Beim Ausfall der Datenbank reagiert die Anwendung ebenfalls mit einem klaren Fehlerzustand.
Die API kann keine Daten mehr liefern, und im Frontend wird der Fehler sichtbar.

### 4.6 Datenbank-Ausfall im Monitoring

**Live zeigen:**
- optional Prometheus / Grafana parallel offen lassen
- Frontend / API-Fehlerzustand zeigen

**Sprechtext:**
Der Ausfall der Datenbank war in unserem Test vor allem über das Verhalten der Anwendung sichtbar.
Im Frontend wurde ein klarer Fehlerzustand angezeigt, und die API reagierte nicht mehr normal.
Ein separater Datenbank-Target war im Monitoring nicht so deutlich visualisiert wie beim Backend-Ausfall, die Auswirkungen des Ausfalls waren aber klar erkennbar.

### 4.7 Horizontale Skalierung

**Live zeigen:**
- Postman oder Terminal: mehrfach `GET https://localhost/api/tasks`

**Sprechtext:**
Die Anwendung skaliert horizontal, da wir mehrere Frontend- und Backend-Instanzen einsetzen.
Am Backend kann man das daran erkennen, dass Antworten von unterschiedlichen Instanzen kommen.

## 5. Monitoring

### 5.1 Health-Checks

**Live zeigen:**
- `docker compose ps`

**Sprechtext:**
Alle wichtigen Services besitzen Health-Checks.
Dadurch lässt sich der Status einzelner Container automatisiert überwachen.

### 5.2 Geordnete Start-Reihenfolge

**Live zeigen:**
- optional `docker compose config`
- oder kurz die `depends_on`-Logik erläutern

**Sprechtext:**
Die Services besitzen geeignete Abhängigkeiten, sodass eine sinnvolle Start-Reihenfolge eingehalten wird.
Beispielsweise starten Backend-Container erst, wenn die Datenbank verfügbar ist.

### 5.3 Absturz eines Containers wird erkannt

**Live zeigen:**
- Prometheus `/targets`
- Grafana Dashboard
- optional `docker compose kill backend-api-2` als Erkennungsbeispiel

**Sprechtext:**
Ein unerwarteter Ausfall eines Containers wird erkannt und im Monitoring angezeigt.

### 5.4 Automatischer Neustart bei unerwartetem Crash

**Live zeigen:**
- optional:
  - `docker compose exec backend-api-1 kill -9 1`
  - `docker compose ps`

**Sprechtext:**
Für die Container ist eine Restart-Policy konfiguriert.
Wichtig ist dabei die Unterscheidung:
Ein administrativer Stop von außen gilt nicht als unerwarteter Crash.
Für den eigentlichen Nachweis muss ein interner Prozessabsturz simuliert werden, also das Beenden des Hauptprozesses PID 1 innerhalb des Containers.
Dieses Verhalten ist für unsere Konfiguration vorgesehen und kann entsprechend demonstriert werden.

### 5.5 Überwachungslimits

**Live zeigen:**
- `docker compose config`
- optional auf `deploy.resources.limits` zeigen

**Sprechtext:**
Für die Container sind Überwachungslimits konfiguriert, insbesondere für Ressourcen wie Speicher und CPU.

### 5.6 Benachrichtigungen

**Live zeigen:**
- Browser: `http://localhost:9090/alerts`
- Terminal: `docker compose logs notification-service --tail 50`

**Sprechtext:**
Zusätzlich haben wir Alerting-Komponenten integriert, damit definierte Probleme wie Container-Ausfälle oder hohe Ressourcenauslastung gemeldet werden können.

### 5.7 Alerts live / genauer Nachweis

**Live zeigen:**
- `http://localhost:9090/alerts`
- `docker compose logs notification-service --tail 50`

**Sprechtext:**
Den Alert-Nachweis haben wir ebenfalls getestet.
Bei einem Ausfall eines Backend-Containers wurde ein `ContainerDown`-Alert ausgelöst.
Dieser Alert wurde über Alertmanager an unseren Notification-Service weitergeleitet und dort als Webhook empfangen und protokolliert.

## 6. Security

### 6.1 Netzisolierung

**Live zeigen:**
- `docker compose config`
- oder README/Diagramm mit Netzwerken

**Sprechtext:**
Die Dienste sind sinnvoll über mehrere Docker-Netzwerke getrennt.
Wir verwenden unter anderem:

ein öffentliches Netzwerk für den Einstiegspunkt
getrennte Netzwerke für Frontend und Backend
ein internes Datenbanknetz
und ein separates Monitoring-Netz.

Besonders wichtig ist das interne Datenbanknetz `db-net`, das nicht von außen erreichbar ist.

### 6.2 SSL / HTTPS

**Live zeigen:**
- Browser `https://localhost`
- optional `curl -I http://localhost`

**Sprechtext:**
Die Kommunikation mit der Anwendung erfolgt SSL-verschlüsselt über HTTPS.
Wir verwenden dafür ein selbstsigniertes Zertifikat, was für den Rahmen dieser Belegarbeit ausreichend ist.
HTTP wird dabei automatisch auf HTTPS umgeleitet.

### 6.3 Docker Secrets

**Live zeigen:**
- `docker compose config`
- optional:
  - `docker inspect belegarbeit-taskflow-backend-api-1-1 | findstr DB_PASSWORD`
  - `docker inspect belegarbeit-taskflow-database-1 | findstr POSTGRES_PASSWORD`

**Sprechtext:**
Passwörter werden nicht als Klartext-Passwörter direkt in der Compose-Konfiguration verwendet, sondern als Secret-Dateien in die Container eingebunden.
So werden Datenbank- und Grafana-Passwörter sicherer bereitgestellt.

### 6.4 Keine unnötigen Ports

**Live zeigen:**
- `docker compose ps`

**Sprechtext:**
Es sind nur die wirklich benötigten Ports nach außen exponiert, insbesondere für den Reverse Proxy sowie die Monitoring-Oberflächen.
Backend und Datenbank sind nicht direkt öffentlich erreichbar.

### 6.5 Zusätzliche Hardening-Maßnahmen

**Live zeigen:**
- `docker compose config`
- oder: `Select-String -Path docker-compose.yml -Pattern "read_only|cap_drop|no-new-privileges"`

**Sprechtext:**
Zusätzlich haben wir mehrere Hardening-Maßnahmen umgesetzt.
Dazu gehören read_only-Dateisysteme, cap_drop: ALL, no-new-privileges sowie tmpfs für temporäre Verzeichnisse.
Damit werden Schreibrechte und Privilegien der Container bewusst eingeschränkt.

## 7. Sonstiges

### 7.1 Web Application Firewall

**Live zeigen:**
- `docker compose ps`
- oder Architektur / Compose

**Sprechtext:**
Unsere Infrastruktur enthält eine Web Application Firewall.
Der Reverse Proxy basiert auf einem OWASP ModSecurity CRS Nginx Image und enthält damit eine integrierte WAF-Komponente.

### 7.2 Security Scan

**Live zeigen:**
- Terminal mit Trivy-Scan-Ergebnis
- `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image belegarbeit-taskflow-backend-api-1`

**Sprechtext:**
Für unsere eigenen Images haben wir einen Security Scan mit Trivy durchgeführt.  
Dabei wurde das Backend-Image auf Betriebssystem- und Anwendungsbibliotheken geprüft.

### 7.3 Keine kritischen Schwachstellen

**Live zeigen:**
- Trivy-Scan-Zusammenfassung

**Sprechtext:**
Im Security Scan wurden auch kritische Schwachstellen gefunden, insbesondere in Java-Abhängigkeiten des Backend-Images.  
Diesen Punkt würden wir daher nicht als vollständig erfüllt bewerten.  
Die Ergebnisse zeigen aber gleichzeitig, an welchen Stellen ein Update der verwendeten Bibliotheken notwendig ist.

### 7.4 Automatisiertes Datenbank-Backup

**Live zeigen:**
- `docker compose exec db-backup ls /backups/`

**Sprechtext:**
Zusätzlich ist ein automatisiertes Datenbank-Backup eingerichtet.  
Dafür läuft ein separater `db-backup`-Service, der regelmäßig Sicherungen der PostgreSQL-Datenbank erzeugt.  
Im Backup-Verzeichnis sieht man mehrere Dump-Dateien mit Zeitstempel, was den automatisierten Ablauf nachweist.

## 8. Lasttests

**Live zeigen:**
- [OFFEN]

**Sprechtext:**
- [OFFEN]

## 9. Abschluss

**Sprechtext:**
Zusammenfassend haben wir mit TaskFlow eine containerisierte Multi-Service-Infrastruktur umgesetzt, die:

mit Docker Compose gestartet werden kann
mehrere Dienste sauber trennt
Monitoring und Alerting integriert
horizontale Skalierung unterstützt
auf Ausfälle sichtbar reagiert
sowie HTTPS, Secrets, WAF und Backup-Funktionalität enthält.

