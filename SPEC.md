# Spezifikation: Baustellen-App (Zeit-, Material- und Fotoerfassung mit Abrechnung)

Stand: 14.11.2026. Grundlage: `requirements.md`, die Muster in `muster/` und das Anforderungsinterview.

## 1. Zweck und Umfang

Ein kleiner Elektrobetrieb erfasst Tätigkeiten, Materialzukäufe, Materialbedarf und Fotos pro Baustelle (Projekt) am Smartphone. Der Chef erstellt daraus (Zwischen-)Rechnungen als bearbeitbare Word-Datei und verfolgt den Status „offen → verrechnet → bezahlt“.

Die App ersetzt den bisherigen Ablauf mit Google Forms und `Master.xlsx`.

### Nicht im Umfang

- Übernahme von Altdaten aus `Master.xlsx` (Neustart; laufende Projekte werden im alten System fertig abgerechnet)
- Echte Offline-Synchronisation (die App braucht zum Speichern Netz, siehe 3.4)
- Finanzamtstaugliche Rechnungslegung: Rechnungsnummern müssen nicht lückenlos sein, Rechnungen dürfen gelöscht werden
- E-Rechnung, Mahnwesen, Versand von Rechnungen per E-Mail
- Lohnverrechnung und Arbeitszeitgesetz (Pausen werden nicht erfasst)
- Mehrsprachigkeit (UI nur Deutsch)

## 2. Rollen und Rechte

Es gibt genau zwei Rollen.

| Rolle       | Wer                                                         |
|-------------|-------------------------------------------------------------|
| Chef        | Genau ein Account, dessen E-Mail in den Einstellungen steht |
| Mitarbeiter | Alle aktiven Einträge der Mitarbeiterliste                  |

Login erfolgt immer mit dem Google-Account. Wer nicht in der Mitarbeiterliste steht (oder inaktiv ist) und nicht Chef ist, wird abgewiesen.

Der Chef steht auch in der Mitarbeiterliste: Er hat einen Stundensatz und erfasst eigene Stunden.

### Rechtematrix

| Funktion                                    | Mitarbeiter                                         | Chef |
|---------------------------------------------|-----------------------------------------------------|------|
| Aktive Projekte sehen (Stammdaten)          | ja (alle aktiven, keine Zuordnung nötig)            | ja, auch abgeschlossene |
| Stunden erfassen                            | eigene                                              | für jeden MA |
| Stunden bearbeiten/löschen                  | eigene, solange Status „offen“ und Projekt aktiv    | jede, solange Status „offen“ |
| Stunden sehen                               | nur eigene                                          | alle |
| Materialkauf erfassen                       | eigene                                              | für jeden MA |
| Materialkauf bearbeiten/löschen             | eigene, solange „offen“ und Projekt aktiv           | jeden, solange „offen“ |
| Materialkäufe sehen                         | nur eigene, inkl. Erstattungsstatus                 | alle |
| Erstattung setzen                           | nein                                                | ja |
| Materialbedarf melden / sehen               | ja / alle des Projekts                              | ja / alle |
| Materialbedarf → „bestellt“                 | nein                                                | ja |
| Materialbedarf → „erledigt“                 | nur eigene Meldungen                                | ja |
| Fotos hochladen / sehen                     | ja / alle des Projekts                              | ja / alle |
| Foto annotieren (nachträglich) / löschen    | eigene, solange Projekt aktiv                       | alle |
| Stundensätze sehen                          | nein                                                | ja |
| Projekte, Mitarbeiter, Katalog, Einstellungen verwalten | nein                                    | ja |
| Rechnungen erstellen, löschen, als bezahlt markieren | nein                                       | ja |
| Dashboard                                   | nein                                                | ja |

Verrechnete oder bezahlte Posten kann niemand direkt ändern. Wer sie korrigieren will, löscht die Rechnung (Posten werden wieder „offen“).

In abgeschlossenen Projekten können Mitarbeiter nichts mehr eingeben oder ändern. Der Chef darf dort weiter abrechnen und korrigieren.

## 3. Architektur

