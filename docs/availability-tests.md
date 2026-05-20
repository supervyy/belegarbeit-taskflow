# TaskFlow – Verfügbarkeitstests

> **Projekttyp:** Universitätsprojekt – Multi-Service Docker-Compose-Infrastruktur  
> **Letzte Aktualisierung:** Mai 2026

Diese Dokumentation beschreibt manuelle Verfügbarkeits- und Failover-Tests für die TaskFlow-Infrastruktur. Ziel ist es, die Hochverfügbarkeit (HA) der einzelnen Schichten zu demonstrieren und die automatische Fehlertoleranz des Systems zu verifizieren.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Test 1 – Frontend-Hochverfügbarkeit](#2-test-1--frontend-hochverfügbarkeit)
3. [Test 2 – Backend-Ausfall](#3-test-2--backend-ausfall)
4. [Test 3 – Datenbankausfall](#4-test-3--datenbankausfall)
5. [Test 4 – Scale-Out-Demo](#5-test-4--scale-out-demo)
6. [Checkliste](#6-checkliste)

---

## 1. Voraussetzungen

```bash
# Gesamten Stack starten
docker compose up -d

# Status prüfen (alle Container sollten "Up" zeigen)
docker compose ps

# Logs im Blick behalten (optionales zweites Terminal)
docker compose logs -f
```

> [!IMPORTANT]
> Alle Tests setzen voraus, dass der Stack vollständig gestartet und stabil ist (`healthy` bzw. `running`). Warte nach `docker compose up -d` mindestens 30 Sekunden, bis Spring Boot hochgefahren ist.

---

## 2. Test 1 – Frontend-Hochverfügbarkeit

**Ziel:** Wenn `frontend-1` ausfällt, muss die Seite über `frontend-2` weiterhin erreichbar sein.

### 2.1 Ausgangszustand prüfen

```bash
# Seite muss erreichbar sein
curl -sk https://localhost/ | grep -i "taskflow"

# Beide Frontends müssen laufen
docker compose ps frontend-1 frontend-2
```

### 2.2 frontend-1 stoppen

```bash
docker compose stop frontend-1
```

**Erwartetes Verhalten:**
- Der Load-Balancer erkennt den Ausfall und entfernt `frontend-1` aus der Upstream-Rotation (Nginx `upstream` Health-Check).
- Alle weiteren Anfragen gehen ausschließlich an `frontend-2`.
- Für den Browser ist **kein Fehler sichtbar** – die Seite lädt weiterhin vollständig.

### 2.3 Verifizierung

```bash
# Seite muss noch erreichbar sein
curl -sk https://localhost/ | grep -i "taskflow"
# Erwartung: HTML-Inhalt wird zurückgegeben (kein 502/503)

# Optional: Load-Balancer-Logs prüfen
docker compose logs load-balancer | grep -E "(upstream|error)"
```

### 2.4 Wiederherstellung

```bash
docker compose start frontend-1

# Status prüfen
docker compose ps frontend-1
# Erwartung: "Up"
```

> [!TIP]
> Mit `watch -n1 curl -sk https://localhost/ -o /dev/null -w "%{http_code}"` kann der HTTP-Status kontinuierlich beobachtet werden.

---

## 3. Test 2 – Backend-Ausfall

**Ziel:** Wenn alle drei Backend-APIs ausfallen, muss das Frontend eine Fehlermeldung (Error-Banner) anzeigen statt zu crashen.

### 3.1 Ausgangszustand prüfen

```bash
# API muss antworten
curl -sk https://localhost/api/health
# Erwartung: {"status":"UP"} oder ähnlich

docker compose ps backend-api-1 backend-api-2 backend-api-3
```

### 3.2 Alle Backends stoppen

```bash
docker compose stop backend-api-1 backend-api-2 backend-api-3
```

**Erwartetes Verhalten:**
- Der Load-Balancer gibt für `/api/*`-Anfragen `502 Bad Gateway` zurück.
- Das Frontend (Vue/React SPA) fängt den Fehler ab und zeigt einen **Fehler-Banner** an (z. B. „Verbindung zum Server nicht möglich. Bitte versuche es später erneut.").
- Die statischen Seiteninhalte (HTML, CSS, JS) sind weiterhin verfügbar.

### 3.3 Verifizierung

```bash
# API-Endpunkt muss 502 zurückgeben
curl -sk -o /dev/null -w "%{http_code}" https://localhost/api/health
# Erwartung: 502

# Startseite muss weiterhin geladen werden
curl -sk -o /dev/null -w "%{http_code}" https://localhost/
# Erwartung: 200

# Frontend-Seite im Browser öffnen: https://localhost/
# Erwartung: Error-Banner sichtbar, Seite lädt trotzdem
```

### 3.4 Wiederherstellung

```bash
docker compose start backend-api-1 backend-api-2 backend-api-3

# Warten bis Spring Boot hochgefahren ist (~20-30 s)
sleep 30

# Health-Check
curl -sk https://localhost/api/health
```

---

## 4. Test 3 – Datenbankausfall

**Ziel:** Wenn die Datenbank ausfällt, muss das Frontend einen DB-Fehler-Banner anzeigen, aber nicht vollständig abstürzen.

### 4.1 Ausgangszustand prüfen

```bash
# Tasks-Endpunkt muss Daten liefern
curl -sk https://localhost/api/tasks
# Erwartung: JSON-Array mit Tasks

docker compose ps database
```

### 4.2 Datenbank stoppen

```bash
docker compose stop database
```

**Erwartetes Verhalten:**
- Die Backend-APIs können sich nicht mehr mit PostgreSQL verbinden (JDBC-Connection-Pool erschöpft sich).
- `/api/tasks` und `/api/data` geben `503 Service Unavailable` oder `500 Internal Server Error` zurück.
- Das Frontend erkennt den Fehler und zeigt einen **DB-Fehler-Banner** an (z. B. „Datenbankverbindung unterbrochen. Gespeicherte Daten sind vorübergehend nicht verfügbar.").
- `/api/health` kann weiterhin antworten, signalisiert aber `{"status":"DOWN","components":{"db":{"status":"DOWN"}}}`.

### 4.3 Verifizierung

```bash
# Tasks-Endpunkt muss Fehler zurückgeben
curl -sk -o /dev/null -w "%{http_code}" https://localhost/api/tasks
# Erwartung: 503 oder 500

# Health-Endpunkt prüfen
curl -sk https://localhost/api/health | python3 -m json.tool
# Erwartung: db.status = "DOWN"

# Frontend im Browser öffnen: https://localhost/
# Erwartung: DB-Fehler-Banner sichtbar
```

### 4.4 Wiederherstellung

```bash
docker compose start database

# PostgreSQL braucht ~10-15 s zum Starten
sleep 20

# Spring Boot Connection-Pool erholt sich automatisch (HikariCP)
# Tasks-Endpunkt testen
curl -sk https://localhost/api/tasks
# Erwartung: JSON-Array mit Tasks
```

> [!NOTE]
> HikariCP versucht automatisch, Datenbankverbindungen wiederherzustellen. Ein Neustart der Backend-Container ist in der Regel **nicht notwendig**.

---

## 5. Test 4 – Scale-Out-Demo

**Ziel:** Demonstrieren, dass zusätzliche Backend-Instanzen zur Laufzeit hinzugefügt werden können.

### 5.1 Aktuelle Instanzanzahl prüfen

```bash
docker compose ps | grep backend-api
# Ausgabe zeigt: backend-api-1, backend-api-2, backend-api-3
```

### 5.2 Scale-Out durchführen

> [!WARNING]
> Das `--scale`-Flag funktioniert nur korrekt, wenn der Dienst in `docker-compose.yml` als `backend-api` (ohne feste Nummerierung) definiert ist **oder** wenn die expliziten Dienste `backend-api-1/2/3` manuell ergänzt werden. Bei explizit benannten Diensten (wie in diesem Projekt) dient dieses Kommando als Demonstration des Konzepts.

```bash
# Konzept-Demo: Skalierung mit generischem Dienstnamen
docker compose up --scale backend-api=3 -d

# Alternativ bei explizit benannten Diensten:
# Weitere Instanz manuell hochfahren
docker compose up -d backend-api-3
```

**Erwartetes Verhalten:**
- Docker Compose startet die gewünschte Anzahl an Instanzen.
- Der Load-Balancer erkennt neue Upstream-Hosts (bei DNS-basiertem Discovery) oder muss manuell neu geladen werden (`docker compose restart load-balancer`).
- Anfragen werden auf alle laufenden Instanzen verteilt.

### 5.3 Verifizierung

```bash
# Laufende Backend-Container zählen
docker compose ps | grep backend-api | wc -l
# Erwartung: 3 (oder mehr, je nach Scale-Wert)

# Round-Robin prüfen via Logs (Hostname sollte wechseln)
for i in $(seq 1 6); do
  curl -sk https://localhost/api/health | python3 -m json.tool
  sleep 0.5
done
```

### 5.4 Zurücksetzen

```bash
docker compose up --scale backend-api=3 -d
# oder explizit:
docker compose up -d backend-api-1 backend-api-2 backend-api-3
```

---

## 6. Checkliste

| # | Test | Durchgeführt am | Ergebnis | Bemerkungen |
|---|---|---|---|---|
| 1 | Frontend-HA (`frontend-1` stoppen) | *(Datum eintragen)* | ⬜ | |
| 2 | Backend-Ausfall (alle 3 APIs stoppen) | *(Datum eintragen)* | ⬜ | |
| 3 | Datenbankausfall | *(Datum eintragen)* | ⬜ | |
| 4 | Scale-Out-Demo | *(Datum eintragen)* | ⬜ | |

**Legende:** ⬜ Ausstehend · ✅ Bestanden · ❌ Fehlgeschlagen · ⚠️ Teilweise
