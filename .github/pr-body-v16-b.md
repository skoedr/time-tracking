## PR B — English README (v1.6 OSS-Readiness)

Adds `README.en.md` as a full English translation of the German primary README,
and adds three missing sections + a language banner to `README.md`.

### Changes

| File | What changed |
| ---- | ------------ |
| `README.en.md` | **New.** Full English translation of all sections (Features, Tech Stack, Dev, Releases, Project Structure, Data Storage, Security, Contributing, Privacy, License). "Coming soon" updated to match DE. |
| `README.md` | Language banner `> 🌐 English version → README.en.md` added at top. New sections: **Contributing** (link to CONTRIBUTING.md), **Privacy** (one-liner + link to PRIVACY.md), **Security** extended with link to SECURITY.md. |

### Why

Part of v1.6 OSS-Readiness. A public OSS repo with a German-only README limits
discoverability and contributor reach. The DE README remains the primary version
(matching the German-first app audience); EN is an explicit translation.

### Test plan

- [ ] `README.en.md` renders cleanly on GitHub (no broken links)
- [ ] Language banner in `README.md` links correctly to `README.en.md`
- [ ] All cross-links (CONTRIBUTING, SECURITY, PRIVACY, ROADMAP, LICENSE) resolve
- [ ] "Coming soon" section matches between DE and EN