```
Smartphone / PC (Browser, PWA)
  React + Vite (TypeScript), gehostet auf GitHub Pages
        │  Google Identity Services → ID-Token (JWT)
        │  HTTPS POST (JSON als text/plain, ID-Token im Body)
        ▼
Google Apps Script Web App  (ausgeführt als Chef-/Owner-Account)
        │  prüft Token, Rolle, Rechte; LockService für Schreibzugriffe
        ▼
Google Drive des Owners: Sheets (Daten), JPEG (Fotos/Belege), Google Doc (Rechnungsvorlage), DOCX (Rechnungen)
```

Es kommen nur kostenlose Ressourcen zum Einsatz: GitHub Pages (öffentliches Repo), Apps Script, Drive, Sheets, Docs, MailApp.

### 3.1 Frontend

- React + Vite + TypeScript, mobile-first.
- Routing mit `HashRouter`, weil GitHub Pages keine Server-Rewrites kann.
- PWA (`vite-plugin-pwa`): installierbar am Homescreen, App-Shell gecacht.
- Deployment per GitHub Action bei Push auf `main`. Script-URL und OAuth-Client-ID kommen aus GitHub Actions Variables (`VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`). Beide sind nicht geheim.
- Das Repo ist öffentlich.

### 3.2 Authentifizierung

1. Das Frontend meldet den Benutzer über Google Identity Services an (One Tap / Sign-In-Button, `auto_select` für stilles Erneuern) und erhält ein ID-Token.
2. Jeder API-Request trägt das ID-Token im JSON-Body.
3. Das Apps Script verifiziert das Token über `https://oauth2.googleapis.com/tokeninfo`. Es prüft `aud` gegen die Client-ID, `email_verified` und `exp`. Das Ergebnis wird für die Restlaufzeit im `CacheService` gehalten (Schlüssel: Hash des Tokens).
4. Die E-Mail wird gegen die Chef-E-Mail und die aktive Mitarbeiterliste geprüft. Daraus ergeben sich Rolle und Mitarbeiter-ID.
5. Ein abgelaufenes Token (ca. 1 h) liefert den Fehler `AUTH_EXPIRED`. Das Frontend holt still ein neues Token und wiederholt den Request.

Die Web App wird mit „Ausführen als: Ich“ und „Zugriff: Jeder“ deployed. „Jeder mit Google-Konto“ geht nicht, weil `fetch` von GitHub Pages keine Google-Session-Cookies mitschicken kann. Geschützt wird ausschließlich über die Token-Prüfung.

Die OAuth-Client-ID (Typ Webanwendung, autorisierter JavaScript-Ursprung = GitHub-Pages-URL und `http://localhost:5173`) wird einmalig in der Google Cloud Console angelegt.

### 3.3 Backend (Apps Script)

- Ein einziger Einstiegspunkt `doPost(e)` mit `{ action, idToken, payload }`. Antwort ist JSON über `ContentService`: `{ ok: true, data }` oder `{ ok: false, error: { code, message } }`.
- Requests werden als `Content-Type: text/plain` gesendet, damit kein CORS-Preflight entsteht. Das Frontend folgt dem Redirect von `/exec` nach `script.googleusercontent.com`.
- Schreibzugriffe laufen unter `LockService.getScriptLock()` (Timeout 20 s). Jede Zeile wird über eine UUID identifiziert, nie über die Zeilennummer.
- Der Code liegt im Repo unter `backend/` und wird mit `clasp` gepusht und deployed.
- Script Properties: `ROOT_FOLDER_ID`, `MASTER_SHEET_ID`, `TEMPLATE_DOC_ID`, `CLIENT_ID`.

### 3.4 Netz und PWA

- Speichern braucht Netz. Ohne Verbindung zeigt die App einen deutlichen Hinweis, und der Senden-Button ist deaktiviert.
- Ungespeicherte Formulareingaben (inkl. aufgenommener, komprimierter Fotos) bleiben im Gerät erhalten (IndexedDB), bis sie erfolgreich gesendet oder verworfen sind. Eine automatische Hintergrund-Synchronisation gibt es nicht.

