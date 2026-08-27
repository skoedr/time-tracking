# Privacy

TimeTrack stores all data **exclusively locally** on your device.
There is no cloud sync, no accounts, and no server of its own.

## Where is the data?

| Type          | Path (Windows)                             | Path (macOS)                                                  |
| ------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Database      | `%AppData%\time-tracking\timetrack.sqlite` | `~/Library/Application Support/time-tracking/timetrack.sqlite` |
| Settings      | `%AppData%\time-tracking\timetrack.sqlite` | (same DB)                                                      |
| Log files     | `%AppData%\time-tracking\logs\`            | `~/Library/Logs/time-tracking/`                                |
| PDF exports   | Freely chosen location                     | Freely chosen location                                        |

You can back up or delete the database at any time. A backup export
is available via _Settings → Backup_.

## Network communication

TimeTrack makes exactly **one** outbound HTTPS request:

```
GET https://api.github.com/repos/wald-it/time-tracking/releases/latest
```

This call checks on app start whether a new version is available
(auto-updater via `electron-updater`). It contains no user identifiers,
no device data, and no time entries. It can be prevented by disabling
the auto-updater in the settings.

## No tracking

- No telemetry service (e.g. Sentry, Mixpanel, Amplitude)
- No analytics (e.g. Google Analytics, Plausible)
- No crash reporter to third parties
- No advertising, no monetization via user data

## Third-party dependencies

All open-source libraries used and their licenses are listed in
`resources/licenses.json` (reachable via _Help → Licenses_).
None of these libraries makes network connections itself.

## Contact

Privacy questions: robin.wald@hotmail.de
