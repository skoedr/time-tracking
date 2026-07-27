/**
 * Characterization tests for TagInput (#142, Schritt 2).
 *
 * Written against the pre-refactor implementation and kept green through it:
 * the suggestion list moves from `useState` + `useEffect` to a `useMemo`, and
 * the highlight reset that shared that effect moves to the two places that
 * actually trigger it (typing, and removing a chip). These tests pin the
 * observable behavior across that move — they are the safety net #142 says
 * the renderer lacks, not a spec for new behavior.
 *
 * The reset cases (5 and 6) are the ones that matter: they are the only part
 * of the old effect that is NOT a pure derivation, so they are the only part
 * that can silently disappear during the refactor.
 */
import { useState } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, waitFor, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { TagInput } from './TagInput'
import { I18nProvider } from '../contexts/I18nContext'
import { serializeTags } from '../../../shared/tags'

// `globals` is off in vitest.config.ts, so Testing Library's auto-cleanup
// afterEach is never registered — unmount explicitly or the screen queries
// see every previous render.
afterEach(cleanup)

const KNOWN = ['bug', 'docs', 'ux']

interface ApiMock {
  create: ReturnType<typeof vi.fn>
}

function mockApi(known: string[]): ApiMock {
  const registry = [...known]
  const create = vi.fn(async (name: string) => {
    registry.push(name)
    return { ok: true as const, data: undefined }
  })
  const api = {
    tags: {
      getAllWithCount: async () => ({
        ok: true as const,
        data: registry.map((name) => ({ name, count: 1 }))
      }),
      create
    }
  }
  ;(window as unknown as { api: typeof api }).api = api
  return { create }
}

/** Controlled wrapper — mirrors how EntryEditForm/StartTimerModal drive it. */
function Harness({
  initial = '',
  onChange
}: {
  initial?: string
  onChange?: (v: string) => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <I18nProvider>
      <TagInput
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange?.(v)
        }}
      />
    </I18nProvider>
  )
}

/** Renders, waits for the async master-registry load, opens the dropdown. */
async function setup(opts: { initial?: string; known?: string[] } = {}): Promise<{
  input: HTMLInputElement
  onChange: ReturnType<typeof vi.fn>
  api: ApiMock
}> {
  const api = mockApi(opts.known ?? KNOWN)
  const onChange = vi.fn()
  render(<Harness initial={opts.initial ?? ''} onChange={onChange} />)
  const input = screen.getByLabelText('Tag eingeben') as HTMLInputElement
  // React 17+ delegates onFocus to the bubbling `focusin`; a plain `focus`
  // event never reaches the handler.
  fireEvent.focusIn(input)
  // The registry arrives via IPC after mount; before it does, the list is empty.
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeNull())
  return { input, onChange, api }
}

function optionTexts(): string[] {
  return screen.queryAllByRole('option').map((li) => li.textContent ?? '')
}

function highlightedText(): string | null {
  const sel = screen
    .queryAllByRole('option')
    .find((li) => li.getAttribute('aria-selected') === 'true')
  return sel ? (sel.textContent ?? '') : null
}

describe('TagInput — suggestion list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1 — zeigt beim Fokus alle bekannten Tags, bereits gewählte ausgenommen', async () => {
    await setup({ initial: serializeTags(['bug']) })
    expect(optionTexts()).toEqual(['#docs', '#ux'])
  })

  it('2 — filtert nach Präfix und hängt den Erstellen-Eintrag an', async () => {
    const { input } = await setup()
    fireEvent.change(input, { target: { value: 'u' } })
    // 'u' matches 'ux' by prefix and is itself not a known tag → create option.
    expect(optionTexts()).toEqual(['#ux', "+ 'u' erstellen"])
  })

  it('3 — kein Erstellen-Eintrag bei exaktem Treffer', async () => {
    const { input } = await setup()
    fireEvent.change(input, { target: { value: 'ux' } })
    expect(optionTexts()).toEqual(['#ux'])
  })

  it('4 — höchstens 8 Vorschläge', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `tag${i}`)
    await setup({ known: many })
    expect(optionTexts()).toHaveLength(8)
  })

  it('5 — Tippen setzt die Markierung zurück', async () => {
    const { input } = await setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(highlightedText()).toBe('#bug')

    fireEvent.change(input, { target: { value: 'd' } })
    expect(highlightedText()).toBeNull()
  })

  it('6 — das Entfernen eines Chips setzt die Markierung zurück', async () => {
    const { input } = await setup({ initial: serializeTags(['bug', 'ux']) })
    expect(optionTexts()).toEqual(['#docs'])

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(highlightedText()).toBe('#docs')

    // Backspace on an empty input removes the last chip; the list grows by the
    // freed tag, so a stale index would now point at a different entry.
    fireEvent.keyDown(input, { key: 'Backspace' })
    await waitFor(() => expect(optionTexts()).toEqual(['#docs', '#ux']))
    expect(highlightedText()).toBeNull()
  })
})

describe('TagInput — keyboard commit paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('7 — Enter übernimmt den markierten Vorschlag', async () => {
    const { input, onChange } = await setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(highlightedText()).toBe('#docs')

    fireEvent.change(input, { target: { value: 'd' } })
    // Typing reset the highlight, so re-arm it before committing.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(serializeTags(['docs'])))
  })

  it('8 — Enter auf unbekanntem Freitext legt den Tag an', async () => {
    const { input, onChange, api } = await setup()
    fireEvent.change(input, { target: { value: 'neu' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(api.create).toHaveBeenCalledWith('neu'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(serializeTags(['neu'])))
  })

  it('9 — Escape schließt die Liste', async () => {
    const { input } = await setup()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
