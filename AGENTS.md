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

### Implement → Lint → Test → Fix Cycle

Every code change must complete this cycle before the task is considered done:

1. **Implement**: make the change; touch only what the task requires (YAGNI, KISS)
2. **Lint**: type-check, lint; use `make lint`; fix every failure/warning before continuing
3. **Test**: unit tests, e2e tests; use `make test`; fix every failure before continuing
4. **Mark done**: only after all checks are green

**Cadence:** Run `npm test` (unit tests only, fast) after each wired-up feature unit,
do not batch verification to the end of a session. A failing test caught in 3 seconds
beats an OOM hunt in a later session. Run the full `make test` before marking done.

### Delegating to Sub-Agents

Delegate sub-tasks to sub-agents to keep the main context lean. Good candidates:

* **Self-contained** — implement function X, write tests for module Y, refactor file Z
* **Many-file exploration** — tracing a bug across 10 files would flood context
* **Parallel work** — investigate approach A and B simultaneously
* **Mechanical** — renaming a symbol across 20 files, adding a pattern to many fixtures

**Do NOT delegate** when the sub-task needs clarifying questions, relies on
conversation history you can't summarise, or is so tightly coupled that
integration cost outweighs context saved. When in doubt, keep it in the main agent.

**Always verify after delegation:** sub-agent summaries are self-reports, not
verified facts. Read back file contents, confirm tests pass, check for compile
errors. The delegating agent owns the full implement→test→fix cycle.

**Mock only what you must:**

* Mock at the boundary of the unit under test — the external I/O it cannot perform
  in a test environment (IPC commands, native dialogs, filesystem). Never mock the
  unit itself.
* Use per-command mock implementations, not blanket mock for an entire module.
  A blanket mock silently returns wrong types to unrelated callers, masking real failures.
* A test that passes with mocks but fails in production is worse than no test,
  it creates false confidence. If a mock makes the test trivially pass for any
  implementation, the test is not verifying anything.

**When a test fails after a change:** Check whether the failure is in the *code*
or the *test*. Both are bugs.

**Test stderr discipline:** After any change, compare stderr output before and after.
Zero new warnings or error messages allowed. Existing stderr noise is a known debt
that sould be addressed immediately.

**Test Coverage:** Aim to achieve **>80% line coverage** on testable files,
run `make test-coverage`.

### Design Principles

* Avoid Code Smells
* KISS — Keep It Simple
* SOLID Principles ( Single Responsibility, Open/Closed,
  Liskov Substitution, Interface Segregation, Dependency Inversion )
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
