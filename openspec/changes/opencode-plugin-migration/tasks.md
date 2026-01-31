# Tasks: OpenSpec OpenCode Plugin Implementation

## Phase 1: Project Setup & Infrastructure

### Task 1.1: Initialize npm package structure
- [ ] Create `opencode-openspec/` directory
- [ ] Run `npm init` with proper metadata
- [ ] Set up `package.json` with dependencies:
  - `@opencode-ai/plugin`
  - `@opencode-ai/sdk` (if needed)
  - `zod`
  - `@types/node`
  - `typescript`
- [ ] Create `tsconfig.json` with strict settings
- [ ] Set up `.gitignore` (node_modules, dist/, .DS_Store)
- [ ] Create basic `README.md` template
- [ ] Create `src/` directory structure
- [ ] Initialize git repository

**Files to create**:
- `package.json`
- `tsconfig.json`
- `.gitignore`
- `README.md`
- `src/index.ts` (entry point stub)
- `src/types.ts` (shared types stub)

---

### Task 1.2: Port workspace utilities from VS Code extension
- [ ] Create `src/utils/workspace.ts`
- [ ] Port `isOpenSpecInitialized()` function
- [ ] Port `getOpenSpecRoot()`, `getChangesDir()`, `getSpecsDir()`
- [ ] Port `listDirectories()`, `listFiles()` with proper error handling
- [ ] Port `fileExists()`, `readFile()` using Node fs API
- [ ] Port `isScaffoldOnlyActiveChange()` logic
- [ ] Port `hasNoTasks()` function
- [ ] Port `countRequirementsInSpec()` function
- [ ] Add TypeScript types for all functions
- [ ] Add basic unit tests for utility functions

**Key differences from VS Code**:
- Use `fs/promises` instead of VS Code's `workspace.fs`
- No caching initially (can add later)
- Remove VS Code-specific types (WorkspaceFolder, Uri)

---

### Task 1.3: Create shared types
- [ ] Create `src/types.ts`
- [ ] Define `ChangeInfo` interface:
  ```typescript
  interface ChangeInfo {
    id: string;
    path: string;
    isActive: boolean;
    isScaffoldOnly: boolean;
    hasTasks: boolean;
    hasProposal: boolean;
    hasDesign: boolean;
    status: 'in-progress' | 'completed';
  }
  ```
- [ ] Define `SpecInfo` interface:
  ```typescript
  interface SpecInfo {
    id: string;
    path: string;
    requirementCount: number;
  }
  ```
- [ ] Define `Task` interface:
  ```typescript
  interface Task {
    id: string;
    description: string;
    completed: boolean;
    section?: string;
  }
  ```
- [ ] Define tool response types
- [ ] Define plugin context type

---

## Phase 2: Custom Tools Implementation

### Task 2.1: Implement openspec_list tool
- [ ] Create `src/tools/list.ts`
- [ ] Define tool schema with Zod:
  ```typescript
  args: {
    showArchived: z.boolean().optional(),
    filter: z.string().optional(),
  }
  ```
- [ ] Implement workspace scanning logic:
  - Scan `openspec/changes/` for active changes
  - Scan `openspec/changes/archive/` for archived changes
  - Scan `openspec/specs/` for specifications
- [ ] Return structured JSON response
- [ ] Add error handling for missing openspec directory
- [ ] Test tool with sample workspace

**Response format**:
```json
{
  "success": true,
  "changes": {
    "active": [...],
    "archived": [...]
  },
  "specs": [...],
  "summary": {
    "totalActive": 0,
    "totalArchived": 0,
    "totalSpecs": 0
  }
}
```

---

### Task 2.2: Implement openspec_view tool
- [ ] Create `src/tools/view.ts`
- [ ] Define tool schema:
  ```typescript
  args: {
    changeId: z.string(),
  }
  ```
- [ ] Implement artifact reading:
  - Read `proposal.md` if exists
  - Read `design.md` if exists
  - Read `tasks.md` if exists
  - Parse tasks and return structured data
- [ ] Read associated specs from `specs/` subdirectory
- [ ] Return complete change details
- [ ] Handle missing change error

**Response format**:
```json
{
  "success": true,
  "change": {
    "id": "...",
    "path": "...",
    "artifacts": {
      "proposal": "...",
      "design": "...",
      "tasks": [...]
    },
    "specs": [...]
  }
}
```

---

### Task 2.3: Implement openspec_init tool
- [ ] Create `src/tools/init.ts`
- [ ] Define tool schema (no args required)
- [ ] Implement using Bun shell (`$`):
  ```typescript
  await $`openspec init`;
  ```
- [ ] Check if already initialized (avoid re-running)
- [ ] Return success/failure with message
- [ ] Handle case where `openspec` CLI is not installed

---

### Task 2.4: Implement openspec_new tool
- [ ] Create `src/tools/newChange.ts`
- [ ] Define tool schema:
  ```typescript
  args: {
    name: z.string(),
    description: z.string().optional(),
  }
  ```
- [ ] Validate change name (kebab-case)
- [ ] Create change scaffold:
  - Create directory `openspec/changes/<name>/`
  - Create `.openspec.yaml` with metadata
  - Create empty `specs/` directory (optional)
