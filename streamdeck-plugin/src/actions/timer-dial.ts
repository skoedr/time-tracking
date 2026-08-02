/**
 * "Timer dial" encoder action (#186) — Stream Deck + wheel and touch strip.
 *
 * Idle the slot shows the two numbers from TimeTrack's "Heute" page; turning
 * the wheel walks the client/project list; a press starts (or stops) the
 * shown target; a long press starts the same client *without* a project,
 * which is why clients that have projects do not appear on their own.
 *
 * All state comes from the app's local bridge — the plugin never reads the
 * database. Polling, not pushing: the bridge is request/response.
 */
import { action, SingletonAction } from '@elgato/streamdeck'
import streamDeck from '@elgato/streamdeck'
import type {
  DialAction,
  DialDownEvent,
  DialRotateEvent,
  DialUpEvent,
  TouchTapEvent,
  WillAppearEvent,
  WillDisappearEvent
} from '@elgato/streamdeck'
import { getSummary, listTargets, toggleTimer, type Summary } from '../bridge'
import { dialImage, FEEDBACK_KEY, type DialFace, type DialLabel } from '../dialImage'
import {
  buildTargets,
  clientOnly,
  createPressGesture,
  displayTotals,
  elapsedSeconds,
  indexOfKey,
  isRunning,
  step,
  type DialTarget,
  type PressGesture
} from '../dialModel'

export type DialSettings = {
  /** Selected entry, anchored by key so the list can change underneath it. */
  selected?: string
  [key: string]: string | number | null | undefined
}

/** Bridge poll for the running timer and the totals. */
const POLL_MS = 2000
/** The list of clients/projects changes rarely; no reason to poll it as often. */
const TARGETS_MS = 30_000
/** Render tick — advances the ring and the elapsed time between polls. */
const RENDER_TICK_MS = 1000
/** How long the wheel stays on the selection before falling back to the stats. */
const BROWSE_MS = 4000
/** Held longer than this ⇒ start the client without a project. */
const LONG_PRESS_MS = 500
/** Rotations arrive in bursts; do not write settings on every tick. */
const SAVE_DELAY_MS = 400

interface DialState {
  index: number
  /** Selection is shown until this timestamp, then the stats come back. */
  browseUntil: number
  gesture: PressGesture
  saveTimer: NodeJS.Timeout | null
  /** Current selection; null until the wheel was turned (then settings rule). */
  selectedKey: string | null
  /** Selection key waiting to be written; flushed if the dial disappears. */
  pending: string | null
  /**
   * The dial instance, kept for the flush on disappear: `willDisappear` hands
   * out an ActionContext, which cannot write settings.
   */
  dial: DialAction<DialSettings> | null
  lastRenderKey: string
}

@action({ UUID: 'com.timetrack.streamdeck.dial' })
export class TimerDial extends SingletonAction<DialSettings> {
  private pollTimer: NodeJS.Timeout | null = null
  private targetsTimer: NodeJS.Timeout | null = null
  private renderTimer: NodeJS.Timeout | null = null
  /** Shared across dials — one bridge answer feeds every visible slot. */
  private summary: Summary | 'unavailable' = 'unavailable'
  private targets: DialTarget[] = []
  private states = new Map<string, DialState>()

  override async onWillAppear(ev: WillAppearEvent<DialSettings>): Promise<void> {
    if (!ev.action.isDial()) return
    this.ensureState(ev.action.id, ev.action)
    this.ensureTimers()
    await this.refreshTargets()
    await this.refreshSummary()
  }

  override async onWillDisappear(ev: WillDisappearEvent<DialSettings>): Promise<void> {
    const state = this.states.get(ev.action.id)
    if (state) {
      // Send the debounced write NOW instead of dropping it: turning the wheel
      // and immediately switching profile would otherwise lose the selection.
      // The action is gone from `this.actions`, but settings are addressed by
      // context, and Stream Deck stores them for an invisible instance too.
      if (state.saveTimer) {
        clearTimeout(state.saveTimer)
        state.saveTimer = null
        if (state.pending && state.dial) await state.dial.setSettings({ selected: state.pending })
      }
      state.gesture.cancel()
      this.states.delete(ev.action.id)
    }
    // Enumerable has no cheap "size"; stop the timers when nothing is left.
    let any = false
    for (const _ of this.actions) {
      any = true
      break
    }
    if (!any) this.stopTimers()
  }

