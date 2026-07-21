# opencode-ansible

Install a pinned, self-contained **opencode** across your Linux x86_64 workstation
fleet — fully offline, no internet on the targets. Ansible connects as an admin
account, copies the binary to `/usr/local/bin`, writes the machine's primary user
`~/.config/opencode/` payload (hardened config, commands, instructions, plugins),
and pre-stages the plugin runtime so nothing is fetched at startup.

## What gets installed

| Path                                            | Contents                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `/usr/local/bin/opencode`                       | the opencode binary — system-wide, on PATH for every user            |
| `~/.config/opencode/opencode.jsonc`             | managed, offline-hardened config (permissions + provider + plugins)  |
| `~/.config/opencode/{commands,plugins,instructions}/` | slash commands, bundled plugins, and `AGENTS.md`               |
| `~/.config/opencode/node_modules/`              | `@opencode-ai/plugin` runtime (pre-staged)                           |
| `~/.opencode/node_modules/`                     | `@opencode-ai/plugin` runtime (pre-staged)                           |
| `~/.opencode/bin/opencode`                      | symlink → `/usr/local/bin/opencode` (only if the user had their own) |

## Deployment model

One machine per inventory entry, one primary user per machine. Ansible logs in as
an admin/automation account (`ansible_user`) with sudo; name each host's target
person with `opencode_user` (in `host_vars/<host>.yml`). The system binary is
installed once per host; the payload is written into that user's home.
`opencode_user` defaults to the account Ansible runs as on the target — so in the
admin model, set it per host to deploy for a real person, or set it to `""` to
deploy only the shared system binary.

## Requirements

- Build machine (`make fetch`): internet + Node/npm.
- Control node: `uv` (bootstrapped by the Makefile), Ansible ≥ 2.12.
- Targets: Linux x86_64, SSH + sudo, no internet.

## Quick start

```bash
make setup        # one-time: uv + .venv (control node)
make fetch        # download binary + build plugin runtime (needs internet + npm)
```

The binary and deps tarball are **not committed** (too large for git); run
`make fetch` on a machine with internet, then deploy offline. Then edit
`inventory/hosts.yml` (machines + admin `ansible_user`), set each host's
`opencode_user` in `host_vars/<host>.yml` (see `host_vars/alice-laptop.yml.example`),
adjust `group_vars/workstations.yml` (`opencode_provider_url`), and:

```bash
make check        # dry-run (--check --diff)
make deploy       # apply (HOSTS=group to limit)
```

## Operations

```bash
make deploy HOSTS=alice-laptop     # deploy to one host or group
make upgrade VERSION=1.18.0        # bump version, fetch new binary, redeploy
make deploy                        # config-only change: edit URLs in vars, redeploy
make uninstall HOSTS=alice-laptop  # remove the binary + that user's payload
make check                         # dry-run
```

**Upgrade** — `make upgrade VERSION=x.y.z` bumps `opencode_version`, fetches the
new binary, and redeploys. On the target, `detect` sees the version change and
`install` backs the old binary up as `opencode.bak.<old_version>` (unless
`opencode_keep_backup: false`). The plugin runtime re-stages automatically.

**Config-only change** — edit `opencode_provider_url` / `opencode_marketplace_url`
(or any config var) and `make deploy`. The binary is not touched; only
`opencode.jsonc` is re-rendered.

## How the role works

The role is a small pipeline — `roles/opencode/tasks/main.yml` imports five staged
task files in order:

1. **`preflight.yml`** — assert the committed artifacts exist on the controller;
   read the passwd database.
2. **`detect.yml`** — read the installed version and compute the action
   (`install` / `upgrade` / `none`).
3. **`install.yml`** — back up the old binary on upgrade, then copy the pinned
   binary to `/usr/local/bin/opencode`.
4. **`config.yml`** → **`deploy_user.yml`** — deploy the per-user payload for
   `opencode_user`, non-destructively (see below).
5. **`verify.yml`** — smoke-test `opencode --version` and print a summary.

All tasks are tagged (`opencode` + a stage tag), so you can target a stage with
e.g. `--tags config`.

### Ownership (what the role takes over)

For each host's `opencode_user`, the role **owns** the opencode binary and config.
Anything it finds pre-existing is moved aside to a timestamped `*.bak` rather than
deleted, so nothing is lost:

- a user-installed `~/.opencode/bin/opencode` is backed up and replaced with a
  symlink to `{{ opencode_bin_path }}` (so their PATH launches the pinned binary);
- a hand-authored `~/.config/opencode/opencode.jsonc` is backed up before the
  managed one is rendered;
- a stray `~/.config/opencode/opencode.json` is moved aside (the role owns the
  `.jsonc`).

The `commands/`, `plugins/`, and `instructions/` trees under `~/.config/opencode/`
are role-managed: same-named files are overwritten. Keep personal customizations
under a different filename (or a project-level opencode config), not by editing the
deployed copies.

## Extending

Drop files into `roles/opencode/files/{plugins,commands}/` — no task edits needed.
To upgrade opencode, bump `opencode_version` and run `make fetch`, then redeploy:
the role re-stages the plugin runtime automatically when the pinned version changes
(no manual `node_modules` clearing needed).

## Key variables

| Variable                   | Default                    | Description                                    |
| -------------------------- | -------------------------- | ---------------------------------------------- |
| `opencode_version`         | `1.17.11`                  | pinned version (`make fetch` to change)        |
| `opencode_bin_path`        | `/usr/local/bin/opencode`  | system binary location                         |
| `opencode_provider_url`    | `http://localhost:8000/v1` | local OpenAI-compatible endpoint               |
| `opencode_marketplace_url` | `http://localhost:8000`    | skill-marketplace plugin endpoint              |
| `opencode_user`            | `{{ ansible_env.SUDO_USER \| default(ansible_user_id) }}` | account that gets the per-user payload (`""` = binary only) |
| `opencode_keep_backup`     | `true`                     | keep `opencode.bak.<ver>` on upgrade           |
| `opencode_force_reinstall` | `false`                    | re-copy the binary even if the version matches |

All defaults are in `roles/opencode/defaults/main.yml`.

## Tests

Molecule scenarios (Docker), one isolated container each:

```bash
make test             # all four scenarios
make test-install     # fresh install + per-user reconcile of seeded collisions
make test-upgrade     # stub old binary → pinned version, backup created
make test-config      # config-only change: binary untouched, no backup pile-up
make test-uninstall   # binary + user payload removed
make try              # run the install scenario in Docker, export to ./tmp_test
```

Shared prep lives in `tests/resources/prepare_host.yml`.
