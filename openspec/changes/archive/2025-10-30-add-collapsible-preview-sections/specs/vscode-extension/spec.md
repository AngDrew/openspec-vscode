## ADDED Requirements

### Requirement: Collapsible Content Sections
The webview SHALL provide collapsible sections for major content areas to reduce scrolling and improve navigation.

#### Scenario: Section Headers Are Collapsible
- **WHEN** a user views a change in the detailed webview
- **THEN** each major section (Proposal, Tasks, Files) SHALL have a collapsible header
- **AND** clicking the header SHALL toggle the section between expanded and collapsed states
- **AND** an expand/collapse icon SHALL indicate the current state

#### Scenario: Default Section State
- **WHEN** a user opens a change for the first time in a webview session
- **THEN** all sections SHALL be expanded by default
- **AND** the expand icon SHALL show the sections are open

#### Scenario: Keyboard Accessibility
- **WHEN** a user navigates using keyboard only
- **THEN** collapsible section headers SHALL be focusable
- **AND** pressing Enter or Space SHALL toggle the section
- **AND** the focused element SHALL have visible focus indicators

### Requirement: Nested Task Collapsibility
The webview SHALL provide collapsible functionality for individual task items within the Tasks section.

#### Scenario: Individual Task Toggle
- **WHEN** viewing the Tasks section
- **THEN** each top-level task item SHALL be independently collapsible
- **AND** nested sub-tasks SHALL be hidden when the parent task is collapsed
- **AND** nested sub-tasks SHALL be visible when the parent task is expanded

#### Scenario: Task Hierarchy Display
- **WHEN** tasks have nested sub-tasks
- **THEN** parent tasks SHALL display a collapse/expand icon
- **AND** tasks without sub-tasks SHALL not display a collapse icon
- **AND** the nesting level SHALL be visually indicated through indentation

#### Scenario: Task State Independence
- **WHEN** collapsing or expanding a task
- **THEN** the state of other tasks SHALL remain unchanged
- **AND** the state of the parent section SHALL remain unchanged

## MODIFIED Requirements

### Requirement: Detailed View Webview
The extension SHALL provide a rich webview for displaying detailed information about selected changes with collapsible content sections.

#### Scenario: Rich Content Display
- **WHEN** a change is selected for detailed viewing
- **THEN** the webview SHALL display formatted content mimicking `openspec view` output
- **AND** SHALL show a summary section with counts of specs, requirements, and change statuses
- **AND** SHALL display lists of completed and active changes
- **AND** SHALL show the specifications involved in the change
- **AND** SHALL render the content of `proposal.md` with proper markdown formatting in a collapsible section
- **AND** SHALL render the content of `tasks.md` with proper markdown formatting, task checkboxes, and nested collapsibility
- **AND** SHALL render the files list in a collapsible section

#### Scenario: Webview Navigation
- **WHEN** viewing a change in the webview
- **AND** the user clicks on a file reference or spec link
- **THEN** the extension SHALL navigate to the appropriate file in the editor

#### Scenario: Collapsible Section State Persistence
- **WHEN** a user collapses or expands sections in the webview
- **THEN** the section states SHALL persist during the current webview session
- **AND** reopening the same change in a new webview session SHALL reset to default expanded state
