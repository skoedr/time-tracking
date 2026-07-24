/**
 * Cross-platform resolver for the TimeTrack SQLite database path.
 *
 * The Electron app stores its DB at `app.getPath('userData')/timetrack.sqlite`,
 * where `userData` is `<appData>/TimeTrack` (productName = "TimeTrack", see
 * electron-builder.yml). This module reproduces that location WITHOUT importing
 * Electron, so the standalone MCP server can find the same file.
 *
 *   Windows : %APPDATA%\TimeTrack\timetrack.sqlite
 *   macOS   : ~/Library/Application Support/TimeTrack/timetrack.sqlite
 *   Linux   : ~/.config/TimeTrack/timetrack.sqlite   (or $XDG_CONFIG_HOME)
 *
 * Override with the `TIMETRACK_DB_PATH` env var (absolute path to the .sqlite
 * file) — useful for tests, portable installs, or a non-default profile.
 */
import { homedir } from 'os'
import { join } from 'path'

const APP_DIR = 'TimeTrack'
const DB_FILE = 'timetrack.sqlite'

/** Roaming app-data directory, matching Electron's `getPath('appData')`. */
export function appDataDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir()
): string {
  switch (platform) {
    case 'win32':
      return env.APPDATA ?? join(home, 'AppData', 'Roaming')
    case 'darwin':
      return join(home, 'Library', 'Application Support')
    default:
      // Linux and friends — respect XDG, fall back to ~/.config.
      return env.XDG_CONFIG_HOME ?? join(home, '.config')
  }
}

/**
 * Absolute path to the TimeTrack database. Honours `TIMETRACK_DB_PATH` first,
 * otherwise derives the platform-default location.
 */
export function resolveDbPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir()
): string {
  const override = env.TIMETRACK_DB_PATH?.trim()
  if (override) return override
  return join(appDataDir(platform, env, home), APP_DIR, DB_FILE)
}
