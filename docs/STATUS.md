# Status

## Current checkpoint

| Field | Value |
| --- | --- |
| Status | Branch 14 clipboard export implementation is complete and pending coordinator review. |
| Current branch | `rwasher/14-clipboard-export` |
| Current commit | Pending local implementation commit (based on reviewed local main commit `cf27296`). |
| Repository | Public `rwasher/mermaid-studio`; origin uses GitHub SSH. |
| Tracking issue | Issue #26: copy the current valid Mermaid preview as PNG or SVG clipboard data. |
| Worktree | `/Users/rwasher/dev/mermaid-studio` |
| Worker changes | Branch 14 adds Copy PNG and Copy SVG controls. PNG uses a ClipboardItem image/png payload when supported and falls back to the existing PNG download path when rich clipboard support is unavailable; SVG copies serialized SVG text. Existing Mermaid source copying remains available. Export and clipboard controls share render-validity checks and status feedback. Focused mocked clipboard tests cover PNG payloads, SVG text, unavailable rich clipboard fallback, and invalid-state disabling. |
| Checks | Bundled serial headless suite: 25/25 passing; focused launcher suite: 22/22 passing; `git diff --check`: passing. Browser checks require the approved environment because sandboxed execution cannot bind loopback. |
| Review disposition | Pending coordinator review. |
| Next branch | `rwasher/15-syntax-skill-refinement`. |
| Exact next action | Coordinator reviews the branch 14 commit and either requests targeted corrections or merges it into local main. |

Unresolved risk: PNG clipboard support depends on browser permission and ClipboardItem support; the browser downloads the PNG when rich clipboard support is unavailable or denied after encoding. SVGs containing external resources can be rejected by the browser's canvas security model and the export reports that failure. The implementation targets supported macOS browser behavior only.

## Update protocol

Update this file before pausing work and after each merge. Keep the current checkpoint complete enough for a new coordinator or worker to continue without prior conversation context:

- current branch and commit;
- worktree path and worker identity when assigned;
- included change and relevant checks with outcomes;
- coordinator review disposition: pending, changes requested, approved, or merged;
- next branch and one exact next action;
- any unresolved risk, dependency, or user decision.

When review requests changes, keep the branch assigned to the same worker and replace the exact next action with the requested correction and recheck. After a merge, record the merge commit, the reviewed checks, and the next branch before dispatching it. Do not record personal quota or account details in this repository.
