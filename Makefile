SHELL            := /usr/bin/env bash
INVENTORY        ?= inventory/hosts.yml
PLAYBOOK         ?= site.yml
HOSTS            ?= all
VERSION          ?=
UV               := uv run

# Binary + plugin deps are fetched, not committed (too large for git).
OPENCODE_REPO    ?= sst/opencode
BINARY           := roles/opencode/files/opencode
DEPS_ARCHIVE     := roles/opencode/files/opencode-dependencies.tar.gz
OPENCODE_VERSION := $(shell sed -n 's/^opencode_version:[[:space:]]*"\(.*\)"/\1/p' roles/opencode/defaults/main.yml)
OPENCODE_URL     := https://github.com/$(OPENCODE_REPO)/releases/download/v$(OPENCODE_VERSION)/opencode-linux-x64.tar.gz

.DEFAULT_GOAL := help
.PHONY: help setup lock fetch require-artifacts deploy upgrade check try uninstall lint \
        test test-install test-upgrade test-config test-uninstall clean

help:
	@printf "\nUsage: make <target>\n\n"
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\n"

setup: ## Install uv + sync .venv
	@command -v uv >/dev/null 2>&1 || { \
	  curl -LsSf https://astral.sh/uv/install.sh | sh; \
	  echo "Restart shell or: source $$HOME/.local/bin/env"; exit 1; }
	uv sync

lock: ## Upgrade uv.lock to latest and re-sync
	uv lock --upgrade && uv sync

fetch: ## Download the binary + build plugin deps into the role (needs internet + npm)
	@echo "Fetching opencode v$(OPENCODE_VERSION) (linux-x64) from $(OPENCODE_REPO)…"
	@mkdir -p $(dir $(BINARY))
	@tmp=$$(mktemp -d); \
	  curl -fSL --progress-bar "$(OPENCODE_URL)" -o "$$tmp/opencode.tar.gz"; \
	  tar -xzf "$$tmp/opencode.tar.gz" -C "$$tmp" opencode; \
	  install -m 0755 "$$tmp/opencode" "$(BINARY)"; \
	  rm -rf "$$tmp"
	@echo -n "Installed: " && $(BINARY) --version
	@echo "Building plugin runtime (@opencode-ai/plugin@$(OPENCODE_VERSION)) → $(DEPS_ARCHIVE)…"
	@tmp=$$(mktemp -d); \
	  printf '{\n  "dependencies": {\n    "@opencode-ai/plugin": "%s"\n  }\n}\n' "$(OPENCODE_VERSION)" > "$$tmp/package.json"; \
	  (cd "$$tmp" && npm install --no-audit --no-fund --loglevel=error); \
	  tar -czf "$(DEPS_ARCHIVE)" -C "$$tmp" package.json package-lock.json node_modules; \
	  rm -rf "$$tmp"
	@echo "Built plugin runtime: $$(du -h $(DEPS_ARCHIVE) | cut -f1)"

require-artifacts:
	@test -f $(BINARY) && test -f $(DEPS_ARCHIVE) || { \
	  echo "Missing build artifacts ($(BINARY) and/or $(DEPS_ARCHIVE))."; \
	  echo "Run 'make fetch' on a machine with internet first (then deploy offline)."; \
	  exit 1; }

deploy: require-artifacts ## Deploy opencode. HOSTS=group to limit.
	$(UV) ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --limit $(HOSTS)

upgrade: ## Bump opencode_version, fetch the new binary, and deploy. VERSION=x.y.z required.
	@[[ -n "$(VERSION)" ]] || { echo "Usage: make upgrade VERSION=x.y.z" >&2; exit 1; }
	sed -i 's/^opencode_version:.*/opencode_version: "$(VERSION)"/' roles/opencode/defaults/main.yml
	$(MAKE) fetch
	$(MAKE) deploy

check: require-artifacts ## Dry-run (--check --diff)
	$(UV) ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --check --diff --limit $(HOSTS)

TRY_CONTAINER := opencode-install

try: require-artifacts ## Run the install scenario in a container, then copy the result into ./tmp_test (needs Docker)
	cd tests && $(UV) molecule converge -s install
	@rm -rf tmp_test && mkdir -p tmp_test/usr/local/bin tmp_test/home/alice
	@docker cp $(TRY_CONTAINER):/usr/local/bin/opencode tmp_test/usr/local/bin/opencode
	@docker cp $(TRY_CONTAINER):/home/alice/.config tmp_test/home/alice/.config
	@docker cp $(TRY_CONTAINER):/home/alice/.opencode tmp_test/home/alice/.opencode
	@echo
	@echo "Installed inside container '$(TRY_CONTAINER)' and exported to ./tmp_test:"
	@find tmp_test -maxdepth 5 -not -path '*/opencode-local-model/*' -not -path '*/node_modules/*' | sort
	@echo
	@echo "Live shell:  cd tests && uv run molecule login"
	@echo "Tear down:   make clean   (removes the container and ./tmp_test)"

uninstall: ## Remove opencode from hosts. HOSTS=group to limit.
	$(UV) ansible-playbook -i $(INVENTORY) uninstall.yml --limit $(HOSTS)

lint: ## Run yamllint + ansible-lint
	$(UV) yamllint .
	$(UV) ansible-lint $(PLAYBOOK) uninstall.yml roles/opencode/

test: require-artifacts ## Run all Molecule scenarios (needs Docker)
	cd tests && $(UV) molecule test -s install
	cd tests && $(UV) molecule test -s upgrade
	cd tests && $(UV) molecule test -s config
	cd tests && $(UV) molecule test -s uninstall

test-install: require-artifacts ## Fresh-install scenario (+ per-user reconcile)
	cd tests && $(UV) molecule test -s install

test-upgrade: require-artifacts ## Upgrade scenario (backup-on-upgrade)
	cd tests && $(UV) molecule test -s upgrade

test-config: require-artifacts ## Config-update scenario (binary untouched)
	cd tests && $(UV) molecule test -s config

test-uninstall: require-artifacts ## Uninstall scenario
	cd tests && $(UV) molecule test -s uninstall

clean: ## Destroy Molecule containers, remove ./tmp_test and caches
	cd tests && $(UV) molecule destroy -s install    2>/dev/null || true
	cd tests && $(UV) molecule destroy -s upgrade    2>/dev/null || true
	cd tests && $(UV) molecule destroy -s config     2>/dev/null || true
	cd tests && $(UV) molecule destroy -s uninstall  2>/dev/null || true
	rm -rf tmp_test .venv __pycache__ .pytest_cache .ansible
