# opencode-ansible

Install a pinned, self-contained **opencode** across a Linux x86_64 workstation
fleet, fully offline. The binary goes to `/usr/local/bin`; each machine's primary
user gets a managed `~/.config/opencode/` payload with the plugin runtime
pre-staged, so nothing is fetched at startup.

| Path                                                            | Contents                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/usr/local/bin/opencode`                                       | the binary, system-wide, on PATH for every user                     |
| `/usr/local/bin/marketplace`                                    | the `!marketplace` bang-shell wrapper, next to the binary (on PATH)  |
| `~/.config/opencode/opencode.jsonc`                             | managed, offline-hardened config (permissions + provider)           |
| `~/.config/opencode/marketplace.json`                           | marketplace plugin endpoint config (read by the drop-in plugin)     |
| `~/.config/opencode/{commands,plugins,instructions,skills}/`    | slash commands, bundled plugins, `AGENTS.md`, and skills            |
| `~/.config/opencode/node_modules/`, `~/.opencode/node_modules/` | `@opencode-ai/plugin` runtime, pre-staged                           |
| `~/.opencode/bin/opencode`                                      | symlink to the system binary (only if the user had their own)       |

## Deployment model

One machine per inventory entry, one primary user per machine. Every host must name
its `opencode_user`, the account that receives the payload. It has no default on
purpose: deriving it from the connection would silently deploy into the automation
account's home when an admin runs the play, so `preflight` asserts it instead.

How to reach a host (login account, key, port) belongs in `~/.ssh/config` under the
same alias, or in `ansible_user` if you prefer it inline. The inventory stays about
who gets what.

## Quick start

```bash
make setup        # one-time: uv + .venv (control node)
make fetch        # download binary + build plugin runtime (needs internet + npm)
```

The binary and deps tarball are **not committed** (too large for git), so run
`make fetch` where there is internet, then deploy offline. List your machines in
`inventory/hosts.yml`, set `opencode_provider_url` in `group_vars/workstations.yml`,
then:

```bash
make check                                                  # dry-run (--check --diff)
uv run ansible-playbook -i inventory/hosts.yml site.yml     # apply
```

Targets need Linux x86_64, SSH + sudo, no internet. Control node needs Ansible >= 2.12.

### Artifacts outside the repo

To keep the binary out of the checkout, fetch into a shared location and point
Ansible at the same path:

```bash
make fetch ARTIFACT_DIR=/srv/artifacts/opencode
# and set opencode_artifact_dir: /srv/artifacts/opencode in group_vars
```

If that path is a volume mounted on the targets rather than on the controller, add
`opencode_artifact_remote: true` and nothing crosses the wire; `preflight` then
stats the paths on each target instead. Pass `SKIP_ARTIFACT_CHECK=1` so the
Makefile stops looking for them locally.

## Operations

Fleet operations are plain `ansible-playbook` runs, so you can add `--limit`,
`--tags`, `-K`, or anything else Ansible accepts:

```bash
# deploy everything, or --limit to one host or group
uv run ansible-playbook -i inventory/hosts.yml site.yml
uv run ansible-playbook -i inventory/hosts.yml site.yml --limit alice-laptop

# remove the binary + that user's payload
uv run ansible-playbook -i inventory/hosts.yml uninstall.yml --limit alice-laptop
```

**Upgrade**: bump `opencode_version` in `roles/opencode/defaults/main.yml`, run
`make fetch` to pull the matching binary and plugin runtime, then deploy. `detect`
sees the version change and keeps the old binary as `opencode.bak.<old_version>`
(unless `opencode_keep_backup: false`); the plugin runtime re-stages itself.

**Config-only change**: edit the URLs in `group_vars/workstations.yml` and deploy.
The binary is untouched, only `opencode.jsonc` is re-rendered.

The Makefile keeps the local development loop:

```bash
make check   # dry-run against the inventory (--check --diff, no sudo)
make local   # trial install into ./tmp/local (no sudo, nothing system-wide)
make lint    # yamllint + ansible-lint
make test    # all four Molecule scenarios (needs Docker)
```

## How the role works

`roles/opencode/tasks/main.yml` imports five stages in order:

1. **`preflight`** check the artifacts exist (on the controller, or on the target
   when `opencode_artifact_remote`), require `opencode_user`, resolve their home
   from the passwd database
2. **`detect`** read the installed version, compute `install` / `upgrade` / `none`
3. **`install_binary`** back up the old binary on upgrade, copy the pinned one in
4. **`install_config`** deploy the per-user payload, pulling in
   **`_install_plugin_runtime`** once per runtime location
5. **`verify`** smoke-test `opencode --version` and print a summary

Files prefixed with `_` are helpers included from a stage, not stages themselves.

### Ownership

The role owns the binary and `opencode_user`'s config. Anything pre-existing is
moved aside to a timestamped `*.bak` rather than deleted:

- a user-installed `~/.opencode/bin/opencode` is backed up and replaced with a
  symlink to `{{ opencode_bin_path }}`, so their PATH launches the pinned binary
- a hand-authored `opencode.jsonc` is backed up before the managed one is rendered
- a stray `opencode.json` is moved aside (the role owns the `.jsonc`)

The `commands/`, `plugins/`, `instructions/`, and `skills/` trees are role-managed
and same-named files are overwritten, so keep customizations under a different
filename or in a project-level config. `skills/` is shared with the marketplace
plugin, so bundles added with `!marketplace install` survive a redeploy.

Extend the payload by dropping files into
`roles/opencode/files/{plugins,commands,skills}/`.

## Tests

Molecule scenarios (Docker), one isolated container each:

```bash
make test             # all four scenarios
make test-install     # fresh install + per-user reconcile of seeded collisions
make test-upgrade     # stub old binary to pinned version, backup created
make test-config      # config-only change: binary untouched, no backup pile-up
make test-uninstall   # binary + user payload removed
```

Shared prep lives in `tests/resources/prepare_host.yml`.

## Key variables

| Variable                       | Default                                                    | Description                                                |
| ------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `opencode_user`                | **required**                                               | account that gets the per-user payload (set it per host)   |
| `opencode_version`             | `1.17.11`                                                  | pinned version (`make fetch` to change)                    |
| `opencode_bin_path`            | `/usr/local/bin/opencode`                                  | system binary location                                     |
| `opencode_bin_owner` / `_group` | `root`                                                    | who owns the binary (lowered only by `make local`)         |
| `opencode_provider_url`        | `http://localhost:8000/v1`                                 | local OpenAI-compatible endpoint                           |
| `opencode_marketplace_url`     | `http://localhost:8000`                                    | skill-marketplace plugin endpoint                          |
| `opencode_artifact_dir`        | `{{ role_path }}/files`                                    | where the binary + deps archive live (e.g. a shared mount) |
| `opencode_binary_src`          | `{{ opencode_artifact_dir }}/opencode`                     | full path to the binary, if the filename differs           |
| `opencode_runtime_archive_src` | `{{ opencode_artifact_dir }}/opencode-dependencies.tar.gz` | full path to the deps archive                              |
| `opencode_artifact_remote`     | `false`                                                    | `true` = artifacts are on the targets, not the controller  |
| `opencode_keep_backup`         | `true`                                                     | keep `opencode.bak.<ver>` on upgrade                       |

All defaults are in `roles/opencode/defaults/main.yml`.
