import type { Migration } from './index'

/**
 * v1.12 #105 — Projektspezifischer Ansprechpartner.
 *
 * Adds `contact_person TEXT DEFAULT NULL` to the `projects` table.
 * When set, this value takes precedence over `clients.contact_person`
 * in the PDF recipient block (`effective_contact = project.contact_person ?? client.contact_person`).
 *
 * Nullable — existing projects are unaffected (NULL = fall back to client AP).
 */
export const migration015: Migration = {
  version: 15,
  name: 'v1.12-project-contact-person',
  up: `
    ALTER TABLE projects ADD COLUMN contact_person TEXT DEFAULT NULL;
  `
}
