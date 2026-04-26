## PR C — macOS Build Job (v1.6 OSS-Readiness)

Adds a `build-macos` job to the release pipeline and configures electron-builder
for macOS targets.

> ⚠️ **Unverified on real hardware.** This PR was written on Windows. The CI run
> on the first `v*` tag push will be the first real test. If the smoke test fails,
> see the "Known risks" section below before reverting.

### Changes

| File | What changed |
| ---- | ------------ |
| `electron-builder.yml` | New `mac:` section: `hardenedRuntime: true`, entitlements wired to existing `build/entitlements.mac.plist`, targets: `dmg` + `zip` for `arm64` |
| `.github/workflows/release.yml` | New `build-macos` job (mirrors `build-windows`: typecheck → test → electron-rebuild → build → smoke test → upload). `publish-release` now `needs: [build-windows, build-macos]` and downloads both artifact sets. |

### What the macOS job does

1. `pnpm install` → `typecheck` → `test` (same checks as Windows)
2. `electron-rebuild` to recompile `better-sqlite3` against the Electron ABI
3. `electron-builder --mac --publish never` → `dist/mac-arm64/TimeTrack.app` + `.dmg` + `.zip`
4. Smoke test: runs `TimeTrack.app/Contents/MacOS/TimeTrack --smoke-test=/tmp/smoke.json`, validates `ok=true`, `schemaVersion >= 3`, `pdfBytes >= 1000`
5. Uploads `*.dmg`, `*.dmg.blockmap`, `*.zip`, `latest-mac.yml` as `timetrack-macos` artifact

### Distribution note

The build is **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false`). macOS Gatekeeper
will block direct double-click. Users must right-click → Open (or `xattr -d com.apple.quarantine TimeTrack.dmg`).
Code signing + notarization can be added in a later PR once Apple Developer credentials are available.

### Known risks / things to verify on first CI run

- **Binary path:** electron-builder should output `dist/mac-arm64/TimeTrack.app` for `arch: [arm64]`. If it uses a different path (e.g. `dist/mac/`), update the `APP_BINARY` variable in the smoke test step.
- **Electron display:** The smoke test creates a hidden `BrowserWindow` for PDF rendering. macOS GitHub Actions runners have a virtual display; this should work without `xvfb`.
- **`electron-rebuild` availability:** Confirmed same as Windows job.
- **x64 / universal builds:** Deferred. Add `arch: [x64]` or `arch: [universal]` to `electron-builder.yml` targets in a follow-up once arm64 is confirmed green.

### Test plan (after merging, on first tag push)

- [ ] `build-macos` job completes green in GitHub Actions
- [ ] Smoke test step reports `ok=true` with valid `schemaVersion` and `pdfBytes`
- [ ] `timetrack-macos` artifact contains `.dmg`, `.zip`, `latest-mac.yml`
- [ ] GitHub Release includes macOS artifacts alongside Windows installer
- [ ] `.dmg` mounts and app launches on a real Mac (right-click → Open)
