# TimeTrack Stream Deck plugin (#133)

One key = one timer target. Each key is configured with a client (and optionally
one of its projects) and toggles the TimeTrack timer for exactly that target.
The key face shows the live timer state (polled every 2 s while visible).

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
- Controller ops (`toggle_timer`, `get_timer_status`, `list_targets`) are
  token-scoped separately from the MCP write ops — see
  `src/main/mcpBridgeCore.ts` in the app repo.
- Timer labels are rendered into the SVG key image, not via `setTitle`: a
  user-defined title always beats a runtime title.
