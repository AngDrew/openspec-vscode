## 1. Command Alignment

- [x] 1.1 Inventory contributed commands vs registered handlers and decide removals/updates
- [x] 1.2 Update `package.json` and `src/constants/commands.ts` to match actual registrations
- [x] 1.3 Adjust `src/extension/commands.ts` registrations as needed and verify activation

## 2. Chat UI Action Wiring

- [x] 2.1 Add `openArtifact` handler in `src/providers/chatViewProvider.ts`
- [x] 2.2 Ensure `media/chat.js` uses the supported message payload shape

## 3. Test Suite Cleanup

- [x] 3.1 Remove or rewrite stale tests referencing missing modules
- [x] 3.2 Update remaining tests to match current command IDs and extension ID
- [x] 3.3 Run `npm run pretest` to confirm compilation


## 4. Remove Dead Code and Assets

- [x] 4.1 Delete unused watcher plumbing and related runtime fields
- [x] 4.2 Remove obsolete types and legacy webview assets

## 5. Repository Hygiene

- [x] 5.1 Delete tracked compiled test artifacts under `test/`
- [x] 5.2 Update `.gitignore` to prevent future `test/**/*.js` and `test/**/*.map` commits
