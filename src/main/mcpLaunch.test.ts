/**
 * Unit tests for the MCP launch resolver.
 *
 * What these pin down: the registration must name the app's own Electron
 * binary plus ELECTRON_RUN_AS_NODE, never a bare `node`. A system Node would
 * load `better-sqlite3` under the wrong module ABI and every tool call would
 * fail at the first query — the exact breakage v1.14.1 users hit by hand.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { buildMcpRegistration, mcpServerEntry } from './mcpLaunch'

const PACKAGED_APP = join('C:', 'Program Files', 'TimeTrack', 'resources', 'app.asar')
const PACKAGED_EXE = join('C:', 'Program Files', 'TimeTrack', 'TimeTrack.exe')
const DEV_APP = join('E:', 'Development', 'time-tracking')
const DEV_EXE = join(DEV_APP, 'node_modules', 'electron', 'dist', 'electron.exe')

const present = (): boolean => true
const absent = (): boolean => false

describe('mcpServerEntry', () => {
  it('sits next to the app bundle', () => {
    expect(mcpServerEntry(PACKAGED_APP)).toBe(join(PACKAGED_APP, 'out', 'mcp', 'mcp', 'server.js'))
  })
})

describe('buildMcpRegistration', () => {
  it('launches a packaged install via its own executable, inside the asar', () => {
    const reg = buildMcpRegistration(PACKAGED_EXE, PACKAGED_APP, present)
    expect(reg.command).toBe(PACKAGED_EXE)
    expect(reg.args).toEqual([join(PACKAGED_APP, 'out', 'mcp', 'mcp', 'server.js')])
    expect(reg.available).toBe(true)
  })

  it('uses the same shape in a dev checkout, via the Electron binary', () => {
    const reg = buildMcpRegistration(DEV_EXE, DEV_APP, present)
    expect(reg.command).toBe(DEV_EXE)
    expect(reg.args).toEqual([join(DEV_APP, 'out', 'mcp', 'mcp', 'server.js')])
  })

  it('always sets ELECTRON_RUN_AS_NODE — never spawns a bare node', () => {
    const reg = buildMcpRegistration(PACKAGED_EXE, PACKAGED_APP, present)
    expect(reg.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
    expect(reg.command).not.toMatch(/^node(\.exe)?$/)
  })

  it('reports unavailable when the server was never built', () => {
    const reg = buildMcpRegistration(DEV_EXE, DEV_APP, absent)
    expect(reg.available).toBe(false)
    // Still emits the would-be registration so the UI can show what it will
    // look like once `pnpm build:mcp` has run.
    expect(reg.args).toHaveLength(1)
  })

  it('checks the entry it actually advertises', () => {
    const checked: string[] = []
    const reg = buildMcpRegistration(PACKAGED_EXE, PACKAGED_APP, (p) => {
      checked.push(p)
      return true
    })
    expect(checked).toEqual(reg.args)
  })
})
