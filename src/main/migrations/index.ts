import { migration001 } from './001-initial'
import { migration002 } from './002-v11-settings'

export interface Migration {
  /** Monotonically increasing integer. Never reused, never reordered. */
  version: number
  /** Short human-readable name. Used in logs and backup filenames. */
  name: string
  /** Raw SQL executed inside a transaction. Must be idempotent-safe. */
  up: string
}

/**
 * All migrations in order. New migrations must be APPENDED, never inserted
 * in the middle. Once shipped, a migration is immutable.
 */
export const migrations: Migration[] = [migration001, migration002].sort(
  (a, b) => a.version - b.version
)
