## Why
The current preview page structure has unnecessary nesting with Tasks and Files sections, requiring extra clicks to view content. Since we already have file access through the Files section, the Tasks section is redundant. Additionally, wrapping files in a separate section adds an extra navigation step when users want to see file contents.

## What Changes
- Remove the Tasks section from the preview page entirely
- Remove the Files section wrapper but promote individual files to top-level collapsible sections
- Render markdown files with proper markdown formatting (like the Proposal section) instead of plain text
- Maintain the Proposal section as-is
- Each file becomes its own collapsible section at the same level as Proposal

## Impact
- Affected specs: vscode-extension
- Affected code: 
  - src/providers/webviewProvider.ts (HTML generation and rendering logic)
  - media/script.js (file content loading and display)
  - media/styles.css (styling for flat file structure)
- Reduced navigation steps for users viewing file contents
- Improved user experience with markdown rendering for .md files
- Cleaner, flatter information architecture
