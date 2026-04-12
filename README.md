# opencode-ansible

Ansible role that deploys [opencode](https://opencode.ai) to Linux x86_64 workstations — fully offline, no internet on targets.

## What gets installed

| Path | Contents |
|---|---|
| `/opt/opencode/bin/opencode` | opencode binary |
| `/opt/opencode/cache/node_modules/` | `@ai-sdk/openai-compatible` provider package |
| `/opt/opencode/cache/api.json` | models.dev offline cache |
| `/usr/local/bin/opencode` | wrapper — sets `NODE_PATH` and `OPENCODE_MODELS_URL`, then runs the binary |
| `~/.config/opencode/opencode.json` | user config (provider URL + models) |

After install, every user types `opencode` and it works. No `.bashrc` changes needed.

## Requirements

- Ansible ≥ 2.12 on the control machine
- Linux x86_64 targets
- [uv](https://docs.astral.sh/uv/) (only needed to run tests)

## Quick start

**1. Install dependencies (once)**

```bash
make setup
```

**2. Download the bundle** — needs internet, run once per version

```bash
make fetch                     # version from defaults/main.yml
make fetch VERSION=1.4.3       # pin a specific version
```

Produces `opencode-bundle-{version}.tar.gz` at the project root (gitignored). The bundle contains the binary, npm provider packages (`@ai-sdk/openai-compatible`, version auto-resolved from the opencode release date), and the models cache. It also writes `group_vars/all.yml` with the pinned version and SHA-256 checksum.

**3. Configure your inventory**

```yaml
# inventory/hosts.yml
all:
  hosts:
    alice-laptop:
      ansible_host: 192.168.1.10
      ansible_user: alice
```

```yaml
# inventory/host_vars/alice-laptop.yml
opencode_user:         alice
opencode_provider_url: "http://your-ai-server/v1"
opencode_models:
  - name: "deepseek-v32"
  - name: "qwen3-coder"
opencode_default_model: "deepseek-v32"
```

**4. Deploy**

```bash
make deploy
```

## Operations

**Deploy to a specific host or group**
```bash
make deploy HOSTS=alice-laptop
make deploy HOSTS=workstations
```

**Upgrade the binary**
```bash
make upgrade VERSION=1.4.3
```
Fetches the new binary and deploys. Previous binary is saved as `opencode.bak.<old_version>`.

**Update provider or models only** — edit vars in your inventory, then:
```bash
make deploy
```
Binary is not touched. Only `opencode.json` is rewritten.

**Update bundled npm packages** (e.g. after a security advisory)
```bash
make refresh-deps
```

**Override the auto-resolved `@ai-sdk/openai-compatible` version**
```bash
./fetch-binaries.sh --sdk-version 2.0.41
```
By default `fetch-binaries.sh` resolves the correct sdk version automatically from the npm registry based on the opencode release date. Use `--sdk-version` only if you need to override it.

**Uninstall**
```bash
make uninstall
make uninstall HOSTS=alice-laptop
```
Removes `/usr/local/bin/opencode` and `/opt/opencode/`.

`~/.config/opencode/` is left entirely intact — the user may have edited `opencode.json` or added plugins after the initial deploy. If you reinstall, the existing config is backed up with a timestamp before being overwritten.

**Dry-run**
```bash
make check
```

## Key variables

| Variable | Default | Description |
|---|---|---|
| `opencode_version` | `1.4.3` | Version to install |
| `opencode_user` | `{{ ansible_env.SUDO_USER \| default(ansible_user_id) }}` | User to deploy config for |
| `opencode_provider_url` | `http://localhost:8000/v1` | AI provider endpoint |
| `opencode_models` | `[{name: deepseek-v32}]` | Models to expose |
| `opencode_default_model` | `deepseek-v32` | Active model |
| `opencode_install_dir` | `/opt/opencode` | Binary + cache location |
| `opencode_bin_wrapper` | `/usr/local/bin/opencode` | Entry point for users |
| `opencode_keep_backup` | `true` | Keep `opencode.bak.*` on upgrade |
| `opencode_verify_checksum` | `true` | Verify SHA-256 before install |

All defaults are in `roles/opencode/defaults/main.yml`.

## Tests

```bash
make test             # all Molecule scenarios (requires Docker)
make test-install     # fresh install
make test-upgrade     # 1.3.5 → 1.4.3 upgrade
make test-config      # config update without binary change
make test-uninstall   # uninstall leaves config intact
```

Molecule scenarios in `tests/molecule/` use Docker and run each scenario in an isolated container.

## Plugins

opencode can be extended with JavaScript plugins placed in `~/.config/opencode/plugins/` (global) or `.opencode/plugins/` (per project). No additional packages needed for plain JS plugins.

For TypeScript plugins that use `import type { Plugin } from "@opencode-ai/plugin"`, add it to `~/.config/opencode/package.json` — opencode runs `bun install` at startup to install it. On air-gapped machines, pre-install it alongside the binary by adding it to the bundle.

## Config

opencode merges config files — later sources override earlier ones for conflicting keys. The role writes to `~/.config/opencode/opencode.json` (the user's global config). Users can add personal preferences (theme, keybindings) to the same file without conflict. A timestamped backup is created only when the config content actually changes.

To override per project, add `opencode.json` in the project directory — it takes precedence over the global config.
