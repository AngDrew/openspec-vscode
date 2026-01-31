# Design: OpenSpec OpenCode Plugin

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Session                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │         opencode-openspec Plugin                    │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                     │   │
│  │  ┌─────────────┐    ┌────────────────────────────┐ │   │
│  │  │   Skills    │    │         Tools              │ │   │
│  │  │  (7 skills) │    │      (7 custom tools)      │ │   │
│  │  │             │    │                            │ │   │
│  │  │ • list      │    │ • openspec_list            │ │   │
│  │  │ • view      │    │ • openspec_view            │ │   │
│  │  │ • init      │    │ • openspec_init            │ │   │
│  │  │ • new       │    │ • openspec_new             │ │   │
│  │  │ • ff        │    │ • openspec_ff              │ │   │
│  │  │ • apply     │    │ • openspec_apply           │ │   │
│  │  │ • archive   │    │ • openspec_archive         │ │   │
│  │  └─────────────┘    └────────────────────────────┘ │   │
│  │                                                     │   │
│  │  ┌───────────────────────────────────────────────┐ │   │
│  │  │              Utilities                        │ │   │
│  │  │  • workspace.ts (OpenSpec workspace utils)   │ │   │
│  │  │  • cache.ts (in-memory caching)              │ │   │
│  │  │  • parser.ts (markdown/spec parsers)         │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              OpenCode SDK APIs                      │   │
│  │  • client.session.prompt() - Execute prompts       │   │
│  │  • tui.showToast() - Display status                │   │
│  │  • $ (Bun shell) - Run CLI commands                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
opencode-openspec/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                 # Plugin entry point
    ├── types.ts                 # Shared TypeScript types
    ├── skills/                  # Agent skill definitions
    │   ├── openspec-list/
    │   │   └── SKILL.md
    │   ├── openspec-view/
    │   │   └── SKILL.md
    │   ├── openspec-init/
    │   │   └── SKILL.md
    │   ├── openspec-new/
    │   │   └── SKILL.md
    │   ├── openspec-ff/
    │   │   └── SKILL.md
    │   ├── openspec-apply/
    │   │   └── SKILL.md
    │   └── openspec-archive/
    │       └── SKILL.md
    ├── tools/                   # Custom tool implementations
    │   ├── list.ts
    │   ├── view.ts
    │   ├── init.ts
    │   ├── newChange.ts
    │   ├── fastForward.ts
    │   ├── apply.ts             # Ralph loop implementation
    │   └── archive.ts
    └── utils/
        ├── workspace.ts
        ├── cache.ts
        └── parser.ts
```

## Plugin Entry Point

```typescript
// src/index.ts
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { z } from "zod";

// Import tool implementations
import { listTool } from "./tools/list";
import { viewTool } from "./tools/view";
import { initTool } from "./tools/init";
import { newTool } from "./tools/newChange";
import { ffTool } from "./tools/fastForward";
import { applyTool } from "./tools/apply";
import { archiveTool } from "./tools/archive";

