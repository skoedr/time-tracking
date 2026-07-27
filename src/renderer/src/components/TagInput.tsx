import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deserializeTags, parseTagInput, serializeTags } from '../../../shared/tags'
import { useT } from '../contexts/I18nContext'

interface Props {
  /** Serialized tags value from the DB (`,bug,ux,` format). */
  value: string
  onChange: (serialized: string) => void
  disabled?: boolean
  /** Optional callback to navigate to the tag management settings tab. */
  onManageTags?: () => void
}

/**
 * 8-color deterministic palette for tag chips.
 * Color is derived from the first character code so the same tag always
 * gets the same color across sessions.
 */
const CHIP_COLORS: string[] = [
  'bg-indigo-900/60 text-indigo-300 border-indigo-700',
  'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  'bg-amber-900/60 text-amber-300 border-amber-700',
  'bg-rose-900/60 text-rose-300 border-rose-700',
  'bg-violet-900/60 text-violet-300 border-violet-700',
  'bg-sky-900/60 text-sky-300 border-sky-700',
  'bg-lime-900/60 text-lime-300 border-lime-700',
  'bg-orange-900/60 text-orange-300 border-orange-700'
]

function chipColor(tag: string): string {
  const code = tag.charCodeAt(0) || 0
  return CHIP_COLORS[code % CHIP_COLORS.length]
}

// Sentinel value for the "create new tag" option in the dropdown
const CREATE_SENTINEL = '__create__'

/**
 * Tag chip list + text input with Tab/Enter/comma to add, Backspace to
 * remove, and autocomplete dropdown populated from `tags:get-all-with-count`
 * (master registry).
 *
 * Closed tag system: free text that doesn't match an existing tag shows a
 * "+ 'foo' erstellen" option. Selecting it calls `tags:create` and adds
 * the tag immediately.
 *
 * Stores tags as the serialized DB format (`,tag1,tag2,`) via `onChange`.
 */
export function TagInput({
  value,
  onChange,
  disabled = false,
  onManageTags
}: Props): React.ReactElement {
  const t = useT()
  const tags = deserializeTags(value)
  const [inputValue, setInputValue] = useState('')
  const [allKnown, setAllKnown] = useState<string[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const reloadKnown = useCallback(async () => {
    const res = await window.api.tags.getAllWithCount()
    if (res.ok) setAllKnown(res.data.map((r) => r.name))
  }, [])

  // Load master registry on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- #142: dauerhaft — asynchroner Abruf beim Mount
    void reloadKnown()
  }, [reloadKnown])

  // Suggestions follow purely from the typed text, the master registry and
  // the already-selected tags — a derivation, not state (#142). `selected` is
  // re-derived from `value` inside the memo because the outer `tags` const is
  // a fresh array on every render and would defeat memoization.
  //
  // The highlight reset that used to share this effect is NOT a derivation;
  // it lives at its two triggers instead: typing (input onChange) and
  // removing a chip (removeTag).
  const suggestions = useMemo(() => {
    const selected = deserializeTags(value)
    const q = inputValue.trim().toLowerCase().replace(/^#/, '')
    const matches = allKnown
      .filter((t) => (!q || t.startsWith(q)) && !selected.includes(t))
      .slice(0, 8)
    // Append "create" sentinel if typed text is non-empty and not an exact match
    return q && !allKnown.includes(q) && !selected.includes(q)
      ? [...matches, CREATE_SENTINEL]
      : matches
  }, [inputValue, allKnown, value])

  async function addTag(tag: string): Promise<void> {
    if (!tag || tags.includes(tag) || tags.length >= 10) return
    onChange(serializeTags([...tags, tag]))
    setInputValue('')
    setDropdownOpen(false)
  }

  async function commitInput(raw: string): Promise<void> {
    if (raw === CREATE_SENTINEL) {
      const name = inputValue.trim().toLowerCase().replace(/^#/, '')
      if (!name) return
      const res = await window.api.tags.create(name)
      if (res.ok) {
        await reloadKnown()
        await addTag(name)
      }
      return
    }
    const parsed = parseTagInput(raw)
    if (parsed.length === 0) {
      setInputValue('')
      return
    }
    const next = [...tags]
    for (const t of parsed) {
      if (!next.includes(t) && next.length < 10) next.push(t)
    }
    onChange(serializeTags(next))
    setInputValue('')
    setDropdownOpen(false)
  }

  function removeTag(tag: string): void {
    onChange(serializeTags(tags.filter((t) => t !== tag)))
    // The freed tag re-enters the suggestion list, so a kept index would now
    // point at a different entry than the one the user saw highlighted.
    setHighlightedIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDropdownOpen(true)
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, -1))
      return
    }
    if ((e.key === 'Enter' || e.key === 'Tab' || e.key === ',') && inputValue.trim()) {
      e.preventDefault()
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        void commitInput(suggestions[highlightedIndex])
      } else {
        // In closed mode, Enter on free text: create if not known
        const q = inputValue.trim().toLowerCase().replace(/^#/, '')
        if (q && allKnown.includes(q)) {
          void commitInput(q)
        } else if (q) {
          void commitInput(CREATE_SENTINEL)
        }
      }
      return
    }
    if (e.key === 'Escape') {
      setDropdownOpen(false)
      setHighlightedIndex(-1)
      return
    }
    if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
      return
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const showDropdown = dropdownOpen && suggestions.length > 0 && !disabled

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex min-h-[36px] flex-wrap items-center gap-1 rounded border px-2 py-1.5 focus-within:border-indigo-500 transition-colors ${disabled ? 'opacity-50' : ''}`}
        style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)' }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${chipColor(tag)}`}
          >
            #{tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeTag(tag)
                }}
                className="leading-none opacity-60 hover:opacity-100 focus:outline-none"
                aria-label={t('tags.removeAria', { tag })}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            // Typing rebuilds the suggestion list — drop the old highlight
            // rather than let it survive onto an unrelated entry.
            setHighlightedIndex(-1)
            setDropdownOpen(true)
          }}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={tags.length === 0 ? t('tags.placeholder') : ''}
          className="min-w-[80px] flex-1 bg-transparent text-xs focus:outline-none"
          style={{ color: 'var(--text)' }}
          aria-label={t('tags.inputAria')}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
      </div>

      {showDropdown && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded border py-1 shadow-xl backdrop-blur-xl"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlightedIndex}
              onPointerDown={(e) => {
                e.preventDefault()
                void commitInput(s)
              }}
              className={`cursor-pointer px-3 py-1 text-xs ${
                i === highlightedIndex ? 'bg-indigo-600 text-white' : 'hover:bg-white/10'
              }`}
              style={
                i !== highlightedIndex
                  ? { color: s === CREATE_SENTINEL ? 'var(--text2)' : 'var(--text)' }
                  : undefined
              }
            >
              {s === CREATE_SENTINEL
                ? t('tags.createOption', { tag: inputValue.trim().toLowerCase().replace(/^#/, '') })
                : `#${s}`}
            </li>
          ))}
        </ul>
      )}

      {onManageTags && allKnown.length === 0 && !disabled && (
        <button
          type="button"
          onClick={onManageTags}
          className="mt-1 text-xs underline focus:outline-none"
          style={{ color: 'var(--text3)' }}
        >
          {t('tags.manageLink')}
        </button>
      )}
    </div>
  )
}
