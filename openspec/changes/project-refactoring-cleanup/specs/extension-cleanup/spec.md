## ADDED Requirements

### Requirement: Contributed commands match registrations
The extension SHALL only contribute command IDs that are registered at activation, and every registered command SHALL be contributed in `package.json`.

#### Scenario: Registry consistency
- **WHEN** the extension activates
- **THEN** every contributed command resolves to a registered handler

### Requirement: Chat UI actions are handled
The chat webview SHALL route user actions to matching message handlers, including opening artifacts.

#### Scenario: Open artifact action
- **WHEN** the chat UI sends an `openArtifact` message with a file path
- **THEN** the extension opens the corresponding file in the editor

### Requirement: Test suite reflects current architecture
The test suite SHALL compile and only reference modules that exist in the current chat-focused extension.

#### Scenario: Test compile
- **WHEN** `npm run pretest` executes
- **THEN** TypeScript compiles all tests without missing module errors

### Requirement: Remove unused or stubbed code paths
The extension SHALL not ship unused watchers, dead assets, or obsolete types that are no longer referenced by the chat architecture.

#### Scenario: Dead code cleanup
- **WHEN** unused assets, types, or stubbed watchers are identified
- **THEN** they are removed and no references remain

### Requirement: Repository hygiene is enforced
The repository SHALL not track build artifacts, and ignore rules SHALL prevent reintroduction.

#### Scenario: Build artifacts ignored
- **WHEN** compiled test outputs are generated
- **THEN** they are ignored and not committed