export const OpenSpecPlugin: Plugin = async (ctx) => {
  const { client, tui, $, directory, worktree } = ctx;
  
  // Register all custom tools
  return {
    tool: {
      openspec_list: listTool(ctx),
      openspec_view: viewTool(ctx),
      openspec_init: initTool(ctx),
      openspec_new: newTool(ctx),
      openspec_ff: ffTool(ctx),
      openspec_apply: applyTool(ctx),
      openspec_archive: archiveTool(ctx),
    },
  };
};
```

## Custom Tool Patterns

Each tool follows this pattern:

```typescript
// Example: list tool
export const listTool = (ctx: PluginContext) => {
  return tool({
    description: "List all OpenSpec changes and specifications",
    args: {
      showArchived: z.boolean().optional()
        .describe("Include archived changes in the list"),
      filter: z.string().optional()
        .describe("Filter changes/specs by name pattern"),
    },
    async execute(args, context) {
      const { directory } = context;
      
      // Scan openspec/ directory
      const changes = await scanChanges(directory, args);
      const specs = await scanSpecs(directory, args);
      
      return {
        changes,
        specs,
        totalActive: changes.filter(c => c.isActive).length,
        totalArchived: changes.filter(c => !c.isActive).length,
        totalSpecs: specs.length,
      };
    },
  });
};
```

## Ralph Loop Implementation

The Ralph loop from `ralph_opencode.mjs` is ported to work within OpenCode:

```typescript
// src/tools/apply.ts - Core Ralph loop logic
async function runRalphLoop(
  changeId: string, 
  count: number,
  ctx: PluginContext
): Promise<ApplyResult> {
  const { client, tui, directory } = ctx;
  
  // 1. Read tasks.md
  const tasksPath = path.join(directory, "openspec/changes", changeId, "tasks.md");
  const tasks = await parseTasks(tasksPath);
  const uncheckedTasks = tasks.filter(t => !t.completed);
  
  if (uncheckedTasks.length === 0) {
    return { status: "complete", message: "All tasks already completed" };
  }
  
  // 2. Process in batches
  const results: TaskResult[] = [];
  
  for (let i = 0; i < uncheckedTasks.length; i += count) {
    const batch = uncheckedTasks.slice(i, i + count);
    
    // Show progress
    await tui.showToast({
      body: {
        message: `Processing tasks ${i + 1}-${Math.min(i + count, uncheckedTasks.length)} of ${uncheckedTasks.length}`,
        variant: "info",
      },
    });
    
    // 3. Execute batch via session prompt
    const prompt = buildTaskPrompt(changeId, batch);
    
    try {
      const response = await client.session.prompt({
        body: {
          parts: [{ type: "text", text: prompt }],
        },
      });
      
      // 4. Parse response and mark completed tasks
      const completed = parseCompletedTasks(response);
      await markTasksCompleted(tasksPath, completed);
      
      results.push({
        batchIndex: i / count,
        tasks: batch.map(t => t.id),
        completed,
        status: "success",
      });
      
    } catch (error) {
      results.push({
        batchIndex: i / count,
        tasks: batch.map(t => t.id),
        completed: [],
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      
      // Stop on error
      break;
    }
  }
  
  return {
    status: results.some(r => r.status === "error") ? "partial" : "complete",
    processed: results.length,
    results,
  };
}
```

## Skill Integration

Skills are loaded via the native `skill` tool. Each skill provides:

1. **Instructions**: What the skill does and when to use it
2. **Workflow**: Step-by-step guidance for the agent
3. **Tool calls**: Which custom tools to invoke

Example skill structure:

```markdown
---
name: openspec-apply
description: Apply OpenSpec change tasks using the Ralph loop
---

## What I do
Execute tasks from an OpenSpec change using the Ralph loop pattern.

## When to use me
When the user wants to implement code changes from a change's tasks.md.

## Workflow
1. Call `openspec_view` to verify the change exists and show current tasks
2. Ask user for batch size (default: 1, max: 50)
3. Call `openspec_apply` with the changeId and count
4. Report progress and results to user
5. If incomplete, ask if user wants to continue

## Example
User: "Apply the add-auth change"
→ Load openspec-apply skill
→ Call openspec_view({ changeId: "add-auth" })
→ Ask: "How many tasks per batch? (default: 1)"
→ Call openspec_apply({ changeId: "add-auth", count: 5 })
→ Show results
```

## Workspace Utilities

Ported from VS Code extension `src/utils/workspace.ts`:

```typescript
// src/utils/workspace.ts
export class OpenSpecUtils {
  static async isInitialized(dir: string): Promise<boolean> {
    return fs.exists(path.join(dir, "openspec"));
  }
  
  static async listChanges(dir: string): Promise<ChangeInfo[]> {
    const changesDir = path.join(dir, "openspec/changes");
    const dirs = await fs.readdir(changesDir, { withFileTypes: true });
    
    return Promise.all(
      dirs
        .filter(d => d.isDirectory() && d.name !== "archive")
        .map(async d => {
          const changePath = path.join(changesDir, d.name);
          return {
            id: d.name,
            path: changePath,
            isScaffoldOnly: await this.isScaffoldOnly(changePath),
            hasTasks: await this.hasTasks(changePath),
          };
        })
    );
  }
  
  static async isScaffoldOnly(changePath: string): Promise<boolean> {
    const entries = await fs.readdir(changePath, { withFileTypes: true });
    const nonIgnored = entries.filter(e => 
      e.name !== ".openspec.yaml" && 
      e.name !== ".DS_Store" &&
      e.name !== "specs"
    );
    return nonIgnored.length === 0;
  }
  
  static async parseTasks(tasksPath: string): Promise<Task[]> {
    const content = await fs.readFile(tasksPath, "utf8");
    // Parse markdown task list format
    const taskRegex = /^- \[([ x])\] (.+)$/gm;
    const tasks: Task[] = [];
    let match;
    
    while ((match = taskRegex.exec(content)) !== null) {
      tasks.push({
        completed: match[1] === "x",
        description: match[2],
      });
    }
    
    return tasks;
  }
}
```

## Package.json

```json
{
  "name": "opencode-openspec",
  "version": "1.0.0",
  "description": "OpenSpec spec-driven development plugin for OpenCode",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/",
    "src/skills/",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "opencode-ai": ">=1.0.110"
  },
  "keywords": [
    "opencode",
    "plugin",
    "openspec",
    "spec-driven-development",
    "agent-skills"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/AngDrew/opencode-openspec.git"
  },
  "bugs": {
    "url": "https://github.com/AngDrew/opencode-openspec/issues"
  },
  "homepage": "https://github.com/AngDrew/opencode-openspec#readme"
}
```

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Installation & Usage

**Installation**:
```json
// ~/.config/opencode/opencode.json
{
  "plugin": ["opencode-openspec"]
}
```

**Usage via Skills**:
```
User: list my openspec changes
Agent: (loads openspec-list skill) → calls openspec_list tool
```

**Usage via Tools**:
```
User: run the tool openspec_list with showArchived=true
Agent: calls tool directly, returns JSON
```

**Custom Commands** (optional enhancement):
Could add `/openspec` commands to OpenCode's command palette via plugin hooks.

## Error Handling Strategy

1. **Tool Level**: Each tool catches errors and returns structured error objects
2. **Skill Level**: Skills handle tool errors and provide user-friendly messages
3. **Plugin Level**: Global error handler logs to OpenCode's output channel

```typescript
// Error pattern in tools
async execute(args, context) {
  try {
    // Tool logic
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      code: "OPENSPEC_ERROR",
    };
  }
}
```

## Testing Strategy

1. **Unit Tests**: Test each utility function in isolation
2. **Integration Tests**: Test tool execution with mock OpenCode context
3. **Manual Testing**: Install plugin in OpenCode and verify all workflows

## Future Enhancements

1. **Caching**: Add intelligent caching for repeated workspace scans
2. **Progress Streaming**: Real-time progress updates during Ralph loop
3. **Batch Optimization**: Smart batch sizing based on task complexity
4. **Undo Support**: Integration with OpenCode's /undo for task rollbacks
5. **Metrics**: Track completion rates and task complexity
