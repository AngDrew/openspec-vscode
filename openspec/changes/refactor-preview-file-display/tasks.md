## 1. Update WebviewProvider HTML Generation
- [ ] 1.1 Remove Tasks section from HTML template in getHtmlContent method
- [ ] 1.2 Remove Files section wrapper from HTML template
- [ ] 1.3 Refactor renderFilesList to return individual collapsible sections instead of wrapped list
- [ ] 1.4 Update file rendering to use markdown parser for .md files

## 2. Update JavaScript File Handling
- [ ] 2.1 Update file toggle handlers to work with new flat structure
- [ ] 2.2 Modify file content loading to detect file type (.md vs others)
- [ ] 2.3 Add markdown rendering for .md files in the content display

## 3. Update CSS Styling
- [ ] 3.1 Remove Tasks section specific styles
- [ ] 3.2 Remove nested Files section styles
- [ ] 3.3 Ensure file collapsible sections match Proposal section styling
- [ ] 3.4 Add markdown content styling for file sections

## 4. Testing and Validation
- [ ] 4.1 Test preview page displays without Tasks section
- [ ] 4.2 Test files appear as individual collapsible sections
- [ ] 4.3 Test markdown files render properly
- [ ] 4.4 Test non-markdown files display as code blocks
- [ ] 4.5 Test collapsible state for all sections works correctly
- [ ] 4.6 Test keyboard accessibility for file sections
