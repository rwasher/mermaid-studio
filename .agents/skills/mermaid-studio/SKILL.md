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

After launch, keep using the same selected absolute path for agent edits. Read the current source revision before an update, then include that revision when writing so a newer browser edit is reported as a conflict instead of being overwritten:

```sh
revision=$(node .agents/skills/mermaid-studio/update.js --read /absolute/path/workspace.mmd | node -e "let d=''; process.stdin.on('data', c => d += c); process.stdin.on('end', () => process.stdout.write(JSON.parse(d).revision))")
printf '%s\n' 'flowchart LR' '  A[Start] --> B[Finish]' | node .agents/skills/mermaid-studio/update.js --revision "$revision" /absolute/path/workspace.mmd
```

For multiline user-requested changes, pass the complete source through standard input (for example, a quoted heredoc). Re-read the revision for each update and stop to report a conflict if the expected revision is stale. The updater requires an existing absolute `.mmd` file; it does not choose a file or open a browser tab. Wait briefly for the preview to reflect each write before sending the next update.

The browser also provides a Mermaid source editor on the left and a rendered preview on the right. The user can edit the source directly; changes render immediately and save to the same selected `.mmd` file after a short debounce. Continue using the bundled updater for agent changes, and allow a brief polling interval for the open preview to reflect each write.
