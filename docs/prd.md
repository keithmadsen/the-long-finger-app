---
title: Todo App PRD
status: final
created: 2026-05-24
updated: 2026-06-15
---

# PRD: Todo App

## 0. Document Purpose

This PRD defines the MVP requirements for a simple full-stack Todo application. It is intended for UX design, architecture, story creation, implementation, and validation workflows. Requirements use stable IDs so downstream artifacts can cite them directly. This update incorporates the findings from `_bmad-output/planning-artifacts/prds/prd-the-long-finger-2026-05-24/validation-report.md`. The 2026-06-15 revision reconciles four amendments raised downstream by the architecture decision document and the UX design specification: canonical ordering / hybrid completed-item placement (FR-1, FR-4, FR-5), the visible-vs-submit character-limit convention (FR-3), and the `POST` client-generated UUIDv7 / `DELETE` idempotency API contracts (FR-10). See `docs/.decision-log.md`.

## 1. Vision

The Todo App helps an individual user capture, review, complete, and delete personal tasks without setup, onboarding, or unnecessary workflow. The first version should feel immediate: opening the app shows the current Todo List, adding a Todo Item takes one short action, and completion status is clear at a glance.

The product prioritizes a clean core task-management loop over advanced planning features. It should be reliable across refreshes and sessions, responsive on desktop and mobile, and simple enough for a future developer to understand and extend.

The MVP deliberately avoids collaboration, accounts, reminders, due dates, priority levels, and notifications. Those features may be considered later, but v1 succeeds only if the core single-user task loop is stable and easy to use.

## 2. Target User

### 2.1 Primary User

The Primary User is an individual managing a short personal task list on a desktop or mobile browser. They want to quickly record what they need to do, see what remains active, mark work complete, and remove items they no longer need.

### 2.2 Jobs To Be Done

- Capture a task before it is forgotten.
- See active and completed work without interpreting complex UI.
- Mark a task complete immediately when the work is done.
- Remove tasks that are no longer useful.
- Return later and find the Todo List unchanged.

### 2.3 Key User Journey

- **UJ-1. Primary User manages a personal Todo List.**
  - **Persona + context:** The Primary User opens the app to manage a short personal task list.
  - **Entry state:** The user is unauthenticated and lands directly on the Todo List.
  - **Path:** The user reviews existing Todo Items, enters a short description, creates a new Todo Item, marks one Todo Item complete, and deletes one Todo Item they no longer need.
  - **Climax:** The Todo List updates immediately after each action, and completed Todo Items are visually distinct from active Todo Items.
  - **Resolution:** After refresh or reopening the app, the Todo List still reflects the user's latest changes.
  - **Edge case:** If a create, complete, or delete action fails, the app shows a recoverable error state and preserves the last confirmed Todo List state.

## 3. Glossary

- **Todo App** - The full-stack web application described by this PRD.
- **Todo List** - The ordered collection of Todo Items shown to the user.
- **Todo Item** - A single task record with an ID, description, completion status, creation timestamp, and update timestamp.
- **Active Todo Item** - A Todo Item whose completion status is incomplete.
- **Completed Todo Item** - A Todo Item whose completion status is complete.
- **Core Task Loop** - The user flow of viewing, creating, completing or uncompleting, deleting, and returning to the Todo List.
- **MVP** - The first version of the Todo App defined by this PRD.

## 4. MVP Scope Rationale

The MVP is single-user and task-only so the team can validate the Core Task Loop before adding planning, collaboration, or account-management complexity. Authentication and multi-user support are deferred because they add data ownership, session, security, and recovery concerns that are not needed to prove the first product experience.

The architecture should not block future authentication or multi-user support, but it must not implement those features in v1. The minimum extensibility requirement is to keep Todo Item persistence behind a small API boundary so future ownership fields can be added without replacing the whole application.

## 5. Features and Functional Requirements

### 5.1 Todo List Viewing

**Description:** The Primary User sees the Todo List immediately after opening the Todo App. This realizes UJ-1.

#### FR-1: View Todo List

The Primary User can view all Todo Items in the Todo List.

**Consequences:**
- On initial load, the app requests persisted Todo Items from the backend API.
- The Todo List displays both Active Todo Items and Completed Todo Items.
- Todo Items follow a canonical order: Active Todo Items appear before Completed Todo Items (`completed` false before true), then by `updatedAt` descending (most recently changed first). This canonical order is applied whenever the Todo List is loaded.
- Within a session, the list does not reorder as items are completed or uncompleted; the canonical order is re-applied on the next page load. See FR-4 and FR-5.
- If no Todo Items exist, the app displays an empty state with a clear affordance to create the first Todo Item.

#### FR-2: Distinguish Completion Status

The Primary User can visually distinguish Active Todo Items from Completed Todo Items.

**Consequences:**
- Completed Todo Items use a visual treatment that is distinct from Active Todo Items.
- Completion status is represented by an accessible control or label, not color alone.
- The UI remains understandable at desktop and mobile viewport widths.

