import type { Migration } from './index'

/**
 * #176 — Calendar import: a domain can map to a client AND a project.
 *
 * Real case from the field: a meeting with an end customer's domain is billed
 * via a consulting client, but belongs to that client's project for the end
 * customer. Domain → client alone cannot express that.
 *
 * `ON DELETE SET NULL`, not CASCADE: deleting a project must not tear down the
 * client mapping — the client half stays correct on its own. Deleting the
 * CLIENT still removes the whole row via the existing FK on `client_id`.
 */
export const migration022: Migration = {
  version: 22,
  name: 'v1.17-domain-project',
  up: `
    ALTER TABLE client_domains
      ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
  `
}
