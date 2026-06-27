SHELL            := /usr/bin/env bash
INVENTORY        ?= inventory/hosts.yml
PLAYBOOK         ?= site.yml
HOSTS            ?= all
UV               := uv run

# opencode binary is fetched, not committed (too large for git).
OPENCODE_REPO    ?= sst/opencode
BINARY           := roles/opencode/files/opencode
OPENCODE_VERSION := $(shell sed -n 's/^opencode_version:[[:space:]]*"\(.*\)"/\1/p' roles/opencode/defaults/main.yml)
OPENCODE_URL     := https://github.com/$(OPENCODE_REPO)/releases/download/v$(OPENCODE_VERSION)/opencode-linux-x64.tar.gz

.DEFAULT_GOAL := help
.PHONY: help setup lock fetch require-binary deploy check try uninstall lint test clean

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

fetch: ## Download the pinned opencode binary into the role (needs internet)
	@echo "Fetching opencode v$(OPENCODE_VERSION) (linux-x64) from $(OPENCODE_REPO)…"
	@mkdir -p $(dir $(BINARY))
	@tmp=$$(mktemp -d); \
	  curl -fSL --progress-bar "$(OPENCODE_URL)" -o "$$tmp/opencode.tar.gz"; \
	  tar -xzf "$$tmp/opencode.tar.gz" -C "$$tmp" opencode; \
	  install -m 0755 "$$tmp/opencode" "$(BINARY)"; \
	  rm -rf "$$tmp"
	@echo -n "Installed: " && $(BINARY) --version

require-binary:
	@test -f $(BINARY) || { \
	  echo "Missing $(BINARY)."; \
	  echo "Run 'make fetch' on a machine with internet first (then deploy offline)."; \
	  exit 1; }

deploy: require-binary ## Deploy opencode. HOSTS=group to limit.
	$(UV) ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --limit $(HOSTS)

check: require-binary ## Dry-run (--check --diff)
	$(UV) ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --check --diff --limit $(HOSTS)

TRY_CONTAINER := opencode-install

try: require-binary ## Run the role in a container, then copy the result into ./tmp_test (needs Docker)
	cd tests && $(UV) molecule converge
	@rm -rf tmp_test && mkdir -p tmp_test/usr/local/bin tmp_test/home/alice
	@docker cp $(TRY_CONTAINER):/usr/local/bin/opencode tmp_test/usr/local/bin/opencode
	@docker cp $(TRY_CONTAINER):/home/alice/.config tmp_test/home/alice/.config
	@echo
	@echo "Installed inside container '$(TRY_CONTAINER)' and exported to ./tmp_test:"
	@find tmp_test -maxdepth 5 -not -path '*/opencode-local-model/*' | sort
	@echo
	@echo "Live shell:  cd tests && uv run molecule login"
	@echo "Tear down:   make clean   (removes the container and ./tmp_test)"

uninstall: ## Remove opencode from hosts. HOSTS=group to limit.
	$(UV) ansible-playbook -i $(INVENTORY) uninstall.yml --limit $(HOSTS)

lint: ## Run yamllint + ansible-lint
	$(UV) yamllint .
	$(UV) ansible-lint $(PLAYBOOK) uninstall.yml roles/opencode/

test: require-binary ## Run the Molecule scenario: converge + idempotence + verify (needs Docker)
	cd tests && $(UV) molecule test

clean: ## Destroy Molecule containers, remove ./tmp_test and caches
	cd tests && $(UV) molecule destroy 2>/dev/null || true
	rm -rf tmp_test .venv __pycache__ .pytest_cache .ansible
