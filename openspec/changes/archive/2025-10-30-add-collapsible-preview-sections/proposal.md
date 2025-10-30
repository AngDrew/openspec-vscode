## Why

When users click on a change item in the OpenSpec Explorer, the preview webview displays all sections (Proposal, Tasks, Files) in full, making the page very scrolly and difficult to navigate, especially for changes with extensive content. Users need to scroll through large amounts of content to find specific information.

## What Changes

- Add collapsible sections for Proposal, Tasks, and Files in the webview
- Implement nested collapsible functionality for individual task items within the Tasks section
- Add expand/collapse icons and interactive controls to section headers
- Persist expand/collapse state during the webview session
- Ensure collapsible sections follow VS Code design patterns and are keyboard accessible

## Impact

- Affected specs: vscode-extension (MODIFIED)
- Affected code:
  - src/providers/webviewProvider.ts (add collapsible section generation)
  - media/styles.css (add collapsible section styling)
  - media/script.js (add expand/collapse interaction logic)
- User experience: Users will have better navigation and reduced scrolling in change preview webviews
