# Presentator

Interactive / dynamic presentation app built from SVG input files, running on macOS.

* Features: [docs/features.md](docs/features.md)
* Architecture decisions: [docs/architecture.md](docs/architecture.md)
* Sidecar config schema: [docs/sidecar-config-schema.json](docs/sidecar-config-schema.json)
* Global config schema: [docs/global-config-schema.json](docs/global-config-schema.json)
* Implementation tasks: [docs/todo.md](docs/todo.md)
* App icon design: [docs/app-icon.md](docs/app-icon.md)

## General guideline

* Be concise.
* Prefer bullets over prose.
* Give concrete answers first.
* No preamble.
* No motivational filler.
* No repetition.
* Keep explanations to the minimum needed.

## Development Guideline

* Features have dedicated tests to verify the functionality
* [docs/todo.md](docs/todo.md) is the living task tracker.
  * Read it at the start of each session to understand current state.
  * Check off completed tasks immediately when done.
  * Merge done tasks to [docs/features.md](docs/features.md) on explicit user demand, follow the rules at [docs/todo.md](docs/todo.md#cleanup-todo-on-demand).

### Implement → Test → Fix Cycle

Every code change must complete this cycle before the task is considered done:

1. **Implement** — make the change; touch only what the task requires (YAGNI, KISS)
2. **Test** — type-check, unit tests, e2e tests; use `make test`; fix every failure before continuing
3. **Mark done** — only after all checks are green

**When delegating to a sub-agent:**
After a sub-agent returns, explicitly verify its output against this cycle before accepting the result:

* Did it add tests for every new pure function, utility, or data model it introduced?
* Do all existing tests still pass (`make test`)?
* Are there TypeScript or Rust compile errors?

Sub-agents satisfy the checks they are given but are not aware of project-wide guidelines unless
told. The delegating agent is responsible for the complete cycle, not just the build result.

**When a test fails after a change:**

* Check whether the failure is in the *code* or the *test*. Both are bugs.
* If a component’s `data-testid`, prop type, or public interface changed, update all tests and
  fixtures that reference it — do not leave stale test expectations.

**Lesson learned:** renaming or replacing a component without updating e2e selectors leaves tests
silently broken. Always grep for `data-testid` values and prop names when refactoring.

### Design Principles

* Avoid Code Smells
* KISS — Keep It Simple
* SOLID Principles
* SSOT (Single Source of Truth)
* YAGNI (You Aren’t Gonna Need It)
* Clean Code (Uncle Bob)
* Clean Architecture (Martin)
* Minimum Viable Product (MVP)
* Five Whys (Ohno) — find root cause before fixing
* Chain of Thought (CoT)
* Occam’s Razor
* TDD, Chicago School
* Test Double: Mock / Spy / Stub (Meszaros)
* Testing Pyramid (Cohn), Testing Trophy (Dodds)