### 5.2 Todo Item Creation

**Description:** The Primary User creates a Todo Item by entering a short description. This realizes UJ-1.

#### FR-3: Create Todo Item

The Primary User can create a Todo Item with a short textual description.

**Consequences:**
- The create control is available from the main Todo List view.
- Empty or whitespace-only descriptions are rejected client-side.
- Descriptions longer than 200 characters are rejected with an inline validation message. `[ASSUMPTION: 200 characters is sufficient for MVP task descriptions.]`
- The 200-character limit is the enforced *submit* limit. The rendered Todo List displays each description on up to two lines (approximately 60–90 visible characters depending on viewport width), truncating longer text with an ellipsis (…). The full description is always persisted and submitted; the visible-length truncation is a readability convention, not a data-loss event. `[ASSUMPTION: accepting the gap between the 200-character submit limit and the ~60–90-character visible threshold is acceptable for MVP (Option A); editing to recover hidden text is not required since description editing is deferred per NG-7.]`
- A successfully created Todo Item appears in the Todo List without a full page reload.
- The backend persists the created Todo Item before the UI treats it as confirmed.

### 5.3 Todo Item Completion

**Description:** The Primary User marks Todo Items complete or active as task status changes. This realizes UJ-1.

#### FR-4: Complete Todo Item

The Primary User can mark an Active Todo Item as complete.

**Consequences:**
- Completing a Todo Item updates its completion status in the backend.
- The UI reflects the completed state after the backend confirms the update.
- The Todo Item remains visible in the Todo List after completion.
- Within a session, a completed Todo Item is visually de-emphasised in place and does not move; it is re-sorted into canonical order (below Active Todo Items) on the next page load. See FR-1.

#### FR-5: Uncomplete Todo Item

The Primary User can mark a Completed Todo Item as active again.

**Consequences:**
- Uncompleting a Todo Item updates its completion status in the backend.
- The UI reflects the active state after the backend confirms the update.
- Within a session, the Todo Item remains in its existing list position. On the next page load, canonical ordering (see FR-1) is re-applied and the now-active Todo Item rejoins the Active Todo Items group, ordered by `updatedAt` descending.

### 5.4 Todo Item Deletion

**Description:** The Primary User removes Todo Items they no longer need. This realizes UJ-1.

#### FR-6: Delete Todo Item

The Primary User can permanently delete a Todo Item.

**Consequences:**
- Deleting a Todo Item removes it from the backend data store.
- Deleting a Todo Item removes it from the Todo List after backend confirmation.
- Deletion is idempotent: deleting a Todo Item that no longer exists is treated as success rather than an error (see FR-10).
- If deletion fails, the Todo Item remains visible and the user sees an error message.
- Undo and archive behavior are out of scope for MVP.

### 5.5 UI States and Error Handling

**Description:** The Todo App handles empty, loading, and error states clearly without disrupting the Core Task Loop.

#### FR-7: Loading State

The Todo App displays a loading state while the initial Todo List request is in progress.

**Consequences:**
- The loading state appears before Todo Items are available.
- The loading state does not shift layout in a way that prevents immediate use once data loads.

#### FR-8: Error State

The Todo App displays recoverable error states for failed initial load, create, complete, uncomplete, and delete actions.

**Consequences:**
- Initial-load failure displays an error message and a retry action.
- Mutation failure displays an error message near the affected action or in a consistent alert region.
- Failed mutations preserve the last backend-confirmed Todo List state.

### 5.6 API and Persistence

**Description:** The backend exposes a small API for Todo Item persistence and retrieval.

#### FR-9: Persist Todo Items

The backend persists Todo Items across browser refreshes and application restarts.

**Consequences:**
- Todo Items remain available after page refresh.
- Todo Items remain available after restarting the backend service, assuming the configured data store is available.
- Data loss from normal create, complete, uncomplete, and delete flows is treated as a blocking defect.

#### FR-10: Expose Todo API

The backend exposes API operations for listing, creating, updating completion status, and deleting Todo Items.

**Consequences:**
- The API supports `GET /todos` to list Todo Items in canonical order (see FR-1).
- The API supports `POST /todos` to create a Todo Item.
- The API supports `PATCH /todos/{id}` to update completion status.
- The API supports `DELETE /todos/{id}` to delete a Todo Item.
- `POST /todos` accepts a client-generated identifier (UUIDv7) in the request body. The backend validates the identifier's format and treats creation as idempotent on that identifier: a repeated `POST` with an identifier that already exists does not create a duplicate. This supports optimistic creation and safe retries. `[ASSUMPTION: client-generated, time-sortable UUIDv7 identifiers are acceptable for MVP; ratified from the architecture decision.]`
- `DELETE /todos/{id}` is idempotent: it returns success (HTTP 204) whether or not a matching Todo Item existed.
- The API returns validation errors for invalid descriptions.
- Full text editing of Todo Item descriptions is not included in MVP. `[ASSUMPTION: "CRUD" from the original PRD means create, read, completion update, and delete for MVP; description edit is deferred.]`

