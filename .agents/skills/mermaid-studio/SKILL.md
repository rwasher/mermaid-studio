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

After launch, keep using the same selected absolute path for agent edits. Write complete Mermaid source through the bundled updater; it reads source from standard input and updates the already-open tab by polling the local server:

```sh
printf '%s\n' 'flowchart LR' '  A[Start] --> B[Finish]' | node .agents/skills/mermaid-studio/update.js /absolute/path/workspace.mmd
```

For multiline user-requested changes, pass the complete source through standard input (for example, a quoted heredoc). Repeat the command with the same path for each update. The updater requires an existing absolute `.mmd` file; it does not choose a file or open a browser tab. Wait briefly for the preview to reflect each write before sending the next update.
