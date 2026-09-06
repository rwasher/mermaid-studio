---
name: mermaid-studio
description: Create a Mermaid diagram by opening a local Mermaid Studio preview when a user asks for a Mermaid diagram or Mermaid visualization.
---

# Mermaid Studio

When a user asks for help creating a Mermaid diagram or visualization, choose one explicit local `.mmd` path and launch the bundled local preview with one of:

```sh
node .agents/skills/mermaid-studio/launcher.js --new /absolute/path/workspace.mmd
node .agents/skills/mermaid-studio/launcher.js --file /absolute/path/existing.mmd
```

`--new` creates an empty file using exclusive creation and opens an empty workspace. `--file` opens an existing `.mmd` without changing its bytes and renders its source on initial page load. The launcher requires exactly one absolute local `.mmd` path and rejects missing, ambiguous, or unsafe arguments. It starts a loopback-only server and opens its URL in the default browser. On a new checkout, install dependencies first with `pnpm install` (or the project's documented pnpm runtime) so the pinned Mermaid renderer is available.

Do not add editing, persistence, file access, imports, exports, clipboard operations, sessions, live updates, or model/API calls to this skill.
