## Summary

New i18n infrastructure (PR D, v1.5). No runtime dependencies — locale files are plain TypeScript objects, TypeScript enforces key completeness at compile time.

## What changed

### New: `src/shared/i18n.ts`
Pure `translate(strings, key, vars?)` function. Single-brace interpolation `{variable}`. Falls back to key string when translation is missing.

### New: `src/shared/locales/de.ts`
German locale — source of truth. All keys with `as const`, exposing `TranslationKey` union type.

### New: `src/shared/locales/en.ts`
English locale. Typed as `Record<TranslationKey, string>` — TypeScript compile error if any DE key is missing.

### New: `src/renderer/src/contexts/I18nContext.tsx`
React context: `I18nProvider` + `useT()` + `useLocale()` hooks. Loads saved locale from the existing `language` settings key on mount. `setLocale()` persists via `window.api.settings.set('language', locale)`.

### Modified: `src/renderer/src/main.tsx`
Wraps `<App />` with `<I18nProvider>`.

### Modified: `src/renderer/src/components/UpdateBanner.tsx`
All display strings replaced with `t()` calls. Works identically in DE; switches to EN when locale changes.

### Modified: `src/renderer/src/views/SettingsView.tsx`
- **Language switcher** in "Allgemein" section — replaces the old static `<select>` with one backed by `useLocale().setLocale()`. Change is immediate and persistent.
- **Diagnose section** title + button labels → `t()`.
- **Updates section** title, status labels, button labels → `t()`. `UpdatesSection` sub-component now calls `useT()`.

### New: `src/shared/i18n.test.ts`
11 unit tests: DE/EN translation, fallback, single/multi-variable interpolation, locale completeness (all DE keys in EN), no empty strings, interpolation slot parity check.

### New: `scripts/find-untranslated.mjs`
Heuristic scanner. Lists renderer component files that still contain hardcoded German UI strings. Serves as v1.6 migration backlog. Run with `--verbose` to see matched lines.

### Modified: `CHANGELOG.md`
i18n-Foundation entry added under `[Unreleased] — v1.5`.

## Scope boundary (deliberate)
TimerView, TodayView, CalendarView, ClientsView, and older modal strings remain hardcoded DE in v1.5. `find-untranslated.mjs` lists them as the v1.6 backlog. PR E (Onboarding) and PR F (Licenses) will use `useT()` from the start since those components are new.

## Test results
```
Test Files  16 passed (16)
     Tests  147 passed | 51 skipped (198)
```
`pnpm typecheck` — clean.
