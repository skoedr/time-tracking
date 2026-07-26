## Native SQLite-ABI — eine Regel, die du nicht umgehen darfst

**Führe niemals `pnpm rebuild better-sqlite3` aus.** Auch nicht „nur kurz für die Tests",
auch nicht, wenn ein Testlauf `ERR_DLOPEN_FAILED` oder `NODE_MODULE_VERSION` meldet.

`better-sqlite3` wird gegen die **Electron**-ABI gebaut, weil die App das zur Laufzeit
braucht. `pnpm rebuild` ersetzt die Binary durch einen Node-ABI-Build und lässt dabei den
Cache-Marker `node_modules/better-sqlite3/build/Release/.forge-meta` unverändert. Da
`electron-builder install-app-deps` nur diesen Marker liest, wird jedes spätere
`pnpm install` zum stillen No-op: die App kann ihre eigene Datenbank nicht mehr öffnen,
und **kein** Kommando meldet einen Fehler. Der Marker lügt.

- Tests laufen mit `pnpm test`. Das startet Vitest über `scripts/run-vitest.mjs` auf der
  Electron-Binary im Node-Modus — dieselbe Lösung wie beim MCP-Server
  (`src/main/mcpLaunch.ts`). Ein grüner Lauf ist **596 passed, 0 skipped**.
- `pnpm exec vitest` direkt aufzurufen kann nicht funktionieren und scheitert mit einer
  Anleitung. Das ist kein Umgebungsproblem, das du „reparieren" sollst.
- Dreistellige Skip-Zahlen bedeuten kaputte Umgebung, nie „grün". Melde das, statt
  weiterzumachen.
- Ist die Binary doch einmal falsch: `pnpm exec electron-rebuild -f -w better-sqlite3`.
  Das `-f` ist zwingend — ohne erzwungenen Rebuild gewinnt der lügende Marker.

Hintergrund und Fehlersuche: CONTRIBUTING.md → „Tests und die native SQLite-ABI"
([#151](https://github.com/skoedr/time-tracking/issues/151)).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:

- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health

## GBrain Configuration (configured by /setup-gbrain)

- Engine: pglite
- Config file: ~/.gbrain/config.json (mode 0600)
- Setup date: 2026-04-26
- MCP registered: yes
- Memory sync: full (https://github.com/skoedr/gstack-brain-robin)
- Current repo policy: read-write
