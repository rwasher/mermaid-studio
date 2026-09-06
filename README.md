# Mermaid Studio

Mermaid Studio is a packaged local, browser-based Mermaid workspace that a Codex skill can open and update during a conversation. The supported release workflow is documented in [the macOS operations guide](docs/OPERATIONS.md).

The proposed product starts empty, keeps editable Mermaid source beside a live preview, and supports `.mmd` files, imports, source copying, SVG/PNG export, and PNG clipboard copying. It will use the official Mermaid renderer rather than a separate model API.

The current target is macOS with Codex. Portability and team distribution remain documented follow-on work; this repository does not publish a plugin or run a remote service.

The local workflow, syntax recovery, lifecycle handling, imports, and exports are implemented. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) and [current status](docs/STATUS.md) for release review state.

The skill can be installed locally by copying `.agents/skills/mermaid-studio` into `$HOME/.codex/skills/mermaid-studio` and running `npm install --prefix "$HOME/.codex/skills/mermaid-studio" --omit=dev --ignore-scripts`. This installs the pinned Mermaid renderer once; launch uses an existing macOS browser and does not download Playwright browser assets.

License: TBD.
