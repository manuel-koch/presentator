.PHONY: run-dev install-deps show-outdated-deps upgrade-deps build-release test

run-dev:
	npm run tauri dev

install-deps:
	npm install

show-outdated-deps:
	-npm outdated
	-cargo outdated --manifest-path src-tauri/Cargo.toml

upgrade-deps:
	npm update
	cargo update --manifest-path src-tauri/Cargo.toml

build-release:
	npm run tauri build

test:
	npm test
	npm run test:e2e
