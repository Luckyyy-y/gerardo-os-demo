# Verification record

Checked on October 3, 2026 using Node.js 24.19.0 in an isolated working copy. The existing installed dependency set was reused for these checks; a fresh `npm ci` installation has not been independently verified here. Screenshots were captured from the running desktop sample-data demo.

| Check | Result | Scope |
| --- | --- | --- |
| `npm run typecheck` | Passed | TypeScript project, including retained reference source |
| `npm run test:integrations` | 22 passed, 0 failed | Planner, parser, storage, route checks, and mocked provider behavior |
| `npm run build` | Passed | Static client production bundle |
| Public demo bundle review | Passed | Live clients and private production routing identifiers excluded |
| Desktop browser checks | Passed for checked flows | Page navigation, task completion, undo, transaction search |
| Other browser checks | Pending | Mobile, full keyboard navigation, timer, reset, storage-denied recovery |
| Offline reload and PWA install | Pending | Browser/device dependent behavior |
| Live Canvas/Plaid/Spotify/D1 | Not exercised | Disabled in public demo |

Build output includes a client chunk above Vite's 500 kB warning threshold (approximately 527 kB before compression). Splitting heavy views is a future performance improvement; the warning does not prevent the build.

## What the 22 tests cover

- Planner ordering for urgency, difficulty, available time, and energy.
- Recurring deadlines, the 12-hour undo boundary, previous-date restoration, and completion ordering.
- Calendar line normalization, timezone/all-day values, stable IDs, idempotent merging, rejected input, redirects, and retry/fallback scenarios.
- Pending/posted transaction normalization and transfer exclusion.
- Owner isolation, encrypted records, compare-and-swap updates, and encryption-key mismatch handling.
- Incomplete bank configuration and failed sync-page cursor preservation.
- API identity checks and cross-site write rejection.
- Spotify client-ID and resource-URL validation.

The test harness supplies fake database behavior and mocked network responses. It does not connect to school records or financial accounts, and it is not end-to-end authentication testing.

## Reproduce

```bash
npm ci
npm run typecheck
npm run test:integrations
npm run build
npm run preview
```

## Browser checks to add

Use fictional entries. Complete and undo a recurring task; change planner time/energy; start, pause, and reset focus; create a capture; search sample transactions; customize and reload; reset and verify fixtures return. Repeat at a narrow viewport and with keyboard navigation.

Check storage-denied behavior and malformed saved data separately. Current startup guards basic workspace shape, but full nested validation and recovery are future work. Test offline reload after a successful online production visit; do not treat the cache implementation alone as proof of offline support.
