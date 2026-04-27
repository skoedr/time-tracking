import { useEffect, useRef, useState } from 'react'
import { deserializeTags, parseTagInput, serializeTags } from '../../../shared/tags'
import { useT } from '../contexts/I18nContext'

interface Props {
  /** Serialized tags value from the DB (`,bug,ux,` format). */
  value: string
  onChange: (serialized: string) => void
  disabled?: boolean
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

/**
 * Tag chip list + text input with Tab/Enter/comma to add, Backspace to
 * remove, and autocomplete dropdown populated from `tags:recent` IPC.
 *
 * Stores tags as the serialized DB format (`,tag1,tag2,`) via `onChange`.
 */
export function TagInput({ value, onChange, disabled = false }: Props): React.ReactElement {
  const t = useT()
  const tags = deserializeTags(value)
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [allRecent, setAllRecent] = useState<string[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load recent tags once on mount
  useEffect(() => {
    window.api.tags.recent().then((res) => {
      if (res.ok) setAllRecent(res.data)
    })
  }, [])

  // Filter suggestions based on current input
  useEffect(() => {
    const q = inputValue.trim().toLowerCase().replace(/^#/, '')
    if (!q) {
      setSuggestions(allRecent.filter((t) => !tags.includes(t)).slice(0, 8))
    } else {
      setSuggestions(
        allRecent
          .filter((t) => t.startsWith(q) && !tags.includes(t))
          .slice(0, 8)
      )
    }
    setHighlightedIndex(-1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, allRecent, value])

  function commitInput(raw: string): void {
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
        commitInput(suggestions[highlightedIndex])
      } else {
        commitInput(inputValue)
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
                commitInput(s)
              }}
              className={`cursor-pointer px-3 py-1 text-xs ${
                i === highlightedIndex
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-white/10'
              }`}
              style={i !== highlightedIndex ? { color: 'var(--text)' } : undefined}
            >
              #{s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
