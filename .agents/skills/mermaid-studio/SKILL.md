---
name: mermaid-studio
description: Create a Mermaid diagram by opening a local Mermaid Studio preview when a user asks for a Mermaid diagram or Mermaid visualization.
---

# Mermaid Studio

When a user asks for help creating a Mermaid diagram or visualization, launch the bundled local preview with:

```sh
node .agents/skills/mermaid-studio/launcher.js
```

The launcher starts a loopback-only server and opens its URL in the default browser. The preview intentionally shows one fixed starter flow; it is a rendering smoke test, not an editor. On a new checkout, install dependencies first with `pnpm install` (or the project's documented pnpm runtime) so the pinned Mermaid renderer is available.

Do not add editing, persistence, file access, imports, exports, clipboard operations, sessions, live updates, or model/API calls to this skill.
