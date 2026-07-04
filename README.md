# opencode-ansible

Install a pinned, self-contained **opencode** for a set of users across your
Linux fleet — fully offline. Ansible copies the binary to `/usr/local/bin`,
writes each user's `~/.config/opencode/` payload (config, commands, instructions,
plugins, skills), and pre-stages the dependency runtime so nothing is fetched at
startup.

## Versions

| Component | Version | Notes |
|---|---|---|
| opencode | `1.17.11` | set in `roles/opencode/defaults/main.yml`; `make fetch` to upgrade |
| `@opencode-ai/plugin` + `sdk` | `1.17.11` | bundled in `opencode-dependencies.tar.gz` (built by `make fetch`) |
| `openspec` CLI | `1.5.0` | required on targets for the `opsx-*` / `openspec-*` skills — **not** bundled; install separately |
| Node / npm | `24.x` / `11.x` | build machine only (`make fetch`) |

## Quickstart

```bash
make setup        # one-time: uv + .venv (control node)
make fetch        # download binary + build deps (needs internet + npm)
```

Then edit `inventory/hosts.yml` (hosts + SSH user) and
`group_vars/workstations.yml` (`opencode_provider_url`, `opencode_users`), and:

```bash
make check        # dry-run (--check --diff)
make deploy       # apply (HOSTS=group to limit)
```

The binary and deps tarball are not committed (too large); run `make fetch` on a
machine with internet, then deploy offline.

## Extending

Drop files into `roles/opencode/files/{plugins,commands,skills}/` — no task edits
needed. To upgrade opencode, bump `opencode_version`, run `make fetch`, and clear
`~/.opencode/node_modules` + `~/.config/opencode/node_modules` on targets.

## Make targets

```bash
make try          # run the role in Docker, export result to ./tmp_test (needs Docker)
make test         # Molecule: converge + idempotence + verify (needs Docker)
make lint         # yamllint + ansible-lint
make uninstall    # remove the binary + each user's payload
make clean        # destroy container, remove ./tmp_test
```

## Requirements

- Build machine (`make fetch`): internet + Node/npm.
- Control node: `uv` (bootstrapped by the Makefile), Ansible ≥ 2.12.
- Targets: Linux x86_64, SSH + sudo, no internet. `openspec` CLI on PATH only if
  you use the OpenSpec commands/skills.
