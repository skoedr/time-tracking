# Contributing to TimeTrack

Danke, dass du zu TimeTrack beitragen möchtest! Dieses Dokument beschreibt den
Workflow für Issues, Pull Requests und lokale Entwicklung.

> Sprachen: Issues, PRs und Commit-Messages dürfen auf **Deutsch oder Englisch**
> sein. Code-Kommentare und Variablennamen bitte **Englisch** halten.

## Code of Conduct

Mit deiner Mitwirkung akzeptierst du den [Code of Conduct](./CODE_OF_CONDUCT.md).
Verstöße bitte an `robin.wald@hotmail.de` melden.

## Bug melden / Feature vorschlagen

- **Bug:** Nutze das [Bug-Report-Template](./.github/ISSUE_TEMPLATE/bug_report.yml).
  Bitte Version, OS und reproduzierbare Schritte angeben.
- **Feature:** Nutze das [Feature-Request-Template](./.github/ISSUE_TEMPLATE/feature_request.yml).
  Beschreibe das Problem zuerst, dann den Lösungsvorschlag.
- **Frage / Diskussion:** Bitte über
  [GitHub Discussions](https://github.com/skoedr/time-tracking/discussions)
  statt Issue.
- **Sicherheitslücke:** **Kein** öffentliches Issue. Siehe [SECURITY.md](./SECURITY.md).

## Lokale Entwicklung

Voraussetzungen: **Node.js 20+**, **pnpm 10+**, Windows oder macOS.

```powershell
pnpm install        # Dependencies + native Module bauen
pnpm dev            # Electron + Vite Dev-Server starten
pnpm test           # Vitest unit tests
pnpm typecheck      # tsc --noEmit für alle tsconfig*-Projekte
pnpm lint           # ESLint
pnpm build          # Production-Build (electron-builder, ohne Publish)
```

App-Daten landen lokal in `%AppData%\TimeTrack\` (Windows) bzw.
`~/Library/Application Support/TimeTrack/` (macOS). Diese kannst du beim
Entwickeln gefahrlos sichern oder löschen.

## Pull-Request-Workflow

1. **Issue zuerst** – außer für sehr kleine Fixes (Typo, ein-Zeilen-Bug).
   Bei größeren Features bitte im Issue Konsens herstellen, bevor du Code
   schreibst, damit der PR nicht abgelehnt werden muss.
2. **Branch-Konvention:** `feat/v{X.Y}-{kurzname}`, `fix/v{X.Y}-{kurzname}`
   oder `docs/v{X.Y}-{kurzname}`. Beispiel: `feat/v1.7-pdf-merge`.
3. **Kleine PRs.** Ein PR = ein Thema. Refactor und Feature trennen.
4. **Tests.** Neue Logik in `src/main/` oder `src/shared/` braucht einen
   Vitest-Test. Renderer-only-Änderungen (Layout, Styling) sind ohne Test okay.
5. **Lokale Checks vor Push:** `pnpm typecheck && pnpm lint && pnpm test`.
6. **Conventional Commits** (siehe unten).
7. **PR-Beschreibung:** Was, Warum, Wie getestet, Screenshots/GIFs bei UI.

### Conventional Commits

```
<type>(<scope>): <kurze Zusammenfassung>

[optionaler Body]
```

Erlaubte Types:

| Type       | Wofür                                                    |
| ---------- | -------------------------------------------------------- |
| `feat`     | Neues nutzersichtbares Feature                           |
| `fix`      | Bugfix                                                   |
| `docs`     | Doku, README, Plan-Files                                 |
| `chore`    | Build, Dependencies, Tooling                             |
| `refactor` | Code-Umbau ohne Verhaltensänderung                       |
| `test`     | Tests hinzufügen oder verbessern                         |
| `security` | Security-relevante Änderung                              |

Scope ist optional, aber willkommen (`csv`, `pdf`, `i18n`, `db`, `ipc`, …).

Beispiele:

- `feat(pdf): merge external timesheet pages into export (#42)`
- `fix(timer): stop drift after suspend/resume`
- `chore(deps): bump electron 39.0.1 -> 39.0.4`

## Stil & Architektur

- **TypeScript strict.** Keine `any` ohne Begründung.
- **Pure-Funktionen** in `src/shared/` – keine Electron- oder DOM-Imports dort.
- **DB-Migrationen** sind unveränderlich. Neue Schemaänderung = neue
  Migrationsdatei in `src/main/migrations/` + DB-Version hochzählen.
- **i18n — Pflicht ab v1.8:** Jeder nutzersichtbare String **muss** über `useT()` /
  `t(key)` laufen und einen Eintrag in **beiden** Locale-Dateien haben:
  `src/shared/locales/de.ts` (Source of Truth) und `src/shared/locales/en.ts`.
  Hardcodierte deutsche oder englische Strings im JSX/TSX sind ein Review-Blocker.
  Prüfen mit: `pnpm exec node scripts/find-untranslated.mjs`
- **Keine Telemetrie.** Siehe [PRIVACY.md](./PRIVACY.md).

## i18n-Workflow

Ab v1.8 sind alle nutzersichtbaren Strings zweisprachig (DE/EN). Dieses Muster ist
**Pflicht** für jede neue UI-Änderung:

```typescript
// In Components / Views — Hook holen:
import { useT } from '../contexts/I18nContext'
const t = useT()

// Verwendung:
t('some.key')                          // einfacher String
t('some.key', { variable: value })    // Interpolation: Key enthält {variable}

// Wenn t an eine Hilfsfunktion weitergegeben wird:
import type { TFunction } from '../contexts/I18nContext'
function helper(t: TFunction) { ... }
```

Neue Keys immer in **beiden** Dateien gleichzeitig ergänzen:

```typescript
// src/shared/locales/de.ts  ← Source of Truth
export const de = {
  myFeature: {
    title: 'Mein Feature',
    description: 'Beschreibung mit {name}',
  },
}

// src/shared/locales/en.ts  ← muss alle Keys aus de.ts spiegeln (TypeScript erzwingt es)
export const en: typeof de = {
  myFeature: {
    title: 'My Feature',
    description: 'Description with {name}',
  },
}
```

Keys sind dot-namespaced und werden nach Feature-Bereich gruppiert
(`nav.*`, `settings.*`, `entry.*` usw.). `pnpm exec node scripts/find-untranslated.mjs`
findet vergessene Stellen.

## Release-Prozess (nur Maintainer)

1. Stage-PRs gegen `main` mergen (squash).
2. Version in `package.json` bumpen, `CHANGELOG.md` ergänzen.
3. Tag `v{X.Y.Z}` setzen, pushen → GitHub-Actions baut Release-Artefakte.
4. Release-Notes auf GitHub freigeben → Auto-Updater zieht es.

## Lizenz

Mit dem Einreichen eines PRs stimmst du zu, dass dein Beitrag unter der
[MIT-Lizenz](./LICENSE) des Projekts veröffentlicht wird.
