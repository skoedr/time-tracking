/**
 * Shared resolvers for the MCP write-bridge endpoint and token file.
 *
 * Both processes must agree on these locations:
 *  - the Electron main process (mcpBridge.ts) — hosts the socket, writes the token
 *  - the standalone MCP server (writeClient.ts) — connects, reads the token
 *
 * Everything is anchored on the TimeTrack userData directory, derived from the
 * DB path (which honours TIMETRACK_DB_PATH) so a custom profile keeps socket,
 * token and DB together. Electron-free — safe to import from either side.
 *
 *   Windows : named pipe  \\.\pipe\timetrack-mcp
 *   *nix    : unix socket  <userData>/mcp.sock
 *   token   :              <userData>/mcp-write.token   (mode 0600)
 */
import { dirname, join } from 'path'
import { resolveDbPath } from './dbPath'

export const TOKEN_FILENAME = 'mcp-write.token'
export const SOCK_FILENAME = 'mcp.sock'
export const WIN_PIPE = '\\\\.\\pipe\\timetrack-mcp'

/** Socket path (or named pipe) for a given userData directory. */
export function socketPathForDir(
  dir: string,
  platform: NodeJS.Platform = process.platform
): string {
  return platform === 'win32' ? WIN_PIPE : join(dir, SOCK_FILENAME)
}

/** Token file path for a given userData directory. */
export function tokenPathForDir(dir: string): string {
  return join(dir, TOKEN_FILENAME)
}

/** userData directory, inferred from the resolved DB path. */
export function userDataDir(): string {
  return dirname(resolveDbPath())
}

/** MCP-side socket/pipe resolver (Electron-free). */
export function resolveSocketPath(platform: NodeJS.Platform = process.platform): string {
  return socketPathForDir(userDataDir(), platform)
}

/** MCP-side token-file resolver (Electron-free). */
export function resolveTokenPath(): string {
  return tokenPathForDir(userDataDir())
}