### 3.5 Account-Konfiguration und Setup

- Die Daten liegen immer im Drive des Accounts, unter dem das Apps Script deployed ist (Owner).
- Die Funktion `setup()` wird einmal vom Owner im Script-Editor ausgeführt:
  - Sie legt die Ordnerstruktur (3.6) und das Stammdaten-Sheet an.
  - Sie erzeugt die Rechnungsvorlage als Google Doc aus dem Code (siehe 5.6).
  - Sie schreibt die IDs in die Script Properties.
  - Sie trägt den Owner als Chef-E-Mail in die Einstellungen ein.
- Die Chef-E-Mail ist danach in der App änderbar und regelt nur die App-Rechte. Ein Wechsel des Daten-Accounts bedeutet ein neues Deployment unter dem neuen Account samt `setup()`.

### 3.6 Ablage im Drive

```
Baustellen-App/
├── Stammdaten                     (Google Sheet)
├── Rechnungsvorlage               (Google Doc)
└── Projekte/
    └── <Projektname>/
        ├── <Projektname> – Daten  (Google Sheet)
        ├── Fotos/                 (JPEG)
        ├── Belege/                (JPEG)
        └── Rechnungen/            (DOCX)
```

Doppelte Projektnamen sind nicht erlaubt. Die interne Projekt-ID steht nur im Stammdaten-Sheet.

Fotos und Belege bleiben privat im Drive des Owners. Das Frontend lädt sie über das Backend:

- Listen liefern Vorschaubilder über den Drive-`thumbnailLink` (ca. 400 px, base64).
- Die volle Auflösung wird nur bei Bedarf geladen.

## 4. Datenmodell

Die Sheets sind für den Chef lesbar: deutsche Spaltenüberschriften in Zeile 1, eine Zeile pro Datensatz, ID in Spalte A. Jedes Sheet trägt den Hinweis „Nur über die App ändern“ (geschützter Bereich mit Warnung). Manuelle Änderungen erfolgen auf eigene Gefahr. Die App validiert beim Lesen und überspringt ungültige Zeilen mit einer Log-Meldung.

Im Code werden englische Feldnamen verwendet. Die Zuordnung zu den Überschriften liegt zentral in einer Mapping-Datei. Datumswerte werden als ISO-Strings `YYYY-MM-DD`, Zeiten als `HH:MM` und Beträge als Zahl (Euro, 2 Nachkommastellen) gespeichert.

### 4.1 Stammdaten-Sheet

**Einstellungen** (Schlüssel | Wert)

| Schlüssel             | Beispiel                     | Bedeutung |
|-----------------------|------------------------------|-----------|
| chefEmail             | chef@gmail.com               | Account mit Chef-Rechten |
| materialMarkupPercent | 20                           | Standard-Materialaufschlag |
| reverseChargeText     | Übergang der Steuerschuld gemäß § 19 Abs. 1a UStG | Hinweistext auf der Rechnung |

**Mitarbeiter**: ID, Name, Kürzel (z. B. PKV), E-Mail (Google), Stundensatz (€/h netto), Aktiv (ja/nein)

**Projekte**: ID, Projekt / Bauvorhaben, Auftraggeber / Kunde, Baustellenadresse, Bauleiter, Materialaufschlag % (leer = Standard), Status (aktiv/abgeschlossen), Ordner-ID, Sheet-ID, Angelegt am, Abgeschlossen am

**Leistungskatalog**: Code, Beschreibung, Einheit, Netto-Preis (€). Die Startwerte kommen aus `Master.xlsx`, z. B. `PAUSCH-ANFAHRT` mit 45 € und `PRUEF-EBEF` mit 180 €.

**Rechnungsregister**: Rechnungsnummer, Rechnung-ID, Projekt-ID, Rechnungsdatum. Es dient der projektübergreifenden Nummernvergabe.

### 4.2 Projekt-Sheet

**Zeiten**

