# Presentator

Interactive / dynamic presentation app built from SVG input files, running on macOS.

* Features: [docs/features.md](docs/features.md)
* Architecture decisions: [docs/architecture.md](docs/architecture.md)
* Config file schema: [docs/config-schema.md](docs/config-schema.md)
* Implementation tasks: [docs/todo.md](docs/todo.md)

## Development Guideline

* Features have dedicated tests to verify the functionality
* [docs/todo.md](docs/todo.md) is the living task tracker.
  * Read it at the start of each session to understand current state.
  * Check off completed tasks immediately when done.
  * Merge done tasks to [docs/features.md](docs/features.md) on explicit user demand!

### Implement → Test → Fix Cycle

Every code change must complete this cycle before the task is considered done:

1. **Implement** — make the change; touch only what the task requires (YAGNI, KISS)
2. **Test** — type-check, unit tests, e2e tests; use `make test`; fix every failure before continuing
3. **Mark done** — only after all checks are green

**When a test fails after a change:**
- Check whether the failure is in the *code* or the *test*. Both are bugs.
- If a component’s `data-testid`, prop type, or public interface changed, update all tests and
  fixtures that reference it — do not leave stale test expectations.

**Lesson learned:** renaming or replacing a component without updating e2e selectors leaves tests
silently broken. Always grep for `data-testid` values and prop names when refactoring.

### Design Principles

- Avoid Code Smells
- KISS — Keep It Simple
- SOLID Principles
- SSOT (Single Source of Truth)
- YAGNI (You Aren’t Gonna Need It)
- Clean Architecture
- Minimum Viable Product (MVP)
- Five Whys (Ohno) — find root cause before fixing
- Chain of Thought (CoT)
- Occam’s Razor
- TDD, Chicago School
- Test Double: Mock / Spy / Stub (Meszaros)
