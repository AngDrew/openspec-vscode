## 1. Project Setup

- [x] 1.1 Create `opencode-openspec/` directory with `npm init`
- [x] 1.2 Set up `package.json` with dependencies (@opencode-ai/plugin, zod, typescript)
- [x] 1.3 Create `tsconfig.json` with strict TypeScript settings
- [x] 1.4 Create `.gitignore` and `README.md` templates
- [x] 1.5 Create `src/` directory structure (index.ts, types.ts, utils/, tools/, skills/)

## 2. Port Workspace Utilities

- [x] 2.1 Create `src/utils/workspace.ts` with OpenSpec workspace detection
- [x] 2.2 Port `listDirectories()`, `listFiles()`, `fileExists()`, `readFile()` functions
- [x] 2.3 Port `isScaffoldOnlyActiveChange()` and `hasNoTasks()` logic
- [x] 2.4 Port `countRequirementsInSpec()` and requirement parsing
- [x] 2.5 Create `src/types.ts` with ChangeInfo, SpecInfo, Task interfaces

## 3. Implement Custom Tools

- [x] 3.1 Create `src/tools/list.ts` - `openspec_list` tool implementation
- [x] 3.2 Create `src/tools/view.ts` - `openspec_view` tool implementation
- [x] 3.3 Create `src/tools/init.ts` - `openspec_init` tool using Bun shell
- [x] 3.4 Create `src/tools/newChange.ts` - `openspec_new` tool implementation

- [x] 3.5 Create `src/tools/fastForward.ts` - `openspec_ff` tool implementation

- [x] 3.6 Create `src/tools/apply.ts` - `openspec_apply` tool with Ralph loop
- [x] 3.7 Create `src/tools/archive.ts` - `openspec_archive` tool implementation

## 4. Port Ralph Loop Logic

- [x] 4.1 Read `tasks.md` and parse tasks with completion status

- [x] 4.2 Implement batch processing loop with `count` parameter

- [x] 4.3 Use `client.session.prompt()` to execute tasks within OpenCode
- [x] 4.4 Parse responses and update `tasks.md` with checkmarks

- [x] 4.5 Add progress notifications via `tui.showToast()`

- [x] 4.6 Handle graceful stop on error or user interruption

## 5. Create Agent Skills

- [x] 5.1 Create `src/skills/openspec-list/SKILL.md` with workflow instructions
- [x] 5.2 Create `src/skills/openspec-view/SKILL.md` with viewing workflow
- [x] 5.3 Create `src/skills/openspec-init/SKILL.md` with initialization workflow
- [x] 5.4 Create `src/skills/openspec-new/SKILL.md` with change creation workflow
- [x] 5.5 Create `src/skills/openspec-ff/SKILL.md` with fast-forward workflow
- [x] 5.6 Create `src/skills/openspec-apply/SKILL.md` with Ralph loop workflow
- [x] 5.7 Create `src/skills/openspec-archive/SKILL.md` with archival workflow

## 6. Plugin Integration

- [x] 6.1 Update `src/index.ts` to import and register all 7 tools
- [x] 6.2 Export `OpenSpecPlugin` with proper TypeScript types
- [x] 6.3 Test all tools individually with sample OpenSpec workspace
- [x] 6.4 Test skill workflows via natural language in OpenCode

- [x] 6.5 Fix any integration issues or API mismatches
## 7. Documentation & Publishing

- [x] 7.1 Write comprehensive README with installation and usage examples

- [x] 7.2 Add JSDoc comments for all functions and types

- [x] 7.3 Build package with `npm run build` and verify dist/ output
- [x] 7.4 Test `npm pack` to verify package contents
- [x] 7.5 Publish to npm registry as `opencode-openspec`

- [x] 7.6 Create GitHub repository and push code
## 8. Final Verification
- [x] 8.1 Test complete workflow: init → new → ff → apply → archive

- [x] 8.2 Test error scenarios: missing change, invalid name, incomplete tasks
- [x] 8.3 Verify all TypeScript compiles without errors (`npm run build`)

- [x] 8.4 Update VS Code extension README with migration notice