| Spalte            | Hinweis |
|-------------------|---------|
| ID                | UUID |
| Datum             | Pflicht, nicht in der Zukunft |
| Mitarbeiter-ID, Mitarbeiter | Name zur Lesbarkeit |
| Von, Bis          | Pflicht, `Bis > Von`, kein Tageswechsel |
| Stunden           | berechnet, siehe 5.1 |
| Kurzbeschreibung  | Pflicht |
| Status            | offen / verrechnet / bezahlt |
| Rechnung-ID       | gesetzt ab „verrechnet“ |
| Stundensatz       | beim Verrechnen eingefroren |
| Erfasst von, Erfasst am, Geändert am | |

**Materialkäufe**

| Spalte             | Hinweis |
|--------------------|---------|
| ID, Datum          | |
| Gekauft von (MA-ID), Name | |
| Artikel / Beschreibung | Pflicht |
| Betrag (€)         | Kassenbetrag brutto, Pflicht, > 0 |
| Quelle             | QR / manuell |
| Kassen-ID, Beleg-Nr. | aus QR, optional |
| Beleg-Datei-ID     | optional, JPEG in `Belege/` |
| Status, Rechnung-ID | wie Zeiten |
| Erstattet, Erstattet am | ja/nein, Datum |
| Erfasst von, Erfasst am, Geändert am | |

**Materialbedarf**: ID, Datum, Gemeldet von, Material, Menge, Einheit, Dringlichkeit (normal/dringend), Notiz, Foto-Datei-ID (optional, in `Fotos/`), Status (offen/bestellt/erledigt), Geändert von, Geändert am

**Fotos**: ID, Aufgenommen am, Hochgeladen von, Beschreibung, Vorschaden (ja/nein), Datei-ID, Erfasst am, Geändert am

**Rechnungen**: ID, Rechnungsnummer, Rechnungsdatum, Stichtag, Leistungszeitraum (von–bis, aus den Posten), Status (erstellt/bezahlt), Bezahlt am, Summe Arbeit, Summe Zusatzpositionen, Materialbasis, Aufschlag %, Aufschlag €, Gesamt netto, DOCX-Datei-ID, Erstellt am

**Rechnungspositionen** (Zusatzpositionen): ID, Rechnung-ID, Code (leer bei freier Position), Beschreibung, Menge, Einheit, Einzelpreis, Gesamt

## 5. Fachliche Regeln

### 5.1 Zeiterfassung

- Eingabe am Ende des Arbeitstages: Datum (Default heute), Von, Bis, Kurzbeschreibung.
- Mehrere Einträge pro Tag sind erlaubt. Bei Überschneidung mit einem eigenen Eintrag am selben Tag erscheint eine Warnung (kein Verbot).
- Es gibt kein Pausenfeld: Von–Bis wird voll gezählt.
- Stunden = Minuten zwischen Von und Bis, kaufmännisch auf 0,25 h gerundet: `round(minutes / 15) * 0.25`. Beispiel: 08:30–16:20 = 470 min → 7,75 h.

### 5.2 Materialkauf

- Es wird der an der Kassa bezahlte Betrag (brutto) erfasst. Eine Aufteilung nach Steuersätzen wird nicht gespeichert.
- **QR-Scan**: Die Kamera scannt den RKSV-QR-Code am Kassenbon (`BarcodeDetector`-API, Fallback `zxing-wasm`). Alternativ wird ein Foto des Bons ausgewertet. Format, Felder durch `_` getrennt:

  ```
  _R1-AT1_AT0039/7_7150_2026-11-10T11:57:52_20,99_0,00_0,00_0,00_0,00_<Umsatzzähler>_<Zertifikat>_<Sig-Vorbeleg>_<Signatur>
       │    │       │    │                   └── Beträge brutto: Normal (20 %), Ermäßigt-1 (10 %), Ermäßigt-2 (13 %), Null, Besonders
       │    │       │    └── Datum/Uhrzeit
       │    │       └── Beleg-Nr.
       │    └── Kassen-ID
       └── Algorithmus-Kennung
  ```

  Übernommen werden: Datum, Kassen-ID, Beleg-Nr. und Betrag = Summe der fünf Betragsfelder (Dezimalkomma). Lässt sich der Code nicht lesen, bleibt die manuelle Eingabe.
