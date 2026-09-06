# Status

## Current checkpoint

| Field | Value |
| --- | --- |
| Status | Branch 16 distributable package is implemented and pending coordinator review. |
| Current branch | `rwasher/16-distributable-package` |
| Current commit | Pending amended local implementation commit (based on reviewed local main commit `a6082d1`). |
| Repository | Public `rwasher/mermaid-studio`; origin uses GitHub SSH. |
| Tracking issue | Issue #30: package Mermaid Studio as a self-contained local Codex skill. |
| Worktree | `/Users/rwasher/dev/mermaid-studio` |
| Worker changes | Branch 16 gives the skill its own runtime manifest and relocatable renderer lookup, documents copy/install/update commands, keeps lifecycle state in the OS temp directory, and adds a staged clean-install check proving launch and renderer serving without a Playwright browser cache or invocation-time browser download. |
| Checks | `node scripts/verify-package.mjs`: passing in the approved loopback environment; complete browser-render suite: 26/26 passing; `git diff --check`: passing. |
| Review disposition | Pending coordinator review. |
| Next branch | `rwasher/17-integration-portability-docs`. |
| Exact next action | Coordinator reviews the branch 16 commit and either requests targeted corrections or merges it into local main. |

Unresolved risk: installation still requires a compatible existing macOS browser; this branch intentionally does not publish or download a browser bundle. Future renderer upgrades require reviewing the guidance and rerunning the renderer-backed checks. Natural-language requests outside those diagram types still require the agent to choose and validate an appropriate grammar.

## Update protocol

Update this file before pausing work and after each merge. Keep the current checkpoint complete enough for a new coordinator or worker to continue without prior conversation context:

- current branch and commit;
- worktree path and worker identity when assigned;
- included change and relevant checks with outcomes;
- coordinator review disposition: pending, changes requested, approved, or merged;
- next branch and one exact next action;
- any unresolved risk, dependency, or user decision.

When review requests changes, keep the branch assigned to the same worker and replace the exact next action with the requested correction and recheck. After a merge, record the merge commit, the reviewed checks, and the next branch before dispatching it. Do not record personal quota or account details in this repository.
