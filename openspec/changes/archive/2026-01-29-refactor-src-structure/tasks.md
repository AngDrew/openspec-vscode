## 1. Baseline And Safety

- [x] 1.1 Run `npm run compile` to confirm a clean baseline
- [x] 1.2 Run `npm run lint` and fix any existing lint issues in touched files

## 2. Scaffold Internal Module Layout

- [x] 2.1 Add `src/extension/` modules: runtime state + activate/deactivate
- [x] 2.2 Add `src/extension/commands.ts` to hold command registration logic
- [x] 2.3 Add `src/extension/watcher.ts` to hold OpenSpec watcher + debounce logic
- [x] 2.4 (Optional) Add `src/constants/commands.ts` to centralize command IDs used in code

## 3. Refactor Entry Point (No Behavior Change)

- [x] 3.1 Refactor `src/extension.ts` to delegate to the new modules while preserving behavior
- [x] 3.2 Ensure all disposables are still registered and disposed correctly

## 4. Logging Consistency (Refactor-only)

- [x] 4.1 Replace `console.log` debug traces in `src/providers/explorerProvider.ts` with `ErrorHandler.debug` (or remove if redundant)
- [x] 4.2 Replace `console.*` error logs in `src/providers/webviewProvider.ts` with `ErrorHandler.handle/debug` where appropriate

## 5. Validate

- [x] 5.1 Run `npm run compile` and fix TypeScript errors
- [x] 5.2 Run `npm test` and fix any failures