- Die Artikelbeschreibung ist immer manuell (der QR-Code enthält keine Artikel). Ein Belegfoto ist optional.
- „Gekauft von“ ist der erfassende Mitarbeiter. Der Chef kann einen anderen wählen.
- **Erstattung**: Der Chef markiert Käufe als erstattet, einzeln oder gesammelt („alle offenen Erstattungen von MA X“). Das ist unabhängig vom Verrechnungsstatus. Mitarbeiter sehen ihre offenen Erstattungen.

### 5.3 Materialbedarf

- Felder: Material, Menge, Einheit, Dringlichkeit, Notiz, optional ein Foto.
- Bei einer neuen Meldung geht eine E-Mail per `MailApp` an die Chef-E-Mail (Projekt, Material, Menge, Dringlichkeit, Melder). Das Limit liegt bei 100 Mails pro Tag und reicht aus.
- Status: offen → bestellt (Chef) → erledigt (Chef oder Melder). Ein Wechsel von offen direkt zu erledigt ist erlaubt.

### 5.4 Fotos

- Aufnahme über die Kamera (`<input type="file" accept="image/*" capture="environment">`) oder aus der Galerie.
- Clientseitig wird das Bild auf max. 2560 px (lange Kante) verkleinert und als JPEG mit ca. 80 % Qualität gespeichert. Die EXIF-Orientierung wird angewendet.
- Annotationseditor (Canvas): Freihand, Kreis/Ellipse, Rechteck, Pfeil, Text; Farben Rot, Gelb, Blau, Weiß; Strichstärke; Undo/Redo.
- **Gespeichert wird nur die annotierte Version.** Wird nachträglich annotiert, zeichnet man auf dem gespeicherten Bild weiter, und die Datei wird ersetzt.
- Pro Foto gibt es eine Beschreibung und das Kennzeichen „Vorschaden“. Die Galerie pro Projekt ist chronologisch, mit Filter „nur Vorschäden“.

### 5.5 Abrechnung

**Rechnung erstellen** (nur Chef, pro Projekt):

1. Der Chef wählt den Stichtag (Default heute). Alle offenen Stunden und Materialkäufe mit Datum ≤ Stichtag sind vorausgewählt und einzeln abwählbar.
2. Er fügt optional Zusatzpositionen hinzu, aus dem Leistungskatalog (Menge änderbar) oder als freie Position.
3. Die Rechnungsnummer wird als `JJJJ-NNN` vorgeschlagen: höchste Nummer des Jahres im Rechnungsregister + 1. Sie ist editierbar und muss eindeutig sein. Lückenlosigkeit ist nicht nötig.
4. Die Vorschau zeigt alle Summen. Mit „Erstellen“:
   - werden die gewählten Posten „verrechnet“, bekommen die Rechnung-ID und den aktuellen Stundensatz eingefroren,
   - entsteht die DOCX (5.6), die im Ordner `Rechnungen/` abgelegt und im Browser heruntergeladen wird.

**Berechnung** (alle Beträge auf 2 Nachkommastellen gerundet):

| Größe                | Formel |
|----------------------|--------|
| Arbeit je MA         | Σ Stunden × Stundensatz |
| Summe Arbeit         | Σ Arbeit je MA |
| Zusatzpositionen     | Σ Menge × Einzelpreis |
| Materialbasis        | Σ Kassenbeträge (brutto) der gewählten Käufe |
| Aufschlag            | Materialbasis × Aufschlag % (Projekt-Override, sonst Standard) |
| Gesamt netto         | Arbeit + Zusatz + Materialbasis + Aufschlag |
| Umsatzsteuer         | immer 0 % (Reverse Charge), Hinweistext aus den Einstellungen |
| Gesamt               | = Gesamt netto |

**Status-Übergänge**