  override async onDialRotate(ev: DialRotateEvent<DialSettings>): Promise<void> {
    const state = this.ensureState(ev.action.id, ev.action)
    // Turning while pressed is a different gesture — nothing may start when
    // the wheel is released.
    state.gesture.cancel()
    if (this.targets.length === 0) {
      await this.render(ev.action, state)
      return
    }
    state.index = step(state.index, ev.payload.ticks, this.targets.length)
    state.browseUntil = Date.now() + BROWSE_MS
    this.persist(ev.action, state)
    await this.render(ev.action, state)
  }

  override onDialDown(ev: DialDownEvent<DialSettings>): void {
    const state = this.ensureState(ev.action.id, ev.action)
    state.gesture.down()
  }

  override async onDialUp(ev: DialUpEvent<DialSettings>): Promise<void> {
    const state = this.ensureState(ev.action.id, ev.action)
    if (state.gesture.up()) await this.toggle(ev.action, state, false)
  }

  override async onTouchTap(ev: TouchTapEvent<DialSettings>): Promise<void> {
    const state = this.ensureState(ev.action.id, ev.action)
    // The touch strip reports the hold itself, so the strip needs no timer of
    // its own — but it means the same thing as on the wheel.
    await this.toggle(ev.action, state, ev.payload.hold === true)
  }

  // ── actions ──────────────────────────────────────────────────────────────

  /**
   * Toggle the selected target, or — on a long press — the same client
   * without a project. Toggle, not start: pressing the entry that is already
   * running stops it, exactly like the keys.
   */
  private async toggle(
    dial: DialAction<DialSettings>,
    state: DialState,
    long: boolean
  ): Promise<void> {
    const selected = this.targets[state.index]
    if (!selected) {
      await dial.showAlert()
      return
    }
    const target = long ? clientOnly(selected) : selected
    const res = await toggleTimer(target.clientId, target.projectId)
    if (!res.ok) {
      streamDeck.logger.warn(`dial toggle failed: ${res.error}`)
      await dial.showAlert()
      return
    }
    // Straight back to the ambient face: after a press the interesting thing
    // is the running timer, not the list position.
    state.browseUntil = 0
    await this.refreshSummary()
  }

  // ── polling ──────────────────────────────────────────────────────────────

  private ensureTimers(): void {
    if (!this.pollTimer) this.pollTimer = setInterval(() => void this.refreshSummary(), POLL_MS)
    if (!this.targetsTimer) {
      this.targetsTimer = setInterval(() => void this.refreshTargets(), TARGETS_MS)
    }
    if (!this.renderTimer) {
      this.renderTimer = setInterval(() => void this.renderAll(), RENDER_TICK_MS)
    }
  }

  private stopTimers(): void {
    for (const t of [this.pollTimer, this.targetsTimer, this.renderTimer]) {
      if (t) clearInterval(t)
    }
    this.pollTimer = null
    this.targetsTimer = null
    this.renderTimer = null
  }

  private async refreshSummary(): Promise<void> {
    this.summary = await getSummary()
    await this.renderAll()
  }

  private async refreshTargets(): Promise<void> {
    const clients = await listTargets()
    // A failed call keeps the previous list: the offline face is driven by the
    // summary poll, and dropping the list would also drop the selection.
    if (clients === null) return
    this.targets = buildTargets(clients)
    // Re-anchor every dial on its key — a project added or archived above the
    // selection must not slide it onto a neighbour.
    for (const a of this.actions) {
      if (!a.isDial()) continue
      const state = this.ensureState(a.id, a)
      // Live selection first, stored one only until the wheel has been turned:
      // reading settings here would otherwise undo a rotation whose debounced
      // write has not landed yet.
      const key = state.selectedKey ?? (await a.getSettings()).selected
      state.index = indexOfKey(this.targets, key)
    }
  }

  // ── rendering ────────────────────────────────────────────────────────────

  private async renderAll(): Promise<void> {
    for (const a of this.actions) {
      if (!a.isDial()) continue
      await this.render(a, this.ensureState(a.id))
    }
  }

