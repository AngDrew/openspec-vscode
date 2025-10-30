## REMOVED Requirements

### Requirement: Nested Task Collapsibility
**Reason**: Tasks section is being removed entirely from the preview page as it is redundant with the Files section.
**Migration**: Users should use the Files section to view task files directly. The tasks.md file will appear as a top-level collapsible section if it exists.

## MODIFIED Requirements

### Requirement: Detailed View Webview
The extension SHALL provide a rich webview for displaying detailed information about selected changes with a flat, accessible file structure.

#### Scenario: Rich Content Display
- **WHEN** a change is selected for detailed viewing
- **THEN** the webview SHALL display formatted content with:
  - A header showing the change name and status badge
  - The Proposal section rendered from `proposal.md` with markdown formatting in a collapsible section
  - Individual files from the change directory as separate collapsible sections at the same level as Proposal
- **AND** SHALL NOT display a separate Tasks section
- **AND** SHALL NOT wrap files in a nested Files section

#### Scenario: File Display and Rendering
- **WHEN** files are displayed in the preview page
- **THEN** each file SHALL appear as an individual collapsible section
- **AND** markdown files (.md) SHALL be rendered with proper markdown formatting
- **AND** non-markdown files SHALL be displayed as formatted code blocks
- **AND** all file sections SHALL be collapsed by default
- **AND** clicking a file section header SHALL expand it to show the rendered content

#### Scenario: Webview Navigation
- **WHEN** viewing a change in the webview
- **AND** the user clicks on a file reference or spec link
- **THEN** the extension SHALL navigate to the appropriate file in the editor

#### Scenario: Collapsible Section State Persistence
- **WHEN** a user collapses or expands sections in the webview
- **THEN** the section states SHALL persist during the current webview session
- **AND** reopening the same change in a new webview session SHALL reset to default state (Proposal expanded, files collapsed)

## MODIFIED Requirements

### Requirement: Collapsible Content Sections
The webview SHALL provide collapsible sections for major content areas with a flat hierarchy to reduce scrolling and improve navigation.

#### Scenario: Section Headers Are Collapsible
- **WHEN** a user views a change in the detailed webview
- **THEN** the Proposal section SHALL have a collapsible header
- **AND** each individual file SHALL have its own collapsible header
- **AND** clicking any header SHALL toggle that section between expanded and collapsed states
- **AND** an expand/collapse icon SHALL indicate the current state

#### Scenario: Default Section State
- **WHEN** a user opens a change for the first time in a webview session
- **THEN** the Proposal section SHALL be expanded by default
- **AND** all file sections SHALL be collapsed by default
- **AND** the expand/collapse icons SHALL accurately reflect the state

#### Scenario: Keyboard Accessibility
- **WHEN** a user navigates using keyboard only
- **THEN** all collapsible section headers SHALL be focusable
- **AND** pressing Enter or Space SHALL toggle the section
- **AND** the focused element SHALL have visible focus indicators
- **AND** arrow keys SHALL allow navigation between section headers

## ADDED Requirements

### Requirement: Markdown File Rendering
The webview SHALL render markdown files with proper formatting to improve readability.

#### Scenario: Markdown File Display
- **WHEN** a markdown file (.md extension) is displayed in the preview
- **THEN** the content SHALL be parsed and rendered as HTML with markdown formatting
- **AND** SHALL support headers, lists, code blocks, links, and other markdown syntax
- **AND** SHALL use the same markdown rendering as the Proposal section
- **AND** SHALL respect VS Code theme colors for rendered content

#### Scenario: Non-Markdown File Display
- **WHEN** a non-markdown file is displayed in the preview
- **THEN** the content SHALL be displayed in a formatted code block
- **AND** SHALL preserve original formatting and whitespace
- **AND** SHALL use monospace font appropriate for code

#### Scenario: File Type Detection
- **WHEN** loading a file for display
- **THEN** the system SHALL detect the file type based on file extension
- **AND** SHALL apply appropriate rendering (markdown vs code block)
- **AND** SHALL handle edge cases gracefully (no extension, unknown types default to code block)
