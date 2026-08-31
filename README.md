# opencode-ansible

Install a pinned, self-contained **opencode** across a Linux x86_64 workstation
fleet, fully offline. The binary goes to `/usr/local/bin`; each machine's primary
user gets a managed `~/.config/opencode/` payload with the plugin runtime
pre-staged, so nothing is fetched at startup.

| Path                                                            | Contents                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/usr/local/bin/opencode`                                       | the binary, system-wide, on PATH for every user                     |
| `~/.config/opencode/opencode.jsonc`                             | managed, offline-hardened config (permissions + provider + plugins) |
| `~/.config/opencode/{commands,plugins,instructions,skills}/`    | slash commands, bundled plugins, `AGENTS.md`, and skills            |
| `~/.config/opencode/node_modules/`, `~/.opencode/node_modules/` | `@opencode-ai/plugin` runtime, pre-staged                           |

One machine per inventory entry, one primary user per machine. Every host must name
its `opencode_user` (the account that receives the payload); how to reach the host
(login, key, port) belongs in `~/.ssh/config` or `ansible_user`.

## Quick start

```bash
make setup    # one-time: install uv + sync .venv (control node)
make fetch    # download the binary + build the plugin runtime (needs internet + node)
```

The binary and deps tarball are **not committed** (too large for git), so run
`make fetch` where there is internet, then deploy offline. List your machines in
`inventory/hosts.yml`, set `opencode_provider_url` in `group_vars/workstations.yml`
and `opencode_user` per host, then:

```bash
make check                                                  # dry-run (--check --diff)
uv run ansible-playbook -i inventory/hosts.yml site.yml     # apply
```

Targets need Linux x86_64, SSH + sudo, no internet. Control node needs Ansible >= 2.12.

## Operations

```bash
# deploy everything, or --limit to one host or group
uv run ansible-playbook -i inventory/hosts.yml site.yml --limit alice-laptop

# remove the binary + that user's payload
uv run ansible-playbook -i inventory/hosts.yml uninstall.yml --limit alice-laptop
```

**Upgrade**: bump `opencode_version` in `roles/opencode/defaults/main.yml`, run
`make fetch`, then deploy — the old binary is kept as `opencode.bak.<old_version>`.
**Config-only change**: edit the URLs in `group_vars/workstations.yml` and deploy;
the binary is untouched, only `opencode.jsonc` is re-rendered.

## Tests

Molecule scenarios (Docker), one isolated container each:

```bash
make test             # all four scenarios
make test-install     # fresh install + per-user reconcile of seeded collisions
make test-upgrade     # stub old binary to pinned version, backup created
make test-config      # config-only change: binary untouched
make test-uninstall   # binary + user payload removed
make lint             # yamllint + ansible-lint
```

CI (`.github/workflows/ci.yml`) runs the lint and all four Molecule scenarios on
every push and pull request.

## Key variables

| Variable                   | Default                    | Description                                             |
| -------------------------- | -------------------------- | ------------------------------------------------------- |
| `opencode_user`            | **required**               | account that gets the per-user payload (set it per host) |
| `opencode_version`         | `1.17.11`                  | pinned version (`make fetch` to change)                 |
| `opencode_provider_url`    | `http://localhost:8000/v1` | local OpenAI-compatible endpoint                        |
| `opencode_marketplace_url` | `http://localhost:8000`    | skill-marketplace plugin endpoint                       |
| `opencode_artifact_dir`    | `{{ role_path }}/files`    | where the binary + deps archive live (e.g. shared mount) |
| `opencode_artifact_remote` | `false`                    | `true` = artifacts are on the targets, not the controller |

All defaults are in `roles/opencode/defaults/main.yml`.

## License

MIT — see [LICENSE](LICENSE).
