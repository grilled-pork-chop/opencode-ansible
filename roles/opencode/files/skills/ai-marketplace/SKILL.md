---
name: ai-marketplace
description: Discover, install, update, and remove OpenCode skills from the internal AI skills marketplace using the `marketplace` CLI. Use this skill whenever the user asks what skills are available, wants a skill for some task ("is there a skill for writing changelogs?"), asks to install/add/remove/uninstall/update a skill, asks whether their installed skills are current, or mentions the marketplace or a skill catalog at all — even when they don't name the marketplace explicitly and even if they just describe a capability they wish they had.
---

# AI Skills Marketplace

The `marketplace` command is a wrapper installed on `PATH` by the opencode-marketplace
plugin. It talks to an internal skills marketplace over HTTP and manages `SKILL.md`
bundles on disk. You run it directly with your Bash tool — it is fast, deterministic,
and never invokes a model.

## The one thing that trips people up

Every doc, help screen, and error message in this plugin writes the commands as
`!marketplace list`. **That leading `!` is OpenCode prompt syntax for the human** — it
tells OpenCode to run a shell command without starting an agent turn. It is not part of
the command.

When you run these from Bash, drop the `!`:

```bash
marketplace list          # correct
!marketplace list         # wrong — bash history expansion, will fail
```

Only reproduce the `!` form when you're quoting a command for the *user* to type.

## Commands

```bash
marketplace list [--category <c>] [--tag <t>]
marketplace install <name> [--scope global|project]
marketplace remove <slug> [--scope global|project]
marketplace sync
```

Run with no arguments to print usage. If `marketplace: command not found`, the plugin
hasn't generated its wrapper yet — the user needs to restart OpenCode once, since the
wrapper is written on session start.

### Scope

`--scope` decides where a skill lands, defaulting to whatever `default_scope` is
configured (usually `global`):

| Scope | Location | Use when |
| --- | --- | --- |
| `global` | `~/.config/opencode/skills/` | The user wants it everywhere. The default. |
| `project` | `<project>/.opencode/skills/` | The skill is specific to this repo, or the user wants it committed alongside the code. |

If the user's phrasing points one way ("for this project", "everywhere", "just here"),
pass the flag explicitly rather than relying on the default.

**In an airgapped environment, project scope is not available — install global.** Don't
offer `--scope project` there, and if the user asks for it, explain why and install
global instead. Global scope is the only path that works end to end in that setup, so
routing around it produces an install the user can't actually load.

One more trap with project scope anywhere: it resolves against the *CLI process's*
working directory (`<cwd>/.opencode/skills`), not the session's project root. When you
invoke `marketplace` from Bash, your cwd is whatever the tool happens to be sitting in —
so confirm you're at the project root before passing `--scope project`, or the skill
lands in a `.opencode/skills` folder somewhere the user will never find it.

## Reading results correctly

**The CLI reports failures as ordinary output text, not as a non-zero exit.** A network
error, a missing skill, an unreachable endpoint — all come back as a line starting with
`Marketplace command failed: …`. If you only check the exit code you will confidently
report a success that never happened. Read the output text.

Relay two things verbatim when they appear, because the user needs them and cannot see
your tool output:

1. **The install path.** `install` prints where it wrote (`→ /home/you/.config/opencode/skills/foo`).
   This is the user's filesystem being modified; say where.
2. **The executable-file warning.** Bundles may ship `scripts/` or `.sh/.js/.py/.ts`
   helpers, and `install` flags them with `⚠ This bundle ships executable helper
   file(s)`. Pass that list along and don't run any of those files unless the user asks
   you to — the marketplace is a distribution channel, and a skill bundle arriving with
   executables is exactly the thing worth a second look.

## Behaviors worth knowing before you act

**Installs take effect next session.** OpenCode discovers skills at startup. A skill you
install right now is on disk but not loadable in this session. Never tell the user they
can use it immediately — say it's available next session, and offer that they restart if
they want it now.

**Install is a clean wipe-and-extract.** Installing over an existing skill deletes the
slug folder first. That makes re-installing the correct way to *update* a skill, but it
also means any local edits the user made to an installed skill are destroyed with no
backup. If you have reason to think they've customized it, check with them first.

**`sync` reports, it doesn't update.** It lists skills with newer revisions available.
Applying an update means running `install <name>` again.

**`sync` fails quietly when the marketplace is unreachable.** It runs all checks in
parallel under a ~1.5 s budget and returns whatever came back in time, so an offline or
slow endpoint yields "All installed marketplace skills are up to date." If the network is
in question, treat a clean sync as inconclusive rather than as proof everything is
current.

**`list` gives names and descriptions only** — no skill bodies. That's usually enough to
judge fit. If it genuinely isn't, say so rather than installing something speculatively
just to read it.

**`install` takes the marketplace name; `remove` takes the installed slug.** They're
normally the same string. When removing, prefer a slug you've actually seen in the
install output or on disk over one you inferred from the catalog.

## Working the request

When the user wants a capability, `list` first and match against descriptions. Don't
guess at a skill name and try to install it — a wrong name is a round-trip and a
confusing error, while `list` is one cheap call that also lets you tell them what *else*
is close if nothing matches exactly.

When nothing in the catalog fits, say that plainly. Inventing a near-match and installing
it is worse than an honest "nothing in the marketplace covers this."

After a `remove`, note that it also takes effect next session — the skill stays live in
the current one.

## Reporting back

Keep it short. The user cares about what changed on their disk and what they can do next:

```
Installed `changelog-writer` (revision 3) → ~/.config/opencode/skills/changelog-writer/
Available in your next OpenCode session.

⚠ Ships executable helpers — review before running:
  • scripts/build_changelog.py
```

If the user is browsing rather than acting on one thing — comparing several skills,
installing a batch — mention they can drive it themselves with `!marketplace list` and
friends typed straight into the prompt. That path skips the model entirely, which is
faster than routing each command through you.
