# opencode — Architecture

A simple, high-level view of **what an opencode install is made of** and the two
services it talks to. This is a *what*, not a *how* — for the deployment mechanics
see the [README](../README.md).

## ASCII diagram

```text
        ┌──────────────────────────────────────────────────────────────┐
        │                       o p e n c o d e                        │
        │           self-contained · offline AI coding agent           │
        └──────────────────────────────────────────────────────────────┘
                                   ships with

        ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
        │      Config      │   │     Commands     │   │      Skill       │
        │                  │   │                  │   │                  │
        │ offline-hardened │   │ /commit  /explain│   │ ai-marketplace   │
        │ safe permissions │   │ /fix     /mr     │   │ (installable via │
        │ points at 2 URLs │   │ /review  /test   │   │  the marketplace)│
        └──────────────────┘   └──────────────────┘   └──────────────────┘

        ┌────────────────────────┐                         ┌──────────────────────┐
        │  Plugin · Local Model  │                         │     LLM Gateway      │
        │                        │                         │                      │
        │ auto-discovers models  │ ──── models + chat ───▶ │ OpenAI-compatible    │
        │ from the gateway       │                         │ model provider       │
        └────────────────────────┘                         └──────────────────────┘

        ┌────────────────────────┐                         ┌──────────────────────┐
        │  Plugin · Marketplace  │                         │     Marketplace      │
        │                        │                         │                      │
        │ installs & syncs       │ ──── skills sync ─────▶ │ skills registry      │
        │ skills on demand       │                         │                      │
        └────────────────────────┘                         └──────────────────────┘

   Legend:  ┌─┐ ships inside opencode        ──▶ talks to (local service)
            The two gateways are the only outside connections; all else is offline.
```

## What each piece is

| Piece | What it is |
| --- | --- |
| **opencode** | The AI coding agent itself — runs fully offline, no calls off-box. |
| **Config** | Managed settings: offline hardening, safe-by-default permissions, and the two service URLs. |
| **Commands** | Slash commands bundled in: `/commit`, `/explain`, `/fix`, `/mr`, `/review`, `/test`. |
| **Plugin · Local Model** | Connects opencode to the **LLM Gateway** and auto-discovers the available models. |
| **Plugin · Marketplace** | Installs and syncs skills from the **Marketplace**. |
| **Skill** | The bundled `ai-marketplace` skill (more can be installed via the marketplace). |
| **LLM Gateway** | A local OpenAI-compatible model provider — where the models actually run. |
| **Marketplace** | A local skills registry the marketplace plugin pulls from. |

> An editable version of this diagram is in [`opencode-ansible.drawio`](./opencode-ansible.drawio)
> — open or import it at [diagrams.net](https://app.diagrams.net).
