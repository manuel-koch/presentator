# Presentator

Interactive / dynamic presentation app built from SVG input files, running on macOS.

## Prerequisites

### Rust — via rustup

```sh
brew install rustup
rustup-init
```

Follow the on-screen prompts (default installation is fine). Then restart your shell or source the environment:

```sh
source "$HOME/.cargo/env"
```

Verify:

```sh
rustc --version
cargo --version
```

### Node.js — via fnm

```sh
brew install fnm
```

Add fnm to your shell (add this to your `~/.zshrc`):

```sh
eval "$(fnm env --use-on-cd)"
```

Then install and activate the required Node version:

```sh
fnm install --lts
fnm use lts-latest
```

Verify:

```sh
node --version
npm --version
```

## Documentation

- [Features](docs/features.md)
- [Architecture](docs/architecture.md)
- [Config schema](docs/config-schema.md)
- [Implementation tasks](docs/todo.md)
