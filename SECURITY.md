# Security Policy

## Supported Versions

Only the latest minor release receives security fixes.

| Version | Supported |
| ------- | --------- |
| 1.x (latest) | :white_check_mark: |
| < 1.x | :x: |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

### Option 1 — GitHub Private Security Advisory (bevorzugt)

1. Gehe zu https://github.com/skoedr/time-tracking/security/advisories/new
2. Beschreibe die Schwachstelle mit reproduzierbaren Schritten.
3. Du erhältst innerhalb von **5 Werktagen** eine erste Rückmeldung.

### Option 2 — E-Mail

Schreibe an **robin.wald@hotmail.de** mit dem Betreff `[SECURITY] TimeTrack`.
Bitte verschlüssle sensible Details wenn möglich.

## Was passiert danach?

1. Bestätigung des Eingangs (≤ 5 Werktage)
2. Bewertung und Einschätzung der Schwere
3. Fix entwickeln und testen
4. Coordinated Disclosure: Patch-Release + CVE/Advisory veröffentlichen
5. Credit im CHANGELOG (sofern gewünscht)

## Scope

TimeTrack ist eine Desktop-App ohne eigenen Server-Backend. Relevante
Angriffsflächen sind:

- **SQLite-Datenbank** in `%AppData%\TimeTrack\timetrack.db` (lokaler Zugriff)
- **Auto-Update** via `api.github.com` (GitHub Releases, signierte Artefakte)
- **PDF-Generierung** und -Verarbeitung
- **Electron IPC** zwischen Renderer und Main-Prozess
