## PR A — Contributing Docs Bundle (v1.6 OSS-Readiness)

Adds the full contributing-docs layer required before going public as an OSS project.

### Changes

| File | Content |
| ---- | ------- |
| `CONTRIBUTING.md` | Dev setup (`pnpm install/dev/test/typecheck`), branch naming, conventional commits, PR rules, i18n reminder |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 |
| `SECURITY.md` | Private Security Advisory (preferred) + email fallback, supported versions, scope |
| `PRIVACY.md` | All data stays local; only outbound call = auto-update check against `api.github.com`; no telemetry |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Structured form: version, OS, repro steps, expected/actual, logs |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Structured form: problem, solution, alternatives, use case |
| `.github/ISSUE_TEMPLATE/config.yml` | Blank issues disabled; links to Discussions + Security Advisory |

### Why now?

Part of the v1.6 OSS-Readiness milestone (Approach B from office-hours 2026-04-26).
A public repo without CONTRIBUTING/SECURITY/PRIVACY creates unnecessary friction
for external contributors and is incomplete from a license-hygiene perspective.

### Test plan

- [ ] Open a new issue on GitHub → templates appear, blank issue is blocked
- [ ] Check "Frage / Diskussion" link → redirects to Discussions
- [ ] Check "Sicherheitslücke melden" link → opens Private Security Advisory form
- [ ] Read PRIVACY.md — verify no outbound calls are missing or wrong
