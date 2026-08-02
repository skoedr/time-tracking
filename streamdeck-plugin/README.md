# TimeTrack Stream Deck plugin

Two actions:

**Toggle timer** (keypad, #133) — one key = one timer target. Each key is
configured with a client (and optionally one of its projects) and toggles the
TimeTrack timer for exactly that target. The key face shows the live timer
state (polled every 2 s while visible).

**Timer dial** (encoder, Stream Deck +, #186) — one dial reaches every target,
no configuration at all:

| Gesture | Effect |
| --- | --- |
| idle | today + this week, exactly the numbers the app's *Heute* page shows, plus the entry a press would start |
| turn | walk the list of projects, and of clients that have none |
| press (on release) | start the shown target — or stop it, if it is the one running |
| press and hold (0.5 s) | start the same **client without a project** |
| tap / long-tap the strip | same as short / long press |
| while a timer runs | client, project, elapsed time, the minute ring and the pulse — the running face of the keys, on the strip |

A client that has projects does **not** appear on its own in the list: its
project-less timer is what the long press is for. That keeps the list as short
as the number of things you actually book on.

After a rotation the selection stays on screen for 4 s, then the ambient face
comes back. The selection itself is remembered per dial (anchored by client and
project id, not by position, so adding or archiving a project elsewhere does
not move it).

The plugin talks to the running TimeTrack app through the local control bridge
(named pipe on Windows, unix socket on macOS) using the **controller token** —
it never touches the database. Enable the scope in TimeTrack under
**Settings → Integrations → Hardware keys**.

## Build

```
pnpm install --ignore-workspace
pnpm typecheck
pnpm build        # bundles src/ into com.timetrack.streamdeck.sdPlugin/bin/
```

## Install for development (no marketplace, no review)

Link the `.sdPlugin` directory into the Stream Deck app once:

```
npx @elgato/cli link com.timetrack.streamdeck.sdPlugin
```

…or pack a double-click installer:

```
npx @elgato/cli pack com.timetrack.streamdeck.sdPlugin
```

Requires Stream Deck app ≥ 7.1 (Windows 10+/macOS 10.15+). No physical Stream
Deck needed for testing: the Stream Deck Mobile app (free tier, 6 keys) acts as
the key surface while the plugin runs in the desktop app.

## Architecture notes

- Protocol/paths mirror `src/mcp/socketPath.ts` in the app: pipe
  `\\.\pipe\timetrack-mcp` (Windows) or `<userData>/mcp.sock` (macOS), token
  `<userData>/controller.token`, userData dir `time-tracking` (the Electron
  `app.getName()`, NOT `TimeTrack`).
- Controller ops (`toggle_timer`, `get_timer_status`, `list_targets`,
  `get_summary`) are token-scoped separately from the MCP write ops — see
  `src/main/mcpBridgeCore.ts` in the app repo.
- Timer labels are rendered into the SVG key image, not via `setTitle`: a
  user-defined title always beats a runtime title.
- The dial's today/week numbers come from `readTotals()` in
  `src/main/dashboardTotals.ts` — the same function the app's `dashboard:summary`
  IPC handler uses, so the strip cannot drift away from the app window.
  `get_summary` sends the raw seconds **and** the display seconds (raw rounded
  up to `pdf_round_minutes`, the same rounding the stat cards apply). The strip
  shows the display ones; showing the raw ones is what made the first hardware
  run read 6:24 against the app's 6:30. An app older than that answers without
  those fields — `displayTotals()` then falls back to raw, because plugin and
  app are installed separately and can be out of step.
- The touch strip is one full-bleed SVG in the layout's single `canvas` pixmap,
  not a set of text items: the faces place their text differently per state and
  a layout cannot switch geometry. Feedback keys are a contract with
  `layouts/dial.json` — a key the layout does not know is dropped **silently**,
  which on the device is indistinguishable from a broken plugin, so
  `dialImage.test.ts` checks both sides against each other.
- Hardware rules are the same on both surfaces: one static frame per render, no
  SMIL, no `pathLength`. The ring and the pulse are advanced frame-by-frame by a
  1 Hz tick, and `setFeedback`/`setImage` only run when the rendered frame
  actually changed.

## Tests

The pure modules (`dialModel.ts`, `dialImage.ts` and the layout contract) run in
the app repo's suite as the `streamdeck` project:

```
pnpm test                          # in the repo root — includes this project
pnpm test -- --project streamdeck  # only these
```
