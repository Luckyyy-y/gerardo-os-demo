# Gerardo OS project case study

## Problem and scope

Tasks, due dates, ideas, and spending can become disconnected when they live in separate tools. The project explores a single personal workspace with a suggested next action and a way to begin a focused work session.

The public portfolio version preserves those local workflows while separating them from account integrations. It is a demonstration of the application and its engineering choices, not a production service for other people's financial or school records.

## My contribution

I own the project direction: what the workspace should help me do, the workflows it prioritizes, and the choice to publish a separate fictional-data demo. Implementation, documentation, and checks have been developed with AI assistance. This repository does not claim that all source was written without assistance or that sample course/project progress represents real results.

## Technologies

The demo uses React, TypeScript, Vite, Tailwind CSS, reusable UI components, and browser storage. Retained private integration code uses a Cloudflare Worker, Access JWT verification, D1/Drizzle, Canvas calendar parsing, Plaid, and Spotify PKCE.

## Decisions and tradeoffs

| Decision | Reason | Tradeoff |
| --- | --- | --- |
| Separate demo with fresh history | Reviewable source without exposing the working workspace or old commits | Demo and private app need separate maintenance |
| Browser-only storage | Anyone can run the demo without account setup | No cross-device sync; clearing storage loses edits |
| Preserve integration code as reference | Explain the actual implementation and regression tests | Source presence does not mean an integration is live |
| Visible sample-data banner and reset | Keep fixtures clearly identified and make exploration reversible | More UI space devoted to demo context |
| Fail-closed private authentication | Avoid trusting a caller-provided owner identity | Private deployment needs correct Access configuration |

## Concrete behavior worth reviewing

### Recurring task undo

Completing a recurring task advances its deadline to the next future occurrence. Undo during the 12-hour window must restore the previous deadline and status, not simply mark the task unfinished. The planner stores the previous due date and completion source status. Tests cover the exact time boundary and recurring-date restoration.

### Calendar imports

Calendar feeds may use folded lines, lone carriage returns, timezone timestamps, or changed event dates. The parser normalizes these formats and tracks stable event identifiers. Merge tests check that a changed due date updates an existing task and repeated imports do not duplicate it.

Retained HTTP handling tests simulate HTML instead of calendar data, unsafe redirects, transient failures, and HTTP 406 fallback paths. Those are regression scenarios; they do not establish a current outage at a school or provider.

### Financial transaction normalization

Pending transactions can later become posted entries with a different identifier. The normalization logic replaces the pending record rather than counting both. Transfers are excluded from spending totals. A failed transaction page must keep the old sync cursor so a retry can fetch the missing changes.

The sample finances page uses manual fictional entries only. Live Plaid behavior is not exercised by this demo.

### Storage isolation

The public app uses its own local key and cache namespace. Reset removes that demo workspace key only. Original authentication and encryption code remains intact in the reference implementation; public mode is created by excluding live integrations, not by making private endpoints accept anonymous callers.

## Results and evidence

The static client builds, TypeScript checks pass, and 22 offline regression tests pass. These are measurable repository checks. There are no claims here about time saved, user adoption, uptime, real transaction accuracy, or live provider reliability.

The README now includes desktop screenshots of Today, Next Move, and sample finances. Task completion, undo, and transaction search were checked in the browser. A short video showing these workflows is still planned. Timer, reset, mobile, and offline checks need further testing.