- [ ] Use `openspec new change` CLI command if available, otherwise manual creation
- [ ] Return created change info
- [ ] Handle duplicate change ID error

---

### Task 2.5: Implement openspec_ff tool
- [ ] Create `src/tools/fastForward.ts`
- [ ] Define tool schema:
  ```typescript
  args: {
    changeId: z.string(),
  }
  ```
- [ ] Check if change is scaffold-only (only `.openspec.yaml` exists)
- [ ] If scaffold-only, trigger artifact generation:
  - Option A: Use `openspec ff` CLI command
  - Option B: Generate via SDK prompt
- [ ] Return status and generated artifacts list
- [ ] Handle non-scaffold-only error

---

### Task 2.6: Implement openspec_apply tool (Ralph Loop)
- [ ] Create `src/tools/apply.ts`
- [ ] Define tool schema:
  ```typescript
  args: {
    changeId: z.string(),
    count: z.number().default(1),
    dryRun: z.boolean().optional(),
  }
  ```
- [ ] Port Ralph loop logic from `ralph_opencode.mjs`:
  - Read `tasks.md` and parse tasks
  - Filter unchecked tasks
  - Process in batches of `count`
- [ ] For each batch:
  - Build task prompt with context
  - Call `client.session.prompt()` to execute
  - Parse response for completed tasks
  - Update `tasks.md` with checkmarks
  - Show progress via `tui.showToast()`
- [ ] Handle completion detection
- [ ] Handle user interruption (graceful stop)
- [ ] Return detailed results

**Key implementation details**:
- Batch bounded by parent section (e.g., 2.2 can batch 2.3 but not 3.1)
- Each batch is a fresh OpenCode context
- Progress updates show current task count
- Error in one batch stops the loop

---

### Task 2.7: Implement openspec_archive tool
- [ ] Create `src/tools/archive.ts`
- [ ] Define tool schema:
  ```typescript
  args: {
    changeId: z.string(),
    force: z.boolean().optional(),
  }
  ```
- [ ] Check if change exists
- [ ] If not `force`, verify all tasks are completed:
  - Read `tasks.md`
  - Check for any unchecked tasks (`- [ ]`)
  - Warn user if incomplete
- [ ] Move change from `openspec/changes/` to `openspec/changes/archive/`
- [ ] Handle multiple specs (use question tool pattern)
- [ ] Return archive confirmation

---

## Phase 3: Agent Skills

### Task 3.1: Create openspec-list skill
- [ ] Create `src/skills/openspec-list/SKILL.md`
- [ ] Write frontmatter:
  ```yaml
  ---
  name: openspec-list
  description: List all OpenSpec changes and specifications
  ---
  ```
- [ ] Write "What I do" section
- [ ] Write "When to use me" section
- [ ] Write workflow instructions:
  - Call `openspec_list` tool
  - Format results for user
  - Show summary statistics
- [ ] Write example usage

---

### Task 3.2: Create openspec-view skill
- [ ] Create `src/skills/openspec-view/SKILL.md`
- [ ] Write frontmatter with name and description
- [ ] Write "What I do" section (view change details)
- [ ] Write "When to use me" section
- [ ] Write workflow:
  - Extract changeId from user request
  - Call `openspec_view` tool
  - Display proposal, design, tasks
  - Show spec associations
- [ ] Include error handling (change not found)

---

### Task 3.3: Create openspec-init skill
- [ ] Create `src/skills/openspec-init/SKILL.md`
- [ ] Write frontmatter
- [ ] Write "What I do" section (initialize workspace)
- [ ] Write "When to use me" section
- [ ] Write workflow:
  - Check if already initialized
  - Call `openspec_init` tool
  - Confirm success
- [ ] Handle already-initialized case

---

### Task 3.4: Create openspec-new skill
- [ ] Create `src/skills/openspec-new/SKILL.md`
- [ ] Write frontmatter
- [ ] Write "What I do" section (create new change)
- [ ] Write "When to use me" section
- [ ] Write workflow:
  - Extract or ask for change name
  - Validate kebab-case format
  - Call `openspec_new` tool
  - Confirm creation
  - Suggest next steps (fast-forward, plan mode)

---

### Task 3.5: Create openspec-ff skill
- [ ] Create `src/skills/openspec-ff/SKILL.md`
- [ ] Write frontmatter
- [ ] Write "What I do" section (fast-forward scaffold-only changes)
- [ ] Write "When to use me" section
- [ ] Write workflow:
  - Extract changeId
  - Call `openspec_view` to verify scaffold-only status
  - Confirm with user
  - Call `openspec_ff` tool
  - Report generated artifacts

---

### Task 3.6: Create openspec-apply skill
- [ ] Create `src/skills/openspec-apply/SKILL.md`
- [ ] Write frontmatter
- [ ] Write "What I do" section (apply tasks via Ralph loop)
- [ ] Write "When to use me" section
- [ ] Write detailed workflow:
  - Extract changeId
  - Call `openspec_view` to show current tasks
  - Ask for batch size (default: 1)
  - Call `openspec_apply` tool
  - Stream progress to user
  - Report completion status
  - Handle partial completion (ask to continue)
