# Mermaid Studio local release

This is the macOS Codex walkthrough for the packaged local skill. It assumes an existing macOS browser that can load ES modules (Google Chrome is the tested default) and a Node.js installation with `npm`. Mermaid Studio is local to one Mac: the browser talks to a loopback HTTP server and the server reads and writes the selected `.mmd` file.

## Install once

From a checkout of this repository, install the packaged skill and its pinned renderer:

```sh
mkdir -p "$HOME/.codex/skills/mermaid-studio"
cp -R .agents/skills/mermaid-studio/. "$HOME/.codex/skills/mermaid-studio/"
npm install --prefix "$HOME/.codex/skills/mermaid-studio" --omit=dev --ignore-scripts
```

The installed package is self-contained. The install copies `mermaid@11.17.2`; launch does not run Playwright or download a browser. When updating, repeat the copy and install after reviewing the pinned version. Keep source files outside the skill directory so an update cannot replace a workspace.

## Fresh workspace and conversational updates

Choose an absolute path ending in `.mmd`, then ask Codex for a Mermaid diagram. The skill opens an empty workspace and keeps the source in that file:

```sh
node "$HOME/.codex/skills/mermaid-studio/launcher.js" --new "/Users/you/Documents/mermaid/checkout.mmd"
```

For an existing diagram, use `--file`; the launcher reads the current bytes and renders them without truncating the file:

```sh
node "$HOME/.codex/skills/mermaid-studio/launcher.js" --file "/Users/you/Documents/mermaid/checkout.mmd"
```

In the conversation, describe the diagram and then request refinements. Codex should use one of the six supported declarations (`flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `erDiagram`, or `gantt`), read the current revision, and write a complete replacement. A revision conflict means the browser or another writer changed the file; re-read it and resolve the difference before trying again.

For a direct agent update, the installed helper accepts the complete source on standard input. Read a revision for every write:

```sh
SKILL="$HOME/.codex/skills/mermaid-studio"
FILE="/Users/you/Documents/mermaid/checkout.mmd"
revision=$(node "$SKILL/update.js" --read "$FILE" | node -e "let d=''; process.stdin.on('data', c => d += c); process.stdin.on('end', () => process.stdout.write(JSON.parse(d).revision))")
printf '%s\n' 'flowchart LR' '  A[Start] --> B[Finish]' | node "$SKILL/update.js" --revision "$revision" "$FILE"
```

The browser editor is the other supported writer. Edit the left pane; after a short debounce it saves the same file and renders without navigation. `Copy Mermaid source` copies the complete editor contents. `Paste Mermaid source` replaces the editor from the browser text clipboard and saves it. `Import Mermaid file` reads a selected `.mmd` file in the browser and saves its contents into the active workspace. Imports are content based; they do not turn the uploaded file into a new server path.

## Syntax recovery

An empty source shows `Empty workspace`. For invalid Mermaid, the status starts with `Unable to render workspace:` and the last valid preview remains visible. Fix the source in the editor or ask Codex to repair only the invalid syntax, then wait for `Workspace rendered.` or `Workspace saved and rendered.` before continuing. Export and copy controls are enabled only for the current valid render.

## Stop, reconnect, and separate sessions

Stop the selected workspace explicitly when finished:

```sh
node "$HOME/.codex/skills/mermaid-studio/launcher.js" --stop "/Users/you/Documents/mermaid/checkout.mmd"
```

Launching the same existing path again checks its saved loopback `/health` endpoint and reuses a healthy server. If the saved endpoint is stale, the launcher removes that lifecycle record and starts a fresh server. A browser restart can reconnect by opening the saved local URL; the page reloads the current file contents. Each absolute path has a separate lifecycle record, so two `.mmd` files remain separate sessions. Lifecycle records are in the OS temporary directory, mode `0700` for the directory and `0600` for each record, and are disposable runtime state.

## Export and clipboard actions

After a valid render, use `Export SVG` or `Export PNG` to download `mermaid-diagram.svg` or `mermaid-diagram.png`. `Copy SVG` writes serialized SVG text to the browser clipboard. `Copy PNG` writes a PNG image when the browser exposes image clipboard support; otherwise it downloads the PNG and reports the fallback in the status line. Browser clipboard permission can reject any copy or paste request; use the status message or the download controls in that case.

## Operational and security boundaries

- The server binds to `127.0.0.1` and serves the selected source plus the bundled Mermaid module. It is not a remote collaboration service.
- The launcher accepts exactly one absolute local `.mmd` path. The update endpoint requires JSON with only `source` and `revision`, limits the body to 1,000,000 bytes, and rejects stale revisions with HTTP 409.
- The stop endpoint requires the per-session lifecycle token. Do not share lifecycle files or local URLs; anyone who can use the local browser profile or reach the loopback port can interact with that session.
- Mermaid runs with `securityLevel: 'strict'`. Treat diagrams and imported files as untrusted text, and avoid placing secrets in source or exported artifacts.
- The browser file picker reads the chosen file contents only. It accepts `.mmd` by filename and replaces the active workspace; it does not grant the server arbitrary filesystem access.
- Back up important `.mmd` files. A successful browser save replaces the file contents, and direct edits outside the browser can produce a revision conflict that needs manual resolution.

## macOS and browser limitations

This release supports the local macOS/Codex workflow only. It uses macOS `open` to launch the default browser, requires Node.js and a browser that supports ES modules, and does not provide a Windows, Linux, remote-server, or hosted deployment path. Clipboard APIs depend on browser permission and support; PNG copy has the documented download fallback. A browser or server restart can be resumed only when the selected file and this Mac remain available. The responsive page collapses to one column on narrow windows, but it is still a desktop local workspace rather than a mobile application.

## Team and plugin distribution proposal

The packaged `.agents/skills/mermaid-studio` directory is the distribution unit to review. A practical future path is:

1. Keep the skill and its pinned `package.json` in this repository. On each release, run the package check, the full test suite, and a clean-copy install in a temporary directory.
2. Build a versioned plugin wrapper whose only initial payload is this skill, the install instructions, and a short macOS compatibility note. Review the wrapper and skill together before making it available to a team catalog.
3. Give each team member the same reviewed artifact and a documented update command. Record the Mermaid version and checksum in the release notes so local installs can be compared.
4. Add a later portability project for browser discovery, lifecycle storage, and clipboard behavior on other operating systems. A remote service, publishing workflow, and non-macOS support are intentionally outside this release.

This proposal closes tracking issue #32 without publishing an artifact, registering a plugin, or changing the runtime. It records the smallest rollout path that preserves the current local security boundary.
