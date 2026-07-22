SHELL := /usr/bin/env bash
UV    := uv run

# Molecule scenarios under tests/molecule/, one container each.
SCENARIOS := install upgrade config uninstall

# ---------------------------------------------------------------------------
# Overridable on the command line, e.g. `make check HOSTS=alice-laptop`
# ---------------------------------------------------------------------------
INVENTORY ?= inventory/hosts.yml
PLAYBOOK  ?= site.yml
HOSTS     ?= all

# Binary + plugin deps are fetched, not committed (too large for git).
# ARTIFACT_DIR is where `make fetch` writes them and where require-artifacts
# looks. Point it at a shared mount to keep them out of the repo entirely, and
# set opencode_artifact_dir to the same path so Ansible reads them from there:
#   make fetch deploy ARTIFACT_DIR=/srv/artifacts/opencode
OPENCODE_REPO ?= sst/opencode
ARTIFACT_DIR  ?= roles/opencode/files

# Set to 1 when the artifacts only exist on the targets
# (opencode_artifact_remote: true) and so cannot be checked here.
SKIP_ARTIFACT_CHECK ?=

# Scratch tree for `make local`: a full deploy redirected into the project, so
# nothing system-wide is touched and no sudo is needed. Git-ignored.
LOCAL_DIR ?= tmp/local

# ---------------------------------------------------------------------------
# Derived
# ---------------------------------------------------------------------------
BINARY           := $(ARTIFACT_DIR)/opencode
DEPS_ARCHIVE     := $(ARTIFACT_DIR)/opencode-dependencies.tar.gz
OPENCODE_VERSION := $(shell sed -n 's/^opencode_version:[[:space:]]*"\(.*\)"/\1/p' roles/opencode/defaults/main.yml)
OPENCODE_URL     := https://github.com/$(OPENCODE_REPO)/releases/download/v$(OPENCODE_VERSION)/opencode-linux-x64.tar.gz

.DEFAULT_GOAL := help
.PHONY: help setup lock fetch require-artifacts check local lint \
        test test-install test-upgrade test-config test-uninstall clean

# Molecule scenarios share container names, so they cannot run concurrently.
.NOTPARALLEL:

help:
	@printf "\nUsage: make <target>\n"
	@awk 'BEGIN{FS=":.*##"} \
	     /^##@/            {printf "\n%s\n", substr($$0, 5); next} \
	     /^[a-zA-Z_-]+:.*##/ {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\n"

##@ Setup
setup: ## Install uv + sync .venv
	@command -v uv >/dev/null 2>&1 || { \
	  curl -LsSf https://astral.sh/uv/install.sh | sh; \
	  echo "Restart shell or: source $$HOME/.local/bin/env"; exit 1; }
	uv sync

lock: ## Upgrade uv.lock to latest and re-sync
	uv lock --upgrade && uv sync

##@ Artifacts (ONLINE)
fetch: ## Download the binary + build plugin deps into ARTIFACT_DIR (needs internet + npm)
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

# Internal guard, not listed in help: every target that ships the artifacts
# depends on this so a clean checkout fails with a hint instead of a traceback.
require-artifacts:
	@if [[ -z "$(SKIP_ARTIFACT_CHECK)" ]]; then \
	  test -f $(BINARY) && test -f $(DEPS_ARCHIVE) || { \
	    echo "Missing build artifacts ($(BINARY) and/or $(DEPS_ARCHIVE))."; \
	    echo "Run 'make fetch' on a machine with internet first (then deploy offline),"; \
	    echo "or pass ARTIFACT_DIR=<dir> if they live somewhere else."; \
	    exit 1; }; \
	fi

##@ Verify
check: require-artifacts ## Dry-run (--check --diff). HOSTS=group to limit.
	$(UV) ansible-playbook -i $(INVENTORY) $(PLAYBOOK) --check --diff --limit $(HOSTS) -e ansible_become=false

# Uses the real inventory limited to localhost, not an inline `-i localhost,`:
# site.yml targets the workstations group, which an inline host is not in, and a
# pattern matching no host is only a warning that still exits 0.
local: require-artifacts ## Trial-install into ./tmp/local on this machine (no sudo, LOCAL_DIR=dir to move it)
	@mkdir -p $(LOCAL_DIR)/bin
	$(UV) ansible-playbook -i $(INVENTORY) --limit localhost -c local $(PLAYBOOK) \
	  -e ansible_become=false \
	  -e opencode_user=$$(id -un) \
	  -e opencode_bin_owner=$$(id -un) \
	  -e opencode_bin_group=$$(id -gn) \
	  -e opencode_artifact_dir=$(abspath $(ARTIFACT_DIR)) \
	  -e opencode_bin_path=$(abspath $(LOCAL_DIR))/bin/opencode \
	  -e opencode_user_home=$(abspath $(LOCAL_DIR)) \
	  -e opencode_config_dir=$(abspath $(LOCAL_DIR))/config
	@test -x $(LOCAL_DIR)/bin/opencode || { \
	  echo "make local: nothing installed. Is 'localhost' in $(INVENTORY), under workstations?" >&2; \
	  exit 1; }
	@echo
	@echo "Installed into ./$(LOCAL_DIR):"
	@find $(LOCAL_DIR) -maxdepth 3 -not -path '*/node_modules/*' | sort
	@echo
	@echo "Run it:    ./$(LOCAL_DIR)/bin/opencode --version"
	@echo "Config:    ./$(LOCAL_DIR)/config/opencode.jsonc"
	@echo "Tear down: make clean   (removes ./tmp)"

lint: ## Run yamllint + ansible-lint
	$(UV) yamllint .
	$(UV) ansible-lint $(PLAYBOOK) uninstall.yml roles/opencode/

test: test-install test-upgrade test-config test-uninstall ## Run all Molecule scenarios (needs Docker)

test-install: require-artifacts ## Fresh-install scenario (+ per-user reconcile)
	cd tests && $(UV) molecule test -s install

test-upgrade: require-artifacts ## Upgrade scenario (backup-on-upgrade)
	cd tests && $(UV) molecule test -s upgrade

test-config: require-artifacts ## Config-update scenario (binary untouched)
	cd tests && $(UV) molecule test -s config

test-uninstall: require-artifacts ## Uninstall scenario
	cd tests && $(UV) molecule test -s uninstall

##@ Housekeeping
clean: ## Destroy Molecule containers, remove ./tmp and caches
	@for s in $(SCENARIOS); do \
	  (cd tests && $(UV) molecule destroy -s $$s) 2>/dev/null || true; \
	done
	rm -rf tmp .venv __pycache__ .pytest_cache .ansible
