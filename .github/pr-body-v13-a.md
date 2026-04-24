## v1.3 PR A — Stundensatz + Quick-Filter (warm-up)

Kicks off **v1.3**. Small, low-risk surface so we can land the schema/UI scaffolding before PR B (Cross-Midnight + JSON-Export) and PR C (the actual PDF pipeline).

### Was hier drin ist

- **Stundensatz pro Kunde (#20)** — Optionales €/h-Feld in der Kunden-Maske. Reuse der bereits in v1.2-Migration 003 angelegten `clients.rate_cent` Spalte (Integer-Cents); `0` = "kein Satz hinterlegt", PDF wird die €-Spalte dann weglassen. Eingabe als deutsche Dezimalzahl, IPC validiert auf `>= 0`.
- **Quick-Filter im Kalender (#21)** — Vier Pillen ("Diese Woche", "Letzte Woche", "Diesen Monat", "Letzter Monat") + farbiger Hero-Button "📄 Letzter Monat als PDF" über dem Kalender. Klick loggt aktuell nur den Range; das echte PDF-Modal landet in **PR C**.
- **Migration 004** — Seedet 6 Settings-Keys für die PDF-Pipeline (`pdf_logo_path`, `pdf_sender_address`, `pdf_tax_id`, `pdf_accent_color` Default `#4f46e5`, `pdf_footer_text`, `pdf_round_minutes` Default `0`). Idempotent via `INSERT OR IGNORE`, überschreibt also keine vom User gesetzten Werte beim Replay.

### Was **nicht** drin ist (kommt später)

- ❌ PDF-Export-Modal + Pipeline → **PR C**
- ❌ Cross-Midnight-Auto-Split + JSON-Export → **PR B**
- ❌ User-facing Rounding-UI → bewusst gedroppt; stattdessen Settings-level `pdf_round_minutes` (PR C exposed das in den Settings)
- ❌ Anzeige des Stundensatzes in der Kundenliste → nice-to-have, scopelos für PR A

### Tests

- 9 neue Tests in `src/shared/dateRanges.test.ts` (Mon-Anker, Sonntag-Edge, Jahreswechsel-`lastMonth`, Februar non-leap, **DST spring-forward 2026-03-29**)
- 11 neue Tests in `src/shared/rate.test.ts` (German Dezimal, Tausender-Punkte, negative/invalid, dokumentierter Strict-German-Parser)
- 2 neue Migrations-Tests (Seed + Override-Überleben)
- `pnpm typecheck` ✅, `pnpm test` ✅ alle 51 passing, `pnpm lint` 21 errors (Baseline unverändert)

### Bezugsissues

- Closes Vorbereitung für #20 (Stundensatz-Feld; PDF-Verwendung kommt in PR C)
- Closes #21 (Quick-Filter-Buttons sichtbar + funktional; Modal-Wire-up PR C)
- Migration 004 ist Vorbereitung für #19 (PDF-Template-Settings)

### Decision Log (carried from v1.3 plan)

- **rate_cent reuse statt neue `hourly_rate REAL`-Spalte:** Issue #20 schlug `REAL DEFAULT NULL` vor, aber v1.2 hat bereits `INTEGER DEFAULT 0` ausgeliefert. Float-freie Cent-Arithmetik ist sowieso die richtige Wahl für Honorar-Rechnerei → wir nutzen die bestehende Spalte.
- **`0` als "kein Satz" Sentinel statt `NULL`:** Spart eine zweite Migration; im PDF-Renderer wird `rate_cent === 0` als "Spalte ausblenden" interpretiert.
- **Quick-Filter-Klick als Stub:** PR A landet bewusst ohne PDF-Modal, damit die UI früh sichtbar ist und in PR B/C nur noch die Logik andocken muss.
