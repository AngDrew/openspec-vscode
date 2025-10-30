# vscode-extension Specification

## Purpose
TBD - created by archiving change add-vscode-extension. Update Purpose after archive.
## Requirements
### Requirement: VS Code Extension Integration
The system SHALL provide a VS Code extension that integrates OpenSpec functionality directly within the Visual Studio Code editor.

#### Scenario: Extension Installation and Activation
- **WHEN** a user installs the OpenSpec VS Code extension
- **THEN** the extension SHALL be available in the VS Code marketplace
- **AND** the extension SHALL activate automatically when opening a workspace containing an `openspec` directory

#### Scenario: Activity Bar Integration
- **WHEN** the extension is active
- **THEN** an "OpenSpec" icon SHALL appear in the VS Code Activity Bar
- **AND** clicking the icon SHALL open the OpenSpec Explorer view

### Requirement: Workspace Initialization Detection
The extension SHALL detect whether the current workspace has been initialized with OpenSpec.

#### Scenario: Initialized Workspace
- **WHEN** opening a workspace with an `openspec` directory
- **THEN** the extension SHALL display the OpenSpec Explorer with content
- **AND** the extension SHALL start watching for file changes in the `openspec/` directory

#### Scenario: Uninitialized Workspace
- **WHEN** opening a workspace without an `openspec` directory
- **THEN** the extension SHALL display a welcome view with initialization guidance
- **AND** provide a button or command to guide the user to run `openspec init` in the terminal

### Requirement: OpenSpec Explorer View
The extension SHALL provide a tree view in the Activity Bar to browse and interact with OpenSpec changes and specifications.

#### Scenario: Changes Section Display
- **WHEN** viewing the OpenSpec Explorer
- **THEN** the Changes section SHALL list all active changes from `openspec/changes/`
- **AND** SHALL list all completed changes from `openspec/changes/archive/`
- **AND** each change SHALL display its name and status indicator (e.g., "✓ Complete", "In Progress")
- **AND** completed changes SHALL be visually distinct from active changes

#### Scenario: Specifications Section Display
- **WHEN** viewing the OpenSpec Explorer
- **THEN** the Specifications section SHALL list all specifications from `openspec/specs/`
- **AND** each spec SHALL display its name and the count of requirements
- **AND** clicking a spec item SHALL open the corresponding `spec.md` file in the editor

#### Scenario: Change Navigation
- **WHEN** clicking a change item in the explorer
- **THEN** the extension SHALL open a detailed view webview for that change

### Requirement: Command Palette Integration
The extension SHALL register OpenSpec commands in the VS Code Command Palette.

#### Scenario: View Details Command
- **WHEN** a change is selected in the explorer
- **AND** the user runs "OpenSpec: View Details" command
- **THEN** the extension SHALL open the detailed view webview for that change

#### Scenario: List Changes Command
- **WHEN** the user runs "OpenSpec: List Changes" command
- **THEN** the extension SHALL refresh the OpenSpec Explorer view
- **AND** focus the Activity Bar on the OpenSpec view

#### Scenario: Generate Proposal Command
- **WHEN** the user runs "OpenSpec: Generate Proposal" command
- **THEN** the extension SHALL initiate the proposal generation workflow
- **AND** display appropriate UI for the user to create a new change proposal

### Requirement: Detailed View Webview
The extension SHALL provide a rich webview for displaying detailed information about selected changes.

#### Scenario: Rich Content Display
- **WHEN** a change is selected for detailed viewing
- **THEN** the webview SHALL display formatted content mimicking `openspec view` output
- **AND** SHALL show a summary section with counts of specs, requirements, and change statuses
- **AND** SHALL display lists of completed and active changes
- **AND** SHALL show the specifications involved in the change
- **AND** SHALL render the content of `proposal.md` with proper markdown formatting
- **AND** SHALL render the content of `tasks.md` with proper markdown formatting and task checkboxes

#### Scenario: Webview Navigation
- **WHEN** viewing a change in the webview
- **AND** the user clicks on a file reference or spec link
- **THEN** the extension SHALL navigate to the appropriate file in the editor

### Requirement: File System Watching
The extension SHALL monitor the `openspec/` directory for changes and update the UI accordingly.

#### Scenario: Automatic Refresh on File Changes
- **WHEN** files are created, modified, or deleted in the `openspec/` directory
- **THEN** the OpenSpec Explorer SHALL automatically refresh within 1 second
- **AND** the view SHALL reflect the current state of changes and specifications

#### Scenario: Change Detection Events
- **WHEN** a new change is created in `openspec/changes/`
- **OR** a change is modified (proposal.md, tasks.md, or spec deltas updated)
- **OR** a change is archived to `openspec/changes/archive/`
- **THEN** the extension SHALL detect the event
- **AND** update the explorer view without requiring manual refresh

### Requirement: Performance Requirements
The extension SHALL maintain optimal performance and minimal resource usage.

#### Scenario: Startup Performance
- **WHEN** VS Code starts up
- **THEN** the extension SHALL not increase startup time by more than 100ms
- **AND** SHALL initialize asynchronously to avoid blocking the editor

#### Scenario: Large Project Performance
- **WHEN** working with projects containing 100+ changes or specifications
- **THEN** the extension SHALL maintain responsive UI interactions
- **AND** file system operations SHALL not cause UI lag exceeding 500ms
- **AND** tree view rendering SHALL be optimized with lazy loading for large datasets

### Requirement: Error Handling and Reliability
The extension SHALL gracefully handle errors and provide clear feedback to users.

#### Scenario: Malformed Directory Structure
- **WHEN** the `openspec/` directory has unexpected structure or missing required files
- **THEN** the extension SHALL display an informative error message in the explorer view
- **AND** SHALL provide guidance for fixing the issue or re-initializing OpenSpec

#### Scenario: File Access Errors
- **WHEN** the extension encounters permission or file access errors
- **THEN** the extension SHALL log appropriate error information to the VS Code Output panel
- **AND** SHALL continue functioning with available data
- **AND** SHALL display a notification to the user with actionable steps

#### Scenario: Command Execution Errors
- **WHEN** an OpenSpec command fails (e.g., openspec CLI not found in PATH)
- **THEN** the extension SHALL display an error notification
- **AND** SHALL provide guidance to install or configure OpenSpec CLI

### Requirement: User Experience Consistency
The extension SHALL follow VS Code design principles and provide an intuitive interface.

#### Scenario: Visual Consistency
- **WHEN** viewing the OpenSpec Explorer
- **THEN** the UI SHALL use VS Code's standard icons and styling
- **AND** SHALL respect the user's theme (light/dark mode)
- **AND** SHALL use consistent iconography to distinguish specs, active changes, and completed changes

#### Scenario: User Feedback
- **WHEN** the user performs any action (refresh, open view, run command)
- **THEN** the extension SHALL provide clear visual feedback
- **AND** SHALL display progress indicators for long-running operations
- **AND** SHALL show success or error notifications with appropriate messaging

