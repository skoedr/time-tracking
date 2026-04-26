# v1.6 → v2.0 — Office Hours Plan (Approach B)

> **Office Hours session: 2026-04-26**
> **Mode:** Builder → upgraded to early-stage product (OSS release path)
> **Outcome:** ROADMAP.md updated, MIT license formalized, git history purged

---

## Frame

v1.5.2 marks the end of Phase 1: the Nordstern from the original ROADMAP
(„ein Tool dem du beim Rechnungsschreiben vollständig vertraust") is reached.
Solo-tool is functionally complete. Question on the table: what does v2 look
like, and what's the path through v1.9?

User's seed idea was Outlook integration. The session pushed back: Outlook is
the largest single-feature bet (MS Graph, OAuth, token refresh, recurring
events) and deserves a dedicated v2.0 — not a v1.6 rush.

## Goal (clarified mid-session)

User picked **„OSS release for the freelancer community"** (option C in the
goal-question). The internal license is already MIT in the About dialog, but
the README said „Private". That mismatch made „OSS release" a one-way-door
prerequisite, not a feature.

## Confirmed premises

| # | Premise | Status |
|---|---|---|
| P1 | License hygiene is pre-roadmap, not part of v1.6 | ✅ accepted, executed 2026-04-26 |
| P2 | User stays solo maintainer, no SLA, support best-effort via GH Issues | ✅ accepted |
| P3 | No fundamental rewrite UNLESS explicit upside (modified from original „no rewrite" to allow surprise wins) | ✅ accepted with modification |
| P4 | „Open source ready" ≠ „marketing ready". Two phases. v1.6 = repo hygiene, no HN/Reddit push yet. | ✅ accepted, voluntary adoption preferred |
| P5 | Outlook integration is v2.0, not v1.6 | ✅ accepted |
| ~~P6~~ | ~~Time → Invoice as next hero feature~~ | ❌ **rejected** by user. „Maintainer uses Lexware in parallel, only attaches Stundennachweis to invoice. Don't bloat with bookkeeping." → **PDF-Merge** proposed as replacement, accepted. |

## Decision: Approach B chosen

Three approaches presented:

- **A — Distribution First, then Outlook.** Conservative. v1.6 OSS-readiness, v1.7 polish (Pomodoro, etc.), v1.8 reporting, v1.9 Outlook prep, v2.0 Outlook. ~20 weeks. No standout hero feature pre-v2.0.
- **B — Distribution + PDF-Merge as Hero, Outlook later.** v1.6 OSS-readiness, v1.7 PDF-Merge (2 weeks, pdf-lib, ~150 KB dep), v1.8 polish, v1.9 reporting + prep, v2.0 Outlook. ~17 weeks. Hero story available after v1.7.
- **C — Outlook as v1.7, everything else after.** Bold. Risk-concentrated in 10–12 weeks of Outlook work without OSS feedback. Violates P5.

**Chosen: B.** Reasons:
1. PDF-Merge is the only one-sentence OSS pitch that hits every DE freelancer with Lexware/sevDesk/Billomat — and matches maintainer's actual daily workflow (currently manual Smallpdf/Acrobat).
2. Outlook UX in v2.0 will be better with prior OSS feedback (mapping rules, conflict resolution).
3. PDF-Merge is small (S–M, 2 weeks, no schema change).
4. Dogfood guaranteed (maintainer's own pain).

Approach C explicitly considered and rejected — user wasn't waiting for Outlook to use the tool, so „Outlook first" isn't justified by user behavior.

---

## Pre-Roadmap-Block — DONE 2026-04-26

Executed in this session before any v1.6 PR is opened:

| Step | What | Commit |
|------|------|--------|
| 1 | `LICENSE` file + `"license": "MIT"` in package.json + repository/bugs fields + README License section rewritten | `d6f23fc` |
| 2 | Backup mirror created at `..\time-tracking-backup-20260426-095117.git` | n/a |
| 3 | `git filter-repo --invert-paths` removed three PII files (`templates/Rechnung_RE26001.pdf`, `templates/wald-it-logo.png`, `templates/Stundennachweis-Lingua Masters GmbH-2026-04.pdf`) from every commit | history rewrite |
| 4 | Force-push of cleaned main + tags v1.1.0–v1.5.2 | force-push |
| 5 | 13 obsolete stage branches deleted from origin (all squash-merged into main, all contained the original `5c78d91` commit with PII blobs) | branch deletes |
| 6 | Local `git gc --prune=now --aggressive` + `git reflog expire` | local gc |

**Residual risk:** Original commit `5c78d91` is still reachable on GitHub via direct SHA URL until GH's internal GC runs (typically days). Not reachable via clone/fetch (no ref points to it). Web branch history doesn't show it. For maximum protection, file a GitHub Support request to expedite cached-view purge — deferred unless threat model changes.

---

## Branch-Strategie für v1.6

Drei PRs in dieser Reihenfolge — kleiner Scope, keine Abhängigkeiten zwischen ihnen, alle parallel mergebar:

| PR | Branch | Inhalt | Größe | Risiko |
|----|--------|--------|-------|--------|
| A | `feat/v1.6-contributing-docs` | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `PRIVACY.md`, Issue-Templates unter `.github/ISSUE_TEMPLATE/` | S | sehr niedrig |
| B | `feat/v1.6-readme-en` | `README.en.md` (englischer Counterpart, „what + why + install + quickstart"), Cross-Link im DE-README | S | niedrig |
| C | `feat/v1.6-macos-build` | `release.yml` zweiter Job für macOS (`pnpm build:mac` → `.dmg`), Smoke-Test analog Windows | M | mittel (CI auf macOS-runner ist neu) |

**Manuelle Out-of-Band-Schritte (kein PR, GitHub-Settings UI):**
- GitHub Discussions aktivieren (Categories: Q&A, Ideas, Show & Tell, General).
- Repo-Description auf GitHub setzen + Tags (`electron`, `time-tracking`, `freelance`, `windows`, `german`).
- Optional: README-Badges (Build-Status, Latest-Release, License) in PR A oder B.

**Ship-Kriterium v1.6:** Ein fremder Freelancer findet das Repo, versteht in 60 s ob es taugt, lädt den Installer von Releases, startet die App. Bei Fragen kann er ein Issue eröffnen oder in Discussions schreiben.

---

## v1.7 PDF-Merge — Architektur-Skizze

Nicht in dieser Session ausgearbeitet, kommt vor v1.7-PR-Start. Stichpunkte für später:

- `pdf-lib` als prod-dep (`pnpm add pdf-lib`). Erwartete Bundle-Vergrößerung: ~150 KB gzipped.
- Neue Funktion in [src/main/pdf.ts](../src/main/pdf.ts): `mergePdfs(originalPath, generatedBuffer, mergeOrder): Promise<Buffer>`. Returnt den gemergten PDF-Buffer.
- IPC-Handler in [src/main/ipc.ts](../src/main/ipc.ts): `pdf:exportWithMerge` analog zu existing `pdf:export`, aber mit zusätzlichem `mergeWith?: string` Parameter.
- UI in [src/renderer/src/components/PdfExportModal.tsx](../src/renderer/src/components/PdfExportModal.tsx): Checkbox „An bestehende Rechnung-PDF anhängen" + File-Picker (`window.api.openFileDialog({ filters: [{ name: 'PDF', extensions: ['pdf'] }] })`).
- Settings-Persistenz: `pdf_merge_default_dir` (Default-Ordner für Picker), `pdf_merge_order` (`'append' | 'prepend'`, default `'append'`). Migration 009 seedet beide leer/append.
- Output-Pfad: `<originalDir>/<originalFilename>_inkl_Stundennachweis.pdf`. Original bleibt unangetastet (read-only).
- Tests: Vitest + ein Fixture-PDF im Test-Ordner. Pflicht-Test: Original mit 2 Seiten + Stundennachweis mit 3 Seiten → Output hat 5 Seiten in korrekter Reihenfolge.
- Edge-Cases:
  - Original-PDF ist verschlüsselt → Toast „PDF ist passwortgeschützt, kann nicht gemerged werden" + Original wird normal exportiert.
  - Original-PDF ist beschädigt → pdf-lib wirft Exception → Toast „Datei ist keine gültige PDF".
  - Original-Pfad existiert nicht mehr (z.B. von vorheriger Settings-Wiederherstellung) → Picker neu öffnen.
  - Disk full beim Schreiben → existing Toast-Pattern aus pdf-Export reuse.

---

## Anti-Goals (explizit für v1.6–v2.0 ausgeschlossen)

Damit später kein Scope-Creep kommt:

- ❌ Cloud-Sync, Multi-Device — bleibt aus der ROADMAP
- ❌ Multi-User / Team — bleibt
- ❌ Mobile App — bleibt
- ❌ Stripe / Bezahlung — bleibt
- ❌ Rechnungsstellung / Buchhaltung — explizit user-rejected (Lexware-Parallelnutzung)
- ❌ Plugin-Architektur — Komplexitätssprung der Solo-Maintenance bricht
- ❌ Telemetry/Analytics — siehe PRIVACY.md (kommt in v1.6)
- ❌ Code-Signing — bleibt aus ROADMAP-Direktive (außer Sponsoring kommt rein)

---

## Open Questions (für nächste Session oder als Issues)

- **Fresh-Install-Test:** User wollte vor v1.8 einen kompletten „neue Maschine, lade nur die exe"-Test machen. Daten-Backup zuerst. Findings landen in v1.8-Polish-Liste.
- **macOS-Build-Strategie:** GitHub Actions macOS-Runner-Minuten sind 10x teurer als Linux/Windows. Bei Public-Repo ist das gratis, aktuell ist Repo public — also kein Kostenproblem. Falls Repo je private wird, evaluieren.
- **EN-Translation der CHANGELOG:** v1.6-Backlog oder v1.7? Aktuell Deutsch. Für OSS-Release suboptimal, aber kein Blocker.
- **Outlook-Auth-Flow Detail:** Device Code Flow vs Authorization Code Flow with PKCE. Device Code ist user-friendlier (kein Browser-Redirect-Server nötig), aber langsamer. Entscheidung in v1.9-Vorbereitung, nicht jetzt.

---

## Decision Audit Trail (diese Session)

| # | Entscheidung | Klassifikation | Begründung |
|---|---|---|---|
| 1 | Goal: OSS-Release für Freelancer-Community | User Direktive | Antwort auf Phase-1-Frage |
| 2 | LICENSE-Hygiene VOR jedem v1.6-PR | Mechanical (P1) | One-way-door, ohne LICENSE keine MIT-Wirkung |
| 3 | Git-history-rewrite ausgeführt (statt verschoben) | User Approval | „darfst gerne A) ausführen" |
| 4 | Backup-Mirror vor filter-repo | Mechanical | Best-Practice für destruktive History-Operations |
| 5 | 13 Stage-Branches gelöscht | Mechanical | Inhaltlich in main via Squash, enthielten PII via 5c78d91 |
| 6 | P3 modifiziert: „kein Rewrite" → „kein Rewrite ohne expliziten Vorteil" | User Direktive | „nur wenn sich explizit Vorteile ergeben" |
| 7 | P6 (Time→Invoice) gekippt, ersetzt durch PDF-Merge | User Direktive | Lexware-Parallelnutzung, kein Bookkeeping-Bloat gewünscht |
| 8 | Approach B (PDF-Merge als Hero) | User Choice | Aus 3 Alternativen gewählt |
| 9 | Outlook bleibt v2.0 | Mechanical (P5) | XL-Feature verdient eigenes Major-Release |
| 10 | macOS-Build OHNE Apple-Notarization | User Taste | Konsistent mit Windows-SmartScreen-Direktive |
| 11 | GH-Support-Request für GC-Expedite skipped | User Risk-Tolerance | Threat-Model erlaubt es |
