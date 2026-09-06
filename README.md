# Mermaid Studio

Mermaid Studio is in planning. It will provide a local, browser-based Mermaid workspace that a Codex skill can open and update during a conversation.

The proposed product starts empty, keeps editable Mermaid source beside a live preview, and supports `.mmd` files, imports, source copying, SVG/PNG export, and PNG clipboard copying. It will use the official Mermaid renderer rather than a separate model API.

The initial target is macOS with Codex. Portability and team distribution are planned after the local workflow is proven.

The fixed-rendering spike is implemented, and the file-backed empty workspace branch is pending review. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) and [current status](docs/STATUS.md) for progress.

License: TBD.
