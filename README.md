# Baustellen-App

Zeit-, Material- und Fotoerfassung pro Baustelle mit Abrechnung als Word-Datei.

| Teil | Technik | Ordner |
|------|---------|--------|
| Frontend | React 19 + Vite 8 + TypeScript, PWA, HashRouter, GitHub Pages | [frontend/](frontend/) |
| Backend | Google Apps Script (V8), Daten in Sheets/Drive des Owners | [backend/src/](backend/src/) |
| Emulator | Node-Nachbau der benutzten Apps-Script-Dienste für Tests und lokale Entwicklung | [backend/dev/](backend/dev/) |

## Lokal entwickeln

Voraussetzung: Node.js ≥ 20. Es wird kein Google-Konto gebraucht. Das Backend läuft im Emulator (Daten nur im Speicher, beim Neustart weg, mit Beispieldaten), die Anmeldung erfolgt per Auswahl der E-Mail.

```bash
node backend/dev/server.js
```

```bash
npm --prefix frontend install
```

```bash
npm --prefix frontend run dev
```

Danach `http://localhost:5173` öffnen und als `chef@example.com`, `max@example.com` oder `eva@example.com` anmelden. Die Konfiguration dafür steht in [frontend/.env.development](frontend/.env.development). Für die Entwicklung gegen das echte Apps Script legst du `frontend/.env.development.local` an und setzt dort `VITE_API_URL` und `VITE_GOOGLE_CLIENT_ID` sowie `VITE_DEV_AUTH=false`.

Tests:

```bash
npm --prefix backend test
```

```bash
npm --prefix frontend test
```

Die Backend-Tests laden den echten Apps-Script-Code in eine Node-VM mit nachgebauten Diensten (SpreadsheetApp, DriveApp, CacheService …). Nur `DocumentApp` (Rechnungsvorlage und DOCX) wird nicht nachgebaut. Der Emulator liefert stattdessen eine Text-Datei, die echte Word-Datei entsteht erst im Apps Script.

## Einmalige Einrichtung (Produktion)

1. **OAuth-Client-ID** in der [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Falls noch nicht vorhanden, den OAuth-Zustimmungsbildschirm konfigurieren (Typ „Extern“, Status „In Produktion“, keine sensiblen Scopes nötig).
   - „Anmeldedaten erstellen“ → „OAuth-Client-ID“ → Typ „Webanwendung“.
   - Autorisierte JavaScript-Ursprünge: `https://<github-user>.github.io` und `http://localhost:5173`.
2. **Apps-Script-Projekt** mit dem Owner-Account (dem Account, in dessen Drive die Daten liegen sollen):
   - Die Apps Script API unter <https://script.google.com/home/usersettings> aktivieren.
   - `npm install -g @google/clasp`, dann `clasp login`.
   - In `backend/` ausführen: `clasp create --type standalone --title "Baustellen-App" --rootDir src`. Danach `.clasp.json` prüfen (Vorlage: [backend/.clasp.json.example](backend/.clasp.json.example)). Falls `clasp create` die Datei `src/appsscript.json` überschrieben hat, mit `git checkout -- src/appsscript.json` wiederherstellen. Dann `clasp push` ausführen.
3. Im Script-Editor (`clasp open-script`) die Funktion **`setup`** ausführen und die Berechtigungen bestätigen. Sie legt den Ordner `Baustellen-App` mit `Stammdaten`, `Rechnungsvorlage` und `Projekte/` an und trägt den Owner als Chef ein.
4. Unter **Projekteinstellungen → Skripteigenschaften** die Eigenschaft `CLIENT_ID` mit der OAuth-Client-ID aus Schritt 1 anlegen.
5. Im Google Doc **Rechnungsvorlage** die Firmendaten (Kopfzeile), die Bankverbindung und das Zahlungsziel eintragen. Die gelb markierten Stellen sind Platzhaltertexte, die `{{…}}`-Platzhalter müssen erhalten bleiben.
6. **Web-App deployen**: „Bereitstellen → Neue Bereitstellung → Web-App“, *Ausführen als: Ich*, *Zugriff: Jeder*. Die `/exec`-URL notieren. Bei späteren Code-Änderungen `clasp push` ausführen und die Bereitstellung aktualisieren („Bereitstellungen verwalten → Bearbeiten → Neue Version“), damit die URL gleich bleibt.
7. **GitHub**: unter *Settings → Pages* als Quelle „GitHub Actions“ wählen. Unter *Settings → Secrets and variables → Actions → Variables* die Variablen `VITE_API_URL` (die `/exec`-URL) und `VITE_GOOGLE_CLIENT_ID` anlegen. Jeder Push auf `main`, der `frontend/` ändert, deployt die App ([Workflow](.github/workflows/deploy-pages.yml)).
8. In der App als Chef anmelden. Unter *Mitarbeiter* dich selbst (für eigene Stunden) und alle Mitarbeiter mit Google-E-Mail und Stundensatz anlegen. Danach den *Leistungskatalog* prüfen.

Rechnungsvorlage neu erzeugen (z. B. nach einer Layout-Änderung im Code): im Script-Editor `resetInvoiceTemplate` ausführen. Die alte Vorlage wandert in den Papierkorb.

## Umsetzungsdetails

- **Überschneidungswarnung** bei Stunden: Sie prüft nur Einträge desselben Mitarbeiters am selben Tag *im selben Projekt*. Ein Abgleich über alle Projekte müsste bei jedem Speichern alle Projekt-Sheets öffnen. Die Warnung kommt als `CONFIRM_REQUIRED` und wird nach Bestätigung erneut gesendet.
- **Rechnungsart** (Rechnung / Zwischenrechnung / Schlussrechnung) ist im Assistenten wählbar. Voreinstellung: „Zwischenrechnung“ bei aktiven, „Schlussrechnung“ bei abgeschlossenen Projekten. Sie wird in der Spalte „Art“ gespeichert.
- Zusätzliche Spalten für die Rechteprüfung: „Gemeldet von (MA-ID)“ (Materialbedarf) und „Hochgeladen von (MA-ID)“ (Fotos). Der Leistungszeitraum steht in zwei Spalten (von/bis).
- Zusätzliche Aktion `deleteCatalogItem` zum Löschen von Katalogpositionen.
- Die Spalten werden über die Überschrift gefunden. Der Chef darf Spalten umsortieren oder eigene Spalten anhängen, deren Inhalt bleibt erhalten. Eingaben, die mit `=`, `+`, `-` oder `@` beginnen, werden als Text gespeichert (kein Formel-Einschleusen).
- Mitarbeiter sehen unter *Meine Erstattungen* auch Käufe aus abgeschlossenen Projekten.
- Offline: Beim Start ohne Netz wird der zuletzt angemeldete Benutzer aus dem Gerätespeicher verwendet. So lassen sich Entwürfe ausfüllen, gesendet wird erst online.
