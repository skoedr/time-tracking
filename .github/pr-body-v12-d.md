**v1.2 PR D — Packaged-binary smoke test in CI + v1.2 CHANGELOG.** Closes the v1.2 release-infra gap (E11). Last PR before tagging `v1.2.0`.

## Why

v1.1.0 and v1.1.1 shipped a `better-sqlite3` binary built for the wrong ABI (Node, not Electron). The app crashed at startup with `NODE_MODULE_VERSION` mismatch on every fresh install. v1.1.2 fixed the build step, but **the only way we knew the fix worked was a user trying it.** This PR makes the same class of bug fail the release pipeline before the GitHub Release is published.

## What's in here

### 1. `--smoke-test=<path>` mode in `src/main/index.ts`
Early-exit code path inside `app.whenReady`:
1. Parse `--smoke-test=<outPath>` from `process.argv`.
2. Call `getDb()` — opens the SQLite file and runs every migration against the **actual Electron-ABI** `better-sqlite3` binary.
3. Read `MAX(version)` from `schema_version`.
4. Write JSON status to `<outPath>` and `app.exit(0)`.
5. Any thrown error → JSON `{ ok: false, error, electronVersion }` and `app.exit(1)`.

No window, no tray, no IPC handlers, no idle watcher. Pure DB-open + migrate + exit.

JSON payload on success:
```json
{
  "ok": true,
  "schemaVersion": 3,
  "dbPath": "C:\\Users\\runneradmin\\AppData\\Roaming\\TimeTrack",
  "electronVersion": "39.2.6",
  "nodeVersion": "22.x.x"
}
```

### 2. CI smoke step in `.github/workflows/release.yml`
Inserted between `build:win` and `upload-artifact`:
- Locates `dist/win-unpacked/*.exe` (filters out `uninstall*`, `crashpad*`, `elevate*`).
- Launches it with `--smoke-test=$RUNNER_TEMP/smoke.json`, `WaitForExit(60000)`.
- Fails the release if:
  - exit code != 0
  - the JSON file is missing
  - `ok != true`
  - `schemaVersion < 3` (i.e. v1.2 migration didn't apply)
  - the binary hangs > 60 s

So a future `better-sqlite3` ABI mismatch, a broken migration, or a runtime regression in the main process initialization will block the release at the CI step instead of crashing on user machines.

### 3. CHANGELOG.md
Added the `[Unreleased] — v1.2` section consolidating PR A–D:
- TodayView, CalendarView + Drawer, manual create/edit, soft-delete + Rückgängig
- Tray today-total tooltip, DESIGN.md stub
- Migration 003 (rate_cent, deleted_at, idx, backfill, post-apply assertion)
- `dashboard:summary` IPC
- The smoke test itself

Plus `### Notes` documenting the v1.2 cross-midnight limitation and the rounding-UI deferral to v1.3.

## Verification

| Check | Result |
| --- | --- |
| `pnpm typecheck` | ✅ green |
| `pnpm test` | ✅ 51/51 (unchanged) |
| `pnpm lint` | ✅ baseline 21 errors, **0 new** |

The smoke step itself can only be exercised in the actual release pipeline on a tag push — cannot be simulated from a feature-branch push (no `dist/win-unpacked/*.exe` is produced for branch CI). The first real run will be the v1.2.0 tag.

## After this merges

Tag `v1.2.0` → release pipeline runs PR D's smoke step → if it passes, the GitHub Release is published. If `better-sqlite3` ABI is wrong again, or migration 003 doesn't apply, the release fails before any user can download it.
