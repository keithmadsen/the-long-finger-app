---
title: 'Split App.test.tsx per story with shared stateful server double'
type: 'refactor'
created: '2026-07-14'
status: 'done'
route: 'one-shot'
---

# Split App.test.tsx per story with shared stateful server double

## Intent

**Problem:** `apps/web/src/App.test.tsx` had grown to 1,439 lines (4.8× the 300-line guideline) and its stateful fetch doubles had accreted as verbatim duplicates (`stubFailingCreate` ×2, deferred-DELETE `stubServer` ×2, `commitDelete`/`commitDeleteOn`, a shadowed `okResponse`) — a behavior fix applied to one copy and not its twin produces tests that pass for the wrong reason (test-quality review finding #2, P1).

**Approach:** Split the seven self-contained describes into per-story `App.<topic>.test.tsx` files (matching the existing `App.axe` / `App.firstInteractive` convention) and extract the duplicated doubles into `src/test/todoServer.ts` (parameterized stateful GET/POST/PATCH/DELETE double with per-suite `allow` tripwires and deferred-DELETE release) and `src/test/appHelpers.ts` (shared app copy constants, `instructionWrap`, fake-timer-safe `commitDelete`). All 38 original tests preserved verbatim; adversarial-review hardening applied (method allowlist, try/finally timer restore, throwing `releaseDelete`, unknown-id PATCH throw).

## Suggested Review Order

**The shared stateful server double**

- One parameterized double replaces four drifted copies; `allow` restores the lost unexpected-method tripwires
  [`todoServer.ts:50`](../../apps/web/src/test/todoServer.ts#L50)

- Deferred DELETE keeps the Committing (aria-busy) state observable; release throws on misuse instead of no-opping
  [`todoServer.ts:110`](../../apps/web/src/test/todoServer.ts#L110)

**Shared App-copy constants and interaction helpers**

- Copy strings centralized so suites can't drift onto stale text independently
  [`appHelpers.ts:8`](../../apps/web/src/test/appHelpers.ts#L8)

- `commitDelete` unifies `commitDelete`/`commitDeleteOn`; try/finally guarantees real timers survive a red assertion
  [`appHelpers.ts:31`](../../apps/web/src/test/appHelpers.ts#L31)

**The split suites (each ≤251 lines, own beforeEach/afterEach)**

- Base surface states keep the `App.test.tsx` name; GET-only default means any mutation now throws
  [`App.test.tsx:13`](../../apps/web/src/App.test.tsx#L13)

- Delete suite: first test keeps the inline arm sequence (it asserts the armed state itself); the rest use `commitDelete`
  [`App.delete.test.tsx:24`](../../apps/web/src/App.delete.test.tsx#L24)

- Keyboard-nav focus-follow reuses the same DELETE-deferred double with `focusDeleteButton` keyboard parity
  [`App.keyboardNav.test.tsx:168`](../../apps/web/src/App.keyboardNav.test.tsx#L168)

- Capture / toggle / failed-create / unread-errors / screen-reader suites; bespoke one-off doubles stay suite-local by design
  [`App.capture.test.tsx:11`](../../apps/web/src/App.capture.test.tsx#L11), [`App.toggle.test.tsx:9`](../../apps/web/src/App.toggle.test.tsx#L9), [`App.failedCreate.test.tsx:11`](../../apps/web/src/App.failedCreate.test.tsx#L11), [`App.unreadErrors.test.tsx:14`](../../apps/web/src/App.unreadErrors.test.tsx#L14), [`App.screenReader.test.tsx:11`](../../apps/web/src/App.screenReader.test.tsx#L11)

**Straggler dedup (review finding: extraction stopped one file short)**

- Pre-existing suites migrated onto the shared helpers instead of private copies
  [`App.firstInteractive.test.tsx:6`](../../apps/web/src/App.firstInteractive.test.tsx#L6), [`App.axe.test.tsx:9`](../../apps/web/src/App.axe.test.tsx#L9)