  private async render(dial: DialAction<DialSettings>, state: DialState): Promise<void> {
    const face = this.faceFor(state)
    // setFeedback only on change — an idle slot costs nothing per tick.
    const key = renderKey(face)
    if (state.lastRenderKey === key) return
    state.lastRenderKey = key
    await dial.setFeedback({ [FEEDBACK_KEY]: dialImage(face) })
  }

  private faceFor(state: DialState): DialFace {
    if (this.summary === 'unavailable') return { state: 'offline' }
    const selected = this.targets[state.index]
    const running = this.summary.running
    const browsing = Date.now() < state.browseUntil

    if (browsing && selected) {
      return {
        state: 'browse',
        label: labelOf(selected),
        position: `${state.index + 1}/${this.targets.length}`,
        progress: this.targets.length < 2 ? 1 : state.index / (this.targets.length - 1),
        color: selected.color,
        running: isRunning(selected, running)
      }
    }

    if (running) {
      return {
        state: 'running',
        label: { client: running.client_name, project: running.project_name },
        elapsedSec: elapsedSeconds(running.started_at, Date.now()),
        // The running timer may point somewhere the wheel is not on; take the
        // colour from the matching entry, not from the selection.
        color: this.colorForRunning(running.client_id)
      }
    }

    if (!selected) return { state: 'empty' }

    // Display seconds, not raw: the stat cards in the app are rounded.
    const totals = displayTotals(this.summary)
    return {
      state: 'stats',
      todaySeconds: totals.today,
      weekSeconds: totals.week,
      label: labelOf(selected),
      position: `${state.index + 1}/${this.targets.length}`,
      color: selected.color
    }
  }

  private colorForRunning(clientId: number): string | undefined {
    return this.targets.find((t) => t.clientId === clientId)?.color
  }

  // ── plumbing ─────────────────────────────────────────────────────────────

  private ensureState(id: string, dial?: DialAction<DialSettings>): DialState {
    let state = this.states.get(id)
    if (state) {
      if (dial) state.dial = dial
      return state
    }
    state = {
      index: 0,
      browseUntil: 0,
      dial: dial ?? null,
      // The long action fires on reaching the threshold, not on release —
      // the timer starts in the moment you have held long enough, which is
      // the only feedback that the gesture registered.
      gesture: createPressGesture(() => void this.onLongPress(id), LONG_PRESS_MS),
      saveTimer: null,
      selectedKey: null,
      pending: null,
      lastRenderKey: ''
    }
    this.states.set(id, state)
    return state
  }

  /** Resolved late: the dial instance is not known when the state is built. */
  private async onLongPress(id: string): Promise<void> {
    for (const a of this.actions) {
      if (a.id !== id || !a.isDial()) continue
      await this.toggle(a, this.ensureState(id), true)
      return
    }
  }

  /** Rotations arrive in bursts — one write per burst, not one per tick. */
  private persist(dial: DialAction<DialSettings>, state: DialState): void {
    const target = this.targets[state.index]
    if (!target) return
    state.selectedKey = target.key
    state.pending = target.key
    if (state.saveTimer) clearTimeout(state.saveTimer)
    state.saveTimer = setTimeout(() => {
      state.saveTimer = null
      const key = state.pending
      state.pending = null
      if (key) void dial.setSettings({ selected: key })
    }, SAVE_DELAY_MS)
  }
}

function labelOf(t: DialTarget): DialLabel {
  return { client: t.clientName, project: t.projectName }
}

/**
 * Identity of a rendered frame. Everything the face draws has to appear here —
 * a value that changes without changing the key would freeze on the strip.
 */
export function renderKey(face: DialFace): string {
  switch (face.state) {
    case 'offline':
      return 'offline'
    case 'empty':
      return 'empty'
    case 'running':
      // Per second: the ring advances and the pulse breathes.
      return `running|${Math.floor(face.elapsedSec)}|${face.label.client}|${face.label.project ?? ''}|${face.color ?? ''}`
    case 'browse':
      return `browse|${face.position}|${face.label.client}|${face.label.project ?? ''}|${face.color ?? ''}|${face.running}`
    default:
      return `stats|${face.todaySeconds}|${face.weekSeconds}|${face.position}|${face.label?.client ?? ''}|${face.label?.project ?? ''}|${face.color ?? ''}`
  }
}
