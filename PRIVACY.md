# Datenschutz / Privacy

TimeTrack speichert alle Daten **ausschließlich lokal** auf deinem Gerät.
Es gibt keine Cloud-Synchronisation, keine Konten und keinen eigenen Server.

## Wo liegen die Daten?

| Typ | Pfad (Windows) | Pfad (macOS) |
| --- | -------------- | ------------ |
| Datenbank | `%AppData%\TimeTrack\timetrack.db` | `~/Library/Application Support/TimeTrack/timetrack.db` |
| Einstellungen | `%AppData%\TimeTrack\timetrack.db` | (selbe DB) |
| Log-Dateien | `%AppData%\TimeTrack\logs\` | `~/Library/Logs/TimeTrack/` |
| PDF-Exporte | Frei wählbarer Speicherort | Frei wählbarer Speicherort |

Du kannst die Datenbank jederzeit sichern oder löschen. Ein Backup-Export
ist über *Einstellungen → Backup* möglich.

## Netzwerk-Kommunikation

TimeTrack stellt genau **einen** ausgehenden HTTPS-Request her:

```
GET https://api.github.com/repos/skoedr/time-tracking/releases/latest
```

Dieser Aufruf prüft beim App-Start, ob eine neue Version verfügbar ist
(Auto-Updater via `electron-updater`). Er enthält keine Nutzer-Kennungen,
keine Gerätedaten und keine Zeiteinträge. Er kann durch Deaktivierung des
Auto-Updaters in den Einstellungen unterbunden werden.

## Kein Tracking

- Kein Telemetrie-Dienst (z. B. Sentry, Mixpanel, Amplitude)
- Kein Analytics (z. B. Google Analytics, Plausible)
- Kein Crash-Reporter zu Drittanbietern
- Keine Werbung, keine Monetarisierung über Nutzerdaten

## Drittanbieter-Abhängigkeiten

Alle eingesetzten Open-Source-Bibliotheken und ihre Lizenzen sind in
`resources/licenses.json` aufgeführt (erreichbar über *Hilfe → Lizenzen*).
Keine dieser Bibliotheken stellt selbst Netzwerkverbindungen her.

## Kontakt

Fragen zum Datenschutz: robin.wald@hotmail.de
