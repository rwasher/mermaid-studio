# Implementation plan

## Proposed outcome

Mermaid Studio will be a local Node server and browser workspace launched by a Codex skill. A user can ask for a Mermaid diagram, receive an empty editable workspace, and iteratively refine it with the agent while retaining safe direct edits in the source editor. The workspace will render Mermaid using an official, pinned Mermaid package; it will not call a separate model API.

The initial supported environment is macOS and Codex. The installable skill will bundle its executable helpers and prebuilt browser dependencies so it is self-contained. Session state stays outside the installed package. Later work can make the same package portable and suitable for optional plugin or team distribution.

The server will be local-only. As write-capable features arrive, file access will remain restricted to explicit local paths and writes will require token and origin checks. Rendering will preserve the last valid preview when new text is invalid, show useful syntax feedback, and use revisions so an agent never overwrites a newer human edit. File updates will re-read current source and use optimistic concurrency.

Mermaid syntax guidance will be tied to the [official Mermaid documentation](https://mermaid.js.org/intro/). The skill follows the local Codex skill model described in the [official Codex documentation](https://developers.openai.com/codex/skills/).

## Delivery protocol

Work is proposed as small, sequential local branches. The coordinator dispatches one `gpt-5.6-luna` medium-reasoning implementer at a time with compact context, reviews the result locally, verifies relevant acceptance checks, sends targeted corrections to the same worker when needed, and merges only after review. There are no parallel workers and no stacked branches: every new branch starts from the latest reviewed local `main`. Workers do not merge their own branches. Use `treehouse` for worktrees when installed; otherwise use local sequential branches. GitHub pull requests, if later requested, must be drafts and follow the ancestor repository template; a PR is not required for each local branch.

No implementation branch begins until the user has agreed to this plan. Branch 01 supplies only planning documentation. It may become the first root commit. After review and user agreement, the coordinator may create local `main` at that reviewed commit; no work is committed directly to `main`.

Before each dispatch, the coordinator checks account usage. Pause when five-hour remaining usage is at or below 15%, retaining capacity for review and checkpointing. Never purchase credits or consume a reset without explicit user authorization. A weekly limit is separate; a five-hour reset does not resolve it. Manual `resume mermaid-studio` remains the reliable continuation path. A same-task scheduled wakeup is optional only when the user explicitly requests it, and cannot be guaranteed while the host is unavailable.

Each worker handoff records its commit, checks run, and risks. The durable status file records the current and next branch, commit, worktree, checks, review disposition, and exact next action before every pause and after every merge. This lets work resume without a live worker.

### Reusable worker assignment

Give each implementer: branch name; reviewed `main` base; the applicable plan-row scope, exclusions, and acceptance checks; allowed paths; and compact task-specific context. Instruct the worker to implement only that scope, commit its implementation, never merge, and hand off the commit hash, checks run, and risks. Branch 01 is the documentation-only exception: its worker does not commit; the coordinator commits the reviewed proposal for user agreement before establishing `main`.

## Sequential branch plan

| Branch | Goal | Included scope | Excluded scope | Depends on | Observable acceptance checks |
| --- | --- | --- | --- | --- | --- |
| `rwasher/01-initialize-plan` | Establish agreed delivery plan. | README, plan, status protocol, ignore rules. | Application code, package setup, commits by worker. | None. | Docs state planning status, narrow branch sequence, and review protocol. |
| `rwasher/02-rendering-spike` | Prove the smallest skill-to-browser rendering path. | Skill, minimal local server/launcher, one fixed simple Mermaid example, browser-opening stub, headless render check, first-run dependency note. | Editor, empty start, persistence, live updates, imports/exports, frameworks, abstractions. | 01 reviewed and plan agreed. | Invoking the skill opens a local page that renders the fixed example; headless check confirms rendered output. |
| `rwasher/03-file-backed-empty-workspace` | Start a workspace with an empty diagram source file. | Create an empty `.mmd` source, or bind an explicitly selected existing `.mmd` without truncating it; empty initial view for newly created sources. | Agent updates, editable editor, export. | 02. | A new request creates an empty `.mmd`; opening an existing source preserves its bytes and renders it. |
| `rwasher/04-agent-source-update` | Let the skill update a selected workspace source. | Skill reuses the current session; server push or client polling updates the existing tab from agent-written source. | Direct editing, conflict handling, imports/exports. | 03. | Two successive agent changes update the same open tab with no reload or navigation. |
| `rwasher/05-split-editor-autosave` | Add synchronized human editing. | Source editor on the left, preview on the right, debounced autosave and live render. | Conflict policy, import/export. | 04. | Editing source in the browser updates the saved `.mmd` and preview without a page reload. |
| `rwasher/06-revision-conflict-safety` | Prevent agent writes from clobbering human edits. | Revision metadata, source re-read, optimistic concurrency, visible conflict outcome. | Multi-user collaboration. | 05. | A stale agent update is rejected or reconciled without replacing a newer editor change. |
| `rwasher/07-render-status-and-errors` | Make invalid syntax understandable and safe. | Syntax status, diagnostic display, last-valid preview behavior, revision-aware render ordering. | Advanced linting. | 06. | Invalid text reports an error and does not replace the last valid diagram; a later valid revision recovers. |
| `rwasher/08-resume-and-reconnect` | Operate sessions independently of an active agent turn. | Explicit stop, health check, duplicate-start reuse, stale-server recovery, reconnect/resume, external lifecycle state, and isolation for simultaneous separate sessions. | Cross-machine sync. | 07. | A healthy launch reuses one server; a stale server recovers; stop works; two sessions retain separate sources; browser/server restart resumes the selected workspace. |
| `rwasher/09-source-copy` | Copy complete Mermaid source. | Copy-source control and browser-visible success/failure state. | Diagram image clipboard. | 08. | Copied text equals the current `.mmd` source. |
| `rwasher/10-file-import` | Import an explicit local Mermaid file. | Browser upload/import flow copies selected `.mmd` contents into the active workspace, with clear error state. | Paste import or treating the browser-uploaded file as an absolute writable path. | 09. | Selecting a valid `.mmd` copies its content into the active workspace and renders it. |
| `rwasher/11-paste-import` | Import Mermaid source from pasted text. | Paste flow, source replacement status, normal revision handling. | Additional file formats. | 10. | Pasted valid Mermaid becomes the active source and renders. |
| `rwasher/12-svg-export` | Export the current valid diagram as SVG. | SVG generation/download and invalid-state handling. | PNG export or clipboard. | 11. | An exported SVG opens as the currently rendered diagram. |
| `rwasher/13-png-export` | Export the current valid diagram as PNG. | PNG conversion/download and dimensions appropriate to the render. | Clipboard. | 12. | An exported PNG is non-empty and visually matches the diagram in headless inspection. |
| `rwasher/14-clipboard-export` | Copy export data to the system clipboard. | PNG clipboard copy, Copy SVG source as text, download fallback, and clipboard permission/result feedback; Copy all Mermaid source remains available. | Non-macOS clipboard support. | 13. | On supported macOS, pasting after PNG copy yields an image; SVG copy yields SVG text; download fallback works. |
| `rwasher/15-syntax-skill-refinement` | Teach the skill to request valid, renderer-specific Mermaid. | Pinned renderer version reference, concise syntax guidance and error-recovery prompts. | A custom Mermaid parser. | 14. | Representative skill prompts produce source accepted by the pinned renderer. |
| `rwasher/16-distributable-package` | Make the local workflow installable as a self-contained skill. | Bundled helpers and browser dependencies, documented install/update, external session state. | Publishing or team rollout. | 15. | A clean local install follows the docs and launches the existing workflow without downloading runtime browser assets. |
| `rwasher/17-integration-portability-docs` | Close the local release and document next portability work. | End-to-end check, operational/security documentation, macOS limitations, plugin/team distribution proposal. | Publishing, remote service, non-macOS implementation. | 16. | A fresh macOS Codex walkthrough covers creation, edits, recovery, import, and export; docs name remaining portability work. |

The branch names and slices are proposed, not agreed. The coordinator may refine a later slice only if it preserves the small sequential workflow and records the change in `STATUS.md`.
