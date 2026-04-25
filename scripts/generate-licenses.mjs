#!/usr/bin/env node
/**
 * generate-licenses.mjs
 *
 * Scans node_modules/ and writes resources/licenses.json.
 * Run automatically as part of `prebuild`; commit the output so CI
 * doesn't need to regenerate it on every pull.
 *
 * Output shape (array, sorted by name):
 *   { name, version, license, repository?, licenseText? }
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const nodeModulesDir = join(rootDir, 'node_modules')
const outPath = join(rootDir, 'resources', 'licenses.json')

function readPkg(pkgDir) {
  const p = join(pkgDir, 'package.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

const LICENSE_FILES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENSE-MIT',
  'LICENCE',
  'LICENCE.md',
  'license',
  'license.md',
  'license.txt',
]

function readLicenseText(pkgDir) {
  for (const name of LICENSE_FILES) {
    const p = join(pkgDir, name)
    if (existsSync(p)) {
      try {
        const text = readFileSync(p, 'utf8')
        // Cap at 6 000 chars so the JSON stays manageable.
        return text.length > 6000 ? text.slice(0, 6000) + '\n…(truncated)' : text
      } catch {
        // skip
      }
    }
  }
  return null
}

function normRepoUrl(raw) {
  if (!raw) return undefined
  if (typeof raw === 'object') raw = raw.url ?? ''
  // git+https://github.com/foo/bar.git → https://github.com/foo/bar
  return String(raw)
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
}

function collectPackage(pkgDir, fallbackName) {
  const pkg = readPkg(pkgDir)
  if (!pkg || pkg.private) return null
  const name = pkg.name ?? fallbackName
  // Skip the root app itself.
  if (name === 'time-tracking') return null
  return {
    name,
    version: pkg.version ?? '?',
    license: pkg.license ?? 'UNLICENSED',
    repository: normRepoUrl(pkg.repository),
    licenseText: readLicenseText(pkgDir),
  }
}

const packages = []

if (!existsSync(nodeModulesDir)) {
  console.error('[generate-licenses] node_modules/ not found — run pnpm install first.')
  process.exit(1)
}

// Load root package.json to find direct prod deps.
const rootPkg = readPkg(rootDir)
if (!rootPkg) {
  console.error('[generate-licenses] Could not read package.json at root.')
  process.exit(1)
}

const seen = new Set()

function resolvePkgDir(name) {
  // Flat hoisted node_modules (pnpm node-linker=hoisted).
  const parts = name.split('/')
  return join(nodeModulesDir, ...parts)
}

function collectDepsRecursively(pkgName) {
  if (seen.has(pkgName)) return
  seen.add(pkgName)

  const pkgDir = resolvePkgDir(pkgName)
  const pkg = readPkg(pkgDir)
  if (!pkg) return

  const entry = collectPackage(pkgDir, pkgName)
  if (entry) packages.push(entry)

  // Recurse into the package's own dependencies (not devDeps).
  const deps = Object.keys(pkg.dependencies ?? {})
  for (const dep of deps) {
    collectDepsRecursively(dep)
  }
  // Also include peerDependencies that are actually present.
  const peers = Object.keys(pkg.peerDependencies ?? {})
  for (const peer of peers) {
    if (existsSync(resolvePkgDir(peer))) {
      collectDepsRecursively(peer)
    }
  }
}

for (const dep of Object.keys(rootPkg.dependencies ?? {})) {
  collectDepsRecursively(dep)
}

packages.sort((a, b) => a.name.localeCompare(b.name))

const resourcesDir = join(rootDir, 'resources')
if (!existsSync(resourcesDir)) mkdirSync(resourcesDir, { recursive: true })

writeFileSync(outPath, JSON.stringify(packages, null, 2), 'utf8')
console.log(`[generate-licenses] Wrote ${packages.length} packages → resources/licenses.json`)
