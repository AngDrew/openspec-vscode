## 1. Root OpenSpec Scoping

- [x] 1.1 Change file watcher to only watch `openspec/**` under the workspace root
- [x] 1.2 Ensure initialization logic uses workspace-root `openspec/` only (no nested discovery)

## 2. OpenCode Server Dot

- [x] 2.1 Add backend helper to probe `localhost:4099` listening status
- [x] 2.2 Add webview UI dot button (red/green) with hover tooltip and click handler
- [x] 2.3 Add extension command that starts `opencode serve --port 4099` in a VS Code terminal
- [x] 2.4 Add message plumbing between webview and extension to query status and refresh it periodically

## 3. Empty-State Attach CTA

- [x] 3.1 Detect change "empty" state (no proposal/design/tasks/specs) and render an empty-state panel
- [x] 3.2 Add CTA button that triggers attach flow to `http://localhost:4099`

## 4. Ralph Runner (Cross-platform)

- [x] 4.1 Implement `ralph_opencode.mjs` script that mirrors `ralph_opencode.sh` behavior (attach, MAX_ITERS, task loop, verification)
- [x] 4.2 Add extension command to create/update the runner script in the user workspace root
- [x] 4.3 Wire empty-state CTA to generate runner + run `node ralph_opencode.mjs --attach http://localhost:4099` in a VS Code terminal

## 5. Render Artifacts in Details View

- [x] 5.1 Update details webview to render `design.md` alongside existing proposal/tasks/specs rendering
- [x] 5.2 Update details webview to render specs list from `openspec/changes/<change>/specs/*/spec.md` (not global specs)
- [x] 5.3 Ensure file open/preview interactions work for proposal/design/tasks/specs

## 6. QA

- [x] 6.1 Manual test: empty change shows attach CTA and dot behavior
- [x] 6.2 Manual test: change with artifacts renders proposal/design/tasks/specs
- [x] 6.3 Run `npm run compile` and fix any TypeScript errors