## 6. Data Requirements

Each Todo Item must include:

- `id` - Stable unique identifier (UUIDv7), generated by the client at creation time and validated by the backend. Time-sortable, enabling idempotent creation and optimistic UI (see FR-10).
- `description` - Required string, trimmed, 1-200 characters.
- `completed` - Boolean completion status.
- `createdAt` - Timestamp set when the Todo Item is created.
- `updatedAt` - Timestamp set when the Todo Item is created or changed.

## 7. Cross-Cutting Non-Functional Requirements

- **NFR-1: Responsiveness** - Confirmed create, complete, uncomplete, and delete actions should update the visible Todo List within 300 ms after the backend response reaches the client under normal local development conditions.
- **NFR-2: Initial load performance** - The initial Todo List view should become usable within 1 second under normal local development conditions with up to 100 Todo Items. `[ASSUMPTION: 100 Todo Items is a sufficient MVP performance budget.]`
- **NFR-3: Accessibility** - Core actions must be keyboard reachable and screen-reader understandable. Completion status must not rely on color alone.
- **NFR-4: Responsive layout** - The Todo App must support viewport widths from 320 px to desktop widths without overlapping controls or clipped task text.
- **NFR-5: Maintainability** - Frontend, backend, and persistence responsibilities must remain separated enough that API behavior can be tested independently from the UI.
- **NFR-6: Reliability** - Failed backend operations must not corrupt the persisted Todo List or silently discard confirmed user changes.

## 8. Non-Goals

- **NG-1:** User accounts and authentication are not part of MVP.
- **NG-2:** Multi-user support, sharing, and collaboration are not part of MVP.
- **NG-3:** Task priorities, labels, projects, due dates, reminders, and notifications are not part of MVP.
- **NG-4:** Search, filtering, and sorting controls are not part of MVP.
- **NG-5:** Offline-first behavior and cross-device sync are not part of MVP.
- **NG-6:** Undo, archive, and soft-delete behavior are not part of MVP.
- **NG-7:** Editing Todo Item descriptions after creation is not part of MVP.

## 9. Success Metrics

### Primary

- **SM-1:** A user can complete UJ-1 without guidance in a usability check. Target: create, complete, uncomplete, delete, and refresh verification all succeed in one session. Validates FR-1 through FR-10.
- **SM-2:** No confirmed Todo Item changes are lost across refresh or backend restart in MVP verification. Validates FR-9.
- **SM-3:** Every FR has at least one passing implementation test or manual verification note before MVP acceptance. Validates FR-1 through FR-10.

### Secondary

- **SM-4:** The UI remains usable at 320 px, tablet, and desktop viewport widths without overlapping controls. Validates FR-1, FR-2, and NFR-4.
- **SM-5:** Initial load, empty, and error states are all observable during validation. Validates FR-7 and FR-8.

### Counter-Metrics

- **SM-C1:** Do not optimize for feature count. Adding accounts, priorities, due dates, notifications, or collaboration before the Core Task Loop is complete should count against MVP focus.
- **SM-C2:** Do not optimize for abstraction depth beyond clear frontend/backend/persistence boundaries. Premature architecture for multi-user support should count against MVP simplicity.

## 10. Open Questions

1. ~~Should Todo Items be ordered newest first, oldest first, or manually sorted after MVP?~~ **Resolved (2026-06-15):** canonical order is `completed` ascending (active before completed), then `updatedAt` descending, with in-session in-place behavior re-sorted on next load (see FR-1, FR-4, FR-5). Manual sorting remains out of scope (NG-4).
2. Should description editing remain deferred, or should it be included before the first implementation pass?
3. What persistence technology should architecture choose for MVP: file-backed storage, SQLite, Postgres, browser local storage, or another option?
4. Should completed Todo Items always remain visible, or should a later version introduce filtering?
5. What deployment target should architecture assume for the first usable version?

## 11. Assumptions Index

- §5.2 FR-3 - `[ASSUMPTION: 200 characters is sufficient for MVP task descriptions.]`
- §5.2 FR-3 - `[ASSUMPTION: accepting the gap between the 200-character submit limit and the ~60–90-character visible threshold is acceptable for MVP (Option A).]`
- §5.6 FR-10 - `[ASSUMPTION: "CRUD" from the original PRD means create, read, completion update, and delete for MVP; description edit is deferred.]`
- §5.6 FR-10 - `[ASSUMPTION: client-generated, time-sortable UUIDv7 identifiers are acceptable for MVP; ratified from the architecture decision.]`
- §7 NFR-2 - `[ASSUMPTION: 100 Todo Items is a sufficient MVP performance budget.]`

*Note: the original §5.1 FR-1 newest-first ordering assumption was superseded on 2026-06-15 by the canonical-order decision (see Open Questions §10.1 and FR-1).*