- [ ] Explain Ralph loop concept

---

### Task 3.7: Create openspec-archive skill
- [ ] Create `src/skills/openspec-archive/SKILL.md`
- [ ] Write frontmatter
- [ ] Write "What I do" section (archive completed changes)
- [ ] Write "When to use me" section
- [ ] Write workflow:
  - Extract changeId
  - Call `openspec_view` to check task status
  - If incomplete, ask for confirmation or suggest completing first
  - Call `openspec_archive` tool
  - Confirm archival
- [ ] Handle multiple specs case

---

## Phase 4: Plugin Integration

### Task 4.1: Implement main plugin entry point
- [ ] Update `src/index.ts`:
  - Import all tools
  - Import type definitions
  - Export `OpenSpecPlugin` as main plugin function
  - Register all tools in return object
- [ ] Add plugin metadata (name, version)
- [ ] Add error boundary handling
- [ ] Test plugin loads without errors

**Structure**:
```typescript
export const OpenSpecPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      openspec_list: listTool(ctx),
      openspec_view: viewTool(ctx),
      // ... all tools
    },
  };
};
```

---

### Task 4.2: Test all tools individually
- [ ] Set up test OpenSpec workspace
- [ ] Test `openspec_list` - verify listing works
- [ ] Test `openspec_view` - verify reading artifacts works
- [ ] Test `openspec_init` - verify initialization works
- [ ] Test `openspec_new` - verify change creation works
- [ ] Test `openspec_ff` - verify fast-forward works
- [ ] Test `openspec_apply` - verify Ralph loop works
- [ ] Test `openspec_archive` - verify archival works
- [ ] Document any issues or edge cases

---

### Task 4.3: Test skill workflows
- [ ] Install plugin locally in OpenCode
- [ ] Test each skill via natural language:
  - "list my openspec changes"
  - "view the add-auth change"
  - "create a new change for login"
  - "fast-forward the add-auth change"
  - "apply the add-auth change"
  - "archive the completed add-auth change"
- [ ] Verify skills load correctly
- [ ] Verify tool calls happen as expected
- [ ] Fix any workflow issues

---

## Phase 5: Documentation & Publishing

### Task 5.1: Write comprehensive README
- [ ] Overview section
- [ ] Installation instructions
- [ ] Configuration (opencode.json)
- [ ] Usage examples (skills and tools)
- [ ] Feature comparison (VS Code extension vs plugin)
- [ ] Troubleshooting section
- [ ] Development setup (for contributors)
- [ ] License section

---

### Task 5.2: Add inline documentation
- [ ] JSDoc comments for all utility functions
- [ ] JSDoc comments for all tool functions
- [ ] Type documentation
- [ ] Example usage in comments

---

### Task 5.3: Build and prepare for publish
- [ ] Run `npm run build` to generate dist/
- [ ] Verify all files included in `files` array
- [ ] Test `npm pack` to check package contents
- [ ] Verify TypeScript declarations generated
- [ ] Run smoke tests on built package

---

### Task 5.4: Publish to npm
- [ ] Create npm account if needed
- [ ] Login to npm (`npm login`)
- [ ] Publish package (`npm publish`)
- [ ] Verify package is public and installable
- [ ] Test installation: `npm install opencode-openspec`

---

### Task 5.5: Create GitHub repository
- [ ] Initialize git repo (if not done)
- [ ] Create GitHub repo
- [ ] Push all code
- [ ] Add topics/tags
- [ ] Enable issues
- [ ] Add license file (MIT)
- [ ] Create initial release

---

## Phase 6: Final Verification

### Task 6.1: End-to-end testing
- [ ] Fresh OpenCode install with plugin
- [ ] Test complete workflow:
  1. Initialize OpenSpec
  2. Create new change
  3. Fast-forward change
  4. Apply tasks
  5. Archive change
- [ ] Test error scenarios:
  - Non-existent change
  - Invalid change name
  - Already initialized
  - Incomplete tasks on archive
- [ ] Document any remaining issues

---

### Task 6.2: Update VS Code extension README
- [ ] Add deprecation notice to openspec-vscode
- [ ] Point users to new plugin
- [ ] Explain migration path
- [ ] Archive VS Code extension (optional)

---

### Task 6.3: Announce and document
- [ ] Write announcement post
- [ ] Update any documentation sites
- [ ] Share on OpenCode Discord/community
- [ ] Add to OpenCode plugin ecosystem list

---

## Summary

**Total Tasks**: 32 tasks across 6 phases
**Estimated Timeline**:
- Phase 1: 0.5 days
- Phase 2: 1.5 days
- Phase 3: 0.5 days
- Phase 4: 0.5 days
- Phase 5: 0.5 days
- Phase 6: 0.5 days

**Total**: ~4 days of focused development

**Dependencies**:
- OpenCode v1.0.110+ (for plugin API)
- Node.js 18+ (for development)
- `openspec` CLI installed globally

**Key Risks**:
- Ralph loop complexity (porting from .mjs)
- OpenCode plugin API limitations
- Testing requires live OpenCode environment
