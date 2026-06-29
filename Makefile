.PHONY: run-dev install-deps show-outdated-deps upgrade-deps build-release bundle-macos bundle-macos-dmg generate-icons preview-icon check-versions test

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

generate-icons:
	npx tauri icon src-tauri/icons/icon-source.svg -o src-tauri/icons
	cp src-tauri/icons/icon-source.svg public/app-icon.svg
	# remove platform assets not needed for macOS
	rm -rf src-tauri/icons/ios src-tauri/icons/android
	rm -f src-tauri/icons/Square*.png src-tauri/icons/StoreLogo.png

preview-icon: generate-icons
	qlmanage -p src-tauri/icons/icon.icns

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

check-versions:
	@PKG=$$(node -p "require('./package.json').version"); \
	TAURI=$$(node -p "require('./src-tauri/tauri.conf.json').version"); \
	CARGO=$$(grep '^version' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2); \
	FAIL=0; \
	if [ "$$TAURI" != "$$PKG" ]; then \
		echo "ERROR: src-tauri/tauri.conf.json version ($$TAURI) != package.json ($$PKG)"; \
		FAIL=1; \
	fi; \
	if [ "$$CARGO" != "$$PKG" ]; then \
		echo "ERROR: src-tauri/Cargo.toml version ($$CARGO) != package.json ($$PKG)"; \
		FAIL=1; \
	fi; \
	if [ $$FAIL -eq 0 ]; then \
		echo "Versions in sync: $$PKG"; \
	else \
		exit 1; \
	fi

test: check-versions
	npx tsc --noEmit # do type-checks explicitly, `npm test` won't report them
	npm test
	npm run test:e2e
