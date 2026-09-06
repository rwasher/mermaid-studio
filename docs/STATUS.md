# Status

## Current checkpoint

| Field | Value |
| --- | --- |
| Status | Branch 09 source-copy implementation is complete and pending coordinator review. |
| Current branch | `rwasher/09-source-copy` |
| Current commit | `79be2cb3dbb121df69bf87c489fef943e1001242` (based on reviewed local main commit `b5947b2`). |
| Repository | Public `rwasher/mermaid-studio`; origin uses GitHub SSH. |
| Tracking issue | Issue #16: copy complete Mermaid source. |
| Worktree | `/Users/rwasher/dev/mermaid-studio` |
| Worker changes | Branch 09 adds a browser Copy Mermaid source control that writes the editor's active source to `navigator.clipboard` and reports success or failure in the status line. The focused headless test mocks both clipboard outcomes and asserts exact source bytes. |
| Checks | Bundled Node test suite, syntax checks, and `git diff --check` pass. |
| Review disposition | Pending coordinator review. |
| Next branch | `rwasher/10-file-import`. |
| Exact next action | Coordinator reviews the branch 09 commit and either requests targeted corrections or merges it into local main. |

Unresolved risk: clipboard writes depend on the browser's permission and secure-context policy; a denied or unavailable clipboard is surfaced to the user. Diagram-image clipboard export remains outside this branch.

## Update protocol

Update this file before pausing work and after each merge. Keep the current checkpoint complete enough for a new coordinator or worker to continue without prior conversation context:

- current branch and commit;
- worktree path and worker identity when assigned;
- included change and relevant checks with outcomes;
- coordinator review disposition: pending, changes requested, approved, or merged;
- next branch and one exact next action;
- any unresolved risk, dependency, or user decision.

When review requests changes, keep the branch assigned to the same worker and replace the exact next action with the requested correction and recheck. After a merge, record the merge commit, the reviewed checks, and the next branch before dispatching it. Do not record personal quota or account details in this repository.
