## Context

The extension is currently chat-focused, but the repo still carries legacy command contributions, tests that reference removed modules, and unused assets/types. This refactor focuses on removing or aligning these mismatches without reintroducing deprecated architectures.

## Goals / Non-Goals

**Goals:**
- Align `package.json` contributions with registered command handlers.
- Ensure chat UI actions are fully handled by the extension.
- Restore a compiling test pipeline by removing or updating stale suites.
- Remove unused watcher plumbing, legacy assets, and obsolete types.
- Prevent compiled artifacts from being tracked going forward.

**Non-Goals:**
- Reintroducing legacy explorer/webview/server-lifecycle modules.
- Changing ACP client behavior or session management semantics.
- Large-scale UX redesign of the chat UI.

## Decisions

- Favor a chat-only cleanup: remove unimplemented contributed commands and stale tests rather than re-implement legacy modules.
  - Alternatives considered: rebuilding legacy features; rejected due to scope and unclear product direction.
- Implement the missing `openArtifact` message handler in the chat provider to close the UI protocol gap.
  - Alternatives considered: removing the UI action; rejected because it degrades user workflow.
- Remove stubbed watcher/runtime fields unless they have active usage in the current architecture.
  - Alternatives considered: completing the watcher; rejected without current product need.
- Clean repository hygiene by deleting tracked build outputs and expanding `.gitignore` to prevent reintroduction.

## Risks / Trade-offs

- [Risk] Removing commands/tests may drop coverage of unmodeled workflows → Mitigation: keep command alignment limited to current chat feature set and document the removal in the change artifacts.
- [Risk] Consumers relying on removed commands may break → Mitigation: confirm contributed command list reflects actual registered commands before release.