| Aktion                        | Wirkung |
|-------------------------------|---------|
| Rechnung erstellen            | Posten offen → verrechnet |
| Rechnung als bezahlt markieren (mit Datum) | Rechnung → bezahlt, alle ihre Posten → bezahlt |
| Bezahlt zurücknehmen          | Rechnung → erstellt, Posten → verrechnet |
| Rechnung löschen              | Posten → offen (Rechnung-ID und eingefrorener Satz geleert), Rechnungszeile, Positionen und Registereintrag gelöscht, DOCX in den Papierkorb |

Zwischenrechnungen entstehen einfach durch mehrfaches Abrechnen während des Projekts. Die bisherigen Rechnungen eines Projekts sind gelistet, die DOCX ist jederzeit erneut herunterladbar.

### 5.6 Word-Rechnung

Die Rechnungsvorlage wird **im Rahmen der Implementierung neu gestaltet**. Die Dateien in `muster/` sind nur Demos und dienen nicht als Vorlage. Die konkrete Gestaltung (Layout, Typografie, Platzhalternamen, Tabellenaufbau) legt die Implementierung fest. Verbindlich sind nur der technische Ablauf und der Mindestinhalt.

**Technischer Ablauf**

- Die Vorlage ist das Google Doc `Rechnungsvorlage` im Root-Ordner.
- `setup()` erzeugt sie per `DocumentApp` aus dem Code. Damit ist die Vorlage versioniert und reproduzierbar. Eine Funktion `resetInvoiceTemplate()` erzeugt sie bei Bedarf neu.
- Danach kann der Chef Firmendaten und Feinheiten des Layouts direkt im Google Doc anpassen, solange er die Platzhalter erhält.
- Das Apps Script kopiert die Vorlage, ersetzt die Platzhalter und erzeugt die variablen Tabellenzeilen.
- Danach exportiert es die Kopie per `UrlFetchApp` als DOCX (Drive-Export mit `ScriptApp.getOAuthToken()`), speichert sie in `Rechnungen/` und löscht die temporäre Kopie.
- Das Frontend erhält die DOCX base64-kodiert zum Download. Sie bleibt in Word bearbeitbar.
- Dateiname: `Rechnung <Nummer> <Projektname>.docx`.

**Mindestinhalt**

| Bereich              | Inhalt |
|----------------------|--------|
| Kopf                 | Firmenname, Anschrift, UID, Kontakt (fester Text in der Vorlage, vom Chef gepflegt) |
| Empfänger            | Auftraggeber; Platz für die Kundenanschrift und die Kunden-UID, die der Chef in Word ergänzt |
| Rechnungsdaten       | Rechnungsnummer, Rechnungsdatum, Leistungszeitraum, Kennzeichnung als (Zwischen-)Rechnung |
| Projekt              | Projekt / Bauvorhaben, Baustellenadresse, Bauleiter |
| Arbeitsleistung      | eine Position pro Mitarbeiter: Stunden × Stundensatz = Betrag |
| Zusatzpositionen     | Menge, Einheit, Einzelpreis, Betrag; der Abschnitt entfällt, wenn leer |
| Material             | Materialbasis und Aufschlag (% und €) |
| Summen               | Summe Arbeit, Summe Material, Gesamt netto, USt 0 %, Gesamtbetrag |
| Steuerhinweis        | Reverse-Charge-Text aus den Einstellungen |
| Zahlungsinformation  | Bankverbindung und Zahlungsziel (fester Text in der Vorlage) |
| Anhang Stundennachweis | jeder Eintrag: Datum, Mitarbeiter, Von–Bis, Stunden, Kurzbeschreibung |
| Anhang Materialnachweis | jeder Kauf: Datum, Artikel, gekauft von, Beleg-Nr., Betrag |

Zahlen werden im Format de-AT ausgegeben (`1.234,50 €`, Datum `14.11.2026`). Die Platzhalter und die Mechanik für variable Tabellenzeilen werden bei der Implementierung im Code dokumentiert.

### 5.7 Projektabschluss

