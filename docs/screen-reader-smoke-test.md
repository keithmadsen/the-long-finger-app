# Screen-Reader Smoke Test (scripted manual gate)

**Standing: GATING before each release** (ux-design-specification.md CI gate 6: "Manual
screen-reader smoke test. NVDA on Windows + VoiceOver on macOS, scripted, before each
release."). A release candidate does not ship until both legs below have a recorded
passing run against it (Story 3.2 AC 4).

- **VoiceOver leg (macOS)** — runnable on the primary dev machine. Canonical pairing:
  **Safari + VoiceOver** (Chromium's VO support is good but announce timing differs;
  record whichever browser you use).
- **NVDA leg (Windows)** — requires a Windows environment. Per the Story 3.2 decision,
  the first recorded NVDA run lands with the release candidate (Story 3.5 timeframe).
  **Status: pending first run.**

## The two named pass criteria (both must hold for a passing run)

1. **Pending → settled transitions announce correctly** — every create/toggle/delete is
   silent while pending (rows are `aria-busy`, nothing spoken) and announces exactly
   once when the backend confirms.
2. **No announcement storm during burst capture** — adding several tasks quickly never
   queues, stacks, or concatenates announcements; each confirmation lands alone.

## Environment capture (record per run — SM-1)

| Field | Value |
|---|---|
| Date | |
| OS + version | |
| Browser + version | |
| AT + version | |
| App build/commit | |
| Runner | |

## Setup

1. Start the app (`npm run dev`, open `http://localhost:5173`) with an **empty list**
   (delete leftovers or point the API at a fresh `DATABASE_PATH`).
2. Start the screen reader (VoiceOver: `Cmd+F5`; NVDA: `Ctrl+Alt+N`).
3. Keyboard only from here — no mouse/trackpad.

## Script

Expected utterances are quoted. Phrasing varies slightly by AT (role/state order); the
**quoted app-supplied text must be present verbatim**. Mark each step pass/fail.

### 1. Load — title + structure discovery (empty list)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1a | Load the app | Window/page title is "the long finger". Nothing is announced spontaneously after load settles — the transient "Loading…" and the empty state ("Your list will appear here.") are plain text, NOT self-announcing (AC 3). | |
| 1b | Navigate the page top-to-bottom (VO: `VO+→`; NVDA: `↓`) | One main landmark; the instruction line "Type a task and press Enter to add it to your list."; the capture input, placeholder "What do you want to do?". No other landmarks, no stray live regions. | |

### 2. Burst-add 3 tasks (pass criterion 2)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 2a | In the input type `milk`, press Enter; **immediately** type `bread`, Enter; type `eggs`, Enter — do not wait between them | While a create is pending, NOTHING is announced (announce on confirm, never on submit). | |
| 2b | Let them settle | Each confirmation is spoken on its own as it lands: "milk added.", "bread added.", "eggs added." — one at a time, no queue/stack/concatenation, no storm. Focus stays in the input throughout. | |

### 3. Toggle complete + active (pass criterion 1)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 3a | `Tab` to the first row (`eggs`) | The row's checkbox + label are announced with the task description (e.g. "eggs, checkbox, not checked"). | |
| 3b | Toggle it (`Space` on the checkbox / VO: `VO+Space`) | Silent while pending (row is `aria-busy`; AT may say "busy" on re-focus — acceptable). On confirm exactly one announcement: "eggs marked complete." | |
| 3c | Toggle it back | On confirm exactly one announcement: "eggs marked active." The row does not move position. | |

### 4. Keyboard-only two-step delete + focus never stranded

| # | Action | Expected | Pass? |
|---|---|---|---|
| 4a | On the `eggs` row, `Tab` to its delete affordance | Accessible name: "Delete 'eggs'". | |
| 4b | Press `Enter`/`Space` once (arm) | Name changes to: "Confirm deletion of 'eggs', press again within 5 seconds to delete". (State change on the focused control — NVDA/VO re-announce the new name.) | |
| 4c | Wait ≥ 5 s without pressing | Auto-disarm: name reverts to "Delete 'eggs'". No announcement fires. | |
| 4d | Arm again, wait ~1 s, press again (confirm) | Silent while committing (`aria-busy`), then exactly one announcement: "eggs deleted." Focus lands on the **adjacent row** (`bread`) — never dropped to the page body (AC 4 "focus never stranded"). | |
| 4e | Press `Escape` on a row anchor | Focus returns to the capture input. | |

### 5. Create failure — announce once, describedby, retry re-announce

Stop the API (`Ctrl+C` the `dev:api` process, or kill port 3001) to force failures.

| # | Action | Expected | Pass? |
|---|---|---|---|
| 5a | Type `call mum`, press Enter | Exactly one announcement: "Couldn’t save ‘call mum’. Use Retry to try again." The failed row appears with Retry and Dismiss buttons. | |
| 5b | `Tab` to the failed row and read it (VO: `VO+→`) | The described-by help text is discoverable on the failed row: "Your typed text is saved here until you retry, dismiss, or refresh." | |
| 5c | Activate **Retry** (API still down) | The failure announcement is spoken **again** for this new attempt (a distinct event with identical text — the LiveRegion re-announce fix). A repeated failure of the *same* attempt does not double-announce. | |
| 5d | Restart the API, activate **Retry** | Announcement: "call mum added." The row settles to a normal row. | |

### 6. Identical-consecutive delete (AC 5 on real AT)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 6a | Add two tasks with the SAME text: `dup`, `dup` | Two "dup added." announcements (one per confirm). | |
| 6b | Delete the first `dup` (arm → confirm) | "dup deleted." | |
| 6c | Immediately delete the second `dup` | "dup deleted." is spoken **again** — the identical consecutive message is NOT silently dropped. The zero-width nonce must be inaudible (if the AT ever reads "zero width space", escalate: the fallback is clear-then-set, see story 3.2 Dev Notes). | |

### 7. Empty / loading states do not self-announce (AC 3)

| # | Action | Expected | Pass? |
|---|---|---|---|
| 7a | Delete any remaining tasks, then reload the page | Neither "Loading…" nor "Your list will appear here." is announced spontaneously — both are plain text reachable only by navigation. The delete that emptied the list moves focus to the capture input (not stranded). | |

## Recorded runs

### VoiceOver leg

| Date | Environment | Result | Notes |
|---|---|---|---|
| — | — | **pending first run** | Per review decision 2026-07-10: recorded against the release candidate alongside the NVDA leg (Story 3.2 closed on the scripted artifact + automated evidence — jsdom DOM mechanics + browser-level e2e spec). |

### NVDA leg

| Date | Environment | Result | Notes |
|---|---|---|---|
| — | — | **pending first run** | Scheduled for the release candidate (Story 3.5 timeframe) per Story 3.2 decision — needs a Windows environment. |
