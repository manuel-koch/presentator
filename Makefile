.PHONY: run-dev install-deps show-outdated-deps upgrade-deps build-release bundle-macos bundle-macos-dmg test

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

bundle-macos:
	$(if $(SIGNING_IDENTITY),APPLE_SIGNING_IDENTITY="$(SIGNING_IDENTITY)" )npm run tauri build -- --bundles app
ifdef SIGNING_IDENTITY
	@echo ""
	@codesign -d --verbose=4 src-tauri/target/release/bundle/macos/Presentator.app 2>&1 \
		| grep -E "(Identifier|Authority|CDHash|SHA1 |SHA256)"
endif

bundle-macos-dmg: bundle-macos
	@rm -f src-tauri/target/release/bundle/macos/Presentator.dmg
	create-dmg \
		--volname "Presentator" \
		--volicon "src-tauri/icons/icon.icns" \
		--window-pos 200 120 \
		--window-size 600 400 \
		--icon-size 128 \
		--icon "Presentator.app" 175 190 \
		--hide-extension "Presentator.app" \
		--app-drop-link 425 190 \
		src-tauri/target/release/bundle/macos/Presentator.dmg \
		src-tauri/target/release/bundle/macos/Presentator.app


test:
	npx tsc --noEmit # do type-checks explicitly, `npm test` won't report them
	npm test
	npm run test:e2e
