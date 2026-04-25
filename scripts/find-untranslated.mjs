#!/usr/bin/env node
/**
 * find-untranslated.mjs (v1.5 PR D)
 *
 * Lists React component files that still contain hardcoded German UI strings
 * (i.e., JSX text that is NOT wrapped in a t() call).
 *
 * This is not exhaustive — it uses heuristics (German umlauts, common German
 * words) to surface the most likely candidates for v1.6 migration.
 *
 * Usage:
 *   node scripts/find-untranslated.mjs
 *   node scripts/find-untranslated.mjs --verbose   # show matched lines
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const RENDERER_DIR = join(ROOT, 'src', 'renderer', 'src')
const VERBOSE = process.argv.includes('--verbose')

// Patterns that suggest an untranslated German string in JSX.
const GERMAN_PATTERNS = [
  // German umlauts or ß in JSX text content (between > and <, or in strings)
  />[^<]*[äöüÄÖÜß][^<]*</u,
  // Common German stop-words in JSX text (not in imports/attributes)
  />\s*(Einstellungen|Kunden|Timer|Backup|Fehler|Speichern|Abbrechen|Laden|Erstellen|Bearbeiten|Löschen)\s*</u,
]

// Files we know are already migrated or intentionally DE-only (skip).
const SKIP_FILES = new Set([
  'UpdateBanner.tsx',
  'SettingsView.tsx', // migrated sections
])

// Migration status for v1.5: these components are partially migrated.
const MIGRATED_COMPONENTS = ['UpdateBanner.tsx', 'SettingsView.tsx']

function walk(dir) {
  const results = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...walk(full))
    } else if (name.endsWith('.tsx') || name.endsWith('.ts')) {
      results.push(full)
    }
  }
  return results
}

const files = walk(RENDERER_DIR)
const hits = []

for (const file of files) {
  const name = file.split(/[\\/]/).pop()
  if (SKIP_FILES.has(name)) continue

  const src = readFileSync(file, 'utf8')
  const matchedLines = []

  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip lines that already use t() or are comments/imports.
    if (line.includes('t(') || line.trim().startsWith('//') || line.trim().startsWith('import')) {
      continue
    }
    for (const pat of GERMAN_PATTERNS) {
      if (pat.test(line)) {
        matchedLines.push({ lineNo: i + 1, text: line.trim() })
        break
      }
    }
  }

  if (matchedLines.length > 0) {
    hits.push({ file: relative(ROOT, file), matches: matchedLines })
  }
}

if (hits.length === 0) {
  console.log('✓ No obvious untranslated German strings found in renderer.')
  process.exit(0)
}

console.log(`\nUntranslated DE strings found in ${hits.length} file(s) — v1.6 migration backlog:\n`)
for (const { file, matches } of hits) {
  console.log(`  ${file}  (${matches.length} match${matches.length === 1 ? '' : 'es'})`)
  if (VERBOSE) {
    for (const { lineNo, text } of matches) {
      console.log(`    L${lineNo}: ${text.slice(0, 120)}`)
    }
  }
}

if (!VERBOSE) {
  console.log('\n  Run with --verbose to see matched lines.')
}

console.log(`\nAlready migrated in v1.5: ${MIGRATED_COMPONENTS.join(', ')}`)
console.log('Remaining strings are tracked as v1.6 backlog.\n')
