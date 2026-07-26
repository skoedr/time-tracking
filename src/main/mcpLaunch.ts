/**
 * Resolves how an MCP client (Claude Code et al.) should launch TimeTrack's
 * bundled MCP server.
 *
 * The server is a plain Node program, but `better-sqlite3` in this project is
 * compiled against the **Electron** ABI (`electron-builder install-app-deps`).
 * Running it under a system Node therefore fails with NODE_MODULE_VERSION
 * mismatch, and keeping a second Node-ABI copy of the binary around means two
 * artifacts to build, ship and bump.
 *
 * Instead we launch the server with the Electron binary in Node mode
 * (`ELECTRON_RUN_AS_NODE=1`): same V8, same module ABI as the native module the
 * app already ships, and no extra artifact. In a packaged install that binary
 * is `TimeTrack.exe` itself; in dev it's `node_modules/electron/dist/electron`.
 * Both are `process.execPath`, so one expression covers both.
 *
 * The server entry lives next to the app bundle (`out/mcp/mcp/server.js`
 * relative to `app.getAppPath()`), which is inside `app.asar` in a packaged
 * install — Electron's fs patch reads it transparently.
 *
 * Hardening caveat: this design depends on the Electron **RunAsNode** fuse
 * staying enabled. The project sets no fuses today, so it works. If fuses are
 * ever enabled (see the note in `electron-builder.yml`), `runAsNode` must stay
 * on — otherwise `ELECTRON_RUN_AS_NODE=1` is ignored and the MCP server fails
 * to launch with no visible error.
 */
import { existsSync } from 'fs'
import { join } from 'path'

/** A ready-to-serialize `.mcp.json` server entry. */
export interface McpRegistration {
  /** Executable an MCP client should spawn. */
  command: string
  /** Arguments — the server entry point. */
  args: string[]
  /** Environment that flips the Electron binary into plain-Node mode. */
  env: Record<string, string>
  /**
   * Whether the server entry actually exists. False in a dev checkout that
   * hasn't run `pnpm build:mcp` yet; the UI shows a build hint instead of a
   * registration snippet that would fail on first use.
   */
  available: boolean
}

/** Absolute path to the compiled MCP server entry for a given app root. */
export function mcpServerEntry(appPath: string): string {
  return join(appPath, 'out', 'mcp', 'mcp', 'server.js')
}

/**
 * Build the registration. Pure except for the injected existence check, so
 * tests can cover the packaged and dev shapes without an Electron runtime.
 */
export function buildMcpRegistration(
  execPath: string,
  appPath: string,
  exists: (p: string) => boolean = existsSync
): McpRegistration {
  const entry = mcpServerEntry(appPath)
  return {
    command: execPath,
    args: [entry],
    env: { ELECTRON_RUN_AS_NODE: '1' },
    available: exists(entry)
  }
}
