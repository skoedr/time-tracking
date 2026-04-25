import { useState, useEffect } from 'react'
import { Dialog } from './Dialog'
import { useT } from '../contexts/I18nContext'
import type { LicenseEntry } from '../../../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  version: string
}

const MIT_TEXT = `MIT License

Copyright (c) 2026 skoedr

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

export function AboutDialog({ open, onClose, version }: Props): React.JSX.Element | null {
  const t = useT()
  const [licenses, setLicenses] = useState<LicenseEntry[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || licenses.length > 0) return
    setLoading(true)
    void window.api.app.getLicenses().then((res) => {
      if (res.ok) setLicenses(res.data)
      setLoading(false)
    })
  }, [open, licenses.length])

  function toggleExpand(name: string): void {
    setExpanded((prev) => (prev === name ? null : name))
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('about.title')} widthClass="w-[600px]">
      {/* App info */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-100">TimeTrack</p>
            <p className="text-sm text-slate-400">
              {t('about.version')} {version}
            </p>
          </div>
          <a
            href="https://github.com/skoedr/time-tracking"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              e.preventDefault()
              void window.api.shell.openPath('https://github.com/skoedr/time-tracking')
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            GitHub
          </a>
        </div>

        {/* Own license */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('about.ownLicense')}
          </p>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-slate-300">
            {MIT_TEXT}
          </pre>
        </div>

        {/* Third-party licenses */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('about.thirdParty')} ({licenses.length})
          </p>

          {loading && (
            <p className="text-xs text-slate-500">{t('about.loading')}</p>
          )}

          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {licenses.map((pkg) => (
              <div key={pkg.name} className="rounded-md border border-slate-700/50">
                <button
                  type="button"
                  onClick={() => toggleExpand(pkg.name)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-700/40 rounded-md"
                >
                  <span className="text-sm text-slate-200 font-medium">{pkg.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{pkg.version}</span>
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300">
                      {pkg.license}
                    </span>
                    <span className="text-xs text-slate-500">
                      {expanded === pkg.name ? '▲' : '▼'}
                    </span>
                  </span>
                </button>

                {expanded === pkg.name && (
                  <div className="border-t border-slate-700/50 px-3 py-2 flex flex-col gap-2">
                    {pkg.repository && (
                      <button
                        type="button"
                        onClick={() => void window.api.shell.openPath(pkg.repository!)}
                        className="text-left text-xs text-indigo-400 hover:text-indigo-300 underline truncate"
                      >
                        {pkg.repository}
                      </button>
                    )}
                    {pkg.licenseText ? (
                      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-slate-400">
                        {pkg.licenseText}
                      </pre>
                    ) : (
                      <p className="text-xs text-slate-500">{t('about.noLicenseText')}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Close button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {t('about.close')}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