- Der Chef schließt ein Projekt ab. Gibt es noch offene Stunden oder Materialkäufe, kommt eine Warnung mit Anzahl und Summe, aber kein Verbot.
- Abgeschlossene Projekte sind für Mitarbeiter ausgeblendet und gesperrt (auch für Fotos und Bedarf).
- Der Chef kann jederzeit wieder öffnen.

## 6. Oberfläche

### Mitarbeiter (mobile-first)

- **Start**: Liste der aktiven Projekte. Schnellaktionen „Stunden erfassen“ (merkt das zuletzt gewählte Projekt), „Material gekauft“, „Material fehlt“, „Foto“.
- **Projekt**: Kopfdaten (Projekt, Auftraggeber, Adresse mit Kartenlink, Bauleiter) und Tabs:
  - Meine Stunden
  - Meine Käufe
  - Materialbedarf (alle)
  - Fotos (alle)
- **Meine Erstattungen**: offene und erstattete Käufe über alle Projekte.

### Chef (zusätzlich)

- **Dashboard**, live aus den Projekt-Sheets berechnet:
  - pro Projekt Stunden und Material jeweils gesamt / offen / verrechnet / bezahlt
  - pro Projekt die Aufteilung der Stunden je MA
  - offene Materialbedarfe über alle Projekte (dringende zuerst)
  - offene Erstattungen je MA
- **Projekte**: anlegen, bearbeiten, abschließen, wieder öffnen. Abschnitt „Abrechnung“ mit dem Assistenten aus 5.5 und der Rechnungsliste (Download, bezahlt markieren, löschen). Alle Stunden und Käufe sind einsehbar und bearbeitbar.
- **Mitarbeiter**: anlegen, bearbeiten, deaktivieren (kein Löschen, wegen Referenzen).
- **Leistungskatalog**, **Einstellungen** (Chef-E-Mail, Standard-Aufschlag, Reverse-Charge-Text).

## 7. API (Apps-Script-Aktionen)

Alle Aktionen prüfen Token und Rechte (Kapitel 2). Wo eine Aktion „Projekt aktiv“ verlangt, gilt das nur für Mitarbeiter.

| Bereich        | Aktionen |
|----------------|----------|
| Sitzung        | `me` (Rolle, MA-Daten, Einstellungen soweit nötig) |
| Projekte       | `listProjects`, `getProject`, `saveProject`*, `closeProject`*, `reopenProject`* |
| Zeiten         | `listTimeEntries`, `saveTimeEntry`, `deleteTimeEntry` |
| Material       | `listPurchases`, `savePurchase`, `deletePurchase`, `setReimbursed`*, `listMyReimbursements` |
| Bedarf         | `listDemands`, `saveDemand`, `setDemandStatus` |
| Fotos          | `listPhotos` (mit Thumbnails), `getPhoto`, `uploadPhoto`, `updatePhoto`, `deletePhoto` |
| Belege         | `uploadReceipt`, `getReceipt` |
| Abrechnung     | `previewInvoice`*, `createInvoice`*, `listInvoices`*, `downloadInvoice`*, `setInvoicePaid`*, `deleteInvoice`* |
| Stammdaten     | `listEmployees`*, `saveEmployee`*, `listCatalog`*, `saveCatalogItem`*, `getSettings`*, `saveSettings`* |
| Dashboard      | `getDashboard`* |

`*` = nur Chef. Bilder werden base64-kodiert im JSON übertragen. Durch die clientseitige Kompression liegt ein Bild bei ca. 1 MB, weit unter dem Payload-Limit.

## 8. Technische Randbedingungen

- Apps-Script-Kontingente für Consumer-Accounts: 6 min pro Ausführung, ca. 30 gleichzeitige Ausführungen, 20.000 UrlFetch und 100 Mails pro Tag. Für einen Kleinbetrieb reicht das.
- Typische Antwortzeit des Apps Scripts: 1–3 s. Das Frontend zeigt Ladezustände und deaktiviert Buttons während des Sendens (kein Doppel-Submit). Jeder Speichervorgang trägt eine clientseitig erzeugte UUID, damit wiederholte Requests idempotent sind.
- Die Projektliste und die Stammdaten werden im Frontend zwischengespeichert (stale-while-revalidate).
- Das Backend protokolliert Fehler mit `console.error` (Apps-Script-Ausführungsprotokoll).

