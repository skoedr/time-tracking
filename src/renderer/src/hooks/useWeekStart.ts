import { useSettingsStore } from '../store/settingsStore'
import { parseWeekStart, type WeekStart } from '../../../shared/weekStart'

/**
 * The configured week start (#188). Selector-scoped, so a view only re-renders
 * when this key changes — same pattern as RoundingContext reads
 * `pdf_round_minutes`.
 */
export function useWeekStart(): WeekStart {
  return parseWeekStart(useSettingsStore((s) => s.settings?.week_start))
}
