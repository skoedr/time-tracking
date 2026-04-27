import { readFileSync, writeFileSync } from 'fs'
const path = 'src/renderer/src/views/SettingsView.tsx'
let c = readFileSync(path, 'utf8')

c = c.replaceAll(
  'className="h-4 w-4 rounded border-slate-600 bg-slate-800"',
  'className="h-4 w-4 rounded accent-indigo-500"'
)
c = c.replaceAll(
  'className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200"',
  "className=\"rounded px-3 py-1.5 text-sm\" style={{ background: 'var(--card-bg)', color: 'var(--text)' }}"
)
c = c.replaceAll(
  'className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300"',
  "className=\"rounded px-3 py-1.5 text-xs\" style={{ background: 'var(--card-bg)', color: 'var(--text2)' }}"
)
c = c.replaceAll(
  'className="flex-1 truncate rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300"',
  "className=\"flex-1 truncate rounded px-3 py-1.5 text-xs\" style={{ background: 'var(--card-bg)', color: 'var(--text2)' }}"
)
c = c.replaceAll(
  'className="inline-block w-fit rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300"',
  "className=\"inline-block w-fit rounded px-3 py-1.5 text-xs\" style={{ background: 'var(--card-bg)', color: 'var(--text2)' }}"
)
c = c.replaceAll(
  'className="h-10 w-16 cursor-pointer rounded border border-slate-700 bg-slate-800"',
  "className=\"h-10 w-16 cursor-pointer rounded border\" style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}"
)

writeFileSync(path, c, 'utf8')
console.log('done')