## 9. Repo-Struktur

```
/frontend          React + Vite + TS (PWA)
/backend           Apps Script (clasp), TypeScript oder JS
/muster            Beispieldateien
/.github/workflows deploy-pages.yml
SPEC.md, requirements.md
```

## 10. Einmalige Einrichtung (manuell)

1. Google Cloud Console: OAuth-Client-ID (Webanwendung) mit den JavaScript-Ursprüngen der GitHub-Pages-URL und `http://localhost:5173` anlegen.
2. `clasp login` mit dem Owner-Account, Projekt anlegen, Backend pushen, `setup()` im Editor ausführen und die Berechtigungen bestätigen.
3. Im erzeugten Google Doc `Rechnungsvorlage` die Firmendaten, die Bankverbindung und das Zahlungsziel eintragen.
4. Die Web App deployen (Ausführen als: Ich, Zugriff: Jeder) und die `/exec`-URL notieren.
5. GitHub: Repo öffentlich, Pages auf „GitHub Actions“, Variables `VITE_API_URL` und `VITE_GOOGLE_CLIENT_ID` setzen.
6. In der App als Chef anmelden, Mitarbeiter mit ihrer Google-E-Mail und ihrem Stundensatz anlegen, den Leistungskatalog prüfen.

## 11. Entscheidungsprotokoll (Interview)

| Thema               | Entscheidung |
|---------------------|--------------|
| Hosting             | GitHub Pages (öffentliches Repo) |
| Login               | Google ID-Token, vom Apps Script geprüft, Whitelist Mitarbeiterliste |
| Ablage              | Stammdaten-Sheet + ein Sheet und Ordner pro Projekt |
| Offline             | PWA, Speichern nur online, Entwürfe bleiben lokal erhalten |
| Stundensatz         | pro Mitarbeiter, beim Verrechnen eingefroren |
| Umsatzsteuer        | immer Reverse Charge (0 %) |
| Rechnung            | Word-Datei (DOCX) via Apps Script aus einer Google-Doc-Vorlage, die bei der Implementierung neu gestaltet wird (Muster-DOCX nur Demo) |
| Altdaten            | kein Import |
| Rechnungsumfang     | offene Posten bis Stichtag, einzeln abwählbar |
| Zusatzpositionen    | Leistungskatalog + freie Positionen; Aufschlag global 20 %, pro Projekt überschreibbar |
| Pause               | keine; Von–Bis voll, auf 0,25 h gerundet |
| MA-Rechte           | eigene Einträge bearbeiten, solange offen; Fotos und Bedarf für alle sichtbar |
| Materialbedarf      | Status offen/bestellt/erledigt + E-Mail an Chef |
| Materialbetrag      | Kassenbetrag brutto; Basis für Aufschlag ist brutto |
| Korrektur Rechnung  | Rechnung löschen und neu erstellen; Nummern müssen nicht lückenlos sein |
| Bezahlt             | pro Rechnung, überträgt sich auf ihre Posten |
| Projektabschluss    | Chef kann wieder öffnen; Warnung bei offenen Posten |
| Fotos               | nur annotierte Version gespeichert; Beschreibung + „Vorschaden“ |
| Projektsichtbarkeit | alle MA sehen alle aktiven Projekte |
| Chef                | genau einer, E-Mail in den Einstellungen; Daten-Account = Script-Owner |
| Chef als MA         | ja, eigene Stunden + Nachtragen für andere |
| Projektfelder       | nur die vier aus der Anforderung (+ Aufschlag-Override, Status) |
| Rechnungsnummer     | Vorschlag `JJJJ-NNN`, editierbar |
| Stunden auf Rechnung| eine Position pro MA + Stundennachweis |
| Dashboard           | in der App, live berechnet |
| Auslagenersatz      | Erstattungsstatus pro Kauf, vom Chef gesetzt |
| Sheets              | lesbar, Änderungen nur über die App |
