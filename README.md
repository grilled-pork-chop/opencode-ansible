# opencode-ansible

Install a pinned, self-contained **opencode** for a chosen set of users across
your Linux fleet — fully offline. The repo ships everything it deploys: the
binary and the per-user payload (config + commands + instructions + plugins).

No internet on the targets. Ansible just:

1. copies the binary to `/usr/local/bin/opencode` (on PATH for everyone),
2. writes the payload into each listed user's `~/.config/opencode/`, and
3. pre-stages opencode's plugin runtime (`@opencode-ai/plugin` + deps) in each
   user's `~/.opencode/` so it never tries to `npm install` at startup.

## Layout

```
roles/opencode/
├── defaults/main.yml          # version + provider/model + opencode_users
├── files/
│   ├── opencode               # the binary (make fetch)   → /usr/local/bin/opencode
│   ├── opencode-home.tar.gz   # plugin runtime (make fetch) → ~/.opencode/
│   ├── commands/              # slash commands            ┐
│   ├── instructions/          # AGENTS.md guidance        ├─ → ~/.config/opencode/
│   └── plugins/               # plugins (local-model)     ┘
├── templates/
│   └── opencode.jsonc.j2      # config (provider URL substituted)
└── tasks/{main,deploy_user}.yml
```

The config (`opencode.jsonc`) is air-gap hardened: `autoupdate:false`,
websearch/webfetch denied, a safe-by-default bash allow/ask/deny policy. The
bundled **local-model-discovery** plugin auto-discovers models from the
configured OpenAI-compatible endpoint.

## Usage

```bash
make setup                       # one-time: uv + .venv (control node only)
make fetch                       # download binary + build plugin deps (needs internet + npm)
```

The binary and the plugin runtime are **not** committed (too large for git);
`make fetch` downloads the binary and builds `opencode-home.tar.gz`
(`@opencode-ai/plugin@<opencode_version>`) into `roles/opencode/files/`. Run it on
a machine with internet + `npm`, then deploy offline. (`make deploy`/`check`/`test`
fail with a reminder if the artifacts are missing.)

1. Edit `inventory/hosts.yml` — add your hosts and the SSH user.
2. Edit `group_vars/workstations.yml`:
   - `opencode_provider_url` — your local LLM endpoint (models are auto-discovered
     by the bundled local-model plugin)
   - `opencode_users` — the accounts that get opencode configured
3. Deploy:

```bash
make check        # dry-run (--check --diff)
make deploy       # apply (HOSTS=group to limit)
```

That's it. Each listed user runs `opencode` from PATH; their
`~/.config/opencode/` has the config, commands, instructions, and plugins.

## Extending

- **New plugin** → drop a file/folder into `roles/opencode/files/plugins/`.
- **New command** → drop into `roles/opencode/files/commands/`.
- **Upgrade opencode** → bump `opencode_version` in
  `roles/opencode/defaults/main.yml`, then `make fetch` (re-pulls the binary and
  rebuilds the matching plugin runtime). On targets, clear `~/.opencode/node_modules`
  to force the new runtime in (the staging step is `creates:`-guarded).

No task edits needed for any of these.

## Try it locally (no root, no changes to your machine)

Isolation lives in the test harness, not the role. `make try` runs the **real
role** inside a throwaway Docker container, then copies the result out to
`./tmp_test/` so you can browse exactly what gets installed:

```bash
make fetch        # if you haven't already
make try          # run the role in a container, export to ./tmp_test (needs Docker)

find tmp_test                                   # the installed tree, locally
./tmp_test/usr/local/bin/opencode --version
make clean        # destroy the container and remove ./tmp_test
```

`./tmp_test` ends up holding the binary and `home/alice/.config/opencode/`
(opencode.jsonc, commands, instructions, plugins) — the real output of the role.
You can also open a live shell in the container:
`cd tests && uv run molecule login`.

`make test` runs the same role plus idempotence + automated checks, then destroys.

## Other targets

```bash
make lint         # yamllint + ansible-lint
make test         # Molecule install scenario (needs Docker)
make uninstall    # remove the binary + each user's ~/.config/opencode and ~/.opencode
```

## Requirements

- Build machine (runs `make fetch`): internet + `npm`.
- Control node: `uv` (the Makefile bootstraps it), Ansible ≥ 2.12.
- Targets: Linux x86_64, SSH + sudo. No internet required.
