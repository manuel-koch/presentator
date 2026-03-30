# Presentator

Interactive / dynamic presentation app built from SVG input files, running on macOS.

## Prerequisites

### Rust — via rustup

```sh
brew install rustup
rustup-init

# Follow the on-screen prompts (default installation is fine). Then restart your shell or source the environment:
source "$HOME/.cargo/env"

# Verify
which rustc ; rustc --version
which cargo ; cargo --version
```

### Node.js — via fnm

```sh
brew install fnm

# Add fnm to your shell (add this to your `~/.zshrc`):
val "$(fnm env --use-on-cd)"
```

Then install and activate the required Node version:

```sh
fnm install --lts
fnm use lts-latest

# Verify:
which node ; node --version
which npm ; npm --version
```

## Development

Install dependencies after cloning:

```sh
npm install
```

### Run the app (development)

```sh
npm run tauri dev
```

Starts the Vite dev server and launches the Tauri desktop window. The UI hot-reloads on every file save; Rust changes trigger a Tauri rebuild automatically.

### Build for production

```sh
npm run tauri build
```

Compiles the React frontend and the Rust backend, then bundles both into a self-contained macOS `.app` in `src-tauri/target/release/bundle/macos/`.

## Testing

### Unit and component tests

```sh
npm test                # run all tests once
npm run test:watch      # re-run on file changes
npm run test:coverage   # run with coverage report
```

Uses [Vitest](https://vitest.dev) and [React Testing Library](https://testing-library.com/react). Test files live next to the source they test (`*.test.tsx` / `*.test.ts`).

### End-to-end tests

```sh
npm run test:e2e
```

Uses [Playwright](https://playwright.dev) (Chromium) against the Vite dev server. The server starts automatically before the tests and stops afterwards. Tauri IPC calls are intercepted by a fixture in [e2e/fixtures.ts](e2e/fixtures.ts) so no built app binary is needed. E2e specs live in [e2e/](e2e/).

## Documentation

- [Features](docs/features.md)
- [Architecture](docs/architecture.md)
- [Config schema](docs/config-schema.md)
- [Implementation tasks](docs/todo.md)
