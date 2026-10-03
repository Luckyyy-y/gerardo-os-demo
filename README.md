# Gerardo OS — portfolio demo

A personal dashboard that brings tasks, coursework, focus sessions, finances, and quick notes into one workspace.

**This is a separate public demo with fictional data.** It stores edits in your browser and does not connect to my private workspace, school account, bank accounts, or Spotify. The original application remains separate.

## Why I built it

I wanted one place to see what needs attention and decide what to work on next. Gerardo OS explores how a personal dashboard can connect academic planning, a focus timer, and an inbox for ideas without requiring a different app for each step.

The portfolio copy lets someone try those workflows without accessing my accounts. The retained integration source also makes the engineering decisions reviewable.

## Try it locally

Use Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production build:

```bash
npm run build
npm run preview
```

No `.env` file, API key, database, or sign-in is required. **Reset demo** restores the fictional starting workspace. Browser storage is for demo edits; avoid entering sensitive information. Clearing browser data also clears those edits.

## Walk through the demo

1. On **Today**, complete a sample task, then undo it from recent completions.
2. Open **Next Move** and change your available time and energy to see how suggestions change.
3. Start a focus session from a suggested task, then pause or reset the timer.
4. In **Academics**, edit a course or move a task to another calendar day.
5. In **Finances**, add a fictional expense and search the transaction list.
6. In **Second brain**, capture an idea and turn it into a next action.
7. Change the accent or density in **Customize**, reload, then use **Reset demo**.

All displayed balances, course progress, projects, deadlines, and graduation countdown values are demo fixtures. They are not evidence of my finances, grades, employment, or project completion.

## What works here

| Area | Public demo | Retained private-app source |
| --- | --- | --- |
| Tasks and Next Move | Local editing, ranking, recurring completion, undo | Same planner logic |
| Focus timer and habits | Interactive browser UI | Same UI foundation |
| Academics | Sample courses, local tasks, calendar | Canvas calendar parsing and import |
| Finances | Fictional balances and manual entries | Plaid linking, transaction sync, encrypted records |
| Second brain | Local captures and organization | Same local workspace model |
| Workspace storage | Browser localStorage only | Authenticated Worker API and Cloudflare D1 |
| Spotify | Explicitly disabled | OAuth PKCE and playback controls |
| GitHub activity | Static sample project cards | Live activity intentionally removed from demo |
| PWA | Manifest and static shell cache | Separate private-app caching behavior |

## Engineering notes

- [Architecture and trust boundaries](docs/architecture.md)
- [Project case study and decisions](docs/case-study.md)
- [Verification and limitations](docs/verification.md)
- [Private integration setup reference](docs/connections.md)

The demo entry point is `demo/main.tsx`. Vite builds the client app only. `worker/`, `app/api/`, `db/`, `lib/server/`, and `reference/integrations/` are retained for source review and offline tests; they are not deployed by `npm run build`.

## Check the project

```bash
npm run typecheck
npm run test:integrations
npm run build
```

The retained suite currently passes **22 tests**. External service responses and database access are mocked; those tests do not prove a live bank, Canvas, Spotify, or Cloudflare connection. See the verification document for the exact scope.

## Evidence and next steps

This repository provides runnable source, automated checks, architecture notes, and a documented demo walkthrough. A recorded walkthrough and application screenshots are planned; none are presented as completed evidence yet. Live account access stays outside the public demo.

Useful next improvements include browser workflow tests, deeper validation of saved state, smaller client bundles, and a clearer recovery path when browser storage is unavailable.

## Ownership and tools

Project owner: **Gerardo Vera**, Computer Information Systems student at the University of Houston. This demo was adapted from my separate Gerardo OS application with AI-assisted implementation, documentation, and verification. Third-party components and dependencies retain their own licenses; the vendored shadcn stylesheet attribution is included in `vendor/`.

This copy starts with fresh repository history. It does not carry private deployment configuration, credentials, user records, or the original application's Git history.
