## Why

The extension has drift between contributed commands, registered handlers, and the test suite, with stale assets and build artifacts still tracked. Cleaning this up reduces confusion, restores test reliability, and makes ongoing development safer.

## What Changes

- Align contributed commands with actual registrations (remove orphans).
- Update or remove stale test suites so the test pipeline compiles and reflects the current chat-focused extension.
- Wire chat UI actions (e.g., open artifact) to real handlers.
- Remove unused/stubbed watcher plumbing, dead assets, and obsolete types.
- Clean repository hygiene (remove tracked build artifacts, update ignore rules).

## Capabilities

### New Capabilities
- `extension-cleanup`: Define requirements for command alignment, chat UI actions, test integrity, and repository hygiene in the current chat-only architecture.

### Modified Capabilities
<!-- None -->

## Impact

- `package.json` command contributions
- `src/constants/commands.ts`, `src/extension/commands.ts`
- `src/providers/chatViewProvider.ts`, `media/chat.js`
- `src/extension/watcher.ts`, `src/extension/runtime.ts`
- `src/types/index.ts`, `media/script.js`, `media/styles.css`
- `test/suite/*.ts`, `.gitignore`, tracked `test/**/*.js` artifacts
