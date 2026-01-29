## ADDED Requirements

### Requirement: Workspace root OpenSpec discovery
The extension SHALL treat the workspace-root `openspec/` directory as the only OpenSpec root for discovery, listing, and refresh.

#### Scenario: Workspace has openspec folder at root
- **WHEN** the workspace root contains `openspec/config.yaml`
- **THEN** the extension marks the workspace as initialized and populates the OpenSpec views

#### Scenario: Workspace has nested openspec examples
- **WHEN** the workspace contains nested folders that also include an `openspec/` directory (e.g. `testingproject/openspec/`)
- **THEN** the extension ignores those nested folders for initialization and file watching

### Requirement: Root-only file watching
The extension SHALL watch for file changes only under the workspace-root `openspec/**` path.

#### Scenario: Change under root openspec updates UI
- **WHEN** a file is created, changed, or deleted under `openspec/**`
- **THEN** the extension refreshes the explorer and recomputes initialization state
