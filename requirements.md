# Zeitplanung für Baustellen

Für einen kleinen Elektrobetrieb sollen Tätigkeiten auf verschiedenen Baustellen (Projekte) dokumentiert werden können. Das Ziel der App ist es, die Abrechnungen für die Baustellen effizient erledigen und dem Kunden Rechnungen stellen zu können.

## Mitarbeiter

Der Betrieb hat mehrere Mitarbeiter.
Es gibt einen Chef.
Alle Mitarbeiter haben einen Google Account.
Das Login erfolgt über den Google Account.
Der Account des Chefs soll in der App konfigurierbar sein.

## Technologische Basis

Die App soll mit React und Vite implementiert werden.
Das Deployment läuft über Google Pages.
Die Speicherung erfolgt über Google Drive (siehe Backend).

Auf diesem Rehner steht ein authentifiziertes `gcloud` Tool zur Verfügung.
Arbeite nur mit Kostenlosen Ressourcen, die im Rahmen des Google Ultra Abos zur Verfügung gestellt werden.

## Projekte

Die Projekte werden mit folgenden Merkmalen angelegt:

| Merkmal                | Beispielwert                       |
|------------------------|------------------------------------|
| Projekt / Bauvorhaben: | Neubau Wohn- & Gewerbepark Westend |
| Auftraggeber / Kunde:  | Immobilien Holding GmbH & Co KG    |
| Baustellenadresse:     | Gewerbestraße 14, 1030 Wien        |
| Bauleiter:             | Ing. Markus Leitner                |

## Materialzukäufe

Für die Projekte wird Material von einem der Mitarbeiter zugekauft.
Die Mitarbeiter können den Betrag eingeben oder die Rechnung einscannen.
In `muster/qr_code_rechnung.jpg` ist ein Muster eines QR Codes einer österreichischen Rechnung.
Es ist Mehrwertssteuer und Betrag codiert.

## Materialbedarf

Wenn auf der Baustelle festgestellt wird, dass Material fehlt, soll dies über die App gemeldet werden können.


## Zeiterfassung der Baustellentätigkeiten

Während des Projektes werden die Tätigkeiten auf der Baustelle am Smartphone erfasst.
Dies wird am Ende des Arbeitstages gemacht:

| Merkmal          | Beispielwert                |
|------------------|-----------------------------|
| Datum            | 14.11.2026                  |
| Von              | 08:30                       |
| Bis              | 16:20                       |
| Kurzbeschreibung | Kabel für Küche eingezogen. |

## Fotos zur Baustellendokumentation

Die Mitarbeiter sollen auch Fotos der Baustellen zwecks Dokumentation machen können.
Damit weiß jeder über den aktuellen Zustand bescheit.
In das Foto sollen auch Annotations eingezeichnet werden können (Kreise, Freihand, etc.).

Bei schon vorhandenen Schäden können diese dokumentiert werden.

## Abrechnung

Für den Kunden soll eine Rechnung erstellt werden.
Die einzelnen Mitarbeiter haben konfigurierbare Stundensätze.
Für die Projekte werden die offenen Stunden und offenen Materialkäufe in Rechnung gestellt.

Dabei haben die Stunden und die Materialzukäufe mehrere Zustände:
"offen" (noch keine Rechnung erstellt), "verrechnet" und "bezahlt".

Es werden während eines Projektes Zwischenrechnungen erstellt.

## Projektabschluss

Am Ende wird das Projekt abgeschlossen.
Danach sind keine Eingaben der Mitarbeiter mehr möglich.

## Backend

Ein Google Apps Script arbeitet unter den Rechten des Chefs und legt auf dessen Google Drive die App Daten ab. Damit einigermaßen concurrency möglich ist, sollen die Daten als Sheets abgelegt werden.

Die Bilder werden als JPEG abgelegt.

Ein Ordner pro Projekt wäre als Struktur sinnvoll.

Der Account soll konfiguriert werden können.

## Rechtemanagement

Die Mitarbeiter sollen Stunden eintragen, Fotos hochladen, Materialbedarf eingeben und Materialkäufe eingeben können.

Der Rest der Applikation ist nur für den Chef möglich.


Erstelle mit dem /grill-me zuerst ein interaktives Interview.
Stelle die Fragen interaktiv, damit ich sie direkt in der Claude App beantwirten kann.
Schreibe danach eine Spezifikation in die Datei `SPEC.md`.