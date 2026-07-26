/**
 * Tests for the tolerant webhook-target parser. Pure — no DB, no network.
 * The point is that a corrupt or hand-edited `webhook_targets` blob must never
 * crash a timer start or the settings view; it degrades to a safe value.
 */
import { describe, it, expect } from 'vitest'
import {
  parseWebhookTargets,
  serializeWebhookTargets,
  isValidWebhookUrl,
  type WebhookTarget
} from './webhooks'

describe('parseWebhookTargets', () => {
  it('returns [] for empty / null / undefined', () => {
    expect(parseWebhookTargets(undefined)).toEqual([])
    expect(parseWebhookTargets(null)).toEqual([])
    expect(parseWebhookTargets('')).toEqual([])
  })

  it('returns [] for broken JSON instead of throwing', () => {
    expect(parseWebhookTargets('{not json')).toEqual([])
    expect(parseWebhookTargets('undefined')).toEqual([])
  })

  it('returns [] when the blob is not an array', () => {
    expect(parseWebhookTargets('{"url":"https://x.test"}')).toEqual([])
    expect(parseWebhookTargets('42')).toEqual([])
  })

  it('drops a target without a usable URL', () => {
    const raw = JSON.stringify([
      { id: 'a', events: ['timer.started'], enabled: true }, // no url
      { id: 'b', url: 'ftp://nope', events: [], enabled: true }, // wrong scheme
      { id: 'c', url: 'https://ok.test', events: ['timer.started'], enabled: true }
    ])
    const parsed = parseWebhookTargets(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].url).toBe('https://ok.test')
  })

  it('drops unknown event names but keeps the target', () => {
    const raw = JSON.stringify([
      {
        id: 'a',
        url: 'https://ok.test',
        events: ['timer.started', 'entry.exploded', 'nonsense'],
        enabled: true
      }
    ])
    const parsed = parseWebhookTargets(raw)
    expect(parsed[0].events).toEqual(['timer.started'])
  })

  it('defaults enabled to false unless it is explicitly true', () => {
    const raw = JSON.stringify([
      { id: 'a', url: 'https://a.test', events: [] }, // missing
      { id: 'b', url: 'https://b.test', events: [], enabled: 'yes' }, // wrong type
      { id: 'c', url: 'https://c.test', events: [], enabled: true }
    ])
    const parsed = parseWebhookTargets(raw)
    expect(parsed.map((t) => t.enabled)).toEqual([false, false, true])
  })

  it('defaults a missing/invalid secret to empty string', () => {
    const raw = JSON.stringify([
      { id: 'a', url: 'https://a.test', events: [], enabled: true },
      { id: 'b', url: 'https://b.test', events: [], enabled: true, secret: 123 }
    ])
    const parsed = parseWebhookTargets(raw)
    expect(parsed.map((t) => t.secret)).toEqual(['', ''])
  })

  it('synthesizes an id when one is missing', () => {
    const raw = JSON.stringify([{ url: 'https://a.test', events: [], enabled: true }])
    const parsed = parseWebhookTargets(raw)
    expect(typeof parsed[0].id).toBe('string')
    expect(parsed[0].id.length).toBeGreaterThan(0)
  })

  it('round-trips a valid list through serialize', () => {
    const list: WebhookTarget[] = [
      {
        id: 'x',
        url: 'https://hook.test/a',
        secret: 's',
        events: ['timer.started', 'entry.updated'],
        enabled: true
      }
    ]
    expect(parseWebhookTargets(serializeWebhookTargets(list))).toEqual(list)
  })
})

describe('isValidWebhookUrl', () => {
  it('accepts http and https, rejects everything else', () => {
    expect(isValidWebhookUrl('https://a.test')).toBe(true)
    expect(isValidWebhookUrl('http://a.test:9000/hook')).toBe(true)
    expect(isValidWebhookUrl('ftp://a.test')).toBe(false)
    expect(isValidWebhookUrl('not a url')).toBe(false)
    expect(isValidWebhookUrl('')).toBe(false)
    expect(isValidWebhookUrl(undefined)).toBe(false)
  })
})
