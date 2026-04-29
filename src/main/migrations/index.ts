import { migration001 } from './001-initial'
import { migration002 } from './002-v11-settings'
import { migration003 } from './003-v12-data'
import { migration004 } from './004-v13-pdf-template'
import { migration005 } from './005-v13-link-id'
import { migration006 } from './006-v14-mini-widget'
import { migration007 } from './007-v14-tags'
import { migration008 } from './008-v15-onboarding'
import { migration009 } from './009-v18-reference'
import { migration010 } from './010-v18-billable-private-note'
import { migration011 } from './011-v18-theme'
import { migration012 } from './012-v19-projects'

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
export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012
].sort((a, b) => a.version - b.version)
