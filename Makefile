SHELL        := /usr/bin/env bash
INVENTORY    ?= inventory/hosts.yml
PLAYBOOK     ?= site.yml
HOSTS        ?= all
VERSION      ?=
UV           := uv run

.DEFAULT_GOAL := help
.PHONY: help setup lock fetch refresh-deps deploy upgrade uninstall test test-install test-upgrade test-config test-uninstall lint check clean

help:
	@printf "\nUsage: make <target>\n\n"
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\n"

setup: ## Install uv + sync .venv
	@command -v uv >/dev/null 2>&1 || { \
	  curl -LsSf https://astral.sh/uv/install.sh | sh; \
	  echo "Restart shell or: source $$HOME/.local/bin/env"; exit 1; }
	uv sync

lock: ## Upgrade uv.lock to latest and re-sync
	uv lock --upgrade && uv sync

fetch: ## Download bundle (internet required). VERSION=x.y.z optional.
	@if [[ -n "$(VERSION)" ]]; then ./fetch-binaries.sh --version $(VERSION); else ./fetch-binaries.sh; fi

refresh-deps: ## Force rebuild of bundled npm packages (e.g. after a security fix).
	./fetch-binaries.sh --refresh-deps

deploy: ## Deploy to all hosts. HOSTS=group to limit.
	$(UV) ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --limit $(HOSTS)

upgrade: ## Fetch + deploy new version. VERSION=x.y.z required.
	@[[ -n "$(VERSION)" ]] || { echo "Usage: make upgrade VERSION=x.y.z" >&2; exit 1; }
	./fetch-binaries.sh --version $(VERSION)
	$(UV) ansible-playbook -i $(INVENTORY) $(PLAYBOOK) -e "opencode_version=$(VERSION)" --limit $(HOSTS)

test: ## Run all Molecule scenarios
	cd tests && $(UV) molecule test -s install
	cd tests && $(UV) molecule test -s upgrade
	cd tests && $(UV) molecule test -s config
	cd tests && $(UV) molecule test -s uninstall

test-install: ## Fresh-install scenario
	cd tests && $(UV) molecule test -s install

test-upgrade: ## Upgrade scenario
	cd tests && $(UV) molecule test -s upgrade

test-config: ## Config-update scenario
	cd tests && $(UV) molecule test -s config

test-uninstall: ## Uninstall scenario
	cd tests && $(UV) molecule test -s uninstall

lint: ## Run ansible-lint
	$(UV) ansible-lint $(PLAYBOOK) roles/opencode/

check: ## Dry-run (--check --diff)
	$(UV) ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --check --diff --limit $(HOSTS)

uninstall: ## Remove opencode from hosts. HOSTS=group to limit.
	$(UV) ansible-playbook -i $(INVENTORY) uninstall.yml --limit $(HOSTS)

clean: ## Destroy Molecule containers and remove .venv
	cd tests && $(UV) molecule destroy -s install    2>/dev/null || true
	cd tests && $(UV) molecule destroy -s upgrade    2>/dev/null || true
	cd tests && $(UV) molecule destroy -s config     2>/dev/null || true
	cd tests && $(UV) molecule destroy -s uninstall  2>/dev/null || true
	rm -rf .venv __pycache__ .pytest_cache .ansible
